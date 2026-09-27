import { acceptDecision, isMode } from './workspace.ts';
import type { Decision, Workspace } from './workspace.ts';

export interface WorkspaceSnapshot { id: string; state: Workspace; revision: number; canUndo: boolean }
export type ActionKind = 'save_draft' | 'select_mode' | 'set_pin' | 'set_tasks' | 'undo_layout';
export interface ActionReceipt {
  workspace: WorkspaceSnapshot;
  eventId: string;
  actionId: string;
  appliedRevision: number;
  changed: boolean;
  duplicate: boolean;
  [key: string]: unknown;
}
export interface DecisionRequest { text: string; state: Workspace; requestId: string; contextVersion: number }
export interface DecisionProposal extends Decision {
  requestId: string;
  contextVersion: number;
  baseRevision: number;
  [key: string]: unknown;
}

export class WorkspaceClientError extends Error {
  code: string;
  statusCode: number;
  workspace?: WorkspaceSnapshot;
  constructor(code: string, message: string, statusCode = 0, workspace?: WorkspaceSnapshot) {
    super(message);
    this.name = 'WorkspaceClientError';
    this.code = code;
    this.statusCode = statusCode;
    this.workspace = workspace;
  }
}

const messages: Record<string, string> = {
  INVALID_ACTION: '动作格式无效，请检查后重试。',
  INVALID_WORKSPACE: '工作区格式无效，请重新打开页面。',
  WORKSPACE_NOT_FOUND: '工作区不存在，请重新打开页面。',
  ACTION_ID_CONFLICT: '动作编号冲突，请重新发起操作。',
  REVISION_CONFLICT: '工作区已有新修改，请同步后重试。',
  LAYOUT_PINNED: '布局已固定，请取消固定或手动切换。',
  NOTHING_TO_UNDO: '当前没有可撤销的布局变化。',
  UNDO_CONFLICT: '布局已变化，不能撤销此记录。',
};
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function snapshot(value: unknown): WorkspaceSnapshot {
  if (!record(value) || typeof value.id !== 'string' || !value.id ||
    typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 0 ||
    typeof value.canUndo !== 'boolean' || !record(value.state)) {
    throw new WorkspaceClientError('INVALID_RESPONSE', '服务返回无效的工作区，当前内容已保留。');
  }
  const state = value.state;
  if (!isMode(state.mode) || typeof state.note !== 'string' || typeof state.pinned !== 'boolean' ||
    !record(state.meeting) || typeof state.meeting.title !== 'string' ||
    typeof state.meeting.date !== 'string' || typeof state.meeting.time !== 'string' ||
    !Array.isArray(state.tasks) || state.tasks.some((task) => typeof task !== 'string')) {
    throw new WorkspaceClientError('INVALID_RESPONSE', '服务返回无效的工作区，当前内容已保留。');
  }
  return structuredClone(value) as unknown as WorkspaceSnapshot;
}

export function createWorkspaceClient({ fetcher = fetch }: { fetcher?: typeof fetch } = {}) {
  let current: WorkspaceSnapshot | null = null;
  let queue: Promise<void> = Promise.resolve();
  let loading: Promise<WorkspaceSnapshot> | null = null;

  function adopt(raw: unknown) {
    const next = snapshot(raw);
    if (current && next.id !== current.id) {
      throw new WorkspaceClientError('SESSION_CHANGED', '工作区身份已变化，请重新打开页面。');
    }
    if (!current || next.revision >= current.revision) current = next;
    return structuredClone(current);
  }

  async function request(path: string, init: RequestInit = {}) {
    let response: Response;
    try {
      response = await fetcher(path, { credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        ...init, headers: { 'Content-Type': 'application/json', ...init.headers } });
    } catch (error) {
      if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) throw error;
      throw new WorkspaceClientError('NETWORK_ERROR', '无法连接工作区服务，请稍后重试。');
    }
    let body: unknown;
    try { body = await response.json(); }
    catch {
      if (response.ok) throw new WorkspaceClientError('INVALID_RESPONSE', '服务返回无效响应，当前内容已保留。');
      body = {};
    }
    if (!response.ok) {
      const code = record(body) && typeof body.code === 'string' && /^[A-Z_]{1,64}$/.test(body.code)
        ? body.code : `HTTP_${response.status}`;
      const latest = path === '/api/actions' && response.status === 409 && record(body) && body.workspace
        ? adopt(body.workspace) : undefined;
      const fallback = response.status === 409 ? '工作区已有新修改，请同步后重试。'
        : response.status === 429 ? '请求过于频繁，请稍后重试。'
        : response.status >= 500 ? '服务暂时无法完成请求，当前内容已保留。' : '请求无法完成，请检查后重试。';
      throw new WorkspaceClientError(code, messages[code] || fallback, response.status, latest);
    }
    if (!record(body)) throw new WorkspaceClientError('INVALID_RESPONSE', '服务返回无效响应，当前内容已保留。');
    return body;
  }

  function load(): Promise<WorkspaceSnapshot> {
    if (!loading) loading = request('/api/workspace').then((body) => adopt(body.workspace ?? body))
      .finally(() => { loading = null; });
    return loading;
  }

  function action(kind: ActionKind, args: Record<string, unknown>, { actionId = crypto.randomUUID() }: { actionId?: string } = {}): Promise<ActionReceipt> {
    const captured = structuredClone(args);
    const operation = queue.then(async () => {
      if (!current) await load();
      const body = await request('/api/actions', { method: 'POST',
        body: JSON.stringify({ actionId, expectedRevision: current!.revision, kind, args: captured }) });
      return { ...body, workspace: adopt(body.workspace) } as ActionReceipt;
    });
    // A rejected operation is still returned to its caller; the next operation can run.
    queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async function decision(input: DecisionRequest, signal?: AbortSignal): Promise<DecisionProposal> {
    const captured = structuredClone(input);
    if (!current) await load();
    const baseRevision = current!.revision;
    const body = await request('/api/decisions', { method: 'POST', signal,
      body: JSON.stringify({ ...captured, baseRevision }) });
    if (!acceptDecision(body) || body.baseRevision !== baseRevision || body.requestId !== captured.requestId ||
      body.contextVersion !== captured.contextVersion) {
      throw new WorkspaceClientError('INVALID_RESPONSE', '服务返回无效的组合建议，当前界面已保留。');
    }
    return body as unknown as DecisionProposal;
  }

  return { load, action, decision,
    get revision() { return current?.revision ?? 0; },
    get workspaceId() { return current?.id ?? null; } };
}
