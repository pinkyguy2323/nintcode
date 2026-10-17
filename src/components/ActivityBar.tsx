import { Files, Search, GitBranch, Package, Plug, Settings, Sun, Moon } from 'lucide-react';
import { useStore } from '../store';
import type { RightTab } from '../types';

interface Props {
  leftOpen: boolean;
  setLeftOpen: (v: boolean) => void;
  right: RightTab;
  setRight: (r: RightTab) => void;
}

export default function ActivityBar({ leftOpen, setLeftOpen, right, setRight }: Props) {
  const { leftTab, setLeftTab, settings, setSettings } = useStore();

  const leftItems = [
    { id: 'explorer' as const, icon: Files, label: 'Explorer' },
    { id: 'search' as const, icon: Search, label: 'Search' },
    { id: 'git' as const, icon: GitBranch, label: 'Source control' },
  ];

  const rightItems = [
    { id: 'hub' as const, icon: Package, label: 'Model Hub' },
    { id: 'providers' as const, icon: Plug, label: 'AI Providers' },
    { id: 'settings' as const, icon: Settings, label: 'Settings' },
  ];

  return (
    <nav className="flex h-full w-14 shrink-0 flex-col items-center gap-1.5 py-2.5" style={{ background: 'var(--bg2)', borderRight: '1px solid var(--border)' }}>
      {leftItems.map((b) => {
        const on = leftOpen && leftTab === b.id;
        return (
          <button key={b.id} title={b.label}
            className={`act-btn ${on ? 'act-active' : ''}`}
            onClick={() => {
              if (leftOpen && leftTab === b.id) setLeftOpen(false);
              else { setLeftTab(b.id); setLeftOpen(true); }
            }}>
            <b.icon size={17} />
          </button>
        );
      })}

      <div className="my-1.5 h-px w-6" style={{ background: 'var(--border)' }} />

      {rightItems.map((b) => (
        <button key={b.id} title={b.label}
          className={`act-btn ${right === b.id ? 'act-active' : ''}`}
          onClick={() => setRight(b.id)}>
          <b.icon size={17} />
        </button>
      ))}

      <div className="flex-1" />

      <button className="act-btn" title={settings.theme === 'dark' ? 'Light theme' : 'Dark theme'}
        onClick={() => setSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}>
        {settings.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      <div className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-nint-violet to-nint-blue text-[10px] font-black text-white" title="You — local only">N</div>
    </nav>
  );
}
