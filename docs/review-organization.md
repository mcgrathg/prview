# Review organization integration

Run the live app from the outer repository with `pnpm cockpit:live`, then open `http://127.0.0.1:4900/?organize=1#/pr/storybookjs/storybook/36948/files`. It uses the existing GitHub CLI login and a separate local cache. `COCKPIT_FOREGROUND_ONLY=1` skips background polling, relay, forwarders, agents, auto-installation and update checks; interactive GitHub reads and mirror fetches still run on demand.

The original analysis, relationship and import-flow functions live in `shared/review-organization/`. `capture.ts` adapts native diff metadata, including pure renames and empty additions. `server/reviewOrganization.ts` computes source evidence in a bounded worker from the PR's local mirror and caches it by repository and comparison. `model.ts` derives ordering and visibility; the UI preserves Cockpit's native diff objects and renderer.

Enable the review controls with `?organize=1` before the PR hash. Existing review behavior remains the default. Engine controls reset on comparison changes; the separate URL-navigation roadmap issue owns restoring these controls and code locations through browser history.

## State transitions

| Event | Evidence lifecycle | Review controls |
| --- | --- | --- |
| Start/reload | Load the named comparison; keep metadata usable meanwhile | Attention order; fixture/snapshot Fold defaults |
| Same comparison again | Keep the in-flight or completed request | Preserve controls |
| Different PR/revision | Cancel the prior promise actor and load the new comparison | Reset rules, overrides, query, root and expansion |
| Late result from prior comparison | Ignored by the stopped invocation; response identity also checked | No change |
| Load failure | Show the error and Retry; metadata-only categories and sorting remain available | Preserve chosen controls; no guessed reference edges |
| Retry | Restart the failed load | Preserve chosen controls |
| Restore category default | Keep comparison evidence | Restore that role's default rule; preserve per-file overrides |
| Order/category/override/query change | Keep comparison evidence | Recompute one derived model; Show wins over Fold, which wins over Hide; per-file override wins |
| Follow imports / clear root | Keep comparison evidence | Importer-first order; folder grouping off; cycles stay contiguous |
| Expand a folded file | Keep evidence | Toggle only organization expansion; never mark Viewed |
| Show all | Keep evidence | Clear category rules and file overrides; show the full inventory |
| Unmount | Stop actor and abort its request | Release local state |

Classification and Attention weights remain heuristics. Relative-reference targets are candidates among changed files, not a complete call graph. Whole-source reads and parsing run off the HTTP loop, bounded to 128 JS/TS files, 2 million characters per file and 16 million in total. Unsupported or missing source remains explicit. Different commit ranges do not reuse the current-head evidence.


The main queue groups folded files behind a disclosure, while their native diff bodies stay collapsed until opened. Searching a folded path reveals its queue group. Native file/code search continues to cover the repository rather than inheriting category hiding. Opening a hidden changed file from native search restores it explicitly and clears the queue query. In organization mode, `X` toggles the Tests category. Its default mode still has Cockpit's original tests/generated filter.

## Current limits

Full URL history for code and organization controls remains tracked in Beads `prv-qop.2`; controller state currently resets on comparison navigation/reload. Native GitHub Viewed synchronization is not implemented. The default upstream view still couples manual collapse and local Viewed; the organization mode's fold/expand actions do not. An aliased imported-type definition can still return its import line (`prv-vi2`), as recorded by the live benchmark.
