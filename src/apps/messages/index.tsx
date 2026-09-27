import { useEffect, useRef, useState } from 'react';
import type { BuiltinAppProps, BuiltinAppDefinition } from '../contracts';
import { localReply, makeMessage, normalizeConversation } from './model';
import type { Conversation } from './model';
import { generatedContentEvent, readGeneratedContent } from './context';
import styles from './Messages.module.css';
import { musicForMessage } from './music-action';
import { staticSite } from '../../site-mode.ts';

export default function Messages({ host, workspace, workspaceId, active }: BuiltinAppProps & { workspaceId?: string | null }) {
  const [state, setState] = useState(() => normalizeConversation(host.loadState()));
  const stateRef = useRef(state); const hostRef = useRef(host); hostRef.current = host;
  const request = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [musicNotice, setMusicNotice] = useState(''); const [musicRetry, setMusicRetry] = useState(false);
  const retry = useRef<{ text: string; kind: 'reply' | 'incoming' } | null>(null);
  const thread = useRef<HTMLDivElement>(null);
  const lastMessageId = state.messages.at(-1)?.id;
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => {
      const panel = thread.current; const latest = panel?.querySelector<HTMLElement>('article:last-of-type');
      if (panel) panel.scrollTop = latest ? Math.max(0, latest.offsetTop - 12) : panel.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [lastMessageId, busy, active]);
  const appsKey = JSON.stringify(host.listApps().filter(app => app.id.startsWith('generated:')).map(app => [app.id, app.title]));
  function startMusic(text: string) {
    setMusicNotice(''); setMusicRetry(false);
    void musicForMessage(text, 'user-send', host.runAction?.bind(host)).then(result => {
      if (hostRef.current === host && result !== null) setMusicNotice(result);
    }).catch(() => { if (hostRef.current === host) { setMusicNotice('音乐未启动，请点击播放。'); setMusicRetry(true); } });
  }
  function commit(next: Conversation) {
    const bounded = normalizeConversation(next);
    try { host.saveState({ messages: bounded.messages.map(m => ({ ...m })), draft: bounded.draft, seenContext: bounded.seenContext }); }
    catch { setError('对话暂未保存，本次内容仍留在窗口中。'); }
    stateRef.current = bounded; setState(bounded);
  }
  useEffect(() => {
    request.current?.abort(); setBusy(false); setError(''); setMusicNotice(''); setMusicRetry(false);
    const saved = normalizeConversation(host.loadState()); stateRef.current = saved; setState(saved);
    const refresh = () => {
      if (!workspaceId) return;
      const context = readGeneratedContent(workspaceId);
      if (!context) {
        const savedApp = host.listApps().filter(app => app.id.startsWith('generated:')).at(-1);
        const marker = savedApp ? `saved:${savedApp.id}` : '';
        if (savedApp && marker !== stateRef.current.seenContext) commit({ ...stateRef.current, seenContext: marker, messages: [...stateRef.current.messages,
          makeMessage(`你的工作区已保存「${savedApp.title}」。可以在这里讨论它的用途和下一步改进。`, 'generated-context')] });
        return;
      }
      if (context.id === stateRef.current.seenContext) return;
      commit({ ...stateRef.current, seenContext: context.id, messages: [...stateRef.current.messages,
        makeMessage(`你刚生成了「${context.title}」。你的需求是：${context.prompt || '未附描述'}。我们可以围绕这个新内容继续讨论。`, 'generated-context')] });
    };
    const event = (e: Event) => { if ((e as CustomEvent).detail?.workspaceId === workspaceId) refresh(); };
    refresh(); window.addEventListener(generatedContentEvent, event);
    return () => { request.current?.abort(); window.removeEventListener(generatedContentEvent, event); };
  }, [host, workspaceId, appsKey]);
  async function simulate(text: string, kind: 'reply' | 'incoming', appendUser = false) {
    if (busy || !text.trim()) return;
    const capturedHost = host; const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(''); retry.current = { text, kind };
    if (appendUser) {
      commit({ ...stateRef.current, draft: '', messages: [...stateRef.current.messages, makeMessage(text, 'user')] });
      startMusic(text);
    }
    try {
      const titles = host.listApps().filter(app => app.id.startsWith('generated:')).map(app => app.title);
      let body: string; let source: 'model-sim' | 'local-sim';
      if (staticSite || !navigator.onLine) { body = localReply(text, titles, workspace.note); source = 'local-sim'; }
      else {
        const context = workspaceId ? readGeneratedContent(workspaceId) : null;
        const response = await fetch('/api/messages/simulate', { method: 'POST', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, kind, generatedContext: context ? { title: context.title, prompt: context.prompt } : null }) });
        const result = await response.json().catch(() => { throw new Error('回复暂时不可用，请稍后重试。'); });
        if (!response.ok) throw new Error(result.message || '回复暂未生成，请重试。');
        if (result.simulated !== true || typeof result.text !== 'string' || !['model-sim', 'local-sim'].includes(result.source)) throw new Error('回复格式无效。');
        body = result.text; source = result.source;
      }
      if (controller.signal.aborted || request.current !== controller || hostRef.current !== capturedHost) return;
      commit({ ...stateRef.current, messages: [...stateRef.current.messages, makeMessage(body, source)] }); retry.current = null;
    } catch (problem) {
      if (!controller.signal.aborted && request.current === controller && hostRef.current === capturedHost) setError(problem instanceof Error ? problem.message : '回复失败，已有对话保留。');
    } finally { if (request.current === controller) { request.current = null; setBusy(false); } }
  }
  return <section className={`mail-app ${styles.messages}`} aria-label="消息对话">
    <header className={styles.header}><h2>消息</h2><span>围绕当前工作内容的对话</span><button disabled={busy} onClick={() => void simulate('根据当前笔记和最近生成的 App，写一条新来信。', 'incoming')}>生成来信</button></header>
    <div ref={thread} className={styles.thread} role="log" aria-label="对话记录" aria-live="polite">
      {!state.messages.length && <p className={styles.empty}>这里会出现与你当前内容有关的消息。生成新 App 后会更新来信，也可以在下面写一条消息。</p>}
      {state.messages.map(m => <article className={`${styles.bubble} ${m.source === 'user' ? styles.user : ''}`} key={m.id}><small>{m.source === 'user' ? '你' : m.source === 'generated-context' ? 'JevOS' : 'Alice'}<time>{new Date(m.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time></small><p>{m.body}</p></article>)}
      {busy && <p role="status">正在生成消息…</p>}
    </div>
    {error && <div className={styles.error} role="alert">{error}{retry.current && <button disabled={busy} onClick={() => { if (retry.current) void simulate(retry.current.text, retry.current.kind); }}>重试回复</button>}</div>}
    {musicNotice && musicRetry && <div className={styles.error} role="status">{musicNotice}<button type="button" onClick={() => startMusic('累')}>播放音乐</button></div>}
    <form className={styles.composer} onSubmit={e => { e.preventDefault(); void simulate(stateRef.current.draft.trim(), 'reply', true); }}><label htmlFor="sim-message-draft">消息内容</label><textarea id="sim-message-draft" maxLength={2000} value={state.draft} placeholder="例如：我刚做了一个番茄钟，下一步该完善什么？" onChange={e => commit({ ...stateRef.current, draft: e.target.value })} /><button type="submit" disabled={busy || !state.draft.trim()}>发送消息</button></form>
  </section>;
}
export const definition: BuiltinAppDefinition = { id: 'message', title: '消息', icon: '✉', accent: '#168afa', width: 560, height: 500, Component: Messages };
