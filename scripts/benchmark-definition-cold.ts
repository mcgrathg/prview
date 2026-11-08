import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AstRequest } from "../server/tsWorker.ts";

const checkout = resolve(process.argv[2] ?? "../.working/cockpit-live-data/mirrors/storybookjs__storybook");
const output = process.argv[3];
const maximum = Number(process.argv[4] ?? Infinity);
const sha = "59c927082239afee5a702036c62c8b61c192c865";
const fromPath = "code/frameworks/angular-vite/src/docgen/story-docs-args.ts";
const expected = { path: "code/core/src/csf-tools/estree/ast.ts", line: 6, text: "export type Node = E.Node;", symbol: "Node" };
const source = Bun.spawnSync(["git", "-C", checkout, "show", `${sha}:${fromPath}`], { stdout: "pipe", stderr: "pipe" });
assert(source.success, source.stderr.toString());
const lines = source.stdout.toString().split("\n");
const row = lines.findIndex(line => line.includes("ESTreeNode as Node"));
assert(row >= 0);
const request: Omit<AstRequest, "id"> = { checkout, repo: "storybookjs/storybook", sha, fromPath, symbol: "Node", line: row + 1, character: lines[row]!.indexOf("as Node") + 3 };
const samples = [];
for (let i = 0; i < 3; i++) {
  const started = performance.now();
  const worker = new Worker(new URL("../server/tsWorker.ts", import.meta.url).href);
  const run = (id: number) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { worker.terminate(); reject(new Error("Definition exceeded 30 seconds")); }, 30_000);
    worker.onmessage = event => { clearTimeout(timer); assert.equal(event.data.id, id); resolve(event.data.defs); };
    worker.onerror = event => { clearTimeout(timer); worker.terminate(); reject(new Error(event.message)); };
    worker.postMessage({ id, ...request });
  });
  try {
    const cold = await run(1);
    const coldMs = performance.now() - started;
    assert.deepEqual(cold, [expected]);
    const warmStart = performance.now();
    assert.deepEqual(await run(2), [expected]);
    samples.push({ coldMs, warmMs: performance.now() - warmStart });
    console.error(JSON.stringify({ sample: i + 1, ...samples.at(-1) }));
  } finally { worker.terminate(); }
}
const result = { repo: request.repo, sha, fromPath, expected, conditions: "Three fresh production AST workers using an existing local full mirror; OS/disk Git caches are warm. Worker creation/import and synchronous reads are included. No repository code executed, no new clone.", samples };
if (output) await writeFile(output, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
assert(samples.every(sample => sample.coldMs <= maximum), `Cold definition must finish within ${maximum}ms`);
