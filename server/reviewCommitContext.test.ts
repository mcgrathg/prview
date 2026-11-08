import {test,expect,afterAll} from 'bun:test';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileCommitContext,validCommitContextRequest} from './reviewCommitContext.ts';
const roots:string[]=[];
function repository(){
  const root=mkdtempSync(join(tmpdir(),'prview-commits-'));roots.push(root);
  const git=(...args:string[])=>{const result=Bun.spawnSync(['git','-C',root,...args],{env:{...process.env,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_SYSTEM:'/dev/null'},stdout:'pipe',stderr:'pipe'});if(!result.success)throw new Error(result.stderr.toString());return result.stdout.toString().trim();};
  git('init','-q');git('config','user.name','Test');git('config','user.email','test@example.invalid');git('config','commit.gpgsign','false');
  const commit=(path:string,text:string,message:string)=>{writeFileSync(join(root,path),text);git('add','--',path);writeFileSync(join(root,'.git','test-message'),message);git('commit','-q','--no-gpg-sign','-F',join(root,'.git','test-message'));return git('rev-parse','HEAD');};
  return {root,git,commit};
}
afterAll(()=>roots.forEach(root=>rmSync(root,{recursive:true,force:true})));

test('one commit shows the real headline and body at the captured comparison',async()=>{
  const {root,commit}=repository();const base=commit('code.ts','old','Baseline');const head=commit('code.ts','new','Validate inputs\n\nReject unsupported values.\nKeep the prior state.');
  const result=await fileCommitContext(root,{base,head,path:'code.ts'});
  expect(result.scope).toBe('file');expect(result.limited).toBe(false);
  expect(result.commits).toEqual([{sha:head,title:'Validate inputs',body:'Reject unsupported values.\nKeep the prior state.'}]);
});

test('multiple file commits remain candidates and later heads do not change a historical result',async()=>{
  const {root,commit}=repository();const base=commit('code.ts','0','Baseline');const first=commit('code.ts','1','First');commit('test.ts','test','Unrelated file');const second=commit('code.ts','2','Second');const future=commit('code.ts','3','Later head');
  expect((await fileCommitContext(root,{base,head:second,path:'code.ts'})).commits.map(c=>c.sha)).toEqual([second,first]);
  expect((await fileCommitContext(root,{base:first,head:future,path:'code.ts'})).commits.map(c=>c.sha)).toEqual([future,second]);
  expect((await fileCommitContext(root,{base:second,head:second,path:'code.ts'})).commits).toEqual([]);
});

test('pathspec characters are literal and an absent message body stays empty',async()=>{
  const {root,commit}=repository();const base=commit('a[1].ts','0','Baseline');commit('a1.ts','unrelated','Glob candidate');const head=commit('a[1].ts','1','Literal file');
  const result=await fileCommitContext(root,{base,head,path:'a[1].ts'});expect(result.commits).toEqual([{sha:head,title:'Literal file',body:''}]);
});

test('the file history is bounded and reports truncation honestly',async()=>{
  const {root,commit}=repository();const base=commit('code.ts','0','Baseline');let head=base;for(let i=1;i<=31;i++)head=commit('code.ts',String(i),`Change ${i}`);
  const result=await fileCommitContext(root,{base,head,path:'code.ts'});expect(result.commits).toHaveLength(30);expect(result.limited).toBe(true);expect(result.commits[0]?.title).toBe('Change 31');
});

test('invalid refs, traversal and missing history cannot become executable git arguments',async()=>{
  const {root,commit}=repository();const head=commit('code.ts','0','Baseline');
  for(const patch of [{head:'--all'},{base:'main'},{path:'../outside'},{path:'/outside'},{path:'a\0b'},{path:''}]){
    const request={base:head,head,path:'code.ts',...patch};expect(validCommitContextRequest(request)).toBe(false);await expect(fileCommitContext(root,request)).rejects.toThrow('Invalid commit context request.');
  }
  await expect(fileCommitContext(root,{base:'f'.repeat(40),head,path:'code.ts'})).rejects.toThrow('unavailable');
});

test('already-canceled requests stop and oversized messages fail within the output limit',async()=>{
  const {root,commit}=repository();const base=commit('code.ts','0','Baseline');const controller=new AbortController();controller.abort();
  await expect(fileCommitContext(root,{base,head:base,path:'code.ts'},controller.signal)).rejects.toThrow();
  const head=commit('code.ts','1','Large message\n\n'+'x'.repeat(600000));
  await expect(fileCommitContext(root,{base,head,path:'code.ts'})).rejects.toThrow();
});

test('HTTP boots the tracked reader and validates before accessing the mirror',async()=>{
  const {root,commit}=repository();const base=commit('code.ts','0','Baseline');const head=commit('code.ts','1','Change\n\nActual message.');
  const data=mkdtempSync(join(tmpdir(),'prview-context-http-'));roots.push(data);mkdirSync(join(data,'mirrors'));
  const clone=Bun.spawnSync(['git','clone','--bare','--quiet',root,join(data,'mirrors','test__repository')],{stdout:'pipe',stderr:'pipe'});expect(clone.success).toBe(true);
  const script=`globalThis.fetch=async()=>{throw new Error('Unexpected network');};
    const {buildFetchHandler}=await import(${JSON.stringify(new URL('./http.ts',import.meta.url).href)});
    const handler=buildFetchHandler(4820);
    const params=new URLSearchParams({repo:'test/repository',headRef:'main',head:${JSON.stringify(head)},base:${JSON.stringify(base)},path:'code.ts'});
    const good=await handler(new Request('http://127.0.0.1:4820/api/review-commit-context?'+params));
    params.set('path','../outside');const bad=await handler(new Request('http://127.0.0.1:4820/api/review-commit-context?'+params));
    console.log(JSON.stringify({status:good.status,result:await good.json(),invalid:bad.status}));`;
  const child=Bun.spawn([process.execPath,'-e',script],{env:{...process.env,COCKPIT_DATA_DIR:data,COCKPIT_GH_BIN:'/usr/bin/false',COCKPIT_MOCK:'',COCKPIT_MOCK_DATA:''},stdout:'pipe',stderr:'pipe'});
  const [exit,stdout,stderr]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);if(exit)throw new Error(stderr);
  const result=JSON.parse(stdout.trim());expect(result.status).toBe(200);expect(result.invalid).toBe(400);expect(result.result.commits).toEqual([{sha:head,title:'Change',body:'Actual message.'}]);
});
