import { randomUUID } from 'node:crypto';

// An explicit, named local recipe; it is not a recursive model search.
export function morningWritingScene(input, apps) {
  const alias = /^(?:早晨|清晨|晨间)工作(?:模式|台)?(?:[，,。：:！!\s]|$)/.test(input.text.trim());
  if (!alias && (!/(清晨|早晨|晨间)/.test(input.text) || !/(写稿|写作|写文章)/.test(input.text) || !/音乐/.test(input.text))) return null;
  const reader = apps.find(app => app.id === 'generated:demo-reader');
  const music = apps.find(app => app.id === 'music');
  const timers = apps.filter(app => /^generated:gen-/.test(app.id) && /番茄|pomodoro/i.test(app.title));
  const visibleTimer = timers.find(app => input.windows.some(window => window.appId === app.id && !window.minimized));
  const timer = visibleTimer || (timers.length === 1 ? timers[0] : apps.find(app => app.id === 'generated:demo-rehearsal-timer'));
  if (!reader || !music || !timer) return null;
  const ids = [reader.id, 'notes', timer.id, music.id];
  const W = input.viewport.width, H = input.viewport.height, gap = 12;
  const content = W - gap * 4, vertical = H - gap * 2;
  const rects = W >= 1000 ? [
    { x: gap, y: gap, width: content * .33, height: vertical },
    { x: gap * 2 + content * .33, y: gap, width: content * .45, height: vertical },
    { x: gap * 3 + content * .78, y: gap, width: content * .22, height: (vertical - gap) * .4 },
    { x: gap * 3 + content * .78, y: gap * 2 + (vertical - gap) * .4, width: content * .22, height: (vertical - gap) * .6 },
  ] : ids.map((_id, index) => ({ x: gap, y: gap + index * (H - gap) / 4, width: W - gap * 2, height: (H - gap * 5) / 4 }));
  const operations = [], windows = [];
  for (let index = 0; index < ids.length; index++) {
    const existing = input.windows.find(window => window.appId === ids[index]);
    if (existing?.pinned || existing?.editing) return null;
    const windowId = existing?.windowId || `demo-${index}`;
    windows.push(windowId);
    if (!existing || existing.minimized) operations.push({ type: 'open', appId: ids[index], windowId });
    operations.push({ type: 'place', windowId, rect: rects[index] });
  }
  return { proposalId: `scene-${randomUUID()}`, requestId: input.requestId, baseRevision: input.baseRevision,
    desktopRevision: input.desktopRevision, source: 'rules', operations, focusWindowId: windows[1],
    explanation: '已组合晨间写作工作台：左侧阅读、中间写稿、右上计时、右下音乐。点击音乐播放开始聆听。',
    missingCapabilities: [], trace: [{ phase: 'layout', node: 'morning-writing-recipe', result: true, source: 'rules' }],
    layout: { id: 'morning-writing-four', candidateCount: 1 }, transition: { preset: 'calm-reflow', durationMs: 450 }, elapsedMs: 0 };
}
