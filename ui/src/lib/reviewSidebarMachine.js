import { setup } from 'xstate';

export const reviewSidebarMachine = setup({}).createMachine({
  id: 'review-sidebar', initial: 'restoring',
  states: {
    restoring: { always: [{ guard: ({ context }) => context.pinned, target: 'pinned' }, { target: 'closed' }] },
    pinned: { on: { COLLAPSE: 'closed' } },
    closed: { on: { POINTER_ENTER: 'peeking', FOCUS_ENTER: 'opened', OPEN: 'opened', PIN: 'pinned' } },
    peeking: { on: { POINTER_LEAVE: 'closed', FOCUS_ENTER: 'opened', OPEN: 'opened', PIN: 'pinned', CLOSE: 'closed' } },
    opened: { on: { FOCUS_LEAVE: [{ guard: ({ event }) => event.hovered, target: 'peeking' }, { target: 'closed' }], PIN: 'pinned', CLOSE: 'closed' } },
  },
  context: ({ input }) => ({ pinned: input?.pinned !== false }),
});
