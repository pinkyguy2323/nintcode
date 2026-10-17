import type { AgentMode, ToolCall } from '../types';

export const AGENT_SYSTEM = `You are NintCode, a coding agent inside a desktop IDE.
You can read and modify the user's project ONLY via tool calls.
Tool call format — fenced block:
\`\`\`tool:read_file
{"path": "src/App.tsx"}
\`\`\`
Available tools: read_file, write_file, edit_file, list_directory, search_files, search_code, create_directory, delete_file, run_terminal_command, inspect_git_diff, run_tests.
Rules:
- In Ask mode: never emit tool calls, only explain.
- In Plan mode: output a numbered plan, no tool calls.
- In Agent mode: you may emit up to 3 tool calls per turn. After results, continue.
- Always reference relative paths from project root.
- Ask for confirmation before delete_file / run_terminal_command with install / rm -rf.
- Prefer small diffs. After write/edit, briefly summarize.
Read NINTCODE.md rules if present (it will be injected as context).`;

export interface AgentToolResult {
  call: ToolCall;
  output: string;
}

// Parse ```tool:name {json}``` blocks from model text.
export function parseToolCalls(text: string): { clean: string; calls: { name: string; args: Record<string, unknown> }[] } {
  const re = /```tool:([a-z_]+)\s*\n([\s\S]*?)```/g;
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    try {
      calls.push({ name: m[1], args: JSON.parse(m[2].trim()) as Record<string, unknown> });
    } catch {
      calls.push({ name: m[1], args: { _raw: m[2].trim() } });
    }
  }
  const clean = text.replace(re, '').trim();
  return { clean, calls };
}

export function buildPrompt(mode: AgentMode, projectHint: string, atFiles: string[], nintcodeMd: string, history: string, user: string): string {
  const at = atFiles.length ? '\nPinned files:\n' + atFiles.map((f) => '@' + f).join('\n') : '';
  const rules = nintcodeMd ? '\nNINTCODE.md:\n' + nintcodeMd.slice(0, 4000) : '';
  if (mode === 'ask') return `${projectHint}${at}${rules}\n${history}\nUser: ${user}\nAnswer concisely with code references. No tool calls.`;
  if (mode === 'plan') return `${projectHint}${at}${rules}\n${history}\nUser: ${user}\nReturn a step-by-step plan only. No tool calls, no file changes.`;
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
