import { expect, test } from 'bun:test';
import { createActor, waitFor } from 'xstate';
import { reviewLookupMachine } from './reviewLookupMachine.js';

test('new origins, cancel and teardown abort work and ignore late results', async () => {
  const pending = [];
  const actor = createActor(reviewLookupMachine, { input: { lookup: input => new Promise(resolve => pending.push({ ...input, resolve })) } }).start();
  actor.send({ type: 'LOAD', request: { symbol: 'first', sha: 'a' } });
  actor.send({ type: 'LOAD', request: { symbol: 'second', sha: 'b' } });
  expect(pending[0].signal.aborted).toBe(true);
  pending[0].resolve({ status: 'ok', references: [{ path: 'wrong.ts' }] });
  pending[1].resolve({ status: 'ok', references: [{ path: 'right.ts' }] });
  await waitFor(actor, s => s.matches('ready'));
  expect(actor.getSnapshot().context.result.references).toEqual([{ path: 'right.ts' }]);
  actor.send({ type: 'LOAD', request: { symbol: 'third' } });
  actor.send({ type: 'CANCEL' });
  expect(pending[2].signal.aborted).toBe(true);
  expect(actor.getSnapshot().matches('idle')).toBe(true);
  expect(actor.getSnapshot().context.result).toBeNull();
  actor.send({ type: 'LOAD', request: { symbol: 'fourth' } });
  actor.stop();
  expect(pending[3].signal.aborted).toBe(true);
});

test('empty, unsupported and error results stay distinct and failures can retry', async () => {
  let calls = 0;
  const actor = createActor(reviewLookupMachine, { input: { lookup: async () => {
    calls++; if (calls === 1) throw new Error('offline');
    return calls === 2 ? { status: 'ok', references: [] } : { status: 'unavailable' };
  } } }).start();
  actor.send({ type: 'LOAD', request: { symbol: 'paint' } });
  await waitFor(actor, s => s.matches('error'));
  expect(actor.getSnapshot().context.error).toBe('offline');
  actor.send({ type: 'RETRY' });
  await waitFor(actor, s => s.matches('empty'));
  actor.send({ type: 'LOAD', request: { symbol: 'unsupported' } });
  await waitFor(actor, s => s.matches('unavailable'));
  actor.stop();
});

test('fetching retries retain the captured origin and stop at their bound', async () => {
  const requests = [];
  const actor = createActor(reviewLookupMachine, { input: { retryMs: 0, maxRetries: 1, lookup: async ({ request }) => { requests.push(request); return { status: 'fetching' }; } } }).start();
  actor.send({ type: 'LOAD', request: { symbol: 'paint', sha: 'pinned' } });
  await waitFor(actor, s => s.matches('unavailable'));
  expect(requests).toHaveLength(2);
  expect(requests.every(r => r.symbol === 'paint' && r.sha === 'pinned')).toBe(true);
  expect(actor.getSnapshot().context.result.status).toBe('fetching');
  actor.stop();
});
