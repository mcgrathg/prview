import { assign, fromPromise, setup } from 'xstate';

export const reviewLookupMachine = setup({
  actors: { lookup: fromPromise(({ input, signal }) => input.lookup({ request: input.request, signal })) },
  delays: { retry: ({ context }) => context.retryMs },
  guards: {
    fetching: ({ context, event }) => event.output.status === 'fetching' && context.attempt < context.maxRetries,
    unavailable: ({ event }) => event.output.status !== 'ok',
    hasResults: ({ event }) => Boolean(event.output.definition || event.output.candidates?.length || event.output.references?.length || event.output.commits?.length),
    hasRequest: ({ context }) => Boolean(context.request),
  },
  actions: {
    request: assign(({ event }) => ({ request: event.request, result: null, error: '', attempt: 0 })),
    result: assign(({ event }) => ({ result: event.output, error: '' })),
    failed: assign(({ event }) => ({ result: null, error: event.error?.message ?? 'Lookup failed.' })),
    notify: ({ context }) => context.onResult?.({ result: context.result, error: context.error, request: context.request }),
    clear: assign({ request: null, result: null, error: '', attempt: 0 }),
  },
}).createMachine({
  id: 'review-code-lookup', initial: 'idle',
  context: ({ input }) => ({ lookup: input.lookup, onResult: input.onResult, request: null, result: null, error: '', attempt: 0, retryMs: input.retryMs ?? 800, maxRetries: input.maxRetries ?? 10 }),
  on: {
    LOAD: { target: '.loading', reenter: true, actions: 'request' },
    CANCEL: { target: '.idle', actions: 'clear' },
    RETRY: { guard: 'hasRequest', target: '.loading', reenter: true, actions: assign({ attempt: 0, result: null, error: '' }) },
  },
  states: {
    idle: {},
    loading: { invoke: { src: 'lookup', input: ({ context }) => ({ lookup: context.lookup, request: context.request }),
      onDone: [
        { guard: 'fetching', target: 'retrying', actions: assign(({ context }) => ({ attempt: context.attempt + 1 })) },
        { guard: 'unavailable', target: 'unavailable', actions: 'result' },
        { guard: 'hasResults', target: 'ready', actions: 'result' },
        { target: 'empty', actions: 'result' },
      ], onError: { target: 'error', actions: 'failed' },
    } },
    retrying: { after: { retry: 'loading' } },
    ready: { entry: 'notify' }, empty: { entry: 'notify' }, unavailable: { entry: 'notify' }, error: { entry: 'notify' },
  },
});
