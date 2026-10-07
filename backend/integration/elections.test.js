// Requires an explicitly selected disposable MySQL server with CREATE DATABASE rights.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { createApp } = require('../app');
const { rebuildSummaries } = require('../services/rebuildSummaries');
const { optionalNumber } = require('../domain/electionResults');
const { records } = require('../test/fixtures/source-results.json');
let db, server, base;
const database = `election_test_${process.pid}_${Date.now()}`;
before(async () => {
  assert.ok(process.env.TEST_DB_PORT && process.env.TEST_DB_PASSWORD, 'Set TEST_DB_PORT and TEST_DB_PASSWORD for a disposable MySQL server');
  db = await mysql.createConnection({ host: process.env.TEST_DB_HOST || '127.0.0.1', port: Number(process.env.TEST_DB_PORT), user: 'root', password: process.env.TEST_DB_PASSWORD, multipleStatements: true, dateStrings: ['DATE'] });
  await db.query(`CREATE DATABASE \`${database}\``);
  const schema = fs.readFileSync(path.join(__dirname, '../../db/schema.sql'), 'utf8').replaceAll('USE election_db;', `USE \`${database}\`;`);
  await db.query(schema);
  await db.query(schema); // Initialization remains repeatable.
  for (const row of records) {
    await db.execute('INSERT INTO ge_candidate_results (year, constituency, constituency_type, party, candidates, vote_count) VALUES (?, ?, ?, ?, ?, ?)', [row.year, row.constituency, row.constituency_type, row.party, row.candidates, optionalNumber(row.vote_count)]);
  }
  // Synthetic incomplete and tied contests; names intentionally overlap across years.
  for (const [year, area, party, votes] of [[2020, 'Example', 'A', 50], [2020, 'Example', 'B', 50], [2025, 'Example', 'A', 60], [2025, 'Example', 'B', null]]) {
    await db.execute('INSERT INTO ge_candidate_results (year, constituency, constituency_type, party, candidates, vote_count) VALUES (?, ?, ?, ?, ?, ?)', [year, area, 'SMC', party, party, votes]);
  }
  await db.query("INSERT INTO ge_elector_stats VALUES (2025, 'Aljunied', 144298, 1342, 80, DEFAULT, DEFAULT)");
  await db.query("INSERT INTO political_parties (abbreviation, political_party) VALUES ('PAP', 'People''s Action Party'), ('WP', 'Workers'' Party')");
  await db.query("INSERT INTO ge_dates (year, polling_day) VALUES (2025, '2025-05-03')");
  assert.equal(await rebuildSummaries(db), 8);
  server = createApp({ pool: db, config: { origins: [] } }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (db) { await db.query(`DROP DATABASE IF EXISTS \`${database}\``); await db.end(); }
});
async function get(route, params = {}) {
  const response = await fetch(`${base}/api/${route}?${new URLSearchParams(params)}`);
  assert.equal(response.status, 200);
  return response.json();
}
async function search(params) { return (await get('dashboard/search', params)).rows; }

test('real SQL preserves OR within each filter and AND between filters', async () => {
  const rows = await search({}); assert.equal(rows.length, 8);
  assert.equal(rows[0].year, 2025); assert.equal(rows[0].constituency, 'Aljunied');
  assert.equal((await search({ years: '2020,2025' })).length, 5);
  assert.equal((await search({ years: '2025', winners: 'PAP,WP', types: 'GRC' })).length, 2);
  assert.equal((await search({ years: '2025', types: 'SMC', winners: 'WP' }))[0].constituency, 'Hougang');
  assert.equal((await search({ years: '2025', contesting: 'WP,SUP', winners: 'PAP' }))[0].constituency, 'Ang Mo Kio');
  assert.equal((await search({ years: '2025', contesting: 'SUP', winners: 'WP' })).length, 0);
  assert.equal((await search({ constituencies: 'Example', years: '2020' })).length, 1);
  assert.equal((await search({ q: 'Farrer' }))[0].constituency, 'Farrer Park');
  assert.equal((await search({ winners: "PAP') OR 1=1 --" })).length, 0);
  assert.equal((await search({ years: '', winners: '' })).length, 8);
});
test('search, details and map agree on corrected winners, walkovers, ties and missing values', async () => {
  for (const [year, constituency, winner, outcome] of [[1959, 'Siglap', 'PAP', 'contested'], [1959, 'Farrer Park', 'Independent', 'contested'], [2011, 'Tanjong Pagar', 'PAP', 'walkover'], [2020, 'Example', null, 'tie'], [2025, 'Example', null, 'unavailable']]) {
    const [row] = await search({ years: year, constituencies: constituency });
    const detail = await get('dashboard/details', { year, constituency });
    const { summary } = await get('boundaries/summary', { year });
    const map = summary[constituency.toUpperCase() + (row.constituency_type ? ` ${row.constituency_type}` : '')];
    assert.equal(row.winner_party, winner); assert.equal(detail.winner_party, winner);
    assert.equal(map.winnerParty, winner?.toUpperCase() ?? null);
    assert.equal(row.outcome, outcome); assert.equal(detail.outcome, outcome); assert.equal(map.outcome, outcome);
    if (outcome === 'walkover' || outcome === 'unavailable') {
      assert.equal(row.margin_pct, null); assert.equal(map.winnerVotePct, null);
      assert.ok(detail.parties.every(party => party.vote_share === null));
    }
  }
  const detail = await get('dashboard/details', { year: 1959, constituency: 'Farrer Park' });
  assert.equal(detail.parties.filter(party => party.party === 'Independent').length, 4);
  const [aljunied] = await search({ years: 2025, constituencies: 'Aljunied' });
  assert.ok(Math.abs(aljunied.turnout_pct - 134067 / 144298 * 100) < 0.0001);
});
test('options include historical source labels and stable calendar dates', async () => {
  const options = await get('dashboard/options');
  assert.ok(options.parties.some(party => party.abbreviation === 'Independent'));
  assert.equal(options.election_dates[0].polling_day, '2025-05-03');
});
test('a failed rebuild rolls back both derived tables; reruns are idempotent', async () => {
  const before = await search({});
  const [ranks] = await db.query('SELECT year, constituency, party, rank_no FROM ge_top_parties ORDER BY year, constituency, party');
  await db.query("CREATE TRIGGER fail_summary BEFORE INSERT ON ge_summary FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'injected test failure'");
  await assert.rejects(rebuildSummaries(db), /injected test failure/);
  assert.deepEqual(await search({}), before);
  const [afterRanks] = await db.query('SELECT year, constituency, party, rank_no FROM ge_top_parties ORDER BY year, constituency, party');
  assert.deepEqual(afterRanks, ranks);
  await db.query('DROP TRIGGER fail_summary');
  await rebuildSummaries(db);
  assert.deepEqual(await search({}), before);
});
