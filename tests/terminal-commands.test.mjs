import test from 'node:test';
import assert from 'node:assert/strict';
import { executeTerminalCommand } from '../src/apps/terminal/commands.ts';

const context = {
  workspace: { note: '真正的工作区笔记\nHello <script>', tasks: ['检查状态恢复', '修复窗口焦点'] },
  apps: [{ id: 'terminal', title: 'Terminal' }, { id: 'motion-lab', title: 'Motion Lab' }],
};

test('workspace commands read current supplied data without modifying it', () => {
  const before = structuredClone(context);
  assert.equal(executeTerminalCommand('pwd', context).output, '/workspace');
  assert.equal(executeTerminalCommand('ls', context).output, 'note.txt\ntasks.json');
  assert.equal(executeTerminalCommand('cat note.txt', context).output, context.workspace.note);
  assert.deepEqual(JSON.parse(executeTerminalCommand('cat tasks.json', context).output), context.workspace.tasks);
  assert.match(executeTerminalCommand('apps', context).output, /motion-lab\s+Motion Lab/);
  assert.deepEqual(context, before);
  assert.equal(executeTerminalCommand('cat note.txt', { ...context, workspace: { ...context.workspace, note: '新的笔记' } }).output, '新的笔记');
});

test('open and export return explicit effects instead of claiming execution', () => {
  assert.deepEqual(executeTerminalCommand('open motion-lab', context), { ok: true, output: '', effect: { type: 'open-app', appId: 'motion-lab' } });
  assert.deepEqual(executeTerminalCommand('note export', context).effect, { type: 'export-text', filename: 'note.txt', content: context.workspace.note });
  assert.deepEqual(executeTerminalCommand('clear', context).effect, { type: 'clear' });
  assert.equal(executeTerminalCommand('open unregistered', context).ok, false);
});

test('calc uses the deterministic arithmetic grammar', () => {
  assert.equal(executeTerminalCommand('calc (2 + 3) × 4', context).output, '20');
  assert.equal(executeTerminalCommand('calc 0.1 + 0.2', context).output, '0.3');
  for (const command of ['calc', 'calc 1/0', 'calc alert(1)', 'calc 2 +']) assert.equal(executeTerminalCommand(command, context).ok, false);
});

test('the interpreter rejects system commands, traversal and command chaining', () => {
  for (const command of ['bash', 'rm -rf /', 'cat ../../.env', 'cat note.txt tasks.json', 'open motion-lab; rm -rf /', 'pwd && ls', 'pwd\nls', 'clear all', 'help extra', 'x'.repeat(513)]) {
    const result = executeTerminalCommand(command, context);
    assert.equal(result.ok, false, command);
    assert.equal(result.effect, undefined, command);
  }
  assert.equal(executeTerminalCommand('   ', context).output, '');
  assert.match(executeTerminalCommand('help', context).output, /不运行电脑上的系统 shell/);
});
