import { decide, validateRequest } from './decision.mjs';
import { randomUUID } from 'node:crypto';

const SESSION_COOKIE = 'vibeos-session';

function json(res, status, value) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

export function readJson(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let exceeded = false;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        exceeded = true;
        chunks.length = 0;
      } else if (!exceeded) chunks.push(chunk);
    });
    req.on('end', () => {
      if (exceeded) { reject(Object.assign(new Error('请求过大。'), { statusCode: 413 })); return; }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('请求需要有效的 JSON。'), { statusCode: 400 })); }
    });
    req.on('error', reject);
    req.on('aborted', () => reject(Object.assign(new Error('请求已取消。'), { statusCode: 400 })));
  });
}

export function validateSessionCookieName(name) {
  if (typeof name !== 'string' || !/^[!#$%&'*+\-.^_`|~A-Za-z0-9]+$/.test(name)) {
    throw new TypeError('Invalid session cookie name');
  }
}

function sessionToken(req, name) {
  const entry = (req.headers.cookie ?? '').split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return entry?.slice(name.length + 1);
}

export function resolveSessionCookie(req, store, name) {
  const token = sessionToken(req, name);
  if (token !== undefined || name === SESSION_COOKIE || req.method !== 'GET') {
    return { token, migrated: false };
  }
  const legacy = sessionToken(req, SESSION_COOKIE);
  return store.getWorkspace(legacy)
    ? { token: legacy, migrated: true } : { token: undefined, migrated: false };
}

export function sessionCookieHeader(req, name, token, allowedOrigins) {
  const httpsHost = allowedOrigins.some((origin) => {
    try { const url = new URL(origin); return url.protocol === 'https:' && url.host === req.headers.host; }
    catch { return false; }
  });
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${httpsHost ? '; Secure' : ''}`;
}

function boundedContext(state, observations = {}) {
  const context = { mode: state.mode, pinned: state.pinned, note: state.note.slice(0, 1500),
    meeting: state.meeting, taskCount: state.tasks.length, tasks: state.tasks.slice(0, 8) };
  if (observations && typeof observations === 'object' && !Array.isArray(observations)) {
    if (typeof observations.note === 'string') context.note = observations.note.slice(0, 1500);
    if (typeof observations.editing === 'boolean') context.editing = observations.editing;
  }
  return context;
}

export function createWorkspaceHandler({ store, apiKey, model, allowedOrigins = [], fetcher,
  maxConcurrent = 4, maxDecisionsPerDay = 1000, modelTimeoutMs = 4000,
  sessionCookieName = SESSION_COOKIE } = {}) {
  validateSessionCookieName(sessionCookieName);
  if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 32 ||
      !Number.isSafeInteger(maxDecisionsPerDay) || maxDecisionsPerDay < 0 ||
      !Number.isSafeInteger(modelTimeoutMs) || modelTimeoutMs < 100 || modelTimeoutMs > 60000) {
    throw new RangeError('模型并发、每日调用上限或超时配置无效。');
  }
  const active = new Map();
  const limits = new Map();
  let inflight = 0;
  let day = '';
  let count = 0;

  function limited(key, ceiling) {
    const now = Date.now();
    const bucket = limits.get(key);
    if (!bucket || now - bucket.start >= 60000) {
      if (limits.size >= 2000) {
        for (const [id, value] of limits) if (now - value.start >= 60000) limits.delete(id);
        if (limits.size >= 2000) return true;
      }
      limits.set(key, { start: now, count: 1 });
      return false;
    }
    bucket.count++;
    return bucket.count > ceiling;
  }

  const handle = async (req, res, path) => {
    if (!['/api/workspace', '/api/actions', '/api/decisions', '/api/decide'].includes(path)) return false;
    let session;
    let callingModel = false;
    try {
      const expectedMethod = path === '/api/workspace' ? 'GET' : 'POST';
      if (req.method !== expectedMethod) {
        json(res, 405, { code: 'METHOD_NOT_ALLOWED', error: `请使用 ${expectedMethod}。` }); return true;
      }
      if (expectedMethod === 'POST') {
        if (!req.headers.origin || !allowedOrigins.includes(req.headers.origin)) {
          json(res, 403, { code: 'INVALID_ORIGIN', error: '此来源不能修改工作区或调用模型。' }); return true;
        }
        if (!req.headers['content-type']?.startsWith('application/json')) {
          json(res, 415, { code: 'INVALID_CONTENT_TYPE', error: '请求需要 application/json。' }); return true;
        }
      }
      const ip = req.socket.remoteAddress ?? 'unknown';
      if (limited(`ip:${ip}`, 180)) {
        res.setHeader('Retry-After', '60');
        json(res, 429, { code: 'RATE_LIMIT', error: '请求过于频繁，请稍后再试。' }); return true;
      }
      const resolved = resolveSessionCookie(req, store, sessionCookieName);
      session = store.getOrCreateWorkspace(resolved.token);
      if (session.created || resolved.migrated) {
        res.setHeader('Set-Cookie', sessionCookieHeader(req, sessionCookieName, session.token, allowedOrigins));
      }
      if (path === '/api/workspace') {
        json(res, 200, { workspace: session.workspace, created: session.created }); return true;
      }
      const input = await readJson(req);
      if (path === '/api/actions') {
        json(res, 200, store.applyAction(session.token, input)); return true;
      }
      if (path === '/api/decide' && input && typeof input === 'object' && !Array.isArray(input)) {
        input.requestId = randomUUID();
        input.contextVersion = 0;
        input.baseRevision = session.workspace.revision;
      }
      if (!input || typeof input !== 'object' || Array.isArray(input) ||
          typeof input.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input.requestId) ||
          !Number.isSafeInteger(input.contextVersion) || input.contextVersion < 0 ||
          !Number.isSafeInteger(input.baseRevision) || input.baseRevision < 0) {
        json(res, 400, { code: 'INVALID_DECISION', error: '判断请求的编号与版本无效。' }); return true;
      }
      if (input.baseRevision !== session.workspace.revision) {
        json(res, 409, { code: 'REVISION_CONFLICT', error: '工作区已有新修改，请同步后重新判断。', workspace: session.workspace }); return true;
      }
      const evaluation = validateRequest({ text: input.text,
        state: boundedContext(session.workspace.state, input.state) });
      if (limited(`decision:${session.workspace.id}`, 40)) {
        json(res, 429, { code: 'RATE_LIMIT', error: '智能判断过于频繁，手动工具仍可使用。' }); return true;
      }
      const today = new Date().toISOString().slice(0, 10);
      if (day !== today) { day = today; count = 0; }
      if (apiKey && (count >= maxDecisionsPerDay || inflight >= maxConcurrent)) {
        json(res, 429, { code: 'MODEL_LIMIT', error: '智能判断暂时达到限额，手动工具仍可使用。' }); return true;
      }
      const abort = new AbortController();
      active.get(session.workspace.id)?.abort.abort();
      active.set(session.workspace.id, { abort, requestId: input.requestId });
      res.on('close', () => { if (!res.writableEnded) abort.abort(); });
      inflight++;
      if (apiKey) count++;
      try {
        callingModel = Boolean(apiKey);
        const decision = await decide(evaluation,
        { apiKey, model, fetcher, signal: abort.signal, timeoutMs: modelTimeoutMs });
        if (abort.signal.aborted || active.get(session.workspace.id)?.requestId !== input.requestId) {
          json(res, 409, { code: 'SUPERSEDED', error: '此建议已被更新的请求替代。' }); return true;
        }
        json(res, 200, { ...decision, requestId: input.requestId, baseRevision: input.baseRevision,
          contextVersion: input.contextVersion, proposal: decision.choice === 'stay' ? null : { mode: decision.choice } });
      } finally {
        inflight--;
        if (active.get(session.workspace.id)?.requestId === input.requestId) active.delete(session.workspace.id);
      }
    } catch (error) {
      const status = error.statusCode ??
        (error.name === 'TimeoutError' || error.name === 'AbortError' ? 504 : error.status || callingModel ? 502 : 400);
      json(res, status, { code: error.code ?? 'DECISION_FAILED',
        error: status >= 500 && !error.status ? '智能服务暂时不可用，当前工作区已保留。' : error.message,
        ...(status === 409 && session ? { workspace: store.getWorkspace(session.token) } : {}) });
    }
    return true;
  };
  handle.close = () => { for (const entry of active.values()) entry.abort.abort(); };
  return handle;
}
