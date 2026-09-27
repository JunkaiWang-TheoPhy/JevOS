import { test, expect } from './test-fixture';

test('green button fills the narrow viewport and restores the window', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 858 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Reproduce the previous implementation without changing the live preview.
  if (process.env.JEVOS_MAXIMIZE_BASELINE === '1') {
    await page.route('**/window-maximize.css', route => route.fulfill({ contentType: 'text/css', body: '' }));
  }
  await page.goto('/');
  const notes = page.getByTestId('window-notes');
  await expect(notes).toBeVisible();
  const original = await notes.boundingBox();
  await page.getByRole('button', { name: '最大化笔记', exact: true }).click();
  await expect(notes).toHaveClass(/is-maximized/);
  await expect.poll(async () => {
    const box = await notes.boundingBox();
    return !!box && box.y >= 0 && box.y + box.height <= 858 && box.height > 800;
  }).toBe(true);
  await expect(notes).toHaveCSS('position', 'fixed');
  await expect.poll(async () => (await notes.locator('.window-body').boundingBox())?.height ?? 0).toBeGreaterThan(700);
  await page.getByRole('button', { name: '最大化笔记', exact: true }).click();
  await expect(notes).not.toHaveClass(/is-maximized/);
  await expect(notes).toHaveCSS('position', 'relative');
  await expect.poll(async () => Math.abs((await notes.boundingBox())!.height - original!.height)).toBeLessThan(2);
});

test('green button still fills the desktop workspace and preserves draft on restore', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const notes = page.getByTestId('window-notes');
  const draft = page.getByLabel('你的记录会保存在这台设备');
  await draft.fill('最大化后保留这段草稿。');
  const original = await notes.boundingBox();
  await page.getByRole('button', { name: '最大化笔记', exact: true }).click();
  await expect(notes).toHaveClass(/is-maximized/);
  const stage = await page.locator('.desktop-stage').boundingBox();
  const expanded = await notes.boundingBox();
  expect(expanded!.width).toBeGreaterThan(original!.width);
  expect(expanded!.width).toBeGreaterThan(stage!.width - 20);
  await page.getByRole('button', { name: '最大化笔记', exact: true }).click();
  await expect(notes).not.toHaveClass(/is-maximized/);
  await expect(draft).toHaveValue('最大化后保留这段草稿。');
});
