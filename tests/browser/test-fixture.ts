import { test as base, expect } from '@playwright/test';

// Behavioral suites use an explicit configured-status mock; provider requests
// remain governed by each test's own routes and the rules-only test backend.
export const test = base.extend<{ modelNotice: boolean }>({
  modelNotice: [false, { option: true }],
  page: async ({ page, modelNotice }, use) => {
    if (!modelNotice) await page.addInitScript(() => {
      window.jevosDesktop = { openConfiguration() {}, restartConfiguration() {} };
    });
    await page.route('**/api/config', route => route.fulfill({ json: { jevConfigured: true, generatorConfigured: true } }));
    await use(page);
  },
});
export { expect };
export async function openApp(page: import('@playwright/test').Page, title: string) {
  await page.locator('.desktop-brand').click();
  const dialog = page.getByRole('dialog', { name: '应用启动器', exact: true });
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  await dialog.getByRole('button', { name: new RegExp(escaped) }).click();
}
