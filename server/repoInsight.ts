import {astInsight} from './astResolve.ts';
import {lsTree} from './gitShow.ts';
import type {InsightKind} from './tsService.ts';
export interface InsightQuery {repo:string;sha:string;headRef:string;path:string;kind:string;symbol:string;line:number;character:number}
export interface InsightRequest extends InsightQuery {kind:InsightKind}
const KINDS=new Set(['hover','outline','type','implementation']);
export function validInsightRequest(value:InsightQuery):value is InsightRequest {
  return /^[\w-][\w.-]*\/[\w-][\w.-]*$/.test(value.repo) && /^[a-f0-9]{40}$/i.test(value.sha)
    && /^[A-Za-z0-9._][A-Za-z0-9._\/-]{0,255}$/.test(value.headRef) && Boolean(value.path) && value.path.length<=2048
    && !/[\x00-\x1f\x7f\\]/.test(value.path) && !value.path.startsWith('/') && !value.path.split('/').some(part=>!part || part==='.' || part==='..')
    && KINDS.has(value.kind) && Number.isSafeInteger(value.line) && value.line>0 && Number.isSafeInteger(value.character) && value.character>=0
    && (value.kind==='outline' || /^[A-Za-z_$][A-Za-z0-9_$]{0,199}$/.test(value.symbol));
}
export async function repositoryInsight(checkout:string,request:InsightRequest,signal?:AbortSignal) {
  if(!validInsightRequest(request))throw new Error('Invalid repository insight request.');
  let candidates:string[]=[],limited=false;
  const reasons=['Analysis uses tracked repository source; installed dependency packages are unavailable.'];
  if(request.path.endsWith('.svelte'))reasons.push('Svelte analysis covers script blocks.');
  if(request.kind==='implementation') {
    const paths=lsTree(checkout,request.repo,request.sha).filter(path=>/\.(?:[cm]?[jt]sx?|svelte)$/.test(path));
    if(paths.length<=300)candidates=paths;
    else {
      const {findReferences}=await import('./repoSearch.ts');
      const references=await findReferences(checkout,request.sha,request.symbol,request.path,{repo:request.repo,position:{line:request.line,character:request.character}},signal);
      signal?.throwIfAborted();
      candidates=[...new Set(references.references.map(reference=>reference.path))].slice(0,300);
      limited=true;reasons.push(...references.coverage.reasons,'Implementation discovery is candidate-scoped; inherited or independently named implementations may be absent.');
    }
  }
  const result=await astInsight({checkout,repo:request.repo,sha:request.sha,fromPath:request.path,symbol:request.symbol,line:request.line,character:request.character,insightKind:request.kind,candidatePaths:candidates},signal);
  signal?.throwIfAborted();
  return {...(result ?? {status:'unavailable',hover:null,outline:[],locations:[],limited:false}),coverage:{sourceOnly:true,limited:limited || result?.limited===true,reasons}};
}
