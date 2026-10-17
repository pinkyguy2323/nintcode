import type { AgentMode, ToolCall } from '../types';

export const KNOWN_TOOLS = [
  'read_file', 'write_file', 'edit_file', 'list_directory', 'search_files', 'search_code',
  'create_directory', 'delete_file', 'run_terminal_command', 'inspect_git_diff', 'run_tests',
];

export const AGENT_SYSTEM = `You are NintCode — a coding agent inside a desktop IDE. The user sees EVERY character you write in the chat window.
You change the project ONLY via tool calls. NEVER paste file bodies, long code or plans-with-code into the chat: code belongs inside the tool-call JSON, nowhere else.

Preferred tool call format (fenced):
\`\`\`tool:write_file
{"path": "src/App.tsx", "content": "line1\\nline2"}
\`\`\`
Colon format is also accepted:
:write_file
{"path": "src/App.tsx", "content": "line1\\nline2"}

Tools:
- read_file {"path"} · write_file {"path","content"} · edit_file {"path","old","new"}
- list_directory {"path"} · search_files {"query"} · search_code {"query"}
- create_directory {"path"} · delete_file {"path"}
- run_terminal_command {"command"} · run_tests {"command"} · inspect_git_diff {}

Rules:
- JSON must be VALID: inside "content" escape newlines as \\n and double quotes as \\". Never put raw line breaks inside JSON strings.
- One tool call per file. NEVER emit the same call twice.
- At most 3 tool calls per turn. After tool results come back: continue with the next needed call, or finish with ONE short sentence (max 2 lines). No code dumps, no plans repeated in chat.
- Ask for confirmation before delete_file / install / rm -rf.
- Paths are relative to the project root.
- In Ask mode: explanation only, no tool calls. In Plan mode: a short numbered plan only.
- Follow NINTCODE.md if it is injected as context.`;

export interface AgentToolResult {
  call: ToolCall;
  output: string;
}

interface ParsedCall {
  name: string;
  args: Record<string, unknown>;
}

// ---------- tolerant JSON helpers ----------

// Models often emit raw newlines inside JSON strings — escape them.
function repairJson(raw: string): string {
  let out = '';
  let inStr = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (ch === '\\') { out += ch; if (i + 1 < raw.length) { out += raw[i + 1]; i++; } continue; }
      if (ch === '"') { inStr = false; out += ch; continue; }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { out += '\\r'; continue; }
      if (ch === '\t') { out += '\\t'; continue; }
      out += ch;
    } else {
      if (ch === '"') inStr = true;
      out += ch;
    }
  }
  return out;
}

function tryParse(raw: string): Record<string, unknown> | null {
  const s = raw.trim();
  try {
    const v = JSON.parse(s) as unknown;
    return v && typeof v === 'object' ? v as Record<string, unknown> : null;
  } catch { /* try repair */ }
  try {
    const v = JSON.parse(repairJson(s)) as unknown;
    return v && typeof v === 'object' ? v as Record<string, unknown> : null;
  } catch { return null; }
}

// Last resort: pull "key": "value" pairs out of broken JSON.
function salvage(raw: string): Record<string, unknown> | null {
  const args: Record<string, unknown> = {};
  const simple = /"([a-zA-Z_]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = simple.exec(raw)) !== null) {
    if (m[1] === 'content') continue;
    args[m[1]] = m[2].replace(/\\"/g, '"').replace(/\\n/g, '\n');
  }
  // content must terminate with a closing quote+brace to be considered complete
  const cm = raw.match(/"content"\s*:\s*"([\s\S]*)"\s*\}/);
  if (cm) {
    let c = cm[1];
    try { c = JSON.parse('"' + c + '"') as string; } catch { /* keep raw */ }
    args.content = c;
  }
  return Object.keys(args).length ? args : null;
}

function makeCall(name: string, raw: string): ParsedCall | null {
  if (!KNOWN_TOOLS.includes(name)) return null;
  const args = tryParse(raw) ?? salvage(raw);
  if (!args) return null;
  return { name, args };
}

// Index just past the matching '}' that closes the object starting at `start`.
function scanObject(s: string, start: number): number {
  let depth = 0;
  let inStr = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === '"') inStr = false;
    } else if (ch === '"') {
      inStr = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

// ---------- multi-format tool call parser ----------

export function parseToolCalls(text: string): { clean: string; calls: ParsedCall[]; invalid: number } {
  const calls: ParsedCall[] = [];
  let invalid = 0;
  let clean = text;

  // 1) fenced: ```tool:name\n{json}```
  clean = clean.replace(/```tool:([a-z_]+)[ \t]*\r?\n([\s\S]*?)```/g, (_m, name: string, raw: string) => {
    const c = makeCall(name, raw);
    if (c) calls.push(c); else invalid++;
    return '';
  });
  // 1b) unterminated fenced block (output was cut off)
  clean = clean.replace(/```tool:[a-z_]+[ \t]*\r?\n[\s\S]*$/, () => { invalid++; return ''; });

  // 2) fenced ```json {"name": "tool", "arguments": {...}}```
  clean = clean.replace(/```(?:json)?[ \t]*\r?\n\{\s*"(?:name|tool|function)"[\s\S]*?\}\s*```/g, (block) => {
    const json = block.replace(/```(?:json)?[ \t]*\r?\n/, '').replace(/```\s*$/, '');
    const obj = tryParse(json) ?? salvage(json);
    if (!obj) { invalid++; return ''; }
    const fn = obj.function as Record<string, unknown> | undefined;
    const name = String(obj.name ?? obj.tool ?? fn?.name ?? '');
    const argsRaw = obj.arguments ?? obj.args ?? fn?.arguments ?? fn?.args;
    const args = argsRaw && typeof argsRaw === 'object' ? argsRaw as Record<string, unknown> : obj;
    if (KNOWN_TOOLS.includes(name)) { calls.push({ name, args }); return ''; }
    return block;
  });

  // 3) colon style: ":tool_name" on its own line, JSON object after it
  let from = 0;
  for (;;) {
    const re = /^:([a-z_]+)[ \t]*\r?\n/gm;
    re.lastIndex = from;
    const m = re.exec(clean);
    if (!m) break;
    if (!KNOWN_TOOLS.includes(m[1])) { from = m.index + m[0].length; continue; }
    const after = m.index + m[0].length;
    const braceStart = clean.indexOf('{', after);
    let removeEnd = clean.length;
    let raw = '';
    let complete = false;
    if (braceStart >= 0 && braceStart - after <= 3) {
      const end = scanObject(clean, braceStart);
      if (end >= 0) {
        raw = clean.slice(braceStart, end);
        removeEnd = end;
        complete = true;
      }
    }
    // An unfinished JSON object (output cut off) must NOT be executed or salvaged.
    const c = complete ? makeCall(m[1], raw) : null;
    if (c) calls.push(c); else invalid++;
    clean = clean.slice(0, m.index) + clean.slice(removeEnd);
    from = m.index;
  }

  // 4) XML-ish: <tool_call>{"name":...}</tool_call>
  clean = clean.replace(/<tool_call>\s*([\s\S]*?)<\/tool_call>/g, (_m, raw: string) => {
    const obj = tryParse(raw) ?? salvage(raw);
    const name = String(obj?.name ?? obj?.tool ?? '');
    if (obj && KNOWN_TOOLS.includes(name)) {
      const args = obj.arguments && typeof obj.arguments === 'object' ? obj.arguments as Record<string, unknown> : obj;
      calls.push({ name, args });
      return '';
    }
    invalid++;
    return '';
  });

  // dedupe identical calls (weak models love to repeat themselves)
  const seen = new Set<string>();
  const unique = calls.filter((c) => {
    const k = c.name + '|' + JSON.stringify(c.args).slice(0, 400);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  clean = clean.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
  return { clean, calls: unique, invalid };
}

// While streaming: hide tool-call markup from the visible chat bubble.
export function stripToolPreview(text: string): { text: string; hidden: boolean } {
  let t = text;
  let hidden = false;
  t = t.replace(/```tool:[\s\S]*?```/g, '');
  t = t.replace(/```(?:json)?[ \t]*\r?\n\{\s*"(?:name|tool|function)"[\s\S]*?\}\s*```/g, '');
  const pf = t.search(/```tool:/);
  if (pf >= 0) { t = t.slice(0, pf); hidden = true; }
  if (!hidden) {
    const jf = t.search(/```(?:json)?[ \t]*\r?\n\{\s*"(?:name|tool|function)"/);
    if (jf >= 0) { t = t.slice(0, jf); hidden = true; }
  }
  if (!hidden) {
    const cm = t.search(new RegExp('^:(' + KNOWN_TOOLS.join('|') + ')[ \\t]*$', 'm'));
    if (cm >= 0) { t = t.slice(0, cm); hidden = true; }
  }
  return { text: t.trimEnd(), hidden };
}

export function buildPrompt(mode: AgentMode, projectHint: string, atFiles: string[], nintcodeMd: string, history: string, user: string): string {
  const at = atFiles.length ? '\nPinned files:\n' + atFiles.map((f) => '@' + f).join('\n') : '';
  const rules = nintcodeMd ? '\nNINTCODE.md:\n' + nintcodeMd.slice(0, 4000) : '';
  if (mode === 'ask') return `${projectHint}${at}${rules}\n${history}\nUser: ${user}\nAnswer concisely with code references. No tool calls.`;
  if (mode === 'plan') return `${projectHint}${at}${rules}\n${history}\nUser: ${user}\nReturn a short numbered plan only. No tool calls, no file changes, no big code blocks.`;
  return `${AGENT_SYSTEM}\n${projectHint}${at}${rules}\n${history}\nUser: ${user}`;
}

export const DANGEROUS = /rm\s+-rf|del\s+\/[fs]|npm\s+install|pip\s+install|format\s+[a-z]:|shutdown|mkfs/i;

export function needsConfirm(name: string, args: Record<string, unknown>): boolean {
  if (name === 'delete_file') return true;
  if (name === 'run_terminal_command' || name === 'run_tests') {
    const cmd = String(args.command ?? args.cmd ?? '');
    return DANGEROUS.test(cmd) || cmd.includes('install');
  }
  return false;
}
