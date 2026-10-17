import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import { X, Eye, FileCode2 } from 'lucide-react';
import { useStore } from '../store';
import { readTextFile, writeTextFile, isTauri, openFolderDialog } from '../lib/tauri';
import EmptyEditor from './EmptyEditor';

function iconColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: '#38bdf8', tsx: '#38bdf8', js: '#facc15', jsx: '#facc15',
    json: '#fb923c', md: '#a78bfa', rs: '#f97316', py: '#4ade80',
    css: '#f472b6', html: '#f87171', sql: '#34d399', toml: '#94a3b8', yml: '#94a3b8', yaml: '#94a3b8',
  };
  return map[ext] ?? '#8b93a7';
}

export default function CodeEditor() {
  const { tabs, activeTab, setActiveTab, closeTab, settings, setProjectPath, pushRecent } = useStore();
  const [contents, setContents] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);
  const active = tabs.find((t) => t.path === activeTab);

  useEffect(() => {
    if (activeTab && !(activeTab in contents)) {
      readTextFile(activeTab)
        .then((c) => setContents((p) => (activeTab in p ? p : { ...p, [activeTab]: c })))
        .catch(() => setContents((p) => (activeTab in p ? p : { ...p, [activeTab]: '' })));
    }
  }, [activeTab]);

  const save = async (path: string) => {
    const c = contents[path] ?? '';
    if (isTauri()) await writeTextFile(path, c);
    else localStorage.setItem('nintcode:file:' + path, c);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && activeTab) {
        e.preventDefault();
        void save(activeTab);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, contents]);

  const openFolder = async () => {
    const sel = await openFolderDialog();
    if (sel) { setProjectPath(sel); pushRecent(sel); }
  };

  if (!active) return <EmptyEditor onOpen={openFolder} />;

  const text = contents[active.path] ?? '';
  const isMd = active.path.endsWith('.md');

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 overflow-x-auto px-2 pt-1.5" style={{ borderBottom: '1px solid var(--border)' }}>
        {tabs.map((tb) => {
          const on = tb.path === activeTab;
          const name = tb.path.split(/[/\\]/).pop() ?? tb.path;
          return (
            <div key={tb.path} onClick={() => setActiveTab(tb.path)}
              className={`group flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-t-lg px-3 py-1.5 text-xs transition-all ${on ? 'bg-white/[0.06] text-white' : 'text-slate-500 hover:bg-white/[0.03] hover:text-slate-300'}`}
              style={on ? { boxShadow: 'inset 0 2px 0 0 #7c5cff' } : undefined}>
              <FileCode2 size={12} style={{ color: iconColor(name) }} />
              <span className="max-w-[170px] truncate">{name}</span>
              <button onClick={(e) => { e.stopPropagation(); closeTab(tb.path); }} className="rounded p-0.5 opacity-0 transition-opacity hover:bg-white/15 group-hover:opacity-100"><X size={11} /></button>
            </div>
          );
        })}
        <div className="flex-1" />
        {isMd && <button className="btn-ghost !py-1 text-xs" onClick={() => setPreview(!preview)}><Eye size={13} />{preview ? 'Code' : 'Preview'}</button>}
      </div>
      <div className="min-h-0 flex-1">
        {preview && isMd ? (
          <div className="h-full selectable overflow-auto p-6 text-sm leading-relaxed">
            <pre className="whitespace-pre-wrap font-sans">{text}</pre>
          </div>
        ) : (
          <Editor
            height="100%"
            path={active.path}
            language={active.language}
            value={text}
            theme={settings.theme === 'light' ? 'light' : 'vs-dark'}
            onChange={(v) => {
              const nv = v ?? '';
              setContents((p) => ({ ...p, [active.path]: nv }));
              if (settings.autoSave) {
                window.clearTimeout((window as unknown as { __ncSave?: number }).__ncSave);
                (window as unknown as { __ncSave?: number }).__ncSave = window.setTimeout(() => { void save(active.path); }, 1200);
              }
            }}
            options={{
              minimap: { enabled: true, size: 'fit' },
              fontSize: 13 * (settings.fontScale / 100),
              fontFamily: 'JetBrains Mono, Cascadia Code, Consolas, monospace',
              padding: { top: 14 },
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              renderLineHighlight: 'all',
              bracketPairColorization: { enabled: true },
              automaticLayout: true,
              scrollBeyondLastLine: false,
            }}
          />
        )}
      </div>
      <div className="code-font flex items-center gap-3 px-3 py-1 text-[10.5px] text-slate-500" style={{ borderTop: '1px solid var(--border)' }}>
        <span className="truncate">{active.path}</span>
        <span className="ml-auto">{active.language} · {text.split('\n').length} lines · UTF-8</span>
      </div>
    </div>
  );
}
