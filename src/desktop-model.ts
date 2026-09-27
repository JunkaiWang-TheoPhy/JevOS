export type ToolId = 'message' | 'notes' | 'calendar' | 'tasks' | 'contact' | 'calculator' | 'terminal' | 'motion-lab' | `generated:${string}`;
export interface WindowState { id: string; tool: ToolId; title: string; x: number; y: number; width: number; height: number; z: number; minimized: boolean; maximized: boolean }
export interface DesktopState { windows: WindowState[]; activeId: string | null }
export const TOOLS: Record<string, { title: string; subtitle: string; color: string; width?: number; height?: number }> = {
  message: { title: '消息', subtitle: 'Alice 的模拟消息', color: '#6c8a75' },
  notes: { title: '笔记', subtitle: '留住当前思路', color: '#b29663' },
  calendar: { title: '日历', subtitle: '本地会议草稿', color: '#7c93a4' },
  tasks: { title: '评审待办', subtitle: '一起推进下一步', color: '#a48793' },
  contact: { title: '联系人', subtitle: '模拟联系人 Alice', color: '#8d9b6c' },
  calculator: { title: '计算器', subtitle: '确定性本地计算', color: '#9386a4' },
  terminal: { title: 'Terminal', subtitle: 'JevOS 工作区命令台', color: '#354153', width: 590, height: 400 },
  'motion-lab': { title: 'Motion Lab', subtitle: '持续运行的粒子实验室', color: '#5d66df', width: 620, height: 470 },
};
export function registerDesktopTool(id: string, info: { title: string; subtitle: string; color: string; width?: number; height?: number }) {
  if (!/^generated:[A-Za-z0-9_-]{1,100}$/.test(id)) throw new Error('动态应用标识无效。');
  TOOLS[id] = { ...info, title: info.title.slice(0, 120) };
}
export type DesktopAction =
  | { type: 'open'; tool: ToolId; title?: string }
  | { type: 'focus' | 'close' | 'minimize' | 'maximize'; id: string }
  | { type: 'move'; id: string; x: number; y: number }
  | { type: 'resize'; id: string; width: number; height: number }
  | { type: 'tile'; width?: number; height?: number }
  | { type: 'restore'; id?: string };
export function createDesktop(): DesktopState { return { windows: [], activeId: null }; }
function isTool(value: unknown): value is ToolId { return typeof value === 'string' && Object.hasOwn(TOOLS, value); }
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function highestVisible(windows: WindowState[]) { return windows.filter(w => !w.minimized).reduce<WindowState | null>((a, w) => !a || w.z > a.z ? w : a, null)?.id ?? null; }
function focus(state: DesktopState, id: string): DesktopState {
  const target = state.windows.find(w => w.id === id);
  if (!target) return state;
  const top = Math.max(0, ...state.windows.map(w => w.z));
  // Normalize stacking at the boundary rather than letting persisted counters grow forever.
  const normalized = top > 100000 ? [...state.windows].sort((a,b)=>a.z-b.z).map((w,i)=>({...w,z:i+1})) : state.windows;
  const next = Math.max(0, ...normalized.map(w=>w.z)) + 1;
  return { windows: normalized.map(w => w.id === id ? { ...w, minimized: false, z: next } : w), activeId: id };
}
export function hydrateDesktop(raw: unknown, keepSavedGenerated = false): DesktopState {
  let data: unknown = raw;
  try { if (typeof data === 'string') data = JSON.parse(data); } catch { return createDesktop(); }
  if (!data || typeof data !== 'object') return createDesktop();
  const record = data as Record<string, unknown>;
  if (!Array.isArray(record.windows)) return createDesktop();
  const seen = new Set<string>(); const tools = new Set<ToolId>(); const windows: WindowState[] = [];
  for (const item of record.windows) {
    if (!item || typeof item !== 'object') continue;
    const w = item as Record<string, unknown>;
    const validTool = isTool(w.tool) || (keepSavedGenerated && typeof w.tool === 'string' && /^generated:[A-Za-z0-9_-]{1,100}$/.test(w.tool));
    if (!validTool || typeof w.id !== 'string' || !w.id.trim() || seen.has(w.id) || tools.has(w.tool as ToolId)) continue;
    if (![w.x,w.y,w.width,w.height,w.z].every(finite)) continue;
    const tool = w.tool as ToolId;
    seen.add(w.id); tools.add(tool);
    windows.push({ id: w.id, tool, title: typeof w.title === 'string' && w.title.trim() ? w.title.slice(0,100) : TOOLS[tool]?.title || '生成式 App',
      x: clamp(w.x as number,0,10000), y: clamp(w.y as number,0,10000), width: clamp(w.width as number,260,4000), height: clamp(w.height as number,180,4000), z: clamp(w.z as number,0,100000), minimized: w.minimized === true, maximized: w.maximized === true });
  }
  const activeId = typeof record.activeId === 'string' && windows.some(w=>w.id===record.activeId&&!w.minimized) ? record.activeId : highestVisible(windows);
  return { windows, activeId };
}
export function desktopReducer(state: DesktopState, action: DesktopAction): DesktopState {
  switch (action.type) {
    case 'open': {
      if (!isTool(action.tool)) return state;
      const existing = state.windows.find(w=>w.tool===action.tool);
      if (existing) return focus(state,existing.id);
      const offset = state.windows.length * 28;
      const window: WindowState = { id: action.tool, tool: action.tool, title: typeof action.title==='string'&&action.title.trim()?action.title.slice(0,100):TOOLS[action.tool].title, x: 48+offset, y: 40+offset, width: TOOLS[action.tool].width ?? (action.tool==='message'?540:380), height: TOOLS[action.tool].height ?? (action.tool==='contact'?280:420), z:0, minimized:false,maximized:false };
      return focus({ ...state, windows:[...state.windows,window] },window.id);
    }
    case 'focus': return focus(state,action.id);
    case 'close': {
      if (!state.windows.some(w=>w.id===action.id)) return state;
      const windows=state.windows.filter(w=>w.id!==action.id);
      return {windows,activeId:state.activeId===action.id?highestVisible(windows):state.activeId};
    }
    case 'minimize': {
      if (!state.windows.some(w=>w.id===action.id)) return state;
      const windows=state.windows.map(w=>w.id===action.id?{...w,minimized:true}:w);
      return {windows,activeId:state.activeId===action.id?highestVisible(windows):state.activeId};
    }
    case 'maximize': {
      if (!state.windows.some(w=>w.id===action.id)) return state;
      return focus({...state,windows:state.windows.map(w=>w.id===action.id?{...w,maximized:!w.maximized}:w)},action.id);
    }
    case 'move':
      if (!finite(action.x)||!finite(action.y)) return state;
      return {...state,windows:state.windows.map(w=>w.id===action.id?{...w,x:clamp(action.x,0,10000),y:clamp(action.y,0,10000)}:w)};
    case 'resize':
      if (!finite(action.width)||!finite(action.height)) return state;
      return {...state,windows:state.windows.map(w=>w.id===action.id?{...w,width:clamp(action.width,260,4000),height:clamp(action.height,180,4000)}:w)};
    case 'restore': {
      const windows=state.windows.map(w=>!action.id||w.id===action.id?{...w,minimized:false,maximized:false}:w);
      const next={windows,activeId:state.activeId ?? highestVisible(windows)};
      return action.id?focus(next,action.id):next;
    }
    case 'tile': {
      if ((action.width!==undefined&&!finite(action.width))||(action.height!==undefined&&!finite(action.height))) return state;
      const width=Math.max(1,action.width??1200); const height=Math.max(1,action.height??800);
      const visible=state.windows.filter(w=>!w.minimized); if(!visible.length)return state;
      const columns=width<650?1:Math.min(visible.length,Math.ceil(Math.sqrt(visible.length*width/height)));
      const rows=Math.ceil(visible.length/columns); const gap=Math.min(12,width/20,height/20);
      const cellWidth=Math.max(1,(width-gap*(columns+1))/columns); const cellHeight=Math.max(1,(height-gap*(rows+1))/rows);
      return {...state,windows:state.windows.map(w=>{const i=visible.findIndex(v=>v.id===w.id);return i<0?w:{...w,x:gap+(i%columns)*(cellWidth+gap),y:gap+Math.floor(i/columns)*(cellHeight+gap),width:cellWidth,height:cellHeight,maximized:false};})};
    }
    default: return state;
  }
}
export function toolsForMode(mode: unknown): ToolId[] {
  switch(mode){case 'meeting':return ['message','notes','calendar','contact'];case 'review':return ['message','notes','tasks'];case 'notes':return ['notes'];default:return ['message','notes'];}
}
