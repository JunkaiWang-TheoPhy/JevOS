import test from 'node:test';
import assert from 'node:assert/strict';
import { planScene } from '../server/scene-planner.mjs';
const apps = [{ id: 'music', title: '音乐' }];
const window = (appId, x) => ({ windowId: `w-${appId}`, appId, rect: { x, y: 12, width: 380, height: 500 }, minimized: false, pinned: false, editing: false });
const request = (text, windows = []) => ({ text, requestId: 'position-test', baseRevision: 0, desktopRevision: 0, viewport: { width: 1280, height: 800 }, windows, activeWindowId: windows[0]?.windowId ?? null });
function rect(result, appId) {
  const id = result.operations.find(op => op.type === 'open' && op.appId === appId)?.windowId || `w-${appId}`;
  return result.operations.find(op => op.type === 'place' && op.windowId === id)?.rect;
}
test('left-side music occupies the left half instead of filling the desktop', async () => {
  const result = await planScene(request('左侧是音乐', [window('music', 850)]), { apps });
  const placed = rect(result, 'music');
  assert.ok(placed, 'music receives a place operation');
  assert.ok(placed.x + placed.width <= 640, 'single named app stays in the requested left half');
  assert.ok(!result.missingCapabilities.some(message => message.includes('音乐')));
  assert.equal(result.operations.some(op => op.type === 'open'), false, 'reuse the playing instance');
});
test('explicit left/right bindings override previous geometry and textual order', async () => {
  for (const text of ['左侧是音乐，右侧是笔记', '笔记在右侧，音乐在左侧']) {
    const result = await planScene(request(text, [window('music', 850), window('notes', 12)]), { apps });
    assert.ok(rect(result, 'music').x + rect(result, 'music').width <= rect(result, 'notes').x);
    assert.equal(result.operations.some(op => op.type === 'open'), false);
  }
});
test('right-side music works symmetrically and can open an absent registered app', async () => {
  const result = await planScene(request('右侧是音乐'), { apps });
  assert.ok(rect(result, 'music').x >= 640);
  assert.equal(result.operations.filter(op => op.type === 'open').length, 1);
  assert.equal(result.operations.find(op => op.type === 'open').appId, 'music');
});
test('music is a truthful built-in capability for a listening task', async () => {
  const result = await planScene(request('播放音乐'));
  assert.ok(result.operations.some(op => op.type === 'open' && op.appId === 'music'));
  assert.ok(!result.missingCapabilities.some(message => message.includes('音乐')));
});
test('literal side bindings remain authoritative when Jev suggests stay or local focus', async () => {
  const result = await planScene(request('左侧是音乐，右侧是笔记', [window('music', 850), window('notes', 12)]), {
    apps, apiKey: 'test-key', fetcher: async (_url, options) => {
      const questions = JSON.parse(options.body).questions;
      return new Response(JSON.stringify({ answers: Object.fromEntries(Object.keys(questions).map(id => [id,
        { type: 'choice', choice: ['stay', 'local'].includes(id) ? 'yes' : 'no', confidence: .99 }])) }));
    },
  });
  assert.equal(result.source, 'jev');
  assert.ok(rect(result, 'music').x + rect(result, 'music').width <= rect(result, 'notes').x);
  assert.equal(result.operations.some(op => op.type === 'open'), false);
});
