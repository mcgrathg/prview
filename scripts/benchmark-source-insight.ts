import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import type {AstRequest,AstResponse} from '../server/tsWorker.ts';
const checkout=resolve(process.argv[2] ?? '../.working/cockpit-live-data/mirrors/mcgrathg__prview');
const output=process.argv[3];
const request:Omit<AstRequest,'id'>={checkout,repo:'mcgrathg/prview',sha:'97cac0f9b695272b5b71c177beadf842eb371be8',fromPath:'shared/review-organization/relationships.ts',symbol:'CallFact',line:12,character:18,kind:'insight',insightKind:'hover'};
const samples=[];
for(let index=0;index<3;index++){
 const started=performance.now(),worker=new Worker(new URL('../server/tsWorker.ts',import.meta.url).href);
 const run=(id:number)=>new Promise<AstResponse>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Insight exceeded 30 seconds')),30000);worker.onmessage=event=>{clearTimeout(timer);resolve(event.data);};worker.onerror=event=>{clearTimeout(timer);reject(new Error(event.message));};worker.postMessage({...request,id});});
 try{const first=await run(1),coldMs=performance.now()-started;assert.equal(first.insight?.hover?.signature,'interface CallFact');const warmStarted=performance.now();assert.equal((await run(2)).insight?.hover?.signature,'interface CallFact');samples.push({coldMs,warmMs:performance.now()-warmStarted});}
 finally{worker.terminate();}
}
const result={repo:request.repo,sha:request.sha,path:request.fromPath,conditions:'Three fresh production AST workers; existing full mirror and warm OS/disk caches. Worker startup, pinned Git reads and hover analysis included. No clone or repository code execution.',samples};
if(output)await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
