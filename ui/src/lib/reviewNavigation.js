import { assign, fromPromise, setup } from 'xstate';
import { normalizeReviewState } from './reviewRoute.js';

export const reviewNavigationMachine = setup({
  actors: { apply: fromPromise(({ input, signal }) => input.apply(input.review, signal)) },
  guards: { currentSequence: ({ context, event }) => event.sequence === context.sequence },
  actions: {
    navigate: assign(({ context, event }) => ({ review: normalizeReviewState(event.review), sequence: context.sequence + 1, historyMode: event.historyMode === 'replace' ? 'replace' : 'push' })),
    patch: assign(({ context, event }) => ({ review: normalizeReviewState({ ...context.review, ...event.patch }), sequence: context.sequence + 1, historyMode: event.historyMode === 'replace' ? 'replace' : 'push' })),
    layout: assign(({ context, event }) => ({ review: normalizeReviewState({ ...context.review, layout: event.layout }), sequence: context.sequence + 1, historyMode: 'push' })),
    restore: assign(({ context, event }) => ({ review: normalizeReviewState(event.review), sequence: context.sequence + 1, historyMode: 'none' })),
  },
}).createMachine({
  id: 'review-navigation',
  initial: 'restoring',
  context: ({ input }) => ({ review: normalizeReviewState(input?.review), sequence: 0, historyMode: 'none', apply: input?.apply ?? (async () => {}) }),
  on: {
    APPLY: { target: '.applying', reenter: true },
    PATCH: { target: '.navigating', reenter: true, actions: 'patch' },
    'LAYOUT.SET': { target: '.navigating', reenter: true, guard: ({ event }) => ['unified', 'split'].includes(event.layout), actions: 'layout' },
    NAVIGATE: { target: '.navigating', reenter: true, actions: 'navigate' },
    RESTORE: { target: '.restoring', reenter: true, actions: 'restore' },
  },
  states: {
    restoring: { on: { APPLIED: { target: 'ready', guard: 'currentSequence' } } },
    navigating: { on: { APPLIED: { target: 'ready', guard: 'currentSequence' } } },
    applying: { invoke: { src: 'apply', input: ({ context }) => ({ apply: context.apply, review: context.review }), onDone: 'ready', onError: 'failed' } },
    failed: {},
    ready: {},
  },
});
