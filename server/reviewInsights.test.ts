import {test,expect,afterAll} from 'bun:test';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {computeReviewInsights} from './reviewInsightsWorker.ts';
import {reviewInsights,validInsightsRequest} from './reviewInsights.ts';
import {compareFunctions} from '../shared/review-insights.ts';

const roots:string[]=[];
afterAll(()=>roots.forEach(path=>rmSync(path,{recursive:true,force:true})));
const git=(root:string,...args:string[])=>{const p=Bun.spawnSync(['git','-C',root,...args],{stdout:'pipe',stderr:'pipe'});if(!p.success)throw Error(p.stderr.toString());return p.stdout.toString().trim();};
function fixture(){
  const root=mkdtempSync(join(tmpdir(),'review-insights-'));roots.push(root);
  git(root,'init','-q');git(root,'config','user.name','Test');git(root,'config','user.email','test@example.com');
  const save=(files:Record<string,string>,title:string,when?:string)=>{for(const [path,content]of Object.entries(files)){mkdirSync(join(root,path,'..'),{recursive:true});writeFileSync(join(root,path),content);}git(root,'add','.');const commit=Bun.spawnSync(['git','-C',root,'commit','-qm',title],{env:{...process.env,...(when?{GIT_AUTHOR_DATE:when,GIT_COMMITTER_DATE:when}:{})},stdout:'pipe',stderr:'pipe'});if(!commit.success)throw Error(commit.stderr.toString());return git(root,'rev-parse','HEAD');};
  return {root,save};
}
const installed=existsSync(new URL('../node_modules/.prview-analysis/bin/python',import.meta.url));
test.skipIf(!installed)('real Lizard compares changed functions at pinned revisions and history excludes the PR',()=>{
  const {root,save}=fixture();
  save({'main.ts':'export function value(x:number) { return x; }\n','helper.ts':'export const helper=1;\n'},'First');
  const base=save({'main.ts':'export function value(x:number) { return x + 1; }\n','helper.ts':'export const helper=2;\n'},'Baseline');
  const head=save({'main.ts':"import { helper } from './helper';\nexport function value(x:number) { if(x>0) return helper; if(x<0) return -1; return x; }\n",'helper.ts':"import { value } from './main';\nexport const helper = value(0);\n"},'PR changes');
  save({'main.ts':'export function value() { return 42; }\n'},'Future local checkout');
  const patch=git(root,'diff','--no-ext-diff','--no-textconv',base,head);
  const result=computeReviewInsights(root,{repo:'sample/project',number:1,base,head},patch);
  expect(result.provider).toEqual({name:'Lizard',version:'1.25.1',available:true});
  const file=result.files['main.ts']!;
  expect(file.complexity.changes.map(change=>[change.name,change.base?.complexity,change.head?.complexity,change.delta])).toEqual([['value',1,3,2]]);
  expect(file.activity.count).toBe(2);expect(file.activity.commits.map(c=>c.title)).toEqual(['Baseline','First']);
  expect(file.activity.related).toEqual([{path:'helper.ts',commits:2}]);
  expect(result.history.limited).toBe(false);expect(file.score).toBe(6);
  expect(file.dependencies.dependents.map(e=>e.path)).toEqual(['helper.ts']);
  expect(file.newCycle).toBe(true);expect(file.dependencies.cycles[0]?.paths.sort()).toEqual(['helper.ts','main.ts']);
  expect(result.coverage.dependencyScope).toBe('changed-files');
});
test('missing analyzer is explicit while history remains available, unsupported files do not get zero metrics',()=>{
  const {root,save}=fixture();const base=save({'a.ts':'export const a=1;','data.json':'{}'},'Base');const head=save({'a.ts':'export const a=2;','data.json':'{"a":2}'},'Head');
  const result=computeReviewInsights(root,{repo:'sample/project',number:1,base,head},git(root,'diff',base,head),'/missing/python');
  expect(result.provider.available).toBe(false);expect(result.files['a.ts']?.complexity.status).toBe('unavailable');expect(result.files['a.ts']?.score).toBeNull();
  expect(result.files['data.json']?.complexity.status).toBe('unsupported');expect(result.files['data.json']?.complexity.total).toBeNull();expect(result.history.status).toBe('ok');
});
test.skipIf(!installed)('rename paths use old base source and literal history while absent base source is not fabricated',()=>{
  const {root,save}=fixture();const prefix=Array.from({length:12},(_,i)=>`export const marker${i}=${i};\n`).join('');const base=save({'a[1].ts':prefix+'export function one(x:number) { return x; }\n'},'Base');
  git(root,'mv','a[1].ts','renamed.ts');const head=save({'renamed.ts':prefix+'export function one(x:number) { if(x) return x; return 0; }\n','new.ts':'export function added(){ return 1; }'},'Move and change');
  const result=computeReviewInsights(root,{repo:'sample/project',number:1,base,head},git(root,'diff','--find-renames=10%',base,head));
  expect(result.files['renamed.ts']?.basePath).toBe('a[1].ts');expect(result.files['renamed.ts']?.complexity.changes[0]?.delta).toBe(1);
  expect(result.files['renamed.ts']?.activity.count).toBe(1);expect(result.files['new.ts']?.complexity.changes[0]?.kind).toBe('added');expect(result.files['new.ts']?.activity.count).toBe(0);
});
test('invalid and oversized service requests are rejected before worker execution',async()=>{
  const good={repo:'sample/project',number:1,base:'a'.repeat(40),head:'b'.repeat(40)};
  for(const patch of [{repo:'../escape'}, {number:0}, {head:'--all'}, {base:'main'}])expect(validInsightsRequest({...good,...patch})).toBe(false);
  await expect(reviewInsights('/unused',{...good,head:'--all'},'')).rejects.toThrow('Invalid');
  await expect(reviewInsights('/unused',good,'x'.repeat(16_000_001))).rejects.toThrow('Invalid');
});
test('comparison matching never guesses between duplicate function names or treats removals as zero',()=>{
  const fn=(start:number,complexity:number)=>({name:'same',signature:'same()',start,end:start+2,complexity,nloc:3});
  const changes=compareFunctions([fn(1,8),fn(5,2)],[fn(1,10)],'@@ -1,7 +1,3 @@\n-old\n+new');
  expect(changes[0]?.kind).toBe('unmatched');expect(changes[0]?.delta).toBeNull();
  const removed=compareFunctions([fn(1,8)],[],'@@ -1,3 +0,0 @@\n-old',false,true)[0]!;
  expect(removed.kind).toBe('removed');expect(removed.head).toBeNull();expect(removed.delta).toBeNull();
});
test('unavailable comparisons release worker capacity instead of permanently blocking analysis',async()=>{
  const {root}=fixture();const request={repo:'sample/project',number:1,base:'a'.repeat(40),head:'b'.repeat(40)};
  for(let i=0;i<3;i++) await expect(reviewInsights(root,{...request,number:i+1},'')).rejects.toThrow('Pinned Git evidence');
});

test('history traverses nonmonotonic commit dates instead of silently missing in-window ancestors',()=>{
  const {root,save}=fixture();save({'a.ts':'export const a=1;'},'In-window ancestor','2026-10-15T12:00:00Z');save({'b.ts':'export const b=1;'},'Old-dated intermediate','2026-01-01T12:00:00Z');
  const base=save({'b.ts':'export const b=2;'},'Base','2026-11-01T12:00:00Z');const head=save({'a.ts':'export const a=2;'},'PR','2026-11-02T12:00:00Z');
  const result=computeReviewInsights(root,{repo:'sample/project',number:1,base,head},git(root,'diff',base,head),'/missing/python');
  expect(result.history.status).toBe('ok');expect(result.files['a.ts']?.activity.commits.map(c=>c.title)).toEqual(['In-window ancestor']);
});
test('shrinking an existing cyclic group does not label its surviving cycle as new',()=>{
  const {root,save}=fixture();const base=save({'a.ts':"import {b} from './b'; export const a=1;",'b.ts':"import {a} from './a'; import {c} from './c'; export const b=1;",'c.ts':"import {b} from './b'; export const c=1;"},'Existing cycle');
  const head=save({'a.ts':"import {b} from './b'; export const a=2;",'b.ts':"import {a} from './a'; export const b=1;",'c.ts':'export const c=1;'},'Shrink cycle');
  const result=computeReviewInsights(root,{repo:'sample/project',number:1,base,head},git(root,'diff',base,head),'/missing/python');
  expect(result.files['a.ts']?.dependencies.cycles).toHaveLength(1);expect(result.files['a.ts']?.newCycle).toBe(false);
});

test.skipIf(!installed)('metrics use the three-dot merge-base rather than an independently advanced target branch',()=>{
 const {root,save}=fixture();const common=save({'a.ts':'export function f(x:number){return x;}\n','b.ts':'export const b=1;'},'Common');
 const target=save({'a.ts':'\nexport function f(x:number){if(x>0)return 1;if(x<0)return -1;return x;}\n'},'Target advanced');
 git(root,'checkout','--detach',common);const head=save({'a.ts':"import {b} from './b';\nexport function f(x:number){if(x)return b;return x;}\n",'b.ts':"import {f} from './a'; export const b=f(0);"},'PR adds branch');
 const result=computeReviewInsights(root,{repo:'sample/project',number:1,base:target,head},git(root,'diff',`${target}...${head}`));
 const change=result.files['a.ts']!.complexity.changes[0]!;
 expect(result.base).toBe(target);expect(result.diffBase).toBe(common);expect([change.base?.complexity,change.head?.complexity,change.delta]).toEqual([1,2,1]);expect(change.anchor).toEqual({line:2,side:'right'});expect(result.files['a.ts']?.dependencies.imports.map(edge=>edge.path)).toEqual(['b.ts']);expect(result.files['a.ts']?.newCycle).toBe(true);
});
test.skipIf(!installed)('reviewed comments cannot suppress Lizard measurements',()=>{
 const {root,save}=fixture();const base=save({'a.ts':'export function f(x:number){if(x)return 1;return 0;}\n'},'Base');
 const head=save({'a.ts':'// GENERATED CODE\n// #lizard forgive global\nexport function f(x:number){if(x>0)return 1;if(x<0)return -1;return 0;}\n'},'Add branching and directive');
 const file=computeReviewInsights(root,{repo:'sample/project',number:1,base,head},git(root,'diff',base,head)).files['a.ts']!;
 expect(file.complexity.status).toBe('ok');expect(file.complexity.changes[0]?.delta).toBe(1);expect(file.complexity.total).toBe(3);
});
test.skipIf(!installed)('truncated inventories cannot turn a removed duplicate declaration into an increase',()=>{
 const {root,save}=fixture();const helpers=Array.from({length:499},(_,i)=>`export function f${i}(){return ${i};}\n`).join('');
 const later='class Later { target(x:number){if(x>1)return 1;if(x>2)return 2;if(x>3)return 3;return 0;} }\n';
 const base=save({'a.ts':'export function target(){return 0;}\n'+helpers+later},'Duplicate beyond inventory bound');const head=save({'a.ts':helpers+later},'Remove first declaration');
 const file=computeReviewInsights(root,{repo:'sample/project',number:1,base,head},git(root,'diff',base,head)).files['a.ts']!;
 expect(file.complexity.limited).toBe(true);expect(file.complexity.status).toBe('unavailable');expect(file.complexity.changes).toEqual([]);expect(file.score).toBeNull();expect(file.complexityIncreased).toBe(false);
});
test('special filename keys survive serialization and large commit metadata stays bounded',()=>{
 const {root,save}=fixture();const names=['__proto__',...Array.from({length:31},(_,i)=>`file${i}.json`)];const contents=(value:string)=>Object.fromEntries(names.map(path=>[path,value]));
 const base=save(contents('{}'),'x'.repeat(100000));const head=save(contents('{"a":1}'),'Head');
 const result=computeReviewInsights(root,{repo:'sample/project',number:1,base,head},git(root,'diff',base,head),'/missing/python');
 const serialized=JSON.stringify(result);expect(Object.hasOwn(JSON.parse(serialized).files,'__proto__')).toBe(true);expect(result.history.limited).toBe(true);expect(result.files['__proto__']?.activity.commits[0]?.title.length).toBeLessThanOrEqual(400);expect(serialized.length).toBeLessThan(150000);
});
