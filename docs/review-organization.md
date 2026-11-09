# Review organization integration

Run the live app from the outer repository with `pnpm cockpit:live`, then open `http://127.0.0.1:4900/#/pr/storybookjs/storybook/36948/files`. It uses the existing GitHub CLI login and a separate local cache. `COCKPIT_FOREGROUND_ONLY=1` skips background polling, relay, forwarders, agents, auto-installation and update checks; interactive GitHub reads and mirror fetches still run on demand.

The original analysis, relationship and import-flow functions live in `shared/review-organization/`. `capture.ts` adapts native diff metadata, including pure renames and empty additions. `server/reviewOrganization.ts` computes source evidence in a bounded worker from the PR's local mirror and caches it by repository and comparison. `model.ts` derives ordering and visibility; the UI preserves Cockpit's native diff objects and renderer.

The enhanced review controls are enabled by default. Existing `?organize=1` links behave the same; `?legacy=1` before the PR hash selects the original Cockpit layout. Repository investigations remain separately enabled with `?investigate=1`. Code locations and organization controls restore through URL history.

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


The main queue groups folded files behind a disclosure, while their native diff bodies stay collapsed until opened. Searching a folded path reveals its queue group. Native file/code search continues to cover the repository rather than inheriting category hiding. Opening a hidden changed file from native search restores it explicitly and clears the queue query. In enhanced review, `X` toggles the Tests category. Legacy mode retains Cockpit's original tests/generated filter.

## Related verification

[Review workspace](review-workspace-checkpoint.md) covers URL history, independent panes and native Viewed synchronization. [Code navigation](review-code-navigation.md) describes symbol cards and explicit destinations. [Default workspace](default-workspace.md) records the default/legacy URL policy.
