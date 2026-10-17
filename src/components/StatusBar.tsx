import { GitBranch, Cpu, Zap, Cloud, ShieldCheck } from 'lucide-react';
import { useStore } from '../store';
import type { PerfStats } from '../types';

export default function StatusBar({ perf }: { perf: PerfStats | null }) {
  const { projectPath, providers, activeProviderId, activeLocalModel, settings } = useStore();
  const projectName = projectPath ? projectPath.split(/[/\\]/).filter(Boolean).pop() : null;
  const provider = providers.find((p) => p.id === activeProviderId);

  return (
    <footer className="flex h-[26px] shrink-0 items-center gap-2 px-3 text-[11px]" style={{ background: 'var(--bg2)', borderTop: '1px solid var(--border)', color: 'var(--muted)' }}>
      <span className="flex items-center gap-1"><GitBranch size={11} />{projectName ?? 'no project'}</span>
      {perf && (
        <>
          <span className="opacity-30">·</span>
          <span className="flex items-center gap-1 text-emerald-400"><Zap size={11} />{perf.tokensPerSec.toFixed(1)} tok/s</span>
          <span className="opacity-30">·</span>
          <span className="flex items-center gap-1"><Cpu size={11} />{perf.device}</span>
          <span className="opacity-30">·</span>
          <span>TTFT {Math.round(perf.firstTokenMs)} ms · {Math.round(perf.contextUsed).toLocaleString()}/{perf.contextTotal.toLocaleString()} ctx</span>
        </>
      )}
      <span className="flex-1" />
      {activeLocalModel && <span className="flex items-center gap-1 text-nint-blue"><ShieldCheck size={11} />local · private</span>}
      {!activeLocalModel && provider && <span className="flex items-center gap-1 text-amber-400"><Cloud size={11} />cloud API — provider may charge</span>}
      <span className="opacity-30">·</span>
      <span>{activeLocalModel ?? provider?.modelId ?? 'no model'}</span>
      <span className="opacity-30">·</span>
      <span className="font-medium">NintCode 0.7.0 · free forever</span>
      {settings.powerProfile === 'eco' && <span className="chip border-amber-400/40 bg-amber-400/10 text-amber-300 !py-0 text-[10px]">ECO — GPU/CPU reduced</span>}
      {settings.gpuOnly && <span className="chip border-nint-violet/40 bg-nint-violet/10 text-nint-violet !py-0 text-[10px]">GPU ONLY</span>}
    </footer>
  );
}
