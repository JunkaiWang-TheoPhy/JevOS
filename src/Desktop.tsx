import { staticSite } from './site-mode';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent, ReactNode } from 'react';
import { defineCatalog } from '@json-render/core';
import { defineRegistry, JSONUIProvider, Renderer, schema } from '@json-render/react';
import { z } from 'zod';
import { WorkspaceContext } from './components';
import { calculate } from './calculator';
import { createDesktop, desktopReducer, hydrateDesktop, registerDesktopTool, TOOLS, toolsForMode } from './desktop-model';
import type { DesktopState, ToolId, WindowState } from './desktop-model';
import type { Decision, Mode, Workspace } from './workspace';
import type { usePwa } from './pwa';
import AppHost from './apps/AppHost';
import { applyShellDesktop } from './shell-desktop';
import { resolveShellApp, type DemoEffect } from './apps/terminal/demo-commands';
import GenerationFailure from './apps/GenerationFailure';
import { generatedWindowId, registerGeneratedApp, getBuiltinApp, getGeneratedApp } from './apps/registry';
import { generateApp, listGeneratedApps, loadGeneratedApp, readGeneratedCache, writeGeneratedCache } from './apps/generated-api';
import type { GeneratedAppPackage, AppDescriptor } from './apps/contracts';
import { dataStudioDraft } from '../drafts/vibeos-next/app-pack/data-studio/app.mjs';
import { demoReaderFixture } from '../drafts/demo/app-pack/apps.mjs';
import { demoPresentationFixture } from '../drafts/demo/presentation/reader.mjs';
import { retroTimerFixture } from './apps/generated/retro-timer-fixture';
import { publishGeneratedContent } from './apps/messages/context';
import { planDesktopScene, applyDesktopScene, deterministicDesktopAction } from './scene-client';
import { preparedAppForCommand } from './prepared-app-command';
import './desktop.css';

interface DesktopProps {
  state: Workspace;
  workspaceId: string | null;
  workspaceRevision: number;
  text: string;
  onTextChange(value: string): void;
  onSubmit(value: string): void;
  onSuggest(value: string): void;
  onManual(mode: Mode): void;
  onUserAction(): void;
  onUndo(): void;
  onPin(): void;
  onSurfaceBlur(): void;
  status: string;
  busy: boolean;
  configured: boolean;
  decision: Decision | null;
  canUndo: boolean;
  online: boolean;
  dataStatus: string;
  draftHint: string;
  conflict: boolean;
  onReconnect(): void;
  onConfirmLocal(): void;
  legacy: boolean;
  onImportLegacy(): void;
  pwa: ReturnType<typeof usePwa>;
}

const colors: Record<string, string> = {
  message: '#8370ee', notes: '#f1af37', calendar: '#559aef',
  tasks: '#ee758d', contact: '#41b99b', calculator: '#f07d52',
  terminal: '#354153', 'motion-lab': '#5d66df',
};
const modes: { mode: Mode; label: string; icon: ToolId }[] = [
  { mode: 'read', label: '阅读消息', icon: 'message' },
  { mode: 'meeting', label: '准备会议', icon: 'calendar' },
  { mode: 'review', label: '异步评审', icon: 'tasks' },
  { mode: 'notes', label: '整理笔记', icon: 'notes' },
];
const RuntimeContext = createContext<{ workspaceId: string | null; saved: string } | null>(null);

function Icon({ tool, size = 24 }: { tool: ToolId; size?: number }) {
  const paths: Record<string, ReactNode> = {
    message: <><path d="M4 6h16v12H4z" /><path d="m4 6 8 7 8-7" /></>,
    notes: <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v5h4M9 12h7M9 16h5" /></>,
    calendar: <><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 3v4M16 3v4M4 10h16M8 14h2M14 14h2M8 18h2" /></>,
    tasks: <><path d="m3 6 2 2 3-4M11 6h10m-18 7 2 2 3-4m3 2h10m-18 7 2 2 3-4m3 2h10" /></>,
    contact: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
    calculator: <><rect x="5" y="3" width="14" height="18" rx="3" /><path d="M8 7h8M8 12h1M15 12h1M8 17h1M15 17h1" /></>,
    terminal: <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="m7 9 3 3-3 3M13 15h4" /></>,
    'motion-lab': <><circle cx="12" cy="12" r="3" /><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-35 12 12)" /><circle cx="18" cy="5" r="1" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[tool] || <><path d="m12 2 2.6 6.6L22 12l-7.4 3.4L12 22l-2.6-6.6L2 12l7.4-3.4Z" /></>}</svg>;
}

function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('Workspace context is required');
  return context;
}

function MessageApp() {
  return <article className="mail-app">
    <div className="mail-tags"><span>收件箱</span></div>
    <h2>一起看看 JevOS 的下一步</h2>
    <div className="mail-person"><div className="person-avatar">A</div><div><strong>Alice</strong><small>alice@example.com</small></div><time>今天 10:24</time></div>
    <p>我们已经有了第一个原型。想和你核对任务切换的体验，再决定下一步。</p>
    <p>消息、笔记和会议草稿应该留在同一个工作区。工具可以随需求变化，但正在做的事要接得上。</p>
    <blockquote>明天下午方便的话，约个时间讨论。也可以先改成异步评审。</blockquote>
    <div className="mail-attachment"><Icon tool="notes" size={22} /><div><strong>交互评审事项</strong><small>笔记保留 · 工具组合 · 随时撤销</small></div></div>
  </article>;
}

function NotesApp() {
  const { state, setState } = useWorkspace();
  const runtime = useContext(RuntimeContext);
  return <div className="notes-app">
    <div className="note-toolbar"><span>随手笔记</span><span>{state.note.length} 字</span></div>
    <label className="visually-hidden" htmlFor="workspace-note">你的记录会保存在这台设备</label>
    <textarea id="workspace-note" value={state.note} maxLength={10000} placeholder={'写点什么。\n窗口怎么变，思路都留在这里。'} onChange={event => setState(current => ({ ...current, note: event.target.value }))} />
    <div className="app-footnote">{runtime?.saved || '本地草稿保留'}</div>
  </div>;
}

function CalendarApp() {
  const { state, setState } = useWorkspace();
  const runtime = useContext(RuntimeContext);
  const date = new Date(`${state.meeting.date}T12:00:00`);
  const valid = Number.isFinite(date.getTime());
  const patch = (field: keyof Workspace['meeting'], value: string) => setState(current => ({ ...current, meeting: { ...current.meeting, [field]: value } }));
  return <div className="calendar-app">
    <div className="calendar-cover"><span>{valid ? date.toLocaleDateString('zh-CN', { month: 'long', weekday: 'long' }) : '选一个日期'}</span><strong>{valid ? date.getDate() : '—'}</strong><small>和 Alice 讨论项目</small></div>
    <h2 className="calendar-heading">会议草稿</h2>
    <div className="calendar-form"><label htmlFor="meeting-title">主题</label><input id="meeting-title" value={state.meeting.title} maxLength={200} onChange={event => patch('title', event.target.value)} />
      <div className="calendar-fields"><div><label htmlFor="meeting-date">日期</label><input id="meeting-date" type="date" value={state.meeting.date} onChange={event => patch('date', event.target.value)} /></div><div><label htmlFor="meeting-time">时间</label><input id="meeting-time" type="time" value={state.meeting.time} onChange={event => patch('time', event.target.value)} /></div></div>
      <div className="meeting-person"><span>A</span><div><strong>Alice</strong><small>alice@example.com</small></div><em>待确认</em></div>
      <div className="app-footnote">{runtime?.saved} · 仅保存草稿，不发送邀请</div>
    </div>
  </div>;
}

function TasksApp() {
  const { state, setState } = useWorkspace();
  const [draft, setDraft] = useState('');
  return <div className="tasks-app"><p className="tool-eyebrow">一步一步，让想法落地</p><h2>异步评审清单</h2><div className="task-progress"><span>{state.tasks.length} 件待办</span><i /></div>
    <div className="desktop-task-list">{state.tasks.map((task, index) => <label key={task}><input type="checkbox" onChange={() => setState(current => ({ ...current, tasks: current.tasks.filter((_, item) => item !== index) }))} /><span>{task}</span></label>)}{!state.tasks.length && <p className="empty-tasks">这一轮已完成。给自己一点掌声。</p>}</div>
    <form className="add-task" onSubmit={event => { event.preventDefault(); const value = draft.trim(); if (value && state.tasks.length < 30) { setState(current => ({ ...current, tasks: [...new Set([...current.tasks, value])] })); setDraft(''); } }}><label className="visually-hidden" htmlFor="task-draft">添加待办</label><input id="task-draft" value={draft} maxLength={200} placeholder="下一步要做什么？" onChange={event => setDraft(event.target.value)} /><button type="submit" aria-label="添加待办">＋</button></form>
  </div>;
}

function ContactApp() {
  return <div className="contact-app"><div className="contact-orbit"><span>A</span><i /><b /></div><h2>Alice</h2><p>一起把项目做出来。</p><a href="mailto:alice@example.com">alice@example.com</a><span className="contact-label">来自当前消息</span><h3>联系作者</h3><a href="mailto:WangTheoPhys@outlook.com">WangTheoPhys@outlook.com</a><a href="https://Junkaiwang-theophy.github.io" target="_blank" rel="noreferrer">Junkai Wang · 个人网站 ↗</a></div>;
}

function CalculatorApp() {
  const runtime = useContext(RuntimeContext);
  const key = `vibeos-calculator-${runtime?.workspaceId || 'local'}`;
  const [expression, setExpression] = useState(() => { try { return localStorage.getItem(key) || ''; } catch { return ''; } });
  const [result, setResult] = useState('0');
  const [error, setError] = useState('');
  const evaluate = () => { try { setResult(String(calculate(expression))); setError(''); } catch (problem) { setError(problem instanceof Error ? problem.message : '请检查算式。'); } };
  const edit = (value: string) => { setExpression(value); setError(''); try { localStorage.setItem(key, value); } catch { /* Editing remains available without storage. */ } };
  return <div className="calculator-app"><label className="visually-hidden" htmlFor="calculator-input">算式</label><input id="calculator-input" value={expression} maxLength={160} placeholder="24 × 7" onChange={event => edit(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') evaluate(); }} /><output aria-label="计算结果">{result}</output><p role="status">{error || '本机计算，离线也可使用'}</p><div className="calculator-keys">{['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '.', '⌫', '='].map(value => <button key={value} className={value === '=' ? 'equals' : /[÷×−+]/.test(value) ? 'operator' : ''} onClick={() => value === '=' ? evaluate() : edit(value === 'C' ? '' : value === '⌫' ? expression.slice(0, -1) : expression + value)}>{value}</button>)}</div></div>;
}

const empty = { props: z.object({}), slots: [], description: '受控的本地工具' };
const catalog = defineCatalog(schema, { components: { Message: empty, Notes: empty, Calendar: empty, Tasks: empty, Contact: empty, Calculator: empty }, actions: {} });
const { registry } = defineRegistry(catalog, { components: { Message: MessageApp, Notes: NotesApp, Calendar: CalendarApp, Tasks: TasksApp, Contact: ContactApp, Calculator: CalculatorApp } });
const componentTypes: Record<string, string> = { message: 'Message', notes: 'Notes', calendar: 'Calendar', tasks: 'Tasks', contact: 'Contact', calculator: 'Calculator' };
const specs = Object.fromEntries(Object.entries(componentTypes).map(([tool, type]) => [tool, { root: tool, elements: { [tool]: { type, props: {}, children: [] } } }]));

function defaultDesktop(): DesktopState {
  let state = desktopReducer(createDesktop(), { type: 'open', tool: 'message' });
  state = desktopReducer(state, { type: 'open', tool: 'notes' });
  return { ...state, windows: state.windows.map(window => ({ ...window, x: window.tool === 'message' ? 64 : 650, y: window.tool === 'message' ? 42 : 98, width: window.tool === 'message' ? 510 : 360, height: window.tool === 'message' ? 420 : 350 })) };
}

export default function Desktop(props: DesktopProps) {
  const [desktop, setDesktop] = useState(defaultDesktop);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [launcher, setLauncher] = useState<'apps' | 'layout' | 'generate' | null>(null);
  const [appPrompt, setAppPrompt] = useState('');
  const [layoutPrompt, setLayoutPrompt] = useState('');
  const [planning, setPlanning] = useState(false);
  const [sceneStatus, setSceneStatus] = useState('');
  const sceneController = useRef<AbortController | null>(null);
  const sceneRevision = useRef(0);
  const [settings, setSettings] = useState(false);
  const [generatedApps, setGeneratedApps] = useState<GeneratedAppPackage[]>([]);
  const [remoteApps, setRemoteApps] = useState<{ id: string; title: string; createdAt: string }[]>([]);
  const [generating, setGenerating] = useState(false);
  const [appStatus, setAppStatus] = useState('');
  const [failedGeneration, setFailedGeneration] = useState<{ prompt: string; message: string } | null>(null);
  const [interactingWindow, setInteractingWindow] = useState<string | null>(null);
  const generation = useRef<AbortController | null>(null);
  const shellLayouts = useRef<DesktopState[]>([]);
  useEffect(() => { shellLayouts.current = []; }, [props.workspaceId]);
  const pendingLayout = useRef<{ owner: string; windows: WindowState[] } | null>(null);
  const currentOwner = useRef(props.workspaceId);
  currentOwner.current = props.workspaceId;
  const [theme, setTheme] = useState(() => {
    try { const saved = localStorage.getItem('vibeos-wallpaper'); return ['spectrum', 'sunrise', 'lagoon'].includes(saved || '') ? saved! : 'spectrum'; }
    catch { return 'spectrum'; }
  });
  const [clock, setClock] = useState(new Date());
  const stage = useRef<HTMLDivElement>(null);
  const command = useRef<HTMLInputElement>(null);
  const [size, setSize] = useState({ width: innerWidth, height: Math.max(400, innerHeight - 180) });
  const previousMode = useRef(props.state.mode);
  const pointer = useRef<{ id: string; kind: 'move' | 'resize'; px: number; py: number; window: WindowState } | null>(null);
  const deferredMode = useRef<Mode | null>(null);
  const sceneContext = useRef({ desktop, size, workspaceId: props.workspaceId, revision: props.workspaceRevision, state: props.state, launcher });
  sceneContext.current = { desktop, size, workspaceId: props.workspaceId, revision: props.workspaceRevision, state: props.state, launcher };

  function cancelScene() {
    sceneRevision.current++;
    sceneController.current?.abort();
    sceneController.current = null;
    setPlanning(false);
  }
  function userAction() { cancelScene(); props.onUserAction(); }
  useEffect(() => {
    cancelScene();
    return () => { sceneController.current?.abort(); };
  }, [desktop, size, props.workspaceId, props.workspaceRevision, props.state, launcher]);

  async function planDesktop(value: string) {
    const prepared = preparedAppForCommand(value);
    if (prepared) { setFailedGeneration(null); setSceneStatus(''); setAppStatus(''); await launch(prepared); return; }
    const text = value.trim();
    const localAction = deterministicDesktopAction(text);
    if (localAction) {
      userAction();
      setDesktop(current => current.windows.reduce((next, window) => desktopReducer(next, { type: localAction, id: window.id }), current));
      setSceneStatus(localAction === 'close' ? '已关闭全部窗口，应用数据仍保留。' : '已收起全部窗口。');
      setLauncher(null); return;
    }
    if (!text || text.length > 2000) { setSceneStatus('请输入不超过 2000 字的桌面需求。'); return; }
    if (!props.online || !props.workspaceId) { setSceneStatus('请先联网同步工作区，再调整桌面。'); return; }
    if (props.state.pinned) { setSceneStatus('组合已固定，请先取消固定再调整桌面。'); return; }
    userAction();
    if (staticSite) { setDesktop(current => desktopReducer(current, { type: 'tile', width: size.width, height: size.height })); setSceneStatus('工具已排列，可从 Dock 打开更多应用。'); setLauncher(null); return; }
    const snapshot = sceneContext.current;
    const version = sceneRevision.current;
    const controller = new AbortController();
    sceneController.current = controller;
    setPlanning(true); setSceneStatus(''); setAppStatus('');
    try {
      const proposal = await planDesktopScene({ text, desktop: snapshot.desktop, viewport: snapshot.size,
        desktopRevision: version, baseRevision: snapshot.revision, signal: controller.signal });
      for (const operation of proposal.operations) {
        if (operation.type === 'open' && operation.appId.startsWith('generated:') && !getGeneratedApp(operation.appId)) {
          const app = await loadGeneratedApp(operation.appId.slice('generated:'.length), controller.signal);
          if (controller.signal.aborted || currentOwner.current !== snapshot.workspaceId) return;
          install(app);
        }
      }
      const current = sceneContext.current;
      if (controller.signal.aborted || sceneController.current !== controller || sceneRevision.current !== version ||
          current.workspaceId !== snapshot.workspaceId || current.revision !== snapshot.revision ||
          current.desktop !== snapshot.desktop || current.size !== snapshot.size || current.state !== snapshot.state || current.launcher !== snapshot.launcher) return;
      sceneController.current = null;
      setDesktop(currentDesktop => currentDesktop === snapshot.desktop ? applyDesktopScene(currentDesktop, proposal) : currentDesktop);
      setSceneStatus([proposal.explanation, ...(proposal.missingCapabilities || []),
        ...(proposal.generation ? ['创建新应用请使用 Vibe anything 入口。'] : [])].filter(Boolean).join(' '));
      setLauncher(null);
    } catch (error) {
      if (!controller.signal.aborted && sceneController.current === controller) {
        setSceneStatus(error instanceof Error ? error.message : '桌面规划失败，请重试。');
      }
    } finally {
      if (sceneController.current === controller) sceneController.current = null;
      if (sceneRevision.current === version) setPlanning(false);
    }
  }

  useEffect(() => {
    if (!props.workspaceId) return;
    const prepared = [dataStudioDraft, demoReaderFixture, demoPresentationFixture, { ...retroTimerFixture, id: 'demo-rehearsal-timer', title: '计时器' }];
    const cached = [...prepared, ...readGeneratedCache(props.workspaceId).filter(app => !prepared.some(item => item.id === app.id))];
    for (const app of cached) {
      const descriptor = registerGeneratedApp(app);
      registerDesktopTool(descriptor.id, { title: descriptor.title, subtitle: app.id === dataStudioDraft.id ? 'CSV 与图表' : '保存的生成式 App', color: descriptor.accent, width: descriptor.width, height: descriptor.height });
    }
    setGeneratedApps(cached);
    setRemoteApps([]);
    let initial = defaultDesktop();
    let saved: DesktopState | null = null;
    try {
      const stored = localStorage.getItem(`vibeos-desktop-${props.workspaceId}`);
      saved = stored ? hydrateDesktop(stored, true) : null;
      if (stored) initial = hydrateDesktop(stored);
    } catch { /* Keep the initial desktop if saved layout is corrupt. */ }
    const cachedIds = new Set(cached.map(app => generatedWindowId(app.id)));
    initial = { ...initial, windows: initial.windows.filter(window => !window.tool.startsWith('generated:') || cachedIds.has(window.tool)) };
    if (!initial.windows.some(window => window.id === initial.activeId)) initial.activeId = null;
    pendingLayout.current = { owner: props.workspaceId, windows: saved?.windows.filter(window => window.tool.startsWith('generated:') && !cachedIds.has(window.tool)) || [] };
    setDesktop(initial);
    setLoadedId(props.workspaceId);
    const controller = new AbortController();
    void listGeneratedApps(controller.signal).then(apps => {
      if (controller.signal.aborted) return;
      for (const app of apps) registerDesktopTool(generatedWindowId(app.id), { title: app.title, subtitle: '生成式 App', color: '#9c72e8', width: 600, height: 460 });
      const available = new Set(apps.map(app => generatedWindowId(app.id)));
      const pending = pendingLayout.current?.owner === props.workspaceId ? pendingLayout.current.windows.filter(window => available.has(window.tool)) : [];
      pendingLayout.current = null;
      setRemoteApps(apps);
      setDesktop(current => {
        const restored = pending.filter(window => !current.windows.some(existing => existing.id === window.id || existing.tool === window.tool));
        const activeId = current === initial && restored.some(window => window.id === saved?.activeId) ? saved!.activeId : current.activeId;
        return { windows: [...current.windows, ...restored], activeId };
      });
      for (const window of pending) {
        void loadGeneratedApp(window.tool.slice('generated:'.length), controller.signal).then(app => {
          if (!controller.signal.aborted) install(app);
        }).catch(error => {
          if (!controller.signal.aborted) setAppStatus(error instanceof Error ? error.message : '保存的应用暂时无法载入。');
        });
      }
    }).catch(() => { /* Cached apps remain available while the generation service is offline. */ });
    return () => { controller.abort(); generation.current?.abort(); };
  }, [props.workspaceId]);
  useEffect(() => {
    if (!props.workspaceId || loadedId !== props.workspaceId) return;
    const pending = pendingLayout.current?.owner === props.workspaceId ? pendingLayout.current.windows : [];
    try { localStorage.setItem(`vibeos-desktop-${props.workspaceId}`, JSON.stringify({ ...desktop, windows: [...desktop.windows, ...pending] })); } catch { /* The desktop stays usable without layout persistence. */ }
  }, [desktop, loadedId, props.workspaceId]);
  useEffect(() => {
    const observer = new ResizeObserver(entries => { const box = entries[0]?.contentRect; if (box) setSize({ width: box.width, height: box.height }); });
    if (stage.current) observer.observe(stage.current);
    const timer = setInterval(() => setClock(new Date()), 30000);
    const keyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setLauncher(current => current === 'generate' ? null : 'generate'); }
      if (event.key === 'Escape') { setLauncher(null); setSettings(false); }
    };
    window.addEventListener('keydown', keyboard);
    return () => { observer.disconnect(); clearInterval(timer); window.removeEventListener('keydown', keyboard); };
  }, []);
  useEffect(() => {
    if (!launcher) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (command.current) command.current.focus();
    else document.querySelector<HTMLButtonElement>('.desktop-launcher button')?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const dialog = document.querySelector('.desktop-launcher');
      const items = dialog ? Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')) : [];
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { document.removeEventListener('keydown', trap); if (previous?.isConnected) previous.focus(); };
  }, [launcher]);
  useEffect(() => { try { localStorage.setItem('vibeos-wallpaper', theme); } catch { /* Theme remains usable in memory. */ } }, [theme]);

  function composition(mode: Mode) {
    cancelScene();
    const wanted = toolsForMode(mode);
    setDesktop(current => {
      let next = current;
      for (const window of next.windows) if (['message', 'notes', 'calendar', 'tasks', 'contact'].includes(window.tool) && !wanted.includes(window.tool)) next = desktopReducer(next, { type: 'minimize', id: window.id });
      for (const tool of wanted) next = desktopReducer(next, { type: 'open', tool });
      const arranged = desktopReducer({ ...next, windows: next.windows.filter(window => wanted.includes(window.tool)) }, { type: 'tile', width: size.width, height: size.height });
      const frames = new Map(arranged.windows.map(window => [window.id, window]));
      return { ...next, windows: next.windows.map(window => frames.get(window.id) || window) };
    });
  }
  useEffect(() => {
    if (previousMode.current === props.state.mode) return;
    previousMode.current = props.state.mode;
    if (pointer.current) deferredMode.current = props.state.mode;
    else composition(props.state.mode);
  }, [props.state.mode]);

  const builtInIds: ToolId[] = ['message', 'notes', 'calendar', 'tasks', 'contact', 'calculator', 'terminal', 'motion-lab', 'music'];
  const appIds: ToolId[] = [...builtInIds, ...[...new Set([...generatedApps.map(app => app.id), ...remoteApps.map(app => app.id)])].map(id => generatedWindowId(id) as ToolId)];
  const descriptors: AppDescriptor[] = appIds.map(id => ({ id, title: TOOLS[id].title, icon: id.startsWith('generated:') ? '✦' : id,
    accent: colors[id] || TOOLS[id].color, width: TOOLS[id].width || 420, height: TOOLS[id].height || 420 }));

  function install(app: GeneratedAppPackage) {
    const descriptor = registerGeneratedApp(app);
    registerDesktopTool(descriptor.id, { title: descriptor.title, subtitle: '生成并保存的小应用', color: descriptor.accent, width: descriptor.width, height: descriptor.height });
    setGeneratedApps(current => {
      const next = [...current.filter(item => item.id !== app.id), app].slice(-12);
      if (props.workspaceId) { try { writeGeneratedCache(props.workspaceId, next); } catch { /* Server retains the source when local storage is full. */ } }
      return next;
    });
    return descriptor.id as ToolId;
  }
  async function launch(tool: ToolId) {
    userAction(); setLauncher(null);
    if (tool.startsWith('generated:') && !getGeneratedApp(tool)) {
      const owner = props.workspaceId;
      try {
        setAppStatus('正在载入保存的应用…');
        const app = await loadGeneratedApp(tool.slice('generated:'.length), AbortSignal.timeout(15000));
        if (owner !== currentOwner.current) return;
        install(app); setAppStatus('');
      } catch (error) { setAppStatus(error instanceof Error ? error.message : '应用载入失败。'); return; }
    }
    setDesktop(current => desktopReducer(current, { type: 'open', tool }));
  }
  async function createApp(value: string, fromShell = false) {
    if (!fromShell) {
      const prepared = preparedAppForCommand(value);
      if (prepared) { setFailedGeneration(null); setSceneStatus(''); setAppStatus(''); await launch(prepared); return; }
    }
    const prompt = value.trim();
    setFailedGeneration(null); setSceneStatus('');
    if (!prompt || prompt.length > 2000) { if (fromShell) throw new Error('请描述一个不超过 2000 字的小应用。'); setFailedGeneration({ prompt, message: '请描述一个不超过 2000 字的小应用。' }); return; }
    if (!props.online) { if (fromShell) throw new Error('生成新应用需要联网。'); setFailedGeneration({ prompt, message: '生成新应用需要联网，已保存的应用仍可使用。' }); return; }
    userAction(); setLauncher(null);
    generation.current?.abort();
    const controller = new AbortController(); generation.current = controller;
    const owner = props.workspaceId;
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 90000);
    setGenerating(true); setAppStatus('正在把你的想法编成一个独立 App…');
    try {
      const app = await generateApp(prompt, controller.signal);
      if (generation.current !== controller || controller.signal.aborted || owner !== currentOwner.current) return;
      const tool = install(app);
      if (owner) publishGeneratedContent(owner, prompt, app.title);
      setDesktop(current => desktopReducer(current, { type: 'open', tool }));
      setAppStatus(`${app.title} 已生成并保存。`);
      return `${app.title} 已生成并保存。`;
    } catch (error) {
      if (generation.current === controller && owner === currentOwner.current) {
        if (controller.signal.aborted && !timedOut) setAppStatus('本次生成已取消。');
        else {
          setAppStatus('生成暂未完成，请查看提示。');
          setFailedGeneration({ prompt, message: timedOut ? '生成耗时过长，请重试或缩小需求。' : error instanceof Error ? error.message : '应用生成失败。' });
        }
      }
      if (fromShell) throw error;
    } finally {
      clearTimeout(timeout);
      if (generation.current === controller) { generation.current = null; setGenerating(false); }
    }
  }
  async function executeShellCommand(effect: DemoEffect): Promise<string> {
    userAction();
    if (effect.type === 'create-app') {
      const result = await createApp(effect.prompt, true);
      if (!result) throw new Error('生成已取消，未打开新应用。');
      return result;
    }
    if (effect.type === 'clear' || effect.type === 'app-action') throw new Error('该动作应由终端或应用执行。');
    const owner = currentOwner.current;
    const available = descriptors;
    const targets = effect.type === 'split' ? effect.appIds : effect.type === 'scene' ?
      (effect.name === 'morning' ? ['reader', 'notes', 'music', 'timer'] : effect.name === 'pitch' ? ['notes', 'timer'] : ['notes'])
        .map(name => { const app = resolveShellApp(name, available); if (!app) throw new Error(`场景缺少 ${name} 应用。`); return app.id; }) :
      effect.type === 'open' ? [effect.appId] : [];
    for (const id of targets) {
      if (id.startsWith('generated:') && !getGeneratedApp(id)) {
        const app = await loadGeneratedApp(id.slice('generated:'.length), AbortSignal.timeout(15000));
        if (owner !== currentOwner.current) throw new Error('工作区已切换，本次命令取消。');
        install(app);
      }
    }
    if (owner !== currentOwner.current) throw new Error('工作区已切换，本次命令取消。');
    const current = sceneContext.current;
    if (effect.type === 'undo-layout') {
      const previous = shellLayouts.current.pop();
      if (!previous) throw new Error('没有可撤销的终端布局。');
      const windows = current.desktop.windows.map(window => {
        const old = previous.windows.find(item => item.id === window.id);
        return old ? { ...window, x: old.x, y: old.y, width: old.width, height: old.height, z: old.z, minimized: old.minimized, maximized: old.maximized } : { ...window, minimized: true };
      });
      setDesktop({ windows, activeId: windows.some(window => window.id === previous.activeId && !window.minimized) ? previous.activeId : null });
      return '已恢复上一布局，App 内容保留。';
    }
    const next = applyShellDesktop(current.desktop, effect, current.size, available);
    if (['tile', 'split', 'move', 'resize', 'scene'].includes(effect.type)) {
      shellLayouts.current = [...shellLayouts.current, structuredClone(current.desktop)].slice(-10);
    }
    setDesktop(next);
    if (effect.type === 'focus') requestAnimationFrame(() => {
      const window = next.windows.find(item => item.tool === effect.appId);
      if (window) stage.current?.querySelector<HTMLElement>(`[data-testid="window-${CSS.escape(window.tool)}"] textarea, [data-testid="window-${CSS.escape(window.tool)}"] input:not([disabled])`)?.focus();
    });
    return effect.type === 'scene' ? `已切换 ${effect.name} 场景。` : effect.type === 'open' ? `已打开 ${TOOLS[effect.appId]?.title || effect.appId}。` : '桌面操作已完成。';
  }
  function beginPointer(event: PointerEvent<HTMLElement>, window: WindowState, kind: 'move' | 'resize') {
    if (size.width < 720 || window.maximized || (kind === 'move' && (event.target as HTMLElement).closest('button'))) return;
    event.preventDefault();
    userAction();
    const bounds = frameStyle(window);
    const element = event.currentTarget.closest<HTMLElement>('.desktop-window');
    const computed = element ? getComputedStyle(element) : null;
    const rendered = (value: string | undefined, fallback: number) => { const number = Number.parseFloat(value || ''); return Number.isFinite(number) ? number : fallback; };
    const frame = { ...window, x: rendered(computed?.left, Number(bounds.left)), y: rendered(computed?.top, Number(bounds.top)), width: rendered(computed?.width, Number(bounds.width)), height: rendered(computed?.height, Number(bounds.height)) };
    setInteractingWindow(window.id);
    pointer.current = { id: window.id, kind, px: event.clientX, py: event.clientY, window: frame };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDesktop(current => desktopReducer({ ...current, windows: current.windows.map(item => item.id === window.id ? frame : item) }, { type: 'focus', id: window.id }));
  }
  function movePointer(event: PointerEvent<HTMLElement>) {
    const drag = pointer.current;
    if (!drag) return;
    const dx = event.clientX - drag.px, dy = event.clientY - drag.py;
    setDesktop(current => desktopReducer(current, drag.kind === 'move'
      ? { type: 'move', id: drag.id, x: Math.min(size.width - 100, Math.max(0, drag.window.x + dx)), y: Math.min(size.height - 60, Math.max(0, drag.window.y + dy)) }
      : { type: 'resize', id: drag.id, width: Math.min(size.width, drag.window.width + dx), height: Math.min(size.height, drag.window.height + dy) }));
  }
  function endPointer() { setInteractingWindow(null); pointer.current = null; if (deferredMode.current) { composition(deferredMode.current); deferredMode.current = null; } }
  const visible = desktop.windows.filter(window => !window.minimized);
  const dataLabels: Record<string, string> = { loading: '加载中', dirty: '本地待同步', synced: '已同步', unavailable: '服务不可用 · 本地草稿已保留' };
  const saved = dataLabels[props.dataStatus] || '草稿保留';

  function frameStyle(window: WindowState): CSSProperties {
    const width = Math.min(window.width, Math.max(1, size.width - 16));
    const height = Math.min(window.height, Math.max(1, size.height - 8));
    return { '--tool-color': colors[window.tool] || TOOLS[window.tool].color, zIndex: window.z,
      left: Math.min(window.x, Math.max(0, size.width - width - 8)),
      top: Math.min(window.y, Math.max(0, size.height - height - 4)), width, height } as CSSProperties;
  }
  return <div className="desktop app" data-mode={props.state.mode} data-theme={theme}>
    <div className="desktop-wallpaper" aria-hidden="true"><i /><b /><em /></div>
    <header className="desktop-menubar"><button className="desktop-brand" onClick={() => setLauncher(current => current === 'apps' ? null : 'apps')} aria-label="打开应用启动器"><span className="vibe-mark">✳</span> JevOS</button><div className="desktop-menu-actions"><button onClick={() => { userAction(); setDesktop(current => desktopReducer(current, { type: 'tile', width: size.width, height: size.height })); }}>排列窗口</button><button onClick={() => { userAction(); setDesktop(current => visible.length ? current.windows.reduce((next, window) => desktopReducer(next, { type: 'minimize', id: window.id }), current) : desktopReducer(current, { type: 'restore' })); }}>{visible.length ? '显示桌面' : '恢复窗口'}</button><button onClick={() => setTheme(current => current === 'spectrum' ? 'sunrise' : current === 'sunrise' ? 'lagoon' : 'spectrum')}>换个壁纸</button></div><div className="desktop-system"><span className="connection-mode">{props.configured ? 'Jev 已配置' : '本地规则'}</span><span className="network-state">{props.online ? '在线' : '离线'}</span><time>{clock.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time><button onClick={() => setSettings(current => !current)} aria-expanded={settings}>设置</button></div></header>
    <section className="desktop-command-bar"><button className="command-launch" aria-label="What you want do...." onClick={() => setLauncher('layout')}><span>▦</span><strong>What you want do....</strong></button><button className="command-launch" aria-label="Vibe anything" onClick={() => setLauncher('generate')}><span>✦</span><strong>Vibe anything</strong><small>⌘ K</small></button><nav aria-label="工作区组合">{modes.map(item => <button key={item.mode} aria-pressed={props.state.mode === item.mode} onClick={() => { composition(item.mode); props.onManual(item.mode); }}><Icon tool={item.icon} size={15} />{item.label}</button>)}</nav><div className="desktop-layout-actions"><button aria-pressed={props.state.pinned} onClick={props.onPin}>{props.state.pinned ? '已固定组合' : '固定组合'}</button><button disabled={!props.canUndo} onClick={props.onUndo}>撤销</button></div></section>
    <div className="desktop-stage" ref={stage} onBlurCapture={props.onSurfaceBlur}>
      {generating && <aside className="app-generation-progress" role="status"><span>✦</span><div><strong>一个新 App 正在诞生</strong><p>生成完成后会在独立窗口运行；已有应用继续使用。</p></div><button onClick={() => generation.current?.abort()}>取消生成</button></aside>}
      {!visible.length && <div className="desktop-empty"><span>✳</span><h1>从一个想法开始。</h1><p>打开一个工具，或描述接下来想做的事。</p><button onClick={() => setLauncher('apps')}>打开启动器 <kbd>⌘ K</kbd></button></div>}
      <RuntimeContext.Provider value={{ workspaceId: props.workspaceId, saved }}><JSONUIProvider registry={registry}>
        {desktop.windows.map(window => <section key={window.id} className={`desktop-window ${desktop.activeId === window.id ? 'is-active' : ''} ${window.maximized ? 'is-maximized' : ''} ${interactingWindow === window.id ? 'is-interacting' : ''}`} data-tool={window.tool} data-testid={`window-${window.tool}`} hidden={window.minimized} aria-label={`${TOOLS[window.tool].title}窗口`} style={frameStyle(window)} onPointerDown={() => { if (desktop.activeId !== window.id) { userAction(); setDesktop(current => desktopReducer(current, { type: 'focus', id: window.id })); } }}>
          <header className="window-titlebar" onDoubleClick={() => { userAction(); setDesktop(current => desktopReducer(current, { type: 'maximize', id: window.id })); }} onPointerDown={event => beginPointer(event, window, 'move')} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer}><div className="window-controls"><button className="window-close" aria-label={`关闭${TOOLS[window.tool].title}`} onClick={() => { userAction(); setDesktop(current => desktopReducer(current, { type: 'close', id: window.id })); }}>×</button><button className="window-minimize" aria-label={`最小化${TOOLS[window.tool].title}`} onClick={() => { userAction(); setDesktop(current => desktopReducer(current, { type: 'minimize', id: window.id })); }}>−</button><button className="window-maximize" aria-label={`最大化${TOOLS[window.tool].title}`} onClick={() => { userAction(); setDesktop(current => desktopReducer(current, { type: 'maximize', id: window.id })); }}>＋</button></div><span className="window-caption"><Icon tool={window.tool} size={15} />{['generated:draft-data-studio', 'generated:demo-reader', 'generated:demo-presentation', 'generated:demo-rehearsal-timer'].includes(window.tool) ? TOOLS[window.tool].title : window.title}</span><span className="window-caption-space" /></header>
          <div className={`window-body workspace-grid ${getBuiltinApp(window.tool) || window.tool.startsWith('generated:') ? 'app-host-body' : ''}`}>
            {getBuiltinApp(window.tool) || window.tool.startsWith('generated:') ? <AppHost appId={window.tool} instanceId={window.id} workspaceId={props.workspaceId} active={!window.minimized} apps={descriptors} openApp={id => launch(id as ToolId)} executeDesktopCommand={executeShellCommand} /> : <Renderer spec={specs[window.tool]} registry={registry} />}
          </div><div className="window-resize" onPointerDown={event => beginPointer(event, window, 'resize')} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer} aria-hidden="true">◢</div>
        </section>)}
      </JSONUIProvider></RuntimeContext.Provider>
    </div>
    <div className="desktop-bottom"><div className="desktop-status"><span role="status" aria-label="数据同步状态">{saved}{props.draftHint && ` · ${props.draftHint}`}</span><button onClick={props.onReconnect}>重新同步</button>{props.conflict && <button onClick={props.onConfirmLocal} disabled={!props.online}>确认保存本地修改</button>}</div><div className="intent-result" role="status">{generating ? '✦ 新 App 生成中…' : planning ? '✦ 桌面规划中…' : sceneStatus || appStatus || (props.busy ? '✦ 判断中…' : props.status)}{!generating && !planning && !sceneStatus && !appStatus && props.decision && <small>{props.decision.source === 'rules' ? '本地规则' : 'Jev'} · {Math.round(props.decision.elapsedMs)} ms</small>}</div></div>
    <nav className="desktop-dock" aria-label="应用 Dock"><button className="dock-launcher" aria-label="打开应用启动器" onClick={() => setLauncher('apps')}><span>✳</span><small>启动器</small></button><div className="dock-separator" />{appIds.filter(tool => !tool.startsWith('generated:')).map(tool => <button key={tool} className="dock-item" aria-label={`打开${TOOLS[tool].title}`} onClick={() => launch(tool)} style={{ '--tool-color': colors[tool] || TOOLS[tool].color } as CSSProperties}><span className="app-icon"><Icon tool={tool} size={27} /></span><small>{TOOLS[tool].title}</small><i className={desktop.windows.some(window => window.tool === tool) ? 'running' : ''} /></button>)}</nav>
    {launcher && <div className="launcher-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setLauncher(null); }}><section className="desktop-launcher" role="dialog" aria-label={launcher === 'layout' ? 'What you want do....' : launcher === 'generate' ? 'Vibe anything' : '应用启动器'} aria-modal="true">
      <div className="launcher-heading"><span>{launcher === 'layout' ? '▦' : '✦'}</span><div><h2>{launcher === 'layout' ? '调整你的桌面。' : launcher === 'generate' ? 'Vibe anything' : '打开已有应用。'}</h2><p>{launcher === 'layout' ? '描述当前任务，选择与排列已有工具。' : launcher === 'generate' ? '描述一个新 App，让它在独立窗口中运行。' : '打开工具或你已经保存的 App。'}</p></div><button aria-label="关闭启动器" onClick={() => setLauncher(null)}>×</button></div>
      {launcher === 'layout' && <><form onSubmit={event => { event.preventDefault(); void planDesktop(layoutPrompt); }}><label className="visually-hidden" htmlFor="layout-input">描述桌面布局</label><input id="layout-input" ref={command} value={layoutPrompt} onChange={event => setLayoutPrompt(event.target.value)} placeholder="例如：笔记放左边，日历放右边，占三分之一" maxLength={2000} /><button type="submit" disabled={planning}>{planning ? '规划中…' : '调整桌面'}</button></form><div className="launcher-suggestions">{['约个时间讨论', '改成异步评审'].map(value => <button key={value} onClick={() => { setLayoutPrompt(value); void planDesktop(value); }}>{value} ↗</button>)}</div>{sceneStatus && <p role="status">{sceneStatus}</p>}</>}
      {launcher === 'generate' && <form onSubmit={event => { event.preventDefault(); void createApp(appPrompt); }}><label className="visually-hidden" htmlFor="app-prompt">描述你想生成的 App</label><input id="app-prompt" ref={command} value={appPrompt} onChange={event => setAppPrompt(event.target.value)} maxLength={2000} placeholder="例如：做一个复古番茄钟，或一个喝水提醒器" /><button type="submit" disabled={generating}>{generating ? '生成中…' : '生成 App'}</button></form>}
      {launcher === 'apps' && <div className="launcher-apps">{appIds.map(tool => <button key={tool} onClick={() => launch(tool)} style={{ '--tool-color': colors[tool] || TOOLS[tool].color } as CSSProperties}><span className="app-icon"><Icon tool={tool} size={25} /></span><strong>{TOOLS[tool].title}</strong><small>{TOOLS[tool].subtitle}</small></button>)}</div>}
      <div className="launcher-note">{launcher === 'layout' ? '已有工具随任务组合 · 窗口内容保持原样' : launcher === 'generate' ? '生成后自动打开 · 保存后可从启动器再次使用' : '各 App 独立运行 · 打开已保存应用无需重新生成'}</div>
    </section></div>}
    {failedGeneration && <GenerationFailure message={failedGeneration.message} onClose={() => setFailedGeneration(null)} onEdit={() => { setAppPrompt(failedGeneration.prompt); setFailedGeneration(null); setLauncher('generate'); }} onRetry={() => { void createApp(failedGeneration.prompt); }} />}
    {settings && <aside className="desktop-settings"><div><h2>这个桌面</h2><button aria-label="关闭设置" onClick={() => setSettings(false)}>×</button></div><p>工具窗口可以共存、排列和恢复。笔记、会议草稿和待办沿用当前工作区的数据。</p><span className="settings-label">连接状态</span><strong>{props.configured ? 'Jev 已配置' : '本地规则'}</strong><p>模型密钥由本机服务管理。未配置时，需求通过本地关键词选择工具。</p>{!props.online && <p>当前离线，仍可编辑已有草稿、使用本地计算器。</p>}{props.pwa.canInstall && <button onClick={() => void props.pwa.install()}>安装应用</button>}{props.pwa.needRefresh && <button onClick={() => void props.pwa.update()}>更新应用</button>}{props.legacy && <button onClick={props.onImportLegacy}>导入旧版草稿</button>}</aside>}
  </div>;
}
