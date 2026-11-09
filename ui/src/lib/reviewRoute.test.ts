import { reviewReferenceDestination } from './reviewRoute.js';
import { describe, expect, test } from 'bun:test';
import { buildReviewHash, normalizeReviewState, parseReviewRoute } from './reviewRoute.js';

describe('review route compatibility', () => {
  test('preserves conversation, Files, agent, action and comment links', () => {
    expect(parseReviewRoute('#/pr/acme/widgets/12')?.tab).toBe('conversation');
    expect(parseReviewRoute('#/pr/acme/widgets/12/files?comment=discussion_r31')?.commentTarget?.id).toBe(31);
    expect(parseReviewRoute('#/pr/acme/widgets/12/agents')?.tab).toBe('agents');
    const sha = 'a'.repeat(40);
    expect(parseReviewRoute(`#/pr/acme/widgets/12/actions?sha=${sha}&job=42`)).toMatchObject({ tab: 'actions', actionSha: sha, actionJob: 42 });
    expect(parseReviewRoute('#/pr/acme/widgets/12/actions?job=no')).toBeNull();
    expect(parseReviewRoute('#/pr/acme/widgets/12/actions?sha=no')).toBeNull();
  });
  test('preserves encoded history paths and symbols', () => {
    expect(parseReviewRoute('#/pr/acme/widgets/12/history/src%2Ffile.ts?symbol=a%26b')).toMatchObject({ tab: 'files', historyPath: 'src/file.ts', historySymbol: 'a&b' });
    expect(parseReviewRoute('#/pr/acme/widgets/12/history/%ZZ')).toBeNull();
  });
  test('rejects unrelated, malformed and unsafe PR identities', () => {
    for (const hash of ['#/actions', '#/pr/a/b/0', '#/pr/a/b/9007199254740992', '#/pr/a/b/2/unknown', '#/pr/a/b/2/files#x']) expect(parseReviewRoute(hash)).toBeNull();
  });
});

describe('shareable review snapshots', () => {
  test('round trips a pinned deleted-line source location with Unicode and reserved characters', () => {
    const review = normalizeReviewState({ file: 'src/日本語 & ?.ts', line: 39, side: 'left', view: 'source', rev: 'b'.repeat(40), base: 'a'.repeat(40), layout: 'unified', search: { mode: 'search', query: 'name & other' } });
    const hash = buildReviewHash('acme/widgets', 12, review);
    expect(hash).toContain('/files?v=1&');
    expect(parseReviewRoute(hash)?.review).toEqual(review);
    expect(buildReviewHash('acme/widgets', 12, parseReviewRoute(hash)?.review)).toBe(hash);
  });
  test('canonical URLs omit default values and ignore invalid optional values', () => {
    expect(buildReviewHash('acme/widgets', 12, {})).toBe('#/pr/acme/widgets/12/files?v=1');
    expect(parseReviewRoute('#/pr/acme/widgets/12/files?file=..%2Fsecret&line=-1&side=no&view=no&layout=no&controls=%7B&panes=%5B')?.review).toEqual(normalizeReviewState({}));
    expect(parseReviewRoute('#/pr/acme/widgets/12/files?file=src%2Fa.ts&line=9007199254740992')?.review.line).toBeNull();
  });
  test('ignores mutable or invalid revisions while retaining immutable SHA identities', () => {
    for (const rev of ['main', 'HEAD~1', 'a'.repeat(39), '../ref']) expect(normalizeReviewState({ rev, base: rev }).rev).toBeNull();
    expect(normalizeReviewState({ rev: 'a'.repeat(40) }).rev).toBe('a'.repeat(40));
  });
  test('keeps bounded organization snapshots readable at their maximum path lengths', () => {
    const paths = Array.from({ length: 250 }, (_, i) => `${i}-${'q'.repeat(2000)}`);
    const review = normalizeReviewState({ controls: { overrides: Object.fromEntries(paths.map(path => [path, 'show'])), expanded: paths, collapsedFolders: paths } });
    expect(parseReviewRoute(buildReviewHash('acme/widgets', 12, review))?.review).toEqual(review);
  });
  test('restores organization defaults, explicit Show all and bounded valid controls', () => {
    const controls = { order: 'flow', query: 'test', rules: {}, overrides: { 'src/a.ts': 'show', '../bad': 'hide', 'src/b.ts': 'invalid' }, root: 'src/a.ts', expanded: ['src/a.ts', '../bad', 'src/a.ts'], folders: true };
    const restored = parseReviewRoute(buildReviewHash('acme/widgets', 12, { controls }))?.review.controls;
    expect(restored).toEqual({ order: 'flow', query: 'test', rules: {}, overrides: { 'src/a.ts': 'show' }, root: 'src/a.ts', expanded: ['src/a.ts'], folders: false, collapsedFolders: [] });
    expect(normalizeReviewState({ controls: {} }).controls).toEqual({order:'path',query:'',rules:{},overrides:{},expanded:[],folders:true,collapsedFolders:[]});
    const oldControls={order:'attention',rules:{snapshot:'fold',fixture:'fold'},folders:false};
    expect(parseReviewRoute(buildReviewHash('acme/widgets',12,{controls:oldControls}))?.review.controls).toMatchObject(oldControls);
  });
  test('round trips collapsed directories and reads older controls as fully expanded', () => {
    const controls = { folders: true, collapsedFolders: ['src/feature', '../bad', 'Repository root', 'src/feature'] };
    const restored = parseReviewRoute(buildReviewHash('acme/widgets', 12, { controls }))?.review.controls;
    expect(restored?.collapsedFolders).toEqual(['src/feature', 'Repository root']);
    expect(restored?.folders).toBe(true);
    expect(parseReviewRoute('#/pr/acme/widgets/12/files?controls=%7B%22folders%22%3Atrue%7D')?.review.controls?.collapsedFolders).toEqual([]);
  });
  test('restores independent panes and a valid active pane without sharing references', () => {
    const input = { panes: [{ id: 'primary', file: 'a.ts', line: 2, layout: 'split' }, { id: 'other', file: 'b.ts', line: 8, side: 'left', layout: 'unified' }], active: 'other' };
    const review = parseReviewRoute(buildReviewHash('acme/widgets', 12, input))?.review;
    expect(review?.panes.map(p => [p.id, p.file, p.line, p.layout])).toEqual([['primary', 'a.ts', 2, 'split'], ['other', 'b.ts', 8, 'unified']]);
    expect(review?.active).toBe('other');
    input.panes[0].file = 'changed.ts';
    expect(review?.panes[0].file).toBe('a.ts');
    expect(normalizeReviewState({ ...input, active: 'missing' }).active).toBe('primary');
  });
  test('restores auxiliary files and related panes without requiring a selected file', () => {
    const review = { panes: [{ id: 'tree', view: 'files' }, { id: 'neighbors', view: 'related' }], active: 'neighbors' };
    expect(parseReviewRoute(buildReviewHash('acme/widgets', 12, review))?.review.panes?.map(p => [p.id, p.view, p.file])).toEqual([['tree', 'files', null], ['neighbors', 'related', null]]);
    expect(normalizeReviewState({ view: 'files' }).view).toBe('diff');
  });
  test('bounds pane count, removes duplicate IDs and rejects unsafe paths', () => {
    const panes = Array.from({ length: 30 }, (_, i) => ({ id: `pane-${i}`, file: `${i}.ts` }));
    expect(normalizeReviewState({ panes }).panes).toHaveLength(8);
    expect(normalizeReviewState({ panes: [panes[0], panes[0], { id: 'bad', file: '/etc/file' }] }).panes).toHaveLength(1);
    for (const file of ['../a', '/a', 'C:/a', 'a\\b', 'a/../b', 'a\u0000b']) expect(normalizeReviewState({ file }).file).toBeNull();
  });
});

test('reference origins round-trip independently of the currently opened result', () => {
  const references = { symbol: 'paint', path: 'src/caller.ts', line: 7, character: 3, rev: 'a'.repeat(40), base: 'b'.repeat(40) };
  const hash = buildReviewHash('owner/repo', 42, { file: 'src/result.ts', line: 22, view: 'source', references });
  expect(parseReviewRoute(hash)?.review.references).toEqual(references);
  expect(parseReviewRoute(hash)?.review.file).toBe('src/result.ts');
  expect(normalizeReviewState({ references: { ...references, path: '../secret' } }).references).toBeUndefined();
  expect(normalizeReviewState({ references: { ...references, line: -1 } }).references).toBeUndefined();
});

test('reference anchors and ordinary clicks produce the same pinned destination in one code pane', () => {
  const references = { symbol: 'paint', path: 'src/caller.ts', line: 7, character: 3, rev: 'a'.repeat(40), base: 'b'.repeat(40) };
  const state = { references, panes: [{ id: 'p1', file: 'src/caller.ts', view: 'diff' }, { id: 'p2', file: 'src/kept.ts', view: 'diff' }, { id: 'p3', view: 'related' }], active: 'p1' };
  const comparison={head:'a'.repeat(40),base:'b'.repeat(40),files:[{path:'src/usage.ts'}]};
  const result = reviewReferenceDestination(state, { path: 'src/usage.ts', line: 42 },comparison);
  expect(result.panes[0]).toMatchObject({ id: 'p1', file: 'src/usage.ts', line: 42, rev: 'a'.repeat(40), view: 'diff' });
  expect(result.panes[1].file).toBe('src/kept.ts');
  expect(result.panes[2].view).toBe('related');
  expect(parseReviewRoute(buildReviewHash('owner/repo', 42, result)).review).toEqual(result);
  expect(reviewReferenceDestination({ ...state, active: 'p3' }, { path: 'src/usage.ts', line: 42 },comparison).active).toBe('p1');
});


test('investigation URLs preserve the review anchor and the independent preview at an exact revision', () => {
  const review = { file:'caller.ts',line:13,rev:'a'.repeat(40), investigation:{id:'i1',title:'How are errors handled?', location:{file:'source.ts',line:42,rev:'b'.repeat(40)},preview:{location:{file:'helper.ts',line:9,rev:'b'.repeat(40)},trail:[],origin:{file:'source.ts',line:42,rev:'b'.repeat(40)}}} };
  const parsed = parseReviewRoute(buildReviewHash('owner/repo',1,review));
  expect(parsed?.review.file).toBe('caller.ts'); expect(parsed?.review.line).toBe(13);
  expect(parsed?.review.investigation?.location.file).toBe('source.ts');
  expect(parsed?.review.investigation?.preview?.location.rev).toBe('b'.repeat(40));
  expect(normalizeReviewState({...review,investigation:{...review.investigation,location:{file:'../bad',rev:'a'.repeat(40)}}}).investigation).toBeUndefined();
});

test('reference clicks keep unchanged source in rail context without moving the PR or its panes',()=>{
 const head='a'.repeat(40),base='b'.repeat(40),references={symbol:'paint',path:'src/change.ts',line:7,character:3,rev:head,base};
 const state=normalizeReviewState({file:'src/change.ts',line:7,rev:head,base,references,panes:[{id:'main',file:'src/change.ts',view:'diff',rev:head,base},{id:'kept',file:'src/test.ts',view:'diff',rev:head,base}],active:'main'});
 const result=reviewReferenceDestination(state,{path:'src/context.ts',line:19,character:4},{head,base,files:[{path:'src/change.ts'}]});
 expect(result.file).toBe(state.file);expect(result.line).toBe(7);expect(result.view).toBe('diff');expect(result.panes).toEqual(state.panes);expect(result.references.preview).toEqual({path:'src/context.ts',line:19,character:4});expect(result.references.rev).toBe(head);
 expect(parseReviewRoute(buildReviewHash('owner/repo',1,result)).review).toEqual(result);
});
test('original-side references open the renamed PR diff at original line numbers',()=>{
 const head='a'.repeat(40),base='b'.repeat(40),references={symbol:'paint',path:'src/change.ts',line:7,character:3,rev:base,base};
 const state=normalizeReviewState({file:'src/change.ts',view:'diff',rev:head,base,references,search:{mode:'files',query:'old'}});
 const result=reviewReferenceDestination(state,{path:'src/old.ts',line:11},{head,base,files:[{path:'src/new.ts',previousPath:'src/old.ts'}]});
 expect(result).toMatchObject({file:'src/new.ts',line:11,side:'left',view:'diff',rev:head,base});expect(result.search).toBeUndefined();expect(result.references.preview).toBeUndefined();expect(result.references.rev).toBe(base);
});
test('a reference from a different revision stays context even when its path changed in the displayed PR',()=>{
 const head='a'.repeat(40),base='b'.repeat(40),old='c'.repeat(40),references={symbol:'paint',path:'src/change.ts',line:7,character:3,rev:old,base};
 const state=normalizeReviewState({file:'src/change.ts',line:7,rev:head,base,references});const result=reviewReferenceDestination(state,{path:'src/change.ts',line:99},{head,base,files:[{path:'src/change.ts'}]});
 expect(result.line).toBe(7);expect(result.references.preview.line).toBe(99);expect(result.references.rev).toBe(old);
});
test('unsafe preview locations cannot acquire authority through a restored references URL',()=>{
 const references={symbol:'paint',path:'src/change.ts',line:7,character:3,rev:'a'.repeat(40),base:'b'.repeat(40)};
 for(const preview of [{path:'../secret',line:2,character:0},{path:'src/good.ts',line:0,character:0},{path:'src/good.ts',line:2,character:-1}])expect(normalizeReviewState({references:{...references,preview}}).references.preview).toBeUndefined();
});


test('legacy source destinations return to the PR diff before showing external rail context', () => {
  const head = 'a'.repeat(40), base = 'b'.repeat(40);
  const references = { symbol: 'paint', path: 'src/change.ts', line: 7, character: 3, rev: head, base };
  const result = reviewReferenceDestination({ file: 'src/change.ts', line: 7, view: 'source', rev: head, base, references }, { path: 'src/context.ts', line: 11 }, { head, base, files: [{ path: 'src/change.ts' }] });
  expect(result).toMatchObject({ file: 'src/change.ts', line: 7, view: 'diff', rev: head, base });
  expect(result.references.preview).toEqual({ path: 'src/context.ts', line: 11, character: 0 });
  const changed = reviewReferenceDestination(result, { path: 'src/change.ts', line: 21 }, { head, base, files: [{ path: 'src/change.ts' }] });
  expect(changed).toMatchObject({ file: 'src/change.ts', line: 21, view: 'diff' });
  expect(changed.references.preview).toBeUndefined();
});

test('definition actions use PR diffs for changed paths and code context for other files and imports',async()=>{
 const {reviewDefinitionDestination}=await import('./reviewRoute.js');
 const head='a'.repeat(40),base='b'.repeat(40),state=normalizeReviewState({file:'src/caller.ts',line:5,rev:head,base});
 const request={symbol:'../helpers.ts',path:'src/caller.ts',sha:head,position:{line:5,character:10}};
 const comparison={head,base,files:[{path:'src/change.ts'}]};
 const changed=reviewDefinitionDestination(state,{path:'src/change.ts',line:8},request,comparison);
 expect(changed).toMatchObject({file:'src/change.ts',line:8,view:'diff',rev:head,base});expect(changed.references).toBeUndefined();
 const context=reviewDefinitionDestination(state,{path:'helpers.ts',line:10},request,comparison);
 expect(context.file).toBe('src/caller.ts');expect(context.references).toMatchObject({kind:'context',symbol:'../helpers.ts',rev:head,preview:{path:'helpers.ts',line:10}});
 expect(parseReviewRoute(buildReviewHash('owner/repo',1,context)).review).toEqual(context);
 expect(reviewDefinitionDestination(state,{path:'../outside',line:8},request,comparison)).toEqual(state);
 const original=reviewDefinitionDestination(state,{path:'src/old.ts',line:4},{...request,sha:base},{head,base,files:[{path:'src/new.ts',previousPath:'src/old.ts'}]});
 expect(original).toMatchObject({file:'src/new.ts',side:'left',line:4,view:'diff',rev:head,base});
});
test('beside actions preserve existing panes and global comparison while pinning original source',async()=>{
 const {reviewBesideDestination}=await import('./reviewRoute.js');
 const head='a'.repeat(40),base='b'.repeat(40),state=normalizeReviewState({file:'src/caller.ts',line:5,rev:head,base});
 const target={file:'src/context.ts',line:23,rev:base,base,view:'source'};
 const next=reviewBesideDestination(state,target);
 expect(next.rev).toBe(head);expect(next.base).toBe(base);expect(next.panes[0]).toMatchObject({file:state.file,line:5,rev:head,view:'diff'});expect(next.panes[1]).toMatchObject(target);
 const third=reviewBesideDestination(next,{...target,file:'other.ts'});expect(third.panes.slice(0,2)).toEqual(next.panes);expect(new Set(third.panes.map(p=>p.id)).size).toBe(3);
 expect(reviewBesideDestination(state,{...target,file:'../bad'})).toEqual(state);
});

test('jump markers follow the exact file, comparison and original/head side without marking a neighboring row',async()=>{
 const {isReviewLineTarget}=await import('./reviewRoute.js');
 const head='a'.repeat(40),base='b'.repeat(40),location=normalizeReviewState({file:'src/change.ts',line:37,rev:head,base});
 const comparison={head,base};
 expect(isReviewLineTarget(location,'src/change.ts',35,37,null,comparison)).toBe(true);
 expect(isReviewLineTarget(location,'src/change.ts',35,37,'right',comparison)).toBe(true);
 expect(isReviewLineTarget(location,'src/change.ts',37,39,'left',comparison)).toBe(false);
 expect(isReviewLineTarget(location,'src/change.ts',36,38,null,comparison)).toBe(false);
 expect(isReviewLineTarget(location,'other.ts',35,37,null,comparison)).toBe(false);
 const original={...location,side:'left'};
 expect(isReviewLineTarget(original,'src/change.ts',37,39,'left',comparison)).toBe(true);
 expect(isReviewLineTarget(original,'src/change.ts',37,39,'right',comparison)).toBe(false);
 expect(isReviewLineTarget(location,'src/change.ts',35,37,null,{head:'c'.repeat(40),base})).toBe(false);
 expect(isReviewLineTarget({...location,view:'source'},'src/change.ts',35,37,null,comparison)).toBe(false);
 expect(isReviewLineTarget({...location,line:null},'src/change.ts',null,null,null,comparison)).toBe(false);
});
