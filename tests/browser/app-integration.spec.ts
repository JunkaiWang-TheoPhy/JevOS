import { test, expect, openApp } from './test-fixture';

async function ready(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.getByRole('status', { name: '数据同步状态' })).toContainText('已同步');
}

test('Terminal reads the same workspace and can open another running app', async ({ page }) => {
  await ready(page);
  await page.getByLabel('你的记录会保存在这台设备').fill('工作区里的真实笔记');
  await openApp(page, 'Terminal');
  const terminal = page.getByTestId('window-terminal');
  await expect(terminal).toBeVisible();
  await terminal.getByRole('button', { name: '工作区命令', exact: true }).click();
  const input = terminal.locator('input').last();
  await input.fill('cat note.txt'); await input.press('Enter');
  await expect(terminal.getByText('工作区里的真实笔记', { exact: true })).toBeVisible();
  await input.fill('calc 24 * 7'); await input.press('Enter');
  await expect(terminal.getByText('168', { exact: true })).toBeVisible();
  await input.fill('open motion-lab'); await input.press('Enter');
  await expect(page.getByTestId('window-motion-lab')).toBeVisible();
  await expect(terminal).toBeVisible();
  await expect.poll(() => page.getByTestId('window-motion-lab').evaluate(window => {
    const stage = window.parentElement!.getBoundingClientRect();
    const frame = window.getBoundingClientRect();
    return frame.bottom - stage.bottom;
  })).toBeLessThanOrEqual(0);
});

test('an unregistered request mounts a distinct generated app and restores its state without regenerating', async ({ page }) => {
  let generated = 0;
  const app = {
    id: 'gen-11111111-1111-4111-8111-111111111111', title: 'Counter Test', createdAt: '2026-09-27T09:00:00Z',
    html: '<main><h1>Counter Test</h1><button id="add">增加</button><output id="count">0</output></main>',
    css: 'body{background:#17212b;color:#8affbf;font-family:monospace;padding:24px}button{padding:12px}output{display:block;font-size:48px}',
    js: '(async()=>{let state=await vibe.getState();const paint=()=>document.getElementById("count").textContent=String(state.count||0);paint();document.getElementById("add").addEventListener("click",async()=>{state=await vibe.setState({count:(state.count||0)+1});paint();});})();',
    initialState: { count: 0 },
  };
  await page.route('**/api/apps', route => route.fulfill({ json: { apps: [] } }));
  await page.route('**/api/apps/generate', route => { generated++; return route.fulfill({ status: 201, json: { app } }); });
  await ready(page);
  await page.getByLabel('你的记录会保存在这台设备').fill('生成窗口旁边的笔记');
  await page.keyboard.press('Control+k');
  await page.getByLabel('描述你想生成的 App').fill('做一个复古计数器');
  await page.getByRole('button', { name: '生成 App', exact: true }).click();
  const window = page.getByTestId(`window-generated:${app.id}`);
  await expect(window).toBeVisible();
  const frame = window.frameLocator('iframe');
  await expect(frame.getByRole('heading', { name: 'Counter Test', exact: true })).toBeVisible();
  await frame.getByRole('button', { name: '增加', exact: true }).click();
  await expect(frame.locator('#count')).toHaveText('1');
  await expect(page.getByLabel('你的记录会保存在这台设备')).toHaveValue('生成窗口旁边的笔记');
  await page.getByRole('button', { name: '关闭Counter Test', exact: true }).click();
  await page.locator('.desktop-brand').click();
  await page.getByRole('dialog', { name: '应用启动器', exact: true }).getByRole('button', { name: /Counter Test/ }).click();
  await expect(frame.locator('#count')).toHaveText('1');
  await page.reload();
  await expect(frame.locator('#count')).toHaveText('1');
  expect(generated).toBe(1);
});

test('missing generation configuration leaves existing windows and drafts untouched', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/apps/generate', route => { attempts++; return route.fulfill({ status: 503,
    json: { code: 'APP_GENERATOR_NOT_CONFIGURED', error: '请配置服务端应用生成模型。' } }); });
  await ready(page);
  const note = page.getByLabel('你的记录会保存在这台设备');
  await note.fill('这份草稿必须留着');
  await page.keyboard.press('Control+k');
  await page.getByLabel('描述你想生成的 App').fill('做一个新的霓虹表盘');
  await page.getByRole('button', { name: '生成 App', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible({ timeout: 3000 });
  await expect(page.getByText('请配置服务端应用生成模型。', { exact: true })).toBeVisible();
  await expect(note).toHaveValue('这份草稿必须留着');
  await expect(page.getByTestId('window-message')).toBeVisible();
  await page.getByRole('button', { name: '重试生成', exact: true }).click();
  await expect.poll(() => attempts).toBe(2);
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('saved generated windows outside the local package cache restore from the server directory', async ({ page }) => {
  const app = {
    id: 'gen-22222222-2222-4222-8222-222222222222', title: 'Saved App', createdAt: '2026-09-27T09:00:00Z',
    html: '<h1>Restored from server</h1>', css: 'body{background:#ffd4e8}', js: '', initialState: {},
  };
  let restoring = false;
  let reads = 0;
  await page.route('**/api/apps', async route => {
    if (restoring) await new Promise(resolve => setTimeout(resolve, 250));
    await route.fulfill({ json: { apps: restoring ? [app] : [] } });
  });
  await page.route(`**/api/apps/${app.id}`, route => { reads++; return route.fulfill({ json: { app } }); });
  await ready(page);
  await page.evaluate(async ({ id, title }) => {
    const { workspace } = await (await fetch('/api/workspace')).json();
    const key = `vibeos-desktop-${workspace.id}`;
    const desktop = JSON.parse(localStorage.getItem(key)!);
    desktop.windows.push({ id: `generated:${id}`, tool: `generated:${id}`, title,
      x: 120, y: 120, width: 400, height: 300, z: 10, minimized: false, maximized: false });
    desktop.activeId = `generated:${id}`;
    localStorage.setItem(key, JSON.stringify(desktop));
    localStorage.removeItem(`vibeos-generated-v1:${workspace.id}`);
  }, app);
  restoring = true;
  await page.reload();
  const restored = page.getByTestId(`window-generated:${app.id}`);
  await expect(restored).toBeVisible({ timeout: 3000 });
  await expect(restored.frameLocator('iframe').getByRole('heading', { name: 'Restored from server' })).toBeVisible();
  expect(reads).toBe(1);
  await page.reload();
  await expect(restored.frameLocator('iframe').getByRole('heading', { name: 'Restored from server' })).toBeVisible();
  expect(reads).toBe(1);
});

test('prepared Data Studio edits and restores real CSV data without a generation call', async ({ page }) => {
  let generations = 0;
  await page.route('**/api/apps/generate', route => { generations++; return route.fulfill({ status: 503, json: {} }); });
  await ready(page);
  await page.locator('.desktop-brand').click();
  await page.getByRole('dialog', { name: '应用启动器', exact: true }).getByRole('button', { name: /Data Studio/ }).click();
  const app = page.getByTestId('window-generated:draft-data-studio');
  const frame = app.frameLocator('iframe');
  await expect(frame.getByText('Data Studio', { exact: true })).toBeVisible();
  await frame.getByRole('button', { name: '↥ 导入 CSV' }).click();
  await frame.getByLabel('CSV 文本').fill('月份,收入\n一月,120\n二月,180');
  await frame.getByRole('button', { name: '导入数据', exact: true }).click();
  await expect(frame.locator('#stat-sum')).toHaveText('300');
  await expect(frame.locator('#save-status')).toContainText('已保存');
  await page.reload();
  await expect(frame.locator('#stat-sum')).toHaveText('300');
  await expect.poll(() => app.evaluate(element => element.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);
  await frame.getByRole('button', { name: '柱状', exact: true }).click();
  await expect(frame.getByRole('button', { name: '柱状', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(frame.locator('#chart rect')).toHaveCount(2);
  expect(generations).toBe(0);
});
