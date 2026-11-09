import { assign, setup } from 'xstate';
import { fuzzyMatch } from './fuzzy.js';

export function matchingCommands(commands, query) {
  const text = query.replace(/^\s*>\s*/, '').trim().toLowerCase();
  return commands.flatMap(command => {
    const match = text ? fuzzyMatch(text, `${command.title} ${command.keywords ?? ''}`.toLowerCase()) : { score: 0 };
    return match ? [{ ...command, score: match.score }] : [];
  }).sort((a, b) => b.score - a.score);
}
export const quickCommandMachine = setup({}).createMachine({
  id: 'quick-commands', initial: 'closed', context: { query: '', selected: 0, commands: [] },
  on: {
    COMMANDS: { actions: assign(({ event, context }) => ({ commands: event.commands, selected: Math.min(context.selected, Math.max(0, matchingCommands(event.commands, context.query).length - 1)) })) },
  },
  states: {
    closed: { on: { OPEN: { target: 'open', actions: assign(({ event }) => ({ query: event.query ?? '', selected: 0 })) } } },
    open: { on: {
      OPEN: { actions: assign(({ event }) => ({ query: event.query ?? '', selected: 0 })) },
      QUERY: { actions: assign(({ event }) => ({ query: event.query, selected: 0 })) },
      MOVE: { actions: assign(({ context, event }) => ({ selected: Math.max(0, Math.min(matchingCommands(context.commands, context.query).length - 1, context.selected + event.delta)) })) },
      SELECT: { actions: assign(({ context, event }) => ({ selected: Math.max(0, Math.min(matchingCommands(context.commands, context.query).length - 1, event.index)) })) },
      CLOSE: { target: 'closed', actions: assign({ query: '', selected: 0 }) },
    } },
  },
});
