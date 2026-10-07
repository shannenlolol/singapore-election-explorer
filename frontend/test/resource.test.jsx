import React from 'react';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { act, cleanup, render, screen } from '@testing-library/react';
import { useResource } from '../src/features/dashboard/useResource.js';

function Resource({ path }) {
  const resource = useResource(path);
  return <p>{resource.loading ? 'Loading' : resource.data?.label}</p>;
}

test('late responses cannot overwrite the newest request even if a transport ignores abort', async () => {
  const originalFetch = globalThis.fetch;
  const pending = new Map();
  globalThis.fetch = (path, options) => new Promise(resolve => pending.set(path, { resolve, signal: options.signal }));
  try {
    const view = render(<Resource path="/first" />);
    view.rerender(<Resource path="/second" />);
    assert.equal(pending.get('/first').signal.aborted, true);
    await act(async () => pending.get('/second').resolve({ ok: true, json: async () => ({ label: 'Newest result' }) }));
    assert.ok(screen.getByText('Newest result'));
    await act(async () => pending.get('/first').resolve({ ok: true, json: async () => ({ label: 'Obsolete result' }) }));
    assert.ok(screen.getByText('Newest result'));
    assert.equal(screen.queryByText('Obsolete result'), null);
  } finally {
    cleanup();
    globalThis.fetch = originalFetch;
  }
});
