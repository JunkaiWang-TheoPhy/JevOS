import { test, expect } from './test-fixture';
test.use({ modelNotice: true });

test('missing model configuration warns on each launch and can be closed and reopened', async ({ page }) => {
  await page.route('**/api/config', route => route.fulfill({ json: { jevConfigured: false, generatorConfigured: false } }));
  await page.goto('/');
  const notice = page.getByRole('dialog', { name: '模型服务配置', exact: true });
  await expect(notice).toBeVisible();
  await notice.getByRole('button', { name: '关闭提醒', exact: true }).click();
  await expect(notice).toHaveCount(0);
  await page.getByRole('button', { name: '重新打开模型配置', exact: true }).click();
  await expect(notice).toBeVisible();
  await notice.getByRole('button', { name: '关闭提醒', exact: true }).click();
  await page.reload();
  await expect(notice).toBeVisible();
});

test('the native configuration bridge opens preferences without a duplicate automatic web dialog', async ({ page }) => {
  await page.addInitScript(() => { window.jevosDesktop = { openConfiguration() { document.documentElement.dataset.nativeConfigOpened = 'yes'; }, restartConfiguration() {} }; });
  await page.route('**/api/config', route => route.fulfill({ json: { jevConfigured: false, generatorConfigured: false } }));
  await page.goto('/');
  await expect(page.getByRole('button', { name: '重新打开模型配置' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: '模型服务配置' })).toHaveCount(0);
  await page.getByRole('button', { name: '重新打开模型配置' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-native-config-opened', 'yes');
});
