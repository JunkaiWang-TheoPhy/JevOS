import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, validateRequest } from '../server/decision.mjs';
import { createAppServer } from '../server/index.mjs';

test('no key produces explicitly labelled local rules without invented confidence', async () => {
  assert.deepEqual((await decide({ text: '不开会了，改成异步评审' })).choice, 'review');
  const result = await decide({ text: '约个时间讨论项目' });
  assert.equal(result.choice, 'meeting');
  assert.equal(result.source, 'rules');
  assert.equal(result.confidence, null);
  assert.equal((await decide({ text: '解释量子涨落' })).choice, 'stay');
});

test('TypeSafe request uses official Choice schema and keeps the key out of output', async () => {
  let request;
  const result = await decide({ text: '改成异步评审', state: { note: '保留草稿' } }, {
    apiKey: 'test-secret', fetcher: async (url, init) => {
      request = { url, init, body: JSON.parse(init.body) };
      return Response.json({ model: 'jev-test', answers: { composition: {
        type: 'choice', choice: 'review', confidence: 0.87,
      } } });
    },
  });
  assert.equal(request.url, 'https://api.typesafe.ai/v1/systemone');
  assert.equal(request.init.headers.Authorization, 'Bearer test-secret');
  assert.equal(request.body.questions.composition.type, 'choice');
  assert.equal(request.body.state.workspace.note, '保留草稿');
  assert.equal(result.choice, 'review');
  assert.equal(result.source, 'jev');
  assert.equal(JSON.stringify(result).includes('test-secret'), false);
});

test('unknown model actions and invalid confidence never reach the UI', async () => {
  for (const answer of [{ type: 'choice', choice: 'send-email', confidence: 1 },
    { type: 'choice', choice: 'meeting', confidence: 3 },
    { type: 'choice', choice: 'meeting' }]) {
    await assert.rejects(decide({ text: '会议' }, { apiKey: 'test',
      fetcher: async () => Response.json({ answers: { composition: answer } }) }), /无效/);
  }
  await assert.rejects(decide({ text: '会议' }, { apiKey: 'test',
    fetcher: async () => new Response('private upstream detail', { status: 401 }) }), /HTTP 401/);
});

test('input boundary rejects missing text, excessive text and non-object state', () => {
  for (const value of [null, {}, { text: '' }, { text: 'x'.repeat(2001) }, { text: 'x', state: [] }]) {
    assert.throws(() => validateRequest(value));
  }
});

test('local proxy rejects untrusted origins, exposes no key and serves only JSON decisions', async (t) => {
  const server = createAppServer({ apiKey: '', allowedOrigins: ['http://localhost:5173'] });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise((resolve) => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await (await fetch(base + '/api/health')).json();
  assert.deepEqual(health, { ok: true, configured: false, model: 'jev-latest' });
  const headers = { 'Content-Type': 'application/json', Origin: 'https://unrelated.example' };
  assert.equal((await fetch(base + '/api/decide', { method: 'POST', headers,
    body: JSON.stringify({ text: '会议' }) })).status, 403);
  headers.Origin = 'http://localhost:5173';
  const response = await fetch(base + '/api/decide', { method: 'POST', headers,
    body: JSON.stringify({ text: '会议' }) });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).choice, 'meeting');
  assert.equal((await fetch(base + '/api/decide', { method: 'POST', headers, body: '{broken' })).status, 400);
});
