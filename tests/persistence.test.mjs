import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspaceClient } from '../src/persistence.ts';
import { initialWorkspace } from '../src/workspace.ts';

const workspace = (revision = 0, state = initialWorkspace()) => ({ id: 'visitor-workspace', revision, canUndo: false, state });
const receipt = (input, revision) => ({ workspace: workspace(revision), actionId: input.actionId,
  eventId: input.actionId, appliedRevision: revision, changed: true, duplicate: false });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

test('actions are serialized and each uses the previous acknowledgement revision', async () => {
  const started = deferred(), release = deferred();
  const calls = [];
  const client = createWorkspaceClient({ fetcher: async (path, init) => {
    assert.equal(init.credentials, 'same-origin');
    if (path === '/api/workspace') return Response.json({ workspace: workspace(4) });
    const input = JSON.parse(init.body);
    calls.push(input);
    if (calls.length === 1) { started.resolve(); await release.promise; }
    return Response.json(receipt(input, input.expectedRevision + 1));
  } });
  assert.equal(client.workspaceId, null);
  await client.load();
  const first = client.action('set_pin', { pinned: true });
  const second = client.action('save_draft', { note: '后提交' });
  await started.promise;
  assert.equal(calls.length, 1);
  release.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(calls.map((call) => call.expectedRevision), [4, 5]);
  assert.notEqual(calls[0].actionId, calls[1].actionId);
  assert.equal(client.revision, 6);
  assert.equal(client.workspaceId, 'visitor-workspace');
});

test('queued action captures nested arguments before they can change', async () => {
  const started = deferred(), release = deferred();
  const calls = [];
  const client = createWorkspaceClient({ fetcher: async (path, init) => {
    if (path === '/api/workspace') return Response.json({ workspace: workspace() });
    const input = JSON.parse(init.body);
    calls.push(input);
    if (calls.length === 1) { started.resolve(); await release.promise; }
    return Response.json(receipt(input, input.expectedRevision + 1));
  } });
  const first = client.action('set_pin', { pinned: true });
  await started.promise;
  const args = { meeting: { title: '排队时议程' } };
  const second = client.action('save_draft', args);
  args.meeting.title = '后来修改';
  release.resolve();
  await Promise.all([first, second]);
  assert.equal(calls[1].args.meeting.title, '排队时议程');
});

test('a failed action does not poison the following queue and private upstream text is not exposed', async () => {
  let count = 0;
  const client = createWorkspaceClient({ fetcher: async (path, init) => {
    if (path === '/api/workspace') return Response.json({ workspace: workspace(2) });
    const input = JSON.parse(init.body);
    if (++count === 1) return Response.json({ error: 'private-secret-upstream' }, { status: 503 });
    return Response.json(receipt(input, input.expectedRevision + 1));
  } });
  await client.load();
  const first = client.action('save_draft', { note: '失败' });
  const second = client.action('save_draft', { note: '成功' });
  await assert.rejects(first, (error) => error.statusCode === 503 && !error.message.includes('private-secret'));
  assert.equal((await second).workspace.revision, 3);
});

test('late load and lower-revision action receipts cannot roll back the client', async () => {
  let gets = 0;
  let writes = 0;
  const late = deferred(), loadStarted = deferred();
  const client = createWorkspaceClient({ fetcher: async (path, init) => {
    if (path === '/api/workspace') {
      if (++gets === 1) return Response.json({ workspace: workspace(5) });
      loadStarted.resolve();
      await late.promise;
      return Response.json({ workspace: workspace(4) });
    }
    return Response.json(receipt(JSON.parse(init.body), ++writes === 1 ? 6 : 2));
  } });
  await client.load();
  const staleLoad = client.load();
  await loadStarted.promise;
  await client.action('set_pin', { pinned: true });
  late.resolve();
  assert.equal((await staleLoad).revision, 6);
  assert.equal(client.revision, 6);
  const repeated = await client.action('save_draft', { note: '重试' });
  assert.equal(repeated.workspace.revision, 6);
  assert.equal(client.revision, 6);
});

test('conflict snapshots update revision without automatically replaying the failed write', async () => {
  const calls = [];
  const client = createWorkspaceClient({ fetcher: async (path, init) => {
    if (path === '/api/workspace') return Response.json({ workspace: workspace(1) });
    const input = JSON.parse(init.body);
    calls.push(input);
    if (calls.length === 1) return Response.json({ code: 'REVISION_CONFLICT', workspace: workspace(7) }, { status: 409 });
    return Response.json(receipt(input, 8));
  } });
  await client.load();
  await assert.rejects(client.action('save_draft', { note: '冲突稿' }), (error) =>
    error.code === 'REVISION_CONFLICT' && error.workspace.revision === 7);
  assert.equal(calls.length, 1);
  assert.equal(client.revision, 7);
  await client.action('set_pin', { pinned: true }, { actionId: 'stable-action-id' });
  assert.equal(calls[1].expectedRevision, 7);
  assert.equal(calls[1].actionId, 'stable-action-id');
});

test('decision requests are read-only and return the complete matching metadata', async () => {
  const abort = new AbortController();
  let seen;
  const client = createWorkspaceClient({ fetcher: async (path, init) => {
    if (path === '/api/workspace') return Response.json({ workspace: workspace(3) });
    assert.equal(path, '/api/decisions');
    assert.equal(init.signal, abort.signal);
    seen = JSON.parse(init.body);
    return Response.json({ choice: 'review', confidence: 0.9, source: 'jev', elapsedMs: 25,
      requestId: seen.requestId, contextVersion: seen.contextVersion, baseRevision: seen.baseRevision,
      model: 'jev-test', workspace: workspace(99) });
  } });
  await client.load();
  const result = await client.decision({ text: '改成异步评审', state: initialWorkspace(), requestId: 'intent-1', contextVersion: 12 }, abort.signal);
  assert.equal(seen.baseRevision, 3);
  assert.equal(result.model, 'jev-test');
  assert.equal(result.contextVersion, 12);
  assert.equal(client.revision, 3);
});

test('a rejected decision carrying a workspace cannot mutate revision', async () => {
  const client = createWorkspaceClient({ fetcher: async (path) => {
    if (path === '/api/workspace') return Response.json({ workspace: workspace(3) });
    return Response.json({ code: 'REVISION_CONFLICT', workspace: workspace(100) }, { status: 409 });
  } });
  await client.load();
  await assert.rejects(client.decision({ text: '评审', state: initialWorkspace(), requestId: 'intent-1', contextVersion: 3 }),
    (error) => error.code === 'REVISION_CONFLICT');
  assert.equal(client.revision, 3);
});

test('malformed snapshots and mismatched proposal metadata never change accepted state', async () => {
  const client = createWorkspaceClient({ fetcher: async (path) => {
    if (path === '/api/workspace') return Response.json({ workspace: workspace(2) });
    return Response.json({ choice: 'review', confidence: 0.9, source: 'jev', elapsedMs: 1,
      requestId: 'wrong-request', contextVersion: 8, baseRevision: 2 });
  } });
  await client.load();
  await assert.rejects(client.decision({ text: '评审', state: initialWorkspace(), requestId: 'correct-request', contextVersion: 8 }),
    (error) => error.code === 'INVALID_RESPONSE');
  assert.equal(client.revision, 2);
  const broken = createWorkspaceClient({ fetcher: async () => Response.json({ workspace: { ...workspace(), revision: -1 } }) });
  await assert.rejects(broken.load(), (error) => error.code === 'INVALID_RESPONSE');
  assert.equal(broken.workspaceId, null);
});
