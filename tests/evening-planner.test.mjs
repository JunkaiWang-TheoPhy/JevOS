import test from 'node:test';
import assert from 'node:assert/strict';
import { planScene } from '../server/scene-planner.mjs';

test('evening mode is routed locally without calling the model', async () => {
  const result = await planScene({ text: '傍晚休息模式', requestId: 'evening-integrated',
    baseRevision: 0, desktopRevision: 0, viewport: { width: 1440, height: 800 },
    windows: [], activeWindowId: null }, { apps: [{ id: 'music', title: '音乐' }], apiKey: 'mock-only',
    fetcher: () => { throw new Error('Evening preset must not call the model'); } });
  assert.equal(result.source, 'rules'); assert.equal(result.status, 'ready');
  assert.deepEqual(result.operations.filter(op => op.type === 'open').map(op => op.appId), ['music', 'notes']);
});
