import test from 'node:test';
import assert from 'node:assert/strict';
import { eveningRestScene } from '../server/evening-scene-recipe.mjs';

const apps = [{ id: 'music', title: '音乐' }];
const base = { text: '傍晚休息模式', requestId: 'evening', baseRevision: 2, desktopRevision: 3,
  viewport: { width: 1440, height: 800 }, windows: [], activeWindowId: null };
const win = (appId, patch = {}) => ({ windowId: `w-${appId}`, appId,
  rect: { x: 12, y: 12, width: 400, height: 350 }, minimized: false, pinned: false, editing: false, ...patch });

test('evening aliases produce a local music and notes scene', () => {
  for (const text of ['傍晚休息模式', '晚上休息模式', '晚间放松模式', '切换到傍晚休息模式']) {
    const result = eveningRestScene({ ...base, text }, apps);
    assert.equal(result.source, 'rules'); assert.equal(result.status, 'ready');
    assert.deepEqual(result.operations.filter(op => op.type === 'open').map(op => op.appId), ['music', 'notes']);
    assert.equal(result.focusWindowId, 'evening-music');
    assert.ok(!result.operations.some(op => ['close', 'play', 'generate'].includes(op.type)));
  }
  assert.equal(eveningRestScene({ ...base, text: '早晨工作模式' }, apps), null);
});

test('existing instances survive and unrelated apps are minimized rather than closed', () => {
  const windows = [win('music'), win('notes'), win('calendar'), win('terminal', { minimized: true })];
  const result = eveningRestScene({ ...base, windows, activeWindowId: 'w-notes' }, apps);
  assert.equal(result.operations.filter(op => op.type === 'open').length, 0);
  assert.deepEqual(result.operations.filter(op => op.type === 'place').map(op => op.windowId), ['w-music', 'w-notes']);
  assert.deepEqual(result.operations.filter(op => op.type === 'minimize').map(op => op.windowId), ['w-calendar']);
  assert.equal(windows[1].windowId, 'w-notes');
});

test('desktop and mobile rectangles fit the viewport and do not overlap', () => {
  for (const viewport of [{ width: 1440, height: 800 }, { width: 360, height: 700 }]) {
    const rects = eveningRestScene({ ...base, viewport }, apps).operations.filter(op => op.type === 'place').map(op => op.rect);
    assert.equal(rects.length, 2);
    for (const r of rects) assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.width <= viewport.width && r.y + r.height <= viewport.height);
    const [a, b] = rects;
    assert.equal(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y, false);
  }
});

test('missing music, protected windows and tiny screens return stay without guessing', () => {
  for (const [input, catalog] of [[base, []], [{ ...base, windows: [win('notes', { editing: true })] }, apps],
    [{ ...base, windows: [win('calendar', { pinned: true })] }, apps], [{ ...base, viewport: { width: 100, height: 100 } }, apps]]) {
    const result = eveningRestScene(input, catalog);
    assert.equal(result.status, 'stay'); assert.deepEqual(result.operations, []);
  }
  const kept = eveningRestScene({ ...base, text: '傍晚休息模式，别动桌面' }, apps);
  assert.equal(kept.status, 'stay'); assert.deepEqual(kept.operations, []);
});
