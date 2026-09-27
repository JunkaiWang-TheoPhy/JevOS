import { test, expect } from '../browser/test-fixture';

// Run with: npx playwright test --config=playwright.live.config.ts; no model calls.
test('published shell executes local commands in an isolated workspace', async ({ page }) => {
  let modelCalls = 0;
  await page.route('**/api/terminal/simulate', route => { modelCalls++; return route.abort(); });
  await page.route('**/api/apps/generate', route => { modelCalls++; return route.abort(); });
  await page.route('**/api/scenes/plan', route => { modelCalls++; return route.abort(); });
  await page.goto('/');
  await expect(page.getByRole('status', { name: '数据同步状态' })).toContainText('已同步');
  const terminal = page.getByTestId('window-terminal');
  async function run(command: string, expected?: string) {
    await page.locator('.desktop-menubar').getByRole('button', { name: '打开应用启动器', exact: true }).click();
    await page.getByRole('dialog', { name: '应用启动器', exact: true }).getByRole('button', { name: /^Terminal/ }).click();
    const input = terminal.getByLabel(/^(命令|模拟命令)$/);
    await input.fill(command); await input.press('Enter');
    if (expected) await expect(terminal.getByRole('log', { includeHidden: true }).locator('pre').last()).toContainText(expected);
  }
  await run('apps', 'music');
  await run('clear');
  await expect(terminal.getByRole('log')).not.toContainText('本地执行：');
  await run('open music', '已打开');
  await run('music play', '播放');
  await expect.poll(() => page.getByTestId('music-audio').evaluate(el => (el as HTMLAudioElement).paused)).toBe(false);
  await run('music pause', '暂停');
  await run('open timer', '已打开');
  await run('timer start 3m', '计时已开始');
  expect(modelCalls).toBe(0);
});
