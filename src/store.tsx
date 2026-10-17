import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { AppSettings, ChatMessage, OpenTab, Provider } from './types';

interface State {
  settings: AppSettings;
  setSettings: (p: Partial<AppSettings>) => void;
  projectPath: string | null;
  setProjectPath: (p: string | null) => void;
  recent: string[];
  pushRecent: (p: string) => void;
  tabs: OpenTab[];
  openTab: (path: string) => void;
  closeTab: (path: string) => void;
  activeTab: string | null;
  setActiveTab: (p: string | null) => void;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  providers: Provider[];
  setProviders: React.Dispatch<React.SetStateAction<Provider[]>>;
  activeProviderId: string | null;
  setActiveProviderId: (id: string | null) => void;
  activeLocalModel: string | null;
  setActiveLocalModel: (id: string | null) => void;
  onboardingDone: boolean;
  setOnboardingDone: (v: boolean) => void;
  leftTab: 'explorer' | 'search' | 'git';
  setLeftTab: (t: State['leftTab']) => void;
}

const Ctx = createContext<State | null>(null);

const DEFAULTS: AppSettings = {
  theme: 'dark', lang: 'ru', fontScale: 100, modelsDir: '',
  gpuOnly: false, maxLayersGPU: 999, ctxSize: 8192, powerProfile: 'performance',
  confirmDangerous: true, allowOutsideWorkspace: false, autoSave: true,
};

function load<T>(k: string, fb: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? { ...fb as object, ...JSON.parse(v) } as T : fb;
  } catch { return fb; }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [settings, setS] = useState<AppSettings>(() => load('nintcode:settings', DEFAULTS));
  const [projectPath, setProjectPath] = useState<string | null>(() => localStorage.getItem('nintcode:project'));
  const [recent, setRecent] = useState<string[]>(() => JSON.parse(localStorage.getItem('nintcode:recent') ?? '[]') as string[]);
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() => JSON.parse(localStorage.getItem('nintcode:chat') ?? '[]') as ChatMessage[]);
  const [providers, setProviders] = useState<Provider[]>(() => JSON.parse(localStorage.getItem('nintcode:providers') ?? '[]') as Provider[]);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(() => localStorage.getItem('nintcode:activeProvider'));
  const [activeLocalModel, setActiveLocalModel] = useState<string | null>(() => localStorage.getItem('nintcode:activeLocal'));
  const [onboardingDone, setOnboardingDone] = useState(() => localStorage.getItem('nintcode:onboarded') === '1');
  const [leftTab, setLeftTab] = useState<State['leftTab']>('explorer');

  useEffect(() => { localStorage.setItem('nintcode:settings', JSON.stringify(settings)); document.body.classList.toggle('light', settings.theme === 'light'); document.documentElement.classList.toggle('dark', settings.theme === 'dark'); }, [settings]);
  useEffect(() => { projectPath ? localStorage.setItem('nintcode:project', projectPath) : localStorage.removeItem('nintcode:project'); }, [projectPath]);
  useEffect(() => { localStorage.setItem('nintcode:recent', JSON.stringify(recent)); }, [recent]);
  useEffect(() => { localStorage.setItem('nintcode:chat', JSON.stringify(messages.slice(-200))); }, [messages]);
  useEffect(() => { localStorage.setItem('nintcode:providers', JSON.stringify(providers)); }, [providers]);
  useEffect(() => { activeProviderId ? localStorage.setItem('nintcode:activeProvider', activeProviderId) : localStorage.removeItem('nintcode:activeProvider'); }, [activeProviderId]);
  useEffect(() => { activeLocalModel ? localStorage.setItem('nintcode:activeLocal', activeLocalModel) : localStorage.removeItem('nintcode:activeLocal'); }, [activeLocalModel]);

  const setSettings = (p: Partial<AppSettings>) => setS((s) => ({ ...s, ...p }));
  const pushRecent = (p: string) => setRecent((r) => [p, ...r.filter((x) => x !== p)].slice(0, 12));
  const openTab = (path: string) => {
    setTabs((t) => (t.some((x) => x.path === path) ? t : [...t, { path, dirty: false, language: langOf(path) }]));
    setActiveTab(path);
  };
  const closeTab = (path: string) => {
    setTabs((t) => t.filter((x) => x.path !== path));
    setActiveTab((a) => {
      if (a !== path) return a;
      const rest = tabs.filter((x) => x.path !== path);
      return rest.length ? rest[rest.length - 1].path : null;
    });
  };

  const v = useMemo(() => ({
    settings, setSettings, projectPath, setProjectPath, recent, pushRecent,
    tabs, openTab, closeTab, activeTab, setActiveTab, messages, setMessages,
    providers, setProviders, activeProviderId, setActiveProviderId,
    activeLocalModel, setActiveLocalModel, onboardingDone, setOnboardingDone,
    leftTab, setLeftTab,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [settings, projectPath, recent, tabs, activeTab, messages, providers, activeProviderId, activeLocalModel, onboardingDone, leftTab]);

  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

export function useStore(): State {
  const s = useContext(Ctx);
  if (!s) throw new Error('no store');
  return s;
}

function langOf(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = { ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript', py: 'python', rs: 'rust', json: 'json', md: 'markdown', html: 'html', css: 'css', toml: 'toml', yaml: 'yaml', yml: 'yaml' };
  return map[ext] ?? 'plaintext';
}
