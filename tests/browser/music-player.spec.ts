import { test, expect, openApp } from './test-fixture';

test('five real recordings decode and play with working transport and saved volume', async ({ page, request }) => {
  const response = await request.get('/music/tracks.json');
  expect(response.ok()).toBe(true);
  const tracks = await response.json() as { title: string; id: string; src: string }[];
  expect(tracks.length).toBeGreaterThanOrEqual(5);
  await page.goto('/');
  await openApp(page, '音乐');
  const window = page.getByTestId('window-music');
  const audio = window.getByTestId('music-audio');
  await expect(window.getByRole('list', { name: '音乐曲库' }).locator('li')).toHaveCount(tracks.length);
  await audio.evaluate((element: HTMLAudioElement) => { element.muted = true; });
  for (const track of tracks) {
    await window.getByRole('button', { name: `播放：${track.title}`, exact: true }).click();
    await expect(window.getByTestId('music-track-title')).toHaveText(track.title);
    await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.duration)).toBeGreaterThan(60);
    await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(.15);
    expect(await audio.evaluate((element: HTMLAudioElement) => element.error)).toBeNull();
    await window.getByRole('button', { name: '暂停音乐', exact: true }).click();
    expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
  }
  await window.getByRole('button', { name: '下一首', exact: true }).click();
  await expect(window.getByTestId('music-track-title')).toHaveText(tracks[0].title);
  const volume = window.getByRole('slider', { name: '音乐音量' });
  await volume.focus(); await volume.press('Home'); await volume.press('ArrowRight');
  await expect.poll(() => audio.evaluate((element: HTMLAudioElement) => element.volume)).toBeCloseTo(.01, 2);
  const seek = window.getByRole('slider', { name: '播放进度' });
  await expect(seek).toBeEnabled();
  await seek.focus(); await seek.press('ArrowRight');
  await page.getByRole('button', { name: '最小化音乐', exact: true }).click();
  expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(false);
  await openApp(page, '音乐');
  const handle = await audio.elementHandle();
  await page.getByRole('button', { name: '关闭音乐', exact: true }).click();
  expect(await handle!.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
  await openApp(page, '音乐');
  await expect(window.getByTestId('music-track-title')).toHaveText(tracks[0].title);
  expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
  await expect(volume).toHaveValue('0.01');
  await page.screenshot({ path: 'test-results/music-player.png', animations: 'disabled' });
});

test('a narrow music window scrolls the collection without losing playback controls', async ({ page }) => {
  await page.goto('/');
  await openApp(page, '音乐');
  const window = page.getByTestId('window-music');
  await expect(window.getByRole('list', { name: '音乐曲库' }).locator('li')).toHaveCount(5);
  await window.evaluate(async element => { await Promise.allSettled(element.getAnimations().map(animation => animation.finished)); });
  const bounds = (await window.boundingBox())!;
  const handle = (await window.locator('.window-resize').boundingBox())!;
  const x = handle.x + handle.width / 2, y = handle.y + handle.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + 310 - bounds.width, y + 480 - bounds.height); await page.mouse.up();
  expect(await window.locator('.window-body').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await window.getByRole('list', { name: '音乐曲库' }).locator('li').last().scrollIntoViewIfNeeded();
  const body = (await window.locator('.window-body').boundingBox())!;
  const play = (await window.getByRole('button', { name: '播放音乐', exact: true }).boundingBox())!;
  expect(play.y).toBeGreaterThanOrEqual(body.y);
  expect(play.y + play.height).toBeLessThanOrEqual(body.y + body.height);
  await page.screenshot({ path: 'test-results/music-player-narrow.png', animations: 'disabled' });
});
