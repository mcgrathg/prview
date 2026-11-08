import { test, expect } from 'bun:test';
import { createActor, fromPromise } from 'xstate';
import { captureFromDiff } from '../capture.ts';
import { organizationModel, emptyGraph } from '../model.ts';
import { defaultControls, organizationMachine } from '../machine.ts';
import capture from '../fixtures/storybook-36212.json';

const comparison = { repo: 'sample/project', number: 1, head: 'a'.repeat(40), base: 'b'.repeat(40) };

test('organization keeps pure renames, empty additions and deletions in the native diff inventory', () => {
  const input = [
    { path: 'renamed.ts', previousPath: 'old.ts', additions: 0, deletions: 0, hunks: [] },
    { path: 'empty.snapshot', isNew: true, additions: 0, deletions: 0, hunks: [] },
    { path: 'deleted.ts', isDeleted: true, additions: 0, deletions: 1, hunks: [{ range: '@@ -1 +0,0 @@', rows: [{ type: 'del', text: 'gone' }] }] },
  ];
  const adapted = captureFromDiff('sample/project', 1, comparison.base, comparison.head, input);
  expect(adapted.files.map(file => [file.filename, file.status, file.previous_filename])).toEqual([
    ['renamed.ts', 'renamed', 'old.ts'], ['empty.snapshot', 'added', undefined], ['deleted.ts', 'removed', undefined],
  ]);
  const model = organizationModel(adapted, emptyGraph(), defaultControls());
  expect(model.paths).toHaveLength(3);
  expect(model.folded).toEqual(['empty.snapshot']);
});

test('heavy comparison keeps every file accounted for across query, visibility precedence and overrides', () => {
  const controls = defaultControls();
  const baseline = organizationModel(capture, emptyGraph(), controls);
  expect(baseline.counts).toEqual({ show: 18, fold: 95, hide: 0 });
  controls.query = 'tsconfig';
  controls.rules.configuration = 'show';
  const filtered = organizationModel(capture, emptyGraph(), controls);
  expect(filtered.visible.length).toBeGreaterThan(0);
  expect(filtered.visible.every(entry => entry.state === 'show')).toBe(true);
  expect(filtered.entries).toHaveLength(113);
  expect(filtered.visible.map(entry => entry.rank)).toEqual(filtered.visible.map(entry => baseline.entries.find(before => before.file.filename === entry.file.filename)!.rank));
  const path = filtered.paths[0]!;
  controls.overrides[path] = 'hide';
  expect(organizationModel(capture, emptyGraph(), controls).paths).not.toContain(path);
  controls.overrides[path] = 'show';
  expect(organizationModel(capture, emptyGraph(), controls).paths).toContain(path);
});

test('a changed comparison aborts old analysis and rejects its late result while controls remain deterministic', async () => {
  const jobs = new Map<string, { resolve: (result: any) => void; signal: AbortSignal }>();
  const machine = organizationMachine.provide({ actors: {
    load: fromPromise(({ input, signal }) => new Promise(resolve => jobs.set(input.head, { resolve, signal }))),
  } });
  const actor = createActor(machine, { input: { comparison } });
  actor.start();
  actor.send({ type: 'QUERY.SET', query: 'test' });
  actor.send({ type: 'COMPARISON.SET', comparison });
  expect(actor.getSnapshot().context.query).toBe('test');
  const second = { ...comparison, head: 'c'.repeat(40) };
  actor.send({ type: 'COMPARISON.SET', comparison: second });
  expect(jobs.get(comparison.head)!.signal.aborted).toBe(true);
  expect(actor.getSnapshot().context.query).toBe('');
  const current = { capture: { ...capture, head_sha: second.head }, graph: emptyGraph() };
  jobs.get(second.head)!.resolve(current);
  await new Promise(resolve => setTimeout(resolve, 0));
  jobs.get(comparison.head)!.resolve({ capture, graph: emptyGraph() });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(actor.getSnapshot().context.result?.capture.head_sha).toBe(second.head);
  actor.send({ type: 'GROUP.TOGGLE' });
  actor.send({ type: 'FLOW.FOLLOW', path: 'one.ts' });
  expect(actor.getSnapshot().context.folders).toBe(false);
  actor.send({ type: 'ROLE.SET', role: 'source', visibility: 'hide' });
  actor.send({ type: 'SHOW_ALL' });
  expect(actor.getSnapshot().context.rules).toEqual({});
  expect(actor.getSnapshot().context.overrides).toEqual({});
  actor.stop();
});

test('failed source load can retry without discarding the chosen category rule', async () => {
  let attempts = 0;
  const actor = createActor(organizationMachine.provide({ actors: {
    load: fromPromise(async () => { if (!attempts++) throw new Error('mirror unavailable'); return { capture, graph: emptyGraph() }; }),
  } }), { input: { comparison } });
  actor.start();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(actor.getSnapshot().matches('error')).toBe(true);
  actor.send({ type: 'ROLE.SET', role: 'test', visibility: 'hide' });
  actor.send({ type: 'RETRY' });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(actor.getSnapshot().matches('ready')).toBe(true);
  expect(actor.getSnapshot().context.rules.test).toBe('hide');
  actor.stop();
});


test('folder disclosure stays independent of visibility and survives grouping, URL restore and comparison transitions', () => {
  const actor = createActor(organizationMachine.provide({ actors: { load: fromPromise(() => new Promise(() => {})) } }), { input: { comparison } });
  actor.start();
  actor.send({ type: 'FOLDER.TOGGLE', directory: 'src/a' });
  expect(actor.getSnapshot().context.collapsedFolders).toEqual([]);
  actor.send({ type: 'GROUP.TOGGLE' });
  actor.send({ type: 'FOLDER.TOGGLE', directory: 'src/a' });
  actor.send({ type: 'FOLDER.TOGGLE', directory: 'src/b' });
  actor.send({ type: 'FOLDER.TOGGLE', directory: 'src/a' });
  expect(actor.getSnapshot().context.collapsedFolders).toEqual(['src/b']);
  const before = organizationModel(capture, emptyGraph(), defaultControls());
  expect(organizationModel(capture, emptyGraph(), actor.getSnapshot().context).paths).toEqual(before.paths);
  expect(organizationModel(capture, emptyGraph(), actor.getSnapshot().context).folded).toEqual(before.folded);
  actor.send({ type: 'GROUP.TOGGLE' });
  actor.send({ type: 'GROUP.TOGGLE' });
  actor.send({ type: 'QUERY.SET', query: 'src/b' });
  actor.send({ type: 'ORDER.SET', order: 'volume' });
  actor.send({ type: 'COMPARISON.SET', comparison });
  expect(actor.getSnapshot().context.collapsedFolders).toEqual(['src/b']);
  actor.send({ type: 'SHOW_ALL' });
  expect(actor.getSnapshot().context.collapsedFolders).toEqual([]);
  actor.send({ type: 'CONTROLS.RESTORE', controls: { ...defaultControls(), folders: true, collapsedFolders: ['src/b'] } });
  expect(actor.getSnapshot().context.collapsedFolders).toEqual(['src/b']);
  actor.send({ type: 'COMPARISON.SET', comparison: { ...comparison, head: 'c'.repeat(40) } });
  expect(actor.getSnapshot().context.collapsedFolders).toEqual([]);
  actor.stop();
});
