import {createActor} from 'xstate';
import {reviewLookupMachine} from './reviewLookupMachine.js';
import {repoInsight} from './api.js';
export function createSourceInsightSession({source,lookup=repoInsight,onState=()=>{}}) {
  const origin=Object.freeze({...source}),pending=new Set();let disposed=false,sequence=0;
  function query(kind,position,symbol='',signal) {
    if(disposed || signal?.aborted)return Promise.resolve(null);
    const id=++sequence,request={...origin,kind,symbol,line:position?.line ?? 1,character:position?.character ?? 0};
    return new Promise(resolve=>{
      const actor=createActor(reviewLookupMachine,{input:{lookup:({request,signal})=>lookup(request,signal)}}).start();
      let subscription,settled=false;
      const finish=result=>{if(settled)return;settled=true;signal?.removeEventListener('abort',cancel);subscription?.unsubscribe();actor.stop();pending.delete(finish);resolve(result);};
      const cancel=()=>{if(id===sequence && !disposed)onState({status:'idle'});finish(null);};
      pending.add(finish);signal?.addEventListener('abort',cancel,{once:true});
      subscription=actor.subscribe(next=>{
        if(!['ready','empty','unavailable','error'].some(state=>next.matches(state)))return;
        const result=next.matches('error') ? {status:'error',reason:next.context.error} : next.context.result;
        if(id===sequence && !disposed)onState(result);finish(result);
      });
      if(signal?.aborted || disposed)cancel();else{onState({status:'loading'});actor.send({type:'LOAD',request});}
    });
  }
  return {query,dispose(){disposed=true;for(const finish of [...pending])finish(null);}};
}

export function escapeInsightMarkdown(value){return String(value).replace(/[\\`*_{}\[\]()#+.!<>-]/g,'\\$&');}
