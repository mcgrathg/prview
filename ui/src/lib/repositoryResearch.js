import {repoFiles,repoSearch,repoReferences,repoInsight} from './api.js';
import {discoverNeighborhood} from './repositoryNeighborhood.js';
import {fuzzyRank} from './fuzzy.js';
function cache(map,key,value,limit){map.delete(key);map.set(key,value);if(map.size>limit)map.delete(map.keys().next().value);}
export function flattenOutline(items,path,prefix=[]) {return (items ?? []).flatMap(item=>[{path,line:item.selection.line,text:[...prefix,item.name].join(' › ')},...flattenOutline(item.children,path,[...prefix,item.name])]);}
export function createRepositoryResearch({repo,headRef,api={repoFiles,repoSearch,repoReferences,repoInsight}}) {
  const catalogs=new Map(),outlines=new Map();
  return async ({request,signal})=>{
    const {kind,rev,path,symbol,line,character,query=''}=request;
    signal.throwIfAborted();
    if(kind==='neighborhood')return discoverNeighborhood({request,repo,headRef,api,signal});
    if(kind==='files') {
      const key=JSON.stringify([repo,rev]);let catalog=catalogs.get(key);
      if(!catalog){catalog=await api.repoFiles(repo,rev,headRef,signal);signal.throwIfAborted();if(catalog.status==='ok')cache(catalogs,key,catalog,8);}
      if(catalog.status!=='ok')return catalog;
      const paths=fuzzyRank(query,catalog.paths).map(item=>item.path);
      return {status:'ok',entries:paths.map(path=>({path,line:1,text:path.split('/').at(-1)})),total:paths.length,coverage:{limited:false,reasons:[]}};
    }
    if(kind==='text') {
      if(query.trim().length<2)return {status:'ok',entries:[]};
      const result=await api.repoSearch(repo,rev,headRef,query,signal);signal.throwIfAborted();
      return {...result,entries:result.matches ?? [],coverage:{limited:result.matches?.length>=2000,reasons:result.matches?.length>=2000 ? ['Text search reached 2000 matches; refine the query.'] : []}};
    }
    if(kind==='references') {const result=await api.repoReferences(repo,rev,headRef,path,symbol,{line,character},signal);signal.throwIfAborted();return {...result,entries:result.references ?? [],coverage:{...result.coverage,sourceOnly:true}};}
    const mode=kind==='symbols' ? 'outline' : kind;
    const key=JSON.stringify([repo,rev,path]);let result=mode==='outline' ? outlines.get(key) : null;
    if(!result){result=await api.repoInsight({repo,sha:rev,headRef,path,kind:mode,symbol,line,character},signal);signal.throwIfAborted();if(mode==='outline' && ['ok','unsupported'].includes(result.status))cache(outlines,key,result,30);}
    const entries=mode==='outline' ? flattenOutline(result.outline,path).filter(entry=>!query || `${entry.path} ${entry.text}`.toLowerCase().includes(query.toLowerCase())) : result.locations ?? [];
    return {...result,entries};
  };
}
