import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../server/index.mjs';

test('legacy decision endpoint cannot bypass the global model-call budget', async (t) => {
  let calls = 0;
  const server = createAppServer({ apiKey: 'not-a-real-key', maxDecisionsPerDay: 1,
    allowedOrigins: ['http://localhost:5173'], fetcher: async () => {
      calls++;
      return Response.json({ model: 'mock', answers: { composition: {
        type: 'choice', choice: 'meeting', confidence: 0.9,
      } } });
    } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise((resolve) => server.close(resolve)); });
  const send = () => fetch(`http://127.0.0.1:${server.address().port}/api/decide`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
    body: JSON.stringify({ text: '安排会议' }),
  });
  assert.equal((await send()).status, 200);
  assert.equal((await send()).status, 429, 'a second provider call must be refused at the configured budget');
  assert.equal(calls, 1);
});
