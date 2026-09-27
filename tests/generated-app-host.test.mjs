import test from 'node:test';
import assert from 'node:assert/strict';
import { Script, createContext } from 'node:vm';
import {
  buildFrameDocument, FRAME_CHANNEL, GENERATED_FRAME_SANDBOX,
  isSafeState, MAX_STATE_BYTES, parseFrameMessage,
} from '../src/apps/generated/frame-document.ts';
import { retroTimerFixture } from '../src/apps/generated/retro-timer-fixture.ts';

const nonce = 'ab'.repeat(24);
const instanceId = 'timer:one';
const source = {};
const message = overrides => ({ channel: FRAME_CHANNEL, nonce, instanceId, id: 'm_1',
  type: 'request', method: 'setState', args: [{ running: true }], ...overrides });
const parse = value => parseFrameMessage(value, nonce, source, source, instanceId);

test('the frame is opaque and its script cannot fetch or embed external resources', () => {
  assert.equal(GENERATED_FRAME_SANDBOX, 'allow-scripts allow-forms');
  const doc = buildFrameDocument(retroTimerFixture, nonce, instanceId);
  assert.match(doc, /default-src 'none'/);
  assert.match(doc, /connect-src 'none'/);
  assert.match(doc, /frame-src 'none'/);
  assert.match(doc, /form-action 'none'/);
  assert.match(doc, /content="script-src 'unsafe-inline'"/);
  assert.doesNotMatch(doc, /unsafe-eval/);
});

test('HTML, CSS and JS payloads cannot break out of the bootstrap script', () => {
  const closing = '</script><script>parent.injection = true</script>';
  const app = { html: '<p>' + closing + '</p>', css: 'body::after{content:"</style>' + closing + '"}',
    js: 'const hostile = ' + JSON.stringify(closing + '\u2028\u2029<&>') + ';' };
  const doc = buildFrameDocument(app, nonce, instanceId);
  assert.equal((doc.match(/<script\b/g) || []).length, 1);
  assert.equal((doc.match(/<\/script>/g) || []).length, 1);
  assert(!doc.includes(closing));
  assert.match(doc, /\\u003c/);
  const bootstrap = doc.slice(doc.indexOf(`<script nonce="${nonce}">`) + `<script nonce="${nonce}">`.length, doc.lastIndexOf('</script>'));
  assert.doesNotThrow(() => new Script(bootstrap));
});

test('messages bind source window, nonce, instance, channel and request ID', () => {
  assert.equal(parse(message()).method, 'setState');
  for (const value of [message({ nonce: 'other' }), message({ instanceId: 'timer:two' }),
    message({ channel: 'other' }), message({ id: '' }), message({ id: 'm_0' }),
    message({ id: 'm_1\n' }), message({ type: 'unknown' }), null]) assert.equal(parse(value), null);
  assert.equal(parseFrameMessage(message(), nonce, {}, source, instanceId), null);
  assert.equal(parseFrameMessage(message(), nonce, null, null, instanceId), null);
});

test('only instance state requests cross the host bridge', () => {
  assert.equal(parse(message({ method: 'getState', args: [] })).method, 'getState');
  for (const method of ['readNote', 'listApps', 'openApp', 'exportText', 'fetch', 'shell', 'saveState', '__proto__']) {
    assert.equal(parse(message({ method })), null);
  }
  for (const args of [[], [null], [[]], ['text'], [{}, {}], [new Date()], [{ value: NaN }]]) {
    assert.equal(parse(message({ args })), null);
  }
  assert.equal(parse(message({ method: 'getState', args: [1] })), null);
});

test('state traversal and UTF-8 size are bounded before accepting a patch', () => {
  assert(isSafeState({ deadline: 100, running: false, settings: ['a', null] }));
  assert(!isSafeState(JSON.parse('{"__proto__":{"polluted":true}}')));
  assert(!isSafeState({ constructor: {} }));
  assert(!isSafeState({ infinity: Infinity }));
  assert(!isSafeState({ text: '汉'.repeat(MAX_STATE_BYTES / 2) }));
  assert(!isSafeState(Array.from({ length: 9000 }, () => 0)));
  const cyclic = {}; cyclic.self = cyclic;
  assert(!isSafeState(cyclic));
  let deep = {}; for (let i = 0; i < 30; i++) deep = { child: deep };
  assert(!isSafeState(deep));
});

test('invalid or incomplete app packages fail before a document can mount', () => {
  assert.throws(() => buildFrameDocument({ ...retroTimerFixture, html: '' }, nonce));
  assert.throws(() => buildFrameDocument({ ...retroTimerFixture, js: null }, nonce));
  assert.throws(() => buildFrameDocument({ ...retroTimerFixture, css: 'x'.repeat(262145) }, nonce));
  assert.throws(() => buildFrameDocument(retroTimerFixture, '" bad nonce'));
  assert.throws(() => buildFrameDocument(retroTimerFixture, nonce, ''));
  assert.equal(parse(message({ type: 'runtime-error', message: 'x'.repeat(2001) })), null);
});

test('the timer is explicitly an acceptance fixture and its JavaScript parses', () => {
  assert.match(retroTimerFixture.title, /验收样例/);
  assert.match(retroTimerFixture.html, /非现场生成/);
  assert.doesNotThrow(() => new Script(retroTimerFixture.js));
  assert.match(retroTimerFixture.js, /Date\.now\(\) \+ left/);
});

test('a lost state acknowledgement releases the action queue after its request expires', async () => {
  const timers = new Map(); const events = new Map(); const sent = [];
  let timerId = 0; let context;
  class Button {
    disabled = false;
    click() { context.vibe.setState({ running: false }).catch(() => {}); }
  }
  const button = new Button();
  context = createContext({
    parent: { postMessage: value => sent.push(value) },
    setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id), requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    addEventListener: (name, callback) => events.set(name, callback),
    HTMLButtonElement: Button,
    DOMParser: class { parseFromString() { return { body: { childNodes: [] } }; } },
    document: {
      hidden: false, documentElement: { dataset: {} }, addEventListener() {},
      getElementById: id => id === 'focusInput' ? {} : id === 'resetBtn' ? button : { textContent: '' },
      createElement: () => ({}), head: { appendChild() {} }, body: { appendChild() {} },
    },
  });
  context.window = context;
  const doc = buildFrameDocument({ html: '<p>Timer</p>', css: '', js: '' }, nonce, instanceId);
  new Script(doc.slice(doc.indexOf(`<script nonce="${nonce}">`) + `<script nonce="${nonce}">`.length, doc.lastIndexOf('</script>'))).runInContext(context);
  const send = value => events.get('message')({ source: context.parent, data: { channel: FRAME_CHANNEL, nonce, instanceId, ...value } });
  send({ type: 'start', active: false, state: {} });
  send({ type: 'action', actionId: 'a_1', action: 'reset', args: {} });
  await new Promise(resolve => setImmediate(resolve));
  const timeout = [...timers.values()].find(item => item.delay === 10000);
  assert(timeout, 'the state request must wait for the host acknowledgement');
  timeout.callback();
  await new Promise(resolve => setImmediate(resolve));
  assert(sent.some(item => item.type === 'action-result' && item.actionId === 'a_1' && item.ok === false), 'request timeout must also settle the waiting action');
  send({ type: 'action', actionId: 'a_2', action: 'reset', args: {} });
  await new Promise(resolve => setImmediate(resolve));
  assert(!sent.some(item => item.actionId === 'a_2' && item.message === '上一项操作尚未完成'), 'a later action must not remain blocked by the expired request');
});
