import { useState } from 'react';
import { Plug, Plus, Trash2, FlaskConical, ListPlus, Check } from 'lucide-react';
import { useStore } from '../store';
import { testProvider, fetchProviderModels } from '../lib/tauri';
import type { Provider } from '../types';

export default function Providers() {
  const { providers, setProviders, setActiveProviderId, activeProviderId, settings, setActiveLocalModel } = useStore();
  const [form, setForm] = useState({ name: 'My server', baseUrl: 'http://127.0.0.1:11434/v1', apiKey: '', modelId: 'qwen2.5-coder:7b' });
  const [msg, setMsg] = useState('');
  const [fetched, setFetched] = useState<string[]>([]);
  const [fetchedFor, setFetchedFor] = useState('');

  const add = () => {
    const p: Provider = { id: 'p' + Date.now().toString(36), name: form.name, baseUrl: form.baseUrl.replace(/\/$/, ''), apiKey: form.apiKey, modelId: form.modelId, kind: form.baseUrl.includes('11434') ? 'ollama' : 'openai' };
    setProviders((v) => [...v, p]);
    setForm({ name: '', baseUrl: '', apiKey: '', modelId: '' });
    setMsg('Saved. Use “Use Model” to activate in chat.');
  };

  const test = async (p: Provider) => {
    setMsg('Testing ' + p.baseUrl + ' …');
    try { setMsg(await testProvider(p)); }
    catch (e) { setMsg('❌ ' + String((e as Error).message ?? e).slice(0, 300)); }
  };

  const fetchModels = async (p: Provider) => {
    setMsg('Fetching models…');
    setFetchedFor(p.id);
    try {
      const list = await fetchProviderModels(p);
      setFetched(list);
      setMsg(list.length ? `Found ${list.length} models — click one below to set it for “${p.name}”.` : 'No models returned — check the API key.');
    } catch (e) { setFetched([]); setMsg('❌ ' + String((e as Error).message ?? e).slice(0, 400)); }
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-4">
      <div className="flex items-center gap-2">
        <Plug size={16} className="text-nint-blue" />
        <h2 className="font-semibold">AI Providers</h2>
      </div>
      <p className="text-xs text-slate-400">
        Local-first and free. External APIs are optional — <b className="text-amber-300">providers may charge you</b>, keys stay in your OS secure store (Tauri Store, never in logs).
        {settings.lang === 'ru' ? ' Для Ollama: Base URL http://127.0.0.1:11434/v1. Для LM Studio: http://127.0.0.1:1234/v1. Для llama-server: http://127.0.0.1:8080/v1.' : ''}
      </p>

      <div className="panel-rounded glass grid gap-2 p-3.5 md:grid-cols-2">
        <label className="text-xs">Provider Name<input className="input mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="text-xs">Base URL<input className="input mt-1 code-font" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="http://127.0.0.1:11434/v1" /></label>
        <label className="text-xs">API Key (if needed)<input className="input mt-1 code-font" type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="sk-…" /></label>
        <label className="text-xs">Model ID<input className="input mt-1 code-font" value={form.modelId} onChange={(e) => setForm({ ...form, modelId: e.target.value })} placeholder="qwen2.5-coder:7b" /></label>
        <div className="flex items-center gap-2 md:col-span-2">
          <button className="btn-primary text-xs" onClick={add}><Plus size={13} />Save</button>
          {msg && <span className="code-font text-[11px] text-slate-400">{msg}</span>}
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {providers.map((p) => (
          <div key={p.id} className={`panel-rounded glass p-3 ${activeProviderId === p.id ? 'border-nint-violet/50' : ''}`}>
            <div className="flex items-center gap-2">
              <b className="text-sm">{p.name}</b>
              {activeProviderId === p.id && <span className="chip border-emerald-400/30 bg-emerald-400/10 text-emerald-300 text-[10px]">active</span>}
              <button className="ml-auto rounded p-1 text-slate-500 hover:bg-white/10 hover:text-red-300" onClick={() => setProviders((v) => v.filter((x) => x.id !== p.id))}><Trash2 size={13} /></button>
            </div>
            <p className="code-font mt-1 truncate text-[11px] text-slate-500">{p.baseUrl} · {p.modelId}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button className="btn-ghost !py-1 text-xs" onClick={() => void test(p)}><FlaskConical size={12} />Test</button>
              <button className="btn-ghost !py-1 text-xs" onClick={() => void fetchModels(p)}><ListPlus size={12} />Fetch</button>
              <button className="btn-primary !py-1 text-xs" onClick={() => { setActiveProviderId(p.id); setActiveLocalModel(null); setMsg('Now chatting with ' + p.modelId); }}><Check size={12} />Use Model</button>
            </div>
            {fetchedFor === p.id && fetched.length > 0 && (
              <div className="mt-1.5 flex max-h-40 flex-wrap gap-1 overflow-auto">
                {fetched.slice(0, 40).map((m) => (
                  <button key={m} title={m}
                    className={`chip max-w-full truncate ${p.modelId === m ? 'border-nint-violet/60 bg-nint-violet/10 text-nint-violet' : 'border-white/10 bg-white/5 hover:border-nint-violet/50'}`}
                    onClick={() => { setProviders((v) => v.map((x) => (x.id === p.id ? { ...x, modelId: m } : x))); setMsg('Model set for “' + p.name + '”: ' + m + ' — click Use Model to activate.'); }}>
                    {m}
                  </button>
                ))}
                {fetched.length > 40 && <span className="self-center text-[10px] text-slate-500">+{fetched.length - 40} more</span>}
              </div>
            )}
          </div>
        ))}
        {providers.length === 0 && <p className="text-xs text-slate-500">No providers yet. Add Ollama / LM Studio / any OpenAI-compatible server above.</p>}
      </div>
    </div>
  );
}
