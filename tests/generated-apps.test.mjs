import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateApp, parseGeneratedApp, validateAppPackage, MAX_APP_BYTES } from '../server/app-generator.mjs';
import { createGeneratedAppStore } from '../server/generated-app-store.mjs';
import { createGeneratedAppHandler } from '../server/generated-app-routes.mjs';
import { createWorkspaceStore } from '../server/store.mjs';

const fixture = () => ({ title: '节奏计数器', html: '<button id="count">计数</button><output id="value">0</output>',
  css: 'body { background: #eee; }',
  js: '(async () => { const saved = await vibe.getState(); let n = saved?.count || 0; document.querySelector("#count").onclick = async () => { n++; document.querySelector("#value").textContent = n; await vibe.setState({count:n}); }; })();',
  initialState: { count: 0 } });

test('generated code is parsed as a complete app package, never run on the server', () => {
  const app = fixture();
  assert.equal(parseGeneratedApp('```json\n' + JSON.stringify(app) + '\n```').title, app.title);
  assert.deepEqual(validateAppPackage(app).initialState, { count: 0 });
  const harmlessParse = { ...app, js: 'globalThis.__serverShouldNotRunGeneratedCode = true;' };
  validateAppPackage(harmlessParse);
  assert.equal(globalThis.__serverShouldNotRunGeneratedCode, undefined);
});

test('package boundary rejects injected markup, modules, invalid state and oversized code', () => {
  for (const patch of [
    { html: '<script>alert(1)</script>' }, { html: '<button onclick="parent.alert(1)">bad</button>' },
    { html: '<iframe src="https://example.com"></iframe>' }, { css: '</style><script>bad</script>' },
    { js: 'import x from "x";' }, { js: 'export const x = 1;' }, { js: 'function {' },
    { js: '</script><script>' }, { initialState: { x: Infinity } }, { initialState: [] }, { initialState: null },
    { initialState: JSON.parse('{"__proto__":{"bad":true}}') },
    { html: 'x'.repeat(MAX_APP_BYTES + 1) }, { initialState: { text: 'x'.repeat(33000) } },
  ]) assert.throws(() => validateAppPackage({ ...fixture(), ...patch }));
  assert.throws(() => parseGeneratedApp('not JSON'), { code: 'INVALID_APP_JSON' });
});

test('initial state rejects JSON trees beyond the frame 8192-node budget', () => {
  const oversized = { rows: Array(9000).fill(0) };
  assert.equal(Buffer.byteLength(JSON.stringify(oversized)), 18010);
  assert.throws(() => validateAppPackage({ ...fixture(), initialState: oversized }),
    { code: 'APP_STATE_TOO_COMPLEX' });
  // Root + array container + 8190 leaves = exactly 8192 nodes.
  assert.equal(validateAppPackage({ ...fixture(), initialState: { rows: Array(8190).fill(0) } }).initialState.rows.length, 8190);
  assert.throws(() => validateAppPackage({ ...fixture(), initialState: { rows: Array(8191).fill(0) } }),
    { code: 'APP_STATE_TOO_COMPLEX' });
  // The budget belongs to the whole tree, not to each array separately.
  assert.throws(() => validateAppPackage({ ...fixture(), initialState: {
    left: Array(4095).fill(0), right: Array(4095).fill(0),
  } }), { code: 'APP_STATE_TOO_COMPLEX' });
  assert.throws(() => validateAppPackage({ ...fixture(), initialState:
    Object.fromEntries(Array.from({ length: 8192 }, (_, i) => [`k${i}`, 0])),
  }), { code: 'APP_STATE_TOO_COMPLEX' });
});

test('no generator credentials returns an explicit configuration error, not a fabricated app', async () => {
  await assert.rejects(generateApp('做一个节奏练习器'), { code: 'APP_GENERATOR_NOT_CONFIGURED' });
  await assert.rejects(generateApp(''), { code: 'INVALID_APP_PROMPT' });
});

test('compatible generation request uses server credentials and validates the model result', async () => {
  let seen;
  const app = await generateApp('做一个节奏练习器', { apiKey: 'test-generator-secret', model: 'test-model',
    baseUrl: 'https://models.example/v1', fetcher: async (url, init) => {
      seen = { url, body: JSON.parse(init.body), headers: init.headers };
      return Response.json({ choices: [{ message: { content: JSON.stringify(fixture()) } }] });
    } });
  assert.equal(seen.url, 'https://models.example/v1/chat/completions');
  assert.equal(seen.headers.Authorization, 'Bearer test-generator-secret');
  assert.equal(seen.body.messages[1].content, '做一个节奏练习器');
  assert.equal(seen.body.max_completion_tokens, 10000);
  assert.equal('max_tokens' in seen.body, false);
  assert.equal(app.title, '节奏计数器');
  assert.equal(JSON.stringify(app).includes('test-generator-secret'), false);
  await assert.rejects(generateApp('节奏练习器', { apiKey: 'x', model: 'm', baseUrl: 'http://remote.example/v1' }), { code: 'INVALID_GENERATOR_CONFIG' });
  await assert.rejects(generateApp('节奏练习器', { apiKey: 'x', model: 'm', fetcher: async () =>
    new Response('do not expose upstream secret', { status: 401 }) }), { code: 'APP_GENERATOR_UPSTREAM' });
});

test('official DeepSeek generation uses max_tokens without changing the requested model or thinking mode', async () => {
  for (const baseUrl of ['https://api.deepseek.com', 'https://api.deepseek.com/v1/']) {
    let seen;
    const app = await generateApp('做一个节奏练习器', { apiKey: 'test-deepseek-secret', model: 'caller-selected-model',
      baseUrl, fetcher: async (url, init) => {
        seen = { url, body: JSON.parse(init.body) };
        assert.equal(seen.body.max_tokens, 10000);
        assert.equal('max_completion_tokens' in seen.body, false);
        assert.equal(seen.body.model, 'caller-selected-model');
        assert.equal('thinking' in seen.body, false);
        return Response.json({ choices: [{ message: { content: JSON.stringify(fixture()) } }] });
      } });
    assert.equal(new URL(seen.url).hostname, 'api.deepseek.com');
    assert.equal(app.title, '节奏计数器');
    assert.equal(JSON.stringify(app).includes('test-deepseek-secret'), false);
  }
  await generateApp('做一个节奏练习器', { apiKey: 'test', model: 'caller-selected-model',
    baseUrl: 'https://api.deepseek.com.other.example/v1', fetcher: async (_url, init) => {
      const body = JSON.parse(init.body);
      assert.equal(body.max_completion_tokens, 10000);
      assert.equal('max_tokens' in body, false);
      return Response.json({ choices: [{ message: { content: JSON.stringify(fixture()) } }] });
    } });
});

test('DeepSeek app generation requests JSON and honors explicit generation reasoning effort', async () => {
  await generateApp('番茄钟', { apiKey: 'test', model: 'deepseek-flash', baseUrl: 'https://api.deepseek.com', reasoningEffort: 'none',
    fetcher: async (_url, init) => {
      const body = JSON.parse(init.body);
      assert.deepEqual(body.response_format, { type: 'json_object' });
      assert.equal(body.reasoning_effort, 'none');
      assert.equal('thinking' in body, false);
      return Response.json({ choices: [{ message: { content: JSON.stringify(fixture()) } }] });
    } });
});

test('SQLite keeps arbitrary generated apps across reopen and isolates workspace owners', () => {
  const directory = mkdtempSync(join(tmpdir(), 'vibeos-generated-app-test-'));
  const filename = join(directory, 'apps.sqlite');
  try {
    let store = createGeneratedAppStore({ filename, maxAppsPerWorkspace: 1 });
    const saved = store.save('alice', '节奏练习器', fixture());
    assert.match(saved.id, /^gen-/);
    assert.equal(store.get('bob', saved.id), null);
    assert.deepEqual(store.list('bob'), []);
    assert.throws(() => store.save('alice', '第二个', fixture()), { code: 'APP_LIMIT_REACHED' });
    store.close();
    store = createGeneratedAppStore({ filename });
    assert.equal(store.get('alice', saved.id).js, fixture().js);
    assert.equal(store.list('alice').length, 1);
    assert.equal('html' in store.list('alice')[0], false);
    store.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

async function serve(t, options = {}) {
  const workspaceStore = createWorkspaceStore();
  const appStore = createGeneratedAppStore();
  const session = workspaceStore.getOrCreateWorkspace();
  const other = workspaceStore.getOrCreateWorkspace();
  const handler = createGeneratedAppHandler({ workspaceStore, appStore, allowedOrigins: ['http://localhost:5173'],
    config: { apiKey: 'test', model: 'test' }, generate: async () => fixture(), ...options });
  const server = createServer(async (req, res) => {
    if (!await handler(req, res, new URL(req.url, 'http://localhost').pathname)) { res.statusCode = 404; res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    handler.close(); server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    appStore.close(); workspaceStore.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Cookie: `vibeos-session=${session.token}`, Origin: 'http://localhost:5173', 'Content-Type': 'application/json' };
  return { base, headers, session, other, appStore };
}

test('generation endpoints require cookie ownership and same-origin POST', async t => {
  const { base, headers, other } = await serve(t);
  assert.equal((await fetch(base + '/api/apps')).status, 401);
  assert.equal((await fetch(base + '/api/apps/generate', { method: 'POST',
    headers: { ...headers, Origin: 'https://other.example' }, body: '{"prompt":"节奏练习器"}' })).status, 403);
  const response = await fetch(base + '/api/apps/generate', { method: 'POST', headers, body: '{"prompt":"节奏练习器"}' });
  assert.equal(response.status, 201);
  const { app } = await response.json();
  assert.equal(app.title, '节奏计数器');
  assert.equal((await fetch(base + '/api/apps/' + app.id, { headers })).status, 200);
  const otherHeaders = { ...headers, Cookie: `vibeos-session=${other.token}` };
  assert.equal((await fetch(base + '/api/apps/' + app.id, { headers: otherHeaders })).status, 404);
  assert.deepEqual((await (await fetch(base + '/api/apps', { headers: otherHeaders })).json()).apps, []);
  assert.equal((await fetch(base + '/api/apps/generate', { method: 'POST', headers, body: '{"prompt":"再次生成"}' })).status, 429);
});

test('missing config is visible and preserves the previously saved app', async t => {
  const { base, headers, appStore, session } = await serve(t, { config: { apiKey: '', model: '' } });
  const saved = appStore.save(session.workspace.id, '已有应用', fixture());
  const response = await fetch(base + '/api/apps/generate', { method: 'POST', headers, body: '{"prompt":"新应用"}' });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'APP_GENERATOR_NOT_CONFIGURED');
  assert.equal(appStore.get(session.workspace.id, saved.id).title, '节奏计数器');
});

test('model failure creates no app and preserves existing saved code', async t => {
  const { base, headers, appStore, session } = await serve(t, { generate: async () => { throw new Error('private upstream detail'); } });
  const saved = appStore.save(session.workspace.id, '已有应用', fixture());
  const response = await fetch(base + '/api/apps/generate', { method: 'POST', headers, body: '{"prompt":"新应用"}' });
  assert.equal(response.status, 502);
  const failure = await response.json();
  assert.equal(failure.code, 'APP_GENERATION_FAILED');
  assert.equal(JSON.stringify(failure).includes('private upstream detail'), false);
  assert.equal(appStore.list(session.workspace.id).length, 1);
  assert.equal(appStore.get(session.workspace.id, saved.id).js, fixture().js);
});

test('daily generation budget blocks calls before invoking the provider', async t => {
  let calls = 0;
  const { base, headers } = await serve(t, { maxGenerationsPerDay: 0, generate: async () => { calls++; return fixture(); } });
  const response = await fetch(base + '/api/apps/generate', { method: 'POST', headers, body: '{"prompt":"新应用"}' });
  assert.equal(response.status, 429);
  assert.equal(calls, 0);
});
