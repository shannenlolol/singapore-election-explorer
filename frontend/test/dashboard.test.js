import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyFilters, searchQuery, formatPercent, formatNumber, splitCandidates, sortRows, rowKey } from '../src/features/dashboard/model.js';

test('empty filters omit query constraints, selecting all results', () => {
  assert.equal(searchQuery(emptyFilters()), '');
});
test('multi-select filters retain the API CSV contract and encode constituency names', () => {
  const params = new URLSearchParams(searchQuery({ ...emptyFilters(), years: ['2020', '2025', '2020'], winners: ['WP'], contesting: ['WP', 'PAP'], constituencies: ['Ang Mo Kio'] }));
  assert.equal(params.get('years'), '2020,2025');
  assert.equal(params.get('contesting'), 'WP,PAP');
  assert.equal(params.get('winners'), 'WP');
  assert.equal(params.get('constituencies'), 'Ang Mo Kio');
  assert.equal(params.has('types'), false);
});
test('margin percentage points and fractional vote shares use the API units', () => {
  assert.equal(formatPercent(19.42), '19.420%');
  assert.equal(formatPercent(0.5971, 2, 100), '59.71%');
  assert.equal(formatPercent(0), '0.000%');
  assert.equal(formatPercent(null), '—');
  assert.equal(formatPercent(undefined), '—');
  assert.equal(formatNumber(null), '—');
  assert.equal(formatNumber(0), '0');
});
test('candidate delimiters support semicolon and pipe delimiters', () => {
  assert.deepEqual(splitCandidates(' Alice ; Bob | Carol ;; '), ['Alice', 'Bob', 'Carol']);
  assert.deepEqual(splitCandidates(null), []);
});
test('numeric sorting handles margins correctly, preserves input, and puts nulls last', () => {
  const rows = [{ margin_pct: 100 }, { margin_pct: null }, { margin_pct: 9 }, { margin_pct: 0 }];
  assert.deepEqual(sortRows(rows, 'margin_pct', 'asc').map(r => r.margin_pct), [0, 9, 100, null]);
  assert.deepEqual(sortRows(rows, 'margin_pct', 'desc').map(r => r.margin_pct), [100, 9, 0, null]);
  assert.equal(rows[0].margin_pct, 100);
});
test('constituency selection identifies the year as well as name', () => {
  assert.notEqual(rowKey({ year: 2020, constituency: 'Hougang' }), rowKey({ year: 2025, constituency: 'Hougang' }));
});
