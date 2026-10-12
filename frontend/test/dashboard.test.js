import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyFilters, filterResults, searchQuery, formatPercent, formatNumber, splitCandidates, sortRows, rowKey } from '../src/features/dashboard/model.js';

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

// Shaped like results.json rows: contested, walkover and tied contests across years and types.
const searchRows = [
  { year: 2025, constituency: 'Aljunied', constituency_type: 'GRC', outcome: 'contested', winner_party: 'WP', contesting_parties: 'PAP,WP' },
  { year: 2025, constituency: 'Marine Parade-Braddell Heights', constituency_type: 'GRC', outcome: 'walkover', winner_party: 'PAP', contesting_parties: 'PAP' },
  { year: 2020, constituency: 'Aljunied', constituency_type: 'GRC', outcome: 'contested', winner_party: 'WP', contesting_parties: 'PAP,WP' },
  { year: 2020, constituency: 'Bukit Panjang', constituency_type: 'SMC', outcome: 'contested', winner_party: 'PAP', contesting_parties: 'PAP,SDP' },
  { year: 1963, constituency: 'Tied Town', constituency_type: null, outcome: 'tie', winner_party: null, contesting_parties: 'A,B' },
];
const names = rows => rows.map(row => `${row.year} ${row.constituency}`);

test('no filters return every row, in order and without the old 800-row cap', () => {
  assert.deepEqual(filterResults(searchRows, emptyFilters()), searchRows);
  const many = Array.from({ length: 900 }, (_, index) => ({ ...searchRows[0], constituency: `Area ${index}` }));
  assert.equal(filterResults(many, emptyFilters()).length, 900);
});

test('values within a filter are OR-ed and different filters are AND-ed', () => {
  assert.deepEqual(names(filterResults(searchRows, { years: ['2020', '1963'] })), ['2020 Aljunied', '2020 Bukit Panjang', '1963 Tied Town']);
  assert.deepEqual(names(filterResults(searchRows, { years: ['2020'], types: ['SMC'] })), ['2020 Bukit Panjang']);
  assert.deepEqual(names(filterResults(searchRows, { winners: ['WP'], years: ['2025'] })), ['2025 Aljunied']);
  assert.deepEqual(names(filterResults(searchRows, { constituencies: ['Aljunied'] })), ['2025 Aljunied', '2020 Aljunied']);
  assert.deepEqual(filterResults(searchRows, { years: ['2015'] }), []);
});

test('contesting party matches any selected party, as whole party names', () => {
  assert.deepEqual(names(filterResults(searchRows, { contesting: ['SDP', 'B'] })), ['2020 Bukit Panjang', '1963 Tied Town']);
  // "P" must not match "PAP", as FIND_IN_SET never did.
  assert.deepEqual(filterResults(searchRows, { contesting: ['P'] }), []);
});

test('walkovers and ties are kept: walkovers by their sole party, ties only without a winner filter', () => {
  assert.deepEqual(names(filterResults(searchRows, { contesting: ['PAP'], years: ['2025'] })), ['2025 Aljunied', '2025 Marine Parade-Braddell Heights']);
  assert.ok(names(filterResults(searchRows, { winners: ['PAP'] })).includes('2025 Marine Parade-Braddell Heights'));
  assert.deepEqual(names(filterResults(searchRows, { contesting: ['A'] })), ['1963 Tied Town']);
  assert.ok(!filterResults(searchRows, { winners: ['A', 'B'] }).length);
});

test('constituency text search is a case-insensitive contains match', () => {
  assert.deepEqual(names(filterResults(searchRows, { q: '  BRADDELL ' })), ['2025 Marine Parade-Braddell Heights']);
  assert.deepEqual(names(filterResults(searchRows, { q: 'jun' })), ['2025 Aljunied', '2020 Aljunied']);
});
