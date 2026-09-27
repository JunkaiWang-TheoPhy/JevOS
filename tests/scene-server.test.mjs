import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../server/index.mjs';

test('the production server exposes scene planning alongside unchanged workspace APIs', async t => {
  const origin = 'http://localhost:5173';
  const server = createAppServer({ apiKey: '', allowedOrigins: [origin], generationConfig: {},
    sessionCookieName: 'scene-production-test' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const initial = await fetch(base + '/api/workspace');
  const cookie = initial.headers.get('set-cookie').split(';')[0];
  const { workspace } = await initial.json();
  const result = await fetch(base + '/api/scenes/plan', { method: 'POST', headers: {
    Cookie: cookie, Origin: origin, 'Content-Type': 'application/json',
  }, body: JSON.stringify({ requestId: 'production-scene', baseRevision: workspace.revision,
    desktopRevision: 4, text: '日历在左边三分之一，笔记在右边三分之二',
    viewport: { width: 1200, height: 700 }, windows: [], activeWindowId: null }) });
  assert.equal(result.status, 200);
  const plan = await result.json();
  assert.equal(plan.desktopRevision, 4);
  assert.equal(plan.source, 'rules');
  assert.deepEqual(new Set(plan.operations.filter(op => op.type === 'open').map(op => op.appId)), new Set(['calendar', 'notes']));
  const next = await (await fetch(base + '/api/workspace', { headers: { Cookie: cookie } })).json();
  assert.deepEqual(next.workspace, workspace);
});
