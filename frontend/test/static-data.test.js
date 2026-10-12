import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMeta, buildOptions, buildResults, formatJson, hashFiles, mergeManualAdditions, normaliseCandidateRows, shrinkGeoJson } from '../scripts/lib/staticData.mjs';
import { buildMapSummary, constituencyKey } from '../src/features/map/mapSummary.js';

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

// Contract between results.json and the map: the browser derives the map summary from built rows.
test('map summary keys match boundary names and pools party shares but not the winner share', () => {
  // vote_share is stored to 6 dp, so percentages agree to about 4 dp.
  const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.0001, `${actual} != ${expected}`);
  assert.equal(constituencyKey('Aljunied', 'GRC'), 'ALJUNIED GRC');
  assert.equal(constituencyKey('Bukit Panjang SMC', 'SMC'), 'BUKIT PANJANG SMC');
  assert.equal(constituencyKey('Farrer Park', null), 'FARRER PARK');
  const map2025 = buildMapSummary(results, 2025);
  assert.deepEqual(map2025.parties, ['PAP', 'WP']);
  assert.equal(map2025.summary['ALJUNIED GRC'].winnerParty, 'WP');
  assert.equal(map2025.summary['MARINE PARADE-BRADDELL HEIGHTS GRC'].parties.PAP.votePct, null);
  const farrer = buildMapSummary(results, 1959).summary['FARRER PARK'];
  assert.equal(farrer.winnerParty, 'INDEPENDENT');
  close(farrer.parties.INDEPENDENT.votePct, (4077 + 311) / 8220 * 100);
  close(farrer.winnerVotePct, 4077 / 8220 * 100);
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
  const files = { 'a.json': '1', 'b.json': '2' };
  const previous = { updatedAt: '2026-01-01T00:00:00.000Z', contentHash: hash };
  const now = new Date('2026-10-12T00:00:00Z');
  assert.equal(buildMeta(previous, files, now).updatedAt, previous.updatedAt);
  assert.equal(buildMeta(previous, { ...files, 'b.json': '3' }, now).updatedAt, now.toISOString());
  assert.equal(buildMeta(null, files, now).updatedAt, now.toISOString());
});

test('meta lists boundary years from the boundary files, newest first', () => {
  const files = { 'results.json': '[]', 'boundaries-2006.json': '{}', 'boundaries-2025.json': '{}', 'boundaries-2015.json': '{}', 'boundaries-notes.json': '{}' };
  assert.deepEqual(buildMeta(null, files).boundaryYears, [2025, 2015, 2006]);
  assert.deepEqual(buildMeta(null, { 'results.json': '[]' }).boundaryYears, []);
});

test('boundaries are rounded to 5 dp with duplicate points and unused properties removed', () => {
  const square = [[103.123456, 1.234561, 0], [103.123459, 1.234559, 0], [103.2, 1.23456], [103.2, 1.3], [103.123456, 1.234561, 0]];
  const sliver = [[103.1, 1.1], [103.100001, 1.1], [103.1, 1.100001], [103.1, 1.1]];
  const shrunk = shrinkGeoJson({
    type: 'FeatureCollection', name: 'source', crs: { type: 'name' },
    features: [
      { type: 'Feature', properties: { ED_DESC: 'WEST COAST   ', OBJECTID: '13', 'SHAPE.AREA': '1' }, geometry: { type: 'Polygon', coordinates: [square, sliver] } },
      { type: 'Feature', properties: { ED_DESC_FU: 'ALJUNIED GRC', Name: 'ALJUNIED' }, geometry: { type: 'MultiPolygon', coordinates: [[square], [sliver]] } },
    ],
  });
  const ring = [[103.12346, 1.23456], [103.2, 1.23456], [103.2, 1.3], [103.12346, 1.23456]];
  assert.deepEqual(shrunk, {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { ED_DESC: 'WEST COAST' }, geometry: { type: 'Polygon', coordinates: [ring] } },
      // A part that collapses to a point is dropped; a single remaining part becomes a Polygon.
      { type: 'Feature', properties: { ED_DESC_FU: 'ALJUNIED GRC', Name: 'ALJUNIED' }, geometry: { type: 'Polygon', coordinates: [ring] } },
    ],
  });
});

test('a boundary that collapses entirely is an error, not a silent gap on the map', () => {
  const sliver = [[103.1, 1.1], [103.100001, 1.1], [103.1, 1.100001], [103.1, 1.1]];
  assert.throws(() => shrinkGeoJson({ type: 'FeatureCollection', features: [{ properties: { Name: 'TINY' }, geometry: { type: 'Polygon', coordinates: [sliver] } }] }), /TINY/);
});

const walkover = { year: 2025, constituency: 'Marine Parade-Braddell Heights', constituency_type: 'GRC', candidates: 'Team PAP', party: 'PAP', vote_count: null, source: 'https://www.eld.gov.sg/finalresults2025.html' };
// The shared fixture already contains this contest, so these tests start without it.
const sourceWithoutWalkover = source.filter(record => !record.constituency.startsWith('Marine Parade'));
const walkoverElectors = { year: 2025, constituency: 'Marine Parade-Braddell Heights', no_of_registered_electors: 131820, source: 'https://www.eld.gov.sg/finalresults2025.html' };

test('a manual addition fills a contest missing from the source', () => {
  const merged = mergeManualAdditions({ resultRecords: sourceWithoutWalkover, electorRecords: electors }, { results: [walkover], electors: [walkoverElectors] });
  const row = buildResults(normaliseCandidateRows(merged.resultRecords), merged.electorRecords).find(result => result.constituency === walkover.constituency);
  assert.equal(row.outcome, 'walkover');
  assert.equal(row.winner_party, 'PAP');
  assert.equal(row.elector.no_of_registered_electors, 131820);
  assert.equal(buildMapSummary([row], 2025).summary['MARINE PARADE-BRADDELL HEIGHTS GRC'].outcome, 'walkover');
});

test('once the source publishes a contest, its rows win and the stale addition is dropped from the file', () => {
  const published = [...sourceWithoutWalkover, { year: '2025', constituency: 'MARINE PARADE-BRADDELL HEIGHTS ', candidates: 'Official team', party: 'PAP', vote_count: 'na' }];
  const additions = { description: 'kept', results: [walkover], electors: [walkoverElectors] };
  const merged = mergeManualAdditions({ resultRecords: published, electorRecords: electors }, additions);
  // Never mixed: only the official row for that contest survives.
  const rows = normaliseCandidateRows(merged.resultRecords).filter(row => row.constituency.toUpperCase().startsWith('MARINE PARADE'));
  assert.deepEqual(rows.map(row => row.candidates), ['Official team']);
  assert.deepEqual(merged.stale, ['results for 2025 Marine Parade-Braddell Heights']);
  // Results and electors go stale independently; the file keeps everything else as it was.
  assert.deepEqual(merged.remaining, { description: 'kept', results: [], electors: [walkoverElectors] });
  assert.deepEqual(additions.results, [walkover]);
});

test('a manual addition must cite a source', () => {
  assert.throws(() => mergeManualAdditions({ resultRecords: source, electorRecords: [] }, { results: [{ ...walkover, source: ' ' }], electors: [] }), /must cite a source/);
});

test('the committed manual-additions.json is valid and only adds missing contests', () => {
  const additions = JSON.parse(readFileSync(new URL('../scripts/manual-additions.json', import.meta.url), 'utf8'));
  const merged = mergeManualAdditions({ resultRecords: sourceWithoutWalkover, electorRecords: electors }, additions);
  assert.equal(normaliseCandidateRows(merged.resultRecords).length, normaliseCandidateRows(sourceWithoutWalkover).length + additions.results.length);
  assert.deepEqual(merged.stale, []);
  // The build rewrites this file when pruning, so its hand-written layout must match JSON.stringify.
  assert.equal(readFileSync(new URL('../scripts/manual-additions.json', import.meta.url), 'utf8'), `${JSON.stringify(additions, null, 2)}\n`);
  for (const addition of [...additions.results, ...additions.electors]) assert.match(addition.source, /^https:\/\/www\.eld\.gov\.sg\//);
});
