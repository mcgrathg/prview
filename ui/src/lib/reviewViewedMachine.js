import { assign, fromPromise, setup } from 'xstate';
import { fetchReviewViewed, writeReviewViewed } from './api.js';

export const reviewViewedMachine = setup({
  actors: {
    read: fromPromise(({ input, signal }) => fetchReviewViewed(input.repo, input.number, { signal, force: true })),
    write: fromPromise(({ input }) => writeReviewViewed(input.repo, input.number, {
      accountId: input.snapshot.account.id, pullRequestId: input.snapshot.pullRequestId,
      expectedHeadOid: input.snapshot.headOid, expectedBaseOid: input.snapshot.baseOid,
      path: input.change.path, viewed: input.change.viewed,
    })),
  },
}).createMachine({
  id: 'github-viewed', initial: 'disabled', context: { repo: '', number: 0, snapshot: null, change: null, error: null },
  on: {
    CONTEXT: { guard: ({ context, event }) => context.repo !== event.repo || context.number !== event.number || context.head !== event.head || context.base !== event.base,
      target: '.loading', actions: assign(({ event }) => ({ repo: event.repo, number: event.number, head: event.head, base: event.base, snapshot: null, error: null, change: null })) },
  },
  states: {
    disabled: {},
    loading: { invoke: { src: 'read', input: ({ context }) => context,
      onDone: { target: 'ready', actions: assign(({ event }) => ({ snapshot: event.output, error: null })) },
      onError: { target: 'error', actions: assign(({ event }) => ({ snapshot: null, error: String(event.error?.message ?? event.error) })) },
    } },
    ready: { on: {
      REFRESH: { target: 'loading' },
      TOGGLE: { guard: ({ context, event }) => context.snapshot?.headOid === context.head && context.snapshot?.baseOid === context.base && context.snapshot.files.some(f => f.path === event.path),
        target: 'saving', actions: assign(({ event }) => ({ change: { path: event.path, viewed: event.viewed }, error: null })) },
    } },
    saving: { invoke: { src: 'write', input: ({ context }) => context,
      onDone: { target: 'ready', actions: assign(({ event }) => ({ snapshot: event.output, change: null, error: null })) },
      onError: { target: 'error', actions: assign(({ event }) => ({ error: String(event.error?.message ?? event.error), change: null })) },
    } },
    error: { on: { REFRESH: { target: 'loading' } } },
  },
});
