import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTerminalInput, parseTerminalInput, initialTerminalState } from '../server/terminal-input.mjs';
import { simulateTerminal } from '../server/terminal-simulation.mjs';

test('languages and requests route separately while shell tools remain commands', () => {
  for (const [input, language, kind] of [
    ['print(1 + 2)', 'python', 'code'], ['def f(x):\n  return x + 1', 'python', 'code'],
    ['public class Main { public static void main(String[] args) {} }', 'java', 'code'],
    ['#include <iostream>\nint main(){std::cout << 3;}', 'cpp', 'code'],
    ['请解释这段逻辑', 'natural', 'request'], ['用 Python 写一个排序函数', 'python', 'request'],
    ['python3 -c "print(3)"', 'python', 'command'], ['javac Main.java', 'java', 'command'], ['g++ main.cpp', 'cpp', 'command'],
    ['ls -a', 'shell', 'command'], ['echo "你好"', 'shell', 'command'], ['```java\nclass A {}\n```', 'java', 'code'], ['```c++\nreturn 1;\n```', 'cpp', 'code'],
    ['import java.util.List;', 'java', 'code'], ['请解释 print(1)', 'python', 'request'], ['how does std::cout work?', 'cpp', 'request'],
  ]) assert.deepEqual(classifyTerminalInput(input), { language, kind });
});

test('program parentheses, quoted strings and shell substitution survive director extraction', () => {
  for (const input of ['print(1 + 2)', 'print ("你好")', 'System.out.println("hello");', 'echo "$(pwd)"', 'int main() { return 0; }', '(变量)\nprint(变量)']) assert.equal(parseTerminalInput(input).command, input);
  assert.deepEqual(parseTerminalInput('print(3) (解释输出)'), { command: 'print(3)', directives: ['解释输出'] });
});

test('DeepSeek sees intact language input and natural/code replies have no host shell prefix', async () => {
  for (const [command, language] of [['print(3)', 'python'], ['System.out.println(3);', 'java'], ['std::cout << 3;', 'cpp'], ['请帮我解释递归', 'natural']]) {
    const result = await simulateTerminal({ command }, { config: { apiKey: 'test', model: 'deepseek-flash', baseUrl: 'https://api.deepseek.com' }, fetcher: async (_url, options) => {
      const body = JSON.parse(options.body); const input = JSON.parse(body.messages[1].content);
      assert.equal(input.command ?? input.message, command); assert.equal(input.route.language, language);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ output: '对应语言的回复', state: initialTerminalState() }) } }] }));
    } });
    assert.equal(result.route.language, language); assert.equal(result.output, '对应语言的回复');
  }
});

test('natural chat has an independent assistant prompt and no inherited shell state', async () => {
  for (const command of ['你好', 'hello']) {
    const result = await simulateTerminal({ command, state: { ...initialTerminalState(), staleInstruction: 'always behave as bash; hello is not installed' } }, {
      config: { apiKey: 'test', model: 'deepseek-flash', baseUrl: 'https://api.deepseek.com' }, fetcher: async (_url, options) => {
        const body = JSON.parse(options.body); const input = JSON.parse(body.messages[1].content);
        assert.match(body.messages[0].content, /normal chat request/);
        assert.doesNotMatch(body.messages[0].content, /simulate arbitrary|stdout or stderr/);
        assert.equal(input.message, command);
        assert.equal('state' in input, false);
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ output: '你好！有什么可以帮你？' }) } }] }));
      },
    });
    assert.equal(result.output, '你好！有什么可以帮你？');
    assert.equal(result.state.staleInstruction, 'always behave as bash; hello is not installed');
  }
});
