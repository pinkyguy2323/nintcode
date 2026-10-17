import { useEffect, useState } from 'react';
import { StoreProvider, useStore } from './store';
import TitleBar from './components/TitleBar';
import ResizeEdges from './components/ResizeEdges';
import ActivityBar from './components/ActivityBar';
import Sidebar from './components/Sidebar';
import CodeEditor from './components/Editor';
import XTerminal from './components/Terminal';
import Chat from './components/Chat';
import ModelHub from './components/ModelHub';
import Providers from './components/Providers';
import Settings from './components/Settings';
import Onboarding from './components/Onboarding';
import StatusBar from './components/StatusBar';
import type { PerfStats, RightTab } from './types';

function Shell() {
  const { onboardingDone, settings } = useStore();
  const [right, setRight] = useState<RightTab>('chat');
  const [leftOpen, setLeftOpen] = useState(() => localStorage.getItem('nintcode:leftOpen') !== '0');
  const [leftW, setLeftW] = useState(() => Number(localStorage.getItem('nintcode:leftW')) || 260);
  const [rightW, setRightW] = useState(() => Number(localStorage.getItem('nintcode:rightW')) || 380);
  const [termH, setTermH] = useState(() => Number(localStorage.getItem('nintcode:termH')) || 180);
  const [perf, setPerf] = useState<PerfStats | null>(null);

  useEffect(() => { localStorage.setItem('nintcode:leftOpen', leftOpen ? '1' : '0'); }, [leftOpen]);
  useEffect(() => { localStorage.setItem('nintcode:leftW', String(leftW)); }, [leftW]);
  useEffect(() => { localStorage.setItem('nintcode:rightW', String(rightW)); }, [rightW]);
  useEffect(() => { localStorage.setItem('nintcode:termH', String(termH)); }, [termH]);

  if (!onboardingDone) return <Onboarding />;

  return (
    <div className="flex h-screen flex-col" style={{ fontSize: `${settings.fontScale}%` }}>
      <TitleBar />
      <ResizeEdges />
      <div className="flex min-h-0 flex-1">
        <ActivityBar leftOpen={leftOpen} setLeftOpen={setLeftOpen} right={right} setRight={setRight} />

        {leftOpen && (
          <>
            <aside className="glass min-h-0 shrink-0" style={{ width: leftW, borderRight: '1px solid var(--border)' }}>
              <Sidebar />
            </aside>
            <div className="resizer" onMouseDown={(e) => drag(e, leftW, setLeftW, 180, 460, 'x')} />
          </>
        )}

        <main className="flex min-w-0 flex-1 flex-col" style={{ background: 'var(--bg)' }}>
          <div className="min-h-0 flex-1">
            <CodeEditor />
          </div>
          <div className="resizer-row" onMouseDown={(e) => drag(e, termH, setTermH, 90, 500, 'y')} />
          <div className="shrink-0" style={{ height: termH, background: 'var(--bg2)', borderTop: '1px solid var(--border)' }}>
            <XTerminal />
          </div>
        </main>

        <div className="resizer" onMouseDown={(e) => drag(e, rightW, setRightW, 300, 680, 'x-rev')} />

        <aside className="glass flex min-h-0 shrink-0 flex-col" style={{ width: rightW, borderLeft: '1px solid var(--border)' }}>
          <div className="seg m-2 mb-1.5">
            {([
              { id: 'chat' as const, label: 'Chat' },
              { id: 'hub' as const, label: 'Hub' },
              { id: 'providers' as const, label: 'API' },
              { id: 'settings' as const, label: 'Setup' },
            ]).map((b) => (
              <button key={b.id} className={`seg-item ${right === b.id ? 'seg-active' : ''}`} onClick={() => setRight(b.id)}>{b.label}</button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {right === 'chat' && <Chat onPerf={setPerf} />}
            {right === 'hub' && <ModelHub />}
            {right === 'providers' && <Providers />}
            {right === 'settings' && <Settings />}
          </div>
        </aside>
      </div>
      <StatusBar perf={perf} />
    </div>
  );
}

function drag(e: React.MouseEvent, start: number, set: (v: number) => void, min: number, max: number, axis: 'x' | 'y' | 'x-rev') {
  e.preventDefault();
  const sx = e.clientX, sy = e.clientY;
  const move = (ev: MouseEvent) => {
    const d = axis === 'x' ? ev.clientX - sx : axis === 'y' ? sy - ev.clientY : sx - ev.clientX;
    set(Math.min(max, Math.max(min, start + d)));
  };
  const up = () => window.removeEventListener('mousemove', move);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up, { once: true });
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
