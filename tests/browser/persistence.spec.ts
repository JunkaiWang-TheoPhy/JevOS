import { test, expect } from './test-fixture';

async function openLauncher(page: import('@playwright/test').Page) {
  if (!(await page.getByRole('dialog', { name: 'What you want do....' }).isVisible()))
    await page.getByRole('button', { name: 'What you want do....', exact: true }).click();
}

const noteLabel = '你的记录会保存在这台设备';
const synced = (page: import('@playwright/test').Page) => expect(page.getByRole('status', { name: '数据同步状态' })).toContainText('已同步');

test('SQLite restores committed state after the browser cache is cleared', async ({ page }) => {
  await page.goto('/'); await synced(page);
  await page.getByLabel(noteLabel).fill('来自 SQLite 的记录');
  await page.getByRole('button', { name: '准备会议', exact: true }).click();
  await page.getByLabel('主题', { exact: true }).fill('后端保存的会议');
  await synced(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await synced(page);
  await expect(page.getByLabel(noteLabel)).toHaveValue('来自 SQLite 的记录');
  await expect(page.getByLabel('主题', { exact: true })).toHaveValue('后端保存的会议');
});

test('clearing session cookies creates a new visitor without displaying the prior cache', async ({ page, context }) => {
  await page.goto('/'); await synced(page);
  await page.getByLabel(noteLabel).fill('第一位访客的私有草稿'); await synced(page);
  await context.clearCookies();
  await page.reload(); await synced(page);
  await expect(page.getByLabel(noteLabel)).toHaveValue('');
});

test('editing during the initial load is preserved and then committed', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/workspace', async (route) => { await gate; await route.continue(); });
  await page.goto('/');
  await page.getByLabel(noteLabel).fill('加载期间的输入');
  release(); await synced(page);
  await expect(page.getByLabel(noteLabel)).toHaveValue('加载期间的输入');
  await page.unroute('**/api/workspace');
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await synced(page);
  await expect(page.getByLabel(noteLabel)).toHaveValue('加载期间的输入');
});

test('offline drafts survive reload and synchronize when connectivity returns', async ({ page, context }) => {
  await page.goto('/'); await synced(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); await synced(page);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.getByLabel(noteLabel).fill('离线编辑之后提交');
  await expect(page.getByRole('status', { name: '数据同步状态' })).toContainText('本地待同步');
  await page.reload();
  await expect(page.getByLabel(noteLabel)).toHaveValue('离线编辑之后提交');
  await context.setOffline(false); await synced(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await synced(page);
  await expect(page.getByLabel(noteLabel)).toHaveValue('离线编辑之后提交');
});

test('a transient first reconnect GET retries without losing offline edits', async ({ page, context }) => {
  await page.goto('/'); await synced(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); await synced(page);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.getByLabel(noteLabel).fill('重连首个请求失败仍须保存的草稿');
  // Install before reload: the client captures fetch when it is constructed.
  await page.addInitScript(() => {
    const runtime = window as typeof window & { simulateReconnect?: boolean; rejectReconnect?: () => void };
    runtime.simulateReconnect = false;
    const original = window.fetch.bind(window);
    let hold = true;
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (hold && runtime.simulateReconnect && navigator.onLine && url.endsWith('/api/workspace')) {
        hold = false;
        return new Promise<Response>((_, reject) => {
          runtime.rejectReconnect = () => reject(new TypeError('Failed to fetch'));
        });
      }
      return original(input, init);
    };
  });
  await page.reload();
  await expect(page.getByLabel(noteLabel)).toHaveValue('重连首个请求失败仍须保存的草稿');
  await page.getByRole('button', { name: '重新同步', exact: true }).click();
  await expect(page.getByRole('status', { name: '数据同步状态' })).toContainText('服务不可用');
  await page.evaluate(() => { (window as typeof window & { simulateReconnect?: boolean }).simulateReconnect = true; });
  await context.setOffline(false);
  await expect.poll(() => page.evaluate(() => typeof (window as typeof window & { rejectReconnect?: () => void }).rejectReconnect)).toBe('function');
  await page.evaluate(() => { (window as typeof window & { rejectReconnect?: () => void }).rejectReconnect?.(); });
  await synced(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await synced(page);
  await expect(page.getByLabel(noteLabel)).toHaveValue('重连首个请求失败仍须保存的草稿');
});

test('backend layout undo keeps the newest saved notes and meeting draft', async ({ page }) => {
  await page.goto('/'); await synced(page);
  await page.getByRole('button', { name: '准备会议', exact: true }).click();
  await page.getByLabel('主题', { exact: true }).fill('撤销也保留的议程');
  await page.getByRole('button', { name: '异步评审', exact: true }).click(); await synced(page);
  await page.getByLabel(noteLabel).fill('评审之后的新记录'); await synced(page);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(page.getByLabel('主题', { exact: true })).toHaveValue('撤销也保留的议程');
  await expect(page.getByLabel(noteLabel)).toHaveValue('评审之后的新记录');
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await synced(page);
  await expect(page.getByLabel(noteLabel)).toHaveValue('评审之后的新记录');
});

test('incomplete dates remain local until corrected and server rejection never reports saved', async ({ page }) => {
  await page.goto('/'); await synced(page);
  await page.getByRole('button', { name: '准备会议', exact: true }).click(); await synced(page);
  await page.getByLabel('日期', { exact: true }).fill('');
  await expect(page.getByRole('status', { name: '数据同步状态' })).toContainText('补全有效日期');
  await expect(page.getByLabel('日期', { exact: true })).toHaveValue('');
  await page.getByLabel('日期', { exact: true }).fill('2028-02-29'); await synced(page);
  await page.route('**/api/actions', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'private-backend-detail' }) }));
  await page.getByLabel(noteLabel).fill('保存被拒绝的草稿');
  await expect(page.getByRole('status', { name: '数据同步状态' })).toContainText('服务不可用');
  await expect(page.getByLabel(noteLabel)).toHaveValue('保存被拒绝的草稿');
  await expect(page.getByRole('status', { name: '数据同步状态' })).not.toContainText('已同步');
});

test('a late decision cannot override a newer manual selection', async ({ page }) => {
  await page.goto('/'); await synced(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const started = page.waitForRequest('**/api/scenes/plan');
  await page.route('**/api/scenes/plan', async (route) => {
    const input = route.request().postDataJSON();
    await gate;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      proposalId: 'scene-late-review', source: 'rules', explanation: '打开评审待办',
      operations: [{ type: 'open', appId: 'tasks', windowId: 'tasks' }], focusWindowId: 'tasks',
      requestId: input.requestId, desktopRevision: input.desktopRevision, baseRevision: input.baseRevision,
    }) }).catch(() => {});
  });
  await openLauncher(page);
  await page.getByLabel('描述桌面布局').fill('改成异步评审');
  await page.getByRole('button', { name: '调整桌面', exact: true }).click(); await started;
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '准备会议', exact: true }).click(); release();
  await expect(page.getByRole('button', { name: '准备会议', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await synced(page);
  await expect(page.getByRole('heading', { name: '异步评审清单' })).not.toBeVisible();
});

test('offline reconnect preserves remote changes and requires explicit overwrite confirmation', async ({ page, context }) => {
  await page.goto('/'); await synced(page);
  await page.getByLabel(noteLabel).fill('共同基线'); await synced(page);
  await context.setOffline(true);
  await page.getByLabel(noteLabel).fill('离线草稿 A');
  const { workspace } = await (await context.request.get('/api/workspace')).json();
  const remote = await context.request.post('/api/actions', { headers: { Origin: new URL(page.url()).origin },
    data: { actionId: crypto.randomUUID(), expectedRevision: workspace.revision,
      kind: 'save_draft', args: { note: '另一标签页的新修改 B' } } });
  expect(remote.ok()).toBeTruthy();
  await context.setOffline(false);
  // Give both reconnect and the 600ms autosave window time to run; no write should occur.
  await page.waitForTimeout(1000);
  const authoritative = await (await context.request.get('/api/workspace')).json();
  expect(authoritative.workspace.state.note).toBe('另一标签页的新修改 B');
  await expect(page.getByLabel(noteLabel)).toHaveValue('离线草稿 A');
  await expect(page.getByRole('status', { name: '数据同步状态' })).toContainText('冲突');
  await page.getByRole('button', { name: '重新同步', exact: true }).click();
  await page.waitForTimeout(700);
  expect((await (await context.request.get('/api/workspace')).json()).workspace.state.note).toBe('另一标签页的新修改 B');
  await page.getByRole('button', { name: '确认保存本地修改', exact: true }).click(); await synced(page);
  expect((await (await context.request.get('/api/workspace')).json()).workspace.state.note).toBe('离线草稿 A');
});

test('a cached conflict survives reload and editing without silently rebasing', async ({ page, context }) => {
  await page.goto('/'); await synced(page);
  await page.getByLabel(noteLabel).fill('冲突基线'); await synced(page);
  await context.setOffline(true);
  await page.getByLabel(noteLabel).fill('保存在缓存的 A');
  const { workspace } = await (await context.request.get('/api/workspace')).json();
  const remote = await context.request.post('/api/actions', { headers: { Origin: new URL(page.url()).origin },
    data: { actionId: crypto.randomUUID(), expectedRevision: workspace.revision,
      kind: 'save_draft', args: { note: '缓存之外的新 B' } } });
  expect(remote.ok()).toBeTruthy();
  await context.setOffline(false);
  await expect(page.getByRole('status', { name: '数据同步状态' })).toContainText('冲突');
  await page.reload();
  await expect(page.getByLabel(noteLabel)).toHaveValue('保存在缓存的 A');
  await expect(page.getByRole('status', { name: '数据同步状态' })).toContainText('冲突');
  await page.getByLabel(noteLabel).fill('继续编辑 A2');
  await page.waitForTimeout(700);
  expect((await (await context.request.get('/api/workspace')).json()).workspace.state.note).toBe('缓存之外的新 B');
  const cached = await page.evaluate(() => JSON.parse(localStorage.getItem('vibeos-workspace-v2') || 'null'));
  expect(cached.bases.note).toBe('冲突基线');
  expect(cached.committed.state.note).toBe('缓存之外的新 B');
  expect(cached.committed.revision).toBeGreaterThan(0);
  expect(cached.conflict).toBe(true);
});

test('legacy drafts require explicit import and retain the original record', async ({ page, context }) => {
  const old = { mode: 'meeting', note: '旧版私人记录', pinned: false,
    meeting: { title: '旧版议程', date: '2026-10-01', time: '14:30' }, tasks: ['旧版任务'] };
  await page.addInitScript((value) => {
    if (!localStorage.getItem('vibeos-workspace-v1')) localStorage.setItem('vibeos-workspace-v1', JSON.stringify(value));
  }, old);
  await page.goto('/'); await synced(page);
  await expect(page.getByLabel(noteLabel)).toHaveValue('');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '导入旧版草稿', exact: true }).click(); await synced(page);
  await expect(page.getByLabel(noteLabel)).toHaveValue('旧版私人记录\n\n旧版会议草稿：旧版议程 · 2026-10-01 14:30');
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem('vibeos-workspace-v1') || 'null'));
  expect(original).toEqual(old);
  expect((await (await context.request.get('/api/workspace')).json()).workspace.state.note).toContain('旧版私人记录');
});
