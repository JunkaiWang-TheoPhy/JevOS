import test from 'node:test';
import assert from 'node:assert/strict';
import { registerAppActions, invokeAppAction } from '../src/apps/app-actions.ts';
import { parseFrameMessage, FRAME_CHANNEL } from '../src/apps/generated/frame-document.ts';
test('registered actions execute synchronously and stay isolated per workspace', async () => {
  let called = false;
  const unregister = registerAppActions('one', 'music', () => { called = true; return 'played'; });
  const result = invokeAppAction('one', 'music', 'play', {});
  assert.equal(called, true); assert.equal(await result, 'played');
  const other = invokeAppAction('two', 'music', 'play', {});
  registerAppActions('two', 'music', () => 'other')();
  await assert.rejects(other, /已关闭/); unregister();
});
test('mount registration resolves waiting commands and old cleanup cannot remove replacement', async () => {
  const pending = invokeAppAction('three', 'timer', 'start', { minutes: 3 });
  const remove = registerAppActions('three', 'timer', (_, args) => String(args.minutes));
  assert.equal(await pending, '3');
  const newer = registerAppActions('three', 'timer', () => 'new'); remove();
  assert.equal(await invokeAppAction('three', 'timer', 'pause', {}), 'new'); newer();
});
test('action acknowledgements require source nonce instance sequence and bounded payload', () => {
  const source = {}; const nonce = 'ab'.repeat(24);
  const ack = { channel: FRAME_CHANNEL, nonce, instanceId: 'one', id: 'm_2', type: 'action-result', actionId: 'a_1', ok: true, message: 'done' };
  const parse = value => parseFrameMessage(value, nonce, source, source, 'one');
  assert.equal(parse(ack)?.type, 'action-result');
  for (const changed of [{ actionId: 'm_1' }, { ok: 'true' }, { message: 'x'.repeat(1001) }, { nonce: 'bad' }, { instanceId: 'other' }]) assert.equal(parse({ ...ack, ...changed }), null);
  assert.equal(parseFrameMessage(ack, nonce, {}, source, 'one'), null);
});
