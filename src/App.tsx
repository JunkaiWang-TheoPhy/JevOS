import { useEffect, useRef, useState } from 'react';
import type { SetStateAction } from 'react';
import Desktop from './Desktop';
import ModelConfigNotice from './apps/ModelConfigNotice';
import { WorkspaceContext } from './components';
import { hydrate, initialWorkspace } from './workspace';
import type { Decision, Mode, Workspace } from './workspace';
import { createWorkspaceClient, WorkspaceClientError } from './persistence';
import type { ActionKind, DecisionProposal, WorkspaceSnapshot } from './persistence';
import { usePwa } from './pwa';
import './styles.css';
import { staticSite } from './site-mode';
import { createLocalWorkspaceClient } from './site/local-workspace';

const STORAGE = 'vibeos-workspace-v2';
const OWNER_COOKIE = 'vibeos-cache-owner';
const fields = ['mode', 'note', 'pinned', 'meeting', 'tasks'] as const;
type Field = typeof fields[number];
type DataStatus = 'loading' | 'dirty' | 'synced' | 'unavailable';
interface DraftCache {
  workspaceId: string; state: Workspace; dirty: Field[]; history: Mode[];
  committed: WorkspaceSnapshot | null; bases: Partial<Workspace>; conflict: boolean;
}
const labels: Record<Mode, string> = { read: '阅读消息', meeting: '准备会议', review: '异步评审', notes: '整理笔记' };
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

function readCache(): DraftCache | null {
  try {
    const cache = JSON.parse(localStorage.getItem(STORAGE) || 'null');
    if (!cache || typeof cache.workspaceId !== 'string' || !cache.state || !Array.isArray(cache.dirty)) return null;
    const state = hydrate(cache.state);
    if (typeof cache.state.meeting?.date === 'string') state.meeting.date = cache.state.meeting.date;
    if (typeof cache.state.meeting?.time === 'string') state.meeting.time = cache.state.meeting.time;
    const dirty: Field[] = cache.dirty.filter((key: unknown): key is Field => fields.includes(key as Field));
    const committed = cache.committed?.id === cache.workspaceId && Number.isSafeInteger(cache.committed.revision) && cache.committed.revision >= 0
      ? { ...cache.committed, state: hydrate(cache.committed.state) } as WorkspaceSnapshot : null;
    const bases: Partial<Workspace> = {};
    for (const key of dirty) {
      if (cache.bases && Object.hasOwn(cache.bases, key)) Object.assign(bases, { [key]: cache.bases[key] });
      else if (committed) Object.assign(bases, { [key]: committed.state[key] });
    }
    return { workspaceId: cache.workspaceId, state, dirty, committed, bases, conflict: cache.conflict === true,
      history: Array.isArray(cache.history) ? cache.history.filter((mode: Mode) => Object.hasOwn(labels, mode)).slice(-30) : [] };
  } catch { return null; }
}
function hasCacheOwner(cache: DraftCache | null) {
  return cache !== null && document.cookie.split(';').some((entry) => entry.trim() === `${OWNER_COOKIE}=${cache.workspaceId}`);
}
function validMeeting(meeting: Workspace['meeting']) {
  const date = new Date(`${meeting.date}T00:00:00Z`);
  return meeting.title.length <= 200 && /^\d{4}-\d{2}-\d{2}$/.test(meeting.date) && Number(meeting.date.slice(0, 4)) > 0 &&
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === meeting.date && /^([01]\d|2[0-3]):[0-5]\d$/.test(meeting.time);
}

export default function App() {
  const [cache] = useState(readCache);
  const [legacy, setLegacy] = useState<Workspace | null>(() => {
    try {
      const value = JSON.parse(localStorage.getItem('vibeos-workspace-v1') || 'null');
      return value && typeof value.note === 'string' ? hydrate(value) : null;
    } catch { return null; }
  });
  const offlineCache = !navigator.onLine && hasCacheOwner(cache) ? cache : null;
  const [state, setState] = useState<Workspace>(() => offlineCache?.state || initialWorkspace());
  const [text, setText] = useState('');
  const [status, setStatus] = useState('输入想做的事，工具会随任务组合。');
  const [decision, setDecision] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [history, setHistory] = useState<Mode[]>(() => offlineCache?.history || []);
  const [canUndo, setCanUndo] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [dataStatus, setDataStatus] = useState<DataStatus>(offlineCache ? 'dirty' : 'loading');
  const [draftHint, setDraftHint] = useState(offlineCache?.conflict ? '检测到数据冲突，请确认后保存本地修改。' : '');
  const client = useRef(staticSite ? createLocalWorkspaceClient() : createWorkspaceClient()).current;
  const stateRef = useRef(state);
  const owner = useRef<string | null>(offlineCache?.workspaceId || null);
  const initialized = useRef(false);
  const dirty = useRef(new Set<Field>(offlineCache?.dirty || []));
  const pageEdits = useRef(new Set<Field>());
  const conflictHold = useRef(offlineCache?.conflict || false);
  const committed = useRef<WorkspaceSnapshot | null>(offlineCache?.committed || null);
  const bases = useRef<Partial<Workspace>>(offlineCache?.bases || {});
  const sequence = useRef(0);
  const contextVersion = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const pending = useRef<{ proposal: DecisionProposal; version: number } | null>(null);
  const cooldown = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipAutomatic = useRef<string | null>(null);
  const flushing = useRef<Promise<boolean> | null>(null);
  const flushRef = useRef<() => Promise<boolean>>(async () => false);
  const reconnectCycle = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pwa = usePwa();

  function display(next: Workspace) { stateRef.current = next; setState(next); }
  function invalidate() {
    sequence.current++; contextVersion.current++;
    controller.current?.abort(); pending.current = null; setBusy(false);
  }
  function mergeServer(snapshot: WorkspaceSnapshot) {
    const local = stateRef.current;
    const conflicts = [...dirty.current].filter((key) => !same(local[key], snapshot.state[key]) &&
      (!Object.hasOwn(bases.current, key) || !same(bases.current[key], snapshot.state[key])));
    if (conflicts.length) {
      conflictHold.current = true;
      setDraftHint('检测到数据冲突：服务端已有其他修改。本地草稿已保留，确认后才会覆盖。');
    }
    committed.current = structuredClone(snapshot);
    const next = { ...snapshot.state };
    for (const key of dirty.current) Object.assign(next, { [key]: local[key] });
    if (fields.some((key) => !same(local[key], next[key]))) invalidate();
    display(next); setCanUndo(snapshot.canUndo);
  }
  function edit(update: SetStateAction<Workspace>) {
    const previous = stateRef.current;
    const next = typeof update === 'function' ? update(previous) : update;
    const changed = fields.filter((key) => !same(previous[key], next[key]));
    if (!changed.length) return;
    invalidate();
    for (const key of changed) {
      if (!dirty.current.has(key)) Object.assign(bases.current, { [key]: structuredClone(committed.current?.state[key] ?? previous[key]) });
      dirty.current.add(key); pageEdits.current.add(key);
    }
    display(next); setDataStatus('dirty');
    if (changed.includes('tasks')) queueMicrotask(() => { void flushRef.current(); });
  }
  async function reconnect(attempt = 0, cycle = ++reconnectCycle.current): Promise<void> {
    if (attempt === 0 && reconnectTimer.current) {
      clearTimeout(reconnectTimer.current); reconnectTimer.current = null;
    }
    try {
      const snapshot = await client.load();
      if (cycle !== reconnectCycle.current || !navigator.onLine) return;
      if (!initialized.current) {
        const next = { ...snapshot.state };
        const cachedFields = cache?.workspaceId === snapshot.id ? cache.dirty : [];
        for (const key of cachedFields) if (!pageEdits.current.has(key)) Object.assign(next, { [key]: cache!.state[key] });
        for (const key of cachedFields) if (!pageEdits.current.has(key) && Object.hasOwn(cache!.bases, key)) {
          Object.assign(bases.current, { [key]: cache!.bases[key] });
        }
        for (const key of pageEdits.current) Object.assign(next, { [key]: stateRef.current[key] });
        dirty.current = new Set([...cachedFields, ...pageEdits.current]);
        owner.current = snapshot.id;
        document.cookie = `${OWNER_COOKIE}=${snapshot.id}; Path=/; SameSite=Lax; Max-Age=604800${location.protocol === 'https:' ? '; Secure' : ''}`;
        if (cache?.workspaceId === snapshot.id && cache.conflict) conflictHold.current = true;
        initialized.current = true; display(next); mergeServer(snapshot);
      } else mergeServer(snapshot);
      setDataStatus(dirty.current.size ? 'dirty' : 'synced');
      await flushRef.current();
    } catch (error) {
      if (cycle !== reconnectCycle.current) return;
      setDataStatus('unavailable');
      // An online event can precede recovery of the service worker's network.
      // Retry only the read; action writes retain their explicit receipt handling.
      if (error instanceof WorkspaceClientError && error.code === 'NETWORK_ERROR' && navigator.onLine && attempt < 2) {
        reconnectTimer.current = setTimeout(() => {
          reconnectTimer.current = null;
          if (cycle === reconnectCycle.current && navigator.onLine) void reconnect(attempt + 1, cycle);
        }, 300 * (attempt + 1));
      }
    }
  }
  async function handleFailure(error: unknown) {
    setStatus(error instanceof Error ? error.message : '保存未完成，草稿仍在本地。');
    if (error instanceof WorkspaceClientError && error.statusCode === 409) {
      conflictHold.current = true;
      setDraftHint('检测到数据冲突，同步已暂停。本地草稿已保留，请确认后保存。');
      try { mergeServer(await client.load()); setDataStatus('dirty'); }
      catch { setDataStatus('unavailable'); }
      return;
    }
    setDataStatus('unavailable');
  }
  async function flush(): Promise<boolean> {
    if (flushing.current) return flushing.current;
    if (!initialized.current || !navigator.onLine || conflictHold.current) {
      if (dirty.current.size) setDataStatus('dirty');
      return false;
    }
    const run = async () => {
      while (dirty.current.size) {
        const captured = structuredClone(stateRef.current);
        const groups: { kind: ActionKind; args: Record<string, unknown>; keys: Field[] }[] = [];
        const draft: Record<string, unknown> = {}, draftKeys: Field[] = [];
        if (dirty.current.has('note') && captured.note.length <= 10000) { draft.note = captured.note; draftKeys.push('note'); }
        if (dirty.current.has('meeting') && validMeeting(captured.meeting)) { draft.meeting = captured.meeting; draftKeys.push('meeting'); }
        if (draftKeys.length) groups.push({ kind: 'save_draft', args: draft, keys: draftKeys });
        if (dirty.current.has('pinned')) groups.push({ kind: 'set_pin', args: { pinned: captured.pinned }, keys: ['pinned'] });
        if (dirty.current.has('mode')) groups.push({ kind: 'select_mode', args: { mode: captured.mode, source: 'manual' }, keys: ['mode'] });
        if (dirty.current.has('tasks')) groups.push({ kind: 'set_tasks', args: { tasks: captured.tasks }, keys: ['tasks'] });
        if (!groups.length) {
          setDraftHint('请补全有效日期、时间或缩短草稿；当前输入仍保留。'); setDataStatus('dirty'); return false;
        }
        for (const group of groups) {
          try {
            const result = await client.action(group.kind, group.args);
            for (const key of group.keys) if (same(result.workspace.state[key], captured[key])) {
              if (same(stateRef.current[key], captured[key])) {
                dirty.current.delete(key); pageEdits.current.delete(key); delete bases.current[key];
              } else Object.assign(bases.current, { [key]: captured[key] });
            }
            mergeServer(result.workspace);
            if (conflictHold.current) { setDataStatus('dirty'); return false; }
          } catch (error) { await handleFailure(error); return false; }
        }
      }
      setDraftHint(''); setDataStatus('synced'); return true;
    };
    flushing.current = run().finally(() => { flushing.current = null; });
    return flushing.current;
  }
  flushRef.current = flush;
  useEffect(() => {
    if (!owner.current) return;
    try { localStorage.setItem(STORAGE, JSON.stringify({ workspaceId: owner.current, state, dirty: [...dirty.current], history,
      committed: committed.current, bases: bases.current, conflict: conflictHold.current })); }
    catch { setStatus('离线缓存不可用，当前内容仍保留在页面中。'); }
  }, [state, history, dataStatus]);
  useEffect(() => { const timer = setTimeout(() => { void flushRef.current(); }, 600); return () => clearTimeout(timer); }, [state]);
  const reconnectRef = useRef(reconnect); reconnectRef.current = reconnect;
  useEffect(() => {
    let active = true;
    if (navigator.onLine) void reconnectRef.current();
    if (!staticSite) fetch('/api/health').then((response) => response.json()).then((health) => { if (active) setConfigured(health.configured === true); }).catch(() => {});
    const on = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void reconnectRef.current();
      else {
        reconnectCycle.current++;
        if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
        invalidate(); setDataStatus(dirty.current.size ? 'dirty' : 'unavailable');
      }
    };
    window.addEventListener('online', on); window.addEventListener('offline', on);
    return () => {
      active = false; reconnectCycle.current++;
      if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
      window.removeEventListener('online', on); window.removeEventListener('offline', on); controller.current?.abort();
    };
  }, []);

  async function compose(mode: Mode, source: 'manual' | 'automatic' = 'manual') {
    if (mode === stateRef.current.mode) return;
    setHistory((items) => [...items.slice(-29), stateRef.current.mode]);
    if (source === 'manual' || !navigator.onLine) {
      edit((current) => ({ ...current, mode })); await flushRef.current();
    } else {
      try { mergeServer((await client.action('select_mode', { mode, source })).workspace); }
      catch (error) { await handleFailure(error); }
    }
  }
  async function apply(proposal: DecisionProposal, explicit: boolean) {
    if (proposal.contextVersion !== contextVersion.current) return;
    if (stateRef.current.pinned) { setStatus('组合已固定。取消固定后可应用建议。'); return; }
    if (proposal.choice === 'stay') { setStatus(proposal.reason || '暂时保持当前工作区。'); return; }
    if (proposal.source === 'jev' && (proposal.confidence === null || proposal.confidence < .65)) {
      setStatus('这次建议不够确定，保持当前工作区。'); return;
    }
    if (!explicit && document.activeElement?.matches('.workspace-grid input, .workspace-grid textarea')) {
      pending.current = { proposal, version: contextVersion.current }; setStatus('建议已就绪，结束输入后再调整工具。'); return;
    }
    if (!explicit && Date.now() - cooldown.current < 1800) { setStatus('暂时保持当前组合，避免频繁切换。'); return; }
    await compose(proposal.choice, 'automatic'); cooldown.current = Date.now();
    if (stateRef.current.mode === proposal.choice) setStatus(proposal.reason || `已选择${labels[proposal.choice]}。`);
  }
  async function request(value: string, explicit: boolean) {
    const id = ++sequence.current, version = contextVersion.current;
    controller.current?.abort(); pending.current = null;
    if (!value.trim()) { setBusy(false); return; }
    if (!navigator.onLine) { setBusy(false); setStatus('当前离线，手动工具仍可使用。'); return; }
    const abort = new AbortController(); controller.current = abort; setBusy(true);
    try {
      if (!(await flushRef.current())) { if (id === sequence.current) setStatus('请先同步或补全草稿，手动工具仍可使用。'); return; }
      if (id !== sequence.current || version !== contextVersion.current || abort.signal.aborted) return;
      const proposal = await client.decision({ text: value, state: stateRef.current, requestId: crypto.randomUUID(), contextVersion: version }, abort.signal);
      if (id !== sequence.current || version !== contextVersion.current || abort.signal.aborted) return;
      setDecision(proposal); await apply(proposal, explicit);
    } catch (error) {
      if (id === sequence.current && !abort.signal.aborted) {
        if (error instanceof WorkspaceClientError && error.statusCode === 409) { try { mergeServer(await client.load()); } catch { setDataStatus('unavailable'); } }
        setStatus(`${error instanceof Error ? error.message : '请求失败'}，当前内容与组合保持不变。`);
      }
    } finally { if (id === sequence.current) setBusy(false); }
  }
  const requestRef = useRef(request); requestRef.current = request;
  useEffect(() => {
    if (skipAutomatic.current === text) { skipAutomatic.current = null; return; }
    const timer = setTimeout(() => { void requestRef.current(text, false); }, 400); debounceTimer.current = timer;
    return () => clearTimeout(timer);
  }, [text]);
  function submit(value: string) { if (debounceTimer.current) clearTimeout(debounceTimer.current); void request(value, true); }
  function manual(mode: Mode) { invalidate(); void compose(mode); setStatus(`手动选择${labels[mode]}。`); }
  async function undo() {
    invalidate();
    if (navigator.onLine && initialized.current) {
      if (!(await flushRef.current())) return;
      try {
        mergeServer((await client.action('undo_layout', {})).workspace);
        setHistory((items) => items.slice(0, -1));
        setStatus('已撤销组合变化，保留最新笔记与草稿。'); return;
      }
      catch (error) { await handleFailure(error); return; }
    }
    const previous = history.at(-1);
    if (previous) { setHistory((items) => items.slice(0, -1)); edit((current) => ({ ...current, mode: previous })); setStatus('已在本地撤销；联网后才能同步。'); }
  }
  async function confirmLocal() {
    if (!navigator.onLine || !initialized.current) return;
    try {
      if (flushing.current) await flushing.current;
      const snapshot = await client.load();
      mergeServer(snapshot);
      // Only this explicit confirmation may rebase pending fields onto newer server values.
      for (const key of dirty.current) Object.assign(bases.current, { [key]: structuredClone(snapshot.state[key]) });
      conflictHold.current = false; setDraftHint('');
      await flushRef.current();
    } catch (error) { await handleFailure(error); }
  }
  function importLegacy() {
    if (!legacy || !initialized.current) return;
    const current = stateRef.current;
    const oldMeeting = `旧版会议草稿：${legacy.meeting.title} · ${legacy.meeting.date} ${legacy.meeting.time}`;
    const imported = [legacy.note, oldMeeting].filter((part) => part && !current.note.includes(part));
    edit({ ...current, note: [current.note, ...imported].filter(Boolean).join('\n\n'),
      tasks: [...new Set([...current.tasks, ...legacy.tasks])] });
    setLegacy(null); setStatus('旧版记录已显式导入；原缓存保留，当前会议草稿保持不变。');
  }

  return <WorkspaceContext.Provider value={{ state, setState: edit }}>
    {!staticSite && <ModelConfigNotice />}
    <Desktop state={state} workspaceId={owner.current} workspaceRevision={committed.current?.revision ?? 0} text={text}
      onTextChange={(value) => { invalidate(); setText(value); }}
      onSubmit={submit}
      onSuggest={(value) => { invalidate(); if (value !== text) skipAutomatic.current = value; setText(value); submit(value); }}
      onManual={(mode) => { if (debounceTimer.current) clearTimeout(debounceTimer.current); manual(mode); }} onUserAction={() => { if (debounceTimer.current) clearTimeout(debounceTimer.current); invalidate(); }} onUndo={() => void undo()}
      onPin={() => { edit((current) => ({ ...current, pinned: !current.pinned })); void flushRef.current(); }}
      onSurfaceBlur={() => setTimeout(() => {
        void flushRef.current();
        if (pending.current && !document.activeElement?.matches('.workspace-grid input, .workspace-grid textarea')) {
          const next = pending.current; pending.current = null;
          if (next.version === contextVersion.current) void apply(next.proposal, false);
        }
      }, 0)}
      status={status} busy={busy} configured={configured} decision={decision}
      canUndo={online ? canUndo || dirty.current.has('mode') : history.length > 0}
      online={online} dataStatus={dataStatus} draftHint={draftHint} conflict={conflictHold.current}
      onReconnect={() => void reconnect()} onConfirmLocal={() => void confirmLocal()}
      legacy={Boolean(legacy)} onImportLegacy={importLegacy} pwa={pwa}
    />
  </WorkspaceContext.Provider>;
}
