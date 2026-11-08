import { assign, createActor, setup } from 'xstate';

export const reviewConfirmationMachine = setup({}).createMachine({
  id: 'review-action-confirmation', initial: 'idle',
  context: { pending: null },
  states: {
    idle: { on: { REQUEST: { target: 'confirming', actions: assign(({ event }) => ({ pending: event.request })) } } },
    confirming: { on: {
      YES: { target: 'idle', actions: [({ context, event }) => context.pending.resolve(event.scope === context.pending.scope), assign({ pending: null })] },
      NO: { target: 'idle', actions: [({ context }) => context.pending.resolve(false), assign({ pending: null })] },
    } },
  },
});

export function createReviewConfirmation() {
  const actor = createActor(reviewConfirmationMachine).start();
  return {
    actor,
    request(request) {
      if (!actor.getSnapshot().matches('idle')) return Promise.resolve(false);
      return new Promise(resolve => actor.send({ type: 'REQUEST', request: { ...request, resolve } }));
    },
    confirm(scope) { actor.send({ type: 'YES', scope }); },
    cancel() { actor.send({ type: 'NO' }); },
    stop() { actor.send({ type: 'NO' }); actor.stop(); },
  };
}
