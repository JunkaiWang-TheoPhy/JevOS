import { test, expect } from './test-fixture';

async function ready(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.getByRole('status', { name: '数据同步状态' })).toContainText('已同步');
}

test('desktop layout and Vibe anything expose distinct actions and keep separate drafts', async ({ page }) => {
  await page.route('**/api/decisions', route => route.abort());
  await page.route('**/api/scenes/plan', route => route.abort());
  await ready(page);
  await page.getByRole('button', { name: 'What you want do....', exact: true }).click();
  const layout = page.getByRole('dialog', { name: 'What you want do....', exact: true });
  await expect(layout).toBeVisible();
  await layout.getByLabel('描述桌面布局').fill('论文在右边，笔记在左边');
  await expect(layout.getByRole('button', { name: '生成 App', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Vibe anything', exact: true }).click();
  const generator = page.getByRole('dialog', { name: 'Vibe anything', exact: true });
  await expect(generator).toBeVisible();
  await expect(generator.getByLabel('描述你想生成的 App')).toHaveValue('');
  await generator.getByLabel('描述你想生成的 App').fill('做一个喝水提醒器');
  await expect(generator.getByRole('button', { name: /改成异步评审/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'What you want do....', exact: true }).click();
  await expect(layout.getByLabel('描述桌面布局')).toHaveValue('论文在右边，笔记在左边');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Vibe anything', exact: true }).click();
  await expect(generator.getByLabel('描述你想生成的 App')).toHaveValue('做一个喝水提醒器');
});

test('Vibe anything sends even layout-like words exclusively to the app generator', async ({ page }) => {
  let decisions = 0;
  let scenes = 0;
  const prompts: string[] = [];
  await page.route('**/api/decisions', route => { decisions++; return route.abort(); });
  await page.route('**/api/scenes/plan', route => { scenes++; return route.abort(); });
  await page.route('**/api/apps/generate', route => {
    prompts.push(route.request().postDataJSON().prompt);
    return route.fulfill({ status: 503, json: { error: '测试生成失败提示' } });
  });
  await ready(page);
  await page.getByRole('button', { name: 'Vibe anything', exact: true }).click();
  const generator = page.getByRole('dialog', { name: 'Vibe anything', exact: true });
  await generator.getByLabel('描述你想生成的 App').fill('改成异步评审');
  await generator.getByRole('button', { name: '生成 App', exact: true }).click();
  await expect.poll(() => prompts).toEqual(['改成异步评审']);
  expect(decisions).toBe(0);
  expect(scenes).toBe(0);
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: '修改需求', exact: true }).click();
  await expect(generator).toBeVisible();
  await expect(generator.getByLabel('描述你想生成的 App')).toHaveValue('改成异步评审');
  await page.waitForTimeout(500);
  expect(decisions).toBe(0);
  expect(scenes).toBe(0);
});

test('desktop layout submits exclusively to scene planning without generating an app', async ({ page }) => {
  let generations = 0;
  const prompts: string[] = [];
  await page.route('**/api/apps/generate', route => { generations++; return route.abort(); });
  await page.route('**/api/scenes/plan', route => {
    const input = route.request().postDataJSON();
    prompts.push(input.text);
    return route.fulfill({ json: { proposalId: 'scene-test', source: 'rules', explanation: '保持已有工具。', operations: [], focusWindowId: input.activeWindowId,
      requestId: input.requestId, desktopRevision: input.desktopRevision, baseRevision: input.baseRevision } });
  });
  await ready(page);
  await page.getByRole('button', { name: 'What you want do....', exact: true }).click();
  const layout = page.getByRole('dialog', { name: 'What you want do....', exact: true });
  await layout.getByLabel('描述桌面布局').fill('做一个计时器');
  await layout.getByRole('button', { name: '调整桌面', exact: true }).click();
  await expect.poll(() => prompts).toContain('做一个计时器');
  expect(generations).toBe(0);
});
