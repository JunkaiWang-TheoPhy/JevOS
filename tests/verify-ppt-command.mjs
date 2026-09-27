import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome' });
let failures = 0;
try {
  for (const kind of ['layout', 'generate']) {
    const context = await browser.newContext();
    const page = await context.newPage();
    let modelRequests = 0;
    for (const route of ['**/api/scenes/plan', '**/api/apps/generate', '**/api/decisions']) {
      await page.route(route, request => {
        modelRequests++;
        return request.fulfill({ status: 503, json: { error: '测试阻止远端模型调用' } });
      });
    }
    try {
      await page.goto(process.env.PPT_TEST_BASE_URL || 'http://127.0.0.1:4273/');
      if (kind === 'layout') {
        await page.getByRole('button', { name: 'What you want do....', exact: true }).click();
        await page.getByLabel('描述桌面布局', { exact: true }).fill('打开ppt');
        await page.getByRole('button', { name: '调整桌面', exact: true }).click();
      } else {
        await page.getByRole('button', { name: 'Vibe anything', exact: true }).click();
        await page.getByLabel('描述你想生成的 App', { exact: true }).fill('打开ppt');
        await page.getByRole('button', { name: '生成 App', exact: true }).click();
      }
      await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 3000 });
      assert.equal(modelRequests, 0, '打开已有PPT不应请求生成或布局模型');
      const frame = page.frameLocator('iframe[title="路演文档 · JevOS"]');
      await expect(frame.locator('#count')).toHaveText('1 / 6');
      await expect.poll(() => frame.locator('#slide-image').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
      console.log(`ok - ${kind}: 打开ppt opens existing six-page presentation with zero model requests`);
    } catch (error) {
      failures++;
      console.log(`not ok - ${kind}: ${error.message.split('\n')[0]}; modelRequests=${modelRequests}`);
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
if (failures) process.exitCode = 1;
