import React from 'react';
import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, render, screen } from '@testing-library/react';
import DataStatus from '../src/components/DataStatus.jsx';
import { clearDataCache } from '../src/data.js';

const originalFetch = globalThis.fetch;
let meta, failing, requests;
beforeEach(() => {
  meta = { updatedAt: '2026-10-12T09:51:44.546Z' }; failing = false; requests = [];
  clearDataCache();
  globalThis.fetch = async path => {
    requests.push(path);
    return { ok: !failing, status: 503, json: async () => meta };
  };
});
afterEach(() => { cleanup(); globalThis.fetch = originalFetch; });

test('shows when the data last changed, in Singapore time, from meta.json', async () => {
  render(<DataStatus />);
  const label = await screen.findByText(/^Data last updated: 12 Oct 2026, 5:51\s?pm SGT$/i);
  assert.match(label.title, /not when data\.gov\.sg published it/);
  assert.deepEqual(requests, ['/data/meta.json']);
});

test('reads meta.json once, with no polling', async () => {
  const view = render(<DataStatus />);
  await screen.findByText(/^Data last updated/);
  view.rerender(<DataStatus />);
  assert.equal(requests.length, 1);
});

test('a missing file or unreadable date says the time is unavailable', async () => {
  failing = true;
  render(<DataStatus />);
  await screen.findByText('Data update time unavailable');
  cleanup(); clearDataCache();
  failing = false; meta = { updatedAt: 'not a date' };
  render(<DataStatus />);
  await screen.findByText('Data update time unavailable');
});
