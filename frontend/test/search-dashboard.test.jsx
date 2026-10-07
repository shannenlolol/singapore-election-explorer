import React from "react";
import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchDashboard from '../src/features/dashboard/SearchDashboard.jsx';

const options = {
  years: [2025, 2020],
  parties: [{ abbreviation: 'WP', full_name: "Workers' Party" }, { abbreviation: 'PAP', full_name: "People's Action Party" }],
  constituencies: [{ year: 2025, constituency: 'Aljunied' }, { year: 2020, constituency: 'Aljunied' }],
};
const rows = Array.from({ length: 16 }, (_, index) => ({ year: 2025, constituency: index ? `Area ${index}` : 'Aljunied', constituency_type: 'GRC', contesting_parties: 'PAP,WP', winner_party: index ? 'PAP' : 'WP', margin_pct: index ? index : 19.42 }));
const details = {
  parties: [{ party: 'WP', party_full_name: "Workers' Party", vote_count: 79254, vote_share: 0.5971, candidates: 'Alice | Bob; Carol' }],
  elector: { no_of_registered_electors: 144298, no_of_rejected_votes: 1342, no_of_spoilt_ballot_papers: null },
};
let requests, rejectDetails, rejectSearch, holdDetails, fetchCalls;
const originalFetch = globalThis.fetch;
beforeEach(() => {
  requests = []; rejectDetails = false; rejectSearch = false; holdDetails = false;
  fetchCalls = [];
  globalThis.fetch = async (path, init) => {
    fetchCalls.push([path, init]);
    requests.push(String(path));
    if (path.includes('/options')) return { ok: true, json: async () => options };
    if (path.includes('/details')) {
      if (holdDetails) return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
      return { ok: !rejectDetails, status: 503, json: async () => rejectDetails ? { message: 'Details temporarily unavailable' } : details };
    }
    if (rejectSearch) return { ok: false, status: 503, json: async () => ({ message: 'Search temporarily unavailable' }) };
    const query = new URL(String(path), 'http://localhost').searchParams;
    return { ok: true, json: async () => ({ rows: query.has('winners') ? [] : rows }) };
  };
});
afterEach(() => { cleanup(); globalThis.fetch = originalFetch; });

test('loads results, pages, and keeps numeric sorting independent of display formatting', async () => {
  const user = userEvent.setup();
  render(<SearchDashboard />);
  await screen.findByRole('button', { name: 'View Aljunied 2025 details' });
  assert.ok(screen.getByText('Page 1 of 2'));
  await user.click(screen.getByRole('button', { name: 'Next', exact: true }));
  assert.ok(screen.getByRole('button', { name: 'View Area 14 2025 details' }));
  assert.equal(screen.queryByRole('button', { name: 'View Aljunied 2025 details' }), null);
  await user.click(screen.getByRole('button', { name: 'Margin ↕' }));
  const bodyRows = within(screen.getByRole('table')).getAllByRole('row');
  assert.ok(bodyRows[1].textContent.includes('Area 1'));
  assert.ok(screen.getByText('Page 1 of 2'));
});

test('selection loads matching details, preserves units and missing values, and restores focus on close', async () => {
  const user = userEvent.setup();
  render(<SearchDashboard />);
  const trigger = await screen.findByRole('button', { name: 'View Aljunied 2025 details' });
  await user.click(trigger);
  const panel = await screen.findByRole('complementary', { name: 'Aljunied 2025' });
  await within(panel).findByText('79,254 votes · 59.71%');
  assert.ok(within(panel).getByText('144,298'));
  assert.ok(within(panel).getByText('—'));
  for (const name of ['Alice', 'Bob', 'Carol']) assert.ok(within(panel).getByText(name));
  assert.equal(requests.some(path => path.includes('year=2025&constituency=Aljunied')), true);
  await user.keyboard('{Escape}');
  assert.equal(screen.queryByRole('complementary'), null);
  assert.equal(document.activeElement, trigger);
});

test('multi-select filters serialize to the existing API, show empty results, and reset selection', async () => {
  const user = userEvent.setup();
  render(<SearchDashboard />);
  await screen.findByRole('button', { name: 'View Aljunied 2025 details' });
  await user.click(screen.getByText('Year', { exact: true, selector: 'summary' }));
  await user.click(screen.getByRole('checkbox', { name: '2020', exact: true }));
  await user.click(screen.getByRole('checkbox', { name: '2025', exact: true }));
  await waitFor(() => assert.equal(requests.some(path => new URL(path, 'http://localhost').searchParams.get('years') === '2020,2025'), true));
  await user.click(screen.getByText('Winner party', { exact: true, selector: 'summary' }));
  await user.click(within(screen.getByRole('group', { name: 'Winner party' })).getByRole('checkbox', { name: "WP — Workers' Party" }));
  await screen.findByRole('heading', { name: 'No matching elections' });
  await user.click(screen.getByRole('button', { name: 'Reset filters' }));
  await screen.findByRole('button', { name: 'View Aljunied 2025 details' });
  assert.equal(screen.getByRole('checkbox', { name: '2020', exact: true }).checked, false);
});

test('detail errors can be retried without discarding search results', async () => {
  const user = userEvent.setup();
  rejectDetails = true;
  render(<SearchDashboard />);
  await user.click(await screen.findByRole('button', { name: 'View Aljunied 2025 details' }));
  await screen.findByText('Details temporarily unavailable');
  rejectDetails = false;
  await user.click(screen.getByRole('button', { name: 'Retry details' }));
  await screen.findByText('79,254 votes · 59.71%');
});

test('search failures show an error and retry recovers', async () => {
  const user = userEvent.setup();
  rejectSearch = true;
  render(<SearchDashboard />);
  await screen.findByText('Search temporarily unavailable');
  rejectSearch = false;
  await user.click(screen.getByRole('button', { name: 'Retry results' }));
  await screen.findByRole('button', { name: 'View Aljunied 2025 details' });
});

test('closing a loading detail panel aborts its request', async () => {
  const user = userEvent.setup();
  holdDetails = true;
  render(<SearchDashboard />);
  await user.click(await screen.findByRole('button', { name: 'View Aljunied 2025 details' }));
  await screen.findByText('Loading constituency details…');
  const detailCall = fetchCalls.find(([path]) => path.includes('/details'));
  await user.click(screen.getByRole('button', { name: 'Close constituency details' }));
  assert.equal(detailCall[1].signal.aborted, true);
  assert.equal(screen.queryByRole('complementary'), null);
});

test('options failure is recoverable and does not trigger a search prematurely', async () => {
  const user = userEvent.setup();
  const normalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({ message: 'Filters unavailable' }) });
  render(<SearchDashboard />);
  await screen.findByText('Filters unavailable');
  assert.equal(screen.queryByRole('table'), null);
  globalThis.fetch = normalFetch;
  await user.click(screen.getByRole('button', { name: 'Retry filters' }));
  await screen.findByRole('button', { name: 'View Aljunied 2025 details' });
});

test('detail panel distinguishes independent contestants and explains walkovers and ties', async () => {
  const user = userEvent.setup();
  const original = structuredClone(details);
  try {
    details.parties = [
      { party: 'Independent', candidates: 'Candidate One', vote_count: 40, vote_share: 0.4 },
      { party: 'Independent', candidates: 'Candidate Two', vote_count: 30, vote_share: 0.3 },
    ];
    details.outcome = 'tie';
    render(<SearchDashboard />);
    await user.click(await screen.findByRole('button', { name: 'View Aljunied 2025 details' }));
    await screen.findByText('Tied vote totals: no winner is inferred.');
    const votes = document.querySelector('.vote-bars');
    assert.ok(within(votes).getByText('Candidate One'));
    assert.ok(within(votes).getByText('Candidate Two'));
    cleanup();
    details.outcome = 'walkover';
    details.parties = [{ party: 'PAP', candidates: 'Team', vote_count: null, vote_share: null }];
    render(<SearchDashboard />);
    await user.click(await screen.findByRole('button', { name: 'View Aljunied 2025 details' }));
    await screen.findByText(/Uncontested return \(walkover\)/);
    assert.ok(screen.getByText('— votes · —'));
  } finally {
    for (const key of Object.keys(details)) delete details[key];
    Object.assign(details, original);
  }
});
