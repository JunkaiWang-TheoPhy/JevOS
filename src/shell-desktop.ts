import { desktopReducer, type DesktopState, type ToolId, type WindowState } from './desktop-model.ts';
import { resolveShellApp, type DemoEffect, type ShellApp } from './apps/terminal/demo-commands.ts';
export interface ShellViewport { width: number; height: number }
/** Pure geometry operations. Business state remains owned by each stable App instance. */
export function applyShellDesktop(current: DesktopState, effect: DemoEffect, viewport: ShellViewport, apps: readonly ShellApp[] = []): DesktopState {
  const { width: W, height: H } = viewport;
  if (!Number.isFinite(W) || !Number.isFinite(H) || W < 1 || H < 1) throw new Error('桌面尺寸无效。');
  const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
  const fit = (w: WindowState): WindowState => {
    const width = clamp(w.width, Math.min(260, W), W), height = clamp(w.height, Math.min(180, H), H);
    return { ...w, width, height, x: clamp(w.x, 0, W - width), y: clamp(w.y, 0, H - height) };
  };
  let state = current;
  const find = (appId: string) => state.windows.find(w => w.tool === appId);
  const open = (appId: string) => {
    const existing = find(appId);
    if (existing) state = desktopReducer(state, { type: 'focus', id: existing.id });
    else {
      const known = apps.find(a => a.id === appId);
      if (!known) throw new Error('应用不在可信清单中。');
      // Build a stable new window without mutating the global tool registry.
      const top = Math.max(0, ...state.windows.map(w => w.z));
      const added = fit({ id: appId, tool: appId as ToolId, title: known.title, x: 32, y: 32, width: 480, height: 400, z: top + 1, minimized: false, maximized: false });
      state = { windows: [...state.windows, added], activeId: added.id };
    }
    const target = find(appId)!;
    state = { ...state, windows: state.windows.map(w => w.id === target.id ? fit(w) : w) };
    return find(appId)!;
  };
  const place = (appId: string, x: number, y: number, width: number, height: number) => {
    const target = open(appId);
    // Layout slots may be smaller than the normal preferred minimum on narrow screens.
    const rect = { x: clamp(x, 0, W - 1), y: clamp(y, 0, H - 1), width: clamp(width, 1, W - Math.max(0, x)), height: clamp(height, 1, H - Math.max(0, y)) };
    state = { ...state, windows: state.windows.map(w => w.id === target.id ? { ...w, ...rect, minimized: false, maximized: false } : w) };
  };
  if (effect.type === 'open') { open(effect.appId); return state; }
  if (['close', 'minimize', 'focus'].includes(effect.type)) {
    const e = effect as Extract<DemoEffect, { appId: string }>;
    const target = find(e.appId); if (!target) throw new Error('该应用窗口尚未打开。');
    return desktopReducer(state, { type: effect.type as 'close' | 'minimize' | 'focus', id: target.id });
  }
  if (effect.type === 'tile') return desktopReducer(state, { type: 'tile', width: W, height: H });
  if (effect.type === 'split') {
    if (effect.appIds[0] === effect.appIds[1]) throw new Error('双栏需要两个不同应用。');
    const gap = Math.min(12, W / 20, H / 20), col = (W - gap * 3) / 2;
    effect.appIds.forEach((id, i) => place(id, gap + i * (col + gap), gap, col, H - gap * 2));
    return state;
  }
  if (effect.type === 'move' || effect.type === 'resize') {
    const target = find(effect.appId); if (!target) throw new Error('该应用窗口尚未打开。');
    let changed = fit({ ...target, maximized: false });
    if (effect.type === 'resize') {
      if (!Number.isFinite(effect.percent) || effect.percent < 10 || effect.percent > 100) throw new Error('宽度比例必须在 10–100% 之间。');
      changed = fit({ ...changed, width: W * effect.percent / 100 });
    } else {
      const pos = effect.position;
      if (!['bottom-right', 'top-right', 'top-left', 'bottom-left', 'left', 'right', 'center'].includes(pos)) throw new Error('位置无效。');
      changed.x = pos.includes('right') ? W - changed.width : pos.includes('left') ? 0 : (W - changed.width) / 2;
      changed.y = pos.includes('bottom') ? H - changed.height : pos.includes('top') ? 0 : (H - changed.height) / 2;
    }
    return { ...state, windows: state.windows.map(w => w.id === changed.id ? changed : w) };
  }
  if (effect.type === 'scene') {
    const lookup = (name: string) => { const a = resolveShellApp(name, apps); if (!a) throw new Error(`场景缺少 ${name} 应用。`); return a.id; };
    const notes = lookup('notes');
    const gap = Math.min(12, W / 30, H / 30);
    let selected: string[];
    if (effect.name === 'focus') {
      selected = [notes]; place(notes, gap, gap, W - gap * 2, H - gap * 2);
    } else if (effect.name === 'pitch') {
      const timer = lookup('timer'); selected = [notes, timer];
      const side = (W - gap * 3) * .28;
      place(notes, gap, gap, W - side - gap * 3, H - gap * 2);
      place(timer, W - side - gap, gap, side, H - gap * 2);
    } else {
      const reader = lookup('reader'), music = lookup('music'), timer = lookup('timer'); selected = [reader, notes, music, timer];
      const usable = W - gap * 4, left = usable * .45, middle = usable * .32, side = usable * .23;
      place(reader, gap, gap, left, H - gap * 2);
      place(notes, left + gap * 2, gap, middle, H - gap * 2);
      const sx = left + middle + gap * 3, sh = (H - gap * 3) / 2;
      place(timer, sx, gap, side, sh); place(music, sx, sh + gap * 2, side, sh);
    }
    state = { ...state, windows: state.windows.map(w => selected.includes(w.tool) ? w : { ...w, minimized: true }) };
    return desktopReducer(state, { type: 'focus', id: find(notes)!.id });
  }
  throw new Error('该命令不是桌面窗口操作。');
}
