import {repoFile} from './api.js';

export function searchResultLines(entry, lines) {
  if (!lines || !Number.isInteger(entry.line) || entry.line < 1 || entry.line > lines.length) return [{line:entry.line,text:entry.text,match:true}];
  const start=Math.max(0,entry.line-2),end=Math.min(lines.length,entry.line+1);
  return lines.slice(start,end).map((text,index)=>({line:start+index+1,text,match:start+index+1===entry.line}));
}

export function searchResultCommand(event, input = false) {
  if (event.isComposing || event.altKey || event.shiftKey) return null;
  if (event.key === 'Enter') return event.metaKey || event.ctrlKey ? 'beside' : 'open';
  return event.key === ' ' && !input && !event.metaKey && !event.ctrlKey ? 'preview' : null;
}

export function createSearchContextLoader({readFile=repoFile,limit=8} = {}) {
  const cache=new Map();
  return async ({request,signal})=>{
    signal.throwIfAborted();
    const key=JSON.stringify([request.repo,request.rev,request.path]);
    let lines=cache.get(key);
    if (!lines) {
      const result=await readFile(request.repo,request.rev,request.headRef,request.path,signal);
      signal.throwIfAborted();
      if (result.status!=='ok' || typeof result.content!=='string') return {status:result.status ?? 'unavailable'};
      lines=result.content.split('\n');
      cache.set(key,lines);
      if (cache.size>limit) cache.delete(cache.keys().next().value);
    } else {cache.delete(key);cache.set(key,lines);}
    return {status:'ok',entries:searchResultLines(request,lines)};
  };
}
