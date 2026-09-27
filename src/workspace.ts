export const MODES = ['read', 'meeting', 'review', 'notes'] as const;
export type Mode = typeof MODES[number];
export interface Workspace { mode: Mode; note: string; pinned: boolean; meeting: { title: string; date: string; time: string }; tasks: string[] }
export function isMode(value: unknown): value is Mode { return MODES.includes(value as Mode); }
export function initialWorkspace(): Workspace {
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const date = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`;
  return { mode: 'read', note: '', pinned: false, meeting: { title: '讨论 JevOS 原型', date, time: '15:00' }, tasks: ['核对任务切换的交互', '检查笔记和草稿是否保留', '整理异步评审意见'] };
}
export function hydrate(raw: unknown): Workspace {
  const base = initialWorkspace();
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || typeof value !== 'object') return base;
    const m = value.meeting;
    const parsedDate = typeof m?.date === 'string' ? new Date(`${m.date}T12:00:00Z`) : null;
    const date = typeof m?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.date) && parsedDate && Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().startsWith(m.date) ? m.date : base.meeting.date;
    return { mode: isMode(value.mode) ? value.mode : base.mode, note: typeof value.note === 'string' ? value.note : '', pinned: value.pinned === true,
      meeting: { title: typeof m?.title === 'string' ? m.title : base.meeting.title, date, time: typeof m?.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(m.time) ? m.time : base.meeting.time },
      tasks: Array.isArray(value.tasks) ? [...new Set<string>(value.tasks.filter((x: unknown): x is string => typeof x === 'string' && x.trim().length > 0))].slice(0,30) : base.tasks };
  } catch { return base; }
}
export function changeMode(state: Workspace, mode: unknown): Workspace { return isMode(mode) ? { ...state, mode } : state; }
export function undoMode(state: Workspace, previous: unknown): Workspace { return changeMode(state, previous); }
export interface Decision { choice: Mode | 'stay'; confidence: number | null; source: 'jev' | 'rules'; elapsedMs: number; reason?: string }
export function acceptDecision(raw: unknown): Decision | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Decision;
  if ((!isMode(d.choice) && d.choice !== 'stay') || !['jev','rules'].includes(d.source)) return null;
  if (d.confidence !== null && (typeof d.confidence !== 'number' || !Number.isFinite(d.confidence) || d.confidence < 0 || d.confidence > 1)) return null;
  if (typeof d.elapsedMs !== 'number' || !Number.isFinite(d.elapsedMs) || d.elapsedMs < 0) return null;
  return d;
}
