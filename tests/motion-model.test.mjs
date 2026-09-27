import test from 'node:test';
import assert from 'node:assert/strict';
import { createParticles, DEFAULT_SETTINGS, normalizeSettings, stepParticles } from '../src/apps/motion-lab/model.ts';

test('motion settings restore safely and bound the workload', () => {
  assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings([]), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings({ count: 100000, speed: -1, color: 'javascript:alert(1)', paused: 'true' }), { ...DEFAULT_SETTINGS, count: 160, speed: 0.1 });
  assert.deepEqual(normalizeSettings({ count: NaN, speed: Infinity, color: '#FFAA00', paused: true }), { ...DEFAULT_SETTINGS, color: '#ffaa00', paused: true });
  assert.equal(normalizeSettings({ count: 50.6 }).count, 51);
});

test('particle creation is bounded and can be reproduced with a supplied random source', () => {
  assert.equal(createParticles(100000).length, 160);
  const particles = createParticles(16, () => 0.5);
  assert.equal(particles.length, 16);
  for (const p of particles) { assert.equal(p.x, 0.5); assert.equal(p.y, 0.5); assert.ok(p.vx < 0); }
});

test('motion reflects at the field boundary and does not mutate its input', () => {
  const particle = { x: 0.999, y: 0.001, vx: 0.05, vy: -0.05, radius: 2 };
  const before = { ...particle };
  const [next] = stepParticles([particle], 0.05, 2);
  assert.ok(next.x < 1 && next.x >= 0);
  assert.ok(next.y > 0 && next.y <= 1);
  assert.ok(next.vx < 0 && next.vy > 0);
  assert.deepEqual(particle, before);
});

test('background time does not cause a large simulation jump', () => {
  const particle = { x: 0.5, y: 0.5, vx: 0.05, vy: 0.025, radius: 2 };
  assert.deepEqual(stepParticles([particle], 120, 1), stepParticles([particle], 0.05, 1));
  assert.deepEqual(stepParticles([particle], 0, 1), [particle]);
  assert.deepEqual(stepParticles([particle], -1, 1), [particle]);
});
