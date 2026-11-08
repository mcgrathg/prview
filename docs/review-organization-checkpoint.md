# Live review organization checkpoint — 2026-11-07

The original classification, sorting and relationship engine now runs inside Cockpit's native review interface. The source POC remains a frozen comparison, not a second active UI implementation.

Start from the outer repository with `pnpm cockpit:build` and `pnpm cockpit:live`. Open:

- Main live review: http://127.0.0.1:4900/?organize=1#/pr/storybookjs/storybook/36948/files
- Heavy live review: http://127.0.0.1:4900/?organize=1#/pr/storybookjs/storybook/36212/files

The separate cache and foreground-only launcher use the existing GitHub CLI login. Background polling, relay, forwarders, agents, background tool installation, telemetry and update checks are disabled in this launcher. Interactive GitHub reads and mirror fetches remain active. The recorded benchmark PRs are merged, so live review mutations were not exercised.

## Available behavior

- Attention, original and changed-line sorting; optional folder grouping.
- Overlapping categories, Show/Fold/Hide, category-default reset and explicit per-file overrides.
- Folded groups kept out of the main queue, still searchable and recoverable; hidden files have explicit Show actions.
- Source-backed related changed files, with path heuristics identified separately.
- Importer-first reading paths, a chosen root and contiguous cycle groups. Folder grouping is disabled in Flow.
- Explicit XState loading/ready/error and control transitions, with cancelled stale requests on comparison changes.
- Native diffs, Unified/Split layout, source search, file history, copy-path and file review controls retained.

Folding or expanding through organization mode changes visibility without marking Viewed. The default upstream mode still has its original collapse/Viewed coupling, tracked separately.

The live heavy comparison retains all 113 changed paths: 18 files in the main queue and 95 in the collapsed folded group. Search for `lit-property-only/description.snapshot` to inspect the empty added file. A viewer index-reconciliation fix keeps its header visible after filtering or reordering.

## Verification

- Production UI build passed; existing upstream Svelte/bundle warnings remain.
- 49 focused tests passed: carried-over engine behavior, native-diff adaptation, state-machine cancellation/retry, source worker size limits and failure recovery, endpoint validation, and native repository search.
- Direct parity with the original engine passed for all 162 benchmark files: classification, three sort orders, related candidates and every rooted import path.
- Live pinned-Git evidence matched every original edge and changed path on Storybook 36948 (38 paths, 69 edges) and 36212 (113 paths, 40 edges).
- Browser checks exercised category hiding, per-file override/restoration, related-file jumps, Flow, changed-line sorting, folder grouping, native file/code search, independent fold/Viewed state, and the empty-file filtering regression.
- The complete shared engine passes strict TypeScript checks, including unchecked indexed access.
- Full server typechecking still reports 55 diagnostics, exactly matching an untouched tracked upstream snapshot. No integration diagnostics remain; this is not a clean upstream typecheck.
- Independent source-boundary review passed after fixing pre-read blob bounds, repeated source scans and worker allocation/dispatch cleanup. Bun regression tests verify failure recovery and instrument Git to prove oversized source contents are not read.

## Search baseline

Local mirror: 8,902 tracked files at Storybook head `59c927082239afee5a702036c62c8b61c192c865`. One initial request and five repeated warm samples per operation:

| Operation | First request | Warm median | Warm range |
| --- | --- | --- | --- |
| Native repository file listing | 461.1 ms | 21.6 ms | 19.4–29.9 ms |
| Native fuzzy file ranking | 3.8 ms | 2.2 ms | 2.0–2.3 ms |
| Native literal code search | 327.0 ms | 149.7 ms | 148.2–199.5 ms |
| Native relative-import definition | 295.6 ms | 16.3 ms | 14.5–17.2 ms |

These are local API/function timings. They exclude initial repository download and browser rendering; fuzzy ranking measures the native ranking function. This establishes a baseline, not a claim that the integration accelerated native search. Raw results and reproduction inputs are in `docs/review-search-benchmark.json`; rerun with `node scripts/benchmark-review-search.mjs http://127.0.0.1:4900`.

## Remaining work

- `prv-qop.2`: full file/line/control URL history and browser Back/Forward parity. Organization controls currently reset on comparison navigation/reload.
- `prv-qop.3` and `prv-qop.4`: separate collapse/Viewed in the default upstream mode and add native GitHub Viewed synchronization.
- `prv-vi2`: imported type-alias navigation can incorrectly return the import binding as its definition.
- `prv-e09`: improve first-sync readiness and mirror cost; initial Storybook ingestion required roughly 1.7 GiB and initially returned 503 while the mirror was being built.
- `prv-459.1`: Open beside remains the next two-file comparison deliverable. Drag-and-drop docking is still roadmap work.

Source targets are candidates among changed files, not full module resolution or a complete call graph. Source work is bounded to 128 JS/TS files, 2 million bytes per source file and 16 million total bytes, with worker time and concurrency limits. Missing or unsupported source is reported rather than guessed.
