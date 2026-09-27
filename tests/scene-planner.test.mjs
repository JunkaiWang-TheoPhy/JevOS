import test from 'node:test';
import assert from 'node:assert/strict';
import { planScene, validateSceneInput } from '../server/scene-planner.mjs';
import { LAYOUT_CATALOG } from '../server/layout-catalog.mjs';
const window = (appId, overrides = {}) => ({ windowId: `w-${appId}`, appId, rect: { x: 12, y: 12, width: 380, height: 420 }, minimized: false, pinned: false, editing: false, ...overrides });
const request = (text, overrides = {}) => ({ text, requestId: 'request-1', baseRevision: 0, desktopRevision: 0, viewport: { width: 1280, height: 800 }, windows: [], activeWindowId: null, ...overrides });

test('open JevOS opens the existing workspace terminal immediately without a model request', async () => {
  for (const text of ['打开jevOS', '请打开 JevOS', '启动JevOS', 'open JevOS']) {
    const result = await planScene(request(text, { windows: [window('notes'), window('terminal', { minimized: true })] }), {
      apiKey: 'must-not-be-used', fetcher: () => { throw new Error('Unexpected model request'); },
    });
    assert.equal(result.source, 'rules');
    assert.deepEqual(result.operations, [{ type: 'open', appId: 'terminal', windowId: 'w-terminal' }]);
    assert.equal(result.focusWindowId, 'w-terminal');
    assert.equal(result.generation, undefined);
  }
});

test('catalog has at least 100 deterministic candidate variants', () => assert.ok(LAYOUT_CATALOG.length >= 100));
test('morning reading uses truthful capabilities and notes/calendar', async () => {
  const result = await planScene(request('清晨阅读论文，旁边笔记和日程，播放音乐'));
  assert.equal(result.source, 'rules');
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.operations.filter((op) => op.type === 'open').map((op) => op.appId), ['notes', 'calendar', 'music']);
  assert.equal(result.missingCapabilities.length, 1);
  assert.equal(result.generation, undefined);
});
test('focus only adjusts the active window and keeps others untouched', async () => {
  const result = await planScene(request('进入专注模式，把窗口放大', { windows: [window('notes'), window('calendar')], activeWindowId: 'w-notes' }));
  assert.deepEqual(result.operations.map((op) => op.windowId), ['w-notes']);
  assert.equal(result.operations[0].rect.width, 1256);
});
test('fixed window is never moved even under explicit layout request', async () => {
  const result = await planScene(request('把 notes 放大', { windows: [window('notes', { pinned: true })], activeWindowId: 'w-notes' }));
  assert.equal(result.status, 'stay');
  assert.deepEqual(result.operations, []);
});
test('editing is preserved when no explicit layout command', async () => {
  const result = await planScene(request('整理笔记', { windows: [window('notes', { editing: true })], activeWindowId: 'w-notes' }));
  assert.equal(result.status, 'stay');
  assert.deepEqual(result.operations, []);
});
test('left calendar one third and right notes two thirds are honored', async () => {
  const result = await planScene(request('左边1/3放日历，右边2/3放笔记'));
  const calendar = result.operations.find((op) => op.type === 'open' && op.appId === 'calendar');
  const notes = result.operations.find((op) => op.type === 'open' && op.appId === 'notes');
  const left = result.operations.find((op) => op.type === 'place' && op.windowId === calendar.windowId).rect;
  const right = result.operations.find((op) => op.type === 'place' && op.windowId === notes.windowId).rect;
  assert.ok(left.x < right.x);
  assert.ok(Math.abs(left.width / (left.width + right.width) - 1 / 3) < 0.01);
});
test('narrow screens place windows in a column within viewport', async () => {
  const result = await planScene(request('日历和笔记', { viewport: { width: 360, height: 700 } }));
  const rects = result.operations.filter((op) => op.type === 'place').map((op) => op.rect);
  assert.equal(rects.length, 2);
  assert.equal(rects[0].x, rects[1].x);
  assert.ok(rects[0].y + rects[0].height <= rects[1].y);
  for (const rect of rects) assert.ok(rect.x + rect.width <= 360 && rect.y + rect.height <= 700);
});
test('tiny viewport preserves desktop when desired windows cannot fit', async () => {
  const result = await planScene(request('安排会议', { viewport: { width: 100, height: 100 } }));
  assert.equal(result.status, 'stay');
  assert.deepEqual(result.operations, []);
});
test('stay wins and unknown tools do not silently trigger generation', async () => {
  const stay = await planScene(request('别动桌面，阅读论文'));
  assert.equal(stay.status, 'stay');
  const unknown = await planScene(request('打开一个天气预报'));
  assert.equal(unknown.status, 'stay');
  assert.equal(unknown.generation, undefined);
});
test('explicit app generation is separate from layout operations', async () => {
  const result = await planScene(request('做一个喝水提醒器应用'));
  assert.equal(result.generation.prompt, '做一个喝水提醒器应用');
  assert.deepEqual(result.operations, []);
});
test('server supplied generated app is selectable without claiming built-in capability', async () => {
  const result = await planScene(request('打开数据工作室'), { apps: [{ id: 'generated:draft-data-studio', title: '数据工作室' }] });
  assert.equal(result.operations[0].appId, 'generated:draft-data-studio');
});
test('rejects invalid revisions, geometry, unknown apps and duplicate window ids', () => {
  for (const input of [request('笔记', { baseRevision: -1 }), request('笔记', { windows: [window('unknown')] }), request('笔记', { windows: [window('notes'), window('notes')] }), request('笔记', { windows: [window('notes', { rect: { x: NaN, y: 0, width: 300, height: 400 } })] })]) {
    assert.throws(() => validateSceneInput(input), (error) => error.statusCode === 400 && error.code === 'INVALID_SCENE');
  }
});
test('Jev uses one batch of binary questions and validates every answer', async () => {
  let calls = 0;
  const fetcher = async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    const payload = JSON.parse(options.body);
    assert.ok(Object.keys(payload.questions).length >= 12);
    const answers = Object.fromEntries(Object.entries(payload.questions).map(([id, question]) => {
      assert.equal(question.type, 'choice');
      assert.deepEqual(Object.keys(question.criteria), ['yes', 'no']);
      return [id, { type: 'choice', choice: id === 'notes' ? 'yes' : 'no', confidence: 0.8 }];
    }));
    return { ok: true, json: async () => ({ answers }) };
  };
  const result = await planScene(request('整理材料'), { apiKey: 'test', fetcher });
  assert.equal(calls, 1);
  assert.equal(result.source, 'jev');
  assert.ok(result.trace.every((entry) => entry.source === 'jev' && entry.confidence === 0.8));
  await assert.rejects(planScene(request('笔记'), { apiKey: 'test', fetcher: async () => ({ ok: true, json: async () => ({ answers: { notes: { type: 'choice', choice: 'yes', confidence: 2 } } }) }) }), /格式无效/);
});
test('Chinese named focus uses the named window rather than another active window', async () => {
  const result = await planScene(request('把笔记放大', { windows: [window('notes'), window('calendar')], activeWindowId: 'w-calendar' }));
  assert.deepEqual(result.operations.map((op) => op.windowId), ['w-notes']);
});
test('explicit negated app is never opened', async () => {
  const result = await planScene(request('写笔记，不要日历'));
  assert.deepEqual(result.operations.filter((op) => op.type === 'open').map((op) => op.appId), ['notes']);
});
test('explicit hide produces minimize instead of reopening that app', async () => {
  const result = await planScene(request('把日历收起来', { windows: [window('calendar')] }));
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.operations, [{ type: 'minimize', windowId: 'w-calendar' }]);
});
test('shrinking a named window decreases its size', async () => {
  const result = await planScene(request('把笔记缩小', { windows: [window('notes')], activeWindowId: 'w-notes' }));
  assert.ok(result.operations[0].rect.width < 380);
  assert.ok(result.operations[0].rect.height < 420);
});
test('candidate reporting distinguishes unique geometry from catalog parameters', async () => {
  const result = await planScene(request('打开笔记'));
  assert.equal(result.layout.catalogCount, 126);
  assert.equal(result.layout.uniqueCandidateCount, 1);
  assert.equal(result.layout.candidateCount, 1);
});
test('vertical preference and focus preservation affect the selected layout', async () => {
  const result = await planScene(request('日历和笔记上下排布，保持当前焦点', { windows: [window('notes')], activeWindowId: 'w-notes' }));
  const rects = result.operations.filter((op) => op.type === 'place').map((op) => op.rect);
  assert.equal(rects[0].x, rects[1].x);
  assert.equal(result.focusWindowId, 'w-notes');
  assert.ok(result.trace.every((entry) => typeof entry.phase === 'string'));
});
test('decluttering only minimizes unrelated unpinned unedited windows', async () => {
  const result = await planScene(request('把笔记放大，其他窗口收起', { windows: [window('notes'), window('calendar')], activeWindowId: 'w-notes' }));
  assert.ok(result.operations.some((op) => op.type === 'minimize' && op.windowId === 'w-calendar'));
});

test('explicit two-app geometry overrides a spurious model calculator decision', async () => {
  const result = await planScene(request('日历在左边三分之一，笔记在右边三分之二'), {
    apiKey: 'test', fetcher: async (_url, options) => {
      const questions = JSON.parse(options.body).questions;
      return Response.json({ answers: Object.fromEntries(Object.keys(questions).map(id => [id,
        { type: 'choice', choice: ['local', 'notes', 'calendar', 'analysis', 'paired', 'explicitLayout', 'compact', 'primaryNotes'].includes(id) ? 'yes' : 'no', confidence: 0.95 }])) });
    },
  });
  const opened = result.operations.filter(op => op.type === 'open');
  assert.deepEqual(new Set(opened.map(op => op.appId)), new Set(['calendar', 'notes']));
  const places = result.operations.filter(op => op.type === 'place');
  assert.equal(places.length, 2);
  const calendar = opened.find(op => op.appId === 'calendar');
  const left = places.find(op => op.windowId === calendar.windowId).rect;
  assert.ok(Math.abs(left.width / places.reduce((sum, op) => sum + op.rect.width, 0) - 1 / 3) < 0.01);
});

test('minimizing the active app cannot focus and reopen the minimized window', async () => {
  const result = await planScene(request('把日历收起来', { windows: [window('calendar')], activeWindowId: 'w-calendar' }));
  assert.equal(result.focusWindowId, null);
  assert.deepEqual(result.operations, [{ type: 'minimize', windowId: 'w-calendar' }]);
});

test('a spurious model declutter answer cannot minimize unrelated apps in a local command', async () => {
  const result = await planScene(request('把笔记放大，日历收起来', {
    windows: ['notes', 'calendar', 'calculator', 'terminal'].map(id => window(id)), activeWindowId: 'w-notes',
  }), { apiKey: 'test', fetcher: async (_url, options) => Response.json({ answers:
    Object.fromEntries(Object.keys(JSON.parse(options.body).questions).map(id => [id,
      { type: 'choice', choice: ['local', 'notes', 'explicitLayout', 'declutter'].includes(id) ? 'yes' : 'no', confidence: 0.95 }])) }) });
  assert.deepEqual(result.operations.filter(op => op.type === 'minimize').map(op => op.windowId), ['w-calendar']);
  assert.ok(!result.operations.some(op => ['w-calculator', 'w-terminal'].includes(op.windowId)));
});

test('close all is a deterministic window command even when the model is unavailable', async () => {
  let called = false;
  for (const text of ['关闭所有', '关闭所有窗口', '把所有应用都关掉', 'close all windows']) {
    const result = await planScene(request(text, { windows: [window('notes'), window('calendar', { minimized: true })], activeWindowId: 'w-notes' }), {
      apiKey: 'test', fetcher: async () => { called = true; throw new Error('provider must not be called'); },
    });
    assert.equal(result.source, 'rules');
    assert.deepEqual(result.operations, [{ type: 'close', windowId: 'w-notes' }, { type: 'close', windowId: 'w-calendar' }]);
    assert.equal(result.focusWindowId, null);
    assert.equal(called, false);
  }
});

test('minimize all keeps windows and never asks the model', async () => {
  const result = await planScene(request('收起所有窗口', { windows: [window('notes')], activeWindowId: 'w-notes' }), {
    apiKey: 'test', fetcher: async () => { throw new Error('provider must not be called'); },
  });
  assert.deepEqual(result.operations, [{ type: 'minimize', windowId: 'w-notes' }]);
  assert.equal(result.focusWindowId, null);
});
