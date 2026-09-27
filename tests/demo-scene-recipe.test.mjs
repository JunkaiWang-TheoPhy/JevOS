import test from 'node:test';
import assert from 'node:assert/strict';
import { morningWritingScene } from '../server/demo-scene-recipe.mjs';

test('the explicit morning recipe compiles four separate slots and focuses notes', () => {
  const apps = [{ id: 'music' }, { id: 'generated:demo-reader' }, { id: 'generated:gen-123', title: '番茄钟' }];
  const input = { text: '清晨舒缓音乐写稿', viewport: { width: 1440, height: 800 }, windows: [], requestId: 'demo', baseRevision: 0, desktopRevision: 0 };
  const result = morningWritingScene(input, apps);
  assert.equal(result.source, 'rules');
  assert.equal(morningWritingScene({ ...input, text: '早晨工作模式，阅读器在左，笔记在中间，保留正在写的内容。' }, apps).source, 'rules');
  assert.equal(result.operations.filter(op => op.type === 'open').length, 4);
  assert.equal(result.focusWindowId, 'demo-1');
  const rects = result.operations.filter(op => op.type === 'place').map(op => op.rect);
  for (const rect of rects) { assert.ok(rect.x >= 0 && rect.y >= 0); assert.ok(rect.x + rect.width <= 1440); assert.ok(rect.y + rect.height <= 800); }
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    assert.equal(a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y, false);
  }
  assert.equal(morningWritingScene(input, apps.slice(0,2)), null);
  assert.equal(morningWritingScene({ ...input, text: '不要调整桌面' }, apps), null);
});
