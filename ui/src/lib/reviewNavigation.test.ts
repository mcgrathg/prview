import { expect, test } from 'bun:test';
import { createActor, waitFor } from 'xstate';
import { reviewNavigationMachine } from './reviewNavigation.js';

test('restoring and navigation effects acknowledge only their own sequence', () => {
  const actor = createActor(reviewNavigationMachine, { input: { review: { file: 'first.ts' } } }).start();
  expect(actor.getSnapshot().value).toBe('restoring');
  expect(actor.getSnapshot().context.historyMode).toBe('none');
  actor.send({ type: 'APPLIED', sequence: 0 });
  expect(actor.getSnapshot().value).toBe('ready');
  actor.send({ type: 'NAVIGATE', review: { file: 'second.ts', line: 8 } });
  const old = actor.getSnapshot();
  expect(old.value).toBe('navigating');
  expect(old.context.historyMode).toBe('push');
  actor.send({ type: 'RESTORE', review: { file: 'first.ts' } });
  expect(actor.getSnapshot().value).toBe('restoring');
  expect(actor.getSnapshot().context.historyMode).toBe('none');
  actor.send({ type: 'APPLIED', sequence: old.context.sequence });
  expect(actor.getSnapshot().value).toBe('restoring');
  expect(actor.getSnapshot().context.review.file).toBe('first.ts');
  actor.send({ type: 'APPLIED', sequence: actor.getSnapshot().context.sequence });
  expect(actor.getSnapshot().value).toBe('ready');
  expect(old.context.review.file).toBe('second.ts');
  actor.stop();
});

test('replace navigations copy caller state and normalize unsafe destinations', () => {
  const actor = createActor(reviewNavigationMachine).start();
  const review = { file: 'src/a.ts', controls: { query: 'query' } };
  actor.send({ type: 'NAVIGATE', review, historyMode: 'replace' });
  review.controls.query = 'mutated';
  expect(actor.getSnapshot().context.historyMode).toBe('replace');
  expect(actor.getSnapshot().context.review.controls.query).toBe('query');
  actor.send({ type: 'NAVIGATE', review: { file: '../secret', line: 4 } });
  expect(actor.getSnapshot().context.review.file).toBeNull();
  expect(actor.getSnapshot().context.review.line).toBeNull();
  actor.stop();
});

test('Back restoration followed by layout and patch commands retains the exact caller', () => {
  const actor = createActor(reviewNavigationMachine, { input: { review: { file: 'src/first.ts' } } }).start();
  actor.send({ type: 'NAVIGATE', review: { file: 'src/definition.ts', view: 'source', line: 595 } });
  actor.send({ type: 'RESTORE', review: { file: 'src/caller.ts', line: 13, layout: 'unified', rev: 'a'.repeat(40), base: 'b'.repeat(40) } });
  actor.send({ type: 'LAYOUT.SET', layout: 'split' });
  expect(actor.getSnapshot().context.review).toMatchObject({ file: 'src/caller.ts', line: 13, view: 'diff', layout: 'split', rev: 'a'.repeat(40), base: 'b'.repeat(40) });
  expect(actor.getSnapshot().context.historyMode).toBe('push');
  actor.send({ type: 'PATCH', patch: { controls: { query: 'caller' } }, historyMode: 'replace' });
  expect(actor.getSnapshot().context.review.file).toBe('src/caller.ts');
  expect(actor.getSnapshot().context.review.layout).toBe('split');
  expect(actor.getSnapshot().context.historyMode).toBe('replace');
  actor.stop();
});

test('a superseded render invocation aborts and cannot complete the newer location', async () => {
  const pending = [];
  const actor = createActor(reviewNavigationMachine, { input: { review: { file: 'first.ts' }, apply: (review, signal) => new Promise(resolve => pending.push({ review, signal, resolve })) } }).start();
  actor.send({ type: 'APPLY' });
  await waitFor(actor, s => s.matches('applying'));
  actor.send({ type: 'PATCH', patch: { file: 'second.ts' } });
  expect(pending[0].signal.aborted).toBe(true);
  actor.send({ type: 'APPLY' });
  await waitFor(actor, s => s.matches('applying') && pending.length === 2);
  pending[0].resolve();
  await Promise.resolve();
  expect(actor.getSnapshot().matches('applying')).toBe(true);
  expect(actor.getSnapshot().context.review.file).toBe('second.ts');
  pending[1].resolve();
  await waitFor(actor, s => s.matches('ready'));
  actor.stop();
});
