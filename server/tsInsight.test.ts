import {test,expect} from 'bun:test';
import {insightAt,type ShaSource,type InsightOutline} from './tsService.ts';
let sequence=0;
function source(files:Record<string,string>):ShaSource{return {key:`insight-test-${++sequence}`,paths:()=>Object.keys(files),readFile:path=>files[path] ?? null};}
const flatten=(items:InsightOutline[]):InsightOutline[]=>items.flatMap(item=>[item,...flatten(item.children)]);

test('hover contains real signature and documentation at the selected source position',()=>{
  const text='/** Parse the supplied token. */\nexport function parse(name: string): number { return 1; }';
  const result=insightAt(source({'parser.ts':text}),{path:'parser.ts',kind:'hover',line:2,character:17,symbol:'parse'});
  expect(result.status).toBe('ok');expect(result.hover?.signature).toContain('parse(name: string): number');expect(result.hover?.documentation).toBe('Parse the supplied token.');
});
test('type navigation reaches an unchanged imported type and implementation discovery uses supplied roots',()=>{
  const files={'contract.ts':'export interface Handler { run(input: string): number }',
    'primary.ts':"import type { Handler } from './contract';\nexport class Primary implements Handler { run(input: string): number { return 1; } }",
    'secondary.ts':"import type { Handler } from './contract';\nexport class Secondary implements Handler { run(input: string): number { return 2; } }",
    'caller.ts':"import type { Handler } from './contract';\nexport function use(handler: Handler) { return handler.run('x'); }"};
  const src=source(files);
  const type=insightAt(src,{path:'caller.ts',kind:'type',line:2,character:22,symbol:'handler'});
  expect(type.locations.some(item=>item.path==='contract.ts' && item.line===1)).toBe(true);
  const implementations=insightAt(src,{path:'contract.ts',kind:'implementation',line:1,character:18,symbol:'Handler',candidatePaths:Object.keys(files)});
  expect(implementations.locations.map(item=>item.path).sort()).toEqual(['primary.ts','secondary.ts']);
  const bounded=insightAt(src,{path:'contract.ts',kind:'implementation',line:1,character:18,symbol:'Handler',candidatePaths:['primary.ts']});
  expect(bounded.locations.map(item=>item.path)).toEqual(['primary.ts']);
});
test('outline supplies nested source ranges and explicitly bounds long outlines',()=>{
  const src=source({'shape.ts':'export class Shape {\n  run(value: number) { return value; }\n}'});
  const result=insightAt(src,{path:'shape.ts',kind:'outline',line:1,character:0});
  const items=flatten(result.outline);expect(items.find(item=>item.name==='Shape')?.range).toMatchObject({line:1,endLine:3});expect(items.find(item=>item.name==='run')?.selection.line).toBe(2);
  const many=source({'many.ts':Array.from({length:520},(_,i)=>`export const item${i} = ${i};`).join('\n')});
  const bounded=insightAt(many,{path:'many.ts',kind:'outline',line:1,character:0});expect(flatten(bounded.outline)).toHaveLength(500);expect(bounded.limited).toBe(true);
});
test('immutable source keys and original/head signatures stay independent',()=>{
  const original=source({'code.ts':'export const value: string = "old";'}),head=source({'code.ts':'export const value: number = 2;'});
  const query={path:'code.ts',kind:'hover' as const,line:1,character:13,symbol:'value'};
  expect(insightAt(original,query).hover?.signature).toContain('string');expect(insightAt(head,query).hover?.signature).toContain('number');expect(insightAt(original,query).hover?.signature).toContain('string');
});
test('unsupported, oversized, invalid-position and stale-symbol requests do not invent results',()=>{
  expect(insightAt(source({'doc.md':'# Notes'}),{path:'doc.md',kind:'outline',line:1,character:0}).status).toBe('unsupported');
  expect(insightAt(source({'large.ts':'x'.repeat(512*1024+1)}),{path:'large.ts',kind:'outline',line:1,character:0}).reason).toContain('512KiB');
  const src=source({'code.ts':'export const value = 2;'});
  expect(insightAt(src,{path:'code.ts',kind:'hover',line:1,character:500,symbol:'value'}).status).toBe('unavailable');
  expect(insightAt(src,{path:'code.ts',kind:'hover',line:1,character:13,symbol:'other'}).hover).toBeNull();
});
test('Svelte insights preserve script positions and leave template expressions outside analysis',()=>{
  const src=source({'View.svelte':'<script lang="ts">\n  /** Count items. */\n  const count: number = 1;\n</script>\n<p>{count}</p>'});
  const script=insightAt(src,{path:'View.svelte',kind:'hover',line:3,character:9,symbol:'count'});expect(script.hover?.documentation).toBe('Count items.');
  expect(insightAt(src,{path:'View.svelte',kind:'hover',line:5,character:4,symbol:'count'}).hover).toBeNull();
  expect(flatten(insightAt(src,{path:'View.svelte',kind:'outline',line:1,character:0}).outline).find(item=>item.name==='count')?.selection.line).toBe(3);
});

test('the 300-root boundary retains the final implementation without counting the origin twice',()=>{
  const files:Record<string,string>={'contract.ts':'export interface Handler { run(): number }'};
  for(let i=0;i<298;i++)files[`other${i}.ts`]=`export const other${i} = ${i};`;
  files['last.ts']="import type { Handler } from './contract';\nexport class Last implements Handler {run(): number {return 1;}}";
  const result=insightAt(source(files),{path:'contract.ts',kind:'implementation',symbol:'Handler',line:1,character:18,candidatePaths:Object.keys(files)});
  expect(result.locations.map(item=>item.path)).toEqual(['last.ts']);expect(result.limited).toBe(false);
});
test('the advertised source size cap measures UTF-8 bytes',()=>{
  const text='/**'+ '漢'.repeat(200000)+'*/\nexport const value = 1;';expect(Buffer.byteLength(text)).toBeGreaterThan(512*1024);
  const result=insightAt(source({'unicode.ts':text}),{path:'unicode.ts',kind:'outline',line:1,character:0});expect(result.status).toBe('unavailable');expect(result.reason).toContain('512KiB');
});

test('implementation snippets are bounded and disclose shortening',()=>{
  const files={'contract.ts':'export interface Handler {run(): string}', 'large.ts':"import type {Handler} from './contract';\nexport class Large implements Handler {run(): string {return '"+'x'.repeat(9000)+"';}}"};
  const result=insightAt(source(files),{path:'contract.ts',kind:'implementation',symbol:'Handler',line:1,character:18,candidatePaths:Object.keys(files)});
  expect(result.locations[0]?.text).toHaveLength(8000);expect(result.limited).toBe(true);
});
