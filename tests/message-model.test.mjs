import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConversation, localReply, makeMessage, cleanMessageBody } from '../src/apps/messages/model.ts';
import { publishGeneratedContent, readGeneratedContent } from '../src/apps/messages/context.ts';

test('simulated replies reflect current user text, latest app and notes', () => {
  const text = localReply('专注结束以后提醒我', ['旧应用', '复古番茄钟'], '先做休息提醒');
  assert.match(text, /复古番茄钟/); assert.match(text, /专注结束/); assert.match(text, /休息提醒/); assert.doesNotMatch(text, /模拟|未发送邮件/);
});
test('old generated messages lose presentation labels without editing user messages', () => {
  const original = '【模型模拟回复】\n这是一条模拟消息，并非真实发送的邮件，也没有真实的人回复。\n\n主题：喝水提醒器试用反馈（模拟）\n\n可以增加休息提醒。\n（再次说明：本条为模拟内容，不是真实收到的回复。）\n（模拟内容，未发送邮件）';
  assert.equal(cleanMessageBody(original), '主题：喝水提醒器试用反馈\n\n可以增加休息提醒。');
  const state = normalizeConversation({ messages: [{ id: 'incoming', body: original, source: 'model-sim' }, { id: 'user', body: '请删除（模拟）这个标签', source: 'user' }] });
  assert.doesNotMatch(state.messages[0].body, /模拟|未发送邮件/);
  assert.equal(state.messages[1].body, '请删除（模拟）这个标签');
});
test('bounded conversation restores text safely and stays under host 64KiB', () => {
  const raw = { messages: Array.from({ length: 30 }, (_, i) => makeMessage('汉'.repeat(3000) + i, 'local-sim')), draft: '草稿', seenContext: 'context-1' };
  const state = normalizeConversation(raw);
  assert.ok(Buffer.byteLength(JSON.stringify(state)) < 64 * 1024); assert.equal(state.draft, '草稿');
  assert.deepEqual(normalizeConversation(JSON.parse(JSON.stringify(state))), state);
  assert.deepEqual(normalizeConversation({ messages: [{ body: '<script>', source: 'rogue' }] }).messages, []);
  assert.deepEqual(normalizeConversation({ messages: [{ id: 'bad', body: '坏记录', source: { toString: 'not callable' } }] }).messages, []);
});
test('generated content context is scoped to its workspace', () => {
  publishGeneratedContent('room-a', '做一个番茄钟', '专注计时器');
  assert.equal(readGeneratedContent('room-a').title, '专注计时器');
  assert.equal(readGeneratedContent('room-b'), null);
});
