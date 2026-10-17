import { useMemo, useRef, useState } from 'react';
import { Send, Square, Bot, User, Wrench, AlertTriangle, Check, Sparkles, Copy } from 'lucide-react';
import { useStore } from '../store';
import type { AgentMode, ChatMessage, PerfStats } from '../types';
import { streamChatCompletion, readTextFile, writeTextFile, runCommand, listDir } from '../lib/tauri';
import { parseToolCalls, buildPrompt, needsConfirm } from '../lib/agent';

export default function Chat({ onPerf }: { onPerf: (p: PerfStats | null) => void }) {
  const { settings, messages, setMessages, providers, activeProviderId, activeLocalModel, projectPath } = useStore();
  const [mode, setMode] = useState<AgentMode>('agent');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingConfirms, setPendingConfirms] = useState<{ id: string; name: string; args: Record<string, unknown> }[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const activeProvider = useMemo(() => providers.find((p) => p.id === activeProviderId) ?? null, [providers, activeProviderId]);

  const endpoint = useMemo(() => {
    if (activeLocalModel) return { baseUrl: 'http://127.0.0.1:8080/v1', model: activeLocalModel, apiKey: '' as string | undefined, local: true };
    if (activeProvider) return { baseUrl: activeProvider.baseUrl, model: activeProvider.modelId, apiKey: activeProvider.apiKey || undefined, local: false };
    return null;
  }, [activeLocalModel, activeProvider]);

  const scrollDown = () => setTimeout(() => boxRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' }), 30);

  const atFiles = useMemo(() => {
    const m = input.match(/@([\w./\\-]+)/g);
    return m ? m.map((s) => s.slice(1)) : [];
  }, [input]);

  const resetTa = () => {
    if (taRef.current) { taRef.current.style.height = 'auto'; }
  };

  async function send(confirmed: { name: string; args: Record<string, unknown> }[] = []) {
    const text = input.trim();
    if ((!text && !confirmed.length) || busy) return;
    if (!endpoint) {
      push({ role: 'assistant', content: 'No model selected yet.\n\n1) Download + Run a model in **Hub**, or\n2) Connect Ollama / LM Studio / any OpenAI-compatible server in **API**.\n\nEverything stays free — local models run on your own GPU.' });
      return;
    }
    setBusy(true);
    if (text) setMessages((m) => [...m, { id: uid(), role: 'user', content: text, ts: Date.now() }]);
    setInput('');
    resetTa();

    let nintcode = '';
    if (projectPath) {
      try { nintcode = await readTextFile(join(projectPath, 'NINTCODE.md')); } catch { nintcode = ''; }
    }
    const history = messages.slice(-10).map((m) => m.role + ': ' + m.content.slice(0, 1500)).join('\n');
    const sys = buildPrompt(mode, projectPath ? `Project root: ${projectPath}` : 'No project open.', atFiles, nintcode, history, text || '(confirmed tools, continue)');

    let extra = '';
    for (const f of atFiles.slice(0, 5)) {
      try {
        const c = await readTextFile(projectPath ? join(projectPath, f) : f);
        extra += `\n\nFile @${f}:\n\`\`\`\n${c.slice(0, 8000)}\n\`\`\``;
      } catch { extra += `\n\nFile @${f}: (unreadable)`; }
    }

    const id = uid();
    setMessages((m) => [...m, { id, role: 'assistant', content: '', ts: Date.now(), streaming: true }]);
    const t0 = performance.now();
    let firstMs = 0;
    let tokens = 0;
    try {
      abortRef.current = new AbortController();
      const full = await streamChatCompletion({
        baseUrl: endpoint.baseUrl, apiKey: endpoint.apiKey, model: endpoint.model,
        messages: [
          { role: 'system', content: sys + extra },
          ...messages.slice(-12).map((m) => ({ role: m.role === 'tool' ? 'user' : m.role, content: m.content })),
          { role: 'user', content: text || 'Continue with confirmed tools.' },
        ],
        signal: abortRef.current.signal,
        throttleMs: settings.powerProfile === 'eco' ? 24 : 0,
        onToken: (tok) => {
          if (!firstMs) firstMs = performance.now() - t0;
          tokens += tok.length / 4;
          setMessages((m) => m.map((x) => (x.id === id ? { ...x, content: x.content + tok } : x)));
          scrollDown();
        },
      });
      const dt = (performance.now() - t0) / 1000;
      onPerf({
        tokensPerSec: tokens / Math.max(dt, 0.1), vramMB: 0, ramMB: 0,
        firstTokenMs: firstMs, contextUsed: full.length / 4, contextTotal: 32768,
        device: endpoint.local ? 'GPU local' : 'Cloud API',
      });

      const { clean, calls } = parseToolCalls(full);
      setMessages((m) => m.map((x) => (x.id === id ? { ...x, content: clean || '_(tool calls)_', streaming: false } : x)));

      if (mode !== 'agent') { setBusy(false); scrollDown(); return; }

      for (const c of calls.slice(0, 3)) {
        if (settings.confirmDangerous && needsConfirm(c.name, c.args) && !confirmed.some((x) => x.name === c.name)) {
          setPendingConfirms((p) => [...p, { id: uid(), name: c.name, args: c.args }]);
          push({ role: 'tool', content: `⏸ Needs confirmation: ${c.name} ${JSON.stringify(c.args).slice(0, 300)}` });
          continue;
        }
        const out = await execTool(c.name, c.args);
        push({ role: 'tool', content: `${c.name} → ${out.slice(0, 3000)}` });
      }
    } catch (e) {
      const msg = String((e as Error).message ?? e);
      if (msg.toLowerCase().includes('abort')) {
        setMessages((m) => m.map((x) => (x.id === id ? { ...x, content: x.content + '\n\n⏹ Stopped.', streaming: false } : x)));
      } else {
        setMessages((m) => m.map((x) => (x.id === id ? { ...x, content: '❌ ' + msg.slice(0, 600) + '\n\nCheck: 1) local server running (llama-server / Ollama)? 2) Base URL in API? 3) model loaded?', streaming: false } : x)));
      }
    }
    setBusy(false);
    scrollDown();
  }

  function push(m: Omit<ChatMessage, 'id' | 'ts'>) {
    setMessages((prev) => [...prev, { ...m, id: uid(), ts: Date.now() }]);
  }

  async function execTool(name: string, args: Record<string, unknown>): Promise<string> {
    const rel = (p: unknown) => {
      const s = String(p ?? '');
      if (!projectPath) return s;
      if (/^[a-zA-Z]:[\\/]/.test(s) || s.startsWith('/')) {
        if (!settings.allowOutsideWorkspace) throw new Error('Outside-workspace access blocked (Settings → Permissions).');
        return s;
      }
      return join(projectPath, s);
    };
    try {
      switch (name) {
        case 'read_file': return (await readTextFile(rel(args.path))).slice(0, 12000) || '(empty)';
        case 'list_directory': {
          const items = await listDir(rel(args.path ?? projectPath ?? '.'));
          return items.map((i) => (i.isDir ? '[dir] ' : '      ') + i.name).join('\n').slice(0, 4000) || '(empty)';
        }
        case 'write_file': {
          await writeTextFile(rel(args.path), String(args.content ?? ''));
          return 'written ' + String(args.path);
        }
        case 'edit_file': {
          const p = rel(args.path);
          const cur = await readTextFile(p);
          const oldS = String(args.old ?? args.find ?? '');
          const newS = String(args.new ?? args.replace ?? '');
          if (!oldS || !cur.includes(oldS)) return 'edit skipped: anchor not found';
          await writeTextFile(p, cur.replace(oldS, newS));
          return 'edited ' + String(args.path);
        }
        case 'create_directory': {
          await runCommand(projectPath ?? '.', `mkdir ${JSON.stringify(String(args.path))}`);
          return 'created ' + String(args.path);
        }
        case 'delete_file': return 'refused without explicit confirmation';
        case 'search_files': case 'search_code': {
          if (!projectPath) return 'no project open';
          const q = String(args.query ?? args.pattern ?? '');
          const r = await runCommand(projectPath, `git grep -l -n ${JSON.stringify(q)} 2>nul || findstr /s /m /c:${JSON.stringify(q)} * 2>nul`);
          return (r.stdout || '(no matches)').slice(0, 3000);
        }
        case 'run_terminal_command': case 'run_tests': {
          if (!projectPath) return 'no project open';
          const cmd = String(args.command ?? args.cmd ?? 'npm test');
          const r = await runCommand(projectPath, cmd);
          return ('$ ' + cmd + '\n' + r.stdout + '\n' + r.stderr).slice(0, 5000);
        }
        case 'inspect_git_diff': {
          if (!projectPath) return 'no project open';
          const r = await runCommand(projectPath, 'git diff --stat && git diff');
          return (r.stdout || r.stderr || '(no diff)').slice(0, 6000);
        }
        default: return 'unknown tool: ' + name;
      }
    } catch (e) { return 'error: ' + String((e as Error).message ?? e).slice(0, 500); }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-2">
        <div className="seg">
          {(['ask', 'plan', 'agent'] as AgentMode[]).map((m) => (
            <button key={m} className={`seg-item uppercase tracking-wide ${mode === m ? 'seg-active' : ''}`} onClick={() => setMode(m)}>{m}</button>
          ))}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 px-0.5 pb-1.5 text-[10px] text-slate-500">
          {endpoint ? (
            endpoint.local
              ? <><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {endpoint.model} · local GPU · private</>
              : <><span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> {endpoint.model} · cloud provider</>
          ) : (
            <><span className="h-1.5 w-1.5 rounded-full bg-slate-600" /> no model — open Hub or API</>
          )}
          <span className="ml-auto">{mode === 'ask' ? 'answers only' : mode === 'plan' ? 'plan only' : 'real file edits'}</span>
        </div>
      </div>

      <div ref={boxRef} className="min-h-0 flex-1 space-y-2.5 overflow-auto px-2.5 pb-2">
        {messages.length === 0 && (
          <div className="panel-rounded p-3.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold"><Sparkles size={13} className="text-nint-blue" />Try asking</p>
            <div className="mt-2 space-y-1.5">
              {['Create a landing page with hero + pricing', '@src/App.tsx refactor main screen', 'Run tests and fix failures'].map((s) => (
                <button key={s} className="block w-full truncate rounded-lg border px-2.5 py-1.5 text-left text-[11.5px] text-slate-400 transition-colors hover:border-nint-violet/40 hover:text-slate-200"
                  style={{ borderColor: 'var(--border)' }} onClick={() => setInput(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg-rise group flex gap-2 ${m.role === 'user' ? 'justify-end' : ''}`}>
            {m.role !== 'user' && (
              <div className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg ${m.role === 'tool' ? 'border border-nint-blue/25 bg-nint-blue/10' : 'bg-gradient-to-br from-nint-violet/30 to-nint-blue/20 border border-white/10'}`}>
                {m.role === 'tool' ? <Wrench size={11} className="text-nint-blue" /> : <Bot size={12} className="text-nint-violet" />}
              </div>
            )}
            <div className={`flex min-w-0 flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[92%] rounded-2xl px-3 py-2 text-[12.5px] leading-relaxed ${
                m.role === 'user'
                  ? 'rounded-br-md bg-gradient-to-br from-nint-violet to-[#5b8cff] text-white shadow-[0_8px_24px_-12px_rgba(124,92,255,.9)]'
                  : m.role === 'tool'
                    ? 'code-font w-full rounded-bl-md border border-nint-blue/20 bg-nint-blue/[0.06] text-[10.5px] text-slate-400'
                    : 'rounded-bl-md border bg-white/[0.03] text-slate-200'
              }`} style={m.role === 'tool' || m.role === 'user' ? undefined : { borderColor: 'var(--border)' }}>
                {m.role === 'user' && <User size={10} className="mb-1 opacity-60" />}
                {m.role === 'user' || m.role === 'tool' ? (
                  <span className="selectable whitespace-pre-wrap">{m.content}</span>
                ) : (
                  <div className="selectable">
                    {renderRich(m.content)}
                    {m.streaming && <span className="ml-1 inline-block h-3 w-1.5 animate-pulseDot rounded-sm bg-nint-blue align-middle" />}
                    {!m.content && m.streaming && <span className="shimmer-line inline-block h-3 w-28 rounded" />}
                  </div>
                )}
              </div>
              {m.role === 'assistant' && !m.streaming && m.content && (
                <button
                  className="mt-0.5 flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-slate-600 opacity-0 transition-opacity hover:text-slate-300 group-hover:opacity-100"
                  onClick={() => { navigator.clipboard.writeText(m.content).then(() => { setCopiedId(m.id); setTimeout(() => setCopiedId(null), 1200); }).catch(() => {}); }}
                >
                  {copiedId === m.id ? <><Check size={10} /> copied</> : <><Copy size={10} /> copy</>}
                </button>
              )}
            </div>
          </div>
        ))}
        {pendingConfirms.map((c) => (
          <div key={c.id} className="msg-rise flex items-center gap-2 rounded-2xl border border-amber-400/30 bg-amber-400/[0.08] p-2.5 text-xs">
            <AlertTriangle size={14} className="shrink-0 text-amber-300" />
            <span className="min-w-0 flex-1 truncate">Allow <b>{c.name}</b> <span className="code-font text-[10.5px] text-slate-400">{JSON.stringify(c.args).slice(0, 100)}</span>?</span>
            <button className="btn-primary !px-2.5 !py-1" onClick={() => { setPendingConfirms((p) => p.filter((x) => x.id !== c.id)); void send([c]); }}><Check size={12} /> allow</button>
            <button className="btn-ghost !py-1" onClick={() => setPendingConfirms((p) => p.filter((x) => x.id !== c.id))}>deny</button>
          </div>
        ))}
      </div>

      <div className="px-2 pb-2 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
        {atFiles.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1 px-0.5">
            {atFiles.slice(0, 6).map((f) => <span key={f} className="chip border-nint-violet/40 bg-nint-violet/10 text-nint-violet">@{f}</span>)}
          </div>
        )}
        <div className="flex items-end gap-1.5">
          <textarea ref={taRef} rows={1}
            className="input max-h-36 min-h-[34px] resize-none leading-relaxed"
            placeholder={mode === 'ask' ? 'Ask about the code…' : mode === 'plan' ? 'Describe a feature to plan…' : 'Describe what to build… (@file to pin, Enter to send)'}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onInput={(e) => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 144) + 'px'; }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} />
          {busy
            ? <button className="btn-ghost shrink-0 !border-red-400/40 !text-red-300 hover:!bg-red-400/10" onClick={() => abortRef.current?.abort()}><Square size={13} /></button>
            : <button className="btn-primary shrink-0 !px-3" onClick={() => void send()} disabled={!input.trim()}><Send size={13} /></button>}
        </div>
      </div>
    </div>
  );
}

function renderRich(content: string) {
  const parts = content.split(/```/);
  return parts.map((p, i) => {
    if (i % 2 === 1) {
      const body = p.replace(/^[a-zA-Z0-9+#._-]*\n?/, '');
      return <pre key={i} className="code-block">{body}</pre>;
    }
    return <span key={i} className="whitespace-pre-wrap">{p}</span>;
  });
}

function uid(): string { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function join(a: string, b: string): string {
  if (!b) return a;
  if (/^[a-zA-Z]:[\\/]/.test(b) || b.startsWith('/')) return b;
  return (a.replace(/[/\\]$/, '') + '/' + b.replace(/^[/\\]/, '')).replace(/\//g, '\\');
}
