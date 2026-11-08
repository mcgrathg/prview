import {test,expect} from 'bun:test';
import {createSourceInsightSession,escapeInsightMarkdown} from './sourceInsight.js';
const source={repo:'test/repo',sha:'a'.repeat(40),headRef:'main',path:'code.ts'};
test('insight providers retain their immutable model origin and expose metadata results',async()=>{
  const input={...source},calls=[],session=createSourceInsightSession({source:input,lookup:async(request)=>{calls.push(request);return {status:'ok',hover:{signature:'const value: number',documentation:''}};}});
  input.sha='b'.repeat(40);const result=await session.query('hover',{line:2,character:3},'value');
  expect(calls[0].sha).toBe('a'.repeat(40));expect(calls[0]).toMatchObject({kind:'hover',line:2,character:3,symbol:'value'});expect(result.hover.signature).toContain('number');session.dispose();
});
test('canceled and disposed model requests abort transport and cannot publish late state',async()=>{
  const requests=[],states=[];
  const session=createSourceInsightSession({source,onState:state=>states.push(state.status),lookup:(request,signal)=>new Promise(resolve=>requests.push({request,signal,resolve}))});
  const controller=new AbortController(),first=session.query('outline',null,'',controller.signal);controller.abort();
  expect(requests[0].signal.aborted).toBe(true);expect(await first).toBeNull();
  const second=session.query('type',{line:1,character:2},'value');session.dispose();expect(requests[1].signal.aborted).toBe(true);expect(await second).toBeNull();
  requests.forEach(request=>request.resolve({status:'ok',locations:[{path:'late.ts',line:9}]}));await new Promise(resolve=>setTimeout(resolve,0));expect(states).not.toContain('ok');
});
test('an older hover completion cannot replace the latest outline status',async()=>{
  const requests=[],states=[];const session=createSourceInsightSession({source,onState:state=>states.push(state),lookup:(request,signal)=>new Promise(resolve=>requests.push({request,signal,resolve}))});
  const first=session.query('hover',{line:1,character:1},'value'),second=session.query('outline');
  requests[1].resolve({status:'ok',outline:[{name:'current'}]});await second;
  requests[0].resolve({status:'ok',hover:{signature:'old'}});await first;
  expect(states.at(-1).outline[0].name).toBe('current');session.dispose();
});

test('source docs remain literal hover text rather than active markdown or HTML',()=>{
  const escaped=escapeInsightMarkdown('[run](command:execute) <img src="remote"> ![image](https://example.invalid) `code`');
  expect(escaped).toContain('\\[run\\]\\(command:execute\\)');expect(escaped).toContain('\\<img');expect(escaped).toContain('\\!\\[image');expect(escaped).toContain('\\`code\\`');
});
