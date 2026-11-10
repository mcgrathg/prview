import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reviewOrganization, type OrganizationResult } from './reviewOrganization.ts';
import { buildFetchHandler } from './http.ts';
import { upsertCachedPrDetail } from './db.ts';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function git(root: string, ...args: string[]) {
  const result = Bun.spawnSync(['git', '-C', root, ...args], { stdout: 'pipe', stderr: 'pipe' });
  if (!result.success) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

test('worker derives real pinned imports and call evidence without running repository code', async () => {
  const root = mkdtempSync(join(tmpdir(), 'review-organization-')); roots.push(root);
  git(root, 'init', '-q'); git(root, 'config', 'user.name', 'Test'); git(root, 'config', 'user.email', 'test@example.com');
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src/main.ts'), 'import { helper } from "./helper.js";\nhelper();\n');
  writeFileSync(join(root, 'src/too-large.ts'), '// oversized\n' + 'x'.repeat(2_000_001));
  writeFileSync(join(root, 'src/helper.ts'), 'export function helper() {}\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'source');
  const head = git(root, 'rev-parse', 'HEAD');
  const patch = git(root, 'show', '--format=', head);
  const realGit = Bun.which('git');
  expect(realGit).not.toBeNull();
  const wrapper = join(root, 'bin'); mkdirSync(wrapper);
  const readLog = join(root, 'source-read.log');
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  writeFileSync(join(wrapper, 'git'), `#!/bin/sh
oversized=0
for argument in "$@"; do case "$argument" in *:src/too-large.ts) oversized=1;; esac; done
if [ "$oversized" = 1 ]; then printf '%s\\n' "$3" >> ${quote(readLog)}; fi
exec ${quote(realGit!)} "$@"
`, { mode: 0o755 });
  const requestPath = join(root, 'request.json');
  writeFileSync(requestPath, JSON.stringify(['sample/pinned', 1, 'a'.repeat(40), head, patch, root]));
  const child = Bun.spawn([process.execPath, '--eval', `
    import { reviewOrganization } from ${JSON.stringify(new URL('./reviewOrganization.ts', import.meta.url).href)};
    const args = await Bun.file(Bun.env.REVIEW_ORGANIZATION_TEST_REQUEST).json();
    console.log(JSON.stringify(await reviewOrganization(...args)));
  `], {
    env: { ...process.env, PATH: `${wrapper}:${process.env.PATH}`, REVIEW_ORGANIZATION_TEST_REQUEST: requestPath },
    stdout: 'pipe', stderr: 'pipe',
  });
  const [output, error] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  if (await child.exited) throw new Error(error);
  const result: OrganizationResult = JSON.parse(output);
  const operations = readFileSync(readLog, 'utf8').split('\n');
  expect(operations).toContain('cat-file');
  expect(operations).not.toContain('show');
  expect(result.capture.files).toHaveLength(3);
  expect(result.graph.coverage.parsedHeadFiles).toBe(2);
  expect(result.graph.diagnostics.some(message => message.includes('bounded analysis size'))).toBe(true);
  expect(result.graph.edges.map(edge => [edge.from, edge.to, edge.kind])).toEqual([
    ['src/main.ts', 'src/helper.ts', 'import'], ['src/main.ts', 'src/helper.ts', 'imported_function_call'],
  ]);
  expect(result.graph.edges[0]!.evidence[0]!.url).toContain(`/blob/${head}/src/main.ts#L1`);
});

for (const endpoint of ['review-organization','review-insights']) test(`${endpoint} refuses invalid, uncached and superseded comparisons before source work`, async () => {
  const handle = buildFetchHandler(4900);
  const request = (query: string) => handle(new Request(`http://127.0.0.1:4900/api/${endpoint}?${query}`));
  expect((await request('repo=../escape&number=1&head=bad&base=bad')).status).toBe(400);
  const base = 'd'.repeat(40), head = 'e'.repeat(40);
  const params = new URLSearchParams({ repo: 'sample/validation', number: '42', base, head });
  expect((await request(params.toString())).status).toBe(409);
  upsertCachedPrDetail({ repo: 'sample/validation', number: 42, head_sha: head, fetched_at: new Date().toISOString(), detail_json: JSON.stringify({ headRefOid: head, baseRefOid: base, headRefName: 'feature', baseRefName: 'main' }) });
  params.set('head', 'f'.repeat(40));
  expect((await request(params.toString())).status).toBe(409);
  params.set('head', head);
  expect((await request(params.toString())).status).toBe(409);
});

test('worker construction and dispatch failures release capacity for the next request', async () => {
  const root = mkdtempSync(join(tmpdir(), 'review-worker-recovery-')); roots.push(root);
  git(root, 'init', '-q'); git(root, 'config', 'user.name', 'Test'); git(root, 'config', 'user.email', 'test@example.com');
  writeFileSync(join(root, 'file.ts'), 'export const value = 1;\n');
  git(root, 'add', '.'); git(root, 'commit', '-qm', 'source');
  const head = git(root, 'rev-parse', 'HEAD'), patch = git(root, 'show', '--format=', head);
  const OriginalWorker = globalThis.Worker;
  let number = 100;
  const failureModes = [
    class { constructor() { throw new Error('worker allocation failed'); } },
    class extends OriginalWorker { postMessage() { throw new Error('worker dispatch failed'); } },
  ];
  for (const FailureWorker of failureModes) {
    try {
      Object.defineProperty(globalThis, 'Worker', { value: FailureWorker, configurable: true, writable: true });
      for (let attempt = 0; attempt < 4; attempt++) {
        await expect(reviewOrganization('sample/recovery', ++number, 'a'.repeat(40), head, patch, root)).rejects.toThrow(/worker (allocation|dispatch) failed/);
      }
    } finally {
      Object.defineProperty(globalThis, 'Worker', { value: OriginalWorker, configurable: true, writable: true });
    }
    const result = await reviewOrganization('sample/recovery', ++number, 'a'.repeat(40), head, patch, root);
    expect(result.graph.coverage.parsedHeadFiles).toBe(1);
  }
});
