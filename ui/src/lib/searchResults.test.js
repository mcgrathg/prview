import {test,expect} from 'bun:test';
import {createSearchContextLoader,searchResultLines,searchResultCommand} from './searchResults.js';
import {queryRanges} from './matchRuns.js';

test('selected matches show adjacent numbered source lines and retain the match at file edges',()=>{
 const lines=['before','match x','after','tail'];
 expect(searchResultLines({line:2,text:'match x'},lines)).toEqual([{line:1,text:'before',match:false},{line:2,text:'match x',match:true},{line:3,text:'after',match:false}]);
 expect(searchResultLines({line:1,text:'before'},lines).map(row=>row.line)).toEqual([1,2]);
 expect(searchResultLines({line:4,text:'tail'},lines).map(row=>row.line)).toEqual([3,4]);
 expect(searchResultLines({line:20,text:'fallback'},lines)).toEqual([{line:20,text:'fallback',match:true}]);
 expect(queryRanges('value VALUE value','value')).toEqual([[0,5],[6,11],[12,17]]);
 expect(queryRanges('value VALUE value','VALUE')).toEqual([[6,11]]);
 expect(queryRanges('literal a+b <tag>','a+b')).toEqual([[8,11]]);
});
test('result shortcuts distinguish preview, open, beside and ordinary input/composition',()=>{
 expect(searchResultCommand({key:' '},false)).toBe('preview');
 expect(searchResultCommand({key:' '},true)).toBeNull();
 expect(searchResultCommand({key:'Enter'},false)).toBe('open');
 expect(searchResultCommand({key:'Enter'},true)).toBe('open');
 for(const modifier of ['metaKey','ctrlKey'])expect(searchResultCommand({key:'Enter',[modifier]:true},false)).toBe('beside');
 for(const event of [{key:'Enter',isComposing:true},{key:'Enter',altKey:true},{key:'Enter',shiftKey:true},{key:'x'}])expect(searchResultCommand(event,false)).toBeNull();
});
test('context reads exact pinned bytes, caches successful files and never caches aborted or failed work',async()=>{
 const calls=[];
 const load=createSearchContextLoader({readFile:async(...args)=>{calls.push(args);return {status:'ok',content:'one\nmatch\nthree\n'};},limit:1});
 const request={repo:'owner/repo',rev:'a'.repeat(40),headRef:'branch',path:'src/a.ts',line:2,text:'match'};
 const signal=new AbortController().signal;
 expect((await load({request,signal})).entries.map(row=>row.text)).toEqual(['one','match','three']);
 await load({request:{...request,line:3},signal});expect(calls).toHaveLength(1);
 await load({request:{...request,rev:'b'.repeat(40)},signal});expect(calls).toHaveLength(2);
 expect(calls[0]).toEqual([request.repo,request.rev,request.headRef,request.path,signal]);
 await load({request,signal});expect(calls).toHaveLength(3);
 const canceled=new AbortController();canceled.abort();await expect(load({request,signal:canceled.signal})).rejects.toThrow();expect(calls).toHaveLength(3);
 let failures=0;const failed=createSearchContextLoader({readFile:async()=>{failures++;return {status:'too-large'};}});
 expect((await failed({request,signal})).status).toBe('too-large');await failed({request,signal});expect(failures).toBe(2);
});
