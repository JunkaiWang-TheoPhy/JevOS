export interface ShellApp { id: string; title: string }
export type ShellPosition = 'bottom-right' | 'top-right' | 'top-left' | 'bottom-left' | 'left' | 'right' | 'center';
export type DemoEffect =
  | { type: 'clear' }
  | { type: 'open' | 'close' | 'minimize' | 'focus'; appId: string }
  | { type: 'tile' }
  | { type: 'split'; appIds: [string, string] }
  | { type: 'move'; appId: string; position: ShellPosition }
  | { type: 'resize'; appId: string; percent: number }
  | { type: 'app-action'; appId: string; action: 'music.play' | 'music.pause' | 'music.next' | 'timer.start' | 'timer.pause' | 'timer.reset' | 'reader.bookmark' | 'reader.restore'; args?: { minutes?: number } }
  | { type: 'scene'; name: 'morning' | 'focus' | 'pitch' }
  | { type: 'undo-layout' }
  | { type: 'create-app'; prompt: string };
export interface DemoCommandResult { ok: boolean; output: string; source: 'local'; effect?: DemoEffect }
const aliases: Record<string, string[]> = {
  notes: ['notes', '笔记'], music: ['music', '音乐'], timer: ['timer', '番茄钟', '计时器', '计时'],
  reader: ['reader', '阅读器', '阅读', '论文'], terminal: ['terminal', '终端', 'jevos'],
  calculator: ['calculator', '计算器'], calendar: ['calendar', '日历'], message: ['message', '消息'], tasks: ['tasks', '待办'],
};
export function resolveShellApp(query: string, apps: readonly ShellApp[]): ShellApp | undefined {
  const q = query.trim().toLowerCase();
  const key = Object.keys(aliases).find(k => aliases[k].includes(q));
  if (key === 'timer') {
    const candidates = apps.filter(a => a.id.startsWith('generated:') && /番茄|计时|timer|pomodoro/i.test(a.title));
    return candidates.find(a => !/预制|演示|fixture/i.test(a.title) && !/fixture|demo/i.test(a.id)) ?? candidates[0] ?? apps.find(a => a.id === 'timer');
  }
  if (key === 'reader') return apps.find(a => a.id === 'generated:demo-reader') ?? apps.find(a => /阅读器|reader/i.test(a.title));
  return apps.find(a => a.id.toLowerCase() === q || a.title.toLowerCase() === q) ?? (key ? apps.find(a => a.id === key) : undefined);
}
const result = (ok: boolean, output: string, effect?: DemoEffect): DemoCommandResult => ({ ok, output, source: 'local', ...(effect ? { effect } : {}) });
export function parseDemoCommand(text: string, apps: readonly ShellApp[]): DemoCommandResult | null {
  const input = text.trim();
  const verb = input.split(/\s/)[0].toLowerCase();
  const local = /^(clear|cls|help|apps|open|close|minimize|focus|tile|split|move|resize|music|timer|reader|scene|undo|create)$/i.test(verb) || /^(清屏|打开)/.test(input);
  if (!local) return null;
  if (/[\r\n;|&`]|\$\(/.test(text)) return result(false, '本地命令只接受单条指令，不支持命令串。');
  const tokens = input.match(/"[^"\r\n]*"|'[^'\r\n]*'|[^\s]+/g)?.map(t => /^["']/.test(t) ? t.slice(1, -1) : t) ?? [];
  if ((input.match(/"/g)?.length ?? 0) % 2 || (input.match(/'/g)?.length ?? 0) % 2) return result(false, '引号不完整。');
  const [command, ...args] = tokens; const c = command?.toLowerCase();
  const app = (q: string) => resolveShellApp(q, apps);
  if (['clear', 'cls', '清屏'].includes(c) && !args.length) return result(true, '已清屏。', { type: 'clear' });
  if (c === 'help' && !args.length) return result(true, '本地命令：clear / cls、apps、open / close / minimize / focus <app>、tile、split <app> <app>、move <app> <position>、resize <app> <10–100%>、music play/pause/next、timer start 3m/pause/reset、reader bookmark/restore、scene morning/focus/pitch、undo layout、create app "需求"。');
  if (c === 'apps' && !args.length) return result(true, apps.map(a => `${a.id} · ${a.title}`).join('\n') || '没有可用应用。');
  const chineseOpen = input.match(/^打开\s*(.+)$/);
  if (['open', 'close', 'minimize', 'focus'].includes(c) || chineseOpen) {
    const target = app(chineseOpen ? chineseOpen[1] : args.join(' '));
    return target ? result(true, `本地动作：${chineseOpen ? 'open' : c} ${target.title}`, { type: (chineseOpen ? 'open' : c) as 'open' | 'close' | 'minimize' | 'focus', appId: target.id }) : result(false, '未找到该应用，请使用 apps 查看真实应用清单。');
  }
  if (c === 'tile' && !args.length) return result(true, '本地动作：排列窗口。', { type: 'tile' });
  if (c === 'split' && args.length === 2) {
    const a = app(args[0]); const b = app(args[1]);
    return a && b && a.id !== b.id ? result(true, '本地动作：双栏排布。', { type: 'split', appIds: [a.id, b.id] }) : result(false, '需要两个不同且存在的应用。');
  }
  if (c === 'move' || c === 'resize') {
    const target = app(args.slice(0, -1).join(' ')); const value = args.at(-1) ?? '';
    if (!target) return result(false, '未找到该应用。');
    if (c === 'move' && ['bottom-right', 'top-right', 'top-left', 'bottom-left', 'left', 'right', 'center'].includes(value)) return result(true, `本地动作：移动${target.title}。`, { type: 'move', appId: target.id, position: value as ShellPosition });
    const n = /^\d+(?:\.\d+)?%?$/.test(value) ? Number(value.replace('%', '')) : NaN;
    if (c === 'resize' && n >= 10 && n <= 100) return result(true, `本地动作：调整${target.title}宽度为 ${n}%。`, { type: 'resize', appId: target.id, percent: n });
  }
  if (['music', 'timer', 'reader'].includes(c)) {
    const target = app(c); if (!target) return result(false, `未找到${c}应用。`);
    const action = args[0]?.toLowerCase();
    const allowed = c === 'music' ? ['play', 'pause', 'next'] : c === 'timer' ? ['start', 'pause', 'reset'] : ['bookmark', 'restore'];
    if (allowed.includes(action) && ((c === 'timer' && action === 'start' && args.length <= 2) || args.length === 1)) {
      const minutes = args[1] === undefined ? 3 : /^\d+(?:\.\d+)?m$/.test(args[1]) ? Number(args[1].slice(0, -1)) : NaN;
      if (c === 'timer' && action === 'start' && !(minutes >= 1 && minutes <= 120)) return result(false, '计时格式：timer start 3m（1–120 分钟）。');
      return result(true, `本地动作：${c} ${action}。`, { type: 'app-action', appId: target.id, action: `${c}.${action}` as Extract<DemoEffect, { type: 'app-action' }>['action'], ...(c === 'timer' && action === 'start' ? { args: { minutes } } : {}) });
    }
  }
  if (c === 'scene' && args.length === 1 && ['morning', 'focus', 'pitch'].includes(args[0])) return result(true, `本地动作：${args[0]} 场景。`, { type: 'scene', name: args[0] as 'morning' | 'focus' | 'pitch' });
  if (c === 'undo' && args.join(' ') === 'layout') return result(true, '本地动作：恢复上一布局。', { type: 'undo-layout' });
  if (c === 'create' && args[0] === 'app' && args.slice(1).join(' ').trim()) return result(true, '转交真实应用生成器。', { type: 'create-app', prompt: args.slice(1).join(' ') });
  return result(false, '命令参数无效，请输入 help 查看示例。');
}
