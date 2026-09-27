import { createHash } from 'node:crypto';
import { readJson, resolveSessionCookie, validateSessionCookieName } from './workspace-api.mjs';
import { planScene } from './scene-planner.mjs';

export const SCENE_APPS = [
  ['message', '消息'], ['notes', '笔记'], ['calendar', '日历'], ['tasks', '评审待办'],
  ['contact', '联系人'], ['calculator', '计算器'], ['terminal', 'Terminal'],
  ['motion-lab', 'Motion Lab'], ['generated:draft-data-studio', 'Data Studio · 预制样例'],
].map(([id, title]) => ({ id, title }));

function failure(statusCode, code, message) { return Object.assign(new Error(message), { statusCode, code }); }
function json(res, status, body) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function withAbort(work, signal) {
  signal.throwIfAborted();
  let onAbort;
  const interrupted = new Promise((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try { return await Promise.race([work(), interrupted]); }
  finally { signal.removeEventListener('abort', onAbort); }
}

// Produces proposals only. The client owns window instances and applies a proposal
// atomically after checking its desktop revision; this handler never edits app data.
export function createSceneHandler({ store, appStore, allowedOrigins = [], sessionCookieName = 'vibeos-session',
  apiKey, model = 'jev-latest', fetcher, timeoutMs = 7000, plan = planScene,
  maxConcurrent = 4, maxPlansPerDay = 1000, maxPlansPerMinute = 20 } = {}) {
  validateSessionCookieName(sessionCookieName);
  if (!store || !appStore) throw new TypeError('Scene handler requires workspace and app stores');
  for (const [value, minimum, maximum] of [[maxConcurrent, 1, 32], [maxPlansPerDay, 0, 100000],
    [maxPlansPerMinute, 1, 100], [timeoutMs, 100, 60000]]) {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RangeError('Invalid scene limits');
  }
  const active = new Map();
  const cache = new Map();
  const buckets = new Map();
  let day = '', count = 0, inflight = 0;
  const handle = async (req, res, path) => {
    if (path !== '/api/scenes/plan') return false;
    let entry, owner;
    try {
      if (req.method !== 'POST') throw failure(405, 'METHOD_NOT_ALLOWED', '请使用 POST。');
      if (!allowedOrigins.includes(req.headers.origin)) throw failure(403, 'INVALID_ORIGIN', '此来源不能规划桌面。');
      if (!req.headers['content-type']?.startsWith('application/json')) throw failure(415, 'INVALID_CONTENT_TYPE', '请求需要 application/json。');
      const { token } = resolveSessionCookie(req, store, sessionCookieName);
      const workspace = store.getWorkspace(token);
      if (!workspace) throw failure(401, 'WORKSPACE_REQUIRED', '请先同步工作区。');
      owner = workspace.id;
      const input = await readJson(req, 48 * 1024);
      if (!input || typeof input !== 'object' || Array.isArray(input) ||
        typeof input.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input.requestId) ||
        !Number.isSafeInteger(input.baseRevision) || input.baseRevision < 0 ||
        !Number.isSafeInteger(input.desktopRevision) || input.desktopRevision < 0) {
        throw failure(400, 'INVALID_SCENE', '场景请求编号与版本无效。');
      }
      if (input.baseRevision !== workspace.revision) throw failure(409, 'REVISION_CONFLICT', '工作区已有新修改，请同步后重新规划。');
      const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
      const saved = cache.get(owner);
      if (saved?.requestId === input.requestId) {
        if (saved.fingerprint !== fingerprint) throw failure(409, 'REQUEST_ID_REUSED', '请求编号已用于另一条指令。');
        json(res, 200, { ...saved.result, duplicate: true }); return true;
      }
      const current = active.get(owner);
      if (current?.requestId === input.requestId) throw failure(409, 'REQUEST_IN_PROGRESS', '此场景仍在规划中。');
      const now = Date.now();
      for (const [id, bucket] of buckets) if (now - bucket.start > 60000) buckets.delete(id);
      if (buckets.size >= 2000 && !buckets.has(owner)) throw failure(429, 'SCENE_RATE_LIMIT', '场景请求暂时达到限额。');
      const bucket = buckets.get(owner) || { start: now, count: 0 };
      bucket.count++; buckets.set(owner, bucket);
      const today = new Date().toISOString().slice(0, 10);
      if (today !== day) { day = today; count = 0; }
      if (bucket.count > maxPlansPerMinute || count >= maxPlansPerDay || inflight >= maxConcurrent) {
        throw failure(429, 'SCENE_RATE_LIMIT', '场景规划暂时达到限额，已有窗口仍可使用。');
      }
      current?.abort.abort();
      entry = { requestId: input.requestId, abort: new AbortController() };
      active.set(owner, entry); inflight++; count++;
      res.on('close', () => { if (!res.writableEnded) entry.abort.abort(); });
      const apps = [...SCENE_APPS, ...appStore.list(owner).map(app => ({ id: `generated:${app.id}`, title: app.title }))];
      const signal = AbortSignal.any([entry.abort.signal, AbortSignal.timeout(timeoutMs)]);
      const result = await withAbort(() => plan(input, { apps, apiKey, model, fetcher, signal, timeoutMs }), signal);
      if (entry.abort.signal.aborted || active.get(owner) !== entry) throw failure(409, 'SUPERSEDED', '此规划已被新的操作替代。');
      if (store.getWorkspace(token)?.revision !== input.baseRevision) throw failure(409, 'REVISION_CONFLICT', '规划期间工作区发生修改，请重新规划。');
      if (cache.size >= 1000 && !cache.has(owner)) cache.delete(cache.keys().next().value);
      const tagged = { ...result, requestId: input.requestId, baseRevision: input.baseRevision, desktopRevision: input.desktopRevision };
      cache.set(owner, { requestId: input.requestId, fingerprint, result: tagged });
      json(res, 200, tagged);
    } catch (error) {
      const superseded = entry && (entry.abort.signal.aborted || active.get(owner) !== entry);
      const timeout = ['AbortError', 'TimeoutError'].includes(error.name);
      json(res, superseded ? 409 : error.statusCode || (timeout ? 504 : 502), {
        code: superseded ? 'SUPERSEDED' : typeof error.code === 'string' ? error.code : (timeout ? 'SCENE_TIMEOUT' : 'SCENE_FAILED'),
        error: superseded ? '此规划已被新的操作替代。' : error.statusCode ? error.message :
          timeout ? '规划超时，当前桌面已保留。' : '规划暂时失败，当前桌面已保留。',
      });
    } finally {
      if (entry) { inflight--; if (active.get(owner) === entry) active.delete(owner); }
    }
    return true;
  };
  handle.close = () => { for (const entry of active.values()) entry.abort.abort(); };
  return handle;
}
