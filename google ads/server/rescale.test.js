import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distribute } from './rescale.js';
import { parseInput, formatValue, withDerived, sumRows } from '../shared/metrics.js';

const sum = (a) => a.reduce((x, y) => x + y, 0);

test('distribute hits the target exactly and keeps proportions', () => {
  const parts = distribute([10, 20, 30, 40], 1001);
  assert.equal(sum(parts), 1001);
  assert.ok(parts[3] > parts[0]);
});

test('distribute spreads evenly over empty or zero rows', () => {
  assert.deepEqual(distribute([null, 0, null], 10), [4, 3, 3]);
});

test('distribute handles large totals without precision loss', () => {
  const parts = distribute([123456789, 987654321, 5], 999999999999999);
  assert.equal(sum(parts), 999999999999999);
});

test('distribute to zero', () => {
  assert.deepEqual(distribute([5, 6], 0), [0, 0]);
});

test('parseInput accepts digits only', () => {
  assert.equal(parseInput('impressions', '1200'), 1200);
  assert.equal(parseInput('impressions', '12a'), undefined);
  assert.equal(parseInput('impressions', '1.5'), undefined);
  assert.equal(parseInput('cost', '12.3'), 1230);
  assert.equal(parseInput('cost', '$12'), undefined);
  assert.equal(parseInput('cost', ''), null);
});

test('formulas and totals', () => {
  const d = withDerived({ impressions: 1000, clicks: 50, cost: 2500, conversions: 500 });
  assert.equal(formatValue('ctr', d.ctr), '5.00%');
  assert.equal(formatValue('avgCpc', d.avgCpc), '$0.50');
  assert.equal(formatValue('convRate', d.convRate), '10.00%');
  assert.equal(formatValue('costPerConv', d.costPerConv), '$5.00');
  assert.equal(formatValue('ctr', withDerived({ impressions: 0, clicks: 0 }).ctr), '–');
  const t = sumRows([{ cost: 100 }, { cost: null }, { cost: 50 }]);
  assert.equal(t.cost, 150);
  assert.equal(sumRows([{ cost: null }]).cost, null);
});

test('solveMetric turns calculated columns into stored totals', async () => {
  const { solveMetric, parseInput } = await import('../shared/metrics.js');
  const s = { impressions: 1000, clicks: 50, cost: 2500, conversions: 500 };
  assert.deepEqual(solveMetric('ctr', parseInput('ctr', '5.25'), s), { base: 'clicks', total: 53 });
  assert.deepEqual(solveMetric('avgCpc', parseInput('avgCpc', '0.40'), s), { base: 'cost', total: 2000 });
  assert.deepEqual(solveMetric('avgCpm', parseInput('avgCpm', '3.00'), s), { base: 'cost', total: 300 });
  assert.deepEqual(solveMetric('convRate', parseInput('convRate', '10'), s), { base: 'conversions', total: 500 });
  assert.deepEqual(solveMetric('costPerConv', parseInput('costPerConv', '2.50'), s), { base: 'conversions', total: 1000 });
  assert.deepEqual(solveMetric('interactions', 70, s), { base: 'clicks', total: 70 });
  assert.ok(solveMetric('ctr', 1.5, s).error);
  assert.ok(solveMetric('ctr', 0.05, { ...s, impressions: 0 }).error);
  assert.deepEqual(solveMetric('convValueCostPlatform', parseInput('convValueCostPlatform', '250'), s), { base: 'convValue', total: 6250 });
  assert.ok(solveMetric('convValueCostPlatform', 1, { ...s, cost: 0 }).error);
  assert.ok(solveMetric('optScore', 1, s).error);
  assert.equal(parseInput('ctr', '5a'), undefined);
});
