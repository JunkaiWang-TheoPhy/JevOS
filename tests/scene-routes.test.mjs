import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createWorkspaceStore } from '../server/store.mjs';
import { createGeneratedAppStore } from '../server/generated-app-store.mjs';
import { createWorkspaceHandler } from '../server/workspace-api.mjs';
import { createSceneHandler } from '../server/scene-routes.mjs';

const origin = 'http://localhost:5173';
const input = (requestId = 'scene-1') => ({ requestId, baseRevision: 0, desktopRevision: 1,
  text: '日历在左边三分之一，笔记在右边三分之二', viewport: { width: 1200, height: 700 },
  windows: [{ windowId: 'notes', appId: 'notes', rect: { x: 640, y: 80, width: 360, height: 350 }, minimized: false, pinned: false, editing: false }], activeWindowId: 'notes' });

async function fixture(t, options = {}) {
  const store = createWorkspaceStore(); const appStore = createGeneratedAppStore();
  const workspace = createWorkspaceHandler({ store, allowedOrigins: [origin], sessionCookieName: 'scene-preview' });
  const scene = createSceneHandler({ store, appStore, allowedOrigins: [origin], sessionCookieName: 'scene-preview', ...options });
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (await workspace(req, res, path) || await scene(req, res, path)) return;
    res.writeHead(404); res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base + '/api/workspace');
  const cookie = response.headers.get('set-cookie').split(';')[0];
  t.after(async () => { scene.close(); workspace.close(); server.closeAllConnections();
    await new Promise(resolve => server.close(resolve)); appStore.close(); store.close(); });
  return { store, appStore, scene, cookie, base, token: cookie.split('=')[1],
    post: (body, headers = {}) => fetch(base + '/api/scenes/plan', { method: 'POST', headers: {
      Cookie: cookie, Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }) };
}

test('scene HTTP returns versioned window operations without modifying workspace data', async t => {
  const f = await fixture(t);
  const r = await f.post(input()); assert.equal(r.status, 200);
  const result = await r.json();
  assert.equal(result.source, 'rules'); assert.equal(result.desktopRevision, 1); assert.equal(result.baseRevision, 0);
  assert.ok(result.operations.some(op => op.type === 'place'));
  assert.ok(result.trace.length > 0);
  assert.equal(f.store.getWorkspace(f.token).revision, 0);
  const again = await f.post(input()); assert.equal(again.status, 200);
  assert.equal((await again.json()).duplicate, true);
  assert.equal((await f.post({ ...input(), text: '另一条指令' })).status, 409);
});

test('scene API rejects missing preview cookie, foreign origin, stale revisions and oversized input', async t => {
  const f = await fixture(t);
  assert.equal((await f.post(input(), { Cookie: '' })).status, 401);
  assert.equal((await f.post(input(), { Cookie: `vibeos-session=${f.token}` })).status, 401);
  assert.equal((await f.post(input(), { Origin: 'https://foreign.example' })).status, 403);
  assert.equal((await f.post({ ...input(), baseRevision: 42 })).status, 409);
  assert.equal((await f.post({ ...input(), desktopRevision: -1 })).status, 400);
  assert.equal((await f.post({ ...input(), text: 'x'.repeat(50000) })).status, 413);
});

test('scene context only exposes generated apps belonging to the authenticated workspace', async t => {
  let seen;
  const f = await fixture(t, { plan: async (_input, options) => { seen = options.apps; return { operations: [] }; } });
  const other = f.store.getOrCreateWorkspace();
  const pkg = { title: 'Private timer', html: '<button>Start</button>', css: '', js: '', initialState: {} };
  const own = f.appStore.save(f.store.getWorkspace(f.token).id, 'own timer', pkg);
  const foreign = f.appStore.save(other.workspace.id, 'foreign timer', pkg);
  assert.equal((await f.post(input())).status, 200);
  assert.ok(seen.some(app => app.id === `generated:${own.id}`));
  assert.ok(!seen.some(app => app.id === `generated:${foreign.id}`));
});

test('late scene result cannot override a newer request', async t => {
  let release, started; const began = new Promise(resolve => { started = resolve; });
  const f = await fixture(t, { plan: async value => {
    if (value.requestId === 'first') { started(); await new Promise(resolve => { release = resolve; }); }
    return { operations: [], explanation: value.requestId };
  } });
  const first = f.post(input('first')); await began;
  const next = await f.post(input('next')); assert.equal(next.status, 200);
  release(); const old = await first; assert.equal(old.status, 409); assert.equal((await old.json()).code, 'SUPERSEDED');
});

test('workspace edits made during planning invalidate the scene result', async t => {
  let release, started; const began = new Promise(resolve => { started = resolve; });
  const f = await fixture(t, { plan: async () => { started(); await new Promise(resolve => { release = resolve; }); return { operations: [] }; } });
  const pending = f.post(input()); await began;
  f.store.applyAction(f.token, { actionId: 'note', expectedRevision: 0, kind: 'save_draft', args: { note: 'keep new edit' } });
  release(); const r = await pending; assert.equal(r.status, 409);
  assert.equal((await r.json()).code, 'REVISION_CONFLICT');
  assert.equal(f.store.getWorkspace(f.token).state.note, 'keep new edit');
});

test('scene time budget and rate limits fail without changing workspace', async t => {
  const f = await fixture(t, { timeoutMs: 100, maxPlansPerMinute: 1,
    plan: (_value, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })) });
  const r = await f.post(input()); assert.equal(r.status, 504);
  assert.equal((await r.json()).code, 'SCENE_TIMEOUT');
  assert.equal((await f.post(input('next'))).status, 429);
  assert.equal(f.store.getWorkspace(f.token).revision, 0);
});

test('a non-cooperative planner still obeys the HTTP time budget', async t => {
  const f = await fixture(t, { timeoutMs: 100, plan: () => new Promise(() => {}) });
  const r = await f.post(input()); assert.equal(r.status, 504);
  assert.equal((await r.json()).code, 'SCENE_TIMEOUT');
});

test('scene shutdown cancels pending planning promptly', async t => {
  let started; const began = new Promise(resolve => { started = resolve; });
  const f = await fixture(t, { plan: () => { started(); return new Promise(() => {}); } });
  const pending = f.post(input()); await began;
  const response = await fetch(f.base + '/api/scenes/plan', { method: 'GET' });
  assert.equal(response.status, 405);
  f.scene.close();
  assert.equal((await pending).status, 409);
});

test('close-all HTTP never calls the configured model or deletes saved note data', async t => {
  let calls = 0;
  const f = await fixture(t, { apiKey: 'mock-key', fetcher: async () => { calls++; throw new Error('model unavailable'); } });
  f.store.applyAction(f.token, { actionId: 'saved-note', expectedRevision: 0,
    kind: 'save_draft', args: { note: '保留关闭前的笔记' } });
  const r = await f.post({ ...input(), baseRevision: 1, text: '关闭所有' });
  assert.equal(r.status, 200);
  const result = await r.json();
  assert.equal(result.source, 'rules');
  assert.deepEqual(result.operations, [{ type: 'close', windowId: 'notes' }]);
  assert.equal(calls, 0);
  assert.equal(f.store.getWorkspace(f.token).state.note, '保留关闭前的笔记');
  assert.equal(f.store.getWorkspace(f.token).revision, 1);
});
