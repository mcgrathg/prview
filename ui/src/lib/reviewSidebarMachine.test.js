import { test, expect } from 'bun:test';
import { createActor } from 'xstate';
import { reviewSidebarMachine } from './reviewSidebarMachine.js';

test('pinned sidebar only collapses explicitly and hover preview closes on leaving', () => {
  const actor = createActor(reviewSidebarMachine, { input: { pinned: true } }).start();
  actor.send({ type: 'POINTER_LEAVE' }); actor.send({ type: 'CLOSE' });
  expect(actor.getSnapshot().value).toBe('pinned');
  actor.send({ type: 'COLLAPSE' });
  expect(actor.getSnapshot().value).toBe('closed');
  actor.send({ type: 'POINTER_ENTER' });
  expect(actor.getSnapshot().value).toBe('peeking');
  actor.send({ type: 'POINTER_LEAVE' });
  expect(actor.getSnapshot().value).toBe('closed');
  actor.send({ type: 'POINTER_ENTER' }); actor.send({ type: 'PIN' });
  expect(actor.getSnapshot().value).toBe('pinned');
  actor.stop();
});
test('keyboard/click opening remains usable while focus is inside and Escape/outside dismisses', () => {
  const actor = createActor(reviewSidebarMachine, { input: { pinned: false } }).start();
  expect(actor.getSnapshot().value).toBe('closed');
  actor.send({ type: 'FOCUS_ENTER' }); actor.send({ type: 'POINTER_LEAVE' });
  expect(actor.getSnapshot().value).toBe('opened');
  actor.send({ type: 'FOCUS_LEAVE', hovered: true });
  expect(actor.getSnapshot().value).toBe('peeking');
  actor.send({ type: 'OPEN' }); actor.send({ type: 'CLOSE' });
  expect(actor.getSnapshot().value).toBe('closed');
  actor.send({ type: 'OPEN' }); actor.send({ type: 'FOCUS_LEAVE', hovered: false });
  expect(actor.getSnapshot().value).toBe('closed');
  actor.stop();
});
