import {test,expect} from 'bun:test';
import {createRepositoryResearch} from './repositoryResearch.js';
const rev='a'.repeat(40),signal=new AbortController().signal;
test('file browsing ranks the whole pinned catalog and reuses bytes across queries',async()=>{
 let calls=0;const lookup=createRepositoryResearch({repo:'test/repo',headRef:'main',api:{repoFiles:async(repo,sha)=>{calls++;expect(sha).toBe(rev);return {status:'ok',paths:['src/alpha.ts','test/alpha.test.ts','docs/guide.md']};}}});
 const first=await lookup({request:{kind:'files',rev,query:'alpha'},signal}),second=await lookup({request:{kind:'files',rev,query:'guide'},signal});
 expect(first.entries.map(item=>item.path)).toContain('test/alpha.test.ts');expect(second.entries[0].path).toBe('docs/guide.md');expect(calls).toBe(1);
});
test('semantic and text results retain coverage and exact immutable origin',async()=>{
 const seen=[];const lookup=createRepositoryResearch({repo:'test/repo',headRef:'main',api:{repoReferences:async(...args)=>{seen.push(args);return {status:'ok',references:[{path:'unchanged.ts',line:9,text:'value()'}],coverage:{sourceOnly:true,limited:true,reasons:['candidate scope']}};},repoSearch:async()=>({status:'ok',matches:[{path:'docs/a.md',line:3,text:'value'}]})}});
 const result=await lookup({request:{kind:'references',rev,path:'caller.ts',symbol:'value',line:2,character:4},signal});expect(seen[0].slice(0,6)).toEqual(['test/repo',rev,'main','caller.ts','value',{line:2,character:4}]);expect(result.entries[0].path).toBe('unchanged.ts');expect(result.coverage.limited).toBe(true);
 expect((await lookup({request:{kind:'text',rev,query:'value'},signal})).entries[0].line).toBe(3);
});
test('outlines keep nested names and filter locally while failed and canceled loads are not cached',async()=>{
 let calls=0;const lookup=createRepositoryResearch({repo:'test/repo',headRef:'main',api:{repoInsight:async()=>{calls++;return {status:'ok',outline:[{name:'Container',selection:{line:1},children:[{name:'method',selection:{line:4}}]}],coverage:{sourceOnly:true}};}}});
 const request={kind:'symbols',rev,path:'code.ts',query:'method'};expect((await lookup({request,signal})).entries).toEqual([{path:'code.ts',line:4,text:'Container › method'}]);await lookup({request:{...request,query:''},signal});expect(calls).toBe(1);
 const canceled=new AbortController();canceled.abort();await expect(lookup({request,signal:canceled.signal})).rejects.toThrow();expect(calls).toBe(1);
});

test('catalog filtering retains changed paths beyond the visible result limit',async()=>{
 const paths=[...Array.from({length:200},(_,i)=>`a${i}.ts`),'deep/changed/important-change.ts'];
 const lookup=createRepositoryResearch({repo:'test/repo',headRef:'main',api:{repoFiles:async()=>({status:'ok',paths})}});
 const result=await lookup({request:{kind:'files',rev,query:''},signal});expect(result.entries.filter(entry=>entry.path==='deep/changed/important-change.ts')).toHaveLength(1);expect(result.entries).toHaveLength(201);
});
