import { expect,test } from 'bun:test';
import { createInvestigationSession } from './investigationSession.js';
import { shareInvestigation } from './investigationState.js';
const location=(file,line=1)=>({file,line,rev:'a'.repeat(40)});
function fixture() {
 const values=new Map(),urls=[];
 const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 let session;
 const open=initial=>session=createInvestigationSession({key:'test',storage,initial,lookup:async()=>({status:'ok',references:[]}),onLocation:(state,mode)=>{urls.push({state,mode});session.restore(shareInvestigation(state));}});
 return {values,urls,open,get session(){return session;}};
}
test('same-turn edits persist before URL round trips and reload keeps independent questions',async()=>{
 const f=fixture(),s=f.open();s.command({type:'OPEN',location:location('a.ts')});s.send({type:'TITLE',title:'Validation'},'replace');s.send({type:'SEARCH',query:'errors'},'replace');
 s.command({type:'OPEN',location:location('b.ts')});s.send({type:'TITLE',title:'Callers'},'replace');s.send({type:'SEARCH',query:'usage'},'replace');
 s.command({type:'REVIEW'});await new Promise(r=>setTimeout(r,0));
 expect(f.urls.at(-1).state).toBeUndefined();
 const saved=JSON.parse(f.values.get('test'));expect(saved.investigations.map(x=>[x.title,x.search])).toEqual([['Validation','errors'],['Callers','usage']]);
 s.dispose();const restored=f.open();expect(restored.actor.getSnapshot().context.items.map(x=>x.ref.getSnapshot().context.title)).toEqual(['Validation','Callers']);expect(restored.active()).toBeUndefined();restored.dispose();
});
test('history restoration never publishes a replacement URL and retains forward context',async()=>{
 const f=fixture(),s=f.open();s.command({type:'OPEN',location:location('a.ts')});s.send({type:'OPEN',location:location('b.ts')});const earlier=shareInvestigation(f.urls.at(-1).state);
 s.send({type:'OPEN',location:location('c.ts')});const count=f.urls.length;s.restore(earlier);await new Promise(r=>setTimeout(r,0));
 expect(f.urls).toHaveLength(count);expect(s.active().getSnapshot().context.location.file).toBe('b.ts');s.send({type:'HISTORY.FORWARD'});expect(s.active().getSnapshot().context.location.file).toBe('c.ts');s.dispose();
});
test('a lookup finishing after Return to review does not reopen the investigation',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r),urls=[];const values=new Map();
 const s=createInvestigationSession({key:'test',storage:{getItem:()=>null,setItem:(k,v)=>values.set(k,v)},lookup:()=>pending,onLocation:state=>urls.push(state)});
 s.command({type:'OPEN',location:location('a.ts')});s.send({type:'LOOKUP',request:{kind:'definition',rev:'a'.repeat(40)}});s.command({type:'REVIEW'});
 resolve({status:'ok',definition:{path:'helper.ts',line:9}});await new Promise(r=>setTimeout(r,0));expect(urls.at(-1)).toBeUndefined();expect(s.active()).toBeUndefined();expect(JSON.parse(values.get('test')).investigations[0].preview.location.file).toBe('helper.ts');s.dispose();
});
test('failed storage reports the limitation without pretending the session was saved',()=>{
 const errors=[];const s=createInvestigationSession({key:'test',storage:{getItem:()=>null,setItem:()=>{throw new Error('full');}},lookup:async()=>({status:'ok'}),onLocation:()=>{},onError:error=>errors.push(error)});
 s.command({type:'OPEN',location:location('a.ts')});expect(errors).toHaveLength(1);expect(errors[0]).toContain('Autosave failed');s.dispose();
});

test('PR sessions keep separate storage and teardown rejects an old PR lookup completion',async()=>{
 const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 let resolve;const pending=new Promise(r=>resolve=r);const changes=[];
 const old=createInvestigationSession({key:'owner/old#1',storage,lookup:()=>pending,onLocation:()=>{}});
 old.command({type:'OPEN',title:'Old PR question',location:location('old.ts')});old.send({type:'LOOKUP',request:{kind:'definition',rev:'a'.repeat(40)}});old.dispose();
 const next=createInvestigationSession({key:'owner/new#2',storage,lookup:async()=>({status:'ok'}),onLocation:state=>changes.push(state)});
 resolve({status:'ok',definition:{path:'late-old.ts',line:9}});await new Promise(r=>setTimeout(r,0));
 expect(next.actor.getSnapshot().context.items).toHaveLength(0);expect(changes).toEqual([]);
 expect(JSON.parse(values.get('owner/old#1')).investigations[0].title).toBe('Old PR question');expect(JSON.parse(values.get('owner/new#2')).investigations).toEqual([]);next.dispose();
});
