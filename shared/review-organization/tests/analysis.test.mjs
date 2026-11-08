import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { analyze, defaultRules, orderFiles, visibilityFor } from '../analysis.ts';

const capture = paths => ({ files: paths.map((filename, index) => ({
  filename, status: 'modified', additions: index + 1, deletions: 0,
  changes: index + 1, patch: '@@ -1 +1 @@\n-old\n+new',
})) });

test('the three public PRs retain every unique changed path and GitHub order', () => {
  for (const [id, count] of [['vscode-346423', 11], ['storybook-36948', 38], ['storybook-36212', 113]]) {
    const source = JSON.parse(readFileSync(new URL(`../fixtures/${id}.json`, import.meta.url), 'utf8'));
    const before = JSON.stringify(source);
    const files = analyze(source);
    assert.equal(files.length, count, `${id}: complete inventory`);
    assert.equal(new Set(files.map(file => file.filename)).size, count, `${id}: unique paths`);
    assert.deepEqual(orderFiles(files, 'original').map(file => file.filename), source.files.map(file => file.filename), `${id}: original order`);
    assert.equal(JSON.stringify(source), before, `${id}: analysis does not mutate captured facts`);
    for (const strategy of ['attention', 'volume']) {
      assert.deepEqual(orderFiles(files, strategy).map(file => file.filename).sort(), source.files.map(file => file.filename).sort(), `${id}: ${strategy} preserves all paths`);
      assert.deepEqual(orderFiles(files, strategy), orderFiles(analyze(source), strategy), `${id}: deterministic ${strategy}`);
    }
  }
});

test('file roles overlap without mistaking fixture inputs and type tests for production source', () => {
  const files = analyze(capture([
    'fixtures/card/input.stories.ts',
    'lib/__testfixtures__/card/argtypes.snapshot',
    'lib/__testfixtures__/card/tsconfig.json',
    'lib/__testfixtures__/card/custom-elements.json',
    'lib/package.json',
    'lib/formatCsf.test-d.ts',
    'src/runtime.ts',
    'test/runtime.ts',
  ]));
  assert(files[0].roles.includes('fixture'), 'root fixture directory is recognized');
  assert(!files[0].roles.includes('source'), 'fixture TypeScript is not production source');
  assert.deepEqual(new Set(files[1].roles), new Set(['fixture', 'snapshot']));
  assert.deepEqual(new Set(files[2].roles), new Set(['fixture', 'configuration']));
  assert(!files[3].roles.includes('manifest'), 'component metadata is not a package manifest');
  assert(files[4].roles.includes('manifest'));
  assert(files[5].roles.includes('test'), 'compile-time API test is a test');
  assert(!files[5].roles.includes('source'));
  assert(files[6].roles.includes('source'));
  assert(files[7].roles.includes('test'), 'root test directory is recognized');
});

test('configuration and schema properties do not demote executable source into inert config', () => {
  const files = analyze(capture(['src/sandboxConfigSchema.ts', 'src/terminalConfiguration.ts', 'src/runtime.ts']));
  assert(files[0].roles.includes('source'));
  assert(files[0].properties.includes('schema'));
  assert(files[1].roles.includes('source'));
  assert(files[1].properties.includes('configuration'));
  assert.deepEqual(files[2].properties, []);
});

test('visibility resolves overlap and file overrides without changing the underlying rank', () => {
  const files = analyze(capture(['src/main.ts', 'fixtures/card/tsconfig.json']));
  const target = files[1];
  const rankBefore = orderFiles(files, 'attention').findIndex(file => file.filename === target.filename);
  assert.equal(visibilityFor(target, { fixture: 'fold' }).state, 'fold');
  assert.equal(visibilityFor(target, { fixture: 'hide', configuration: 'fold' }).state, 'fold');
  assert.equal(visibilityFor(target, { fixture: 'fold', configuration: 'show' }).state, 'show');
  assert.equal(visibilityFor(target, { fixture: 'fold', configuration: 'show' }, 'hide').state, 'hide');
  assert.equal(visibilityFor(target, {}).state, 'show', 'Show all restores a folded file');
  assert.equal(orderFiles(files, 'attention').findIndex(file => file.filename === target.filename), rankBefore);
});

test('snapshot-heavy defaults count the union once and explicit config visibility reveals six files', () => {
  const source = JSON.parse(readFileSync(new URL('../fixtures/storybook-36212.json', import.meta.url), 'utf8'));
  const files = analyze(source);
  assert.equal(files.filter(file => file.roles.includes('snapshot')).length, 55);
  assert.equal(files.filter(file => file.roles.includes('fixture')).length, 95);
  assert.equal(files.filter(file => visibilityFor(file, defaultRules).state === 'fold').length, 95);
  assert.equal(files.filter(file => visibilityFor(file, defaultRules).state === 'show').length, 18);
  assert.equal(files.filter(file => visibilityFor(file, { ...defaultRules, configuration: 'show' }).state === 'show').length, 24);
  const empty = files.find(file => file.filename.endsWith('lit-property-only/description.snapshot'));
  assert.equal(empty.status, 'added');
  assert.equal(empty.head_content, '');
  assert.equal(empty.patch, null);
});

test('pure renames retain the old path and deleted files remain analyzable', () => {
  const source = JSON.parse(readFileSync(new URL('../fixtures/storybook-36948.json', import.meta.url), 'utf8'));
  const files = analyze(source);
  const rename = files.find(file => file.filename.endsWith('/mocks/csf2-variances.stories.tsx'));
  assert.equal(rename.status, 'renamed');
  assert.equal(rename.changes, 0);
  assert.equal(rename.patch, null);
  assert(rename.previous_filename.endsWith('/unsupported-csf-variances.stories.tsx'));
  const deleted = files.find(file => file.filename.endsWith('/valueToSource.ts'));
  assert.equal(deleted.status, 'removed');
  assert(deleted.patch.includes('-export const valueToSource'));
});

test('volume sorting handles ties without mutating its inputs or allowing snapshot volume to control Attention', () => {
  const source = capture(['z.ts', 'a.ts', 'a.snapshot']);
  source.files[0].changes = 10;
  source.files[1].changes = 10;
  source.files[2].changes = 1000;
  const files = analyze(source);
  const before = files.map(file => file.filename);
  assert.deepEqual(orderFiles(files, 'volume').map(file => file.filename), ['a.snapshot', 'a.ts', 'z.ts']);
  const attention = orderFiles(files, 'attention');
  assert(attention.findIndex(file => file.filename === 'a.ts') < attention.findIndex(file => file.filename === 'a.snapshot'));
  assert.deepEqual(files.map(file => file.filename), before);
});
