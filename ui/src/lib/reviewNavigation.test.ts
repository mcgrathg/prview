import { expect, test } from 'bun:test';
import { createActor } from 'xstate';
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
