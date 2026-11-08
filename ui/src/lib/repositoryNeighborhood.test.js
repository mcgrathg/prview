import {test,expect} from 'bun:test';
import {relativeImportTargets,catalogCandidates,discoverNeighborhood,discoveryEvidence} from './repositoryNeighborhood.js';
test('relative dependency resolution stays in repository and preserves ambiguous candidates',()=>{
 const paths=['src/contract.ts','src/contract/index.ts','src/helper.ts','outside.ts'];
 expect(relativeImportTargets('src/caller.ts','./contract',paths)).toEqual(['src/contract.ts','src/contract/index.ts']);expect(relativeImportTargets('src/caller.ts','./helper.js',paths)).toEqual(['src/helper.ts']);
 for(const value of ['../../outside','package','./helper?raw','./a\\b'])expect(relativeImportTargets('src/caller.ts',value,paths)).toEqual([]);
});
test('filename, test and guidance candidates disclose their evidence rather than claiming canonical patterns',()=>{
 const entries=catalogCandidates('src/save-story.ts',['src/save-story.ts','src/save-story.test.ts','other/save-story.ts','docs/adr/001-storage.md','src/nearby.ts']);
 expect(entries.find(item=>item.category==='Tests').reason).toContain('coverage is not inferred');expect(entries.find(item=>item.category==='Comparable filenames').reason).toContain('discovery hint');expect(entries.find(item=>item.category==='Conventions / ADRs').path).toBe('docs/adr/001-storage.md');expect(entries.find(item=>item.category==='Nearby files').path).toBe('src/nearby.ts');
});
test('neighborhood uses pinned parsed imports and literal mentions with explicit limits and immutable evidence',async()=>{
 const rev='a'.repeat(40),seen=[],signal=new AbortController().signal;
 const api={repoFiles:async(repo,sha)=>{seen.push(sha);return {status:'ok',paths:['src/caller.ts','src/dependency.ts','src/caller.test.ts']};},repoInsight:async request=>{seen.push(request.sha);expect(request.kind).toBe('imports');return {status:'ok',imports:[{specifier:'./dependency',line:3,text:"import {read} from './dependency'"},{specifier:'external',line:4,text:'external'}]};},repoSearch:async(repo,sha)=>{seen.push(sha);return {status:'ok',matches:[{path:'another.ts',line:9,text:'caller()'}]};}};
 const result=await discoverNeighborhood({request:{path:'src/caller.ts',rev},repo:'test/repo',headRef:'main',api,signal});expect(seen).toEqual([rev,rev,rev]);expect(result.entries.find(item=>item.category==='Dependencies').originEvidence).toEqual({file:'src/caller.ts',line:3});expect(result.entries.find(item=>item.category==='Possible callers / mentions').reason).toContain('not a semantic usage');expect(result.coverage.limited).toBe(true);expect(result.coverage.reasons.join(' ')).toContain('1 imports require');
});

test('discovery evidence clamps short files and EOF while rejecting an invalid start rather than saving no citation',async()=>{
 const rev='a'.repeat(40),request={rev,base:null},signal=new AbortController().signal;
 const evidence=await discoveryEvidence({repo:'test/repo',entry:{path:'short.ts',line:1,originEvidence:{file:'importer.ts',line:2}},request,signal,readFile:async(path,sha)=>{expect(sha).toBe(rev);return {status:'ok',content:path==='short.ts'?'export const value=1;':"first\nimport './short';"};}});
 expect(evidence.map(item=>[item.file,item.line,item.endLine])).toEqual([['short.ts',1,1],['importer.ts',2,2]]);
 await expect(discoveryEvidence({repo:'test/repo',entry:{path:'short.ts',line:9},request,signal,readFile:async()=>({status:'ok',content:'one line'})})).rejects.toThrow('range is unavailable');
});
