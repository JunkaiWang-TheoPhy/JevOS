import { staticSite } from '../site-mode.ts';
import type { GeneratedAppPackage } from './contracts';
import { checkedAppState } from './instance-state.ts';

export interface GeneratedAppMetadata { id: string; title: string; createdAt: string }
export class GeneratedApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(message: string, code: string, status = 0) { super(message); this.code = code; this.status = status; }
}

export function parseGeneratedMetadata(raw: unknown): GeneratedAppMetadata {
  if (!raw || typeof raw !== 'object') throw new GeneratedApiError('应用信息无效。', 'INVALID_RESPONSE');
  const value = raw as Record<string, unknown>;
  if (typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value.id) ||
      typeof value.title !== 'string' || !value.title.trim() || value.title.length > 120 ||
      typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) {
    throw new GeneratedApiError('应用信息无效。', 'INVALID_RESPONSE');
  }
  return { id: value.id, title: value.title, createdAt: value.createdAt };
}

export function parseGeneratedApp(raw: unknown): GeneratedAppPackage {
  const metadata = parseGeneratedMetadata(raw);
  const value = raw as Record<string, unknown>;
  if (typeof value.html !== 'string' || !value.html.trim() || typeof value.css !== 'string' || typeof value.js !== 'string') {
    throw new GeneratedApiError('生成应用缺少完整内容。', 'INVALID_RESPONSE');
  }
  if (new TextEncoder().encode(value.html + value.css + value.js).length > 256 * 1024) {
    throw new GeneratedApiError('生成应用超过内容大小限制。', 'INVALID_RESPONSE');
  }
  let initialState;
  try { initialState = checkedAppState(value.initialState ?? {}); }
  catch { throw new GeneratedApiError('生成应用初始状态无效。', 'INVALID_RESPONSE'); }
  return { ...metadata, html: value.html, css: value.css, js: value.js, initialState };
}

async function request(path: string, options: RequestInit, fetcher: typeof fetch = fetch) {
  const response = await fetcher(path, { ...options, credentials: 'same-origin' });
  let body;
  try { body = await response.json(); }
  catch { throw new GeneratedApiError('生成服务未返回有效数据。', 'INVALID_RESPONSE', response.status); }
  if (!response.ok) {
    const detail = typeof body?.error === 'string' ? body.error : body?.error?.message;
    throw new GeneratedApiError(typeof detail === 'string' ? detail.slice(0, 500) : body?.message || '生成服务暂时不可用。',
      body?.code || body?.error?.code || 'GENERATION_FAILED', response.status);
  }
  return body;
}

export async function generateApp(prompt: string, signal: AbortSignal, fetcher?: typeof fetch) {
  if (staticSite) throw new GeneratedApiError('下载 macOS 版，配置模型即可创建新应用。', 'DESKTOP_DOWNLOAD');
  const body = await request('/api/apps/generate', { method: 'POST', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) }, fetcher);
  return parseGeneratedApp(body.app);
}

export async function listGeneratedApps(signal: AbortSignal, fetcher?: typeof fetch): Promise<GeneratedAppMetadata[]> {
  if (staticSite) return [];
  const body = await request('/api/apps', { signal }, fetcher);
  if (!Array.isArray(body.apps)) throw new GeneratedApiError('应用目录无效。', 'INVALID_RESPONSE');
  return body.apps.map(parseGeneratedMetadata);
}

export async function loadGeneratedApp(id: string, signal: AbortSignal, fetcher?: typeof fetch) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new GeneratedApiError('应用标识无效。', 'INVALID_ID');
  const body = await request(`/api/apps/${encodeURIComponent(id)}`, { signal }, fetcher);
  return parseGeneratedApp(body.app);
}

export function readGeneratedCache(workspaceId: string): GeneratedAppPackage[] {
  try {
    const raw = JSON.parse(localStorage.getItem(`vibeos-generated-v1:${workspaceId}`) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.slice(-12).flatMap(value => { try { return [parseGeneratedApp(value)]; } catch { return []; } });
  } catch { return []; }
}

export function writeGeneratedCache(workspaceId: string, apps: GeneratedAppPackage[]) {
  localStorage.setItem(`vibeos-generated-v1:${workspaceId}`, JSON.stringify(apps.slice(-12)));
}
