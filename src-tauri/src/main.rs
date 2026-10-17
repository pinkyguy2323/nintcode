//! NintCode backend: real FS tools, terminal, hardware, model downloads, SQLite.
//! No mocks: every command touches the real OS.

use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

// ---------- FS ----------

#[derive(Serialize)]
struct DirEntry {
    name: String,
    path: String,
    #[serde(rename = "isDir")]
    is_dir: bool,
}

#[tauri::command]
fn list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let rd = std::fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for e in rd.flatten() {
        let p = e.path();
        out.push(DirEntry {
            name: e.file_name().to_string_lossy().to_string(),
            path: p.to_string_lossy().to_string(),
            is_dir: p.is_dir(),
        });
    }
    Ok(out)
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = PathBuf::from(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

// ---------- Terminal (real processes) ----------

#[derive(Serialize)]
struct CmdResult {
    stdout: String,
    stderr: String,
    code: i32,
}

#[tauri::command]
async fn run_command(cwd: String, command: String) -> Result<CmdResult, String> {
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = tokio::process::Command::new("cmd");
        c.args(["/C", &command]);
        c
    };
    #[cfg(not(target_os = "windows"))]
    let mut cmd = {
        let mut c = tokio::process::Command::new("sh");
        c.args(["-lc", &command]);
        c
    };
    let out = cmd
        .current_dir(if cwd.is_empty() { "." } else { &cwd })
        .output()
        .await
        .map_err(|e| e.to_string())?;
    Ok(CmdResult {
        stdout: String::from_utf8_lossy(&out.stdout).to_string(),
        stderr: String::from_utf8_lossy(&out.stderr).to_string(),
        code: out.status.code().unwrap_or(-1),
    })
}

// ---------- Hardware ----------

#[derive(Serialize)]
struct Gpu {
    name: String,
    #[serde(rename = "vramGB")]
    vram_gb: u64,
    backend: String,
}

#[derive(Serialize)]
struct Hardware {
    os: String,
    cpu: String,
    #[serde(rename = "cpuCores")]
    cpu_cores: usize,
    #[serde(rename = "ramGB")]
    ram_gb: u64,
    gpus: Vec<Gpu>,
    cuda: bool,
    vulkan: bool,
}

#[tauri::command]
fn hardware_info(app: AppHandle) -> Result<Hardware, String> {
    let mut sys = sysinfo::System::new_all();
    sys.refresh_all();
    let ram_gb = sys.total_memory() / 1024 / 1024 / 1024;
    let cpu = sys
        .cpus()
        .first()
        .map(|c| c.brand().to_string())
        .unwrap_or_else(|| "Unknown CPU".into());
    let cores = sys.cpus().len();

    // GPU detection: try nvidia-smi on all platforms, wmic/dxdiag on Windows.
    let mut gpus: Vec<Gpu> = detect_gpus();
    if gpus.is_empty() {
        gpus.push(Gpu { name: "No discrete GPU detected".into(), vram_gb: 0, backend: "cpu".into() });
    }

    let data_dir = app.path().app_data_dir().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
    let _ = data_dir;
    Ok(Hardware {
        os: std::env::consts::OS.to_string(),
        cpu,
        cpu_cores: cores,
        ram_gb: ram_gb.max(1),
        gpus,
        cuda: check_cuda(),
        vulkan: check_vulkan(),
    })
}

fn detect_gpus() -> Vec<Gpu> {
    let mut out = Vec::new();
    // NVIDIA via nvidia-smi
    if let Ok(res) = std::process::Command::new("nvidia-smi")
        .args(["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"])
        .output()
    {
        if res.status.success() {
            for line in String::from_utf8_lossy(&res.stdout).lines() {
                let parts: Vec<&str> = line.split(',').collect();
                if parts.len() >= 2 {
                    let vram_mb: u64 = parts[1].trim().parse().unwrap_or(0);
                    out.push(Gpu {
                        name: parts[0].trim().to_string(),
                        vram_gb: vram_mb / 1024,
                        backend: "cuda".into(),
                    });
                }
            }
        }
    }
    #[cfg(target_os = "windows")]
    if out.is_empty() {
        // Fallback: wmic GPU names
        if let Ok(res) = std::process::Command::new("wmic")
            .args(["path", "win32_VideoController", "get", "name"])
            .output()
        {
            for line in String::from_utf8_lossy(&res.stdout).lines().skip(1) {
                let n = line.trim();
                if !n.is_empty() {
                    out.push(Gpu { name: n.to_string(), vram_gb: 0, backend: "vulkan-or-directx".into() });
                }
            }
        }
    }
    out
}

fn check_cuda() -> bool {
    std::process::Command::new("nvidia-smi").output().map(|o| o.status.success()).unwrap_or(false)
        || std::path::Path::new("C:\\Windows\\System32\\nvcuda.dll").exists()
}

fn check_vulkan() -> bool {
    std::path::Path::new("C:\\Windows\\System32\\vulkan-1.dll").exists()
        || std::process::Command::new("vulkaninfo").output().map(|o| o.status.success()).unwrap_or(false)
}

// ---------- Model downloads (real, resumable) ----------

#[tauri::command]
async fn download_model(app: AppHandle, url: String, file_name: String, models_dir: Option<String>) -> Result<String, String> {
    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;

    let dir: PathBuf = match models_dir {
        Some(d) if !d.is_empty() => PathBuf::from(d),
        _ => app.path().app_data_dir().map_err(|e| e.to_string())?.join("models"),
    };
    tokio::fs::create_dir_all(&dir).await.map_err(|e| e.to_string())?;
    let dest = dir.join(&file_name);
    let tmp = dir.join(format!("{file_name}.part"));

    // Resume offset
    let mut start: u64 = 0;
    if tmp.exists() {
        start = tmp.metadata().map_err(|e| e.to_string())?.len();
    }

    let client = reqwest::Client::new();
    let req = if start > 0 {
        client.get(&url).header("Range", format!("bytes={start}-")).send().await
    } else {
        client.get(&url).send().await
    }
    .map_err(|e| e.to_string())?;
    if !req.status().is_success() && req.status().as_u16() != 206 {
        return Err(format!("HTTP {}", req.status()));
    }
    let total = req.content_length().unwrap_or(0) + start;
    let mut stream = req.bytes_stream();
    let mut file = tokio::fs::OpenOptions::new().create(true).append(true).open(&tmp).await.map_err(|e| e.to_string())?;
    let mut done = start;
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| e.to_string())?;
        file.write_all(&bytes).await.map_err(|e| e.to_string())?;
        done += bytes.len() as u64;
        if total > 0 {
            let pct = (done as f64 / total as f64 * 100.0) as u32;
            let _ = app.emit("model-progress", pct.min(100));
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);
    tokio::fs::rename(&tmp, &dest).await.map_err(|e| e.to_string())?;

    // Real integrity check: every GGUF file starts with the "GGUF" magic.
    if file_name.to_lowercase().ends_with(".gguf") {
        use tokio::io::AsyncReadExt;
        let mut f = tokio::fs::File::open(&dest).await.map_err(|e| e.to_string())?;
        let mut magic = [0u8; 4];
        f.read_exact(&mut magic).await.map_err(|e| e.to_string())?;
        if &magic != b"GGUF" {
            let _ = tokio::fs::remove_file(&dest).await;
            return Err("integrity check failed: file is not a valid GGUF (magic bytes mismatch); deleted".into());
        }
    }
    Ok(dest.to_string_lossy().to_string())
}

// Launch llama-server sidecar if present next to the binary, else report how to start it.
// threads: 0 = let llama.cpp decide (all cores). priority: "idle" | "below" | "normal".
#[tauri::command]
async fn launch_model(app: AppHandle, path: String, gpu_layers: u32, threads: u32, priority: String, ctx: u32) -> Result<String, String> {
    let ctx_size = if ctx == 0 { 8192 } else { ctx };

    // If a server is already healthy on :8080, don't spawn a duplicate.
    if reqwest::get("http://127.0.0.1:8080/health").await.map(|r| r.status().is_success()).unwrap_or(false) {
        return Ok("llama-server is already running on :8080".into());
    }

    // Find the runtime: portable (next to app / PATH / user) or managed (auto-installed).
    let exe = match find_llama_server(&app) {
        Some(e) => e,
        None => {
            let _ = app.emit("runtime-progress", RuntimeProgress { stage: "resolve".into(), pct: 0, label: "Setting up llama.cpp runtime (one-time)…".into() });
            let p = install_llama_runtime(app.clone(), None).await?;
            PathBuf::from(p)
        }
    };

    let mut cmd = tokio::process::Command::new(&exe);
    cmd.current_dir(exe.parent().unwrap_or(std::path::Path::new(".")));
    cmd.args([
        "-m", &path,
        "--host", "127.0.0.1",
        "--port", "8080",
        "-c", &ctx_size.to_string(),
        "-ngl", &gpu_layers.to_string(),
    ]);
    if threads > 0 {
        cmd.args(["-t", &threads.to_string()]);
    }
    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        const IDLE_PRIORITY_CLASS: u32 = 0x0000_0040;
        const BELOW_NORMAL_PRIORITY_CLASS: u32 = 0x0000_4000;
        let mut flags = CREATE_NO_WINDOW;
        match priority.as_str() {
            "idle" => flags |= IDLE_PRIORITY_CLASS,
            "below" => flags |= BELOW_NORMAL_PRIORITY_CLASS,
            _ => {}
        }
        cmd.creation_flags(flags);
    }
    match cmd.spawn() {
        Ok(child) => {
            // Wait for the server to become healthy (big models can load slowly).
            for _ in 0..240 {
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                if reqwest::get("http://127.0.0.1:8080/health").await.map(|r| r.status().is_success()).unwrap_or(false) {
                    std::mem::forget(child); // keep running as sidecar
                    return Ok(format!(
                        "llama-server started on :8080 (ctx {ctx_size}, threads {}, priority {priority})",
                        if threads == 0 { "auto".to_string() } else { threads.to_string() }
                    ));
                }
            }
            std::mem::forget(child);
            Ok("llama-server is still loading the model… it will answer on http://127.0.0.1:8080 when ready".into())
        }
        Err(e) => Err(format!("failed to start llama-server ({}): {e}", exe.display())),
    }
}

// ---------- llama.cpp runtime manager (auto-install, no manual setup) ----------

#[derive(Serialize, Clone)]
struct RuntimeProgress {
    stage: String,
    pct: u32,
    label: String,
}

#[derive(Serialize)]
struct RuntimeStatus {
    installed: bool,
    path: Option<String>,
    backend: Option<String>,
    portable: bool,
}

const LLAMA_FALLBACK_TAG: &str = "b11669";
const GH_API: &str = "https://api.github.com/repos/ggml-org/llama.cpp/releases";

fn gh_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("NintCode-runtime-installer")
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| e.to_string())
}

fn runtime_root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("runtime");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn is_server_name(name: &str) -> bool {
    name.eq_ignore_ascii_case("llama-server.exe") || name.eq_ignore_ascii_case("llama-server")
}

fn find_server_in(dir: &std::path::Path, depth: u8) -> Option<PathBuf> {
    if depth == 0 { return None; }
    let rd = std::fs::read_dir(dir).ok()?;
    let mut subdirs = Vec::new();
    for e in rd.flatten() {
        let p = e.path();
        if p.is_file() {
            if p.file_name().map(|n| is_server_name(&n.to_string_lossy())).unwrap_or(false) {
                return Some(p);
            }
        } else if p.is_dir() {
            subdirs.push(p);
        }
    }
    for d in subdirs {
        if let Some(f) = find_server_in(&d, depth - 1) { return Some(f); }
    }
    None
}

fn find_llama_server(app: &AppHandle) -> Option<PathBuf> {
    // 1) Portable: next to the NintCode executable (user-provided).
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            if let Some(f) = find_server_in(dir, 2) { return Some(f); }
        }
    }
    // 2) System-wide in PATH.
    let probe = if cfg!(target_os = "windows") { "where" } else { "which" };
    if let Ok(out) = std::process::Command::new(probe).arg("llama-server").output() {
        if out.status.success() {
            let p = String::from_utf8_lossy(&out.stdout).lines().next().unwrap_or("").trim().to_string();
            if !p.is_empty() { return Some(PathBuf::from(p)); }
        }
    }
    // 3) Managed: auto-installed under app data.
    if let Ok(root) = runtime_root(app) {
        if let Ok(rd) = std::fs::read_dir(&root) {
            for e in rd.flatten() {
                let p = e.path();
                if p.is_dir() {
                    if let Some(f) = find_server_in(&p, 3) { return Some(f); }
                }
            }
        }
    }
    None
}

fn managed_backend(app: &AppHandle) -> Option<String> {
    let root = runtime_root(app).ok()?;
    let rd = std::fs::read_dir(&root).ok()?;
    for e in rd.flatten() {
        let p = e.path();
        if p.is_dir() && find_server_in(&p, 3).is_some() {
            return Some(p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default());
        }
    }
    None
}

fn pick_backend() -> String {
    if check_cuda() { "cuda".into() } else if check_vulkan() { "vulkan".into() } else { "cpu".into() }
}

/// Resolve the current nightly build tag from the stable release's nightly-tag.txt asset.
async fn resolve_llama_tag(client: &reqwest::Client) -> String {
    if let Ok(r) = client.get(format!("{GH_API}/latest")).send().await {
        if let Ok(v) = r.json::<serde_json::Value>().await {
            if let Some(assets) = v.get("assets").and_then(|a| a.as_array()) {
                for a in assets {
                    if a.get("name").and_then(|n| n.as_str()) == Some("nightly-tag.txt") {
                        if let Some(url) = a.get("browser_download_url").and_then(|u| u.as_str()) {
                            if let Ok(t) = client.get(url).send().await {
                                if let Ok(txt) = t.text().await {
                                    let tag = txt.trim().to_string();
                                    if !tag.is_empty() { return tag; }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    LLAMA_FALLBACK_TAG.to_string()
}

/// Find download URLs for the requested backend from the release assets.
async fn llama_download_urls(client: &reqwest::Client, tag: &str, backend: &str) -> Result<(Vec<String>, String), String> {
    // Try the API first (exact asset URLs).
    if let Ok(r) = client.get(format!("{GH_API}/tags/{tag}")).send().await {
        if r.status().is_success() {
            if let Ok(v) = r.json::<serde_json::Value>().await {
                let mut main = String::new();
                let mut cudart = String::new();
                if let Some(assets) = v.get("assets").and_then(|a| a.as_array()) {
                    for a in assets {
                        let name = a.get("name").and_then(|n| n.as_str()).unwrap_or("");
                        let url = a.get("browser_download_url").and_then(|u| u.as_str()).unwrap_or("").to_string();
                        let lname = name.to_lowercase();
                        match backend {
                            "cuda" => {
                                if lname.contains("bin-win-cuda-12.4-x64.zip") { main = url; }
                                else if lname.starts_with("cudart-llama-bin-win-cuda-12.4-x64") { cudart = url; }
                            }
                            "vulkan" => { if lname.contains("bin-win-vulkan-x64.zip") { main = url; } }
                            _ => { if lname.contains("bin-win-cpu-x64.zip") { main = url; } }
                        }
                    }
                }
                if !main.is_empty() {
                    let mut urls = vec![main];
                    if !cudart.is_empty() { urls.push(cudart); }
                    return Ok((urls, tag.to_string()));
                }
            }
        }
    }
    // Fallback: construct the direct release download URLs from the tag.
    let base = format!("https://github.com/ggml-org/llama.cpp/releases/download/{tag}");
    let (file, cudart_file) = match backend {
        "cuda" => (format!("llama-{tag}-bin-win-cuda-12.4-x64.zip"), Some("cudart-llama-bin-win-cuda-12.4-x64.zip".to_string())),
        "vulkan" => (format!("llama-{tag}-bin-win-vulkan-x64.zip"), None),
        _ => (format!("llama-{tag}-bin-win-cpu-x64.zip"), None),
    };
    let mut urls = vec![format!("{base}/{file}")];
    if let Some(c) = cudart_file { urls.push(format!("{base}/{c}")); }
    Ok((urls, tag.to_string()))
}

async fn download_file(client: &reqwest::Client, app: &AppHandle, url: &str, dest: &std::path::Path, label: &str) -> Result<(), String> {
    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;
    let req = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !req.status().is_success() { return Err(format!("HTTP {} for {url}", req.status())); }
    let total = req.content_length().unwrap_or(0);
    let tmp = dest.with_extension("part");
    let mut file = tokio::fs::File::create(&tmp).await.map_err(|e| e.to_string())?;
    let mut stream = req.bytes_stream();
    let mut done: u64 = 0;
    let mut last_pct = 101;
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| e.to_string())?;
        file.write_all(&bytes).await.map_err(|e| e.to_string())?;
        done += bytes.len() as u64;
        if total > 0 {
            let pct = (done as f64 / total as f64 * 100.0) as u32;
            if pct != last_pct {
                last_pct = pct;
                let _ = app.emit("runtime-progress", RuntimeProgress { stage: "download".into(), pct, label: label.to_string() });
            }
        }
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);
    tokio::fs::rename(&tmp, dest).await.map_err(|e| e.to_string())?;
    Ok(())
}

fn extract_zip(zip_path: &std::path::Path, dest: &std::path::Path) -> Result<(), String> {
    let f = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(f).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let Some(rel) = entry.enclosed_name() else { continue };
        let out = dest.join(rel);
        if entry.is_dir() {
            std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out.parent() { std::fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
            let mut w = std::fs::File::create(&out).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut w).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// One-click install of llama.cpp runtime. backend: "auto" | "cuda" | "vulkan" | "cpu".
/// Returns the path to llama-server.
#[tauri::command]
async fn install_llama_runtime(app: AppHandle, backend: Option<String>) -> Result<String, String> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (&app, &backend);
        return Err("Automatic runtime install is currently Windows-only. Install llama.cpp via your package manager or build from source.".into());
    }
    #[cfg(target_os = "windows")]
    {
        let backend = match backend.as_deref() {
            Some("cuda") | Some("vulkan") | Some("cpu") => backend.unwrap().to_lowercase(),
            _ => pick_backend(),
        };
        let client = gh_client()?;
        let _ = app.emit("runtime-progress", RuntimeProgress { stage: "resolve".into(), pct: 0, label: "Checking latest llama.cpp build…".into() });
        let tag = resolve_llama_tag(&client).await;
        let (urls, tag) = llama_download_urls(&client, &tag, &backend).await?;

        let root = runtime_root(&app)?;
        let dir = root.join(&backend);
        if dir.exists() {
            let _ = std::fs::remove_dir_all(&dir);
        }
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

        // Download main build (+ cudart for CUDA).
        let main_zip = dir.join("llama-runtime.zip");
        let size_hint = if backend == "cuda" { "~600 MB" } else if backend == "vulkan" { "~35 MB" } else { "~20 MB" };
        download_file(&client, &app, &urls[0], &main_zip, &format!("Downloading llama.cpp ({backend}, {size_hint})")).await?;

        let _ = app.emit("runtime-progress", RuntimeProgress { stage: "extract".into(), pct: 50, label: "Unpacking llama.cpp…".into() });
        extract_zip(&main_zip, &dir)?;
        let _ = std::fs::remove_file(&main_zip);

        if backend == "cuda" && urls.len() > 1 {
            let cudart_zip = dir.join("cudart.zip");
            download_file(&client, &app, &urls[1], &cudart_zip, "Downloading CUDA libraries (~380 MB)").await?;
            let server = find_server_in(&dir, 3).ok_or_else(|| "llama-server.exe missing after extraction".to_string())?;
            let target = server.parent().unwrap_or(&dir).to_path_buf();
            extract_zip(&cudart_zip, &target)?;
            let _ = std::fs::remove_file(&cudart_zip);
        }

        // Marker with the build tag.
        let _ = std::fs::write(dir.join("nintcode-build.txt"), &tag);

        let server = find_server_in(&dir, 3).ok_or_else(|| "llama-server.exe not found in the downloaded archive".to_string())?;
        let _ = app.emit("runtime-progress", RuntimeProgress { stage: "done".into(), pct: 100, label: format!("llama.cpp {tag} ({backend}) ready") });
        Ok(server.to_string_lossy().to_string())
    }
}

#[tauri::command]
fn llama_runtime_status(app: AppHandle) -> Result<RuntimeStatus, String> {
    if let Some(p) = find_llama_server(&app) {
        let portable = runtime_root(&app).map(|r| !p.starts_with(&r)).unwrap_or(true);
        let backend = managed_backend(&app);
        return Ok(RuntimeStatus {
            installed: true,
            path: Some(p.to_string_lossy().to_string()),
            backend,
            portable,
        });
    }
    Ok(RuntimeStatus { installed: false, path: None, backend: None, portable: false })
}

#[allow(dead_code)]
fn db(app: &AppHandle) -> Result<rusqlite::Connection, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let conn = rusqlite::Connection::open(dir.join("nintcode.db")).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, project TEXT, messages TEXT, updated INTEGER);
         CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY, v TEXT);",
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            list_dir,
            read_file,
            write_file,
            run_command,
            hardware_info,
            download_model,
            launch_model,
            install_llama_runtime,
            llama_runtime_status
        ])
        .run(tauri::generate_context!())
        .expect("failed to run NintCode");
}

fn main() {
    run();
}
