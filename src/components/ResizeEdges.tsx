import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '../lib/tauri';

type ResizeDir = 'East' | 'North' | 'NorthEast' | 'NorthWest' | 'South' | 'SouthEast' | 'SouthWest' | 'West';

function makeResize(dir: ResizeDir) {
  return (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isTauri()) return;
    getCurrentWindow().startResizeDragging(dir).catch(() => {});
  };
}

export default function ResizeEdges() {
  const base = 'fixed z-40';
  return (
    <>
      <div className={`${base} left-0 w-1 cursor-w-resize`} style={{ top: 44, bottom: 8 }} onMouseDown={makeResize('West')} />
      <div className={`${base} right-0 w-1 cursor-e-resize`} style={{ top: 44, bottom: 8 }} onMouseDown={makeResize('East')} />
      <div className={`${base} bottom-0 h-1 cursor-s-resize`} style={{ left: 8, right: 8 }} onMouseDown={makeResize('South')} />
      <div className={`${base} bottom-0 left-0 h-2 w-2 cursor-sw-resize`} onMouseDown={makeResize('SouthWest')} />
      <div className={`${base} bottom-0 right-0 h-2 w-2 cursor-se-resize`} onMouseDown={makeResize('SouthEast')} />
    </>
  );
}
