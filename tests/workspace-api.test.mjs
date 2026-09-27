import test from 'node:test';
import assert from 'node:assert/strict';
import { get as httpGet } from 'node:http';
import { createAppServer } from '../server/index.mjs';

async function fixture(t, options = {}) {
  const server = createAppServer({ apiKey: '', allowedOrigins: ['http://localhost:5173'], ...options });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise((resolve) => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const first = await fetch(base + '/api/workspace');
  const cookie = first.headers.get('set-cookie').split(';')[0];
  const { workspace } = await first.json();
  const get = () => fetch(base + '/api/workspace', { headers: { Cookie: cookie } }).then((r) => r.json());
  const post = (path, body, extra = {}) => fetch(base + path, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173', Cookie: cookie, ...extra },
    body: JSON.stringify(body) });
  return { base, workspace, cookie, get, post };
}

test('HTTP workspaces are cookie-isolated and model suggestions do not write data', async (t) => {
  const f = await fixture(t);
  const second = await (await fetch(f.base + '/api/workspace')).json();
  assert.notEqual(second.workspace.id, f.workspace.id);
  const result = await (await f.post('/api/decisions', { text: '约个时间讨论',
    requestId: 'request-1', contextVersion: 2, baseRevision: 0 })).json();
  assert.equal(result.source, 'rules');
  assert.equal(result.choice, 'meeting');
  assert.deepEqual(result.proposal, { mode: 'meeting' });
  assert.equal(result.contextVersion, 2);
  assert.equal((await f.get()).workspace.revision, 0);
  assert.equal((await f.get()).workspace.state.mode, 'read');
});

test('HTTP actions preserve idempotency and expose conflicts without overwriting drafts', async (t) => {
  const f = await fixture(t);
  const action = { actionId: 'save-note', expectedRevision: 0, kind: 'save_draft', args: { note: '真实保存的议程' } };
  const first = await (await f.post('/api/actions', action)).json();
  const repeated = await (await f.post('/api/actions', action)).json();
  assert.equal(first.workspace.revision, 1);
  assert.equal(repeated.eventId, first.eventId);
  assert.equal(repeated.duplicate, true);
  assert.equal(repeated.workspace.revision, 1);
  const conflict = await f.post('/api/actions', { ...action, actionId: 'second-save', args: { note: '过时的草稿' } });
  assert.equal(conflict.status, 409);
  const detail = await conflict.json();
  assert.equal(detail.code, 'REVISION_CONFLICT');
  assert.equal(detail.workspace.state.note, '真实保存的议程');
  const other = await (await fetch(f.base + '/api/workspace')).json();
  assert.equal(other.workspace.state.note, '');
});

test('HTTP undo only restores layout, keeping later user edits', async (t) => {
  const f = await fixture(t);
  await f.post('/api/actions', { actionId: 'layout', expectedRevision: 0,
    kind: 'select_mode', args: { mode: 'meeting', source: 'manual' } });
  await f.post('/api/actions', { actionId: 'note', expectedRevision: 1,
    kind: 'save_draft', args: { note: '布局变化后的最新笔记', meeting: { title: '保留这个主题' } } });
  const restored = await (await f.post('/api/actions', { actionId: 'undo', expectedRevision: 2,
    kind: 'undo_layout', args: {} })).json();
  assert.equal(restored.workspace.state.mode, 'read');
  assert.equal(restored.workspace.state.note, '布局变化后的最新笔记');
  assert.equal(restored.workspace.state.meeting.title, '保留这个主题');
});

test('API boundary rejects foreign origins, malformed versions and oversized JSON', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.post('/api/actions', {}, { Origin: 'https://foreign.example' })).status, 403);
  assert.equal((await f.post('/api/decisions', { text: '开会', baseRevision: 0 })).status, 400);
  assert.equal((await f.post('/api/actions', { value: 'x'.repeat(70000) })).status, 413);
  const stale = await f.post('/api/decisions', { text: '开会', requestId: 'old', contextVersion: 1, baseRevision: 100 });
  assert.equal(stale.status, 409);
  const headers = await fetch(f.base + '/api/workspace');
  assert.match(headers.headers.get('set-cookie'), /HttpOnly/);
  assert.match(headers.headers.get('set-cookie'), /SameSite=Lax/);
});

test('model results are version-tagged and a canceled caller never changes task state', async (t) => {
  const f = await fixture(t, { apiKey: 'hidden-test-key', fetcher: async () => Response.json({
    model: 'jev-mock', answers: { composition: { type: 'choice', choice: 'review', confidence: 0.9 } },
  }) });
  const response = await f.post('/api/decisions', { text: '异步评审', requestId: 'real-1',
    baseRevision: 0, contextVersion: 7 });
  const d = await response.json();
  assert.equal(d.source, 'jev');
  assert.equal(d.baseRevision, 0);
  assert.equal(d.contextVersion, 7);
  assert.equal(JSON.stringify(d).includes('hidden-test-key'), false);
  assert.equal((await f.get()).workspace.state.mode, 'read');
});

test('a late provider response is superseded by the newest workspace request', async (t) => {
  let releaseFirst;
  let began;
  let calls = 0;
  const started = new Promise((resolve) => { began = resolve; });
  const answer = (choice) => Response.json({ answers: { composition: { type: 'choice', choice, confidence: 0.9 } } });
  const f = await fixture(t, { apiKey: 'mock-key', fetcher: () => {
    calls++;
    if (calls === 1) return new Promise((resolve) => { releaseFirst = () => resolve(answer('meeting')); began(); });
    return Promise.resolve(answer('review'));
  } });
  const first = f.post('/api/decisions', { text: '安排会议', requestId: 'first', baseRevision: 0, contextVersion: 1 });
  await started;
  const next = await f.post('/api/decisions', { text: '异步评审', requestId: 'next', baseRevision: 0, contextVersion: 2 });
  assert.equal((await next.json()).choice, 'review');
  releaseFirst();
  const old = await first;
  assert.equal(old.status, 409);
  assert.equal((await old.json()).code, 'SUPERSEDED');
  assert.equal((await f.get()).workspace.revision, 0);
});

test('provider timeout returns a recoverable error while committed data remains readable', async (t) => {
  const f = await fixture(t, { apiKey: 'mock-key', modelTimeoutMs: 100,
    fetcher: (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    }) });
  const response = await f.post('/api/decisions', { text: '安排会议', requestId: 'slow', baseRevision: 0, contextVersion: 1 });
  assert.equal(response.status, 504);
  assert.equal((await f.get()).workspace.state.mode, 'read');
  assert.equal((await f.get()).workspace.revision, 0);
});

test('public HTTPS cookies are secure without breaking the local preview cookie', async (t) => {
  const f = await fixture(t, { allowedOrigins: ['http://localhost:5173', 'https://preview.example'] });
  const local = await fetch(f.base + '/api/workspace');
  assert.doesNotMatch(local.headers.get('set-cookie'), /; Secure/);
  const publicCookies = await new Promise((resolve, reject) => {
    httpGet(f.base + '/api/workspace', { headers: { Host: 'preview.example' } }, (response) => {
      resolve(response.headers['set-cookie']?.join('; '));
      response.resume();
    }).on('error', reject);
  });
  assert.match(publicCookies, /; Secure/);
});
