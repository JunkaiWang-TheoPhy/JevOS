import { test, expect } from './test-fixture';

async function openLauncher(page: import('@playwright/test').Page) {
  if (!(await page.getByRole('dialog', { name: 'What you want do....' }).isVisible()))
    await page.getByRole('button', { name: 'What you want do....', exact: true }).click();
}

test('production manifest, service worker, offline shell and saved drafts work together', async ({ page, context, request }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const manifestResponse = await request.get('/manifest.webmanifest');
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBeTruthy();
  await page.goto('/');
  await expect(page.getByTestId('window-message')).toBeVisible();
  await expect(page.getByText('本地规则', { exact: true })).toBeVisible();
  const note = page.getByLabel('你的记录会保存在这台设备');
  await note.fill('保存的笔记：不要在界面重组时丢失。');
  await page.getByRole('button', { name: '准备会议', exact: true }).click();
  await page.getByLabel('主题', { exact: true }).fill('用户自己的会议主题');
  await page.getByRole('button', { name: '异步评审', exact: true }).click();
  await expect(note).toHaveValue('保存的笔记：不要在界面重组时丢失。');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.getByLabel('主题', { exact: true })).toHaveValue('用户自己的会议主题');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(note).toHaveValue('保存的笔记：不要在界面重组时丢失。');
  await expect(page.getByLabel('主题', { exact: true })).toHaveValue('用户自己的会议主题');
  await note.fill('断网期间继续编辑');
  await page.reload();
  await expect(note).toHaveValue('断网期间继续编辑');
  expect(errors).toEqual([]);
});

test('Jev proxy is optional and rules-driven composition preserves the editor', async ({ page }) => {
  await page.goto('/');
  const note = page.getByLabel('你的记录会保存在这台设备');
  await note.fill('在后台判断期间保持输入');
  await openLauncher(page);
  await page.getByLabel('描述桌面布局').fill('改成异步评审');
  await page.getByRole('button', { name: '调整桌面', exact: false }).click();
  await expect(page.getByRole('heading', { name: '异步评审清单' })).toBeVisible();
  await expect(note).toHaveValue('在后台判断期间保持输入');
  await page.getByRole('button', { name: '固定组合', exact: true }).click();
  await openLauncher(page);
  await page.getByLabel('描述桌面布局').fill('约个时间讨论');
  await page.getByRole('button', { name: '调整桌面', exact: false }).click();
  await expect(page.getByRole('heading', { name: '异步评审清单' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '会议草稿' })).not.toBeVisible();
});

test('mobile viewport keeps all controls reachable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '准备会议', exact: true }).click();
  await expect(page.getByLabel('主题', { exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
});

test('undo cancels a pending scene and releases the submit button', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status', { name: '数据同步状态' })).toContainText('已同步');
  await page.getByRole('button', { name: '准备会议', exact: true }).click();
  await expect(page.getByRole('button', { name: '撤销', exact: true })).toBeEnabled();
  await expect(page.getByRole('status', { name: '数据同步状态' })).toContainText('已同步');
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/scenes/plan', async route => {
    const input = route.request().postDataJSON();
    await gate;
    await route.fulfill({ json: { proposalId: 'scene-late-undo', source: 'rules', explanation: '切换到笔记',
      requestId: input.requestId, baseRevision: input.baseRevision, desktopRevision: input.desktopRevision,
      operations: [{ type: 'open', appId: 'notes', windowId: 'notes' }], focusWindowId: 'notes' } }).catch(() => {});
  });
  const started = page.waitForRequest('**/api/scenes/plan');
  await openLauncher(page);
  await page.getByLabel('描述桌面布局').fill('整理笔记');
  await page.getByRole('button', { name: '调整桌面', exact: true }).click();
  await started;
  await expect(page.getByRole('button', { name: '规划中…', exact: true })).toBeDisabled();
  const canceled = page.waitForEvent('requestfailed', { predicate: request => request.url().endsWith('/api/scenes/plan') });
  // Invoke the real undo handler while the planning dialog is still open. Closing
  // it first would cancel the request itself and would not test undo cancellation.
  await page.getByRole('button', { name: '撤销', exact: true }).evaluate((button: HTMLButtonElement) => button.click());
  await canceled;
  release();
  await expect(page.getByRole('button', { name: '调整桌面', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '阅读消息', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
