import test from 'node:test';
import assert from 'node:assert/strict';
import { musicForMessage } from '../src/apps/messages/music-action.ts';
test('user send starts music and waits for the real action result', async () => {
  let resolve; const calls = []; let settled = false;
  const result = musicForMessage('今天有点累', 'user-send', (...args) => { calls.push(args); return new Promise(done => { resolve = done; }); }).then(value => { settled = true; return value; });
  await Promise.resolve(); assert.equal(settled, false); assert.deepEqual(calls, [['music','music.play',{}]]);
  resolve('正在播放'); assert.equal(await result, '正在播放');
});
test('received text and retries never trigger music', async () => {
  for (const source of ['incoming','model-reply','retry']) assert.equal(await musicForMessage('累', source, () => { throw Error('must not run'); }), null);
  assert.equal(await musicForMessage('我想读书', 'user-send', () => { throw Error('must not run'); }), null);
});
test('blocked audio and unavailable bridge do not report success', async () => {
  await assert.rejects(musicForMessage('累', 'user-send', undefined), /点击播放/);
  await assert.rejects(musicForMessage('累', 'user-send', async () => { throw new Error('blocked'); }), /blocked/);
});
