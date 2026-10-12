import React from "react";
import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SearchDashboard from '../src/features/dashboard/SearchDashboard.jsx';
import { clearDataCache } from '../src/data.js';

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
// results.json rows: the table filters them in the browser, and the details panel reads
// its contestants and elector stats from the same rows (built from `details` on request).
const contestRows = () => rows.map(row => ({ ...row, outcome: details.outcome || 'contested', elector: details.elector, contestants: details.parties }));
const loadError = 'Could not load election data (503).';
let requests, rejectResults;
const originalFetch = globalThis.fetch;
beforeEach(() => {
  requests = []; rejectResults = false;
  clearDataCache();
  globalThis.fetch = async path => {
    requests.push(String(path));
    if (path === '/data/options.json') return { ok: true, json: async () => options };
    if (path === '/data/results.json') return { ok: !rejectResults, status: 503, json: async () => rejectResults ? null : contestRows() };
    return { ok: false, status: 404, json: async () => null };
  };
});
afterEach(() => { cleanup(); globalThis.fetch = originalFetch; });

test('loads results, pages, and keeps numeric sorting independent of display formatting', async () => {
  const user = userEvent.setup();
  render(<SearchDashboard />);
  await screen.findByRole('button', { name: 'View Aljunied 2025 details' });
  assert.ok(screen.getByText('Page 1 of 2'));
  await user.click(screen.getByRole('button', { name: 'Next', exact: true }));
  assert.ok(screen.getByRole('button', { name: 'View Area 10 2025 details' }));
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
  await user.click(within(panel).getByText('3 candidates'));
  assert.ok(within(panel).getAllByText('—').length > 0);
  for (const name of ['Alice', 'Bob', 'Carol']) assert.ok(within(panel).getByText(name));
  assert.equal(requests.includes('/data/results.json'), true);
  await user.keyboard('{Escape}');
  assert.equal(screen.queryByRole('complementary'), null);
  assert.equal(document.activeElement, trigger);
});

test('multi-select filters narrow results in the browser, show empty results, and reset', async () => {
  const user = userEvent.setup();
  render(<SearchDashboard />);
  await screen.findByRole('button', { name: 'View Aljunied 2025 details' });
  await user.click(screen.getByText('Year', { exact: true, selector: 'summary' }));
  await user.click(screen.getByRole('checkbox', { name: '2020', exact: true }));
  await screen.findByRole('heading', { name: 'No matching elections' });
  await user.click(screen.getByRole('checkbox', { name: '2025', exact: true }));
  await screen.findByRole('button', { name: 'View Aljunied 2025 details' });
  await user.click(screen.getByText('Winner party', { exact: true, selector: 'summary' }));
  await user.click(within(screen.getByRole('group', { name: 'Winner party' })).getByRole('checkbox', { name: "WP — Workers' Party" }));
  await waitFor(() => assert.equal(within(screen.getByRole('table')).getAllByRole('row').length, 2));
  assert.equal(screen.queryByRole('button', { name: 'View Area 1 2025 details' }), null);
  await user.click(screen.getByRole('button', { name: 'Reset filters' }));
  await screen.findByRole('button', { name: 'View Area 1 2025 details' });
  assert.equal(screen.getByRole('checkbox', { name: '2020', exact: true }).checked, false);
  // Filtering never re-downloads the data.
  assert.equal(requests.filter(path => path === '/data/results.json').length, 1);
});

test('result load failures show an error and retry recovers', async () => {
  const user = userEvent.setup();
  rejectResults = true;
  render(<SearchDashboard />);
  await screen.findByText(loadError);
  rejectResults = false;
  await user.click(screen.getByRole('button', { name: 'Retry results' }));
  await screen.findByRole('button', { name: 'View Aljunied 2025 details' });
});

test('options failure is recoverable and does not trigger a search prematurely', async () => {
  const user = userEvent.setup();
  const normalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => null });
  render(<SearchDashboard />);
  await screen.findByText(loadError);
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
    assert.ok(within(votes).getByText('Candidate One', { selector: '.candidate-identity' }));
    assert.ok(within(votes).getByText('Candidate Two', { selector: '.candidate-identity' }));
    cleanup();
    // results.json is cached per page load; this second render stands for a fresh one.
    clearDataCache();
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

test('clicking a result row opens its candidate details and closing returns to its accessible button', async () => {
  const user = userEvent.setup();
  render(<SearchDashboard />);
  const trigger = await screen.findByRole('button', { name: 'View Aljunied 2025 details' });
  const row = trigger.closest('tr');
  await user.click(within(row).getByText('GRC'));
  const panel = await screen.findByRole('complementary', { name: 'Aljunied 2025' });
  await user.click(await within(panel).findByText('3 candidates'));
  await within(panel).findByText('Alice');
  assert.ok(within(panel).getByText('Bob'));
  assert.ok(within(panel).getByText('79,254 votes · 59.71%'));
  await user.click(within(panel).getByRole('button', { name: 'Close constituency details' }));
  assert.equal(document.activeElement, trigger);
  await user.keyboard('{Enter}');
  await screen.findByRole('complementary', { name: 'Aljunied 2025' });
});


test('candidate disclosures toggle and reset for a new constituency', async () => {
  const user = userEvent.setup();
  render(<SearchDashboard />);
  await user.click(await screen.findByRole('button', { name: 'View Aljunied 2025 details' }));
  const hint = await screen.findByText('3 candidates');
  const disclosure = hint.closest('details');
  assert.equal(disclosure.open, false);
  await user.click(hint);
  assert.equal(disclosure.open, true);
  assert.deepEqual(within(disclosure).getAllByRole('listitem').map(item => item.textContent), ['Alice', 'Bob', 'Carol']);
  await user.click(hint);
  assert.equal(disclosure.open, false);
  await user.click(hint);
  await user.click(screen.getByRole('button', { name: 'View Area 1 2025 details' }));
  assert.equal((await screen.findByText('3 candidates')).closest('details').open, false);
  const close = screen.getByRole('button', { name: 'Close constituency details' });
  assert.ok(close.querySelector('svg[aria-hidden="true"]'));
  await user.click(close);
  assert.equal(document.activeElement, screen.getByRole('button', { name: 'View Area 1 2025 details' }));
});


test('elector statistics remain visible before party results and profiles use neutral placeholders', async () => {
  const user = userEvent.setup();
  render(<SearchDashboard />);
  await user.click(await screen.findByRole('button', { name: 'View Aljunied 2025 details' }));
  const panel = screen.getByRole('complementary', { name: 'Aljunied 2025' });
  const electors = await within(panel).findByRole('region', { name: 'Elector statistics' });
  assert.equal(electors.closest('details'), null);
  assert.deepEqual([...electors.querySelectorAll('dt')].map(item => item.textContent), ['Registered electors', 'Turnout', 'Rejected votes', 'Spoilt ballot papers']);
  assert.equal(electors.querySelector('dd').textContent, '144,298');
  const headings = within(panel).getAllByRole('heading', { level: 3 }).map(item => item.textContent);
  assert.deepEqual(headings, ['Elector statistics', 'Votes & candidates']);
  await user.click(within(panel).getByText('3 candidates'));
  const profiles = panel.querySelector('.candidate-profiles');
  assert.deepEqual(within(profiles).getAllByRole('listitem').map(item => item.textContent), ['Alice', 'Bob', 'Carol']);
  assert.equal(profiles.querySelectorAll('.candidate-avatar[aria-hidden="true"]').length, 3);
  assert.equal(profiles.querySelectorAll('img').length, 0);
});
