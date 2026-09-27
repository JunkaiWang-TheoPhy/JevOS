import type { AppJson } from './contracts';
export type AppActionHandler = (action: string, args: Record<string, AppJson>) => string | Promise<string>;
const handlers = new Map<string, AppActionHandler>();
const waiting = new Map<string, Set<{ resolve(handler: AppActionHandler): void; reject(error: Error): void }>>();
const keyFor = (workspaceId: string, appId: string) => JSON.stringify([workspaceId, appId]);
export function registerAppActions(workspaceId: string, appId: string, handler: AppActionHandler): () => void {
  const key = keyFor(workspaceId, appId);
  handlers.set(key, handler);
  const listeners = waiting.get(key);
  waiting.delete(key);
  listeners?.forEach(listener => listener.resolve(handler));
  return () => { if (handlers.get(key) === handler) handlers.delete(key); };
}
export function invokeAppAction(workspaceId: string, appId: string, action: string, args: Record<string, AppJson>): Promise<string> {
  const key = keyFor(workspaceId, appId);
  const handler = handlers.get(key);
  // Invoke synchronously before returning a promise to retain browser user activation.
  if (handler) { try { return Promise.resolve(handler(action, args)); } catch (error) { return Promise.reject(error); } }
  return new Promise<AppActionHandler>((resolve, reject) => {
    const listeners = waiting.get(key) ?? new Set();
    const entry = { resolve: (value: AppActionHandler) => { clearTimeout(timer); resolve(value); }, reject };
    const timer = setTimeout(() => { listeners.delete(entry); if (!listeners.size) waiting.delete(key); reject(new Error('应用未就绪或不支持此操作')); }, 3000);
    listeners.add(entry); waiting.set(key, listeners);
  }).then(value => { if (handlers.get(key) !== value) throw new Error('应用已关闭'); return value(action, args); });
}
