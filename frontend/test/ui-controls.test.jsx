import React from 'react';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { render, cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThemeToggle from '../src/components/ThemeToggle.jsx';
import ResultsTable from '../src/features/dashboard/ResultsTable.jsx';
import SummaryCharts from '../src/features/dashboard/SummaryCharts.jsx';
import { summarizeResults } from '../src/features/dashboard/summaryModel.js';
import { initialTheme, THEME_KEY } from '../src/features/theme/theme.js';
const media = window.matchMedia;
afterEach(() => { cleanup(); window.localStorage.clear(); delete document.documentElement.dataset.theme; window.matchMedia = media; });

test('theme follows initial system preference, toggles, and persists across remounts', async () => {
  window.matchMedia = () => ({ matches: true });
  const user = userEvent.setup();
  render(<ThemeToggle />);
  assert.equal(document.documentElement.dataset.theme, 'dark');
  await user.click(screen.getByRole('button', { name: 'Light mode' }));
  assert.equal(document.documentElement.dataset.theme, 'light');
  assert.equal(window.localStorage.getItem(THEME_KEY), 'light');
  cleanup(); render(<ThemeToggle />);
  assert.equal(screen.getByRole('button', { name: 'Light mode' }).getAttribute('aria-pressed'), 'true');
  await user.click(screen.getByRole('button', { name: 'Dark mode' }));
  assert.equal(document.documentElement.dataset.theme, 'dark');
});
test('theme tolerates invalid preferences and blocked browser storage', async () => {
  window.localStorage.setItem(THEME_KEY, 'invalid');
  assert.equal(initialTheme(), 'light');
  const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
  Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  try {
    render(<ThemeToggle />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Dark mode' }));
    assert.equal(document.documentElement.dataset.theme, 'dark');
  } finally { Object.defineProperty(window, 'localStorage', descriptor); }
});
test('numbered pagination jumps to pages and ends, changes size, and clamps smaller results', async () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ year: 2025, constituency: `Area ${i}`, winner_party: 'WP' }));
  const props = { selected: null, onSelect: () => {}, partyNames: {} };
  const user = userEvent.setup();
  const { rerender } = render(<ResultsTable {...props} rows={rows} />);
  await user.click(screen.getByRole('button', { name: 'Page 2', exact: true }));
  assert.ok(screen.getByRole('button', { name: 'View Area 14 2025 details' }));
  assert.equal(screen.getByRole('button', { name: 'Page 2', exact: true }).getAttribute('aria-current'), 'page');
  await user.click(screen.getByRole('button', { name: 'Last page' }));
  assert.ok(screen.getByText('99–100 of 100 results'));
  assert.equal(screen.getByRole('button', { name: 'Next' }).disabled, true);
  await user.selectOptions(screen.getByRole('combobox', { name: 'Rows per page' }), '28');
  assert.ok(screen.getByText('Page 1 of 4'));
  await user.click(screen.getByRole('button', { name: 'Last page' }));
  rerender(<ResultsTable {...props} rows={rows.slice(0, 3)} />);
  assert.ok(screen.getByText('1–3 of 3 results'));
  assert.equal(screen.getByRole('button', { name: 'First page' }).disabled, true);
  rerender(<ResultsTable {...props} rows={[]} />);
  assert.ok(screen.getByText('0–0 of 0 results'));
});
test('overall and yearly bars show exact values on hover and focus; Escape dismisses', async () => {
  const summary = summarizeResults([{ year: 2025, winner_party: 'WP' }, { year: 2025, winner_party: 'PAP' }]);
  const user = userEvent.setup();
  render(<SummaryCharts summary={summary} />);
  const overall = screen.getByRole('img', { name: 'WP: 1 constituencies won' });
  await user.hover(overall);
  assert.equal(screen.getByRole('tooltip').textContent, 'WP: 1 constituencies won');
  await user.unhover(overall);
  assert.equal(screen.queryByRole('tooltip'), null);
  const yearly = within(screen.getByRole('group', { name: 'Constituency wins by year' })).getByRole('img', { name: '2025 · WP: 1 constituencies won' });
  await user.click(yearly);
  assert.equal(screen.getByRole('tooltip').textContent, '2025 · WP: 1 constituencies won');
  assert.equal(document.activeElement, yearly);
  await user.keyboard('{Escape}');
  assert.equal(screen.queryByRole('tooltip'), null);
});
