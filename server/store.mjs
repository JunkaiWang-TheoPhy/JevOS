import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { actionChanges, actionError, defaultWorkspace, validateAction, validateWorkspace } from './actions.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

export function createWorkspaceStore({ filename = ':memory:', initialState = defaultWorkspace } = {}) {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  if (filename !== ':memory:') chmodSync(filename, 0o600);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
      state_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      action_id TEXT NOT NULL, request_hash TEXT NOT NULL, kind TEXT NOT NULL,
      before_json TEXT NOT NULL, after_json TEXT NOT NULL, receipt_json TEXT NOT NULL,
      undoable INTEGER NOT NULL DEFAULT 0, undone INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL, UNIQUE(workspace_id, action_id)
    );
    CREATE INDEX IF NOT EXISTS events_layout ON events(workspace_id, undoable, undone);
  `);
  const findWorkspace = db.prepare('SELECT id, state_json, revision FROM workspaces WHERE token_hash = ?');
  const findEvent = db.prepare('SELECT request_hash, receipt_json FROM events WHERE workspace_id = ? AND action_id = ?');
  const findUndo = db.prepare("SELECT id, before_json, after_json FROM events WHERE workspace_id = ? AND undoable = 1 AND undone = 0 ORDER BY rowid DESC LIMIT 1");
  const updateState = db.prepare('UPDATE workspaces SET state_json = ?, revision = ? WHERE id = ? AND revision = ?');
  const insertEvent = db.prepare(`INSERT INTO events
    (id, workspace_id, action_id, request_hash, kind, before_json, after_json, receipt_json, undoable, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const retireHistory = db.prepare(`UPDATE events SET undoable = 0 WHERE workspace_id = ? AND undoable = 1 AND undone = 0
    AND id NOT IN (SELECT id FROM events WHERE workspace_id = ? AND undoable = 1 AND undone = 0 ORDER BY rowid DESC LIMIT 30)`);

  function rowForToken(token) {
    return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token) ? findWorkspace.get(hash(token)) : undefined;
  }
  function workspace(row) {
    return { id: row.id, state: JSON.parse(row.state_json), revision: row.revision, canUndo: Boolean(findUndo.get(row.id)) };
  }
  function getWorkspace(token) {
    const row = rowForToken(token);
    return row ? workspace(row) : null;
  }
  function getOrCreateWorkspace(token) {
    const existing = getWorkspace(token);
    if (existing) return { token, created: false, workspace: existing };
    const state = validateWorkspace(typeof initialState === 'function' ? initialState() : initialState);
    const nextToken = randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO workspaces (id, token_hash, state_json) VALUES (?, ?, ?)')
      .run(randomUUID(), hash(nextToken), JSON.stringify(state));
    return { token: nextToken, created: true, workspace: getWorkspace(nextToken) };
  }
  function applyAction(token, value) {
    const action = validateAction(value);
    const requestHash = hash(JSON.stringify(canonical(action)));
    db.exec('BEGIN IMMEDIATE');
    try {
      const row = rowForToken(token);
      if (!row) throw actionError(404, 'WORKSPACE_NOT_FOUND', '工作区不存在，请重新打开页面。');
      const prior = findEvent.get(row.id, action.actionId);
      if (prior) {
        if (prior.request_hash !== requestHash) throw actionError(409, 'ACTION_ID_CONFLICT', '此动作编号已用于不同请求。');
        const result = { ...JSON.parse(prior.receipt_json), duplicate: true, workspace: workspace(row) };
        db.exec('COMMIT');
        return result;
      }
      if (row.revision !== action.expectedRevision) {
        throw actionError(409, 'REVISION_CONFLICT', '工作区已有新修改，请同步后重试。');
      }
      const state = JSON.parse(row.state_json);
      let changes;
      let undoneEvent;
      if (action.kind === 'undo_layout') {
        undoneEvent = findUndo.get(row.id);
        if (!undoneEvent) throw actionError(409, 'NOTHING_TO_UNDO', '当前没有可撤销的布局变化。');
        if (state.mode !== JSON.parse(undoneEvent.after_json).mode) {
          throw actionError(409, 'UNDO_CONFLICT', '布局已发生其他变化，不能撤销此记录。');
        }
        changes = JSON.parse(undoneEvent.before_json);
      } else {
        changes = actionChanges(state, action);
      }
      const before = {}, after = {};
      for (const [key, next] of Object.entries(changes)) {
        if (JSON.stringify(state[key]) !== JSON.stringify(next)) { before[key] = state[key]; after[key] = next; }
      }
      const changed = Object.keys(after).length > 0;
      const nextState = validateWorkspace({ ...state, ...after });
      const revision = row.revision + Number(changed);
      if (changed && updateState.run(JSON.stringify(nextState), revision, row.id, row.revision).changes !== 1) {
        throw actionError(409, 'REVISION_CONFLICT', '工作区已有新修改，请同步后重试。');
      }
      if (undoneEvent) db.prepare('UPDATE events SET undone = 1 WHERE id = ?').run(undoneEvent.id);
      const receipt = { eventId: randomUUID(), actionId: action.actionId, appliedRevision: revision, changed, duplicate: false };
      insertEvent.run(receipt.eventId, row.id, action.actionId, requestHash, action.kind,
        JSON.stringify(before), JSON.stringify(after), JSON.stringify(receipt),
        Number(changed && action.kind === 'select_mode'), Date.now());
      retireHistory.run(row.id, row.id);
      const result = { ...receipt, workspace: getWorkspace(token) };
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return { getOrCreateWorkspace, getWorkspace, applyAction, close: () => db.close() };
}
