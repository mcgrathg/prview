import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { astGitSource } from "./astGitSource.ts";

const roots: string[] = [];
const originalSpawn = Bun.spawnSync;
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function git(root: string, ...args: string[]) {
  const result = originalSpawn(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
  if (!result.success) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}
function repo(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "ast-git-source-")); roots.push(root);
  git(root, "init", "-q"); git(root, "config", "user.name", "Test"); git(root, "config", "user.email", "test@example.invalid");
  for (const [path, content] of Object.entries(files)) { const full = join(root, path); mkdirSync(join(full, ".."), { recursive: true }); writeFileSync(full, content); }
  git(root, "add", "-A"); git(root, "commit", "-qm", "fixture");
  return { root, sha: git(root, "rev-parse", "HEAD") };
}
function gitWrapper(root: string, body: string) {
  const dir = join(root, '.transport'); mkdirSync(dir);
  const real = Bun.which('git')!;
  const quote = (value: string) => "'" + value.replaceAll("'", "'\"'\"'") + "'";
  const script = `#!/bin/sh
command_log=${quote(join(dir, 'commands'))}
request_file=${quote(join(dir, 'request'))}
request_log=${quote(join(dir, 'requests'))}
real_git=${quote(real)}
printf '%s\\000' "$@" >> "$command_log"
printf '\\000' >> "$command_log"
case " $* " in
  *" --batch "*) ${body} ;;
esac
exec "$real_git" "$@"
`;
  writeFileSync(join(dir, 'git'), script, { mode: 0o755 });
  const commands = () => readFileSync(join(dir, 'commands'), 'utf8').split('\0\0').filter(Boolean).map(record => record.split('\0'));
  const read = (sha: string, paths: string[]) => {
    const sourceModule = new URL('./astGitSource.ts', import.meta.url).href;
    const code = `import { astGitSource } from ${JSON.stringify(sourceModule)}; const read = astGitSource(${JSON.stringify(root)}, ${JSON.stringify(sha)}); console.log(JSON.stringify(${JSON.stringify(paths)}.map(path => read(path))));`;
    const result = originalSpawn([process.execPath, '-e', code], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}` }, stdout: 'pipe', stderr: 'pipe' });
    if (!result.success) throw new Error(result.stderr.toString());
    return JSON.parse(result.stdout.toString());
  };
  return { dir, commands, read };
}
test("batch reads preserve bytes, unusual paths and immutable revision isolation without running repository code", () => {
  const { root, sha } = repo({ "src/a.ts": "export const x = 'é';\n", "src/with\nnewline.ts": "line one\0line two\n", "package.json": '{"scripts":{"postinstall":"exit 99"}}' });
  const old = astGitSource(root, sha);
  expect(old("src/a.ts")).toBe("export const x = 'é';\n");
  expect(old("src/with\nnewline.ts")).toBe("line one\0line two\n");
  writeFileSync(join(root, "src/a.ts"), "changed\n"); git(root, "add", "-A"); git(root, "commit", "-qm", "next");
  const next = astGitSource(root, git(root, "rev-parse", "HEAD"));
  expect(next("src/a.ts")).toBe("changed\n");
  expect(old("src/a.ts")).toBe("export const x = 'é';\n");
  expect(old("missing.ts")).toBeNull();
  expect(() => astGitSource(root, "HEAD")).toThrow("immutable");
});
test("nearby source requests share Git batches and speculative reads explicitly disable lazy fetch", () => {
  const { root, sha } = repo(Object.fromEntries(Array.from({ length: 520 }, (_, n) => [`src/${String(n).padStart(4, '0')}.ts`, `export const v${n} = ${n};\n`])));
  const transport = gitWrapper(root, String.raw`cat > "$request_file"; cat "$request_file" >> "$request_log"; printf '\000' >> "$request_log"; exec "$real_git" "$@" < "$request_file"`);
  const values = transport.read(sha, [0, 1, 20, 511, 519].map(n => `src/${String(n).padStart(4, '0')}.ts`));
  expect(values).toEqual([0, 1, 20, 511, 519].map(n => `export const v${n} = ${n};\n`));
  const calls = transport.commands();
  const batchSizes = readFileSync(join(transport.dir, 'requests'), 'utf8').split('\0\0').filter(Boolean).map(record => record.split('\0').filter(Boolean).length);
  expect(calls.filter(c => c.includes("show"))).toHaveLength(0);
  expect(batchSizes).toEqual([512, 8]);
  expect(calls.every(c => c.includes("--no-lazy-fetch"))).toBe(true);
  expect(calls.filter(c => c.includes("--batch")).every(c => c.includes("-Z"))).toBe(true);
});
test("malformed or failed batch data falls back to the original required-file read", () => {
  const { root, sha } = repo({ "src/a.ts": "correct\n", "src/b.ts": "other\n" });
  const transport = gitWrapper(root, String.raw`if [ -f "$request_file" ]; then exit 128; fi; printf 'truncated\000'; exit 0`);
  expect(transport.read(sha, ["src/a.ts"])).toEqual(["correct\n"]);
  writeFileSync(join(transport.dir, 'request'), 'fail');
  expect(transport.read(sha, ["src/b.ts"])).toEqual(["other\n"]);
  expect(transport.commands().filter(c => c.includes("show"))).toHaveLength(2);
});

test("oversized files bypass speculative batches and retain exact single-file semantics", () => {
  const large = "x".repeat(512 * 1024 + 1);
  const { root, sha } = repo({ "large.ts": large, "small.ts": "small\n" });
  const read = astGitSource(root, sha);
  expect(read("small.ts")).toBe("small\n");
  expect(read("large.ts")).toBe(large);
});
