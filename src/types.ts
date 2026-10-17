export type AgentMode = 'ask' | 'plan' | 'agent';
export type Theme = 'dark' | 'light';
export type Lang = 'ru' | 'en';
export type RightTab = 'chat' | 'hub' | 'providers' | 'settings';
export type PowerProfile = 'performance' | 'balanced' | 'eco';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  ts: number;
  streaming?: boolean;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'pending' | 'running' | 'done' | 'error' | 'needs-confirm';
  result?: string;
  error?: string;
}

export interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
  gitStatus?: string;
}

export interface OpenTab {
  path: string;
  dirty: boolean;
  language: string;
}

export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  modelId: string;
  kind: 'openai' | 'ollama' | 'lmstudio' | 'llamacpp';
}

export interface LocalModel {
  id: string;
  name: string;
  developer: string;
  description: string;
  hfRepo: string;
  files: { quant: string; sizeGB: number; url: string }[];
  ramGB: number;
  vramGB: number;
  context: number;
  tags: ('fast' | 'balanced' | 'powerful' | 'coding' | 'agent')[];
  tools: boolean;
  license: string;
  installed?: boolean;
  localPath?: string;
}

export interface HardwareInfo {
  os: string;
  cpu: string;
  cpuCores: number;
  ramGB: number;
  gpus: { name: string; vramGB: number; backend: string }[];
  cuda: boolean;
  vulkan: boolean;
}

export interface RuntimeStatus {
  installed: boolean;
  path: string | null;
  backend: string | null;
  portable: boolean;
}

export interface RuntimeProgress {
  stage: 'resolve' | 'download' | 'extract' | 'done';
  pct: number;
  label: string;
}

export interface AppSettings {
  theme: Theme;
  lang: Lang;
  fontScale: number;
  modelsDir: string;
  gpuOnly: boolean;
  maxLayersGPU: number;
  ctxSize: number;
  powerProfile: PowerProfile;
  confirmDangerous: boolean;
  allowOutsideWorkspace: boolean;
  autoSave: boolean;
  terminalShell?: string;
}

export interface PerfStats {
  tokensPerSec: number;
  vramMB: number;
  ramMB: number;
  firstTokenMs: number;
  contextUsed: number;
  contextTotal: number;
  device: string;
}
