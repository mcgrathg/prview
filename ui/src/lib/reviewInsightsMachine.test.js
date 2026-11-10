import {test,expect} from 'bun:test';
import {createActor} from 'xstate';
import {reviewInsightsMachine} from './reviewInsightsMachine.js';
const request={repo:'sample/project',number:1,base:'a'.repeat(40),head:'b'.repeat(40)};
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
test('new comparisons cancel obsolete work and clear the old rail context',async()=>{
  const jobs=[];const actor=createActor(reviewInsightsMachine,{input:{load:(request,signal)=>new Promise(resolve=>jobs.push({request,signal,resolve}))}}).start();
  actor.send({type:'LOAD',request});actor.send({type:'OPEN',path:'a.ts'});actor.send({type:'TAB',tab:'history'});
  expect(actor.getSnapshot().context.file).toBe('a.ts');expect(actor.getSnapshot().context.tab).toBe('history');
  const next={...request,head:'c'.repeat(40)};actor.send({type:'LOAD',request:next});
  expect(jobs[0].signal.aborted).toBe(true);expect(actor.getSnapshot().context.file).toBeNull();
  jobs[1].resolve({status:'ok',...next,files:{'next.ts':{}}});await flush();
  jobs[0].resolve({status:'ok',...request,files:{'stale.ts':{}}});await flush();
  expect(actor.getSnapshot().context.result.head).toBe(next.head);expect(actor.getSnapshot().matches('ready')).toBe(true);actor.stop();
});
test('rail events retain comparison facts and reject unknown tabs; retry recovers failures',async()=>{
  let attempts=0;const actor=createActor(reviewInsightsMachine,{input:{load:async()=>{if(!attempts++)throw Error('Missing mirror');return {status:'ok',...request,files:{}};}}}).start();
  actor.send({type:'LOAD',request});await flush();expect(actor.getSnapshot().matches('error')).toBe(true);
  actor.send({type:'OPEN',path:'a.ts'});actor.send({type:'RETRY'});await flush();expect(actor.getSnapshot().matches('ready')).toBe(true);
  const result=actor.getSnapshot().context.result;actor.send({type:'TAB',tab:'bad'});expect(actor.getSnapshot().context.tab).toBe('change');
  actor.send({type:'CLOSE'});expect(actor.getSnapshot().context.result).toBe(result);actor.send({type:'TAB',tab:'history'});expect(actor.getSnapshot().context.tab).toBe('change');
  actor.send({type:'CANCEL'});expect(actor.getSnapshot().matches('idle')).toBe(true);expect(actor.getSnapshot().context.result).toBeNull();actor.stop();
});
test('an endpoint result cannot authorize facts for another captured comparison',async()=>{
  const actor=createActor(reviewInsightsMachine,{input:{load:async()=>({status:'ok',...request,base:'f'.repeat(40)})}}).start();actor.send({type:'LOAD',request});await flush();
  expect(actor.getSnapshot().matches('error')).toBe(true);expect(actor.getSnapshot().context.error).toContain('another comparison');actor.stop();
});
