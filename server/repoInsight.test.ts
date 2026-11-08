import {test,expect} from 'bun:test';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validInsightRequest,type InsightQuery} from './repoInsight.ts';
const valid:InsightQuery={repo:'test/repository',sha:'a'.repeat(40),headRef:'main',path:'src/code.ts',kind:'hover',symbol:'value',line:2,character:13};
test('insight requests require an immutable source position, supported operation and safe repository path',()=>{
  expect(validInsightRequest(valid)).toBe(true);expect(validInsightRequest({...valid,kind:'outline',symbol:''})).toBe(true);
  for(const patch of [{sha:'main'},{repo:'../outside'},{headRef:'--all'},{path:'../outside'},{path:'/absolute'},{path:'a\0b'},{kind:'execute'},{symbol:'x();'},{line:0},{character:-1}])expect(validInsightRequest({...valid,...patch})).toBe(false);
});
test('HTTP worker insights retain revisions, real targets and explicit partial/unsupported analysis without network',async()=>{
  const data=mkdtempSync(join(tmpdir(),'prview-insights-')),root=join(data,'source');mkdirSync(root);
  function git(...args:string[]){const result=Bun.spawnSync(['git','-C',root,...args],{stdout:'pipe',stderr:'pipe',env:{...process.env,GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_SYSTEM:'/dev/null'}});if(!result.success)throw new Error(result.stderr.toString());return result.stdout.toString().trim();}
  try {
    git('init','-q');git('config','user.name','Test');git('config','user.email','test@example.invalid');git('config','commit.gpgsign','false');
    writeFileSync(join(root,'code.ts'),'/** A parsed token. */\nexport const value: string = "base";');
    writeFileSync(join(root,'contract.ts'),'export interface Handler { run(input: string): number }');
    writeFileSync(join(root,'primary.ts'),"import type { Handler } from './contract';\nexport class Primary implements Handler { run(input: string): number { return 1; } }");
    writeFileSync(join(root,'caller.ts'),"import type { Handler } from './contract';\nexport function use(handler: Handler) { return handler.run('x'); }");
    writeFileSync(join(root,'notes.md'),'# Repository notes');
    for(let i=0;i<305;i++)writeFileSync(join(root,`unrelated${i}.ts`),`export const item${i} = ${i};`);
    git('add','.');git('commit','-q','-m','Baseline');const base=git('rev-parse','HEAD');
    writeFileSync(join(root,'code.ts'),'/** A parsed token. */\nexport const value: number = 2;');git('add','.');git('commit','-q','-m','Change');const head=git('rev-parse','HEAD');
    mkdirSync(join(data,'mirrors'));const clone=Bun.spawnSync(['git','clone','--bare','--quiet',root,join(data,'mirrors','test__repository')],{stdout:'pipe',stderr:'pipe'});expect(clone.success).toBe(true);
    const script=`globalThis.fetch=async()=>{throw new Error('Unexpected network');};
      const {buildFetchHandler}=await import(${JSON.stringify(new URL('./http.ts',import.meta.url).href)});const handler=buildFetchHandler(4820);
      const request=async(patch)=>{const query=new URLSearchParams({repo:'test/repository',sha:${JSON.stringify(head)},headRef:'main',path:'code.ts',kind:'hover',symbol:'value',line:'2',col:'13',...patch});const response=await handler(new Request('http://127.0.0.1:4820/api/repo-insight?'+query));return {status:response.status,body:await response.json()};};
      const current=await request({});const original=await request({sha:${JSON.stringify(base)}});
      const outline=await request({kind:'outline',symbol:''});const unsupported=await request({kind:'outline',path:'notes.md',symbol:''});
      const type=await request({kind:'type',path:'caller.ts',symbol:'handler',line:'2',col:'22'});
      const implementation=await request({kind:'implementation',path:'contract.ts',symbol:'Handler',line:'1',col:'18'});
      const imports=await request({kind:'imports',path:'primary.ts',symbol:''});const invalid=await request({path:'../outside'});console.log(JSON.stringify({current,original,outline,unsupported,type,implementation,imports,invalid}));process.exit(0);`;
    const child=Bun.spawn([process.execPath,'-e',script],{env:{...process.env,COCKPIT_DATA_DIR:data,COCKPIT_GH_BIN:'/usr/bin/false',COCKPIT_MOCK:'',COCKPIT_MOCK_DATA:''},stdout:'pipe',stderr:'pipe',timeout:15000});
    const [exit,stdout,stderr]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);if(exit)throw new Error(stderr);
    const result=JSON.parse(stdout.trim());expect(result.current.status).toBe(200);expect(result.current.body.hover.signature).toContain('number');expect(result.original.body.hover.signature).toContain('string');expect(result.current.body.hover.documentation).toBe('A parsed token.');
    expect(result.outline.body.outline.some((item:{name:string})=>item.name==='value')).toBe(true);expect(result.unsupported.body.status).toBe('unsupported');expect(result.type.body.locations[0].path).toBe('contract.ts');
    expect(result.implementation.body.locations.map((item:{path:string})=>item.path)).toEqual(['primary.ts']);expect(result.implementation.body.coverage.limited).toBe(true);expect(result.implementation.body.coverage.reasons.join(' ')).toContain('candidate');expect(result.current.body.coverage.sourceOnly).toBe(true);expect(result.imports.body.imports[0]).toMatchObject({specifier:'./contract',line:1});expect(result.invalid.status).toBe(400);
  } finally {rmSync(data,{recursive:true,force:true});}
},20000);
