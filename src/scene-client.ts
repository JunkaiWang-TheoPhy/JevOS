import { desktopReducer, TOOLS } from './desktop-model.ts';
import type { DesktopState, ToolId } from './desktop-model';

export interface SceneRect { x: number; y: number; width: number; height: number }
export type SceneOperation = { type: 'open'; appId: string; windowId: string } |
  { type: 'place'; windowId: string; rect: SceneRect } | { type: 'minimize' | 'close'; windowId: string };
export interface SceneProposal {
  proposalId: string; requestId: string; baseRevision: number; desktopRevision: number;
  operations: SceneOperation[]; focusWindowId: string | null; source: 'jev' | 'rules';
  explanation: string; elapsedMs?: number; trace?: unknown[];
  generation?: { prompt: string }; missingCapabilities?: string[];
}
export interface SceneRequest {
  text: string; viewport: { width: number; height: number }; desktop: DesktopState;
  desktopRevision: number; baseRevision: number; signal: AbortSignal;
  pinnedWindowIds?: readonly string[]; editingWindowIds?: readonly string[];
}
export function deterministicDesktopAction(text: string): 'close' | 'minimize' | null {
  const value = text.trim().replace(/[。！!]/g, '');
  if (/^(?:请|帮我)?\s*(?:关闭|关掉)\s*(?:所有|全部)(?:\s*(?:窗口|应用))?$|^close\s+all(?:\s+windows)?$/i.test(value)) return 'close';
  if (/^(?:请|帮我)?\s*(?:收起|最小化)\s*(?:所有|全部)(?:\s*(?:窗口|应用))?$|^minimize\s+all(?:\s+windows)?$/i.test(value)) return 'minimize';
  return null;
}

export async function planDesktopScene(input: SceneRequest, fetcher: typeof fetch = fetch): Promise<SceneProposal> {
  const requestId = crypto.randomUUID();
  const body = {
    requestId, text: input.text, baseRevision: input.baseRevision, desktopRevision: input.desktopRevision,
    viewport: input.viewport, activeWindowId: input.desktop.activeId,
    windows: input.desktop.windows.map(window => ({ windowId: window.id, appId: window.tool,
      rect: { x: window.x, y: window.y, width: window.width, height: window.height },
      minimized: window.minimized, pinned: input.pinnedWindowIds?.includes(window.id) || false,
      editing: input.editingWindowIds?.includes(window.id) || false })),
  };
  const response = await fetcher('/api/scenes/plan', { method: 'POST', signal: input.signal, credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : '桌面暂时无法规划，请重试。');
  if (!result || result.requestId !== requestId || result.baseRevision !== input.baseRevision ||
      result.desktopRevision !== input.desktopRevision || !Array.isArray(result.operations) || result.operations.length > 120 ||
      !['jev', 'rules'].includes(result.source) || typeof result.explanation !== 'string') throw new Error('桌面规划结果无效。');
  const ids = new Set(input.desktop.windows.map(window => window.id));
  for (const operation of result.operations) {
    if (!operation || typeof operation.windowId !== 'string' || operation.windowId.length > 120) throw new Error('规划窗口编号无效。');
    if (operation.type === 'open') {
      if (typeof operation.appId !== 'string' || !Object.hasOwn(TOOLS, operation.appId)) throw new Error('规划包含尚未登记的应用。');
      ids.add(operation.windowId);
    } else if (operation.type === 'place') {
      const rect = operation.rect;
      if (!rect || !['x', 'y', 'width', 'height'].every(key => typeof rect[key] === 'number' && Number.isFinite(rect[key])) ||
          rect.x < 0 || rect.y < 0 || rect.width <= 0 || rect.height <= 0 ||
          rect.x + rect.width > input.viewport.width + 0.05 || rect.y + rect.height > input.viewport.height + 0.05) throw new Error('规划超出当前桌面。');
    } else if (!['minimize', 'close'].includes(operation.type)) throw new Error('规划包含不支持的操作。');
  }
  if (result.operations.some((operation: SceneOperation) => !ids.has(operation.windowId)) ||
      (result.focusWindowId !== null && !ids.has(result.focusWindowId))) throw new Error('规划引用了不存在的窗口。');
  return result;
}

export function applyDesktopScene(current: DesktopState, proposal: SceneProposal): DesktopState {
  let next = current;
  const remap = new Map(current.windows.map(window => [window.id, window.id]));
  for (const operation of proposal.operations) if (operation.type === 'open') {
    next = desktopReducer(next, { type: 'open', tool: operation.appId as ToolId });
    const actual = next.windows.find(window => window.tool === operation.appId);
    if (actual) remap.set(operation.windowId, actual.id);
  }
  for (const operation of proposal.operations) {
    const id = remap.get(operation.windowId) || operation.windowId;
    if (operation.type === 'place') next = { ...next, windows: next.windows.map(window => window.id === id ? { ...window, ...operation.rect, maximized: false } : window) };
    else if (operation.type === 'minimize') next = desktopReducer(next, { type: 'minimize', id });
    else if (operation.type === 'close') next = desktopReducer(next, { type: 'close', id });
  }
  const focus = proposal.focusWindowId ? remap.get(proposal.focusWindowId) || proposal.focusWindowId : null;
  const placed = proposal.operations.filter(operation => operation.type === 'place').map(operation => remap.get(operation.windowId) || operation.windowId);
  const top = Math.max(0, ...next.windows.map(window => window.z));
  next = { ...next, windows: next.windows.map(window => { const index = placed.indexOf(window.id); return index < 0 ? window : { ...window, z: top + index + 1 }; }) };
  if (focus && next.windows.some(window => window.id === focus && !window.minimized)) next = desktopReducer(next, { type: 'focus', id: focus });
  return next;
}
