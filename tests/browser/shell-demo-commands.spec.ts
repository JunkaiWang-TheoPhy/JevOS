import { test, expect, openApp } from './test-fixture';
import { retroTimerFixture } from '../../src/apps/generated/retro-timer-fixture';

test.use({ viewport: { width: 1440, height: 1000 } });
const timer = { ...retroTimerFixture, id: 'gen-11111111-1111-4111-8111-111111111111', title: '番茄钟测试' };

test('shell local commands operate real windows, clear persistently and preserve notes without model calls', async ({ page }) => {
  let modelCalls = 0;
  await page.route('**/api/terminal/simulate', route => { modelCalls++; return route.fulfill({ status: 503, json: { error: 'Unexpected model call' } }); });
  await page.goto('/');
  await expect(page.getByRole('status', { name: '数据同步状态' })).toContainText('已同步');
  const notes = page.getByLabel('你的记录会保存在这台设备');
  await notes.fill('硬算法操作保留这份笔记');
  const terminal = page.getByTestId('window-terminal');
  async function run(command: string) {
    await openApp(page, 'Terminal');
    const input = terminal.getByLabel('命令', { exact: true });
    await input.fill(command); await input.press('Enter');
    await expect(input).toBeEnabled();
    if (!['clear', 'cls'].includes(command)) await expect(terminal.getByRole('log', { includeHidden: true })).toContainText('本地执行：', { timeout: 4000 });
  }
  await run('apps'); await expect(terminal.getByRole('log', { includeHidden: true })).toContainText('music');
  await run('open music'); await expect(page.getByTestId('window-music')).toBeVisible();
  await run('minimize music'); await expect(page.getByTestId('window-music')).toBeHidden();
  await run('open notes'); await run('resize notes 70%');
  await expect.poll(() => page.getByTestId('window-notes').evaluate(el => Number.parseFloat((el as HTMLElement).style.width))).toBeGreaterThan(900);
  await run('move notes bottom-right'); await run('tile'); await run('undo layout');
  await expect(notes).toHaveValue('硬算法操作保留这份笔记');
  await run('clear'); await expect(terminal.getByRole('log', { includeHidden: true })).not.toContainText('本地执行：', { timeout: 4000 });
  await page.getByRole('button', { name: '关闭Terminal', exact: true }).click();
  await openApp(page, 'Terminal');
  await expect(terminal.getByRole('log', { includeHidden: true })).not.toContainText('本地执行：', { timeout: 4000 });
  await run('cls');
  expect(modelCalls).toBe(0);
});

test('shell controls timer, reader and music with verified effects and routes create to the generator', async ({ page }) => {
  let simulated = 0, generated = 0;
  await page.route('**/api/terminal/simulate', route => { simulated++; return route.fulfill({ status: 503, json: { error: 'Unexpected model call' } }); });
  await page.route('**/api/apps', route => route.fulfill({ json: { apps: [{ id: timer.id, title: timer.title, createdAt: timer.createdAt }], generatorConfigured: true } }));
  await page.route(`**/api/apps/${timer.id}`, route => route.fulfill({ json: { app: timer } }));
  await page.route('**/api/apps/generate', route => { generated++; expect(route.request().postDataJSON().prompt).toBe('喝水提醒器'); return route.fulfill({ status: 201, json: { app: { ...timer, id: 'gen-22222222-2222-4222-8222-222222222222', title: '生成接口测试结果' } } }); });
  await page.goto('/'); await expect(page.getByRole('status', { name: '数据同步状态' })).toContainText('已同步');
  const terminal = page.getByTestId('window-terminal');
  async function run(command: string, expected: string) {
    await openApp(page, 'Terminal');
    const input = terminal.getByLabel('命令', { exact: true });
    await input.fill(command); await input.press('Enter');
    await expect(terminal.getByRole('log', { includeHidden: true }).locator('pre').last()).toContainText(expected);
  }
  await run('scene morning', '已切换 morning');
  await expect(page.getByTestId('window-generated:demo-reader')).toBeVisible();
  await run('reader bookmark', '已保存阅读书签');
  await run('reader restore', '已恢复阅读书签');
  await run('timer start 3m', '计时已开始');
  const frame = page.getByTestId(`window-generated:${timer.id}`).locator('iframe').contentFrame();
  await expect(frame.locator('#pause')).toBeEnabled();
  await run('timer pause', '计时已暂停'); await run('timer reset', '计时已重置');
  await run('music play', '播放');
  await expect.poll(() => page.getByTestId('music-audio').evaluate(el => (el as HTMLAudioElement).paused)).toBe(false);
  await run('music pause', '暂停');
  await expect.poll(() => page.getByTestId('music-audio').evaluate(el => (el as HTMLAudioElement).paused)).toBe(true);
  const title = await page.getByTestId('music-track-title').textContent();
  await run('music next', '切换'); await expect(page.getByTestId('music-track-title')).not.toHaveText(title!);
  await run('scene focus', '已切换 focus'); await run('scene pitch', '已切换 pitch');
  await run('split reader notes', '桌面操作已完成');
  await run('create app "喝水提醒器"', '已生成并保存');
  await expect(page.getByTestId('window-generated:gen-22222222-2222-4222-8222-222222222222')).toBeVisible();
  expect(generated).toBe(1); expect(simulated).toBe(0);
});
