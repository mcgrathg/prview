import { createActor } from 'xstate';
import { investigationWorkspaceMachine, workspaceSnapshot } from './investigationMachine.js';
import { investigationSnapshot, normalizeInvestigation, shareInvestigation } from './investigationState.js';
const signature = value => JSON.stringify(shareInvestigation(value));
export function createInvestigationSession({ key, storage, initial, lookup, onLocation, onError = () => {} }) {
  let saved, writable = true, disposed = false, ready = false, restoring = false, lastRoute = signature(initial),activeResearch=null;
  try { saved = JSON.parse(storage.getItem(key) ?? 'null'); }
  catch { writable = false; onError('Saved investigations could not be read. This session will stay in memory.'); }
  const actor = createActor(investigationWorkspaceMachine,{input:{saved:{...saved,active:null},lookup}}).start();
  function persist() {
    if (!writable || disposed) return;
    try { storage.setItem(key,JSON.stringify(workspaceSnapshot(actor))); }
    catch { writable=false; onError('Autosave failed. Keep this page open to retain these investigations.'); }
  }
  function active() { return actor.getSnapshot().context.items.find(item=>item.id===actor.getSnapshot().context.active)?.ref; }
  function resumeResearch(){const child=active();if(child!==activeResearch){activeResearch=child;child?.send({type:'BROWSER.RESUME'});}}
  function publish(mode='push') {
    if (!ready || restoring || disposed) return;
    resumeResearch();persist();
    const child=active(); const state=child ? investigationSnapshot(child) : undefined;
    const next=signature(state);
    if(next!==lastRoute) { lastRoute=next; onLocation(state,mode); }
  }
  const subscription=actor.subscribe(()=>{if(ready && !restoring)queueMicrotask(()=>publish());});
  function restore(value) {
    if(disposed)return;
    const state=normalizeInvestigation(value); const next=signature(state);
    lastRoute=next; restoring=true;
    try {
      if(state) {
        const item=actor.getSnapshot().context.items.find(item=>item.id===state.id);
        if(item && signature(investigationSnapshot(item.ref))===next)actor.send({type:'SELECT',id:state.id});
        else actor.send({type:'URL.RESTORE',state});
      } else actor.send({type:'REVIEW'});
      resumeResearch();
    } finally { restoring=false; }
    persist();
  }
  restore(initial); ready=true;
  return { actor,active,restore,
    command(event,mode='push') { actor.send(event); publish(mode); },
    send(event,mode='push') { active()?.send(event); publish(mode); },
    dispose() { disposed=true; subscription.unsubscribe(); actor.stop(); },
  };
}
