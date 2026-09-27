import { test, expect, openApp } from './test-fixture';

test.use({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' });

test('window layout morphs through intermediate geometry without replacing app content', async ({ page }) => {
  await page.goto('/');
  const win = page.getByTestId('window-message');
  await expect(win).toBeVisible();
  await page.waitForTimeout(550);
  const result = await win.evaluate(async element => {
    const initial = element.getBoundingClientRect();
    element.setAttribute('data-motion-identity', 'preserved');
    (element.querySelector('.window-maximize') as HTMLButtonElement).click();
    await new Promise(resolve => setTimeout(resolve, 100));
    const midway = element.getBoundingClientRect();
    const moving = element.getAnimations().some(animation => animation instanceof CSSTransition && animation.transitionProperty === 'width' && animation.playState === 'running');
    await new Promise(resolve => setTimeout(resolve, 550));
    const final = element.getBoundingClientRect();
    return { initial: initial.width, midway: midway.width, final: final.width, moving };
  });
  expect(result.moving).toBe(true);
  expect(result.midway).toBeGreaterThan(result.initial + 5);
  expect(result.midway).toBeLessThan(result.final - 5);
  await expect(win).toHaveAttribute('data-motion-identity', 'preserved');
  await page.getByRole('button', { name: '最大化消息', exact: true }).click();
  await expect.poll(async () => (await win.boundingBox())!.width).toBeCloseTo(result.initial, 0);
});

test('dragging interrupts a layout transition at its current position and follows the pointer', async ({ page }) => {
  await page.goto('/');
  const win = page.getByTestId('window-message');
  await expect(win).toBeVisible();
  await page.waitForTimeout(550);
  await page.getByRole('button', { name: '排列窗口', exact: true }).click();
  await page.waitForTimeout(80);
  const bar = await win.locator('.window-titlebar').boundingBox();
  if (!bar) throw new Error('Missing titlebar');
  await page.mouse.move(bar.x + 140, bar.y + bar.height / 2);
  const beforeGrab = await win.boundingBox();
  await page.mouse.down();
  const start = await win.boundingBox();
  expect(Math.abs(start!.width - beforeGrab!.width)).toBeLessThan(40);
  await page.mouse.move(bar.x + 190, bar.y + bar.height / 2);
  const moved = await win.boundingBox();
  expect(moved!.x - start!.x).toBeCloseTo(50, 0);
  expect(moved!.y - start!.y).toBeCloseTo(0, 0);
  expect(await win.evaluate(element => getComputedStyle(element).transitionProperty)).not.toContain('left');
  await page.mouse.up();
  await expect.poll(() => win.evaluate(element => getComputedStyle(element).transitionProperty)).toContain('left');
});

test('reduced motion disables window layout animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const win = page.getByTestId('window-message');
  await expect(win).toBeVisible();
  expect(await win.evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s');
});

test('layout changes preserve note input and the generated app iframe instance', async ({ page }) => {
  await page.goto('/');
  const note = page.getByLabel('你的记录会保存在这台设备');
  await note.fill('窗口变形时保留这段内容');
  await openApp(page, 'Data Studio');
  const app = page.getByTestId('window-generated:draft-data-studio');
  const iframe = app.locator('iframe');
  await expect(iframe).toBeVisible();
  const frame = iframe.contentFrame();
  const input = frame.getByRole('textbox', { name: 'A1', exact: true });
  await expect(input).toBeVisible();
  const original = '变形后仍保留的单元格';
  await input.fill(original);
  await iframe.evaluate(element => element.setAttribute('data-motion-identity', 'same-frame'));
  const handle = await iframe.elementHandle();
  await page.getByRole('button', { name: '排列窗口', exact: true }).click();
  await page.waitForTimeout(550);
  await app.locator('.window-maximize').click();
  await page.waitForTimeout(550);
  await expect(note).toHaveValue('窗口变形时保留这段内容');
  await expect(iframe).toHaveAttribute('data-motion-identity', 'same-frame');
  expect(await handle!.evaluate(element => element.isConnected)).toBe(true);
  await expect(input).toHaveValue(original);
});
