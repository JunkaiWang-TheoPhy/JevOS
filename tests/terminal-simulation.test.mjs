import test from 'node:test';
import assert from 'node:assert/strict';
import { initialTerminalState, parseTerminalInput } from '../server/terminal-input.mjs';
import { simulateTerminal, validateTerminalState, createTerminalSimulationHandler } from '../server/terminal-simulation.mjs';
import { createWorkspaceStore } from '../server/store.mjs';
import { createServer } from 'node:http';

const config = { apiKey: 'test-not-a-real-key', model: 'deepseek-flash', baseUrl: 'https://api.deepseek.com' };
const modelResponse = (output, state) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ output, state }) } }] }));

test('backstage directives are separate, including nested and standalone cues', () => {
  assert.deepEqual(parseTerminalInput('ls -a (显示隐藏文件) (故意失败)'), { command: 'ls -a', directives: ['显示隐藏文件', '故意失败'] });
  assert.deepEqual(parseTerminalInput('(退出模拟)'), { command: '', directives: ['退出模拟'] });
  assert.deepEqual(parseTerminalInput('(嵌套(指令)) pwd'), { command: 'pwd', directives: ['嵌套(指令)'] });
});

test('blank input and shell/assistant controls do not need a model', async () => {
  const fetcher = () => { throw new Error('must not fetch'); };
  const blank = await simulateTerminal({ command: '  ' }, { config: {}, fetcher });
  assert.equal(blank.output, 'root@universal-shell:/home/user# \n');
  const exit = await simulateTerminal({ command: '(退出模拟)', state: blank.state }, { config: {}, fetcher });
  assert.equal(exit.state.mode, 'assistant'); assert.doesNotMatch(exit.output, /root@/);
  const resume = await simulateTerminal({ command: '(恢复模拟)', state: exit.state }, { config: {}, fetcher });
  assert.equal(resume.state.mode, 'shell'); assert.match(resume.output, /^root@universal-shell:/);
});

test('DeepSeek receives virtual state and director cues, and never a local shell invocation', async () => {
  const firstState = { ...initialTerminalState(), cwd: '/tmp', filesystem: { ...initialTerminalState().filesystem, '/tmp/note.txt': { type: 'file', content: 'hello' } } };
  let calls = 0;
  const fetcher = async (url, options) => {
    assert.equal(url, 'https://api.deepseek.com/chat/completions');
    const body = JSON.parse(options.body); const input = JSON.parse(body.messages[1].content);
    assert.equal(body.model, 'deepseek-flash'); assert.equal(body.max_tokens, 4500); assert.equal(body.response_format.type, 'json_object');
    assert.equal('max_completion_tokens' in body, false); assert.equal(options.redirect, 'error');
    if (++calls === 1) {
      assert.equal(input.command, 'cd /tmp; touch note.txt'); assert.deepEqual(input.directives, ['显示成功']);
      return modelResponse('显示成功', firstState);
    }
    assert.equal(input.state.filesystem['/tmp/note.txt'].content, 'hello');
    assert.equal(input.command, 'cat note.txt'); return modelResponse('hello', input.state);
  };
  const first = await simulateTerminal({ command: 'cd /tmp; touch note.txt (显示成功)' }, { config, fetcher });
  assert.equal(first.state.cwd, '/tmp'); assert.doesNotMatch(first.output, /显示成功/);
  const second = await simulateTerminal({ command: 'cat note.txt', state: first.state }, { config, fetcher });
  assert.equal(second.output, 'root@universal-shell:/tmp# hello\n'); assert.equal(calls, 2);
});

test('assistant mode has no shell prompt and a model cannot switch modes by itself', async () => {
  const state = { ...initialTerminalState(), mode: 'assistant' };
  const result = await simulateTerminal({ command: '你好', state }, { config, fetcher: async () => modelResponse('你好，想聊什么？', { ...state, mode: 'shell' }) });
  assert.equal(result.state.mode, 'assistant'); assert.equal(result.output, '你好，想聊什么？');
});

test('unconfigured/non-DeepSeek services and invalid model state fail without inventing success', async () => {
  await assert.rejects(simulateTerminal({ command: 'apt install nodejs' }, { config: {} }), /DeepSeek/);
  await assert.rejects(simulateTerminal({ command: 'ls' }, { config: { ...config, baseUrl: 'https://api.deepseek.com.attacker.example' } }), /DeepSeek/);
  await assert.rejects(simulateTerminal({ command: 'rm -rf /' }, { config, fetcher: async () => new Response('error', { status: 500 }) }), /HTTP 500/);
  await assert.rejects(simulateTerminal({ command: 'pwd' }, { config, fetcher: async () => modelResponse('ok', { ...initialTerminalState(), cwd: 'invalid' }) }), /记忆无效/);
  assert.throws(() => validateTerminalState({ ...initialTerminalState(), payload: 'x'.repeat(13000) }), /12 KiB/);
  assert.throws(() => validateTerminalState(JSON.parse('{"cwd":"/","mode":"shell","__proto__":{}}')), /字段无效/);
});

test('HTTP handler requires workspace and same origin and closes without new requests', async t => {
  const store = createWorkspaceStore({ filename: ':memory:' });
  const handler = createTerminalSimulationHandler({ workspaceStore: store, allowedOrigins: ['http://client.test'], configFactory: () => ({}) });
  const server = createServer(async (req, res) => { await handler(req, res, '/api/terminal/simulate'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { handler.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); store.close(); });
  const url = `http://127.0.0.1:${server.address().port}/api/terminal/simulate`;
  assert.equal((await fetch(url, { method: 'POST', headers: { Origin: 'http://wrong.test', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal((await fetch(url, { method: 'POST', headers: { Origin: 'http://client.test', 'Content-Type': 'application/json' }, body: '{"command":"ls"}' })).status, 401);
  const session = store.getOrCreateWorkspace();
  const blank = await fetch(url, { method: 'POST', headers: { Cookie: `vibeos-session=${session.token}`, Origin: 'http://client.test', 'Content-Type': 'application/json' }, body: '{"command":""}' });
  assert.equal(blank.status, 200); assert.equal((await blank.json()).output, 'root@universal-shell:/home/user# \n');
  handler.close();
  assert.equal((await fetch(url, { method: 'POST', headers: { Origin: 'http://client.test', 'Content-Type': 'application/json' }, body: '{}' })).status, 503);
});
