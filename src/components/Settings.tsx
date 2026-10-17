import { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Sun, Moon, Languages, ShieldCheck, FolderCog, Cpu } from 'lucide-react';
import { useStore } from '../store';
import { getHardware, installLlamaRuntime, llamaRuntimeStatus } from '../lib/tauri';
import type { RuntimeStatus } from '../types';

export default function Settings() {
  const { settings, setSettings } = useStore();
  const [tab, setTab] = useState('general');
  const [hwInfo, setHwInfo] = useState('');
  const [rt, setRt] = useState<RuntimeStatus | null>(null);
  const [rtBackend, setRtBackend] = useState<'auto' | 'cuda' | 'vulkan' | 'cpu'>('auto');
  const [rtMsg, setRtMsg] = useState('');
  const [rtBusy, setRtBusy] = useState(false);

  useEffect(() => {
    llamaRuntimeStatus().then(setRt).catch(() => setRt(null));
  }, []);

  const installRt = async () => {
    if (rtBusy) return;
    setRtBusy(true);
    setRtMsg('Starting…');
    const { listen } = await import('@tauri-apps/api/event');
    const un = await listen<{ stage: string; pct: number; label: string }>('runtime-progress', (e) => {
      setRtMsg(e.payload.label + (e.payload.stage === 'download' ? ` — ${e.payload.pct}%` : ''));
    });
    try {
      const p = await installLlamaRuntime(rtBackend);
      setRtMsg('Installed: ' + p);
      setRt(await llamaRuntimeStatus());
    } catch (e) {
      setRtMsg('Failed: ' + String((e as Error).message ?? e).slice(0, 300));
    } finally {
      un();
      setRtBusy(false);
    }
  };

  const tabs = [
    { id: 'general', label: settings.lang === 'ru' ? 'Общее' : 'General' },
    { id: 'appearance', label: settings.lang === 'ru' ? 'Внешний вид' : 'Appearance' },
    { id: 'hardware', label: 'Hardware & GPU' },
    { id: 'permissions', label: settings.lang === 'ru' ? 'Права агента' : 'Agent permissions' },
    { id: 'privacy', label: settings.lang === 'ru' ? 'Приватность' : 'Privacy' },
  ];

  return (
    <div className="flex h-full">
      <div className="w-44 shrink-0 space-y-1 border-r border-white/10 p-2.5">
        <p className="flex items-center gap-1.5 px-2 py-1 text-sm font-semibold"><SettingsIcon size={14} />{settings.lang === 'ru' ? 'Настройки' : 'Settings'}</p>
        {tabs.map((x) => (
          <button key={x.id} onClick={() => setTab(x.id)} className={`block w-full rounded-xl px-2.5 py-1.5 text-left text-xs transition-all ${tab === x.id ? 'bg-nint-violet/20 text-white' : 'text-slate-400 hover:bg-white/10'}`}>{x.label}</button>
        ))}
      </div>
      <div className="flex-1 space-y-3 overflow-auto p-4 text-sm">
        {tab === 'general' && (
          <>
            <label className="flex items-center gap-2 text-xs"><Languages size={13} /> Interface language
              <select className="input !w-32" value={settings.lang} onChange={(e) => setSettings({ lang: e.target.value as 'ru' | 'en' })}>
                <option value="ru">Русский</option><option value="en">English</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={settings.autoSave} onChange={(e) => setSettings({ autoSave: e.target.checked })} /> Autosave files</label>
            <label className="flex items-center gap-2 text-xs"><FolderCog size={13} /> Models folder
              <input className="input" value={settings.modelsDir} placeholder="default app data" onChange={(e) => setSettings({ modelsDir: e.target.value })} />
            </label>
          </>
        )}
        {tab === 'appearance' && (
          <>
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => setSettings({ theme: 'dark' })}><Moon size={13} />Dark graphite</button>
              <button className="btn-ghost" onClick={() => setSettings({ theme: 'light' })}><Sun size={13} />Light</button>
            </div>
            <label className="block text-xs">UI scale: {settings.fontScale}%
              <input type="range" min={85} max={130} value={settings.fontScale} onChange={(e) => setSettings({ fontScale: Number(e.target.value) })} className="w-full" />
            </label>
          </>
        )}
        {tab === 'hardware' && (
          <>
            <div className="rounded-xl border p-2.5" style={{ borderColor: 'var(--border)' }}>
              <p className="flex items-center gap-1.5 text-xs font-semibold"><Cpu size={13} /> Local inference runtime (llama.cpp)</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                {rt === null ? 'Checking…' : rt.installed
                  ? <>Ready: <span className="code-font text-slate-300">{rt.portable ? 'bundled / in PATH' : `managed (${rt.backend ?? 'auto'})`}</span> — {rt.path?.split(/[/\\]/).slice(-2).join('/')}</>
                  : 'Not installed — it installs automatically and silently on your first model launch. You can also install it now.'}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <select className="input !w-36 !py-1 text-xs" value={rtBackend} onChange={(e) => setRtBackend(e.target.value as typeof rtBackend)}>
                  <option value="auto">Auto (by hardware)</option>
                  <option value="cuda">CUDA (NVIDIA, ~0.6–0.7 GB)</option>
                  <option value="vulkan">Vulkan (any GPU, ~30 MB)</option>
                  <option value="cpu">CPU only (~20 MB)</option>
                </select>
                <button className="btn-ghost text-xs" disabled={rtBusy} onClick={() => void installRt()}>
                  {rtBusy ? 'Installing…' : rt?.installed ? 'Reinstall / update' : 'Install now'}
                </button>
              </div>
              {rtMsg && <p className="mt-1.5 text-[11px] text-nint-blue">{rtMsg}</p>}
              <p className="mt-1 text-[10.5px] text-slate-600">Downloads the official llama.cpp nightly build from GitHub once (Windows .zip / Linux .tar.gz), unpacks it into the app data folder and launches it automatically with every model — no manual setup, no separate installs.</p>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold">Power profile (local models)</p>
              <div className="grid gap-1.5">
                {([
                  { id: 'performance' as const, title: 'Performance', desc: 'All CPU threads, max GPU layers, normal priority. Fastest generation.' },
                  { id: 'balanced' as const, title: 'Balanced', desc: 'Leaves a few CPU threads free (cores − 2), below-normal process priority.' },
                  { id: 'eco' as const, title: 'Eco (экономия)', desc: 'Few threads (cores ÷ 4), idle priority, 4k context, gently throttled token stream. Artificially slows generation to cut GPU/CPU usage and keep the PC cool.' },
                ]).map((p) => (
                  <button key={p.id} onClick={() => setSettings({ powerProfile: p.id })}
                    className={`rounded-xl border p-2.5 text-left transition-all ${settings.powerProfile === p.id ? (p.id === 'eco' ? 'border-amber-400/50 bg-amber-400/[0.08]' : 'border-nint-violet/50 bg-nint-violet/[0.08]') : 'hover:border-white/20'}`}
                    style={settings.powerProfile === p.id ? undefined : { borderColor: 'var(--border)' }}>
                    <p className="text-xs font-semibold">{p.title} {settings.powerProfile === p.id && <span className="chip ml-1 !py-0 text-[9px]">active</span>}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{p.desc}</p>
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10.5px] text-slate-600">Applied when NintCode launches llama-server. Eco genuinely reduces load (threads + OS priority + HTTP back-pressure), not just UI speed.</p>
            </div>
            <div className="rounded-xl border p-2.5" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-semibold">Advanced load control (GPU / RAM)</p>
              <label className="mt-2 block text-[11px] text-slate-400">
                GPU layers: <b className="text-slate-200">{settings.maxLayersGPU >= 999 ? 'all (999)' : settings.maxLayersGPU}</b> — fewer layers = less VRAM, more CPU/RAM
                <input type="range" min={0} max={999} value={Math.min(settings.maxLayersGPU, 999)} onChange={(e) => setSettings({ maxLayersGPU: Number(e.target.value) })} className="mt-1 w-full accent-nint-violet" />
              </label>
              <div className="mt-1 flex flex-wrap gap-1">
                {([999, 48, 32, 16, 0] as const).map((v) => (
                  <button key={v} className={`chip ${settings.maxLayersGPU === v ? 'border-nint-violet/50 text-nint-violet' : ''}`} onClick={() => setSettings({ maxLayersGPU: v })}>{v === 999 ? 'All GPU' : v === 0 ? 'CPU only' : v + ' layers'}</button>
                ))}
              </div>
              <label className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                <span>Context size (KV cache): smaller = less VRAM + RAM</span>
                <select className="input !w-28 !py-1" value={settings.ctxSize} onChange={(e) => setSettings({ ctxSize: Number(e.target.value) })}>
                  {[2048, 4096, 8192, 16384, 32768].map((c) => <option key={c} value={c}>{c.toLocaleString()}</option>)}
                </select>
              </label>
              <p className="mt-1 text-[10.5px] text-slate-600">These cap the llama-server launch flags. Eco additionally forces context down to 4,096 and throttles the token stream.</p>
            </div>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={settings.gpuOnly} onChange={(e) => setSettings({ gpuOnly: e.target.checked })} /> GPU Only (never silently fall back to CPU)</label>
            <button className="btn-ghost text-xs" onClick={() => getHardware().then((h) => setHwInfo(JSON.stringify(h, null, 2))).catch((e) => setHwInfo(String(e)))}>Detect hardware</button>
            {hwInfo && <pre className="code-font whitespace-pre-wrap rounded-xl bg-black/40 p-2 text-[11px]">{hwInfo}</pre>}
          </>
        )}
        {tab === 'permissions' && (
          <>
            <label className="flex items-center gap-2 text-xs"><ShieldCheck size={13} /><input type="checkbox" checked={settings.confirmDangerous} onChange={(e) => setSettings({ confirmDangerous: e.target.checked })} /> Confirm deletes, mass edits, installs</label>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={settings.allowOutsideWorkspace} onChange={(e) => setSettings({ allowOutsideWorkspace: e.target.checked })} /> Allow agent outside project folder (not recommended)</label>
          </>
        )}
        {tab === 'privacy' && (
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-3 text-xs leading-relaxed text-slate-300">
            NintCode is free with no premium. Local models run 100% on your PC — prompts never leave it. Telemetry is off by default.
            Model downloads and update checks need internet. Switching to a cloud API sends your messages to that provider.
          </div>
        )}
        <p className="text-[11px] text-slate-500">Settings persist between restarts (Tauri Store + SQLite on desktop, localStorage in preview).</p>
      </div>
    </div>
  );
}
