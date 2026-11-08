import { assign, setup, sendParent, sendTo, stopChild } from 'xstate';
import {normalizeRepositoryBrowser,repositoryBrowserRequest} from './repositoryBrowserState.js';
import { reviewLookupMachine } from './reviewLookupMachine.js';
import { investigationSnapshot, normalizeInvestigation, restoreInvestigation, sourceLocation } from './investigationState.js';
const changed = sendParent({ type: 'CHILD.CHANGED' });
function inspect(context, location) {
  const target = sourceLocation(location);
  if (!target) return {};
  return { preview: { location: target, origin: context.preview?.origin ?? context.location,
    trail: [...(context.preview?.trail ?? []), target].slice(-20) } };
}
export const investigationMachine = setup({ actors: { lookup: reviewLookupMachine, research:reviewLookupMachine },actions:{resumeResearch:({context,self})=>{const child=self.getSnapshot().children.research;if(!context.browser.open || !child)return;const snapshot=child.getSnapshot(),request=repositoryBrowserRequest(context.browser);if(snapshot.matches('idle') || JSON.stringify(snapshot.context.request)!==JSON.stringify(request))child.send({type:'LOAD',request});}} }).createMachine({
  id: 'investigation', initial: 'active',
  context: ({ input }) => ({ ...normalizeInvestigation(input.state), lookup: input.lookup, version: 0 }),
  invoke: [{id:'research',src:'research',input:({context})=>({lookup:context.lookup}),onSnapshot:{actions:[assign(({context})=>({version:context.version+1})),changed]}}, { id: 'lookup', src: 'lookup', input: ({ context }) => ({ lookup: context.lookup }),
    onSnapshot: { actions: [assign(({ context, event }) => {
      const snapshot = event.snapshot;
      const definition = snapshot.context.result?.definition;
      return { version: context.version + 1, ...(snapshot.matches('ready') && definition && snapshot.context.request?.kind === 'definition' ? inspect(context, { file: definition.path, line: definition.line, rev: snapshot.context.request.rev, base: snapshot.context.request.base }) : {}) };
    }), changed] } }],
  states: { active: {} },
  on: {
    OPEN: { guard: ({ event }) => Boolean(sourceLocation(event.location)), actions: [sendTo('lookup', { type:'CANCEL' }), assign(({ context, event }) => {
      const location = sourceLocation(event.location);
      const history = [...context.history.slice(0, context.cursor + 1), location].slice(-20);
      return { location, history, cursor: history.length - 1, preview: null };
    }), changed] },
    INSPECT: { actions: [sendTo('lookup', { type:'CANCEL' }), assign(({ context, event }) => inspect(context, event.location)), changed] },
    'PREVIEW.BACK': { guard: ({ context }) => context.preview?.trail.length > 1, actions: [sendTo('lookup', { type:'CANCEL' }), assign(({ context }) => { const trail = context.preview.trail.slice(0,-1); return { preview: { ...context.preview, location: trail.at(-1), trail } }; }), changed] },
    'PREVIEW.CLOSE': { actions: [sendTo('lookup', { type:'CANCEL' }), assign({ preview: null }), changed] },
    KEEP: { guard: ({ context }) => Boolean(context.preview), actions: [sendTo('lookup', { type:'CANCEL' }), assign(({ context }) => ({ pinned: [...context.pinned, context.preview.location].slice(-2), preview: null })), changed] },
    PIN: {guard:({event})=>Boolean(sourceLocation(event.location)),actions:[sendTo('lookup',{type:'CANCEL'}),assign(({context,event})=>({pinned:[...context.pinned,sourceLocation(event.location)].slice(-2),preview:null})),changed]},
    UNPIN: { actions: [sendTo('lookup', { type:'CANCEL' }), assign(({ context, event }) => ({ pinned: context.pinned.filter((_,index) => index !== event.index) })), changed] },
    'HISTORY.BACK': { guard: ({ context }) => context.cursor > 0, actions: [sendTo('lookup', { type:'CANCEL' }), assign(({ context }) => ({ cursor: context.cursor - 1, location: context.history[context.cursor - 1], preview: null })), changed] },
    'HISTORY.FORWARD': { guard: ({ context }) => context.cursor < context.history.length - 1, actions: [sendTo('lookup', { type:'CANCEL' }), assign(({ context }) => ({ cursor: context.cursor + 1, location: context.history[context.cursor + 1], preview: null })), changed] },
    TITLE: { actions: [assign(({ event }) => ({ title: String(event.title).slice(0,160) })), changed] },
    SEARCH: {actions:[assign(({context,event})=>({search:String(event.query).slice(0,1024),browser:{...context.browser,query:String(event.query).slice(0,1024)}})),changed]},
    'BROWSER.SET':{actions:[sendTo('lookup',{type:'CANCEL'}),assign(({context,event})=>{const browser=normalizeRepositoryBrowser({...context.browser,...event.patch,open:true},context.location,context.search,sourceLocation);return {browser,search:browser.query};}),sendTo('research',({context,event})=>({type:event.immediate ? 'LOAD' : 'QUERY',request:repositoryBrowserRequest(context.browser)})),changed]},
    'BROWSER.FILTER':{actions:[assign(({context,event})=>({browser:normalizeRepositoryBrowser({...context.browser,filter:event.filter,scope:event.scope ?? context.browser.scope},context.location,context.search,sourceLocation)})),changed]},
    'BROWSER.CLOSE':{actions:[sendTo('research',{type:'CANCEL'}),assign(({context})=>({browser:{...context.browser,open:false}})),changed]},
    'BROWSER.RESUME':{actions:'resumeResearch'},
    LOOKUP: { actions: sendTo('lookup', ({ event }) => ({ type: 'LOAD', request: event.request })) },
    'LOOKUP.CANCEL': { actions: sendTo('lookup', { type: 'CANCEL' }) },
    RESTORE: { guard: ({ event }) => Boolean(normalizeInvestigation(event.state)), actions: [sendTo('lookup', { type: 'CANCEL' }),sendTo('research',{type:'CANCEL'}), assign(({ context, event }) => restoreInvestigation(context,event.state)), 'resumeResearch',changed] },
  },
});
export function workspaceSnapshot(actor) {
  const { items, active, main } = actor.getSnapshot().context;
  return { version: 1, active, main, investigations: items.map(item => investigationSnapshot(item.ref)), archived: actor.getSnapshot().context.archived };
}
function victim(context) { return context.items.find(item=>item.id!==context.active && item.id!==context.main) ?? context.items.find(item=>item.id!==context.main) ?? context.items[0]; }
const restoreItem = assign(({ context, event, spawn }) => {
  const state = normalizeInvestigation(event.state);
  const item = context.items.find(item=>item.id===state.id);
  if (item) { item.ref.send({type:'RESTORE',state}); return {active:item.id,notice:''}; }
  const removed = context.items.length >= 8 ? victim(context) : null;
  const archived = context.archived.filter(item=>item.id!==state.id);
  if (removed) archived.push(investigationSnapshot(removed.ref));
  return { items:[...context.items.filter(item=>item!==removed), {id:state.id,ref:spawn('investigation',{id:state.id,input:{state,lookup:context.lookup}})}],
    active:state.id, notice:removed ? `${removed.ref.getSnapshot().context.title} moved to saved questions to restore this link.` : '', main:context.main===removed?.id ? null : context.main, archived:archived.slice(-24) };
});
export const investigationWorkspaceMachine = setup({ actors: { investigation: investigationMachine } }).createMachine({
  id: 'investigation-workspace', initial: 'ready',
  context: ({ input, spawn }) => {
    const states = (Array.isArray(input?.saved?.investigations) ? input.saved.investigations : []).slice(0,8).map(normalizeInvestigation).filter(Boolean);
    const seen = new Set();
    const items = states.filter(state => !seen.has(state.id) && seen.add(state.id)).map(state => ({ id: state.id, ref: spawn('investigation', { id: state.id, input: { state, lookup: input.lookup } }) }));
    const archived = (Array.isArray(input?.saved?.archived) ? input.saved.archived : []).slice(-24).map(normalizeInvestigation).filter(Boolean);
    return { items, archived, notice:'', active: items.some(item => item.id === input?.saved?.active) ? input.saved.active : null, main: input?.saved?.main ?? null, next: 1, lookup: input.lookup, version: 0 };
  },
  states: { ready: {} },
  on: {
    'CHILD.CHANGED': { actions: assign(({ context }) => ({ version: context.version + 1 })) },
    OPEN: { guard: ({ context, event }) => context.items.length < 8 && Boolean(sourceLocation(event.location)), actions: assign(({ context, event, spawn }) => {
      let next = context.next; while ([...context.items,...context.archived].some(item => item.id === `i${next}`)) next++;
      const id = `i${next}`;
      const state = normalizeInvestigation({ id, title: event.title ?? 'New question', location: event.location });
      return { items: [...context.items, { id, ref: spawn('investigation', { id, input: { state, lookup: context.lookup } }) }], active: id, next: next + 1 };
    }) },
    SELECT: { guard: ({ context, event }) => context.items.some(item => item.id === event.id), actions: assign(({ event }) => ({ active: event.id })) },
    REVIEW: { actions: assign({ active: null }) },
    PROMOTE: { guard: ({ context, event }) => context.items.some(item => item.id === event.id), actions: assign(({ event }) => ({ active: event.id, main: event.id })) },
    CLOSE: { guard: ({ context, event }) => context.items.some(item => item.id === event.id), actions: [stopChild(({ context, event }) => context.items.find(item => item.id === event.id).ref), assign(({ context, event }) => ({ items: context.items.filter(item => item.id !== event.id), archived:[...context.archived.filter(item=>item.id!==event.id), investigationSnapshot(context.items.find(item=>item.id===event.id).ref)].slice(-24), active: context.active === event.id ? null : context.active, main: context.main === event.id ? null : context.main }))] },
    'URL.RESTORE': [
      { guard: ({ context,event }) => Boolean(normalizeInvestigation(event.state)) && context.items.length>=8 && !context.items.some(item=>item.id===event.state.id), actions:[stopChild(({context})=>victim(context).ref),restoreItem] },
      { guard: ({event})=>Boolean(normalizeInvestigation(event.state)), actions:restoreItem },
    ],
  },
});
