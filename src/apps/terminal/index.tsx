import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import type { BuiltinAppDefinition, BuiltinAppProps } from '../contracts';
import { executeTerminalCommand } from './commands';
import styles from './Terminal.module.css';
import UniversalShell from './UniversalShell';
import { staticSite, desktopDownload } from '../../site-mode';
import ui from './UniversalShell.module.css';

export { executeTerminalCommand } from './commands';

interface Entry { id: number; command: string; output: string; ok: boolean }

function restoreHistory(host: BuiltinAppProps['host']): string[] {
  try {
    const raw = host.loadState();
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.history)) {
      return raw.history.filter((value): value is string => typeof value === 'string' && value.length <= 512).slice(-50);
    }
  } catch { /* A command prompt remains available if saved state cannot be loaded. */ }
  return [];
}

function WorkspaceTerminal({ workspace, host, active }: BuiltinAppProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [history, setHistory] = useState(() => restoreHistory(host));
  const [draft, setDraft] = useState('');
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [savedDraft, setSavedDraft] = useState('');
  const [storageError, setStorageError] = useState('');
  const output = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const counter = useRef(0);
  const inputId = useId();

  useEffect(() => {
    if (active && output.current) output.current.scrollTop = output.current.scrollHeight;
  }, [entries, active]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const command = draft.trim();
    if (!command) return;
    const nextHistory = (history.at(-1) === command ? history : [...history, command]).slice(-50);
    setHistory(nextHistory);
    setHistoryIndex(null);
    setDraft('');
    try {
      const saved = host.loadState();
      const retained = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
      host.saveState({ ...retained, history: nextHistory }); setStorageError('');
    }
    catch { setStorageError('历史未保存；命令台仍可使用。'); }
    let result;
    try {
      result = executeTerminalCommand(command, { workspace, apps: host.listApps() });
      switch (result.effect?.type) {
        case 'clear': setEntries([]); input.current?.focus(); return;
        case 'open-app': host.openApp(result.effect.appId); result.output = `已请求打开 ${result.effect.appId}`; break;
        case 'export-text': host.exportText(result.effect.filename, result.effect.content); result.output = `已请求下载 ${result.effect.filename}（${result.effect.content.length} 字符）`; break;
      }
    } catch (error) {
      result = { ok: false, output: `宿主操作失败：${error instanceof Error ? error.message : '请稍后重试。'}` };
    }
    setEntries(current => [...current, { id: ++counter.current, command, output: result.output, ok: result.ok }].slice(-60));
  }

  function navigateHistory(event: KeyboardEvent<HTMLInputElement>) {
    if (event.ctrlKey && event.key.toLowerCase() === 'l') { event.preventDefault(); setEntries([]); return; }
    if (event.key === 'ArrowUp' && history.length) {
      event.preventDefault();
      if (historyIndex === null) setSavedDraft(draft);
      const next = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(next); setDraft(history[next]);
    } else if (event.key === 'ArrowDown' && historyIndex !== null) {
      event.preventDefault();
      const next = historyIndex + 1;
      setHistoryIndex(next >= history.length ? null : next);
      setDraft(next >= history.length ? savedDraft : history[next]);
    }
  }

  return <section className={styles.terminal} aria-label="JevOS 工作区终端">
    <header className={styles.header}><span className={styles.light} /><strong>WORKSPACE SHELL</strong><span className={styles.version}>v1.0 · local</span></header>
    <div className={styles.output} ref={output} role="log" aria-label="命令输出" aria-live="polite" aria-relevant="additions">
      <div className={styles.welcome}><span className={styles.wordmark}>JEV<span>OS</span></span><p>你的工作区，换一种入口。</p><p className={styles.muted}>读取真实笔记与待办 · 打开注册应用 · 本机计算</p><p className={styles.muted}>输入 <code>help</code> 开始。这里不执行系统 shell。</p></div>
      {entries.map(entry => <div className={styles.entry} key={entry.id}><div className={styles.command}><span>jev@workspace</span><span className={styles.path}>~</span><b>›</b><span>{entry.command}</span></div>{entry.output !== '' && <pre className={entry.ok ? styles.result : styles.error}>{entry.output}</pre>}</div>)}
    </div>
    <form className={styles.prompt} onSubmit={submit}><label htmlFor={inputId}><span>jev</span><b>›</b><span className={styles.srOnly}>工作区命令</span></label><input id={inputId} aria-label="工作区命令" ref={input} value={draft} maxLength={512} autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="help" onChange={event => { setDraft(event.target.value); setHistoryIndex(null); }} onKeyDown={navigateHistory} /><button type="submit" aria-label="执行命令">↵</button></form>
    <footer className={styles.footer}><span>{storageError || '/workspace · ↑↓ 历史 · Ctrl+L 清屏'}</span><span>LOCAL ONLY</span></footer>
  </section>;
}

export default function Terminal(props: BuiltinAppProps) {
  const [mode, setMode] = useState<'simulation' | 'workspace'>(staticSite ? 'workspace' : 'simulation');
  const owner = `${props.workspaceId || 'local'}:${props.instanceId}`;
  return <div className={ui.container}>
    <nav className={ui.switcher} aria-label="终端模式">
      {staticSite ? <a href={desktopDownload}>打开完整桌面 ↗</a> : <button type="button" aria-pressed={mode === 'simulation'} onClick={() => setMode('simulation')}>万能 shell</button>}
      <button type="button" aria-pressed={mode === 'workspace'} onClick={() => setMode('workspace')}>工作区命令</button>
    </nav>
    {mode === 'simulation' ? <UniversalShell key={owner} {...props} /> : <WorkspaceTerminal key={owner} {...props} />}
  </div>;
}

export const definition: BuiltinAppDefinition = {
  id: 'terminal', title: 'Terminal', icon: '>_', accent: '#68e5a2', width: 620, height: 450, Component: Terminal,
};
