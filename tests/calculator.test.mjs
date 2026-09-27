import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate } from '../src/calculator.ts';

test('local calculator respects precedence, parentheses and decimal signs', () => {
  assert.equal(calculate('24 × 7'), 168);
  assert.equal(calculate('(2 + 3) * 4'), 20);
  assert.equal(calculate('-2 + .5 * 4'), 0);
  assert.equal(calculate('0.1 + 0.2'), 0.3);
});
test('local arithmetic never executes code and rejects incomplete expressions', () => {
  for (const expression of ['alert(1)', '1/0', '2 +', '(3+2', '2 3', '1'.repeat(161)]) {
    assert.throws(() => calculate(expression));
  }
});
