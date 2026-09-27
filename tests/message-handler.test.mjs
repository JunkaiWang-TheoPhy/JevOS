import test from 'node:test';
import assert from 'node:assert/strict';
import { localSimulatedMessage } from '../server/message-sim-handler.mjs';
import { createMessageSimulationHandler } from '../server/message-sim-handler.mjs';
import { createServer } from 'node:http';
import { createWorkspaceStore } from '../server/store.mjs';
import { createGeneratedAppStore } from '../server/generated-app-store.mjs';
import { createWorkspaceHandler } from '../server/workspace-api.mjs';
test('local server simulation uses latest context without claiming delivery', () => {
  const text = localSimulatedMessage('加入休息提醒', { note: '还要喝水', apps: [{ title: '旧项目' }, { title: '新的番茄钟' }] });
  assert.match(text, /新的番茄钟/); assert.match(text, /加入休息提醒/); assert.match(text, /还要喝水/); assert.doesNotMatch(text, /模拟|未发送邮件/);
});

async function fixture(t, options = {}) {
  const store = createWorkspaceStore(); const appStore = createGeneratedAppStore();
  const origin = 'http://localhost:5173';
  const workspace = createWorkspaceHandler({ store, allowedOrigins: [origin], sessionCookieName: 'message-preview' });
  const handler = createMessageSimulationHandler({ workspaceStore: store, appStore, allowedOrigins: [origin], sessionCookieName: 'message-preview', configFactory: () => ({}), ...options });
  const server = createServer(async (req,res) => { const path = new URL(req.url, 'http://localhost').pathname;
    if (await workspace(req,res,path) || await handler(req,res,path)) return; res.writeHead(404); res.end(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base + '/api/workspace'); const cookie = response.headers.get('set-cookie').split(';')[0];
  const state = await response.json();
  return { store, appStore, state, handler, post: (body, headers = {}) => fetch(base + '/api/messages/simulate', { method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }) };
}
test('simulation route enforces visitor cookie, origin and input boundaries', async t => {
  const f = await fixture(t); const body = { text: '讨论番茄钟', kind: 'reply' };
  assert.equal((await f.post(body, { Cookie: '' })).status, 401);
  assert.equal((await f.post(body, { Origin: 'https://foreign.example' })).status, 403);
  assert.equal((await f.post({ ...body, text: 'x'.repeat(2001) })).status, 400);
  const r = await f.post(body); assert.equal(r.status, 200); const value = await r.json();
  assert.equal(value.source, 'local-sim'); assert.equal(value.simulated, true); assert.match(value.text, /番茄钟/);
});
test('model simulation sees only owned app metadata and labels fictional output', async t => {
  let seen;
  const f = await fixture(t, { configFactory: () => ({ apiKey: 'fixture', model: 'fixture', baseUrl: 'https://provider.example/v1' }),
    fetcher: async (_url, options) => { seen = JSON.parse(options.body); return Response.json({ choices: [{ message: { content: JSON.stringify({ text: '可以先加入休息提醒。' }) } }] }); } });
  const own = f.state.workspace.id;
  const other = f.store.getOrCreateWorkspace().workspace.id;
  const pkg = { title: '自有番茄钟', html: '<p>25分钟</p>', css: '', js: '', initialState: {} };
  f.appStore.save(own, '25分钟后休息', pkg);
  f.appStore.save(other, '他人私有需求', { ...pkg, title: '他人应用' });
  const r = await f.post({ text: '要怎么改进？', kind: 'reply', generatedContext: { title: '自有番茄钟', prompt: '25分钟后休息' } });
  assert.equal(r.status, 200); const value = await r.json(); assert.equal(value.source, 'model-sim'); assert.equal(value.simulated, true); assert.equal(value.text, '可以先加入休息提醒。');
  const context = JSON.parse(seen.messages[1].content).context;
  assert.equal(context.apps.length, 1); assert.equal(context.apps[0].title, '自有番茄钟'); assert.equal(context.generatedRequest.prompt, '25分钟后休息');
  assert.ok(!JSON.stringify(context).includes('他人应用'));
});
test('configured provider failure is not disguised as a local or successful reply', async t => {
  const f = await fixture(t, { configFactory: () => ({ apiKey: 'fixture', model: 'fixture' }), fetcher: async () => new Response('no', { status: 503 }) });
  const r = await f.post({ text: '回复一下', kind: 'reply' }); assert.equal(r.status, 502);
  assert.equal((await r.json()).simulated, undefined);
});
test('handler close aborts active upstream work and rejects further requests', async t => {
  let started; const began = new Promise(resolve => { started = resolve; });
  const f = await fixture(t, { configFactory: () => ({ apiKey: 'fixture', model: 'fixture' }), fetcher: async (_url, options) => {
    started(); await new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  } });
  const pending = f.post({ text: '回复一下', kind: 'reply' }); await began; f.handler.close();
  assert.equal((await pending).status, 502);
  assert.equal((await f.post({ text: '另一条', kind: 'reply' })).status, 503);
  f.handler.close();
});
