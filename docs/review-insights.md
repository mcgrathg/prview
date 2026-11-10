# Deterministic review insights

Enhanced Files offers a quiet **Insights · N** file-header button when a file has a measured complexity increase, a new resolved cycle, or at least five observed historical commits. N counts these categories, not individual functions or defects. File actions and Review tools always offer **Insights and coverage**, including for unsupported files. The rail is contextual and does not change the chosen reading order.

**Change** shows increases in cyclomatic complexity for touched functions and folds other changed declarations behind a disclosure. **History** shows commits, contributors and repeated co-change in a bounded base-anchored window. **Dependencies** shows resolved imports, dependents and cycle groups among supported changed JS/TS files. It is a partial graph, not repository-wide impact analysis. Type-only imports do not form cycle edges.

File and review options adds **Hotspots**, **Complexity increased** and **New cycle in changed-file graph**. Hotspots orders by summed head function complexity multiplied by observed file commits in the history sample. Its rank tooltip explains that formula. Unmeasured files follow measured files; missing data never becomes a zero score. Filters intersect, preserve global ranks and restore through the existing URL controls. The original five orders retain their algorithms and the same Insights entry points.

## Optional analyzer setup

Run from the app checkout:

```sh
bash scripts/setup-review-analysis
```

The setup creates `node_modules/.prview-analysis` with Python's venv, then installs the hash-pinned binary wheels in `scripts/review-analysis-requirements.txt`. Lizard 1.25.1 is the supported analyzer. Python 3 with venv and network access to the package index are setup prerequisites. Nothing installs automatically when a PR opens. An administrator can supply an absolute `PRVIEW_ANALYSIS_PYTHON` path instead; the returned Lizard version must match the pin.

Without the tool, the rail explains that complexity is unavailable and still supplies available Git/import evidence. Retry can load the analyzer after setup. Only trusted adapter code runs: it receives source strings via stdin under isolated Python, without repository configuration, plugins, scripts or imports. Comments in PR source cannot disable measurement through Lizard directives.

## Evidence contract and limits

`GET /api/review-insights?repo=owner/repository&number=1&base=<40-hex>&head=<40-hex>` accepts the same cached immutable comparison as review organization. Invalid comparisons return 400; missing or superseded cached comparisons return 409. Unavailable or busy evidence returns 503. It performs no GitHub writes.

The requested base identifies the target revision. `diffBase` is the actual merge base used by the three-dot PR diff, which can differ when the target branch has advanced. Complexity compares source objects at `diffBase` and head, using the captured patch to identify touched functions. Unique names pair only within complete before/after inventories. Added, removed and ambiguous functions keep separate measurements; additions are not fabricated increases from zero. The metric is structural context, not Big-O or a defect prediction.

History examines at most 500 non-merge commits reachable from the requested target base, within 90 days ending at that commit's timestamp. This excludes PR commits. Date filtering visits ancestors even across non-monotonic commit dates. Missing/shallow history and bounded samples are disclosed. Renames in this PR map to their original paths; earlier historical renames are not followed. Co-change requires at least two shared observed commits and does not establish a dependency.

Bounds:

- At most 500 changed files; the first 128 JS/TS source candidates are eligible for structural analysis.
- At most 512 KB per source and 12 MB combined source, with at most 500 measured functions per unit. Invalid or incomplete inventories disable comparisons and hotspot scores for that file.
- Analyzer output is bounded to 3 MB and 15 seconds; history to 5 MB and 8 seconds; each worker to 45 seconds and its response to 8 MB.
- At most two concurrent workers and twelve cached comparison promises. Failed/unavailable provider or history results are evicted so retry can recover. Large commit metadata is clipped and marks the sample limited.

The server reads immutable local Git objects with lazy fetch, external diff and textconv disabled. The UI cancels obsolete requests; an already-running shared bounded worker may finish for the cache. No persistent analysis database or additional service is required.

## State and navigation

| Event | Owner and result |
| --- | --- |
| Open enhanced Files / change comparison | Insights actor loads once for the captured repository/base/head; clears obsolete facts and rail context |
| New load / leave Files / unmount | Previous invocation is aborted; late results cannot publish |
| Load failure / Retry | Keep review usable; retain captured identity and retry explicitly |
| Open file / choose tab / Close | Change only transient rail context; Close and Escape restore trigger focus |
| Sort / filter | Organization actor derives against the same facts; URL stores controls, never analysis payloads |
| Jump to changed code | Existing navigation updates file/side/line URL, reveals the file and highlights its changed-line anchor; Back restores the previous review |
| Jump to unchanged co-change path | Existing read-only code context opens at the pinned diff base in the right rail; main PR remains in place |

The rail scrolls independently and reserves one column on desktop, or overlays at narrow widths. It leaves Viewed, comments, submission confirmations, symbol cards and the legacy workspace behavior intact. Historical docked panes expose Insights only when their comparison matches the loaded facts.

## Verification

The focused suite covers real Lizard/Git base/head measurements; PR renames; unavailable analyzers; ambiguous and truncated inventories; advanced target branches and graph identity; source-comment suppression attempts; old-dated ancestors; shrinking existing cycles; oversized metadata; special filenames; request validation and worker recovery. UI actor checks cover cancellation, retry, identity rejection and rail events. Organization/URL tests cover all orders, filters and global ranks; navigation and Viewed/confirmation regressions remain green.

Live Storybook #36948 at head `59c927082239afee5a702036c62c8b61c192c865` and target base `3df9f38353b4c6add739cdf7640abbaeca54c595` returned Lizard 1.25.1 measurements for 35 of 38 files. `duplicateStoryWithNewName` measured 12 → 14, with six observed historical commits in the bounded sample. Its exact changed-line jump highlighted right line 13. All six orders retained the same rail facts; the complexity filter showed three files and survived reload. Unchanged co-change context stayed in the rail, and Back restored Insights. A 520px viewport preserved readable tabs, close and Escape/focus behavior. No GitHub write or native editor launch was performed.

Independent backend trust-boundary review passed after regression fixes, including its own advanced-target graph fixture. This validates the scoped adapter/service contract; it does not claim complete semantic function matching, repository-wide dependencies or exhaustive historical analysis.

Final verification passed 70 tests / 494 assertions across 12 files, strict analysis/shared-model typing and the safe production build. A docked two-pane review retained both pane identities and exact highlighted targets after an Insights jump. The original 103-file legacy workspace rendered without Insights controls. Feature version: `1794282538998`.

Focused test command:

```sh
bun test server/reviewInsights.test.ts server/reviewOrganization.test.ts \
  shared/review-organization/tests/insights.test.js shared/review-organization/tests/integration.test.ts \
  ui/src/lib/reviewInsightsMachine.test.js ui/src/lib/reviewRoute.test.ts \
  ui/src/lib/reviewNavigation.test.ts ui/src/lib/reviewOrderExplanation.test.js \
  ui/src/lib/reviewSidebarMachine.test.js ui/src/lib/reviewConfirmation.test.js \
  ui/src/lib/reviewViewedGuard.test.ts ui/src/lib/featureUpdates.test.js
```

Visual evidence retained with the user-facing sketch: `prview-all-sorts-attention.png` captures the preceding compact UI, `prview-insights-quiet-live.png` the quiet new entry points, and `prview-insights-live.png` the real complexity rail beside its highlighted PR line. The sketch remains a throwaway artifact; runtime proof uses the live app and real Git objects.
