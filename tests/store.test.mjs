import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createWorkspaceStore } from '../server/store.mjs';

function setup(t, options) {
  const store = createWorkspaceStore(options);
  t.after(() => store.close());
  return { store, ...store.getOrCreateWorkspace() };
}
const command = (revision, kind, args, actionId = randomUUID()) => ({ actionId, expectedRevision: revision, kind, args });
const errorCode = (code, statusCode) => (error) => error.code === code && error.statusCode === statusCode;

test('workspaces have independent secure tokens and only token hashes are persisted', (t) => {
  const { store, token } = setup(t);
  const second = store.getOrCreateWorkspace();
  assert.equal(Buffer.from(token, 'base64url').length, 32);
  assert.notEqual(token, second.token);
  assert.equal(store.getOrCreateWorkspace(token).created, false);
  const firstCommand = command(0, 'save_draft', { note: '私有笔记' });
  store.applyAction(token, firstCommand);
  assert.equal(store.getWorkspace(second.token).state.note, '');
  store.applyAction(second.token, { ...firstCommand, args: { note: '另一位访客' } });
  assert.equal(store.getWorkspace(token).state.note, '私有笔记');
  assert.equal(store.getWorkspace('invalid-token'), null);
  assert.throws(() => store.applyAction(second.token, { ...command(0, 'set_pin', { pinned: true }), workspaceId: store.getWorkspace(token).id }), errorCode('INVALID_ACTION', 400));
});

test('committed workspace and undo history survive closing and reopening SQLite', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'vibeos-store-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const filename = join(dir, 'workspace.sqlite');
  const first = createWorkspaceStore({ filename });
  const { token } = first.getOrCreateWorkspace();
  first.applyAction(token, command(0, 'select_mode', { mode: 'meeting', source: 'manual' }));
  first.applyAction(token, command(1, 'save_draft', { note: '重启后保留' }));
  first.close();
  const reopened = createWorkspaceStore({ filename });
  t.after(() => reopened.close());
  assert.deepEqual(reopened.getWorkspace(token).state.note, '重启后保留');
  assert.equal(reopened.getWorkspace(token).revision, 2);
  assert.equal(reopened.getWorkspace(token).canUndo, true);
  assert.equal(readFileSync(filename).includes(Buffer.from(token)), false);
});

test('idempotent retries return their original receipt before checking an old revision', (t) => {
  const { store, token } = setup(t);
  const action = command(0, 'save_draft', { note: '首次保存' });
  const first = store.applyAction(token, action);
  store.applyAction(token, command(1, 'save_draft', { note: '最新保存' }));
  const retry = store.applyAction(token, action);
  assert.equal(retry.duplicate, true);
  assert.equal(retry.eventId, first.eventId);
  assert.equal(retry.appliedRevision, 1);
  assert.equal(retry.workspace.revision, 2);
  assert.equal(retry.workspace.state.note, '最新保存');
  assert.throws(() => store.applyAction(token, { ...action, args: { note: '不同内容' } }), errorCode('ACTION_ID_CONFLICT', 409));
  assert.equal(store.getWorkspace(token).revision, 2);
});

test('the same revision cannot overwrite a second committed action', (t) => {
  const { store, token } = setup(t);
  store.applyAction(token, command(0, 'save_draft', { note: '先提交' }));
  assert.throws(() => store.applyAction(token, command(0, 'save_draft', { note: '后提交' })), errorCode('REVISION_CONFLICT', 409));
  assert.equal(store.getWorkspace(token).state.note, '先提交');
});

test('layout undo preserves later drafts, pin and tasks and does not oscillate', (t) => {
  const { store, token } = setup(t);
  store.applyAction(token, command(0, 'select_mode', { mode: 'meeting', source: 'manual' }));
  store.applyAction(token, command(1, 'select_mode', { mode: 'review', source: 'manual' }));
  store.applyAction(token, command(2, 'save_draft', { note: '最新笔记', meeting: { title: '最新议程' } }));
  store.applyAction(token, command(3, 'set_tasks', { tasks: ['已编辑任务'] }));
  store.applyAction(token, command(4, 'set_pin', { pinned: true }));
  const undone = store.applyAction(token, command(5, 'undo_layout', {}));
  assert.equal(undone.workspace.state.mode, 'meeting');
  assert.equal(undone.workspace.state.note, '最新笔记');
  assert.equal(undone.workspace.state.meeting.title, '最新议程');
  assert.equal(undone.workspace.state.pinned, true);
  assert.deepEqual(undone.workspace.state.tasks, ['已编辑任务']);
  const second = store.applyAction(token, command(6, 'undo_layout', {}));
  assert.equal(second.workspace.state.mode, 'read');
  assert.equal(second.workspace.canUndo, false);
  assert.throws(() => store.applyAction(token, command(7, 'undo_layout', {})), errorCode('NOTHING_TO_UNDO', 409));
  assert.equal(store.getWorkspace(token).revision, 7);
});

test('automatic layouts respect pinning while explicit manual choices remain available', (t) => {
  const { store, token } = setup(t);
  store.applyAction(token, command(0, 'set_pin', { pinned: true }));
  assert.throws(() => store.applyAction(token, command(1, 'select_mode', { mode: 'meeting', source: 'automatic' })), errorCode('LAYOUT_PINNED', 409));
  assert.equal(store.getWorkspace(token).revision, 1);
  assert.equal(store.applyAction(token, command(1, 'select_mode', { mode: 'meeting', source: 'manual' })).workspace.state.mode, 'meeting');
});

test('invalid actions, unknown properties, lengths and impossible dates do not mutate state', (t) => {
  const { store, token } = setup(t);
  const invalid = [
    command(0, 'send_email', {}),
    command(0, 'save_draft', { mode: 'meeting' }),
    command(0, 'save_draft', {}),
    command(0, 'save_draft', { meeting: {} }),
    command(0, 'save_draft', { note: 'x'.repeat(10001) }),
    command(0, 'save_draft', { meeting: { title: 'x'.repeat(201) } }),
    command(0, 'save_draft', { meeting: { date: '2026-02-29' } }),
    command(0, 'save_draft', { meeting: { date: '2026-02-30' } }),
    command(0, 'save_draft', { meeting: { date: '0000-01-01' } }),
    command(0, 'save_draft', { meeting: { time: '24:00' } }),
    command(0, 'select_mode', { mode: 'other', source: 'manual' }),
    command(0, 'select_mode', { mode: 'read', source: 'fake' }),
    command(0, 'set_pin', { pinned: 'yes' }),
    command(0, 'set_tasks', { tasks: [' '] }),
    command(0, 'set_tasks', { tasks: Array(31).fill('task') }),
    command(0, 'set_tasks', { tasks: ['x'.repeat(301)] }),
  ];
  for (const action of invalid) assert.throws(() => store.applyAction(token, action), errorCode('INVALID_ACTION', 400));
  assert.equal(store.getWorkspace(token).revision, 0);
  assert.throws(() => store.applyAction(token, command(0, 'undo_layout', {})), errorCode('NOTHING_TO_UNDO', 409));
  assert.equal(store.getWorkspace(token).revision, 0);
  assert.equal(store.applyAction(token, command(0, 'save_draft', { meeting: { date: '2028-02-29', time: '23:59' } })).workspace.state.meeting.date, '2028-02-29');
});

test('no-op actions retain revision and layout undo is limited to thirty transitions', (t) => {
  const { store, token } = setup(t);
  const unchanged = store.applyAction(token, command(0, 'select_mode', { mode: 'read', source: 'manual' }));
  assert.equal(unchanged.changed, false);
  assert.equal(unchanged.workspace.revision, 0);
  for (let i = 0; i < 35; i++) {
    store.applyAction(token, command(i, 'select_mode', { mode: i % 2 ? 'read' : 'meeting', source: 'manual' }));
  }
  for (let i = 0; i < 30; i++) store.applyAction(token, command(35 + i, 'undo_layout', {}));
  assert.equal(store.getWorkspace(token).revision, 65);
  assert.equal(store.getWorkspace(token).canUndo, false);
  assert.throws(() => store.applyAction(token, command(65, 'undo_layout', {})), errorCode('NOTHING_TO_UNDO', 409));
});
