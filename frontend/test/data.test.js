import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { clearDataCache, loadBoundaries, loadContest, loadMapSummary, loadOptions, loadResults } from '../src/data.js';

const results = [
  { year: 2025, constituency: 'Aljunied', constituency_type: 'GRC', outcome: 'contested', winner_party: 'WP', contestants: [{ party: 'WP', vote_share: 0.6 }, { party: 'PAP', vote_share: 0.4 }] },
  { year: 2020, constituency: 'Aljunied', constituency_type: 'GRC', outcome: 'contested', winner_party: 'WP', contestants: [{ party: 'WP', vote_share: 0.59 }] },
];
const originalFetch = globalThis.fetch;
let requests, failing;
beforeEach(() => {
  requests = []; failing = false;
  clearDataCache();
  globalThis.fetch = async path => {
    requests.push(path);
    return { ok: !failing, status: 503, json: async () => (path === '/data/results.json' ? results : { path }) };
  };
});
afterEach(() => { globalThis.fetch = originalFetch; });

test('each data file is fetched once and shared between callers', async () => {
  const [a, b] = await Promise.all([loadResults(), loadResults()]);
  await loadContest(2025, 'Aljunied');
  await loadMapSummary(2025);
  assert.equal(a, b);
  assert.deepEqual(requests, ['/data/results.json']);
  assert.deepEqual(await loadOptions(), { path: '/data/options.json' });
  assert.deepEqual(await loadBoundaries(2025), { path: '/data/boundaries-2025.json' });
});

test('a failed load is not cached, so retrying fetches again', async () => {
  failing = true;
  await assert.rejects(loadOptions(), /Could not load election data \(503\)/);
  failing = false;
  assert.deepEqual(await loadOptions(), { path: '/data/options.json' });
  assert.equal(requests.length, 2);
});

test('contest details come from the matching results row', async () => {
  assert.equal((await loadContest('2020', 'Aljunied')).contestants[0].vote_share, 0.59);
  await assert.rejects(loadContest(2025, 'Nowhere'), /No results found for Nowhere 2025/);
});

test('the map summary is derived from results for the chosen year only', async () => {
  const map = await loadMapSummary(2025);
  assert.deepEqual(Object.keys(map.summary), ['ALJUNIED GRC']);
  assert.equal(map.summary['ALJUNIED GRC'].winnerParty, 'WP');
  assert.deepEqual(map.parties, ['PAP', 'WP']);
});
