import { createActor } from 'xstate';
import { expect, test } from 'bun:test';
import { investigationWorkspaceMachine, workspaceSnapshot } from './investigationMachine.js';
import { shareInvestigation, investigationSnapshot } from './investigationState.js';
const location = (file,line=1,rev='a'.repeat(40)) => ({ file, line, rev, view:'source' });
const make = saved => createActor(investigationWorkspaceMachine,{input:{saved,lookup:async()=>({status:'ok',references:[]})}}).start();
const active = actor => actor.getSnapshot().context.items.find(item=>item.id===actor.getSnapshot().context.active).ref;
test('investigations own independent history, search and one reusable preview each',()=>{
 const actor=make(); actor.send({type:'OPEN',title:'Callers',location:location('a.ts',7)}); const first=active(actor);
 first.send({type:'SEARCH',query:'errors'}); first.send({type:'OPEN',location:location('b.ts',9)});
 first.send({type:'INSPECT',location:location('c.ts',3)}); first.send({type:'INSPECT',location:location('d.ts',4)});
 actor.send({type:'OPEN',title:'Tests',location:location('test.ts',11)}); const second=active(actor); second.send({type:'INSPECT',location:location('helper.ts',2)});
 expect(first.getSnapshot().context.preview.trail.map(x=>x.file)).toEqual(['c.ts','d.ts']);
 expect(second.getSnapshot().context.preview.trail.map(x=>x.file)).toEqual(['helper.ts']);
 first.send({type:'PREVIEW.BACK'}); expect(first.getSnapshot().context.preview.location.file).toBe('c.ts');
 first.send({type:'KEEP'}); expect(first.getSnapshot().context.preview).toBeNull(); expect(first.getSnapshot().context.pinned[0].file).toBe('c.ts');
 first.send({type:'HISTORY.BACK'}); expect(first.getSnapshot().context.location).toMatchObject({file:'a.ts',line:7}); expect(first.getSnapshot().context.search).toBe('errors');
 expect(second.getSnapshot().context.location.file).toBe('test.ts'); actor.stop();
});
test('promote, keep beside and return are separate; snapshot reload preserves identities and revision trails',()=>{
 const actor=make(); actor.send({type:'OPEN',location:location('a.ts',9)}); const first=active(actor); actor.send({type:'PROMOTE',id:first.id});
 first.send({type:'INSPECT',location:location('old.ts',3,'b'.repeat(40))}); first.send({type:'KEEP'});
 actor.send({type:'OPEN',location:location('b.ts',4)}); const second=active(actor); actor.send({type:'REVIEW'});
 const saved=workspaceSnapshot(actor); const restored=make(saved);
 expect(workspaceSnapshot(restored)).toEqual(saved); expect(saved.main).toBe(first.id); expect(saved.active).toBeNull();
 restored.send({type:'SELECT',id:first.id}); expect(active(restored).getSnapshot().context.pinned[0].rev).toBe('b'.repeat(40));
 restored.send({type:'CLOSE',id:first.id}); expect(restored.getSnapshot().context.active).toBeNull(); expect(restored.getSnapshot().context.items[0].id).toBe(second.id);
 actor.stop(); restored.stop();
});
test('closing one investigation aborts its request and cannot change its sibling',async()=>{
 let signal,resolve; const pending=new Promise(r=>resolve=r);
 const actor=createActor(investigationWorkspaceMachine,{input:{lookup:async input=>{signal=input.signal;return pending;}}}).start();
 actor.send({type:'OPEN',location:location('a.ts')}); const first=active(actor);
 first.send({type:'LOOKUP',request:{kind:'definition',rev:'a'.repeat(40)}});
 actor.send({type:'OPEN',location:location('b.ts')}); const second=active(actor);
 actor.send({type:'CLOSE',id:first.id}); expect(signal.aborted).toBe(true);
 resolve({status:'ok',definition:{path:'late.ts',line:5}}); await new Promise(r=>setTimeout(r,0));
 expect(second.getSnapshot().context.location.file).toBe('b.ts'); expect(second.getSnapshot().context.preview).toBeNull(); actor.stop();
});
test('URL restoration resumes exact pinned location and rejects traversal or missing revisions',()=>{
 const actor=make(); actor.send({type:'URL.RESTORE',state:{id:'shared',title:'Shared question',location:location('a.ts',42)}});
 expect(active(actor).getSnapshot().context.location.line).toBe(42);
 actor.send({type:'URL.RESTORE',state:{id:'invalid',location:location('../outside.ts')}}); expect(actor.getSnapshot().context.items).toHaveLength(1);
 actor.stop();
});

test('closing a preview or changing working location cancels its definition before late completion',async()=>{
 for (const command of [{type:'PREVIEW.CLOSE'},{type:'KEEP'},{type:'OPEN',location:location('new.ts')}]) {
  let signal,resolve;const pending=new Promise(r=>resolve=r);
  const actor=createActor(investigationWorkspaceMachine,{input:{lookup:async input=>{signal=input.signal;return pending;}}}).start();
  actor.send({type:'OPEN',location:location('a.ts')});const child=active(actor);
  child.send({type:'INSPECT',location:location('b.ts')});child.send({type:'LOOKUP',request:{kind:'definition',rev:'a'.repeat(40)}});
  child.send(command);expect(signal.aborted).toBe(true);resolve({status:'ok',definition:{path:'late.ts',line:9}});await new Promise(r=>setTimeout(r,0));
  expect(child.getSnapshot().context.preview).toBeNull();actor.stop();
 }
});
test('browser restoration moves the private history cursor without losing forward entries',()=>{
 const actor=make();actor.send({type:'OPEN',location:location('a.ts')});const child=active(actor);
 child.send({type:'OPEN',location:location('b.ts')});const earlier=shareInvestigation(investigationSnapshot(child));
 child.send({type:'OPEN',location:location('c.ts')});actor.send({type:'URL.RESTORE',state:earlier});
 expect(child.getSnapshot().context.history.map(item=>item.file)).toEqual(['a.ts','b.ts','c.ts']);
 expect(child.getSnapshot().context.cursor).toBe(1);child.send({type:'HISTORY.FORWARD'});expect(child.getSnapshot().context.location.file).toBe('c.ts');actor.stop();
});
test('a history URL at capacity restores its identity while archiving the displaced question',()=>{
 const actor=make();actor.send({type:'OPEN',location:location('old.ts')});const old=investigationSnapshot(active(actor));actor.send({type:'CLOSE',id:old.id});
 for(let i=0;i<8;i++)actor.send({type:'OPEN',title:`Question ${i}`,location:location(`file${i}.ts`)});
 const before=workspaceSnapshot(actor);actor.send({type:'URL.RESTORE',state:old});const after=workspaceSnapshot(actor);
 expect(after.active).toBe(old.id);expect(after.investigations).toHaveLength(8);
 const displaced=before.investigations.find(item=>!after.investigations.some(next=>next.id===item.id));
 expect(after.archived.some(item=>item.id===displaced.id)).toBe(true);expect(after.archived.some(item=>item.id===old.id)).toBe(false);actor.stop();
});
