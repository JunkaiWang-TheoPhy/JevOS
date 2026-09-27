import test from 'node:test';
import assert from 'node:assert/strict';
import { preparedAppForCommand } from '../src/prepared-app-command.ts';

test('explicit presentation aliases open the preloaded deck', () => {
  for (const text of ['打开ppt', '打开 PPT', '打开演示文稿', '打开路演文档', '开启幻灯片', 'open PowerPoint', '打开ppt。']) {
    assert.equal(preparedAppForCommand(text), 'generated:demo-presentation', text);
  }
});
test('generation requests and negated or compound instructions do not become local open commands', () => {
  for (const text of ['生成ppt', '不要打开ppt', '打开ppt并改成红色', '做一个ppt阅读器', '打开计算器', '']) {
    assert.equal(preparedAppForCommand(text), null, text);
  }
});
