import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4179',
    browserName: 'chromium',
    ...(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? { channel: 'chrome' } : {}),
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4179',
    env: { PORT: '4179', TYPESAFE_API_KEY: '', VIBEOS_DB_PATH: ':memory:' },
    reuseExistingServer: false,
    timeout: 15000,
  },
});
