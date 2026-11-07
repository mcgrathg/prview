import { assign, fromPromise, setup } from 'xstate';

/** One invocation owns one immutable repo/revision/query; exiting aborts its request and retries. */
export const reviewSearchMachine = setup({
  actors: { search: fromPromise(({ input, signal }) => input.search({ ...input.request, signal })) },
  delays: { debounce: ({ context }) => context.debounceMs, retry: ({ context }) => context.retryMs },
  guards: {
    searchable: ({ event }) => event.enabled && typeof event.query === 'string' && event.query.trim().length >= 2,
    retryFetch: ({ context, event }) => event.output.status === 'fetching' && context.attempt < context.maxRetries,
  },
  actions: {
    setRequest: assign(({ event }) => ({ request: { repo: event.repo, sha: event.sha, headRef: event.headRef, query: event.query?.trim() ?? '' }, attempt: 0, matches: [], matchedQuery: '', status: 'ok' })),
    fetching: assign(({ context }) => ({ status: 'fetching', attempt: context.attempt + 1 })),
    result: assign(({ context, event }) => ({ matches: event.output.status === 'ok' ? event.output.matches ?? [] : [], matchedQuery: context.request.query, status: event.output.status === 'fetching' ? 'not-found' : event.output.status })),
    failed: assign({ matches: [], status: 'error' }),
  },
}).createMachine({
  id: 'review-search', initial: 'idle',
  context: ({ input }) => ({ search: input.search, debounceMs: input.debounceMs ?? 100, retryMs: input.retryMs ?? 800, maxRetries: input.maxRetries ?? 15, request: null, matches: [], matchedQuery: '', status: 'ok', attempt: 0 }),
  on: { SEARCH: [
    { guard: 'searchable', target: '.debouncing', reenter: true, actions: 'setRequest' },
    { target: '.idle', reenter: true, actions: 'setRequest' },
  ] },
  states: {
    idle: {},
    debouncing: { after: { debounce: 'loading' } },
    loading: { invoke: { src: 'search', input: ({ context }) => ({ search: context.search, request: context.request }),
      onDone: [{ guard: 'retryFetch', target: 'retrying', actions: 'fetching' }, { target: 'ready', actions: 'result' }],
      onError: { target: 'error', actions: 'failed' },
    } },
    retrying: { after: { retry: 'loading' } },
    ready: {},
    error: {},
  },
});
