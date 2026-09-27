import { test, expect, openApp } from './test-fixture';

test('desktop windows coexist, close and reopen without losing shared notes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status', { name: '数据同步状态' })).toContainText('已同步');
  await expect(page.getByTestId('window-message')).toBeVisible();
  const note = page.getByLabel('你的记录会保存在这台设备');
  await note.fill('在多个工具之间保留同一份笔记');
  await openApp(page, '计算器');
  await expect(page.getByTestId('window-calculator')).toBeVisible();
  await page.getByLabel('算式', { exact: true }).fill('24 × 7');
  await page.getByLabel('算式', { exact: true }).press('Enter');
  await expect(page.getByLabel('计算结果', { exact: true })).toHaveText('168');
  await page.getByRole('button', { name: '关闭笔记', exact: true }).click();
  await expect(page.getByTestId('window-notes')).not.toBeVisible();
  await openApp(page, '笔记');
  await expect(note).toHaveValue('在多个工具之间保留同一份笔记');
  await expect(page.getByTestId('window-calculator')).toBeVisible();
  await openApp(page, '计算器');
  await page.getByRole('button', { name: '最小化计算器', exact: true }).click();
  await expect(page.getByTestId('window-calculator')).not.toBeVisible();
  await openApp(page, '计算器');
  await expect(page.getByLabel('计算结果', { exact: true })).toHaveText('168');
  await page.getByRole('button', { name: '排列窗口', exact: true }).click();
  await page.screenshot({ path: 'test-results/vibeos-desktop.png', animations: 'disabled' });
});

test('window geometry and colorful wallpaper controls remain local and persistent', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status', { name: '数据同步状态' })).toContainText('已同步');
  const win = page.getByTestId('window-message');
  const before = await win.boundingBox();
  const bar = await win.locator('.window-titlebar').boundingBox();
  if (!before || !bar) throw new Error('Window was not rendered');
  await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar.x + bar.width / 2 + 55, bar.y + bar.height / 2 + 30, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => win.evaluate(element => element.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);
  const after = await win.boundingBox();
  expect(after!.x).toBeGreaterThan(before.x + 40);
  await page.reload();
  await expect(page.getByRole('status', { name: '数据同步状态' })).toContainText('已同步');
  await expect.poll(async () => (await win.boundingBox())!.x).toBeCloseTo(after!.x, 0);
  const theme = await page.locator('.desktop').getAttribute('data-theme');
  await page.getByRole('button', { name: '换个壁纸', exact: true }).click();
  await expect(page.locator('.desktop')).not.toHaveAttribute('data-theme', theme!);
  const changed = await page.locator('.desktop').getAttribute('data-theme');
  await page.reload();
  await expect(page.locator('.desktop')).toHaveAttribute('data-theme', changed!);
  await page.getByRole('button', { name: '排列窗口', exact: true }).click();
  const windows = await page.locator('.desktop-window:visible').count();
  expect(windows).toBeGreaterThanOrEqual(2);
});

test('the layout entry changes task composition without replacing the desktop', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status', { name: '数据同步状态' })).toContainText('已同步');
  await page.getByRole('button', { name: 'What you want do....', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'What you want do....' })).toBeVisible();
  await page.getByLabel('描述桌面布局').fill('改成异步评审');
  await page.getByRole('button', { name: '调整桌面', exact: true }).click();
  await expect(page.getByTestId('window-tasks')).toBeVisible();
  await expect(page.getByTestId('window-message')).toBeVisible();
  await expect(page.getByTestId('window-notes')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'What you want do....' })).not.toBeVisible();
});

test('closing a tool invalidates a late suggestion without reopening it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status', { name: '数据同步状态' })).toContainText('已同步');
  await openApp(page, '日历');
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/scenes/plan', async route => {
    const input = route.request().postDataJSON();
    await gate;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      proposalId: 'scene-late-calendar', source: 'rules', explanation: '打开日历',
      operations: [{ type: 'open', appId: 'calendar', windowId: 'calendar' }], focusWindowId: 'calendar',
      requestId: input.requestId, desktopRevision: input.desktopRevision, baseRevision: input.baseRevision,
    }) }).catch(() => {});
  });
  const started = page.waitForRequest('**/api/scenes/plan');
  await page.getByRole('button', { name: 'What you want do....', exact: true }).click();
  await page.getByLabel('描述桌面布局').fill('约个时间讨论');
  await page.getByRole('button', { name: '调整桌面', exact: true }).click();
  await started;
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '关闭日历', exact: true }).click();
  release();
  await expect(page.getByTestId('window-calendar')).not.toBeVisible();
  await expect(page.getByRole('button', { name: '阅读消息', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
