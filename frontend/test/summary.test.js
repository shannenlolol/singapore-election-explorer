import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeResults, formatElectionDate, partyColor } from '../src/features/dashboard/summaryModel.js';

test('summary counts constituency wins, never GRC candidates or seats', () => {
  const rows = [{ year: 2020, winner_party: 'WP', constituency_type: 'GRC', seats: 5 }, { year: 2020, winner_party: 'PAP', constituency_type: 'SMC' }, { year: 2025, winner_party: 'WP', constituency_type: 'GRC' }];
  const result = summarizeResults(rows);
  assert.equal(result.total, 3);
  assert.deepEqual(result.ranked, [{ party: 'WP', count: 2 }, { party: 'PAP', count: 1 }]);
  assert.deepEqual(result.yearly.map(row => [row.year, row.total]), [[2020, 2], [2025, 1]]);
  assert.equal(result.yearly[0].counts.WP, 1);
});
test('top 12 plus Others conserves all results and yearly counts keep every party', () => {
  const rows = Array.from({ length: 15 }, (_, index) => ({ year: 2025, winner_party: `P${index}` }));
  const summary = summarizeResults(rows);
  assert.equal(summary.bars.length, 13);
  assert.deepEqual(summary.bars.at(-1), { party: 'Others', count: 3 });
  assert.equal(summary.bars.reduce((sum, row) => sum + row.count, 0), 15);
  assert.equal(Object.keys(summary.yearly[0].counts).length, 15);
});
test('missing winner is explicit and missing years do not disappear from overall totals', () => {
  const summary = summarizeResults([{ year: null, winner_party: 'PAP' }, { year: 2025, winner_party: null }, { year: 'invalid', winner_party: '' }]);
  assert.equal(summary.total, 3);
  assert.equal(summary.unknownYears, 2);
  assert.deepEqual(summary.ranked[0], { party: '—', count: 2 });
  assert.equal(summary.yearly[0].counts['—'], 1);
});
test('empty data produces no fabricated years or winners', () => {
  const summary = summarizeResults([]);
  assert.equal(summary.total, 0);
  assert.deepEqual(summary.bars, []);
  assert.deepEqual(summary.yearly, []);
});
test('dates display the Singapore calendar date with explicit missing values', () => {
  assert.equal(formatElectionDate('2025-04-22T16:00:00.000Z'), '23 Apr 2025');
  assert.equal(formatElectionDate('2025-05-03'), '3 May 2025');
  assert.equal(formatElectionDate(null), '—');
  assert.equal(formatElectionDate('not-a-date'), '—');
});
test('party colours stay consistent across repeated renders', () => {
  assert.equal(partyColor('WP'), '#3182ce');
  assert.equal(partyColor('Historical party'), partyColor('Historical party'));
});
