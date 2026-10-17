import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, File as FileIcon, Folder, FolderOpen, FolderPlus, GitBranch, Search, RefreshCw, Clock, FileCode2, FolderTree } from 'lucide-react';
import { useStore } from '../store';
import { listDir } from '../lib/tauri';
import { openFolderDialog, runCommand } from '../lib/tauri';

interface Node { name: string; path: string; isDir: boolean; children?: Node[] }

function join(a: string, b: string): string {
  if (!b) return a;
  if (/^[a-zA-Z]:[\\/]/.test(b) || b.startsWith('/')) return b;
  return (a.replace(/[/\\]$/, '') + '/' + b.replace(/^[/\\]/, '')).replace(/\//g, '\\');
}

function fileColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: '#38bdf8', tsx: '#38bdf8', js: '#facc15', jsx: '#facc15', json: '#fb923c',
    md: '#a78bfa', rs: '#f97316', py: '#4ade80', css: '#f472b6', html: '#f87171',
    toml: '#94a3b8', yml: '#94a3b8', yaml: '#94a3b8', gguf: '#38e1ff',
  };
  return map[ext] ?? '#6b7590';
}

export default function Sidebar() {
  const { projectPath, setProjectPath, pushRecent, recent, openTab, leftTab } = useStore();
  const [tree, setTree] = useState<Node[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<string[]>([]);
  const [gitRaw, setGitRaw] = useState('');
  const [gitLoading, setGitLoading] = useState(false);

  const load = async (base: string) => {
    try {
      const entries = await listDir(base);
      const nodes: Node[] = await Promise.all(entries.slice(0, 300).map(async (e) => {
        let children: Node[] | undefined;
        if (e.isDir && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'target' && e.name !== 'dist') {
          try {
            const sub = await listDir(e.path);
            children = sub.slice(0, 150).map((s) => ({ ...s }));
          } catch { children = []; }
        }
        return { ...e, children };
      }));
      nodes.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
      setTree(nodes);
    } catch { setTree([]); }
  };

  useEffect(() => { if (projectPath) { void load(projectPath); void refreshGit(); } }, [projectPath]);

  const refreshGit = async () => {
    if (!projectPath) return;
    setGitLoading(true);
    try {
      const r = await runCommand(projectPath, 'git status --short --branch');
      setGitRaw(r.stdout || r.stderr || '');
    } catch { setGitRaw('git not available'); }
    setGitLoading(false);
  };

  const doSearch = async () => {
    if (!projectPath || !query.trim()) { setResults([]); return; }
    try {
      const r = await runCommand(projectPath, `git grep -l -n ${JSON.stringify(query)} 2>nul || findstr /s /m /c:${JSON.stringify(query)} * 2>nul`);
      setResults(r.stdout.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 80));
    } catch { setResults([]); }
  };

  const pick = async () => {
    const sel = await openFolderDialog();
    if (sel) { setProjectPath(sel); pushRecent(sel); }
  };

  const openResult = (r: string) => {
    const m = r.match(/^([^:\n]+\.\w+)(?::\d+)?/);
    const p = m ? m[1].trim() : r.trim();
    if (!p) return;
    openTab(projectPath ? join(projectPath, p) : p);
  };

  const gitLines = gitRaw.split('\n').filter((l) => l.trim());
  const branchLine = gitLines.find((l) => l.startsWith('##'));
  const branch = branchLine ? branchLine.replace('## ', '').split('...')[0] : null;
  const changes = gitLines.filter((l) => /^([ MADRCU?!]{2})\s/.test(l)).map((l) => ({ code: l.slice(0, 2), file: l.slice(3) }));

  const statusColor = (c: string) => {
    if (c.includes('D')) return '#f87171';
    if (c.includes('A') || c.includes('?')) return '#4ade80';
    if (c.includes('M') || c.includes('R')) return '#fbbf24';
    return '#8b93a7';
  };

  return (
    <div className="flex h-full flex-col">
      {/* header */}
      <div className="flex items-center gap-1.5 px-3 pb-2 pt-3">
        <FolderTree size={13} className="text-nint-blue" />
        <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
          {leftTab === 'explorer' ? 'Explorer' : leftTab === 'search' ? 'Search' : 'Source control'}
        </span>
        <div className="flex-1" />
        {leftTab === 'explorer' && <button className="btn-icon !h-6 !w-6" title="Open folder" onClick={pick}><FolderPlus size={13} /></button>}
        {leftTab === 'git' && <button className="btn-icon !h-6 !w-6" title="Refresh" onClick={refreshGit}><RefreshCw size={13} className={gitLoading ? 'animate-spin' : ''} /></button>}
      </div>

      {leftTab === 'explorer' && (
        <div className="flex-1 overflow-auto px-1.5 pb-2">
          {!projectPath && (
            <div className="mx-2 mt-2 rounded-xl border border-dashed p-4 text-center" style={{ borderColor: 'var(--border2)' }}>
              <p className="text-xs text-slate-500">No folder open</p>
              <button className="btn-primary mx-auto mt-2.5 text-xs" onClick={pick}>Open folder</button>
            </div>
          )}
          {tree.map((n) => <Row key={n.path} n={n} depth={0} onOpen={openTab} />)}
          {recent.length > 0 && (
            <div className="mt-4">
              <p className="flex items-center gap-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-slate-600"><Clock size={10} />Recent</p>
              <div className="mt-1 space-y-0.5">
                {recent.map((r) => (
                  <button key={r} onClick={() => { setProjectPath(r); pushRecent(r); }}
                    className="flex w-full items-center gap-2 truncate rounded-lg px-2 py-1 text-left text-xs text-slate-500 transition-colors hover:bg-white/[0.05] hover:text-slate-200">
                    <Folder size={12} className="shrink-0 text-nint-blue/60" />
                    <span className="truncate">{r.split(/[/\\]/).filter(Boolean).pop()}</span>
                    <span className="ml-auto truncate text-[10px] text-slate-700" style={{ maxWidth: 90 }}>{r}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {leftTab === 'search' && (
        <div className="flex min-h-0 flex-1 flex-col px-2.5 pb-2">
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600" />
              <input className="input !pl-8" placeholder="Search in project…" value={query}
                onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void doSearch()} />
            </div>
          </div>
          <p className="mt-1.5 px-1 text-[10px] text-slate-600">{results.length ? `${results.length} matches` : 'Enter — search (git grep / findstr)'}</p>
          <div className="mt-1 min-h-0 flex-1 space-y-0.5 overflow-auto">
            {results.map((r, i) => (
              <button key={i} onClick={() => openResult(r)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-white/[0.06]">
                <FileCode2 size={11} className="shrink-0 text-slate-600" />
                <span className="code-font truncate text-[11px] text-slate-400">{r}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {leftTab === 'git' && (
        <div className="flex min-h-0 flex-1 flex-col px-2.5 pb-2">
          {branch && (
            <div className="mb-2 flex items-center gap-2 rounded-xl border p-2.5" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,.02)' }}>
              <GitBranch size={14} className="text-nint-violet" />
              <span className="truncate text-xs font-semibold">{branch}</span>
              <span className="chip ml-auto">{changes.length} changes</span>
            </div>
          )}
          <div className="min-h-0 flex-1 space-y-0.5 overflow-auto">
            {changes.map((c, i) => (
              <button key={i} onClick={() => openTab(projectPath ? join(projectPath, c.file.trim()) : c.file.trim())}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs transition-colors hover:bg-white/[0.06]">
                <span className="code-font w-5 shrink-0 text-center font-bold" style={{ color: statusColor(c.code) }}>{c.code.trim() || '?'}</span>
                <span className="code-font truncate text-[11.5px] text-slate-400">{c.file}</span>
              </button>
            ))}
            {changes.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-slate-600">{gitRaw ? 'Clean — no changes' : 'Not a git repository (or git not installed)'}</p>
            )}
          </div>
          {changes.length === 0 && gitRaw && <pre className="code-font max-h-24 overflow-auto whitespace-pre-wrap rounded-lg p-2 text-[10px] text-slate-600" style={{ background: 'rgba(0,0,0,.3)' }}>{gitRaw.slice(0, 600)}</pre>}
        </div>
      )}
    </div>
  );
}

function Row({ n, depth, onOpen }: { n: Node; depth: number; onOpen: (p: string) => void }) {
  const [open, setOpen] = useState(false);
  if (n.isDir) {
    return (
      <div>
        <button onClick={() => setOpen(!open)}
          className="group flex w-full items-center gap-1.5 rounded-lg px-2 py-[5px] text-left text-[12.5px] text-slate-400 transition-colors hover:bg-white/[0.05] hover:text-slate-200"
          style={{ paddingLeft: 6 + depth * 13 }}>
          <ChevronRight size={11} className={`shrink-0 text-slate-600 transition-transform ${open ? 'rotate-90' : ''}`} />
          {open ? <FolderOpen size={13.5} className="shrink-0 text-nint-blue" /> : <Folder size={13.5} className="shrink-0 text-nint-blue/70" />}
          <span className="truncate">{n.name}</span>
        </button>
        {open && n.children?.map((c) => c.isDir
          ? <Row key={c.path} n={c} depth={depth + 1} onOpen={onOpen} />
          : <FileRow key={c.path} c={c} depth={depth + 1} onOpen={onOpen} />)}
        {open && n.children && n.children.length === 0 && (
          <p className="py-0.5 text-[11px] italic text-slate-700" style={{ paddingLeft: 22 + depth * 13 }}>empty</p>
        )}
      </div>
    );
  }
  return <FileRow c={n} depth={depth} onOpen={onOpen} />;
}

function FileRow({ c, depth, onOpen }: { c: Node; depth: number; onOpen: (p: string) => void }) {
  return (
    <button onClick={() => onOpen(c.path)}
      className="flex w-full items-center gap-1.5 rounded-lg px-2 py-[5px] text-left text-[12.5px] text-slate-400 transition-colors hover:bg-white/[0.05] hover:text-slate-200"
      style={{ paddingLeft: 6 + depth * 13 }}>
      <FileIcon size={13} className="shrink-0 opacity-80" style={{ color: fileColor(c.name) }} />
      <span className="truncate">{c.name}</span>
    </button>
  );
}
