import type { AppJson } from './contracts';

const MAX_STATE_BYTES = 64 * 1024;
export interface AppStateStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

export function checkedAppState(value: unknown): AppJson {
  function validate(item: unknown, depth = 0): void {
    if (depth > 24) throw new Error('应用状态嵌套过深。');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (Array.isArray(item)) { for (const child of item) validate(child, depth + 1); return; }
    if (item && typeof item === 'object' && Object.getPrototypeOf(item) === Object.prototype) {
      for (const [key, child] of Object.entries(item)) {
        if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('应用状态字段无效。');
        validate(child, depth + 1);
      }
      return;
    }
    throw new Error('应用状态必须是可保存的 JSON。');
  }
  validate(value);
  const serialized = JSON.stringify(value);
  if (new TextEncoder().encode(serialized).length > MAX_STATE_BYTES) throw new Error('应用状态超过 64 KiB。');
  return JSON.parse(serialized) as AppJson;
}

export function stateStorageKey(workspaceId: string, instanceId: string) {
  return `vibeos-appstate-v1:${encodeURIComponent(workspaceId)}:${encodeURIComponent(instanceId)}`;
}

export function readInstanceState(storage: AppStateStorage, workspaceId: string, instanceId: string): AppJson | null {
  try {
    const raw = storage.getItem(stateStorageKey(workspaceId, instanceId));
    return raw === null ? null : checkedAppState(JSON.parse(raw));
  } catch { return null; }
}

export function writeInstanceState(storage: AppStateStorage, workspaceId: string, instanceId: string, state: unknown) {
  storage.setItem(stateStorageKey(workspaceId, instanceId), JSON.stringify(checkedAppState(state)));
}
