import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { analyze } from '../analysis.ts';
import { buildReferenceGraph, relatedCandidates, resolveChangedImport, resolveChangedFilePath } from '../relationships.ts';

test('relative module resolution uses paths, accepts TS source for JS imports, and refuses ambiguity', () => {
  const files = [{filename:'src/schema.ts',status:'modified'}, {filename:'other/schema.ts',status:'modified'}, {filename:'src/tools/index.ts',status:'modified'}, {filename:'src/deleted.ts',status:'removed'}];
  assert.deepEqual(resolveChangedImport('src/main.ts', './schema.js', files), {status:'resolved',path:'src/schema.ts',resolution:'source_extension_candidate'});
  assert.deepEqual(resolveChangedImport('src/main.ts', './tools', files), {status:'resolved',path:'src/tools/index.ts',resolution:'extensionless_candidate'});
  assert.deepEqual(resolveChangedImport('src/main.ts', './schema.ts', files), {status:'resolved',path:'src/schema.ts',resolution:'literal_changed_path'});
  assert.equal(resolveChangedImport('src/main.ts', '../missing/schema.ts', files).status, 'not_changed');
  assert.equal(resolveChangedImport('src/main.ts', './deleted.ts', files).status, 'not_changed');
  assert.equal(resolveChangedImport('src/main.ts', '@app/schema', files).status, 'unsupported');
  assert.equal(resolveChangedImport('src/main.ts', '.schema', files).status, 'unsupported');
  assert.equal(resolveChangedImport('src/main.ts', '../../outside.ts', files).status, 'outside_repository');
  assert.equal(resolveChangedImport('src/main.ts', './schema', [...files,{filename:'src/schema.js',status:'modified'}]).status, 'ambiguous');
});

test('the pinned state-manager call links to a schema candidate with direction and exact source provenance', () => {
  const capture = JSON.parse(readFileSync(new URL('../fixtures/vscode-346423.json', import.meta.url), 'utf8'));
  const bundle = JSON.parse(readFileSync(new URL('../fixtures/source-facts/vscode-346423.json', import.meta.url), 'utf8'));
  const graph = buildReferenceGraph(capture, bundle);
  const from = 'src/vs/platform/agentHost/node/agentHostStateManager.ts';
  const to = 'src/vs/platform/agentHost/common/sandboxConfigSchema.ts';
  const edge = graph.edges.find(edge => edge.from === from && edge.to === to && edge.kind === 'imported_member_call');
  assert(edge);
  assert.equal(edge.evidence[0].line, 2862);
  assert.equal(edge.evidence[0].changed, true);
  assert.equal(edge.resolution, 'source_extension_candidate');
  assert(edge.evidence[0].url.includes(capture.head_sha));
  const files = analyze(capture);
  assert(relatedCandidates(files.find(file => file.filename === to), files, graph).some(candidate => candidate.file.filename === from && candidate.kind === 'source'));
  assert.deepEqual(buildReferenceGraph(capture, {...bundle,headSha:'stale'}).edges, []);
});

test('removed modules and base facts never become current-head dependencies', () => {
  const capture = JSON.parse(readFileSync(new URL('../fixtures/storybook-36948.json', import.meta.url), 'utf8'));
  const bundle = JSON.parse(readFileSync(new URL('../fixtures/source-facts/storybook-36948.json', import.meta.url), 'utf8'));
  const graph = buildReferenceGraph(capture, bundle);
  const removed = new Set(capture.files.filter(file => file.status === 'removed').map(file => file.filename));
  assert(removed.size > 0);
  assert(graph.edges.every(edge => !removed.has(edge.from) && !removed.has(edge.to)));
  assert.equal(graph.coverage.baseFilesExcluded, removed.size);
});

test('same-name heuristics do not join unrelated packages and generic mock folders stay navigable', () => {
  const source = {files:['packages/a/src/value.ts','packages/b/test/value.test.ts','src/mocks/a.ts','src/mocks/b.ts'].map(filename=>({filename,status:'modified',additions:1,deletions:0,changes:1,patch:''}))};
  const files = analyze(source);
  const graph = {edges:[],diagnostics:[],coverage:{}};
  assert.deepEqual(relatedCandidates(files[0], files, graph), []);
  assert.deepEqual(relatedCandidates(files[2], files, graph).map(candidate => candidate.file.filename), ['src/mocks/b.ts']);
});

test('an empty snapshot keeps its fixture connections without pretending they are source calls', () => {
  const capture = JSON.parse(readFileSync(new URL('../fixtures/storybook-36212.json', import.meta.url), 'utf8'));
  const files = analyze(capture);
  const empty = files.find(file => file.filename.endsWith('lit-property-only/description.snapshot'));
  const candidates = relatedCandidates(empty, files, buildReferenceGraph(capture));
  const story = candidates.find(candidate => candidate.file.name === 'input.stories.ts');
  assert.equal(story.kind, 'heuristic');
  assert.deepEqual(story.edges, []);
});

test('misattributed base-side deletions cannot produce current-head source links', () => {
  const capture = JSON.parse(readFileSync(new URL('../fixtures/storybook-36948.json', import.meta.url), 'utf8'));
  const bundle = JSON.parse(readFileSync(new URL('../fixtures/source-facts/storybook-36948.json', import.meta.url), 'utf8'));
  const removed = bundle.files.find(file => file.side === 'base');
  removed.side = 'head';
  removed.revision = capture.head_sha;
  const graph = buildReferenceGraph(capture, bundle);
  assert(!graph.edges.some(edge => edge.from === removed.path || edge.to === removed.path));
  assert(graph.diagnostics.some(message => message.includes(removed.path)));
});

test('source evidence deduplicates repeated references at the same line', () => {
  const capture = JSON.parse(readFileSync(new URL('../fixtures/vscode-346423.json', import.meta.url), 'utf8'));
  const bundle = JSON.parse(readFileSync(new URL('../fixtures/source-facts/vscode-346423.json', import.meta.url), 'utf8'));
  const state = bundle.files.find(file => file.path.endsWith('agentHostStateManager.ts'));
  const call = state.importedCalls.find(call => call.expression === 'sandboxConfigSchema.values');
  state.importedCalls.push({...call});
  const edge = buildReferenceGraph(capture, bundle).edges.find(edge => edge.from === state.path && edge.kind === 'imported_member_call' && edge.to.endsWith('sandboxConfigSchema.ts'));
  assert.equal(edge.observations, 2);
  assert.equal(edge.evidence.length, 1);
});

test('the renamed mock fixture links to its literal path consumer without claiming an import', () => {
  const capture = JSON.parse(readFileSync(new URL('../fixtures/storybook-36948.json', import.meta.url), 'utf8'));
  const bundle = JSON.parse(readFileSync(new URL('../fixtures/source-facts/storybook-36948.json', import.meta.url), 'utf8'));
  const files = analyze(capture), graph = buildReferenceGraph(capture,bundle);
  const fixture = files.find(file=>file.filename.endsWith('/mocks/csf2-variances.stories.tsx'));
  const consumer = relatedCandidates(fixture,files,graph).find(candidate=>candidate.file.name === 'update-args-in-csf-file.test.ts');
  assert(consumer);
  assert(consumer.edges.some(edge=>edge.kind === 'file_path' && edge.resolution === 'literal_changed_path'));
});

test('literal file paths remain exact when a TypeScript sibling makes module matching ambiguous', () => {
  const files = [{filename:'test/fixture.js',status:'modified'},{filename:'test/fixture.ts',status:'modified'}];
  assert.equal(resolveChangedImport('test/check.ts','./fixture.js',files).status,'ambiguous');
  assert.deepEqual(resolveChangedFilePath('test/check.ts','./fixture.js',files), {status:'resolved',path:'test/fixture.js',resolution:'literal_changed_path'});
  assert.equal(resolveChangedFilePath('test/check.ts','./fixture',files).status,'not_changed');
  const capture = {repository:'example/repo',head_sha:'head',reported_base_sha:'base',files:[...files,{filename:'test/check.ts',status:'modified'}]};
  const bundle = {schemaVersion:1,repository:capture.repository,headSha:'head',reportedBaseSha:'base',files:[{
    path:'test/check.ts',status:'ok',side:'head',revision:'head',lineCount:1,
    fileReferences:[{specifier:'./fixture.js',line:1,excerpt:"join(__dirname, 'fixture.js')",changed:true}],
  }]};
  assert.deepEqual(buildReferenceGraph(capture,bundle).edges.map(edge => [edge.to,edge.kind]), [['test/fixture.js','file_path']]);
});
