import { test, expect } from 'bun:test';
import { createActor } from 'xstate';
import { symbolRequest, symbolDestination, loadSymbolContext } from './symbolContext.js';
import { reviewLookupMachine } from './reviewLookupMachine.js';

test('clicked original/head revision and return anchor are captured independently of later selection', () => {
  const source = {repo:'test/repo',headRef:'branch',rev:'head',base:'base',side:'left',view:'diff'};
  const request = symbolRequest('get','cache.ts',{line:11,character:6,side:'right'},source);
  source.rev = 'new-head';
  expect(request.sha).toBe('head');
  expect(request.origin.line).toBe(11);
  expect(symbolRequest('get','cache.ts',{line:9,character:2,side:'left'},source).sha).toBe('base');
  expect(symbolDestination({path:'helpers.ts',line:34},request)).toEqual({file:'helpers.ts',line:34,view:'source',side:'right',rev:'head',base:'base'});
});

test('definition context uses actual bounded source and the same pinned request and cancellation signal', async () => {
  const signal = new AbortController().signal;
  const request = symbolRequest('get','cache.ts',{line:11,character:6},{repo:'test/repo',headRef:'branch',rev:'head',base:'base',view:'diff'});
  const calls = [];
  const result = await loadSymbolContext(request,signal,{
    repoDefinition:async(...args)=>{calls.push(args);return {status:'ok',definition:{path:'helpers.ts',line:5,text:'export function get() {'}};},
    repoFile:async(...args)=>{calls.push(args);return {status:'ok',content:Array.from({length:40},(_,i)=>`line ${i+1}`).join('\n')};},
  });
  expect(calls.map(call=>call[1])).toEqual(['head','head']);
  expect(calls.every(call=>call.at(-1)===signal)).toBe(true);
  expect(result.excerpt).toHaveLength(8);
  expect(result.excerpt[0]).toEqual({line:4,text:'line 4'});
  expect(result.definition.text).toBe('export function get() {');
});

test('unavailable excerpts keep the real declaration and ambiguity does not guess a target', async () => {
  const request = {sha:'head',position:{line:1,character:0}};
  const signal = new AbortController().signal;
  const candidates = {status:'ok',candidates:[{path:'a.ts',line:2,text:'function name() {}'},{path:'b.ts',line:3,text:'function name() {}'}]};
  expect(await loadSymbolContext(request,signal,{repoDefinition:async()=>candidates,repoFile:()=>{throw new Error('must not load');}})).toBe(candidates);
  const result = await loadSymbolContext(request,signal,{repoDefinition:async()=>({status:'ok',definition:candidates.candidates[0]}),repoFile:async()=>({status:'too-large'})});
  expect(result.definition.path).toBe('a.ts');
  expect(result.excerptStatus).toBe('too-large');
  expect(await loadSymbolContext({},signal,{})).toEqual({status:'missing-revision'});
});

test('closing or superseding a card aborts lookup and cannot navigate on late completion', async () => {
  const pending = [];
  const actor = createActor(reviewLookupMachine,{input:{lookup:({request,signal})=>new Promise(resolve=>pending.push({request,signal,resolve}))}}).start();
  actor.send({type:'LOAD',request:{symbol:'first'}});
  actor.send({type:'LOAD',request:{symbol:'second'}});
  expect(pending[0].signal.aborted).toBe(true);
  pending[0].resolve({status:'ok',definition:{path:'old.ts'}});
  actor.send({type:'CANCEL'});
  expect(pending[1].signal.aborted).toBe(true);
  pending[1].resolve({status:'ok',definition:{path:'new.ts'}});
  await new Promise(resolve=>setTimeout(resolve,0));
  expect(actor.getSnapshot().matches('idle')).toBe(true);
  expect(actor.getSnapshot().context.result).toBeNull();
  actor.stop();
});
