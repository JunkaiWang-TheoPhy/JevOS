import test from 'node:test';
import assert from 'node:assert/strict';
import { fatigueMusicRequested } from '../src/apps/messages/fatigue-trigger.ts';

test('user sending a message containing 累 requests music literally', () => {
  for (const text of ['累', '今天有点累', '我不累', '累了，听会儿音乐']) assert.equal(fatigueMusicRequested(text, 'user-send'), true);
});
test('ordinary and empty user messages do not request music', () => {
  for (const text of ['', '今天很好', '困了', 'tired']) assert.equal(fatigueMusicRequested(text, 'user-send'), false);
});
test('incoming messages, model replies and retries never request music', () => {
  for (const source of ['incoming', 'model-reply', 'retry']) assert.equal(fatigueMusicRequested('今天很累', source), false);
});
