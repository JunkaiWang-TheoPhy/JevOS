import { test, expect } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import type { AddressInfo } from 'node:net';
let server: ViteDevServer;
let origin: string;
const harness = `import React from 'react';
import { createRoot } from 'react-dom/client';
import GeneratedAppHost from '/src/apps/generated/GeneratedAppHost.tsx';
import { retroTimerFixture } from '/src/apps/generated/retro-timer-fixture.ts';
let handler; let state = null;
const host = { loadState: () => state, saveState: value => { state = value; }, registerActions: value => { handler = value; return () => { handler = null; }; } };
window.testAction = (action,args) => handler(action,args);
window.testState = () => state;
createRoot(document.getElementById('root')).render(<GeneratedAppHost app={retroTimerFixture} instanceId="test" host={host} active={true} />);`;
test.beforeAll(async () => {
  server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-shell-actions-tests', optimizeDeps: { entries: [], noDiscovery: true, include: ['react', 'react-dom/client', 'react/jsx-dev-runtime'] }, plugins: [react(), {
    name: 'shell-actions-harness',
    resolveId(id) { if (id === '/__shell-actions.tsx') return id; },
    load(id) { if (id === '/__shell-actions.tsx') return harness; },
    configureServer(vite) { vite.middlewares.use('/actions-test', async (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(await vite.transformIndexHtml('/actions-test', '<div id="root"></div><script type="module" src="/__shell-actions.tsx"></script>')); }); }
  }], server: { host: '127.0.0.1', port: 0 } });
  await server.listen(); origin = `http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}`;
});
test.afterAll(async () => { await server?.close(); });
test('iframe timer commands acknowledge persisted changes and reject unsupported controls', async ({ page }) => {
  await page.goto(origin + '/actions-test');
  await expect(page.frameLocator('iframe').locator('#time')).toHaveText('25:00');
  const action = (name: string, args: Record<string, number> = {}) => page.evaluate(async ({ name, args }) => {
    const win = window as unknown as { testAction(action: string, args: Record<string, number>): Promise<string> };
    return win.testAction(name, args);
  }, { name, args });
  expect(await action('start', { minutes: 3 })).toBe('计时已开始');
  await expect(page.frameLocator('iframe').locator('#mode')).toHaveText('FOCUS IN PROGRESS');
  expect(await action('pause')).toBe('计时已暂停');
  expect(await action('reset')).toBe('计时已重置');
  await expect(page.frameLocator('iframe').locator('#time')).toHaveText('03:00');
  await expect(action('bookmark')).rejects.toThrow(/不支持/);
});
