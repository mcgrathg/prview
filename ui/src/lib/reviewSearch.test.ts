import { expect, test } from 'bun:test';
import { createActor, waitFor } from 'xstate';
import { reviewSearchMachine } from './reviewSearch.js';
const request = (query, sha = 'a'.repeat(40)) => ({ type: 'SEARCH', repo: 'acme/widgets', sha, headRef: 'main', query, enabled: true });

test('superseded query and revision requests abort and cannot replace current results', async () => {
  const pending = [];
  const actor = createActor(reviewSearchMachine, { input: { debounceMs: 0, search: input => new Promise(resolve => pending.push({ input, resolve })) } }).start();
  actor.send(request('first'));
  await waitFor(actor, state => state.matches('loading'));
  actor.send(request('second', 'b'.repeat(40)));
  await waitFor(actor, state => state.matches('loading') && pending.length === 2);
  expect(pending[0].input.signal.aborted).toBe(true);
  pending[0].resolve({ status: 'ok', matches: [{ path: 'stale.ts' }] });
  pending[1].resolve({ status: 'ok', matches: [{ path: 'current.ts' }] });
  await waitFor(actor, state => state.matches('ready'));
  expect(actor.getSnapshot().context.matches).toEqual([{ path: 'current.ts' }]);
  expect(actor.getSnapshot().context.matchedQuery).toBe('second');
  actor.stop();
});

test('closing search and stopping the actor abort outstanding work', async () => {
  let signal;
  const actor = createActor(reviewSearchMachine, { input: { debounceMs: 0, search: input => { signal = input.signal; return new Promise(() => {}); } } }).start();
  actor.send(request('query'));
  await waitFor(actor, state => state.matches('loading'));
  actor.send({ ...request('query'), enabled: false });
  expect(signal.aborted).toBe(true);
  expect(actor.getSnapshot().value).toBe('idle');
  expect(actor.getSnapshot().context.matches).toEqual([]);
  actor.send(request('again'));
  await waitFor(actor, state => state.matches('loading'));
  actor.stop();
  expect(signal.aborted).toBe(true);
});

test('fetching responses retry with captured identity and stop at the configured bound', async () => {
  const inputs = [];
  const actor = createActor(reviewSearchMachine, { input: { debounceMs: 0, retryMs: 0, maxRetries: 1, search: async input => { inputs.push(input); return { status: 'fetching' }; } } }).start();
  actor.send(request('query'));
  await waitFor(actor, state => state.matches('ready'));
  expect(inputs).toHaveLength(2);
  expect(inputs.every(input => input.query === 'query' && input.sha === 'a'.repeat(40))).toBe(true);
  expect(actor.getSnapshot().context.status).toBe('not-found');
  actor.stop();
});

test('short queries cancel debounce without sending a request', async () => {
  let calls = 0;
  const actor = createActor(reviewSearchMachine, { input: { search: async () => { calls++; return { status: 'ok', matches: [] }; } } }).start();
  actor.send(request('valid'));
  actor.send(request('a'));
  expect(actor.getSnapshot().value).toBe('idle');
  expect(calls).toBe(0);
  actor.stop();
});
