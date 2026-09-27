import { readJson, resolveSessionCookie, sessionCookieHeader, validateSessionCookieName } from './workspace-api.mjs';
import { appError, generateApp, generatorConfig, validatePrompt } from './app-generator.mjs';

function json(res, status, value) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
export function createGeneratedAppHandler({ workspaceStore, appStore, allowedOrigins = [],
  config = generatorConfig(), fetcher, generate = generateApp, maxConcurrent = 2, maxGenerationsPerDay = 30,
  sessionCookieName = 'vibeos-session' } = {}) {
  validateSessionCookieName(sessionCookieName);
  if (!workspaceStore || !appStore) throw new Error('Generated app handler requires stores');
  if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 8 ||
      !Number.isSafeInteger(maxGenerationsPerDay) || maxGenerationsPerDay < 0 || maxGenerationsPerDay > 1000) {
    throw new RangeError('Invalid app generation limits');
  }
  const active = new Set(); const attempts = new Map();
  let day = ''; let generations = 0;
  const handle = async (req, res, path) => {
    if (!(path === '/api/apps' || path.startsWith('/api/apps/'))) return false;
    let abort;
    try {
      const resolved = resolveSessionCookie(req, workspaceStore, sessionCookieName);
      const workspace = workspaceStore.getWorkspace(resolved.token);
      if (!workspace) throw appError(401, 'APP_WORKSPACE_REQUIRED', '请先打开并同步工作区。');
      if (resolved.migrated) {
        res.setHeader('Set-Cookie', sessionCookieHeader(req, sessionCookieName, resolved.token, allowedOrigins));
      }
      if (path === '/api/apps' && req.method === 'GET') {
        json(res, 200, { apps: appStore.list(workspace.id), generatorConfigured: Boolean(config.apiKey && config.model) });
        return true;
      }
      if (path === '/api/apps/generate') {
        if (req.method !== 'POST') throw appError(405, 'METHOD_NOT_ALLOWED', '请使用 POST。');
        if (!allowedOrigins.includes(req.headers.origin)) throw appError(403, 'INVALID_ORIGIN', '此来源不能生成应用。');
        if (!req.headers['content-type']?.startsWith('application/json')) throw appError(415, 'INVALID_CONTENT_TYPE', '请求需要 application/json。');
        if (!config.apiKey || !config.model) throw appError(503, 'APP_GENERATOR_NOT_CONFIGURED', '请配置服务端应用生成模型。Jev 已接入，但不能生成应用代码。');
        const input = await readJson(req, 16 * 1024);
        const prompt = validatePrompt(input?.prompt);
        const now = Date.now();
        const last = attempts.get(workspace.id);
        if (last && now - last < 2000) throw appError(429, 'APP_RATE_LIMIT', '请等待当前应用生成完成。');
        const today = new Date().toISOString().slice(0, 10);
        if (day !== today) { day = today; generations = 0; attempts.clear(); }
        if (active.size >= maxConcurrent || generations >= maxGenerationsPerDay) throw appError(429, 'APP_GENERATION_LIMIT', '应用生成暂时达到限额。');
        attempts.set(workspace.id, now); generations++;
        abort = new AbortController(); active.add(abort);
        res.on('close', () => { if (!res.writableEnded) abort.abort(); });
        const result = await generate(prompt, { ...config, fetcher, signal: abort.signal });
        abort.signal.throwIfAborted();
        const app = appStore.save(workspace.id, prompt, result);
        json(res, 201, { app, ...(result.generation ? { generation: result.generation } : {}) });
        return true;
      }
      const id = path.slice('/api/apps/'.length);
      if (req.method !== 'GET') throw appError(405, 'METHOD_NOT_ALLOWED', '请使用 GET。');
      if (!/^gen-[a-f0-9-]{36}$/.test(id)) throw appError(404, 'APP_NOT_FOUND', '未找到此应用。');
      const app = appStore.get(workspace.id, id);
      if (!app) throw appError(404, 'APP_NOT_FOUND', '未找到此应用。');
      json(res, 200, { app });
    } catch (error) {
      const timedOut = ['AbortError', 'TimeoutError'].includes(error.name);
      json(res, error.statusCode || (timedOut ? 504 : 502), {
        code: error.code || (timedOut ? 'APP_GENERATION_CANCELLED' : 'APP_GENERATION_FAILED'),
        error: error.statusCode ? error.message : timedOut ? '生成已取消或超时，已有应用保持不变。' : '应用生成失败，已有应用保持不变。',
      });
    } finally { if (abort) active.delete(abort); }
    return true;
  };
  handle.close = () => { for (const abort of active) abort.abort(); };
  return handle;
}
