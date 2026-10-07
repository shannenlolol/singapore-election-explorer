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
