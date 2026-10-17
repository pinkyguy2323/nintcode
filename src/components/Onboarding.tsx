import { useState } from 'react';
import { ArrowRight, Cpu, Download, FolderOpen, Sparkles, Check, HardDrive } from 'lucide-react';
import { useStore } from '../store';
import { getHardware, openFolderDialog } from '../lib/tauri';
import { MODEL_CATALOG, recommendModels } from '../lib/models-catalog';
import type { HardwareInfo } from '../types';

export default function Onboarding() {
  const { setOnboardingDone, setProjectPath, pushRecent, settings } = useStore();
  const [step, setStep] = useState(0);
  const [hw, setHw] = useState<HardwareInfo | null>(null);
  const [picked, setPicked] = useState<string>('qwen25-coder-7b');
  const [detecting, setDetecting] = useState(false);

  const detect = async () => {
    setDetecting(true);
    try { setHw(await getHardware()); } catch { setHw(null); }
    setDetecting(false);
    setStep(2);
  };

  const rec = hw ? recommendModels(hw.ramGB, hw.gpus[0]?.vramGB ?? 0) : ['qwen25-coder-7b', 'qwen25-coder-1p5b'];

  const finish = () => { setOnboardingDone(true); localStorage.setItem('nintcode:onboarded', '1'); };

  const screens = [
    (
      <div className="text-center">
        <div className="relative mx-auto h-20 w-20">
          <div className="blob left-0 top-0 h-16 w-16 bg-nint-violet" />
          <div className="blob bottom-0 right-0 h-16 w-16 bg-nint-blue" style={{ animationDelay: '-4s' }} />
          <div className="relative grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-nint-violet to-nint-blue text-4xl font-black text-white shadow-glow">N</div>
        </div>
        <h1 className="mt-5 text-2xl font-black tracking-tight">Welcome to NintCode</h1>
        <p className="mx-auto mt-2 max-w-sm text-[12.5px] leading-relaxed text-slate-400">
          The <b className="text-white">free</b> local AI coding workspace. No subscriptions, no mandatory API keys — your GPU, your code, your rules.
        </p>
        <button className="btn-primary mx-auto mt-6 !px-6 !py-2.5" onClick={() => setStep(1)}>Get started <ArrowRight size={14} /></button>
        <p className="mt-3 text-[10.5px] text-slate-600">Takes ~30 seconds. You can skip everything except nothing — it's all free.</p>
      </div>
    ),
    (
      <div className="text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.04]"><Cpu size={24} className="text-nint-blue" /></div>
        <h2 className="mt-3 text-lg font-bold">Analyze this PC</h2>
        <p className="mx-auto mt-1.5 max-w-sm text-[12px] leading-relaxed text-slate-400">
          We detect your GPU, VRAM, RAM and acceleration (CUDA / Vulkan / Metal) to recommend models that actually fit and run fast.
        </p>
        <button className="btn-primary mx-auto mt-5" onClick={() => void detect()} disabled={detecting}>
          {detecting ? 'Scanning…' : 'Detect hardware'}
        </button>
      </div>
    ),
    (
      <div>
        <h2 className="text-center text-lg font-bold">Recommended for your machine</h2>
        {hw && (
          <p className="mt-1 text-center text-[11px] text-slate-500">
            {hw.os} · {hw.cpu} ({hw.cpuCores} cores) · {hw.ramGB} GB RAM · {hw.gpus[0]?.name}{hw.cuda ? ' · CUDA' : hw.vulkan ? ' · Vulkan' : ''}
          </p>
        )}
        <div className="mx-auto mt-4 grid max-w-lg gap-2">
          {MODEL_CATALOG.filter((m) => rec.includes(m.id)).map((m) => (
            <button key={m.id} onClick={() => setPicked(m.id)}
              className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${picked === m.id ? 'border-nint-violet/60 bg-nint-violet/[0.08] shadow-glow' : 'hover:border-white/25'}`}
              style={picked === m.id ? undefined : { borderColor: 'var(--border)' }}>
              <div className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${picked === m.id ? 'border-nint-violet bg-nint-violet' : 'border-slate-600'}`}>
                {picked === m.id && <Check size={10} className="text-white" />}
              </div>
              <div className="min-w-0">
                <p className="text-[12.5px] font-semibold">{m.name} <span className="ml-1 font-normal text-slate-500">{m.files[0].quant}</span></p>
                <p className="truncate text-[11px] text-slate-500">{m.description}</p>
              </div>
              <span className="chip ml-auto shrink-0"><HardDrive size={10} />{m.files[0].sizeGB} GB</span>
            </button>
          ))}
        </div>
        <button className="btn-primary mx-auto mt-5 flex" onClick={() => setStep(3)}>Continue <ArrowRight size={14} /></button>
      </div>
    ),
    (
      <div className="text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.04]"><Download size={24} className="text-nint-violet" /></div>
        <h2 className="mt-3 text-lg font-bold">{MODEL_CATALOG.find((m) => m.id === picked)?.name}</h2>
        <p className="mx-auto mt-1.5 max-w-sm text-[12px] leading-relaxed text-slate-400">
          One-click download inside Model Hub — with progress, pause/resume and integrity check. You can also skip and use Ollama or any API later.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button className="btn-ghost" onClick={() => setStep(4)}>Skip for now</button>
          <button className="btn-primary" onClick={() => setStep(4)}><Check size={13} />Open Model Hub</button>
        </div>
      </div>
    ),
    (
      <div className="text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.04]"><FolderOpen size={24} className="text-nint-blue" /></div>
        <h2 className="mt-3 text-lg font-bold">Create or open a project</h2>
        <p className="mx-auto mt-1.5 max-w-sm text-[12px] leading-relaxed text-slate-400">
          The agent works with <b className="text-white">real files</b> in the folder you choose — never a simulation.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button className="btn-ghost" onClick={finish}>Skip</button>
          <button className="btn-primary" onClick={async () => {
            const sel = await openFolderDialog();
            if (sel) { setProjectPath(sel); pushRecent(sel); }
            finish();
          }}><Sparkles size={13} />{settings.lang === 'ru' ? 'Выбрать папку' : 'Pick folder'}</button>
        </div>
      </div>
    ),
  ];

  return (
    <div className="relative grid h-full place-items-center overflow-hidden p-6" style={{ background: 'var(--bg)' }}>
      <div className="blob -left-20 -top-20 h-80 w-80 bg-nint-violet" style={{ opacity: 0.22 }} />
      <div className="blob -bottom-24 -right-16 h-80 w-80 bg-nint-blue" style={{ opacity: 0.18, animationDelay: '-5s' }} />
      <div className="panel-rounded glass relative w-full max-w-xl p-8 shadow-glow">
        {screens[step]}
        <div className="mt-7 flex justify-center gap-1.5">
          {screens.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-7 bg-gradient-to-r from-nint-violet to-nint-blue' : 'w-2.5 bg-white/10'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
