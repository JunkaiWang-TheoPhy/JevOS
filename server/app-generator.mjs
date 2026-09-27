import { Script } from 'node:vm';

export const MAX_APP_BYTES = 256 * 1024;

export function appError(statusCode, code, message) {
  return Object.assign(new Error(message), { statusCode, code });
}

export function validatePrompt(prompt) {
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 2000) {
    throw appError(400, 'INVALID_APP_PROMPT', '请用 1–2000 字描述想要的应用。');
  }
  return prompt.trim();
}

function checkJson(value, depth = 0, budget = { remaining: 8192 }) {
  if (--budget.remaining < 0) {
    throw appError(422, 'APP_STATE_TOO_COMPLEX', '应用初始状态超过 8192 个 JSON 节点。');
  }
  if (depth > 16) throw appError(422, 'INVALID_APP_STATE', '应用初始状态嵌套过深。');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) { for (const item of value) checkJson(item, depth + 1, budget); return; }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, item] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) {
        throw appError(422, 'INVALID_APP_STATE', '应用状态含有不允许的属性。');
      }
      checkJson(item, depth + 1, budget);
    }
    return;
  }
  throw appError(422, 'INVALID_APP_STATE', '应用状态必须是有限的 JSON 数据。');
}

export function validateAppPackage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw appError(422, 'INVALID_APP_PACKAGE', '生成模型没有返回有效的应用包。');
  }
  const { title, html, css, js, initialState } = value;
  if (typeof title !== 'string' || !title.trim() || title.length > 80 ||
      typeof html !== 'string' || !html.trim() || typeof css !== 'string' || typeof js !== 'string') {
    throw appError(422, 'INVALID_APP_PACKAGE', '应用包需要 title、html、css、js 字段。');
  }
  if (Buffer.byteLength(html + css + js, 'utf8') > MAX_APP_BYTES) {
    throw appError(422, 'APP_TOO_LARGE', '应用代码超过 256 KiB，请缩小需求。');
  }
  if (/<\s*\/?\s*(script|iframe|object|embed|base|meta|link|html|head)\b/i.test(html) ||
      /\bon\w+\s*=/i.test(html) || /javascript\s*:/i.test(html) ||
      /<\s*\/\s*style/i.test(css) || /<\s*\/\s*script/i.test(js)) {
    throw appError(422, 'INVALID_APP_MARKUP', '应用包含有不允许的嵌入标签或内联事件。');
  }
  try { new Script(js); }
  catch { throw appError(422, 'INVALID_APP_SCRIPT', '应用脚本语法无效或包含不支持的模块语法。'); }
  if (!initialState || typeof initialState !== 'object' || Array.isArray(initialState)) {
    throw appError(422, 'INVALID_APP_STATE', '应用初始状态必须是普通 JSON 对象。');
  }
  checkJson(initialState);
  if (Buffer.byteLength(JSON.stringify(initialState), 'utf8') > 32 * 1024) {
    throw appError(422, 'APP_STATE_TOO_LARGE', '初始状态超过 32 KiB。');
  }
  return { title: title.trim(), html, css, js, initialState: JSON.parse(JSON.stringify(initialState)) };
}

export function parseGeneratedApp(content) {
  if (typeof content !== 'string') throw appError(502, 'INVALID_MODEL_RESPONSE', '模型响应没有应用内容。');
  const raw = content.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  let value;
  try { value = JSON.parse(raw); }
  catch { throw appError(422, 'INVALID_APP_JSON', '生成模型返回的应用包不是有效 JSON。'); }
  return validateAppPackage(value);
}

const SYSTEM = `Create a complete, working, distinctive miniature application for the user's request.
Return ONLY one JSON object with title (string), html (string), css (string), js (string), initialState (JSON).
html is a BODY FRAGMENT: no html/head/meta/base/link/script/iframe/object/embed tags, no inline event attributes.
css is self-contained; no remote assets/fonts/CDNs. Give this app its own visual identity, appropriate to the request.
js is ordinary script JavaScript: no import/export, no top-level await, no direct network, no host DOM access, no eval/new Function.
The app runs inside an isolated iframe. Query only your own document, attach listeners in js, and perform real local calculations/interactions.
An already-defined global vibe object exposes getState(), returning a JSON snapshot, and setState(patch), returning a Promise of the committed snapshot. Awaiting either is valid. Initialize using an async IIFE, for example:
(async () => {
  let state = await vibe.getState();
  const button = document.querySelector('button');
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const count = (state.count || 0) + 1;
      await vibe.setState({ count });
      state = { ...state, count };
      button.textContent = String(count);
    } finally { button.disabled = false; }
  });
})().catch(error => { document.body.textContent = error.message; });
Update your local state only AFTER setState succeeds, and serialize pending writes to avoid stale concurrent updates. A failed save must not advance the displayed saved state.
initialState must be a plain JSON object. setState(patch) accepts a plain JSON object and shallow-merges it into this instance's state.
No readNote, setNote, listApps, openApp, exportText, network or shell methods exist. Use only your own generated content and instance state.
getState() returns this app INSTANCE's saved JSON. Persist edits/settings using setState(), and initialize from getState() or initialState.
For animation, keep workload bounded. Listen for document visibility changes; cancel timers/animation frames when hidden or closing.
vibe.onVisibilityChange(callback) synchronously registers callback(active:boolean) and returns an unsubscribe function.
The window also dispatches vibe:visibility events with event.detail.active. Pause animation when active=false and restart it when true.
Use Canvas or inline SVG when appropriate. Buttons and forms must work locally. Label form controls. Fit within a resizable window.
Never fabricate real-world bookings, payments, command execution, live data, or external-service success. Use placeholder data if needed; omit demo, sample, and simulation badges from the UI unless explicitly requested.
All three code strings together must be under 256 KiB; initialState under 32 KiB and at most 8192 total JSON values/containers, counting the root and every array item. The app should be useful immediately, not a skeleton.
Use the same language as the user's request. Return properly escaped JSON strings, no commentary or markdown.`;

export function generatorConfig(env = process.env) {
  const apiKey = env.APP_GENERATOR_API_KEY || env.OPENAI_API_KEY || '';
  const model = env.APP_GENERATOR_MODEL || env.OPENAI_MODEL || '';
  const baseUrl = env.APP_GENERATOR_BASE_URL || env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const reasoningEffort = env.APP_GENERATOR_REASONING_EFFORT || undefined;
  return { apiKey, model, baseUrl, ...(reasoningEffort ? { reasoningEffort } : {}) };
}

export async function generateApp(prompt, { apiKey, model, baseUrl = 'https://api.openai.com/v1',
  fetcher = fetch, signal, reasoningEffort, timeoutMs = 45000 } = {}) {
  prompt = validatePrompt(prompt);
  if (!apiKey || !model) {
    throw appError(503, 'APP_GENERATOR_NOT_CONFIGURED', '请配置服务端应用生成模型。Jev 已接入，但不能生成应用代码。');
  }
  let endpoint;
  try {
    endpoint = new URL(baseUrl.replace(/\/+$/, '') + '/chat/completions');
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
        (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)))) throw new Error();
  } catch { throw appError(503, 'INVALID_GENERATOR_CONFIG', '生成模型地址必须是 HTTPS 或本机 HTTP 的 API Base URL。'); }
  const boundedSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
  const start = performance.now();
  const response = await fetcher(endpoint.href, {
    method: 'POST', redirect: 'error', signal: boundedSignal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: prompt }],
      [endpoint.hostname === 'api.deepseek.com' ? 'max_tokens' : 'max_completion_tokens']: 10000,
      ...(endpoint.hostname === 'api.deepseek.com' ? { response_format: { type: 'json_object' },
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}) } : {}) }),
  });
  if (!response.ok) {
    throw appError(502, 'APP_GENERATOR_UPSTREAM', `生成服务返回 HTTP ${response.status}，已有应用保持不变。`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw appError(502, 'INVALID_MODEL_RESPONSE', '生成服务没有返回内容。');
  const chunks = []; let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 2 * 1024 * 1024) {
        await reader.cancel();
        throw appError(502, 'MODEL_RESPONSE_TOO_LARGE', '生成服务响应过大。');
      }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  let data;
  try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw appError(502, 'INVALID_MODEL_RESPONSE', '生成服务返回格式无效。'); }
  boundedSignal.throwIfAborted();
  const app = parseGeneratedApp(data?.choices?.[0]?.message?.content);
  return { ...app, generation: { model, elapsedMs: Math.round(performance.now() - start) } };
}
