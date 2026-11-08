import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { analyze } from '../analysis.ts';
import { orderByImports } from '../flow.ts';
import { buildReferenceGraph, followsImportFlow } from '../relationships.ts';

const filesFor = names => analyze({files:names.map(filename=>({filename,status:'modified',additions:1,deletions:0,changes:1,patch:''}))});
const graphFor = edges => ({edges:edges.map(([from,to,typeOnly=false])=>({from,to,typeOnly,kind:'import'})),diagnostics:[],coverage:{}});

test('a chosen root reads caller modules before their transitive imported modules', () => {
  const files = filesFor(['c.ts','b.ts','a.ts','unrelated.ts']);
  const result = orderByImports(files, graphFor([['a.ts','b.ts'],['b.ts','c.ts']]), 'a.ts');
  assert.deepEqual(result.ordered.map(file=>file.filename), ['a.ts','b.ts','c.ts','unrelated.ts']);
  assert.deepEqual([...result.reachable].sort(), ['a.ts','b.ts','c.ts']);
});

test('independent branches converge after both callers rather than after the first DFS branch', () => {
  const edges = [['a.ts','b.ts'],['a.ts','c.ts'],['b.ts','d.ts'],['c.ts','d.ts']];
  const files = filesFor(['d.ts','c.ts','b.ts','a.ts']);
  const result = orderByImports(files, graphFor(edges));
  const rank = new Map(result.ordered.map((file,index)=>[file.filename,index]));
  for (const [from,to] of edges) assert(rank.get(from)<rank.get(to), `${from} must precede ${to}`);
  assert.deepEqual(result.ordered.map(file=>file.filename), orderByImports([...files].reverse(),graphFor([...edges].reverse())).ordered.map(file=>file.filename));
});

test('cycles stay contiguous and retain every file once while exposing their ambiguity', () => {
  const files = filesFor(['c.ts','b.ts','a.ts']);
  const result = orderByImports(files, graphFor([['a.ts','b.ts'],['b.ts','a.ts'],['b.ts','c.ts']]), 'b.ts');
  assert.deepEqual(result.ordered.map(file=>file.filename), ['b.ts','a.ts','c.ts']);
  assert.deepEqual(new Set(result.cycles[0]), new Set(['a.ts','b.ts']));
  assert.equal(new Set(result.ordered.map(file=>file.filename)).size, 3);
});

test('a rooted view explicitly scopes its path and ignores explicit type imports', () => {
  const files = filesFor(['a.ts','b.ts','c.ts','types.ts']);
  const result = orderByImports(files, graphFor([['a.ts','c.ts'],['b.ts','c.ts'],['a.ts','types.ts',true]]), 'a.ts');
  assert.deepEqual(result.ordered.slice(0,2).map(file=>file.filename), ['a.ts','c.ts']);
  assert(!result.reachable.has('b.ts'));
  assert(!result.reachable.has('types.ts'));
  assert.equal(result.ordered.length, 4);
});

test('all real corpus files survive Flow and every cross-component import constraint holds', () => {
  for (const id of ['vscode-346423','storybook-36948','storybook-36212']) {
    const capture = JSON.parse(readFileSync(new URL(`../fixtures/${id}.json`,import.meta.url),'utf8'));
    const bundle = JSON.parse(readFileSync(new URL(`../fixtures/source-facts/${id}.json`,import.meta.url),'utf8'));
    const files = analyze(capture), graph = buildReferenceGraph(capture,bundle);
    const result = orderByImports(files,graph);
    const ranks = new Map(result.ordered.map((file,index)=>[file.filename,index]));
    assert.equal(ranks.size, capture.changed_files);
    assert.deepEqual([...ranks.keys()].sort(), capture.files.map(file=>file.filename).sort());
    for (const edge of graph.edges.filter(followsImportFlow)) {
      const cycle = result.cycles.some(paths=>paths.includes(edge.from)&&paths.includes(edge.to));
      assert(cycle || ranks.get(edge.from)<ranks.get(edge.to), `${id}: ${edge.from} -> ${edge.to}`);
    }
  }
});

test('file-path candidates stay related without becoming module-flow constraints', () => {
  const graph = graphFor([['a.ts','fixture.ts']]);
  graph.edges[0].kind = 'file_path';
  const flow = orderByImports(filesFor(['a.ts','fixture.ts']),graph,'a.ts');
  assert.deepEqual([...flow.reachable], ['a.ts']);
});
