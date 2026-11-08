import { assign, setup } from 'xstate';

// Code locations are shareable; Dockview owns personal group geometry separately.
export const workspaceMachine = setup({}).createMachine({
  id: 'review-workspace', initial: 'ready',
  context: ({ input }) => ({ panes: input?.panes ?? [], active: input?.active ?? null, next: 1 }),
  states: { ready: {} },
  on: {
    RESTORE: { actions: assign(({ event }) => ({ panes: event.panes, active: event.active ?? event.panes[0]?.id ?? null })) },
    OPEN: { guard: ({ context }) => context.panes.length < 8, actions: assign(({ context, event }) => {
      let next = context.next;
      while (context.panes.some(p => p.id === `p${next}`)) next++;
      const pane = { view: 'diff', side: 'right', layout: 'split', ...event.location, id: `p${next}` };
      return { panes: [...context.panes, pane], active: pane.id, next: next + 1 };
    }) },
    NAVIGATE: { guard: ({ context, event }) => context.panes.some(p => p.id === event.id), actions: assign(({ context, event }) => ({ active: event.id, panes: context.panes.map(p => p.id === event.id ? { ...p, ...event.patch, id: p.id } : p) })) },
    UPDATE: { actions: assign(({ context, event }) => ({ panes: context.panes.map(p => p.id === (event.id ?? context.active) ? { ...p, ...event.patch, id: p.id } : p) })) },
    ACTIVATE: { guard: ({ context, event }) => context.panes.some(p => p.id === event.id), actions: assign(({ event }) => ({ active: event.id })) },
    CLOSE: { actions: assign(({ context, event }) => {
      const panes = context.panes.filter(p => p.id !== event.id);
      return { panes, active: context.active === event.id ? panes.at(-1)?.id ?? null : context.active };
    }) },
  },
});
