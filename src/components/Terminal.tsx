import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useStore } from '../store';
import { runCommand } from '../lib/tauri';

export default function XTerminal() {
  const ref = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const { projectPath } = useStore();
  const [cwdLabel, setCwdLabel] = useState(projectPath ?? '.');
  const cwdRef = useRef(projectPath ?? '.');
  cwdRef.current = projectPath ?? '.';

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const term = new Terminal({
      theme: { background: '#0b0d13', foreground: '#d7dce8', cursor: '#7c5cff', selectionBackground: 'rgba(124,92,255,.35)' },
      fontFamily: 'JetBrains Mono, Cascadia Code, Consolas, monospace',
      fontSize: 12.5,
      cursorBlink: true,
    });
    termRef.current = term;
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(el);
    fit.fit();
    const ro = new ResizeObserver(() => fit.fit());
    ro.observe(el);

    term.writeln('\x1b[1;35mNintCode terminal\x1b[0m — real commands via Tauri backend. Type `help`.');
    printPrompt(term);
    let buf = '';
    term.onKey(({ key, domEvent }) => {
      if (domEvent.key === 'Enter') {
        term.write('\r\n');
        void exec(term, buf);
        buf = '';
      } else if (domEvent.key === 'Backspace') {
        if (buf.length) { buf = buf.slice(0, -1); term.write('\b \b'); }
      } else if (domEvent.ctrlKey && domEvent.key === 'l') {
        term.clear(); printPrompt(term); buf = '';
      } else if (key.length === 1) {
        buf += key; term.write(key);
      }
    });
    return () => { ro.disconnect(); term.dispose(); termRef.current = null; };
  }, []);

  async function exec(term: Terminal, cmdRaw: string) {
    const cmd = cmdRaw.trim();
    if (!cmd) { printPrompt(term); return; }
    if (cmd === 'help') { term.writeln('Commands run in the project folder on your PC. `clear` clears, `cd <dir>` works for display.'); printPrompt(term); return; }
    if (cmd === 'clear') { term.clear(); printPrompt(term); return; }
    if (cmd.startsWith('cd ')) { cwdRef.current = cmd.slice(3).trim() || cwdRef.current; setCwdLabel(cwdRef.current); term.writeln('cwd: ' + cwdRef.current); printPrompt(term); return; }
    term.writeln('\x1b[90m$ ' + cmd + '\x1b[0m');
    try {
      const r = await runCommand(cwdRef.current, cmd);
      if (r.stdout) term.write(sanitize(r.stdout).slice(0, 20000));
      if (r.stderr) term.write('\x1b[31m' + sanitize(r.stderr).slice(0, 8000) + '\x1b[0m');
      if (!r.stdout && !r.stderr) term.writeln('(exit ' + r.code + ')');
    } catch (e) {
      term.writeln('\x1b[31mFailed: ' + String((e as Error).message ?? e).slice(0, 500) + '\x1b[0m');
      term.writeln('\x1b[90mTip: run inside the Tauri desktop app for full terminal backend.\x1b[0m');
    }
    printPrompt(term);
    term.scrollToBottom();
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-7 shrink-0 items-center gap-2 px-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="text-[10.5px] font-semibold uppercase tracking-widest text-slate-500">Terminal</span>
        <span className="min-w-0 truncate text-[10.5px] text-slate-600">{cwdLabel}</span>
        <div className="flex-1" />
        <button
          className="rounded px-1.5 py-0.5 text-[10.5px] text-slate-500 transition-colors hover:bg-white/10 hover:text-white"
          title="Clear (Ctrl+L)"
          onClick={() => { const t = termRef.current; if (t) { t.clear(); printPrompt(t); } }}
        >
          Clear
        </button>
      </div>
      <div ref={ref} className="min-h-0 flex-1 bg-graphite-950 p-1" />
    </div>
  );
}

function printPrompt(term: Terminal) {
  term.write('\x1b[1;36mnint\x1b[0m\x1b[90m❯\x1b[0m ');
}

function sanitize(s: string): string {
  return s.replace(/\r(?!\n)/g, '\n').replace(/\n/g, '\r\n');
}
