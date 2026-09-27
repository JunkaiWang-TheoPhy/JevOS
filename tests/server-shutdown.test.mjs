import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../server/index.mjs';

test('server shutdown aborts a running generation before waiting for HTTP drain', async t => {
  let notifyStarted;
  let notifyAborted;
  const started = new Promise(resolve => { notifyStarted = resolve; });
  const aborted = new Promise(resolve => { notifyAborted = resolve; });
  const server = createAppServer({ apiKey: '', allowedOrigins: ['http://localhost:5173'],
    generationConfig: { apiKey: 'test-only', model: 'test-only' },
    fetcher: async (_url, { signal }) => {
      notifyStarted();
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => {
        notifyAborted(); reject(signal.reason);
      }, { once: true }));
    } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); if (server.listening) server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const workspace = await fetch(`${base}/api/workspace`);
  const cookie = workspace.headers.get('set-cookie').split(';')[0];
  await workspace.json();
  const request = fetch(`${base}/api/apps/generate`, { method: 'POST',
    headers: { Cookie: cookie, Origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Create a counter' }) }).catch(() => null);
  await started;
  const closed = new Promise(resolve => server.close(resolve));
  let timeout;
  const abortObserved = await Promise.race([
    aborted.then(() => true),
    new Promise(resolve => { timeout = setTimeout(() => resolve(false), 250); }),
  ]);
  clearTimeout(timeout);
  server.closeAllConnections();
  await closed;
  await request;
  assert.equal(abortObserved, true, 'upstream request must be canceled before HTTP connections drain');
});
