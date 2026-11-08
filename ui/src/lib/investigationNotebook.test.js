import {test,expect} from 'bun:test';
import {createNotebookSession,notebookSnapshot,normalizeEvidence,normalizeDraftTarget,evidenceHref,appendFindingDraft} from './investigationNotebook.js';
import {shareInvestigation} from './investigationState.js';
import {createReviewDraftStore} from './reviewDrafts.js';
const head='a'.repeat(40),base='b'.repeat(40);
const location={file:'src/code.ts',line:12,rev:head,base};
const target={repo:'test/repo',number:1,headSha:head,path:'src/change.ts',side:'RIGHT',line:13};
const evidence={...location,repo:'test/repo',endLine:14,excerpt:'actual source'};
const checkpoint={id:'i1',title:'Find callers',location,search:'validation',history:[location],cursor:0,pinned:[location]};
function storage(){const data=new Map();return {get length(){return data.size;},key:index=>[...data.keys()][index] ?? null,getItem:key=>data.get(key) ?? null,setItem:(key,value)=>data.set(key,value),data};}
let fixtureId=0;
function session(store,key='pr1'){return createNotebookSession({key,storage:store,now:()=>1234,createId:()=>`${key}-${++fixtureId}`});}

test('findings, evidence and checkpoints survive disposal without depending on a question view',()=>{
  const store=storage(),first=session(store);
  first.command({type:'CREATE',body:'Review this behavior',question:'Find callers',investigationId:'i1',target});
  first.command({type:'EVIDENCE',evidence});first.command({type:'CHECKPOINT',checkpoint});first.dispose();
  const restored=session(store);const item=restored.actor.getSnapshot().context.items[0];
  expect(item.body).toBe('Review this behavior');expect(item.evidence[0].rev).toBe(head);expect(item.target.headSha).toBe(head);
  expect(item.checkpoint.search).toBe('validation');expect(item.checkpoint.pinned[0].file).toBe('src/code.ts');
  restored.command({type:'EDIT',body:'Retained after the PR moves'});expect(restored.actor.getSnapshot().context.items[0].evidence[0].rev).toBe(head);restored.dispose();
});

test('PR keys and independent open tabs retain their findings when either tab autosaves',()=>{
  const store=storage(),left=session(store,'pr1'),right=session(store,'pr1'),other=session(store,'pr2');
  left.command({type:'CREATE',body:'First'});
  right.command({type:'CREATE',body:'Second'});
  left.command({type:'EDIT',body:'First revised'});
  right.refresh();expect(right.actor.getSnapshot().context.items.map(item=>item.body).sort()).toEqual(['First revised','Second']);
  expect(other.actor.getSnapshot().context.items).toHaveLength(0);
  left.dispose();right.dispose();other.dispose();
});

test('unreadable or unavailable storage never overwrites saved bytes and keeps new notes in memory',()=>{
  for(const raw of ['bad json',JSON.stringify({version:2,items:[]}),JSON.stringify({version:1,items:[{body:'Do not discard',id:'bad id'}]}),JSON.stringify({version:1,items:[{id:'valid-id',body:'x'.repeat(50001)}]}),JSON.stringify({version:1,items:[{id:'valid-id',body:'Retain invalid evidence bytes',evidence:[{...evidence,rev:'invalid'}]}]})]){
    const store=storage();store.setItem('pr1',raw);const errors=[];
    const current=createNotebookSession({key:'pr1',storage:store,onError:error=>errors.push(error),createId:()=> 'new-finding'});
    current.command({type:'CREATE',body:'Unsaved private note'});expect(store.getItem('pr1')).toBe(raw);
    expect(current.actor.getSnapshot().context.items[0].body).toBe('Unsaved private note');expect(errors.at(-1)).toContain('copy');current.dispose();
  }
  const errors=[];const current=createNotebookSession({key:'pr1',storage:{getItem:()=>null,setItem:()=>{throw new Error('blocked');}},onError:error=>errors.push(error),createId:()=> 'new-finding'});
  current.command({type:'CREATE',body:'Still here'});expect(errors.at(-1)).toContain('autosave failed');expect(current.actor.getSnapshot().context.items[0].body).toBe('Still here');current.dispose();
});

test('evidence is pinned, bounded and safely linked while invalid paths/revisions/targets are rejected',()=>{
  expect(normalizeEvidence({...evidence,file:'../outside'})).toBeNull();expect(normalizeEvidence({...evidence,rev:'main'})).toBeNull();
  expect(normalizeDraftTarget({...target,path:'../outside'})).toBeNull();expect(normalizeDraftTarget({...target,headSha:'main'})).toBeNull();
  const shortened=normalizeEvidence({...evidence,excerpt:'x'.repeat(9000)});expect(shortened.excerpt).toHaveLength(8000);expect(shortened.truncated).toBe(true);
  expect(evidenceHref({...evidence,file:'src/a[b].ts'})).toContain('src/a%5Bb%5D.ts#L12-L14');
});

test('draft conversion appends exact evidence without losing an existing inline draft or attachments',()=>{
  const saved=storage();const store=createReviewDraftStore(()=>saved);const existing='Already reviewing this.\n\n![shot](https://github.com/user-attachments/assets/synthetic)';
  store.write(target,existing);const finding={body:'Check this error path.',evidence:[evidence],question:'Private question',checkpoint};
  const next=appendFindingDraft(store.read(target),finding);store.write(target,next);
  expect(next.startsWith(existing)).toBe(true);expect(next).toContain('Check this error path.');expect(next).toContain(`/blob/${head}/src/code.ts#L12-L14`);
  expect(next).not.toContain('Private question');expect(next).not.toContain('validation');expect(appendFindingDraft(next,finding)).toBe(next);
});

test('saved findings do not enter shared investigation URLs',()=>{
  const shared=shareInvestigation({...checkpoint,notes:'secret note',findings:[{body:'secret finding'}]});
  expect(JSON.stringify(shared)).not.toContain('secret');
});

test('record and evidence limits retain prior work with a visible notice',()=>{
  const store=storage(),current=session(store);
  current.command({type:'CREATE',body:'Keep this'});
  for(let i=0;i<13;i++)current.command({type:'EVIDENCE',evidence:{...evidence,line:i+1,endLine:i+1}});
  expect(current.actor.getSnapshot().context.items[0].evidence).toHaveLength(12);expect(current.actor.getSnapshot().context.notice).toContain('12');
  for(let i=0;i<200;i++)current.command({type:'CREATE',body:`Finding ${i}`});
  const snapshot=notebookSnapshot(current.actor);expect(snapshot.items).toHaveLength(200);expect(snapshot.items.some(item=>item.body==='Keep this')).toBe(true);expect(current.actor.getSnapshot().context.notice).toContain('200');current.dispose();
});

test('interleaved successful writes cannot erase an unrelated finding on reload',()=>{
  const store=storage();let id=0;
  const right=createNotebookSession({key:'race',storage:store,now:()=>2000,createId:()=>`right-${++id}`});
  let interleave=true;
  const delayed={get length(){return store.length;},key:store.key,getItem:store.getItem,setItem(key,value){
    if(interleave && key.includes(':finding:')){interleave=false;right.command({type:'CREATE',body:'Right note'});}
    store.setItem(key,value);
  }};
  const left=createNotebookSession({key:'race',storage:delayed,now:()=>2000,createId:()=>`left-${++id}`});
  left.command({type:'CREATE',body:'Left note'});left.refresh();right.refresh();left.dispose();right.dispose();
  const restored=createNotebookSession({key:'race',storage:store});
  expect(restored.actor.getSnapshot().context.items.map(item=>item.body).sort()).toEqual(['Left note','Right note']);restored.dispose();
});

test('retry saves in-memory findings after device storage becomes writable again',()=>{
  const store=storage();let blocked=true;const errors=[];
  const failing={get length(){return store.length;},key:store.key,getItem:store.getItem,setItem(key,value){if(blocked)throw new Error('quota');store.setItem(key,value);}};
  const first=createNotebookSession({key:'retry',storage:failing,onError:error=>errors.push(error),createId:()=> 'kept-note'});
  first.command({type:'CREATE',body:'Keep this through recovery'});expect(errors.at(-1)).toContain('autosave failed');
  blocked=false;first.retry();expect(errors.at(-1)).toBe('');first.dispose();
  const restored=createNotebookSession({key:'retry',storage:store});expect(restored.actor.getSnapshot().context.items[0].body).toBe('Keep this through recovery');restored.dispose();
});
