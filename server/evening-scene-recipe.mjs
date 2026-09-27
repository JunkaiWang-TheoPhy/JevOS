import { randomUUID } from 'node:crypto';

// Named preset: no model request, audio action, or mutation of app contents.
export function eveningRestScene(input, apps) {
  const text = input.text.trim();
  if (!/^(?:(?:请)?(?:进入|切换到))?(?:傍晚|晚上|晚间|下班)(?:休息|放松)(?:模式|工作台)?(?:[，,。：:！!\s]|$)/.test(text)) return null;
  const result = {
    proposalId: `scene-${randomUUID()}`, requestId: input.requestId,
    baseRevision: input.baseRevision, desktopRevision: input.desktopRevision,
    status: 'stay', source: 'rules', operations: [], focusWindowId: input.activeWindowId ?? null,
    transition: { preset: 'calm-reflow', durationMs: 450 }, elapsedMs: 0,
    trace: [{ phase: 'layout', node: 'evening-rest-recipe', result: true, source: 'rules' }],
    layout: { id: 'evening-rest', candidateCount: 1 }, missingCapabilities: [], explanation: '',
  };
  if (/别动|保持.*不变|不要.*(?:调整|切换)/.test(text)) {
    result.explanation = '按要求保留当前桌面。'; return result;
  }
  if (!apps.some(app => app.id === 'music')) {
    result.missingCapabilities = ['音乐播放器尚未接入。'];
    result.explanation = '傍晚休息模式暂不可用，当前桌面保持。'; return result;
  }
  // Preserve fixed/editing windows rather than placing a new scene over them.
  if (input.windows.some(window => !window.minimized && (window.pinned || window.editing))) {
    result.explanation = '有固定或正在编辑的窗口，当前桌面保持。'; return result;
  }
  const gap = 12, W = input.viewport.width, H = input.viewport.height;
  const width = W - 2 * gap, height = H - 2 * gap;
  const rects = W >= 900 ? [
    { x: gap, y: gap, width: (width - gap) * .65, height },
    { x: 2 * gap + (width - gap) * .65, y: gap, width: (width - gap) * .35, height },
  ] : [
    { x: gap, y: gap, width, height: (height - gap) * .65 },
    { x: gap, y: 2 * gap + (height - gap) * .65, width, height: (height - gap) * .35 },
  ];
  if (rects.some(rect => rect.width < Math.min(260, width) || rect.height < 100)) {
    result.explanation = '当前桌面空间不足，已有窗口保持。'; return result;
  }
  const ids = ['music', 'notes'];
  const selected = [];
  ids.forEach((appId, index) => {
    const existing = input.windows.find(window => window.appId === appId);
    const windowId = existing?.windowId ?? `evening-${appId}`;
    selected.push(windowId);
    if (!existing || existing.minimized) result.operations.push({ type: 'open', appId, windowId });
    result.operations.push({ type: 'place', windowId, rect: rects[index] });
  });
  for (const window of input.windows) {
    if (!selected.includes(window.windowId) && !window.minimized && !window.pinned && !window.editing) {
      result.operations.push({ type: 'minimize', windowId: window.windowId });
    }
  }
  result.status = 'ready'; result.focusWindowId = selected[0];
  result.explanation = '已进入傍晚休息模式：音乐为主，笔记留在旁边，其他窗口收起。点击音乐播放即可聆听。';
  return result;
}
