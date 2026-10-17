import type { HardwareInfo, Provider, RuntimeProgress, RuntimeStatus } from '../types';

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function isWin(): boolean {
  if (typeof navigator === 'undefined') return true;
  return /Windows/i.test(navigator.userAgent);
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new Error('not-tauri');
  const mod = await import('@tauri-apps/api/core');
  return mod.invoke(cmd, args) as Promise<T>;
}

// ---------- FS with Tauri fallback to File System Access / memory ----------
export async function listDir(path: string) {
  try {
    return await invoke<{ name: string; path: string; isDir: boolean }[]>('list_dir', { path });
  } catch {
    return [];
  }
}

export async function readTextFile(path: string): Promise<string> {
  if (isTauri()) return invoke<string>('read_file', { path });
  return localStorage.getItem('nintcode:file:' + path) ?? '';
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  try {
    await invoke('write_file', { path, content });
  } catch {
    localStorage.setItem('nintcode:file:' + path, content);
  }
}

export async function runCommand(cwd: string, command: string): Promise<{ stdout: string; stderr: string; code: number }> {
  const res = await invoke<{ stdout: string; stderr: string; code: number }>('run_command', { cwd, command });
  return res;
}

export async function getHardware(): Promise<HardwareInfo> {
  try {
    return await invoke<HardwareInfo>('hardware_info');
  } catch {
    const ram = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8;
    return {
      os: navigator.platform + ' (web preview)',
      cpu: 'Unknown CPU (web preview)',
      cpuCores: navigator.hardwareConcurrency ?? 4,
      ramGB: ram,
      gpus: [{ name: 'Web preview — GPU detection via Tauri on desktop', vramGB: 0, backend: 'none' }],
      cuda: false, vulkan: false,
    };
  }
}

export async function openFolderDialog(): Promise<string | null> {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const sel = await open({ directory: true, multiple: false });
    return typeof sel === 'string' ? sel : null;
  } catch {
    return null;
  }
}

// ---------- llama.cpp runtime (auto-install, no manual setup) ----------
export async function llamaRuntimeStatus(): Promise<RuntimeStatus> {
  return invoke<RuntimeStatus>('llama_runtime_status');
}

export async function installLlamaRuntime(backend?: 'auto' | 'cuda' | 'vulkan' | 'cpu'): Promise<string> {
  return invoke<string>('install_llama_runtime', { backend: backend ?? null });
}

export async function onRuntimeProgress(cb: (p: RuntimeProgress) => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import('@tauri-apps/api/event');
  const un = await listen<RuntimeProgress>('runtime-progress', (e) => cb(e.payload));
  return un;
}

// ---------- Inference (OpenAI-compatible) ----------
// Works with: llama.cpp server, Ollama, LM Studio, any custom provider.
export interface ChatCompletionOpts {
  baseUrl: string;
  apiKey?: string;
  model: string;
  messages: { role: string; content: string }[];
  signal?: AbortSignal;
  onToken?: (t: string) => void;
  // Eco mode: pause between stream chunks. This back-pressures the local
  // server (HTTP socket fills up), which genuinely slows generation and
  // reduces GPU/CPU load instead of only slowing the UI.
  throttleMs?: number;
}

// Turn an HTTP error response into a clear Error: parses provider JSON bodies
// ({"error":{"code","message"}}) so the chat/API tab can show the real cause.
async function httpError(res: Response): Promise<Error> {
  const txt = await res.text().catch(() => '');
  let detail = txt.replace(/\s+/g, ' ').trim().slice(0, 400);
  try {
    const j = JSON.parse(txt) as { error?: { code?: string; message?: string; type?: string }; message?: string };
    const e = (j.error ?? j) as { code?: string; message?: string };
    const code = e.code ? `[${e.code}] ` : '';
    if (e.message) detail = code + String(e.message);
  } catch { /* keep raw text */ }
  return new Error(`HTTP ${res.status}${detail ? ' — ' + detail : ''}`);
}

export async function streamChatCompletion(opts: ChatCompletionOpts): Promise<string> {
  const url = opts.baseUrl.replace(/\/$/, '') + '/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.apiKey ? { Authorization: 'Bearer ' + opts.apiKey } : {}),
    },
    body: JSON.stringify({ model: opts.model, messages: opts.messages, stream: true }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    throw await httpError(res);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const l = line.trim();
      if (!l.startsWith('data:')) continue;
      const data = l.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const j = JSON.parse(data);
        const delta: string = j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.message?.content ?? '';
        if (delta) { full += delta; opts.onToken?.(delta); }
      } catch { /* keep-alive */ }
    }
    if (opts.throttleMs && opts.throttleMs > 0) {
      await new Promise((r) => setTimeout(r, opts.throttleMs));
    }
    if (opts.signal?.aborted) break;
  }
  return full;
}

export async function testProvider(p: Provider): Promise<string> {
  const url = p.baseUrl.replace(/\/$/, '') + '/models';
  const res = await fetch(url, { headers: p.apiKey ? { Authorization: 'Bearer ' + p.apiKey } : {} });
  if (!res.ok) throw await httpError(res);
  const j = await res.json().catch(() => ({}));
  const n = Array.isArray((j as { data?: unknown[] }).data) ? (j as { data: unknown[] }).data.length : 0;
  return 'OK — models: ' + n;
}

export async function fetchProviderModels(p: Provider): Promise<string[]> {
  const url = p.baseUrl.replace(/\/$/, '') + '/models';
  const res = await fetch(url, { headers: p.apiKey ? { Authorization: 'Bearer ' + p.apiKey } : {} });
  if (!res.ok) throw await httpError(res);
  const j = await res.json() as { data?: { id: string }[] };
  return (j.data ?? []).map((m) => m.id);
}
