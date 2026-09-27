import { hydrate, initialWorkspace, isMode } from '../workspace';
import type { Mode } from '../workspace';
import type { ActionKind, ActionReceipt, DecisionProposal, DecisionRequest, WorkspaceSnapshot } from '../persistence';

const storage = 'jevos-browser-workspace';
export function createLocalWorkspaceClient() {
  let current: WorkspaceSnapshot = { id: 'jevos-browser', state: initialWorkspace(), revision: 0, canUndo: false };
  const history: Mode[] = [];
  try {
    const saved = JSON.parse(localStorage.getItem(storage) || 'null');
    if (saved?.state) current = { ...current, state: hydrate(saved.state), revision: Number.isSafeInteger(saved.revision) ? saved.revision : 0 };
  } catch { /* Start a fresh browser workspace. */ }
  const save = () => { localStorage.setItem(storage, JSON.stringify(current)); return structuredClone(current); };
  return {
    async load() { return structuredClone(current); },
    async action(kind: ActionKind, args: Record<string, unknown>): Promise<ActionReceipt> {
      const state = current.state;
      if (kind === 'save_draft') {
        if (typeof args.note === 'string') state.note = args.note;
        if (args.meeting && typeof args.meeting === 'object') state.meeting = hydrate({ ...state, meeting: { ...state.meeting, ...args.meeting } }).meeting;
      }
      if (kind === 'select_mode' && isMode(args.mode)) { history.push(state.mode); state.mode = args.mode; }
      if (kind === 'set_pin') state.pinned = args.pinned === true;
      if (kind === 'set_tasks') state.tasks = hydrate({ ...state, tasks: args.tasks }).tasks;
      if (kind === 'undo_layout' && history.length) state.mode = history.pop()!;
      current.revision++; current.canUndo = history.length > 0;
      return { workspace: save(), eventId: crypto.randomUUID(), actionId: crypto.randomUUID(), appliedRevision: current.revision, changed: true, duplicate: false };
    },
    async decision(input: DecisionRequest): Promise<DecisionProposal> {
      const choice = /会议|meeting|日历/i.test(input.text) ? 'meeting' : /评审|review|待办/i.test(input.text) ? 'review' : /笔记|note/i.test(input.text) ? 'notes' : 'read';
      return { choice, confidence: null, source: 'rules', elapsedMs: 0, reason: '浏览器本地组合', requestId: input.requestId, contextVersion: input.contextVersion, baseRevision: current.revision };
    },
    get revision() { return current.revision; },
    get workspaceId() { return current.id; },
  };
}
