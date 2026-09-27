import { calculate } from '../../calculator.ts';
import type { AppDescriptor } from '../contracts';
import type { Workspace } from '../../workspace';

export interface TerminalContext {
  workspace: Pick<Workspace, 'note' | 'tasks'>;
  apps: readonly Pick<AppDescriptor, 'id' | 'title'>[];
}

export type TerminalEffect =
  | { type: 'open-app'; appId: string }
  | { type: 'export-text'; filename: string; content: string }
  | { type: 'clear' };

export interface TerminalResult { ok: boolean; output: string; effect?: TerminalEffect }

const HELP = `JevOS workspace commands

  help                 显示可用命令
  apps                 列出已注册应用
  pwd                  显示工作区路径
  ls                   列出可读取的工作区文件
  cat note.txt         读取当前笔记
  cat tasks.json       读取当前待办
  open <appId>         打开已注册应用
  note export          下载当前笔记
  calc <expression>    本机计算四则运算
  clear                清空当前终端输出

↑ / ↓ 浏览命令历史 · Ctrl+L 清屏
这是工作区命令台，不运行电脑上的系统 shell。`;

/** Interpret a bounded command language; all side effects are returned to the host. */
export function executeTerminalCommand(command: string, context: TerminalContext): TerminalResult {
  const text = command.trim();
  const success = (output: string, effect?: TerminalEffect): TerminalResult => ({ ok: true, output, ...(effect ? { effect } : {}) });
  const failure = (output: string): TerminalResult => ({ ok: false, output });
  if (!text) return success('');
  if (text.length > 512) return failure('命令过长；最多输入 512 个字符。');
  if (text.includes('\r') || text.includes('\n') || text.includes('\0')) return failure('每次只支持一条单行工作区命令。');
  const [name, ...parts] = text.split(/\s+/);
  const args = parts.join(' ');
  switch (name) {
    case 'help': return args ? failure('用法：help') : success(HELP);
    case 'apps': return args ? failure('用法：apps') : success(context.apps.map(app => `${app.id.padEnd(18)} ${app.title}`).join('\n') || '当前没有已注册应用。');
    case 'pwd': return args ? failure('用法：pwd') : success('/workspace');
    case 'ls': return args ? failure('用法：ls') : success('note.txt\ntasks.json');
    case 'cat':
      if (args === 'note.txt') return success(context.workspace.note);
      if (args === 'tasks.json') return success(JSON.stringify(context.workspace.tasks, null, 2));
      return failure('用法：cat note.txt 或 cat tasks.json；仅可读取当前工作区文件。');
    case 'open': {
      const app = context.apps.find(item => item.id === args);
      return app ? success('', { type: 'open-app', appId: app.id }) : failure(`未注册的应用：${args || '(空)'}。输入 apps 查看可用 ID。`);
    }
    case 'note': return args === 'export' ? success('', { type: 'export-text', filename: 'note.txt', content: context.workspace.note }) : failure('用法：note export');
    case 'calc':
      try { return success(String(calculate(args))); }
      catch (error) { return failure(error instanceof Error ? error.message : '算式无效。'); }
    case 'clear': return args ? failure('用法：clear') : success('', { type: 'clear' });
    default: return failure(`未知命令：${name}。输入 help 查看工作区命令。`);
  }
}
