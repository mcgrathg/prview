import { assign, setup } from 'xstate';
import { normalizeReviewState } from './reviewRoute.js';

/**
 * The caller applies URL/selection effects, then acknowledges that sequence with APPLIED.
 * RESTORE never writes browser history. A superseded effect cannot finish a newer transition.
 */
export const reviewNavigationMachine = setup({
  guards: { currentSequence: ({ context, event }) => event.sequence === context.sequence },
  actions: {
    navigate: assign(({ context, event }) => ({ review: normalizeReviewState(event.review), sequence: context.sequence + 1, historyMode: event.historyMode === 'replace' ? 'replace' : 'push' })),
    restore: assign(({ context, event }) => ({ review: normalizeReviewState(event.review), sequence: context.sequence + 1, historyMode: 'none' })),
  },
}).createMachine({
  id: 'review-navigation',
  initial: 'restoring',
  context: ({ input }) => ({ review: normalizeReviewState(input?.review), sequence: 0, historyMode: 'none' }),
  on: {
    NAVIGATE: { target: '.navigating', reenter: true, actions: 'navigate' },
    RESTORE: { target: '.restoring', reenter: true, actions: 'restore' },
  },
  states: {
    restoring: { on: { APPLIED: { target: 'ready', guard: 'currentSequence' } } },
    navigating: { on: { APPLIED: { target: 'ready', guard: 'currentSequence' } } },
    ready: {},
  },
});
