import {test,expect} from 'bun:test';
import {createConversationSession,conversationCitations,conversationSources,conversationPrompt} from './investigationConversation.js';
const rev='a'.repeat(40),location={file:'code.ts',rev,line:2},storage=()=>{const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};};
const readFile=async()=>({status:'ok',content:'first\nexport const value=1;\nlast'}),settle=()=>new Promise(resolve=>setTimeout(resolve,0));
test('questions and transcripts remain independent and retain pinned context on reload',async()=>{
 const disk=storage(),requests=[],options={storage:disk,repo:'test/repo',headRef:'main',readFile,generate:async(request)=>{requests.push(request);return 'The value is declared here [S1:L2].';}};
 let a=createConversationSession({...options,key:'question-a'}),b=createConversationSession({...options,key:'question-b'});a.send({type:'DRAFT',value:'How is value defined?'});b.send({type:'DRAFT',value:'Different question'});a.send({type:'ASK',key:'OPENAI_API_KEY',provider:'OpenAI',model:'configured-model',locations:[location]});await settle();
 expect(a.actor.getSnapshot().context.turns).toHaveLength(1);expect(b.actor.getSnapshot().context.turns).toHaveLength(0);expect(b.actor.getSnapshot().context.draft).toBe('Different question');expect(requests[0].prompt).toContain(rev);expect(requests[0].prompt).not.toContain('Different question');a.dispose();b.dispose();
 a=createConversationSession({...options,key:'question-a'});b=createConversationSession({...options,key:'question-b'});expect(a.actor.getSnapshot().context.turns[0].sources[0]).toMatchObject({file:'code.ts',rev});expect(b.actor.getSnapshot().context.draft).toBe('Different question');a.dispose();b.dispose();
});
test('cancellation and teardown abort provider work and prevent late answers from persisting',async()=>{
 const disk=storage(),requests=[],session=createConversationSession({key:'cancel',storage:disk,repo:'test/repo',headRef:'main',readFile,generate:(request,delta,signal)=>new Promise(resolve=>requests.push({signal,resolve,delta}))});
 session.send({type:'DRAFT',value:'question'});const event={type:'ASK',key:'configured',provider:'Provider',model:'model',locations:[location]};session.send(event);await settle();session.send({type:'CANCEL'});expect(requests[0].signal.aborted).toBe(true);requests[0].delta('late');requests[0].resolve('late answer');await settle();expect(session.actor.getSnapshot().context.turns).toHaveLength(0);expect(session.actor.getSnapshot().context.draft).toBe('question');
 session.send(event);await settle();session.dispose();expect(requests[1].signal.aborted).toBe(true);requests[1].resolve('late after close');await settle();expect(JSON.parse(disk.getItem('cancel')).turns).toHaveLength(0);
});
test('only citations inside supplied pinned excerpts become clickable evidence',async()=>{
 const signal=new AbortController().signal,sources=await conversationSources({repo:'test/repo',headRef:'main',locations:[location],readFile,signal});
 const cited=conversationCitations('Valid [S1:L2]. Wrong source [S2:L2], line [S1:L90], reverse [S1:L3-L2], URL https://example.invalid.',sources);expect(cited).toHaveLength(1);expect(cited[0]).toMatchObject({line:2,endLine:2,rev,excerpt:'export const value=1;'});
 const prompt=conversationPrompt('question',[],sources);expect(prompt).toContain('untrusted data');expect(prompt).toContain('[S1] test/repo code.ts');
});
test('unreadable storage preserves original bytes and unavailable provider never appears to have answered',()=>{
 const disk=storage();disk.values.set('broken','{"version":99,"private":"keep"}');const errors=[],session=createConversationSession({key:'broken',storage:disk,repo:'test/repo',headRef:'main',onError:error=>errors.push(error)});session.send({type:'DRAFT',value:'still in memory'});session.send({type:'ASK',key:'',model:'',locations:[location]});expect(session.actor.getSnapshot().matches('idle')).toBe(true);expect(session.actor.getSnapshot().context.turns).toHaveLength(0);expect(disk.getItem('broken')).toBe('{"version":99,"private":"keep"}');expect(errors).toHaveLength(1);session.dispose();
});

test('foreign repository evidence is quarantined rather than reused by a different PR conversation',async()=>{
 const disk=storage(),options={key:'same',storage:disk,repo:'test/repo',headRef:'main',readFile,generate:async()=> 'answer [S1:L2]'};const first=createConversationSession(options);first.send({type:'DRAFT',value:'question'});first.send({type:'ASK',key:'configured',provider:'Provider',model:'model',locations:[location]});await settle();first.dispose();const original=disk.getItem('same'),errors=[];const other=createConversationSession({...options,repo:'other/repo',onError:error=>errors.push(error)});expect(other.actor.getSnapshot().context.turns).toHaveLength(0);other.send({type:'DRAFT',value:'keep isolated'});expect(disk.getItem('same')).toBe(original);expect(errors).toHaveLength(1);other.dispose();
});

test('source windows reject an invalid selected line and citations retain shortened-excerpt disclosure',async()=>{
 const signal=new AbortController().signal;await expect(conversationSources({repo:'test/repo',headRef:'main',locations:[{...location,line:10}],readFile,signal})).rejects.toThrow('Source range unavailable');
 const sources=await conversationSources({repo:'test/repo',headRef:'main',locations:[{...location,line:1}],readFile:async()=>({status:'ok',content:'x'.repeat(9000)}),signal});const evidence=conversationCitations('[S1:L1]',sources);expect(sources[0].truncated).toBe(true);expect(evidence[0].truncated).toBe(true);expect(evidence[0].excerpt).toHaveLength(8000);expect(conversationPrompt('question',[],sources)).toContain('last line may be incomplete');
});
