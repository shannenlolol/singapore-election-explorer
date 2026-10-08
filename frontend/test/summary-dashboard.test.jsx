import React from 'react';
import { beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SummaryDashboard from '../src/features/dashboard/SummaryDashboard.jsx';

const originalFetch = globalThis.fetch;
let rows, options, failResults, failOptions;
beforeEach(() => {
  rows = [{ year: 2020, winner_party: 'WP' }, { year: 2025, winner_party: 'PAP' }, { year: 2025, winner_party: 'WP' }];
  options = { election_dates: [{ year: 2025, nomination_day: '2025-04-22T16:00:00Z', polling_day: '2025-05-03' }, { year: 2020, nomination_day: null, polling_day: '2020-07-10' }], parties: Array.from({ length: 18 }, (_, i) => ({ abbreviation: `P${String(i).padStart(2, '0')}`, full_name: `Party ${i}` })) };
  failResults = false; failOptions = false;
  globalThis.fetch = async path => {
    const isOptions = path.includes('options');
    const failed = isOptions ? failOptions : failResults;
    return { ok: !failed, status: 503, json: async () => failed ? { message: 'Temporary service failure' } : isOptions ? options : { rows } };
  };
});
afterEach(() => { cleanup(); globalThis.fetch = originalFetch; });

test('renders React charts and exact yearly values without an iframe', async () => {
  const user = userEvent.setup();
  const { container } = render(<SummaryDashboard />);
  await screen.findByRole('heading', { name: 'Constituencies won by party' });
  assert.equal(container.querySelector('iframe'), null);
  await user.click(screen.getByText('View exact counts by year'));
  const table = screen.getByRole('table', { name: 'Constituencies won by year and party' });
  const tableRows = within(table).getAllByRole('row');
  assert.deepEqual(within(tableRows[0]).getAllByRole('columnheader').map(cell => cell.textContent), ['Year', 'PAP', 'WP', 'Total']);
  assert.deepEqual(within(tableRows[1]).getAllByRole('cell').map(cell => cell.textContent), ['0', '1', '1']);
  assert.deepEqual(within(tableRows[2]).getAllByRole('cell').map(cell => cell.textContent), ['1', '1', '2']);
  assert.ok(screen.getByText('23 Apr 2025'));
});
test('reference tables support pagination, search, and sort', async () => {
  const user = userEvent.setup();
  render(<SummaryDashboard />);
  const section = await screen.findByRole('region', { name: 'Political parties' });
  assert.ok(within(section).getByText('Page 1 of 2'));
  await user.click(within(section).getByRole('button', { name: 'Page 2', exact: true }));
  assert.ok(within(section).getByText('P16'));
  await user.type(within(section).getByRole('searchbox', { name: 'Search political parties' }), 'Party 3');
  assert.ok(within(section).getByText('P03'));
  assert.ok(within(section).getByText('Page 1 of 1'));
  await user.clear(within(section).getByRole('searchbox'));
  await user.click(within(section).getByRole('button', { name: 'Abbreviation ↑' }));
  const tableRows = within(within(section).getByRole('table')).getAllByRole('row');
  assert.equal(within(tableRows[1]).getAllByRole('cell')[0].textContent, 'P17');
});
test('empty results show an honest empty state while reference data remains available', async () => {
  rows = [];
  render(<SummaryDashboard />);
  await screen.findByRole('heading', { name: 'No election results yet' });
  assert.ok(await screen.findByRole('table', { name: 'Election dates' }));
  assert.equal(screen.queryByRole('heading', { name: 'Constituencies won by party' }), null);
});
test('summary failure retries independently from reference data', async () => {
  const user = userEvent.setup();
  failResults = true;
  render(<SummaryDashboard />);
  await screen.findByRole('heading', { name: 'Summary unavailable' });
  assert.ok(await screen.findByRole('table', { name: 'Political parties' }));
  failResults = false;
  await user.click(screen.getByRole('button', { name: 'Retry summary' }));
  await screen.findByRole('heading', { name: 'Constituencies won by party' });
});
test('reference failures retry independently from loaded charts', async () => {
  const user = userEvent.setup();
  failOptions = true;
  render(<SummaryDashboard />);
  await screen.findByRole('heading', { name: 'Constituencies won by party' });
  await screen.findByRole('button', { name: 'Retry reference tables' });
  failOptions = false;
  await user.click(screen.getByRole('button', { name: 'Retry reference tables' }));
  await screen.findByRole('table', { name: 'Election dates' });
});
test('the API result cap is disclosed rather than presented as a complete history', async () => {
  rows = Array.from({ length: 800 }, () => ({ year: 2025, winner_party: 'PAP' }));
  render(<SummaryDashboard />);
  await screen.findByText('This summary covers the API’s first 800 results and may be incomplete.');
});
