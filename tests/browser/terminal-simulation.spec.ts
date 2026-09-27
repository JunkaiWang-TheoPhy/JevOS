import { test, expect, openApp } from './test-fixture';
import { parseTerminalInput, terminalPrompt } from '../../server/terminal-input.mjs';

test('simulated shell keeps virtual files, hides director cues, resumes state and retains local workspace mode', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/terminal/simulate', route => {
    calls++;
    const { command, state } = route.request().postDataJSON();
    const parsed = parseTerminalInput(command);
    const next = structuredClone(state);
    let output: string;
    if (parsed.directives.includes('退出模拟')) { next.mode = 'assistant'; output = '已退出终端模拟，可以直接和我对话。'; }
    else if (parsed.directives.includes('恢复模拟')) { next.mode = 'shell'; output = terminalPrompt(next.cwd); }
    else if (parsed.command.startsWith('mkdir')) {
      next.cwd = '/tmp/demo'; next.filesystem['/tmp/demo/note.txt'] = { type: 'file', content: 'hello' };
      output = terminalPrompt(next.cwd) + '\n';
    } else if (parsed.command === 'cat note.txt') {
      expect(state.filesystem['/tmp/demo/note.txt'].content).toBe('hello'); output = terminalPrompt(next.cwd) + 'hello\n';
    } else { expect(state.mode).toBe('assistant'); output = '你好，我们可以继续讨论。'; }
    return route.fulfill({ json: { simulated: true, source: 'deepseek', command: parsed.command, state: next, output } });
  });
  await page.goto('/');
  await expect(page.getByRole('status', { name: '数据同步状态' })).toContainText('已同步');
  const note = page.getByLabel('你的记录会保存在这台设备');
  await note.fill('真实工作区笔记仍然可读');
  await openApp(page, 'Terminal');
  const terminal = page.getByTestId('window-terminal');
  const command = terminal.getByLabel('命令', { exact: true });
  await expect(terminal.locator('footer')).toContainText('JevOS');
  await command.fill('mkdir /tmp/demo; cd /tmp/demo; echo hello > note.txt (隐藏导演指令)'); await command.press('Enter');
  const log = terminal.getByRole('log', { name: '终端输出' });
  await expect(log).toContainText('root@universal-shell:/tmp/demo#');
  await expect(log).not.toContainText('隐藏导演指令');
  await command.fill('cat note.txt'); await command.press('Enter'); await expect(log).toContainText('hello');
  await command.fill('(退出模拟)'); await command.press('Enter');
  const assistant = terminal.getByLabel('助手消息', { exact: true });
  await expect(assistant).toBeVisible();
  await assistant.fill('你好'); await assistant.press('Enter');
  await expect(log.locator('pre').last()).toHaveText('你好，我们可以继续讨论。');
  await assistant.fill('(恢复模拟)'); await assistant.press('Enter'); await expect(command).toBeVisible();
  await terminal.getByRole('button', { name: '工作区命令', exact: true }).click();
  const local = terminal.getByLabel('工作区命令', { exact: true });
  await local.fill('cat note.txt'); await local.press('Enter');
  await expect(terminal.getByRole('log', { name: '命令输出' })).toContainText('真实工作区笔记仍然可读');
  await page.getByRole('button', { name: '关闭Terminal', exact: true }).click();
  await openApp(page, 'Terminal');
  await expect(log).toContainText('hello');
  await command.fill('cat note.txt'); await command.press('Enter'); await expect(log.locator('pre').last()).toContainText('hello');
  expect(calls).toBe(6);
});

test('blank commands stay local and provider errors do not fabricate successful execution or advance memory', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/terminal/simulate', route => { calls++; return route.fulfill({ status: 503, json: { error: '请配置 DeepSeek 模拟服务。' } }); });
  await page.goto('/');
  await expect(page.getByRole('status', { name: '数据同步状态' })).toContainText('已同步');
  await openApp(page, 'Terminal');
  const terminal = page.getByTestId('window-terminal');
  const command = terminal.getByLabel('命令', { exact: true });
  await command.press('Enter');
  expect(calls).toBe(0);
  await command.fill('apt install nodejs'); await command.press('Enter');
  await expect(terminal.getByRole('status')).toContainText('请配置 DeepSeek');
  await expect(command).toHaveValue('apt install nodejs');
  await expect(terminal.getByRole('log', { name: '终端输出' })).not.toContainText('nodejs');
  await expect(terminal.getByRole('log', { name: '终端输出' })).toContainText('root@universal-shell:/home/user#');
  expect(calls).toBe(1);
});

test('large simulated output remains visible even when persisted transcript is shortened', async ({ page }) => {
  await page.route('**/api/terminal/simulate', route => {
    const { state } = route.request().postDataJSON();
    return route.fulfill({ json: { simulated: true, source: 'deepseek', state, output: terminalPrompt(state.cwd) + '汉'.repeat(11000) } });
  });
  await page.goto('/');
  await expect(page.getByRole('status', { name: '数据同步状态' })).toContainText('已同步');
  await openApp(page, 'Terminal');
  const terminal = page.getByTestId('window-terminal');
  await terminal.getByLabel('命令', { exact: true }).fill('show large output');
  await terminal.getByLabel('命令', { exact: true }).press('Enter');
  await expect(terminal.getByRole('log', { name: '终端输出' })).toContainText('汉'.repeat(10000));
});
