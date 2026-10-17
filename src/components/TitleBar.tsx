import { getCurrentWindow } from '@tauri-apps/api/window';
import { useStore } from '../store';
import { isTauri } from '../lib/tauri';

export default function TitleBar() {
  const { projectPath, activeTab } = useStore();

  const startDrag = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest('button, input, select, a')) return;
    if (!isTauri()) return;
    getCurrentWindow().startDragging().catch(() => {});
  };

  const toggleMax = () => {
    if (!isTauri()) return;
    getCurrentWindow().toggleMaximize().catch(() => {});
  };

  const minimize = () => {
    if (!isTauri()) return;
    getCurrentWindow().minimize().catch(() => {});
  };

  const close = () => {
    if (!isTauri()) return;
    getCurrentWindow().close().catch(() => {});
  };

  const projectName = projectPath ? projectPath.split(/[/\\]/).filter(Boolean).pop() : null;
  const fileName = activeTab ? activeTab.split(/[/\\]/).pop() : null;

  return (
    <header
      className="titlebar relative z-20 flex h-11 shrink-0 cursor-default items-center gap-3 pl-3 select-none"
      style={{ background: 'rgba(11,13,19,.9)' }}
      data-tauri-drag-region
      onMouseDown={startDrag}
      onDoubleClick={toggleMax}
    >
      <div className="flex items-center gap-2.5" data-tauri-drag-region>
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-nint-violet to-nint-blue text-[13px] font-black text-white shadow-glow" data-tauri-drag-region>N</div>
        <span className="text-[13px] font-semibold tracking-tight" data-tauri-drag-region>NintCode</span>
      </div>

      <div className="mx-auto flex min-w-0 items-center gap-1.5 text-[11.5px] text-slate-500" data-tauri-drag-region>
        {projectName ? (
          <>
            <span className="truncate font-medium text-slate-400" data-tauri-drag-region>{projectName}</span>
            {fileName && <><span className="text-slate-600" data-tauri-drag-region>/</span><span className="truncate text-slate-300" data-tauri-drag-region>{fileName}</span></>}
          </>
        ) : (
          <span className="chip border-nint-violet/30 bg-nint-violet/10 text-nint-violet">free · local-first · no subscription</span>
        )}
      </div>

      <div className="flex items-center">
        <button className="grid h-8 w-11 place-items-center text-slate-400 transition-colors hover:bg-white/10 hover:text-white" title="Minimize" onClick={minimize}>
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 5h8" stroke="currentColor" strokeWidth="1.2" /></svg>
        </button>
        <button className="grid h-8 w-11 place-items-center text-slate-400 transition-colors hover:bg-white/10 hover:text-white" title="Maximize" onClick={toggleMax}>
          <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1.2" y="1.2" width="7.6" height="7.6" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
        </button>
        <button className="grid h-8 w-11 place-items-center text-slate-400 transition-colors hover:bg-red-500/80 hover:text-white" title="Close" onClick={close}>
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.2" /></svg>
        </button>
      </div>
    </header>
  );
}
