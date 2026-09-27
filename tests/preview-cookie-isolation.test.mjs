import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createWorkspaceStore } from '../server/store.mjs';
import { createGeneratedAppStore } from '../server/generated-app-store.mjs';
import { createWorkspaceHandler } from '../server/workspace-api.mjs';
import { createGeneratedAppHandler } from '../server/generated-app-routes.mjs';

const origin = 'http://localhost:5173';
const previewCookie = 'vibeos-preview-session';
class CookieJar {
  cookies = new Map();
  async request(base, path, { method = 'GET', body } = {}) {
    const response = await fetch(base + path, { method, headers: {
      Cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '),
      ...(method === 'POST' ? { Origin: origin, 'Content-Type': 'application/json' } : {}),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const cookie = response.headers.get('set-cookie');
    if (cookie) {
      const [name, ...value] = cookie.split(';')[0].split('=');
      this.cookies.set(name, value.join('='));
    }
    return response;
  }
}

async function fixture(t, sessionCookieName) {
  const store = createWorkspaceStore();
  const appStore = createGeneratedAppStore();
  const workspace = createWorkspaceHandler({ store, sessionCookieName, allowedOrigins: [origin] });
  const apps = createGeneratedAppHandler({ workspaceStore: store, appStore, sessionCookieName,
    allowedOrigins: [origin], config: { apiKey: '', model: '' } });
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (await workspace(req, res, path) || await apps(req, res, path)) return;
    res.writeHead(404); res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    workspace.close(); apps.close(); server.closeAllConnections();
    await new Promise(resolve => server.close(resolve)); store.close(); appStore.close();
  });
  return { base: `http://127.0.0.1:${server.address().port}`, store };
}

test('shared browser cookies preserve both preview workspace identities and app access', async t => {
  const old = await fixture(t);
  const next = await fixture(t, previewCookie);
  const jar = new CookieJar();
  const oldWorkspace = (await (await jar.request(old.base, '/api/workspace')).json()).workspace;
  const oldToken = jar.cookies.get('vibeos-session');
  const nextWorkspace = (await (await jar.request(next.base, '/api/workspace')).json()).workspace;
  assert.notEqual(nextWorkspace.id, oldWorkspace.id);
  assert.equal(jar.cookies.get('vibeos-session'), oldToken);
  assert.ok(jar.cookies.has(previewCookie));
  assert.equal((await jar.request(next.base, '/api/apps')).status, 200);
  assert.equal((await (await jar.request(old.base, '/api/workspace')).json()).workspace.id, oldWorkspace.id);
  assert.equal((await (await jar.request(next.base, '/api/workspace')).json()).workspace.id, nextWorkspace.id);
});

test('GET migrates a legacy token only when it belongs to this store', async t => {
  const next = await fixture(t, previewCookie);
  const legacy = next.store.getOrCreateWorkspace();
  for (const path of ['/api/workspace', '/api/apps']) {
    const jar = new CookieJar(); jar.cookies.set('vibeos-session', legacy.token);
    const response = await jar.request(next.base, path);
    assert.equal(response.status, 200);
    assert.equal(jar.cookies.get(previewCookie), legacy.token);
    assert.equal(jar.cookies.get('vibeos-session'), legacy.token);
    assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
    if (path === '/api/workspace') {
      const value = await response.json();
      assert.equal(value.workspace.id, legacy.workspace.id); assert.equal(value.created, false);
    }
  }
  const foreign = await fixture(t);
  const jar = new CookieJar(); jar.cookies.set('vibeos-session', foreign.store.getOrCreateWorkspace().token);
  assert.equal((await jar.request(next.base, '/api/apps')).status, 401);
  assert.equal(jar.cookies.has(previewCookie), false);
});

test('an invalid supplied custom cookie never falls back to a valid legacy cookie', async t => {
  const next = await fixture(t, previewCookie);
  const legacy = next.store.getOrCreateWorkspace();
  const jar = new CookieJar();
  jar.cookies.set('vibeos-session', legacy.token); jar.cookies.set(previewCookie, '');
  assert.equal((await jar.request(next.base, '/api/apps')).status, 401);
  const response = await jar.request(next.base, '/api/workspace');
  assert.notEqual((await response.json()).workspace.id, legacy.workspace.id);
  assert.notEqual(jar.cookies.get(previewCookie), legacy.token);
  jar.cookies.set(previewCookie, 'invalid');
  assert.equal((await jar.request(next.base, '/api/apps/generate', { method: 'POST', body: { prompt: 'test' } })).status, 401);
});

test('POST actions, decisions and generation never migrate legacy sessions', async t => {
  const next = await fixture(t, previewCookie);
  const legacy = next.store.getOrCreateWorkspace();
  next.store.applyAction(legacy.token, { actionId: 'legacy-note', expectedRevision: 0,
    kind: 'save_draft', args: { note: 'keep legacy workspace' } });
  for (const path of ['/api/actions', '/api/decisions', '/api/decide', '/api/apps/generate']) {
    const jar = new CookieJar(); jar.cookies.set('vibeos-session', legacy.token);
    const body = path === '/api/actions'
      ? { actionId: 'new-note', expectedRevision: 0, kind: 'save_draft', args: { note: 'new workspace' } }
      : { text: 'read', requestId: 'decision', contextVersion: 0, baseRevision: 0, prompt: 'test' };
    const response = await jar.request(next.base, path, { method: 'POST', body });
    assert.equal(response.status, path === '/api/apps/generate' ? 401 : 200, path);
    assert.notEqual(jar.cookies.get(previewCookie), legacy.token);
    assert.equal(jar.cookies.get('vibeos-session'), legacy.token);
  }
  assert.equal(next.store.getWorkspace(legacy.token).state.note, 'keep legacy workspace');
  assert.equal(next.store.getWorkspace(legacy.token).revision, 1);
});

test('both handler factories reject unsafe cookie names', () => {
  for (const sessionCookieName of ['', 'bad name', 'bad=token', 'bad;name', 'bad\r\nname']) {
    assert.throws(() => createWorkspaceHandler({ sessionCookieName }), /Invalid session cookie name/);
    assert.throws(() => createGeneratedAppHandler({ sessionCookieName }), /Invalid session cookie name/);
  }
});
