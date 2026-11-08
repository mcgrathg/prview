# Cold definition lookup — 2026-11-07

The package-type benchmark dropped from a 14.50-second median to 0.715 seconds across three fresh production AST workers per version, about 20.3× in this sample. Every lookup resolved the imported `Node` to `code/core/src/csf-tools/estree/ast.ts:6` at pinned head `59c927082239afee5a702036c62c8b61c192c865`. Raw measurements are in `definition-lookup-benchmark.json`.

## Measurement and cause

Before: cold 14.500/14.100/15.630 seconds; warm 10.6–12.2ms. After: cold 1.150/0.715/0.709 seconds; warm 15.9–17.2ms. Each cold sample creates and terminates a new production worker; the warm sample repeats the same lookup in that worker. Worker import/startup is included. Both runs use the same existing local full mirror, Git 2.50.1 and Bun 1.4.3 on this Mac. OS/disk caches are warm, runs are ordered before then after, and three samples do not establish a general latency distribution. These are not first-clone, network or browser-render measurements.

The baseline profile made 911 individual Git reads, taking 12.652 seconds of 13.343 total. Of those, 784 read source, 109 read package manifests and 18 read tsconfigs. The optimized profile made 8 content batches plus 2 tree reads, taking 0.792 seconds total. Batch output was 16.11MB, including speculative nearby files; actual requested source/config content was 3.69MB. The read-ahead costs memory and extra local bytes to avoid process startup per file.

## Reader boundary

Only the AST worker uses the new reader. It builds an immutable-SHA blob catalog with `ls-tree -r -l -z`, then reads requested and nearby objects with `cat-file --batch -Z`. Reads use blob IDs from that catalog, not repository-generated command text. Both commands disable lazy fetch; optional read-ahead never fetches missing objects from a promisor remote. No repository scripts, filters or worktree code run. Git documents the NUL-framed batch protocol and the no-lazy-fetch option. [Git 2.50 cat-file](https://git-scm.com/docs/git-cat-file/2.50.0), [Git 2.50 options](https://git-scm.com/docs/git/2.50.0)

Each batch allows at most 512 files, 4MiB of content and 512KiB per speculative file, with bounded stdout and a 2-second subprocess timeout. Cached text is capped at 64MiB using conservative UTF-16 character accounting, plus 8192 entries; the bounded 16MiB tree response also creates catalog metadata. The existing two-service LRU owns these closures, so up to two retained source windows can exist. Language-service memory is additional. No persistent Git subprocess is introduced.

The parser checks every expected object ID, type, exact byte length, NUL boundary and final output length before caching any batch content. Failed, unsupported, oversized or malformed batches fall back to the original required-file `git show`. Large required files keep that original behavior. The language-service resolver, current dispatch timeout and queued cancellation policy are unchanged. A prefetched file is not speculatively read again after eviction; a later required read can still load it.

The first 512-entry experiment reduced latency but reread 68MB due to eviction. Preventing rereads without retaining enough source regressed. The final retained window fits this benchmark's working set while remaining bounded; other repository shapes may have different results.

## Verification

34 focused tests passed with 66 assertions, covering batch amortization, NUL/Unicode paths and content, immutable revisions, malformed and failed batch fallback, oversized files and the existing definition/search contracts. Transport-injection tests run in fresh Bun processes with a wrapper-first PATH, preventing Bun's executable cache from bypassing the fake Git. The test verifies actual fallback `show` calls. Strict TypeScript passed for the reader, its tests, the worker and the benchmark. The production worker also passed from an archive containing only its committed source dependencies (cold 1.792/0.717/0.634 seconds).

Independent review found no actionable correctness defects. Comment review confirmed the synchronous-worker documentation; comment-lint's only advisory was an existing protocol-version comment. The real foreground-only server was restarted and returned the expected target in 1.119 seconds on its first worker lookup, then 29/55ms. A browser modifier-click reached the declaration and Back restored the caller. No GitHub mutation was involved.

## Reproduce

From the Cockpit root, with the workspace Bun runtime:

```sh
../.working/runtime/bun scripts/benchmark-definition-cold.ts ../.working/cockpit-live-data/mirrors/storybookjs__storybook /tmp/definition-results.json 2000
../.working/runtime/bun test server/astGitSource.test.ts server/tsService.test.ts server/repoSearch.test.ts
```

The optional final argument is an elapsed-time assertion for this benchmark, not a production SLA. The mirror must already contain the pinned commit and blobs.
