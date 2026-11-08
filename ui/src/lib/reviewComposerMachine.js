import { assign, fromPromise, setup } from 'xstate';
import { reviewDraftKey } from './reviewDrafts.js';

const submitEvent = {
  guard: ({ context, event }) => Boolean(context.body.trim() && event.attachmentBusy !== true && reviewDraftKey(context.target) && context.target.headSha === event.currentHead && (event.mode === 'immediate' || (event.mode === 'staged' && event.stagingAllowed))),
  target: 'submitting',
  actions: assign(({ event }) => ({ mode: event.mode, error: '' })),
};
const editing = {
  CHANGE: { target: 'editing', actions: assign(({ context, event }) => {
    const saved = context.save(event.body, event.previousBody ?? context.body);
    return { body: saved.body, error: '', storageError: saved.error };
  }) },
  SYNC: { target: 'editing', actions: assign(({ event }) => ({ body: event.body, error: '' })) },
  SUBMIT: submitEvent,
  CANCEL: { target: 'idle', actions: ({ context }) => context.close() },
  DISCARD: { target: 'idle', actions: ({ context }) => context.close() },
  FAILURE: { target: 'error', actions: assign(({ event }) => ({ error: event.message })) },
};
export const reviewComposerMachine = setup({
  actors: { submit: fromPromise(({ input }) => input.submit(input.target, input.body, input.mode)) },
}).createMachine({
  id: 'review-composer', initial: 'idle',
  context: ({ input }) => ({ ...input, target: Object.freeze({ ...input.target }), body: input.body ?? '', mode: 'staged', error: '', storageError: '' }),
  states: {
    idle: { on: { OPEN: 'editing' } },
    editing: { on: editing },
    error: { on: editing },
    saved: { on: { CANCEL: editing.CANCEL, DISCARD: editing.DISCARD, FAILURE: { actions: assign(({ event }) => ({ error: event.message })) } } },
    submitting: {
      invoke: {
        src: 'submit', input: ({ context }) => context,
        onDone: [
          { guard: ({ event }) => Boolean(event.output?.cleanupError), target: 'saved', actions: assign(({ event }) => ({ error: event.output.cleanupError })) },
          { target: 'idle', actions: ({ context }) => context.close() },
        ],
        onError: { target: 'error', actions: assign(({ event }) => ({ error: event.error?.message ?? 'Comment could not be saved. Retry when ready.' })) },
      },
    },
  },
});
