import type { AppJson, GeneratedAppPackage } from '../contracts.ts';

// Permit native local submit events. Actual submission/navigation remains
// blocked by CSP form-action 'none', including form.submit() bypassing events.
export const GENERATED_FRAME_SANDBOX = 'allow-scripts allow-forms';
export const FRAME_CHANNEL = 'vibe-generated-v1';
export const MAX_STATE_BYTES = 64 * 1024;
export const MAX_APP_BYTES = 256 * 1024;

type FrameMethod = 'getState' | 'setState';
export interface FrameRequest {
  channel: typeof FRAME_CHANNEL;
  nonce: string;
  instanceId: string;
  id: string;
  type: 'request';
  method: FrameMethod;
  args: AppJson[];
}
export interface FrameSignal {
  channel: typeof FRAME_CHANNEL;
  nonce: string;
  instanceId: string;
  id: string;
  type: 'ready' | 'runtime-error';
  message?: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

/** Bound both traversal cost and serialized size before accepting app-controlled state. */
export function isSafeState(value: unknown): value is AppJson {
  let remaining = 8192;
  const visit = (item: unknown, depth: number): boolean => {
    if (--remaining < 0 || depth > 24) return false;
    if (item === null || typeof item === 'boolean') return true;
    if (typeof item === 'number') return Number.isFinite(item);
    if (typeof item === 'string') return item.length <= MAX_STATE_BYTES;
    if (Array.isArray(item)) return item.length <= 8192 && item.every(child => visit(child, depth + 1));
    if (!record(item)) return false;
    return Object.entries(item).every(([key, child]) => !['__proto__', 'prototype', 'constructor'].includes(key) && visit(child, depth + 1));
  };
  try { return visit(value, 0) && new TextEncoder().encode(JSON.stringify(value)).length <= MAX_STATE_BYTES; }
  catch { return false; }
}

export function parseFrameMessage(value: unknown, nonce: string, source: unknown, expectedSource: unknown, instanceId: string): FrameRequest | FrameSignal | null {
  if (!expectedSource || source !== expectedSource || !record(value)) return null;
  if (value.channel !== FRAME_CHANNEL || value.nonce !== nonce || value.instanceId !== instanceId || typeof value.id !== 'string' || !/^m_[1-9][0-9]{0,12}$/.test(value.id)) return null;
  if (value.type === 'ready') return { channel: FRAME_CHANNEL, nonce, instanceId, id: value.id, type: 'ready' };
  if (value.type === 'runtime-error') {
    return typeof value.message === 'string' && value.message.length <= 2000
      ? { channel: FRAME_CHANNEL, nonce, instanceId, id: value.id, type: 'runtime-error', message: value.message } : null;
  }
  if (value.type !== 'request' || !Array.isArray(value.args)) return null;
  const args = value.args;
  switch (value.method) {
    case 'getState': if (args.length !== 0) return null; break;
    case 'setState': if (args.length !== 1 || !record(args[0]) || !isSafeState(args[0])) return null; break;
    default: return null;
  }
  return { channel: FRAME_CHANNEL, nonce, instanceId, id: value.id, type: 'request', method: value.method, args: args as AppJson[] };
}

function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/** No app markup is interpolated into HTML. A browser parser rebuilds allowed nodes. */
export function buildFrameDocument(app: Pick<GeneratedAppPackage, 'html' | 'css' | 'js'>, nonce: string, instanceId = 'generated'): string {
  if (!/^[a-f0-9]{32,128}$/.test(nonce)) throw new Error('Invalid frame nonce');
  if (typeof instanceId !== 'string' || !instanceId || instanceId.length > 200) throw new Error('Invalid app instance');
  if (!app || typeof app.html !== 'string' || !app.html.trim() || typeof app.css !== 'string' || typeof app.js !== 'string') throw new Error('应用包缺少完整 HTML、CSS 或 JavaScript。');
  if (new TextEncoder().encode(app.html + app.css + app.js).length > MAX_APP_BYTES) throw new Error('应用内容超过 256 KiB。');
  const csp = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data: blob:; font-src 'none'; connect-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  // Both policies must allow a script: the first requires our nonce, while the
  // second permits only inline code. A generated app cannot reuse its nonce to
  // load a remote script. The embedding page must separately restrict frame-src.
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta http-equiv="Content-Security-Policy" content="script-src 'unsafe-inline'"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;min-height:100%;font-family:system-ui,sans-serif}*{box-sizing:border-box}body{overflow:auto}#vibe-runtime-error{padding:18px;background:#fff1f0;color:#842d2d;white-space:pre-wrap}</style></head><body><main id="vibe-root"></main><script nonce="${nonce}">
(() => {
  'use strict';
  const source = ${scriptJson({ html: app.html, css: app.css, js: app.js })};
  const nonce = ${scriptJson(nonce)};
  const instanceId = ${scriptJson(instanceId)};
  const channel = ${scriptJson(FRAME_CHANNEL)};
  const post = parent.postMessage.bind(parent);
  const pending = new Map();
  const listeners = new Set();
  let sequence = 0;
  let active = false;
  let desiredActive = false;
  let initialized = false;
  let disposed = false;
  let snapshot = {};
  let hadError = false;
  const nativeTimeout = window.setTimeout.bind(window);
  const nativeClearTimeout = window.clearTimeout.bind(window);
  const nativeFrame = window.requestAnimationFrame.bind(window);
  const nativeCancelFrame = window.cancelAnimationFrame.bind(window);
  const resources = new Map();
  let resourceId = 0;
  const clone = value => JSON.parse(JSON.stringify(value));
  const nextId = () => 'm_' + (++sequence);
  const send = (type, payload) => { if (!disposed) post({ channel, nonce, instanceId, id: nextId(), type, ...payload }, '*'); };
  const report = error => {
    if (disposed) return;
    hadError = true;
    const message = String(error && error.message || error || '未知脚本错误').slice(0, 2000);
    let panel = document.getElementById('vibe-runtime-error');
    if (!panel) { panel = document.createElement('div'); panel.id = 'vibe-runtime-error'; panel.setAttribute('role', 'alert'); document.body.prepend(panel); }
    panel.textContent = '应用运行出错，其他窗口不受影响。\\n' + message;
    send('runtime-error', { message });
  };
  addEventListener('error', event => report(event.error || event.message));
  addEventListener('unhandledrejection', event => { event.preventDefault(); report(event.reason); });
  const request = (method, args) => new Promise((resolve, reject) => {
    if (pending.size >= 64) { reject(new Error('请求过多，请稍后重试')); return; }
    const id = nextId();
    if (disposed) { reject(new Error('应用已关闭')); return; }
    const timer = nativeTimeout(() => { pending.delete(id); reject(new Error('宿主请求超时')); }, 10000);
    pending.set(id, { resolve, reject, timer });
    try { post({ channel, nonce, instanceId, id, type: 'request', method, args }, '*'); }
    catch (error) { nativeClearTimeout(timer); pending.delete(id); reject(error); }
  });
  const cancelResource = id => {
    const item = resources.get(id);
    if (!item) return;
    if (item.kind === 'frame') nativeCancelFrame(item.handle);
    else nativeClearTimeout(item.handle);
    resources.delete(id);
  };
  const schedule = item => {
    if (!active || disposed || !resources.has(item.id)) return;
    if (item.kind === 'frame') {
      item.handle = nativeFrame(time => {
        if (!active || disposed || !resources.has(item.id)) return;
        resources.delete(item.id);
        try { item.callback(time); } catch (error) { report(error); }
      });
    } else {
      item.due = performance.now() + item.remaining;
      item.handle = nativeTimeout(() => {
        if (!active || disposed || !resources.has(item.id)) return;
        if (!item.repeat) resources.delete(item.id);
        try { item.callback(...item.args); } catch (error) { report(error); }
        if (item.repeat && resources.has(item.id)) { item.remaining = item.delay; schedule(item); }
      }, item.remaining);
    }
  };
  const addResource = (kind, callback, delay, args, repeat) => {
    if (typeof callback !== 'function') throw new TypeError('计时器仅接受函数');
    if (disposed) return 0;
    if (resources.size >= 256) throw new Error('应用计时器数量超过限制');
    const safeDelay = Math.min(2147483647, Math.max(repeat ? 16 : 0, Number(delay) || 0));
    const item = { id: ++resourceId, kind, callback, args, repeat, delay: safeDelay, remaining: safeDelay, due: 0, handle: 0 };
    resources.set(item.id, item); schedule(item); return item.id;
  };
  window.setTimeout = (callback, delay = 0, ...args) => addResource('timer', callback, delay, args, false);
  window.setInterval = (callback, delay = 0, ...args) => addResource('timer', callback, delay, args, true);
  window.clearTimeout = window.clearInterval = cancelResource;
  window.requestAnimationFrame = callback => addResource('frame', callback, 0, [], false);
  window.cancelAnimationFrame = cancelResource;
  const activity = requested => {
    desiredActive = requested;
    const next = requested && !document.hidden && !disposed;
    if (next === active) return;
    active = next;
    document.documentElement.dataset.vibeActive = String(active);
    for (const item of resources.values()) {
      if (active) schedule(item);
      else if (item.kind === 'frame') nativeCancelFrame(item.handle);
      else { nativeClearTimeout(item.handle); item.remaining = Math.max(0, item.due - performance.now()); }
    }
    for (const listener of listeners) { try { listener(active); } catch (error) { report(error); } }
    dispatchEvent(new CustomEvent('vibe:visibility', { detail: { active } }));
  };
  const dispose = () => {
    if (disposed) return;
    activity(false);
    disposed = true;
    for (const id of resources.keys()) cancelResource(id);
    for (const item of pending.values()) { nativeClearTimeout(item.timer); item.reject(new Error('应用已关闭')); }
    pending.clear(); listeners.clear();
  };
  addEventListener('pagehide', dispose, { once: true });
  document.addEventListener('visibilitychange', () => activity(desiredActive));
  addEventListener('message', event => {
    const data = event.data;
    if (event.source !== parent || !data || data.channel !== channel || data.nonce !== nonce || data.instanceId !== instanceId || disposed) return;
    if (data.type === 'response' && typeof data.id === 'string') {
      const item = pending.get(data.id); if (!item) return;
      nativeClearTimeout(item.timer); pending.delete(data.id);
      if (data.ok) { snapshot = clone(data.value); item.resolve(clone(snapshot)); }
      else item.reject(new Error(data.error || '宿主操作失败'));
    } else if (data.type === 'start') {
      activity(data.active === true);
      if (!initialized) { initialized = true; snapshot = clone(data.state); mount(); }
      else if (!hadError) send('ready', {});
    } else if (data.type === 'visibility' && typeof data.active === 'boolean') {
      activity(data.active);
    } else if (data.type === 'dispose') dispose();
  });
  Object.defineProperty(window, 'vibe', { configurable: false, writable: false, value: Object.freeze({
    getState: () => clone(snapshot),
    setState: patch => request('setState', [patch]),
    onVisibilityChange: handler => {
      if (typeof handler !== 'function') throw new TypeError('需要可见性回调函数');
      listeners.add(handler); handler(active); return () => listeners.delete(handler);
    }
  }) });
  document.addEventListener('click', event => { if (event.target instanceof Element && event.target.closest('a')) event.preventDefault(); }, true);
  document.addEventListener('submit', event => event.preventDefault(), true);
  const allowed = new Set('div span p h1 h2 h3 h4 h5 h6 main section article header footer nav aside button form input textarea select option optgroup label fieldset legend output progress meter canvas svg g path circle ellipse rect line polyline polygon text tspan defs linearGradient radialGradient stop clipPath mask use symbol ul ol li dl dt dd table thead tbody tfoot tr th td caption colgroup col br hr pre code strong em b i u s small sub sup blockquote figure figcaption details summary img a'.toLowerCase().split(' '));
  const dropped = new Set('script style meta base iframe frame frameset object embed link template noscript audio video source track math'.split(' '));
  const attributes = new Set('id class title role tabindex type value name placeholder min max step checked disabled readonly multiple selected rows cols width height alt viewbox d fill stroke stroke-width opacity transform cx cy r rx ry x y x1 x2 y1 y2 points offset stop-color stop-opacity xmlns preserveaspectratio colspan rowspan for open data-value'.split(' '));
  const copy = (node, target, depth) => {
    if (depth > 80) return;
    if (node.nodeType === Node.TEXT_NODE) { target.appendChild(document.createTextNode(node.textContent || '')); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.localName.toLowerCase();
    if (dropped.has(tag)) return;
    if (!allowed.has(tag)) { for (const child of node.childNodes) copy(child, target, depth + 1); return; }
    const element = node.namespaceURI === 'http://www.w3.org/2000/svg'
      ? document.createElementNS('http://www.w3.org/2000/svg', node.localName) : document.createElement(tag);
    for (const attribute of node.attributes) {
      const name = attribute.name.toLowerCase();
      if (attributes.has(name) || /^aria-[a-z-]+$/.test(name) || /^data-[a-z0-9-]+$/.test(name)) element.setAttribute(attribute.name, attribute.value);
      else if (name === 'style') element.setAttribute('style', attribute.value);
      else if (name === 'src' && tag === 'img' && /^data:image\\/(png|jpeg|gif|webp);base64,[a-z0-9+/=\\s]+$/i.test(attribute.value)) element.setAttribute('src', attribute.value);
    }
    for (const child of node.childNodes) copy(child, element, depth + 1);
    target.appendChild(element);
  };
  function mount() { try {
    const parsed = new DOMParser().parseFromString(source.html, 'text/html');
    const root = document.getElementById('vibe-root');
    for (const node of parsed.body.childNodes) copy(node, root, 0);
    const style = document.createElement('style'); style.textContent = source.css; document.head.appendChild(style);
    const pausedStyle = document.createElement('style');
    pausedStyle.textContent = 'html[data-vibe-active="false"] *,html[data-vibe-active="false"] *::before,html[data-vibe-active="false"] *::after{animation-play-state:paused!important}';
    document.head.appendChild(pausedStyle);
    document.documentElement.dataset.vibeActive = String(active);
    const script = document.createElement('script'); script.nonce = nonce; script.textContent = source.js; document.body.appendChild(script);
    if (!hadError) send('ready', {});
  } catch (error) { report(error); } }
})();
</script></body></html>`;
}
