import type { ReviewInsights } from '../shared/review-insights.ts';
export interface InsightsRequest {repo: string; number: number; base: string; head: string}
export function validInsightsRequest(request: InsightsRequest) {
  return /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(request.repo) && Number.isSafeInteger(request.number) && request.number>0 && /^[a-f0-9]{40}$/.test(request.base) && /^[a-f0-9]{40}$/.test(request.head);
}
const cache=new Map<string,Promise<ReviewInsights>>();let running=0;
export function reviewInsights(checkout: string,request: InsightsRequest,patch: string): Promise<ReviewInsights> {
  if(!validInsightsRequest(request) || patch.length>16_000_000)return Promise.reject(new Error('Invalid insights comparison.'));
  const key=`${request.repo}#${request.number}:${request.base}...${request.head}`;
  const cached=cache.get(key);if(cached)return cached;
  if(running>=2)return Promise.reject(new Error('Review insights are busy; retry shortly.'));
  const result=new Promise<ReviewInsights>((resolve,reject)=>{
    running++;let worker:Worker|undefined,timer:ReturnType<typeof setTimeout>|undefined,finished=false;
    const finish=()=>{if(finished)return;finished=true;if(timer)clearTimeout(timer);try { worker?.terminate(); } finally { running--; }};
    try{
      worker=new Worker(new URL('./reviewInsightsWorker.ts',import.meta.url).href);
      timer=setTimeout(()=>{finish();reject(new Error('Review insights exceeded the time limit.'));},45_000);
      worker.onmessage=({data})=>{finish();if(data.error)reject(new Error(data.error));else if(data.repo!==request.repo||data.base!==request.base||data.head!==request.head)reject(new Error('Review insight identity mismatch.'));else resolve(data);};
      worker.onerror=error=>{finish();reject(new Error(error.message));};worker.postMessage({checkout,request,patch});
    }catch(error){finish();reject(error);}
  });
  cache.set(key,result);void result.then(value=>{if(cache.get(key)===result && (!value.provider.available||value.history.status!=='ok'))cache.delete(key);},()=>{if(cache.get(key)===result)cache.delete(key);});
  while(cache.size>12)cache.delete(cache.keys().next().value!);
  return result;
}
