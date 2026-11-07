import { assign, fromPromise, setup } from 'xstate';
import { defaultRules, roleLabels, type Role, type Visibility, type VisibilityRules } from './analysis.ts';
import type { Capture } from './analysis.ts';
import type { ReferenceGraph } from './relationships.ts';

export interface Comparison { repo: string; number: number; base: string; head: string }
export const organizationKey = (comparison: Comparison) => `${comparison.repo}#${comparison.number}:${comparison.base}...${comparison.head}`;
export type OrganizationOrder = 'attention' | 'original' | 'volume' | 'flow';
export interface Controls {
  order: OrganizationOrder; query: string; rules: VisibilityRules; overrides: Record<string, Visibility>;
  root?: string; expanded: string[]; folders: boolean;
}
export const defaultControls = (): Controls => ({ order: 'attention', query: '', rules: { ...defaultRules }, overrides: {}, expanded: [], folders: false });
interface Context extends Controls {
  comparison: Comparison; result: { capture: Capture; graph: ReferenceGraph } | null; error: string | null;
}
type Event =
  | { type: 'COMPARISON.SET'; comparison: Comparison }
  | { type: 'CONTROLS.RESTORE'; controls: Controls }
  | { type: 'RETRY' | 'SHOW_ALL' | 'GROUP.TOGGLE' }
  | { type: 'ORDER.SET'; order: OrganizationOrder }
  | { type: 'QUERY.SET'; query: string }
  | { type: 'ROLE.SET'; role: Role; visibility?: Visibility }
  | { type: 'ROLE.RESET'; role: Role }
  | { type: 'FILE.SET'; path: string; visibility?: Visibility }
  | { type: 'FILE.TOGGLE'; path: string }
  | { type: 'FLOW.FOLLOW'; path?: string };

export const organizationMachine = setup({
  types: { context: {} as Context, events: {} as Event, input: {} as { comparison: Comparison } },
  actors: {
    load: fromPromise(async ({ input, signal }: { input: Comparison; signal: AbortSignal }) => {
      const response = await fetch(`/api/review-organization?${new URLSearchParams({
        repo: input.repo, number: String(input.number), base: input.base, head: input.head,
      })}`, { signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? `Organization request failed (${response.status})`);
      if (result.capture.repository !== input.repo || result.capture.head_sha !== input.head || result.capture.reported_base_sha !== input.base) {
        throw new Error('Source analysis belongs to another comparison.');
      }
      return result as Context['result'];
    }),
  },
}).createMachine({
  id: 'organization', initial: 'loading',
  context: ({ input }) => ({ ...defaultControls(), comparison: input.comparison, result: null, error: null }),
  on: {
    'CONTROLS.RESTORE': { actions: assign(({ event }) => ({ ...event.controls })) },
    'COMPARISON.SET': {
      guard: ({ context, event }) => organizationKey(context.comparison) !== organizationKey(event.comparison),
      target: '.loading', reenter: true,
      actions: assign(({ event }) => ({ ...defaultControls(), comparison: event.comparison, result: null, error: null })),
    },
    'ORDER.SET': { actions: assign(({ event }) => ({ order: event.order, ...(event.order === 'flow' ? { folders: false } : {}) })) },
    'QUERY.SET': { actions: assign(({ event }) => ({ query: event.query })) },
    'ROLE.SET': {
      guard: ({ event }) => Object.hasOwn(roleLabels, event.role),
      actions: assign(({ context, event }) => {
        const rules = { ...context.rules };
        if (event.visibility) rules[event.role] = event.visibility; else delete rules[event.role];
        return { rules, expanded: [] };
      }),
    },
    'ROLE.RESET': { actions: assign(({ context, event }) => {
      const rules = { ...context.rules };
      if (defaultRules[event.role]) rules[event.role] = defaultRules[event.role]; else delete rules[event.role];
      return { rules, expanded: [] };
    }) },
    'FILE.SET': { actions: assign(({ context, event }) => {
      const overrides = { ...context.overrides };
      if (event.visibility) overrides[event.path] = event.visibility; else delete overrides[event.path];
      return { overrides };
    }) },
    'FILE.TOGGLE': { actions: assign(({ context, event }) => ({ expanded: context.expanded.includes(event.path)
      ? context.expanded.filter(path => path !== event.path) : [...context.expanded, event.path] })) },
    'FLOW.FOLLOW': { actions: assign(({ event }) => ({ order: 'flow' as const, root: event.path, folders: false })) },
    'GROUP.TOGGLE': { guard: ({ context }) => context.order !== 'flow', actions: assign(({ context }) => ({ folders: !context.folders })) },
    SHOW_ALL: { actions: assign(() => ({ rules: {}, overrides: {}, expanded: [] })) },
  },
  states: {
    loading: { invoke: { src: 'load', input: ({ context }) => context.comparison,
      onDone: { target: 'ready', actions: assign(({ event }) => ({ result: event.output, error: null })) },
      onError: { target: 'error', actions: assign(({ event }) => ({ result: null, error: String(event.error) })) },
    } },
    ready: {},
    error: { on: { RETRY: { target: 'loading', actions: assign({ error: null }) } } },
  },
});
