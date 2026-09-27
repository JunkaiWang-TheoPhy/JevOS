import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import type { AppJson, BuiltinAppProps } from '../contracts';
import { checkedAppState } from '../instance-state';
import { initialTerminalState, parseTerminalInput, terminalPrompt, classifyTerminalInput } from '../../../server/terminal-input.mjs';
import { parseDemoCommand } from './demo-commands';
import styles from './Terminal.module.css';
import ui from './UniversalShell.module.css';

type Snapshot = Record<string, AppJson> & { cwd: string; mode: 'shell' | 'assistant' };
interface Turn { id: number; command: string; output: string }
function savedSession(host: BuiltinAppProps['host']) {
  try {
    const saved = host.loadState();
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      const session = saved.simulation;
      if (session && typeof session === 'object' && !Array.isArray(session)) {
        const state = session.state;
        if (state && typeof state === 'object' && !Array.isArray(state) && typeof state.cwd === 'string' && state.cwd.startsWith('/') && ['shell', 'assistant'].includes(String(state.mode))) {
          const entries = Array.isArray(session.entries) ? session.entries.filter((entry): entry is Record<string, AppJson> & Turn => Boolean(entry && typeof entry === 'object' && !Array.isArray(entry) && typeof entry.id === 'number' && typeof entry.command === 'string' && typeof entry.output === 'string')).slice(-30) : [];
          return { state: state as Snapshot, entries };
        }
      }
    }
  } catch { /* Start a fresh virtual environment if saved simulation is corrupt. */ }
  return { state: initialTerminalState() as Snapshot, entries: [] as Turn[] };
}

export default function UniversalShell({ host, active }: BuiltinAppProps) {
  const [session, setSession] = useState(() => savedSession(host));
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const historyPosition = useRef<number | null>(null);
  const historyDraft = useRef('');
  const controller = useRef<AbortController | null>(null);
  const localPending = useRef(false);
  const disposed = useRef(false);
  const sequence = useRef(Math.max(0, ...session.entries.map(entry => entry.id)));
  const output = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const detected = classifyTerminalInput(parseTerminalInput(draft).command);
  const routeLabels = { python: 'Python', java: 'Java', cpp: 'C++', shell: 'Shell', natural: '自然语言' };
  const routeLabel = draft.trim() ? parseDemoCommand(draft, host.listApps()) ? '本地动作' : routeLabels[detected.language] : '自动识别';
  useEffect(() => { disposed.current = false; return () => { disposed.current = true; controller.current?.abort(); }; }, []);
  useEffect(() => { if (active && output.current) output.current.scrollTop = output.current.scrollHeight; }, [session, busy, active]);

  function commitSession(next: { state: Snapshot; entries: Turn[] }) {
    const { state, entries } = next;
    const stored = { state, entries: [...entries] };
    const bytes = () => new TextEncoder().encode(JSON.stringify(stored.entries)).length;
    while (stored.entries.length > 1 && bytes() > 16000) stored.entries.shift();
    if (bytes() > 16000) {
      const last = stored.entries[0];
      stored.entries[0] = { ...last, command: last.command.slice(0, 256), output: '（保存记录已截短）\n' + last.output.slice(-1800) };
    }
    setSession(next);
    try {
      const old = host.loadState();
      const retained = old && typeof old === 'object' && !Array.isArray(old) ? old : {};
      host.saveState({ ...retained, simulation: checkedAppState(stored) });
      setNotice('');
    } catch { setNotice('会话未保存；本次会话仍可继续。'); }
  }
  function append(state: Snapshot, command: string, text: string) {
    commitSession({ state, entries: [...session.entries, { id: ++sequence.current, command, output: text }].slice(-30) });
  }
  function clearScreen() {
    controller.current?.abort(); controller.current = null;
    setBusy(false); setNotice('');
    commitSession({ state: session.state, entries: [] });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (controller.current || localPending.current) return;
    const raw = draft;
    const parsed = parseTerminalInput(raw);
    setDraft(''); historyPosition.current = null;
    if (raw.trim()) setHistory(current => [...current, raw].slice(-50));
    if (!raw.trim()) { append(session.state, '', session.state.mode === 'shell' ? terminalPrompt(session.state.cwd) + '\n' : ''); return; }
    const local = parseDemoCommand(raw, host.listApps());
    if (local) {
      if (!local.ok) { append(session.state, raw, `本地命令失败：${local.output}`); return; }
      if (local.effect?.type === 'clear') { clearScreen(); return; }
      localPending.current = true; setBusy(true); setNotice('');
      try {
        let text = local.output;
        if (local.effect?.type === 'app-action') {
          if (!host.runAction) throw new Error('应用动作接口尚未接入。');
          text = await host.runAction(local.effect.appId, local.effect.action, local.effect.args ?? {});
        } else if (local.effect) {
          if (!host.executeDesktopCommand) throw new Error('桌面命令接口尚未接入。');
          text = await host.executeDesktopCommand(local.effect);
        }
        if (!disposed.current) append(session.state, raw, `本地执行：${text}`);
      } catch (error) {
        if (!disposed.current) append(session.state, raw, `本地命令失败：${error instanceof Error ? error.message : '操作未完成。'}`);
      } finally { localPending.current = false; if (!disposed.current) setBusy(false); }
      return;
    }
    const request = new AbortController(); controller.current = request;
    setBusy(true); setNotice('');
    try {
      const response = await fetch('/api/terminal/simulate', { method: 'POST', credentials: 'same-origin', signal: request.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command: raw, state: session.state }) });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : '服务暂未完成。');
      if (body.simulated !== true || typeof body.output !== 'string' || body.output.length > 13000 ||
          !body.state || typeof body.state.cwd !== 'string' || !['shell', 'assistant'].includes(body.state.mode)) throw new Error('响应无效，会话未改变。');
      if (!request.signal.aborted && controller.current === request) append(checkedAppState(body.state) as Snapshot, parsed.command, body.output);
    } catch (error) {
      if (controller.current === request) {
        setDraft(raw);
        setNotice(request.signal.aborted ? '已取消，会话保持原样。' : error instanceof Error ? error.message : '服务暂未完成，会话未改变。');
      }
    } finally { if (controller.current === request) { controller.current = null; setBusy(false); } }
  }
  function navigate(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); return; }
    if (draft.includes('\n') && ['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    if (event.ctrlKey && event.key.toLowerCase() === 'l') { event.preventDefault(); clearScreen(); return; }
    if (event.key === 'ArrowUp' && history.length) {
      event.preventDefault(); if (historyPosition.current === null) historyDraft.current = draft;
      historyPosition.current = historyPosition.current === null ? history.length - 1 : Math.max(0, historyPosition.current - 1);
      setDraft(history[historyPosition.current]);
    } else if (event.key === 'ArrowDown' && historyPosition.current !== null) {
      event.preventDefault(); historyPosition.current++;
      if (historyPosition.current >= history.length) { historyPosition.current = null; setDraft(historyDraft.current); }
      else setDraft(history[historyPosition.current]);
    }
  }
  return <section className={styles.terminal} aria-label="DeepSeek 万能终端">
    <header className={styles.header}><span className={styles.light} /><strong>{session.state.mode === 'shell' ? 'UNIVERSAL SHELL' : 'AI ASSISTANT'}</strong><span className={styles.version} aria-label="输入路由">DeepSeek · {routeLabel}</span></header>
    <div className={styles.output} ref={output} role="log" aria-label="终端输出" aria-live="polite">
      {!session.entries.length && session.state.mode === 'shell' && <pre className={styles.result}>{terminalPrompt(session.state.cwd)}</pre>}
      {session.entries.map(entry => <div className={styles.entry} key={entry.id}>{entry.command && <div className={ui.echo}>{entry.command}</div>}<pre className={styles.result}>{entry.output}</pre></div>)}
    </div>
    {notice && <div className={ui.notice} role="status">{notice}</div>}
    <form className={styles.prompt} onSubmit={event => { void submit(event); }}><label htmlFor={inputId}><span>{session.state.mode === 'shell' ? '#' : 'AI'}</span><span className={styles.srOnly}>{session.state.mode === 'shell' ? '命令' : '助手消息'}</span></label><textarea className={ui.editor} rows={2} id={inputId} aria-label={session.state.mode === 'shell' ? '命令' : '助手消息'} value={draft} disabled={busy} maxLength={2000} spellCheck={false} autoComplete="off" placeholder="命令、Python / Java / C++ 代码或自然语言；Shift+Enter 换行" onChange={event => { setDraft(event.target.value); historyPosition.current = null; }} onKeyDown={navigate} /><button type="submit" disabled={busy} aria-label="运行命令">↵</button>{busy && <button type="button" onClick={() => controller.current?.abort()}>取消</button>}</form>
    <footer className={styles.footer}><span>{busy ? localPending.current ? '本地动作执行中…' : '处理中…' : `${session.state.cwd} · ↑↓ 历史 · Ctrl+L 清屏`}</span><span>JevOS</span></footer>
  </section>;
}
