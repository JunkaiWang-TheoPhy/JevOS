import { z } from 'zod';

export function actionError(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}

const modeSchema = z.enum(['read', 'meeting', 'review', 'notes']);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number(value.slice(0, 4)) > 0 && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const meetingSchema = z.object({
  title: z.string().max(200),
  date: dateSchema,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
}).strict();
const tasksSchema = z.array(z.string().min(1).max(300).refine((value) => value.trim().length > 0)).max(30);
const stateSchema = z.object({
  mode: modeSchema,
  note: z.string().max(10000),
  pinned: z.boolean(),
  meeting: meetingSchema,
  tasks: tasksSchema,
}).strict();
const draftSchema = z.object({
  note: z.string().max(10000).optional(),
  meeting: meetingSchema.partial().refine((value) => Object.keys(value).length > 0).optional(),
}).strict().refine((value) => Object.keys(value).length > 0);
const commandBase = {
  actionId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
  expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
};
const actionSchema = z.discriminatedUnion('kind', [
  z.object({ ...commandBase, kind: z.literal('save_draft'), args: draftSchema }).strict(),
  z.object({ ...commandBase, kind: z.literal('select_mode'), args: z.object({
    mode: modeSchema, source: z.enum(['manual', 'automatic']),
  }).strict() }).strict(),
  z.object({ ...commandBase, kind: z.literal('set_pin'), args: z.object({ pinned: z.boolean() }).strict() }).strict(),
  z.object({ ...commandBase, kind: z.literal('set_tasks'), args: z.object({ tasks: tasksSchema }).strict() }).strict(),
  z.object({ ...commandBase, kind: z.literal('undo_layout'), args: z.object({}).strict() }).strict(),
]);

export function validateAction(value) {
  const parsed = actionSchema.safeParse(value);
  if (!parsed.success) throw actionError(400, 'INVALID_ACTION', '动作或字段格式无效，请检查长度、日期和时间。');
  return parsed.data;
}

export function validateWorkspace(value) {
  const parsed = stateSchema.safeParse(value);
  if (!parsed.success) throw actionError(400, 'INVALID_WORKSPACE', '工作区状态格式无效。');
  return parsed.data;
}

export function defaultWorkspace() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const date = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  return { mode: 'read', note: '', pinned: false,
    meeting: { title: '讨论 JevOS 原型', date, time: '15:00' },
    tasks: ['核对任务切换的交互', '检查笔记和草稿是否保留', '整理异步评审意见'] };
}

// Commands return changed fields; layout undo never replaces a whole workspace.
export function actionChanges(state, action) {
  switch (action.kind) {
    case 'save_draft':
      return { ...(action.args.note !== undefined ? { note: action.args.note } : {}),
        ...(action.args.meeting ? { meeting: { ...state.meeting, ...action.args.meeting } } : {}) };
    case 'select_mode':
      if (action.args.source === 'automatic' && state.pinned) {
        throw actionError(409, 'LAYOUT_PINNED', '布局已固定，请取消固定或手动切换。');
      }
      return { mode: action.args.mode };
    case 'set_pin': return { pinned: action.args.pinned };
    case 'set_tasks': return { tasks: action.args.tasks };
    default: throw actionError(400, 'INVALID_ACTION', '此动作无法直接执行。');
  }
}
