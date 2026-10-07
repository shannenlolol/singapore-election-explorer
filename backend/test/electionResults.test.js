const { test } = require('node:test');
const assert = require('node:assert/strict');
const { analyseContest, optionalNumber } = require('../domain/electionResults');
const { records } = require('./fixtures/source-results.json');
const contest = (year, name) => records.filter(row => Number(row.year) === year && row.constituency === name);
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} != ${expected}`);

test('GRC totals count each team once and turnout excludes spoilt replacements', () => {
  const result = analyseContest(contest(2025, 'Aljunied'), { no_of_registered_electors: 144298, no_of_rejected_votes: 1342, no_of_spoilt_ballot_papers: 80 });
  assert.equal(result.winner_party, 'WP');
  assert.equal(result.contestants[0].vote_count, 79254);
  close(result.margin_pct, (79254 - 53471) / 132725 * 100);
  close(result.turnout_pct, (132725 + 1342) / 144298 * 100);
  close(result.contestants.reduce((sum, row) => sum + row.vote_share, 0), 1);
});
test('independents compete individually, preserving Siglap winner and Farrer Park margin', () => {
  const siglap = analyseContest(contest(1959, 'Siglap'));
  assert.equal(siglap.winner_party, 'PAP');
  const farrer = analyseContest(contest(1959, 'Farrer Park'));
  assert.equal(farrer.winner_party, 'Independent');
  assert.equal(farrer.contestants.filter(row => row.party === 'Independent').length, 4);
  close(farrer.margin_pct, (4077 - 3832) / (4077 + 311 + 147 + 789 + 3832) * 100);
});
test('multi-party GRC margin uses runner-up rather than combined opposition', () => {
  const result = analyseContest(contest(2025, 'Ang Mo Kio'));
  assert.equal(result.winner_party, 'PAP');
  assert.equal(result.contestants.length, 3);
  close(result.margin_pct, (115562 - 15874) / (115562 + 15874 + 14929) * 100);
});
test('walkovers retain sole party but have no vote share, margin, or turnout', () => {
  const result = analyseContest(contest(2011, 'Tanjong Pagar'));
  assert.equal(result.outcome, 'walkover');
  assert.equal(result.winner_party, 'PAP');
  for (const field of ['margin_pct', 'turnout_pct']) assert.equal(result[field], null);
  assert.equal(result.contestants[0].vote_count, null);
  assert.equal(result.contestants[0].vote_share, null);
});
test('synthetic ties, partial totals, zero totals, and missing electors never invent winners or turnout', () => {
  const row = (party, votes) => ({ party, vote_count: votes });
  const tied = analyseContest([row('A', 50), row('B', 50)]);
  assert.equal(tied.outcome, 'tie'); assert.equal(tied.winner_party, null); assert.equal(tied.margin_pct, 0);
  for (const votes of [null, '', 'na']) {
    const result = analyseContest([row('A', 50), row('B', votes)]);
    assert.equal(result.outcome, 'unavailable'); assert.equal(result.winner_party, null);
    assert.ok(result.contestants.every(row => row.vote_share === null));
  }
  assert.equal(analyseContest([row('A', 0), row('B', 0)]).winner_party, null);
  for (const elector of [{}, { no_of_registered_electors: 200 }, { no_of_registered_electors: 80, no_of_rejected_votes: 0 }]) {
    assert.equal(analyseContest([row('A', 60), row('B', 40)], elector).turnout_pct, null);
  }
  for (const value of [null, undefined, '', ' ', 'na', -1, Infinity]) assert.equal(optionalNumber(value), null);
  assert.equal(optionalNumber('0'), 0);
});
