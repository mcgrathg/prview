import assert from 'node:assert/strict';
import { fuzzyRankWithPriority } from '../ui/src/lib/fuzzy.js';

const origin = process.argv[2] ?? 'http://127.0.0.1:4900';
const repo = 'storybookjs/storybook', number = 36948;
const expected = 'code/core/src/core-server/utils/save-story/update-args-in-csf-file.ts';
const caller = 'code/core/src/core-server/utils/save-story/save-story.ts';
async function api(path, params = {}) {
  const response = await fetch(`${origin}${path}?${new URLSearchParams(params)}`, { signal: AbortSignal.timeout(40_000) });
  const result = await response.json();
  assert(response.ok, JSON.stringify(result));
  return result;
}
async function measure(name, operation, verify) {
  const samples = [];
  let result;
  for (let index = 0; index < 6; index++) {
    const start = performance.now(); result = await operation(); samples.push(performance.now() - start); verify(result);
  }
  const warm = samples.slice(1).sort((a,b) => a-b);
  return { name, firstMs: samples[0], warmMedianMs: warm[2], warmMinMs: warm[0], warmMaxMs: warm.at(-1), samplesMs: samples };
}
const detail = await api(`/api/pr/${repo}/${number}`, { view: '0' });
const sha = detail.headRefOid;
assert.equal(sha, '59c927082239afee5a702036c62c8b61c192c865');
const params = { repo, sha, headRef: sha };
let paths = [];
const measurements = [];
measurements.push(await measure('Native repository file listing', async () => {
  const result = await api('/api/repo-files', params); paths = result.paths; return result;
}, result => { assert.equal(result.status, 'ok'); assert(result.paths.includes(expected)); }));
const priority = detail.files.nodes.map(file => file.path);
measurements.push(await measure('Native fuzzy file ranking', async () => fuzzyRankWithPriority('update-args-in-csf-file', priority, paths), result => assert.equal(result[0].path, expected)));
measurements.push(await measure('Native literal code search', () => api('/api/repo-search', { ...params, q: 'updateArgsInCsfFile' }), result => {
  assert.equal(result.status, 'ok'); assert(result.matches.some(match => match.path === expected));
}));
const source = await api('/api/repo-file', { ...params, path: caller });
const lines = source.content.split('\n');
const row = lines.findIndex(line => line.includes('import { updateArgsInCsfFile }'));
assert(row >= 0);
measurements.push(await measure('Native relative-import definition', () => api('/api/repo-definition', {
  ...params, path: caller, symbol: 'updateArgsInCsfFile', line: String(row+1), col: String(lines[row].indexOf('updateArgsInCsfFile')+2),
}), result => { assert.equal(result.status, 'ok'); assert.equal(result.definition?.path, expected); }));
const aliasPath = 'code/frameworks/angular-vite/src/docgen/story-docs-args.ts';
const aliasSource = (await api('/api/repo-file', { ...params, path: aliasPath })).content.split('\n');
const aliasRow = aliasSource.findIndex(line => /ESTreeNode as Node/.test(line));
let aliasResult = null;
if (aliasRow >= 0) {
  aliasResult = await api('/api/repo-definition', { ...params, path: aliasPath, symbol: 'Node', line: String(aliasRow+1), col: String(aliasSource[aliasRow].indexOf('as Node')+4) });
}
const controller = new AbortController();
const superseded = fetch(`${origin}/api/repo-search?${new URLSearchParams({ ...params, q: 'export' })}`, { signal: controller.signal }).then(() => false, error => error.name === 'AbortError');
controller.abort(); assert(await superseded);
const latest = await api('/api/repo-search', { ...params, q: 'updateArgsInCsfFile' });
assert(latest.matches.some(match => match.path === expected));
process.stdout.write(JSON.stringify({
  measuredAt: new Date().toISOString(), repo, number, sha, fileCount: paths.length,
  setting: 'One running Cockpit HTTP server, cached local Git mirror; first request is not a cold disk or first-sync measurement. Five repeated warm samples follow each first request. Fuzzy ranking is the native function, not browser-render latency.',
  measurements, alias: { path: aliasPath, row: aliasRow+1, result: aliasResult },
  cancellation: 'Superseded fetch aborted; subsequent latest-query response verified.',
}, null, 2)+'\n');
