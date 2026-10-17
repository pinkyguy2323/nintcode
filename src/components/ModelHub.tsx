import { useEffect, useState } from 'react';
import { Download, Play, Trash2, HardDrive, Cpu, FolderInput, CheckCircle2, Loader2, Zap, Brain, Scale, Code2, Wrench, Sparkles } from 'lucide-react';
import { MODEL_CATALOG, recommendModels } from '../lib/models-catalog';
import { getHardware, isTauri } from '../lib/tauri';
import { useStore } from '../store';
import type { HardwareInfo } from '../types';

type Filter = 'all' | 'fast' | 'balanced' | 'powerful' | 'coding' | 'agent';

const FILTERS: { id: Filter; label: string; icon: typeof Zap | null }[] = [
  { id: 'all', label: 'All', icon: null },
  { id: 'fast', label: 'Fast', icon: Zap },
  { id: 'balanced', label: 'Balanced', icon: Scale },
  { id: 'powerful', label: 'Powerful', icon: Brain },
  { id: 'coding', label: 'Coding', icon: Code2 },
  { id: 'agent', label: 'Agent', icon: Wrench },
];

export default function ModelHub() {
  const { settings, setSettings, activeLocalModel, setActiveLocalModel } = useStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [hw, setHw] = useState<HardwareInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');
  const [installed, setInstalled] = useState<Record<string, string>>(() => JSON.parse(localStorage.getItem('nintcode:installed') ?? '{}') as Record<string, string>);

  useEffect(() => { getHardware().then(setHw).catch(() => null); }, []);
  useEffect(() => { localStorage.setItem('nintcode:installed', JSON.stringify(installed)); }, [installed]);

  const vram = hw?.gpus?.[0]?.vramGB ?? 0;
  const rec = recommendModels(hw?.ramGB ?? 8, vram);
  const list = MODEL_CATALOG.filter((m) => filter === 'all' || m.tags.includes(filter));

  async function download(id: string, url: string) {
    if (!isTauri()) {
      window.open(url, '_blank');
      setNote('Web preview: opened the Hugging Face file in your browser. In the desktop app, downloads run inside NintCode with progress + resume.');
      return;
    }
    setBusy(id);
    setNote('');
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const { listen } = await import('@tauri-apps/api/event');
      const un = await listen<number>('model-progress', (e) => setProgress((p) => ({ ...p, [id]: e.payload })));
      const dest: string = await invoke('download_model', { url, fileName: id + '.gguf', modelsDir: settings.modelsDir || null });
      un();
      setInstalled((p) => ({ ...p, [id]: dest }));
      setProgress((p) => ({ ...p, [id]: 100 }));
      setNote('Downloaded and verified (GGUF integrity check passed). Press Run to launch llama-server.');
    } catch (e) {
      setNote('Download failed: ' + String((e as Error).message ?? e).slice(0, 300));
    }
    setBusy(null);
  }

  async function launch(id: string) {
    try {
      if (!isTauri()) { setNote('Launch works in the desktop build. Alternatively point API → http://127.0.0.1:8080/v1 at your llama-server.'); return; }
      const { invoke } = await import('@tauri-apps/api/core');
      const path = installed[id];
      if (!path) { setNote('Download the model first.'); return; }
      const cores = navigator.hardwareConcurrency || 4;
      const prof = settings.powerProfile;
      const threads = prof === 'eco' ? Math.max(1, Math.floor(cores / 4))
        : prof === 'balanced' ? Math.max(1, cores - 2) : 0;
      const priority = prof === 'eco' ? 'idle' : prof === 'balanced' ? 'below' : 'normal';
      const ctxBase = settings.ctxSize || 8192;
      const ctxSize = prof === 'eco' ? Math.min(ctxBase, 4096) : ctxBase;
      setNote('Starting llama-server… (first run auto-installs the llama.cpp runtime)');
      const { listen } = await import('@tauri-apps/api/event');
      const un = await listen<{ stage: string; pct: number; label: string }>('runtime-progress', (e) => {
        setNote(e.payload.label + (e.payload.stage === 'download' ? ` — ${e.payload.pct}%` : ''));
      });
      let msg = '';
      try {
        msg = await invoke('launch_model', {
          path,
          gpuLayers: settings.gpuOnly ? 999 : settings.maxLayersGPU,
          threads,
          priority,
          ctx: ctxSize,
        });
      } finally {
        un();
      }
      setNote(msg);
      setActiveLocalModel(id);
    } catch (e) { setNote('Launch failed: ' + String((e as Error).message ?? e).slice(0, 400)); }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-3.5 pb-2 pt-3">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-nint-violet" />
          <h2 className="text-[13px] font-bold">NintCode Model Hub</h2>
          <span className="chip border-emerald-400/25 bg-emerald-400/10 text-emerald-300">100% free</span>
        </div>
        {hw && (
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
            <span className="chip"><Cpu size={10} /> {hw.gpus[0]?.name ?? hw.cpu}</span>
            <span className="chip">RAM {hw.ramGB} GB</span>
            {vram > 0 && <span className="chip">{vram} GB VRAM</span>}
            {hw.cuda && <span className="chip border-emerald-400/25 text-emerald-300">CUDA</span>}
            {hw.vulkan && <span className="chip border-nint-blue/25 text-nint-blue">Vulkan</span>}
          </p>
        )}
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
          {vram >= 7
            ? `Detected GPU with ~${vram} GB VRAM — start with a compact 4-bit coding model. Speeds below are estimates; live tok/s is measured during generation.`
            : 'Tip: pick ⚡ Fast models for CPU/laptops, or connect an API in the API tab. Speeds are estimates; live tok/s is measured during generation.'}
        </p>

        <div className="mt-2.5 flex flex-wrap items-center gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-600">Power</span>
          {([
            { id: 'performance' as const, label: 'Performance', hint: 'all cores · max GPU · normal priority' },
            { id: 'balanced' as const, label: 'Balanced', hint: 'some CPU headroom · below-normal priority' },
            { id: 'eco' as const, label: 'Eco', hint: 'few threads · idle priority · 4k ctx · throttled stream — cuts GPU/CPU load' },
          ]).map((p) => (
            <button key={p.id} title={p.hint} onClick={() => setSettings({ powerProfile: p.id })}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all ${settings.powerProfile === p.id
                ? (p.id === 'eco' ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40' : 'bg-gradient-to-r from-nint-violet to-nint-blue text-white')
                : 'border text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'}`}
              style={settings.powerProfile === p.id ? undefined : { borderColor: 'var(--border)' }}>
              {p.label}
            </button>
          ))}
          <span className="text-[10px] text-slate-600">· applies when NintCode runs llama-server</span>
        </div>
        {settings.powerProfile === 'eco' && (
          <p className="mt-1.5 rounded-lg border border-amber-400/25 bg-amber-400/[0.07] px-2.5 py-1.5 text-[11px] text-amber-200/90">
            Eco mode: llama-server gets {Math.max(1, Math.floor((navigator.hardwareConcurrency || 4) / 4))} thread(s), idle process priority and a 4k context; the chat stream is gently throttled so the server back-pressures. Generation is slower but your PC stays cool and responsive.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-1 px-3.5 pb-2.5">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all ${filter === f.id ? 'bg-gradient-to-r from-nint-violet to-nint-blue text-white shadow-[0_4px_14px_-6px_rgba(124,92,255,.8)]' : 'border text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'}`}
            style={filter === f.id ? undefined : { borderColor: 'var(--border)' }}>
            {f.icon && <f.icon size={11} />}{f.label}
          </button>
        ))}
      </div>

      {note && <p className="mx-3.5 mb-2 rounded-lg border border-nint-blue/25 bg-nint-blue/[0.07] px-2.5 py-1.5 text-[11px] text-slate-300">{note}</p>}

      <div className="min-h-0 flex-1 space-y-2 overflow-auto px-3.5 pb-3">
        {list.map((m) => {
          const heavy = hw ? hw.ramGB + 2 < m.ramGB * 0.6 : false;
          const isRec = rec.includes(m.id);
          const done = installed[m.id];
          const pct = progress[m.id];
          return (
            <div key={m.id} className={`card relative overflow-hidden p-3.5 ${activeLocalModel === m.id ? 'border-nint-violet/60 shadow-glow' : ''}`}>
              {isRec && <span className="absolute right-0 top-0 rounded-bl-xl bg-gradient-to-r from-nint-violet to-nint-blue px-2.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-white">best match</span>}
              {isRec && <span className="absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b from-nint-violet to-nint-blue" />}
              <h3 className="pr-20 text-[13px] font-bold">{m.name}</h3>
              <p className="text-[10.5px] text-slate-500">{m.developer} · <span className="text-slate-600">{m.license}</span></p>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-400">{m.description}</p>

              <div className="mt-2 flex flex-wrap gap-1">
                {m.tags.map((tg) => <span key={tg} className="chip !py-0">{tg}</span>)}
                <span className="chip !py-0 border-nint-blue/30 bg-nint-blue/[0.08] text-nint-blue">{m.context.toLocaleString()} ctx</span>
                {m.tools && <span className="chip !py-0 border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-300">tool-use</span>}
              </div>

              <div className="code-font mt-2.5 grid grid-cols-3 gap-2 rounded-lg border p-2 text-[10px]" style={{ borderColor: 'var(--border)', background: 'rgba(0,0,0,.22)' }}>
                <span className="flex items-center gap-1 text-slate-400"><HardDrive size={10} />{m.files[0].sizeGB} GB · {m.files[0].quant}</span>
                <span className="text-slate-500">RAM ~{m.ramGB} GB</span>
                <span className="text-slate-500">VRAM ~{m.vramGB} GB</span>
              </div>

              {heavy && <p className="mt-1.5 rounded-md bg-amber-400/10 px-2 py-1 text-[10.5px] text-amber-300">Likely too heavy for this PC — try a ⚡ Fast model.</p>}

              {typeof pct === 'number' && pct < 100 && (
                <div className="mt-2.5">
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-nint-violet to-nint-blue transition-all duration-300" style={{ width: pct + '%' }} />
                  </div>
                  <p className="mt-1 text-right text-[10px] text-slate-500">{Math.round(pct)}% · resumable</p>
                </div>
              )}

              <div className="mt-3 flex items-center gap-1.5">
                {done ? (
                  <>
                    <button className={`btn-primary !py-1.5 text-xs ${activeLocalModel === m.id ? '!opacity-100' : ''}`} onClick={() => void launch(m.id)}>
                      <Play size={12} />{activeLocalModel === m.id ? 'Running' : 'Run'}
                    </button>
                    <button className="btn-icon" title="Remove from library" onClick={() => setInstalled((p) => { const n = { ...p }; delete n[m.id]; return n; })}><Trash2 size={13} /></button>
                    <span className="chip ml-auto border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-300"><CheckCircle2 size={10} /> installed</span>
                  </>
                ) : (
                  <button className="btn-primary !py-1.5 text-xs" disabled={busy === m.id} onClick={() => void download(m.id, m.files[0].url)}>
                    {busy === m.id ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                    {isTauri() ? (busy === m.id ? ` ${Math.round(pct ?? 0)}%` : ` Download ${m.files[0].quant}`) : ' Get from HF'}
                  </button>
                )}
                {!done && (
                  <button className="btn-icon" title="Import local GGUF" onClick={async () => {
                    try {
                      const { open } = await import('@tauri-apps/plugin-dialog');
                      const sel = await open({ filters: [{ name: 'GGUF', extensions: ['gguf'] }] });
                      if (typeof sel === 'string') setInstalled((p) => ({ ...p, [m.id]: sel }));
                    } catch { setNote('Import works in the desktop build.'); }
                  }}><FolderInput size={13} /></button>
                )}
                <span className="ml-auto text-[10px] text-slate-600">{m.hfRepo.split('/')[0]}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
