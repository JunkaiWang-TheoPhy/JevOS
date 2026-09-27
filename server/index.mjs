import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorkspaceStore } from './store.mjs';
import { createWorkspaceHandler } from './workspace-api.mjs';
import { createGeneratedAppStore } from './generated-app-store.mjs';
import { createGeneratedAppHandler } from './generated-app-routes.mjs';
import { generatorConfig as readGeneratorConfig } from './app-generator.mjs';
import { createSceneHandler } from './scene-routes.mjs';
import { createMessageSimulationHandler } from './message-sim-handler.mjs';
import { createTerminalSimulationHandler } from './terminal-simulation.mjs';

const root = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

export function createAppServer({ serveStatic = false, apiKey = process.env.TYPESAFE_API_KEY,
  model = process.env.JEV_MODEL || 'jev-latest', allowedOrigins = [], fetcher,
  databasePath = ':memory:', store = createWorkspaceStore({ filename: databasePath }),
  maxDecisionsPerDay = 1000, maxConcurrent = 4, modelTimeoutMs = 4000,
  generationConfig = readGeneratorConfig(), maxGenerationsPerDay = 30,
  sessionCookieName = process.env.VIBEOS_SESSION_COOKIE || 'vibeos-session',
  generatedStore = createGeneratedAppStore({ filename: databasePath }) } = {}) {
  const workspaceHandler = createWorkspaceHandler({ store, apiKey, model, allowedOrigins, fetcher,
    maxDecisionsPerDay, maxConcurrent, modelTimeoutMs, sessionCookieName });
  const appHandler = createGeneratedAppHandler({ workspaceStore: store, appStore: generatedStore,
    allowedOrigins, config: generationConfig, fetcher, maxGenerationsPerDay, sessionCookieName });
  const sceneHandler = createSceneHandler({ store, appStore: generatedStore, allowedOrigins, sessionCookieName,
    apiKey, model, fetcher, timeoutMs: modelTimeoutMs, maxPlansPerDay: maxDecisionsPerDay });
  const messageHandler = createMessageSimulationHandler({ workspaceStore: store, appStore: generatedStore,
    allowedOrigins, sessionCookieName, configFactory: () => generationConfig, fetcher });
  const terminalHandler = createTerminalSimulationHandler({ workspaceStore: store, allowedOrigins,
    sessionCookieName, configFactory: () => generationConfig, fetcher });
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path.startsWith('/api/')) {
        if (await workspaceHandler(req, res, path)) return;
        if (await appHandler(req, res, path)) return;
        if (await sceneHandler(req, res, path)) return;
        if (await messageHandler(req, res, path)) return;
        if (await terminalHandler(req, res, path)) return;
        if (path === '/api/config' && req.method === 'GET') {
          json(res, 200, { jevConfigured: Boolean(apiKey), generatorConfigured: Boolean(generationConfig.apiKey && generationConfig.model) });
          return;
        }
        if (path === '/api/health' && req.method === 'GET') {
          json(res, 200, { ok: true, configured: Boolean(apiKey), model });
          return;
        }
        json(res, 404, { error: '接口不存在。' });
        return;
      }
      if (!serveStatic) { json(res, 404, { error: '前端请访问 http://localhost:5173。' }); return; }
      if (!['GET', 'HEAD'].includes(req.method)) { json(res, 405, { error: '不支持此方法。' }); return; }
      let file = resolve(root, '.' + decodeURIComponent(path === '/' ? '/index.html' : path));
      if (!file.startsWith(root + sep)) { json(res, 403, { error: '路径不可访问。' }); return; }
      try { if (!(await stat(file)).isFile()) throw new Error('not-file'); }
      catch {
        if (extname(path)) { json(res, 404, { error: '文件不存在。' }); return; }
        file = resolve(root, 'index.html');
      }
      const data = await readFile(file);
      const headers = { 'Content-Type': types[extname(file)] || 'application/octet-stream',
        'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
        'Content-Security-Policy': "frame-src 'self' blob:; object-src 'none'; base-uri 'self'",
        'Content-Length': data.length };
      if (['.ogg', '.mp3', '.wav'].includes(extname(file))) {
        headers['Accept-Ranges'] = 'bytes';
        if (req.headers.range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
          let start = match?.[1] ? Number(match[1]) : match?.[2] ? Math.max(0, data.length - Number(match[2])) : NaN;
          const end = match?.[1] && match?.[2] ? Math.min(data.length - 1, Number(match[2])) : data.length - 1;
          if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= data.length) {
            res.writeHead(416, { 'Content-Range': `bytes */${data.length}`, 'Content-Length': 0 }); res.end(); return;
          }
          start = Math.floor(start);
          res.writeHead(206, { ...headers, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${data.length}` });
          res.end(req.method === 'HEAD' ? undefined : data.subarray(start, end + 1)); return;
        }
      }
      res.writeHead(200, headers);
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      if (!res.headersSent) json(res, error.statusCode || 400, { error: '请求无法处理。' });
    }
  });
  const closeServer = server.close.bind(server);
  server.close = callback => {
    appHandler.close(); workspaceHandler.close(); sceneHandler.close(); messageHandler.close(); terminalHandler.close();
    return closeServer(callback);
  };
  server.once('close', () => { generatedStore.close(); store.close(); });
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const serveStatic = process.argv.includes('--static');
  const port = Number(process.env.PORT || (serveStatic ? 4173 : 4107));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 必须是有效端口。');
  const allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173',
    `http://localhost:${port}`, `http://127.0.0.1:${port}`, ...(process.env.ALLOWED_ORIGIN ? [process.env.ALLOWED_ORIGIN] : [])];
  const server = createAppServer({ serveStatic, allowedOrigins,
    databasePath: process.env.VIBEOS_DB_PATH || resolve(fileURLToPath(new URL('../.data/vibeos.sqlite', import.meta.url))),
    maxDecisionsPerDay: Number(process.env.MAX_DECISIONS_PER_DAY || 1000) });
  server.on('error', (error) => { console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用。` : error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => {
    console.log(`JevOS ${serveStatic ? 'PWA' : 'API'}: http://localhost:${port}`);
    console.log(process.env.TYPESAFE_API_KEY ? 'Jev: configured (server-side key)' : 'Jev: local rules demo; add TYPESAFE_API_KEY to .env.local');
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
