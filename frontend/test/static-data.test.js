import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMapSummary, buildMeta, buildOptions, buildResults, constituencyKey, formatJson, hashFiles, normaliseCandidateRows } from '../scripts/lib/staticData.mjs';

// Raw records arrive from data.gov.sg as strings, with "na" types for older years.
const source = [
  { year: '2025', constituency: 'Aljunied', constituency_type: 'GRC', candidates: 'Team WP', party: 'WP', vote_count: '79254' },
  { year: '2025', constituency: 'Aljunied', constituency_type: 'GRC', candidates: 'Team PAP', party: 'PAP', vote_count: '53471' },
  { year: '2025', constituency: ' Aljunied ', constituency_type: 'GRC', candidates: 'Team PAP', party: 'PAP', vote_count: '53471' },
  { year: '2025', constituency: 'Marine Parade-Braddell Heights', constituency_type: 'GRC', candidates: 'Team PAP', party: 'PAP', vote_count: '' },
  { year: '1959', constituency: 'Farrer Park', constituency_type: 'na', candidates: 'A', party: 'Independent', vote_count: '4077' },
  { year: '1959', constituency: 'Farrer Park', constituency_type: 'na', candidates: 'B', party: 'Independent', vote_count: '311' },
  { year: '1959', constituency: 'Farrer Park', constituency_type: 'na', candidates: 'C', party: 'PAP', vote_count: '3832' },
  { year: '1963', constituency: 'Tied', constituency_type: 'SMC', candidates: 'X', party: 'A', vote_count: '100' },
  { year: '1963', constituency: 'Tied', constituency_type: 'SMC', candidates: 'Y', party: 'B', vote_count: '100' },
  { year: '', constituency: 'No year', party: 'PAP' },
  { year: '2025', constituency: 'No party', party: ' ' },
];
const electors = [{ year: '2025', constituency: 'Aljunied', no_of_registered_electors: '144298', no_of_rejected_votes: '1342', no_of_spoilt_ballot_papers: '80' }];
const candidateRows = normaliseCandidateRows(source);
const results = buildResults(candidateRows, electors);
const find = (year, name) => results.find(row => row.year === year && row.constituency === name);

test('normalising trims, drops incomplete rows and keeps one copy of a duplicate', () => {
  assert.equal(candidateRows.length, 8);
  assert.equal(candidateRows.filter(row => row.constituency === 'Aljunied' && row.party === 'PAP').length, 1);
});

test('results have one row per contest, newest year first, with API outcomes', () => {
  assert.deepEqual(results.map(row => [row.year, row.constituency]), [[2025, 'Aljunied'], [2025, 'Marine Parade-Braddell Heights'], [1963, 'Tied'], [1959, 'Farrer Park']]);
  assert.deepEqual(results.map(row => row.outcome), ['contested', 'walkover', 'tie', 'contested']);
  assert.equal(find(2025, 'Marine Parade-Braddell Heights').winner_party, 'PAP');
  assert.equal(find(1963, 'Tied').winner_party, null);
  assert.equal(find(1963, 'Tied').margin_pct, 0);
});

test('a contest row carries elector stats, rounded figures and contestants for the details panel', () => {
  const aljunied = find(2025, 'Aljunied');
  assert.equal(aljunied.constituency_type, 'GRC');
  assert.equal(aljunied.contesting_parties, 'PAP,WP');
  assert.equal(aljunied.margin_pct, Number(((79254 - 53471) / 132725 * 100).toFixed(4)));
  assert.equal(aljunied.turnout_pct, Number(((132725 + 1342) / 144298 * 100).toFixed(4)));
  assert.deepEqual(aljunied.elector, { no_of_registered_electors: 144298, no_of_rejected_votes: 1342, no_of_spoilt_ballot_papers: 80 });
  assert.deepEqual(aljunied.contestants[0], { party: 'WP', candidates: 'Team WP', vote_count: 79254, vote_share: Number((79254 / 132725).toFixed(6)) });
  assert.equal(find(1959, 'Farrer Park').elector, null);
  assert.equal(find(1959, 'Farrer Park').constituency_type, null);
});

test('options list years, every party label, constituencies and election dates', () => {
  const options = buildOptions({
    results,
    candidateRows,
    partyRecords: [{ abbreviation: 'WP', political_party: "Workers' Party" }, { abbreviation: 'SDP', political_party: 'Singapore Democratic Party' }],
    dateRecords: [{ year: '2025', nomination_day: '2025-04-23', polling_day: '2025-05-03T00:00:00' }, { year: '1959', nomination_day: '', polling_day: '1959-05-30' }],
  });
  assert.deepEqual(options.years, [2025, 1963, 1959]);
  assert.deepEqual(options.parties.map(party => party.abbreviation), ['A', 'B', 'Independent', 'PAP', 'SDP', 'WP']);
  assert.equal(options.parties.find(party => party.abbreviation === 'PAP').full_name, null);
  assert.deepEqual(options.constituencies[0], { year: 2025, constituency: 'Aljunied', constituency_type: 'GRC' });
  assert.deepEqual(options.election_dates, [
    { year: 1959, nomination_day: null, polling_day: '1959-05-30' },
    { year: 2025, nomination_day: '2025-04-23', polling_day: '2025-05-03' },
  ]);
});

test('map summary keys match boundary names and pools party shares but not the winner share', () => {
  assert.equal(constituencyKey('Aljunied', 'GRC'), 'ALJUNIED GRC');
  assert.equal(constituencyKey('Bukit Panjang SMC', 'SMC'), 'BUKIT PANJANG SMC');
  assert.equal(constituencyKey('Farrer Park', null), 'FARRER PARK');
  const map2025 = buildMapSummary(results, 2025);
  assert.deepEqual(map2025.parties, ['PAP', 'WP']);
  assert.equal(map2025.summary['ALJUNIED GRC'].winnerParty, 'WP');
  assert.equal(map2025.summary['MARINE PARADE-BRADDELL HEIGHTS GRC'].parties.PAP.votePct, null);
  const farrer = buildMapSummary(results, 1959).summary['FARRER PARK'];
  assert.equal(farrer.winnerParty, 'INDEPENDENT');
  assert.equal(farrer.parties.INDEPENDENT.votePct, Number(((4077 + 311) / 8220 * 100).toFixed(4)));
  assert.equal(farrer.winnerVotePct, Number((4077 / 8220 * 100).toFixed(4)));
});

test('formatted JSON parses back unchanged with one item per line', () => {
  const value = { year: 2025, list: [{ a: 1 }, { b: 2 }], empty: [], map: { X: { c: 3 } } };
  const formatted = formatJson(value);
  assert.deepEqual(JSON.parse(formatted), value);
  assert.match(formatted, /\n {4}\{"a":1\},\n {4}\{"b":2\}\n/);
  assert.deepEqual(JSON.parse(formatJson(results)), results);
});

test('meta keeps its date when the data is unchanged and moves it when the data changes', () => {
  const hash = hashFiles({ 'a.json': '1', 'b.json': '2' });
  assert.equal(hashFiles({ 'b.json': '2', 'a.json': '1' }), hash);
  assert.notEqual(hashFiles({ 'a.json': '1', 'b.json': '3' }), hash);
  const previous = { updatedAt: '2026-01-01T00:00:00.000Z', contentHash: hash };
  const now = new Date('2026-10-12T00:00:00Z');
  assert.equal(buildMeta(previous, hash, now).updatedAt, previous.updatedAt);
  assert.equal(buildMeta(previous, 'different', now).updatedAt, now.toISOString());
  assert.equal(buildMeta(null, hash, now).updatedAt, now.toISOString());
});
