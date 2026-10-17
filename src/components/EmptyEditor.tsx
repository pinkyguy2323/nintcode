import { FolderOpen, Bot, Sparkles } from 'lucide-react';

export default function EmptyEditor({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="grid h-full place-items-center">
      <div className="text-center">
        <div className="relative mx-auto h-20 w-20">
          <div className="blob left-0 top-0 h-16 w-16 bg-nint-violet/60" />
          <div className="blob bottom-0 right-0 h-16 w-16 bg-nint-blue/50" style={{ animationDelay: '-4s' }} />
          <div className="relative grid h-20 w-20 place-items-center rounded-3xl border border-white/10 bg-graphite-900/80 text-3xl font-black text-white shadow-glow">N</div>
        </div>
        <h2 className="mt-5 text-lg font-bold tracking-tight">NintCode</h2>
        <p className="mt-1 text-xs text-slate-500">Free local AI coding workspace</p>
        <div className="mt-6 flex justify-center gap-2">
          <button className="btn-primary" onClick={onOpen}><FolderOpen size={14} /> Open folder</button>
        </div>
        <div className="mt-8 grid grid-cols-3 gap-3 text-left">
          {[
            { icon: Bot, title: 'AI Agent', text: 'Describe it — the agent creates and edits real files.' },
            { icon: Sparkles, title: '@files', text: 'Pin files into chat with @path/to/file.' },
            { icon: FolderOpen, title: 'Local & free', text: 'Models run on your GPU. No subscriptions.' },
          ].map((f) => (
            <div key={f.title} className="card w-44 p-3">
              <f.icon size={15} className="text-nint-blue" />
              <p className="mt-1.5 text-xs font-semibold">{f.title}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{f.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
