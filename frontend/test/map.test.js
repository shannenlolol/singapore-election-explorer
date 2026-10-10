import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getWinnerPct, formatVotePct } from '../src/features/map/resultModel.js';

test('map shading uses the winning contestant rather than pooled independent votes', () => {
  const entry = { winnerParty: 'INDEPENDENT', winnerVotePct: 44.52, parties: { INDEPENDENT: { votePct: 58.15 } } };
  assert.equal(getWinnerPct(entry), 44.52);
  assert.equal(getWinnerPct({ ...entry, winnerVotePct: null }), null);
  assert.equal(getWinnerPct({ ...entry, winnerParty: null }), null);
});
test('map percentages preserve missing data and real zeros', () => {
  for (const value of [null, undefined, '', 'na']) assert.equal(formatVotePct(value), 'Unavailable');
  assert.equal(formatVotePct(0), '0.00%');
  assert.equal(formatVotePct(59.71), '59.71%');
  assert.equal(getWinnerPct({ winnerParty: 'PAP', parties: { PAP: { votePct: null } } }), null);
});

import { getBoundaryName, normaliseConstituencyKey, getBoundaryResult, getBoundaryType } from '../src/features/map/boundaryModel.js';

test('historical boundary names resolve to results and constituency types across dataset formats', () => {
  const grc = { constituencyType: 'GRC', winnerParty: 'PAP', winnerVotePct: 65, parties: { PAP: { votePct: 65 } } };
  const smc = { constituencyType: 'SMC', winnerParty: 'WP', winnerVotePct: 60, parties: { WP: { votePct: 60 } } };
  const summary = new Map([['WEST COAST GRC', grc], ['HOUGANG SMC', smc], ['BISHAN-TOA PAYOH GRC', grc]]);
  for (const [properties, expected] of [
    [{ ED_DESC: 'WEST COAST                                        ' }, grc], // 2006
    [{ ED_DESC: 'BISHAN - TOA PAYOH' }, grc], // 2006 hyphen spacing
    [{ ED_DESC: 'WEST COAST' }, grc], // 2011
    [{ ED_DESC: 'HOUGANG' }, smc], // 2015
    [{ Name: 'HOUGANG', ED_DESC: 'HOUGANG' }, smc], // 2020
    [{ ED_DESC_FU: 'HOUGANG SMC', ED_DESC: 'HOUGANG' }, smc], // 2025
  ]) {
    const result = getBoundaryResult(properties, summary);
    assert.equal(result, expected);
    assert.equal(getBoundaryType(properties, result), expected.constituencyType);
    assert.equal(getWinnerPct(result), expected.winnerVotePct);
    assert.ok(result.parties[expected.winnerParty]);
  }
});

test('boundary matching normalizes case, whitespace and dash variants consistently', () => {
  assert.equal(normaliseConstituencyKey('  Bishan – Toa  Payoh GRC '), 'BISHAN-TOA PAYOH GRC');
  assert.equal(getBoundaryName({ Name: ' HOUGANG ' }), 'HOUGANG');
  assert.equal(getBoundaryName({}), 'Unknown');
});

test('boundary matching preserves missing results and refuses ambiguous or conflicting suffixes', () => {
  const summary = new Map([['AREA SMC', { constituencyType: 'SMC' }], ['AREA GRC', { constituencyType: 'GRC' }]]);
  assert.equal(getBoundaryResult({ ED_DESC: 'AREA' }, summary), null);
  assert.equal(getBoundaryResult({ ED_DESC: 'MISSING' }, summary), null);
  assert.equal(getBoundaryType({ ED_DESC: 'MISSING' }, null), '');
  assert.equal(getBoundaryResult({ ED_DESC_FU: 'AREA GRC' }, summary), summary.get('AREA GRC'));
  assert.equal(getBoundaryResult({ ED_DESC_FU: 'AREA GRC' }, new Map([['AREA SMC', {}]])), null);
  assert.equal(getBoundaryType({ ED_DESC_FU: 'MARINE PARADE-BRADDELL HEIGHTS GRC' }, null), 'GRC');
});
