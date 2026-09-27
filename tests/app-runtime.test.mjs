import test from 'node:test';
import assert from 'node:assert/strict';
import { checkedAppState, readInstanceState, writeInstanceState } from '../src/apps/instance-state.ts';
import { parseGeneratedApp, generateApp, GeneratedApiError } from '../src/apps/generated-api.ts';

test('instance state is separated by workspace and app and cannot leak object mutations', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const state = { speed: 2, palette: ['green'] };
  writeInstanceState(storage, 'one', 'motion-lab', state);
  state.palette.push('pink');
  assert.deepEqual(readInstanceState(storage, 'one', 'motion-lab'), { speed: 2, palette: ['green'] });
  assert.equal(readInstanceState(storage, 'two', 'motion-lab'), null);
  assert.equal(readInstanceState(storage, 'one', 'terminal'), null);
});

test('non-JSON and oversized state is rejected before overwriting a saved value', () => {
  assert.throws(() => checkedAppState({ value: NaN }));
  assert.throws(() => checkedAppState({ run() {} }));
  assert.throws(() => checkedAppState({ text: 'x'.repeat(65536) }));
  assert.throws(() => checkedAppState(JSON.parse('{"__proto__":{}}')));
});

const app = { id: 'clock-1', title: '复古时钟', html: '<button>开始</button>', css: 'body{color:white}', js: '',
  initialState: { running: false }, createdAt: '2026-09-27T09:00:00Z' };

test('only complete app packages within declared limits can enter the registry', () => {
  assert.deepEqual(parseGeneratedApp(app), app);
  assert.throws(() => parseGeneratedApp({ ...app, id: '../private' }));
  assert.throws(() => parseGeneratedApp({ ...app, html: '' }));
  assert.throws(() => parseGeneratedApp({ ...app, js: 'x'.repeat(262144) }));
});

test('generation requests retain cancellation and surface missing credentials instead of fake output', async () => {
  const controller = new AbortController();
  let input;
  const fetcher = async (url, options) => {
    input = { url, options };
    return new Response(JSON.stringify({ code: 'GENERATOR_NOT_CONFIGURED', error: '请配置生成模型。' }), { status: 503 });
  };
  await assert.rejects(generateApp('创建时钟', controller.signal, fetcher), error =>
    error instanceof GeneratedApiError && error.code === 'GENERATOR_NOT_CONFIGURED');
  assert.equal(input.url, '/api/apps/generate');
  assert.equal(input.options.signal, controller.signal);
  assert.equal(input.options.credentials, 'same-origin');
  assert.deepEqual(JSON.parse(input.options.body), { prompt: '创建时钟' });
});
