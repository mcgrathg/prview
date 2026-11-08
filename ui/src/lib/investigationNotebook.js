import {createActor,assign,setup} from 'xstate';
import {sourceLocation,normalizeInvestigation} from './investigationState.js';
import {reviewDraftKey} from './reviewDrafts.js';
const record=value=>value && typeof value==='object' && !Array.isArray(value);
const text=(value,limit)=>typeof value==='string' ? value.slice(0,limit) : '';
const identity=value=>typeof value==='string' && /^[a-z0-9_-]{1,80}$/i.test(value);
const timestamp=value=>Number.isSafeInteger(value) && value>=0 ? value : 0;
const LABELS=new Set(['','Question','Observation','Concern']);
export function normalizeEvidence(value) {
  const location=sourceLocation(value);
  if(!location || !/^[\w-][\w.-]*\/[\w-][\w.-]*$/.test(value.repo ?? ''))return null;
  const endLine=Number.isSafeInteger(value.endLine) && value.endLine>=location.line ? value.endLine : location.line;
  return {...location,repo:value.repo,endLine,excerpt:text(value.excerpt,8000),truncated:value.truncated===true || typeof value.excerpt==='string' && value.excerpt.length>8000};
}
export function normalizeDraftTarget(value) {
  if(!record(value) || !sourceLocation({file:value.path,rev:value.headSha,line:value.line}))return null;
  const target={repo:value.repo,number:value.number,headSha:value.headSha,path:value.path,side:value.side,line:value.line,
    ...(Number.isSafeInteger(value.startLine) ? {startLine:value.startLine,startSide:value.side} : {})};
  return reviewDraftKey(target) ? target : null;
}
function normalizeFinding(value) {
  if(!record(value) || !identity(value.id))return null;
  return {id:value.id,body:text(value.body,50000),label:LABELS.has(value.label) ? value.label : '',
    question:text(value.question,160),investigationId:identity(value.investigationId) ? value.investigationId : null,
    createdAt:timestamp(value.createdAt),updatedAt:timestamp(value.updatedAt),
    evidence:(Array.isArray(value.evidence) ? value.evidence : []).slice(0,12).map(normalizeEvidence).filter(Boolean),
    checkpoint:normalizeInvestigation(value.checkpoint) ?? null,target:normalizeDraftTarget(value.target)};
}
function preservesData(before,after) {
  if(Array.isArray(before))return Array.isArray(after) && before.length===after.length && before.every((item,index)=>preservesData(item,after[index]));
  if(record(before))return record(after) && Object.keys(before).every(key=>Object.hasOwn(after,key) && preservesData(before[key],after[key]));
  return before===after;
}
export function normalizeNotebook(value) {
  if(value==null)return {version:1,items:[],selected:null};
  if(!record(value) || value.version!==1 || !Array.isArray(value.items) || value.items.length>1000)throw new Error('Saved findings have an unsupported format.');
  const items=value.items.map(normalizeFinding);
  if(items.some(item=>!item) || new Set(items.map(item=>item.id)).size!==items.length)throw new Error('Saved findings contain invalid records.');
  const result={version:1,items,selected:items.some(item=>item.id===value.selected) ? value.selected : null};
  if(!preservesData(value,result))throw new Error('Saved findings contain invalid records.');
  return result;
}
export function mergeNotebooks(earlier,later) {
  const items=new Map(earlier.items.map(item=>[item.id,item]));
  for(const item of later.items)if(!items.has(item.id) || item.updatedAt>=items.get(item.id).updatedAt)items.set(item.id,item);
  return {version:1,items:[...items.values()].sort((a,b)=>a.createdAt-b.createdAt || a.id.localeCompare(b.id)),selected:later.selected ?? earlier.selected};
}
const selected=context=>context.items.find(item=>item.id===context.selected);
const update=(context,change)=>({items:context.items.map(item=>item.id===context.selected ? {...item,...change,updatedAt:Math.max(context.now(),item.updatedAt+1)} : item),notice:''});
export const notebookMachine=setup({}).createMachine({
  id:'investigation-notebook',initial:'ready',
  context:({input})=>({...normalizeNotebook(input.saved),notice:'',now:input.now ?? Date.now,createId:input.createId ?? (()=>crypto.randomUUID())}),
  states:{ready:{}},
  on:{
    CREATE:{actions:assign(({context,event})=>{
      if(context.items.length>=200)return {notice:'This notebook has reached its 200-finding limit. Existing findings are retained.'};
      const at=context.now(),id=context.createId();
      const item=normalizeFinding({id,createdAt:at,updatedAt:at,body:event.body ?? '',question:event.question,investigationId:event.investigationId,target:event.target});
      return {items:[...context.items,item],selected:id,notice:''};
    })},
    SELECT:{guard:({context,event})=>context.items.some(item=>item.id===event.id),actions:assign(({event})=>({selected:event.id,notice:''}))},
    EDIT:{guard:({context})=>Boolean(selected(context)),actions:assign(({context,event})=>update(context,{body:text(event.body,50000)}))},
    LABEL:{guard:({context,event})=>Boolean(selected(context)) && LABELS.has(event.label),actions:assign(({context,event})=>update(context,{label:event.label}))},
    EVIDENCE:{guard:({context,event})=>Boolean(selected(context) && normalizeEvidence(event.evidence)),actions:assign(({context,event})=>{
      const evidence=normalizeEvidence(event.evidence),current=selected(context);
      const same=entry=>entry.repo===evidence.repo && entry.rev===evidence.rev && entry.file===evidence.file && entry.line===evidence.line && entry.endLine===evidence.endLine;
      if(current.evidence.some(same))return update(context,{evidence:current.evidence.map(entry=>same(entry) ? evidence : entry)});
      if(current.evidence.length>=12)return {notice:'A finding can keep 12 evidence references. Start another finding for more.'};
      return update(context,{evidence:[...current.evidence,evidence]});
    })},
    CHECKPOINT:{guard:({context,event})=>Boolean(selected(context) && normalizeInvestigation(event.checkpoint)),actions:assign(({context,event})=>update(context,{checkpoint:normalizeInvestigation(event.checkpoint)}))},
    MERGE:{actions:assign(({context,event})=>mergeNotebooks(context,normalizeNotebook(event.saved)))},
  },
});
export function notebookSnapshot(actor) {const {items,selected}=actor.getSnapshot().context;return {version:1,items,selected};}
export function createNotebookSession({key,storage,onError=()=>{},now,createId}) {
  let writable=true;
  const prefix=`${key}:finding:`;
  function readRecord(raw) {
    const value=JSON.parse(raw);
    if(!record(value) || value.version!==1 || !value.item || Object.keys(value).some(field=>!['version','item'].includes(field)))throw new Error('Unsupported finding record.');
    return normalizeNotebook({version:1,items:[value.item]}).items[0];
  }
  function read() {
    try {
      let saved=normalizeNotebook(JSON.parse(storage.getItem(key) ?? 'null'));
      const items=[];
      for(let index=0;index<storage.length;index++) {
        const name=storage.key(index);
        if(!name?.startsWith(prefix))continue;
        const item=readRecord(storage.getItem(name));
        if(name!==prefix+item.id)throw new Error('Finding identity does not match its key.');
        items.push(item);if(items.length>1000)throw new Error('Too many finding records.');
      }
      saved=mergeNotebooks(saved,{version:1,items,selected:null});
      const selection=storage.getItem(`${key}:selection`);
      if(saved.items.some(item=>item.id===selection))saved.selected=selection;
      return saved;
    } catch {
      writable=false;onError('Saved findings could not be read. New notes stay in this tab; copy them before reloading.');
      return {version:1,items:[],selected:null};
    }
  }
  const actor=createActor(notebookMachine,{input:{saved:read(),now,createId}}).start();
  function refresh(){if(!writable)return;actor.send({type:'MERGE',saved:mergeNotebooks(read(),notebookSnapshot(actor))});}
  function persist() {
    if(!writable)return;
    try {
      for(const item of actor.getSnapshot().context.items) {
        const name=prefix+item.id,raw=storage.getItem(name);
        const previous=raw===null ? null : readRecord(raw);
        if(!previous || item.updatedAt>=previous.updatedAt) {
          const next=JSON.stringify({version:1,item});
          if(raw!==next)storage.setItem(name,next);
        }
      }
      storage.setItem(`${key}:selection`,actor.getSnapshot().context.selected ?? '');onError('');
    } catch {writable=false;onError('Findings autosave failed. Keep this tab open and copy your notes before reloading.');}
  }
  return {actor,command(event){refresh();actor.send(event);persist();},refresh,retry(){writable=true;refresh();persist();},dispose(){actor.stop();}};
}
export function evidenceHref(value) {
  const evidence=normalizeEvidence(value);if(!evidence)return null;
  const path=evidence.file.split('/').map(encodeURIComponent).join('/');
  return `https://github.com/${evidence.repo}/blob/${evidence.rev}/${path}#L${evidence.line}${evidence.endLine>evidence.line ? `-L${evidence.endLine}` : ''}`;
}
export function findingDraft(finding) {
  const evidence=(finding.evidence ?? []).map(normalizeEvidence).filter(Boolean);
  const links=evidence.map(item=>`- [${item.file.replace(/[\[\]\\]/g,'\\$&')}:${item.line}${item.endLine>item.line ? `–${item.endLine}` : ''} · ${item.rev.slice(0,7)}](${evidenceHref(item)})`);
  return [finding.body.trim(),links.length ? `Evidence:\n${links.join('\n')}` : ''].filter(Boolean).join('\n\n');
}
export function appendFindingDraft(existing,finding) {const addition=findingDraft(finding);return !addition || existing.includes(addition) ? existing : [existing,addition].filter(Boolean).join('\n\n');}
