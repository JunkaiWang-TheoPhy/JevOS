import { test, expect } from './test-fixture';

test('bottom Dock shows built-ins while generated applications stay available in the launcher', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const dock = page.getByRole('navigation', { name: '应用 Dock', exact: true });
  await expect(dock).toBeVisible();
  await dock.getByRole('button', { name: /^打开(?:Terminal|终端)$/ }).click();
  await expect(page.getByTestId('window-terminal')).toBeVisible();
  await expect(dock.getByRole('button', { name: /^打开Data Studio/ })).toHaveCount(0);
  await dock.getByRole('button', { name: '打开应用启动器', exact: true }).click();
  await page.getByRole('dialog', { name: '应用启动器', exact: true }).getByRole('button', { name: /^Data Studio/ }).click();
  await expect(page.getByTestId('window-generated:draft-data-studio')).toBeVisible();
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(dock).toBeVisible();
  await expect.poll(() => dock.evaluate(el => el.getBoundingClientRect().width)).toBeLessThanOrEqual(360);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
