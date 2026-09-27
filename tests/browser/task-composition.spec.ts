import { test, expect, openApp } from './test-fixture';

const combinations = [
  { name: '阅读消息', mode: 'read', tools: ['message', 'notes'] },
  { name: '准备会议', mode: 'meeting', tools: ['message', 'notes', 'calendar', 'contact'] },
  { name: '异步评审', mode: 'review', tools: ['message', 'notes', 'tasks'] },
  { name: '整理笔记', mode: 'notes', tools: ['notes'] },
] as const;

test('task composition buttons arrange their tools and reapply the selected combination', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('status', { name: '数据同步状态' })).toContainText('已同步');
  await page.getByLabel('你的记录会保存在这台设备').fill('切换布局也保留这份笔记');
  await expect(page.getByRole('status', { name: '数据同步状态' })).toContainText('已同步');
  await openApp(page, '计算器');
  await page.getByLabel('算式', { exact: true }).fill('24 × 7');
  await page.getByLabel('算式', { exact: true }).press('Enter');
  const calculator = page.getByTestId('window-calculator');
  await expect.poll(() => calculator.evaluate(element => element.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);
  const calculatorFrame = await calculator.boundingBox();

  for (const combination of combinations) {
    const button = page.getByRole('button', { name: combination.name, exact: true });
    await button.click();
    await expect(page.locator('.desktop')).toHaveAttribute('data-mode', combination.mode);
    for (const tool of combination.tools) await expect(page.getByTestId(`window-${tool}`)).toBeVisible();
    await expect.poll(async () => {
      const boxes = await Promise.all(combination.tools.map(tool => page.getByTestId(`window-${tool}`).boundingBox()));
      return boxes.every((box, i) => box && boxes.slice(i + 1).every(other => other &&
        (box.x + box.width <= other.x + 1 || other.x + other.width <= box.x + 1 ||
          box.y + box.height <= other.y + 1 || other.y + other.height <= box.y + 1)));
    }).toBe(true);
    await expect(page.getByLabel('你的记录会保存在这台设备')).toHaveValue('切换布局也保留这份笔记');
    await expect(calculator).toBeVisible();
    expect(await calculator.boundingBox()).toEqual(calculatorFrame);
    await expect(page.getByLabel('计算结果', { exact: true })).toHaveText('168');

    // Repeated selection must restore a closed tool even when mode does not change.
    await page.getByRole('button', { name: '关闭笔记', exact: true }).click();
    await expect(page.getByTestId('window-notes')).not.toBeVisible();
    await button.click();
    await expect(page.getByTestId('window-notes')).toBeVisible();
    await expect(page.getByLabel('你的记录会保存在这台设备')).toHaveValue('切换布局也保留这份笔记');
    await expect(page.getByRole('status', { name: '数据同步状态' })).toContainText('已同步');
  }
});

test('show desktop, restore and arrange remain usable after task composition', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('status', { name: '数据同步状态' })).toContainText('已同步');
  await page.getByRole('button', { name: '准备会议', exact: true }).click();
  await expect(page.getByTestId('window-calendar')).toBeVisible();
  await page.getByRole('button', { name: '显示桌面', exact: true }).click();
  await expect(page.locator('.desktop-window:visible')).toHaveCount(0);
  await page.getByRole('button', { name: '恢复窗口', exact: true }).click();
  await expect(page.getByTestId('window-calendar')).toBeVisible();
  await page.getByRole('button', { name: '排列窗口', exact: true }).click();
  await expect(page.getByTestId('window-notes')).toBeVisible();
});
