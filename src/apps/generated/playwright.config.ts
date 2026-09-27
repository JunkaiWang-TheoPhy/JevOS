import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// A dedicated ephemeral Vite server is started inside the spec. No shared preview
// process, app database, API key, or root Playwright configuration is touched.
export default defineConfig({
  testDir: '../../../tests/browser',
  testMatch: 'generated-host.spec.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 30000,
  reporter: 'list',
  outputDir: '../../../test-results/generated-host',
  use: {
    browserName: 'chromium',
    ...(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? { channel: 'chrome' } : {}),
    // Blocking service workers injects a Playwright init script into every frame;
    // its navigator.serviceWorker access throws in an opaque sandbox. This
    // isolated Vite harness has no service worker to register.
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
});
