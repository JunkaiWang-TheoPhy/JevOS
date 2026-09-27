import { test, expect, openApp } from './test-fixture';
import { classifyTerminalInput, parseTerminalInput } from '../../server/terminal-input.mjs';

test('multi-language terminal keeps code intact and previews each automatic route', async ({ page }) => {
  const commands: string[] = [];
  await page.route('**/api/terminal/simulate', route => {
    const body = route.request().postDataJSON(); commands.push(body.command);
    const parsed = parseTerminalInput(body.command); const selected = classifyTerminalInput(parsed.command);
    return route.fulfill({ json: { simulated: true, source: 'deepseek', route: selected, state: body.state, output: `${selected.language} reply` } });
  });
  await page.goto('/');
  await expect(page.getByRole('status', { name: '数据同步状态' })).toContainText('已同步');
  await openApp(page, 'Terminal');
  const terminal = page.getByTestId('window-terminal');
  const editor = terminal.getByLabel('命令', { exact: true });
  expect(await editor.evaluate(el => el.tagName)).toBe('TEXTAREA');
  for (const [code, label, language] of [
    ['print(1 + 2)', 'Python', 'python'],
    ['public class Main { public static void main(String[] args) { System.out.println(3); } }', 'Java', 'java'],
    ['#include <iostream>\nint main(){ std::cout << 3; }', 'C++', 'cpp'],
    ['请解释一下递归', '自然语言', 'natural'],
  ]) {
    await editor.fill(code);
    await expect(terminal.getByLabel('输入路由')).toContainText(label);
    await editor.press('Enter');
    await expect(terminal.getByRole('log').locator('pre').last()).toHaveText(`${language} reply`);
  }
  expect(commands[0]).toBe('print(1 + 2)');
  expect(commands[2]).toContain('\nint main()');
  await editor.fill('print(1)');
  await editor.press('Shift+Enter');
  expect(await editor.inputValue()).toContain('\n');
  expect(commands).toHaveLength(4);
});
