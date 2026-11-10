# Deterministic review insights implementation plan

> **Execution:** work task by task. Fan-out requires separate user approval; the plan itself does not grant it.

**Goal:** deliver the approved quiet header entry, contextual evidence rail and optional hotspot discovery in every reading order.

**Architecture:** a bounded worker reads immutable base/head Git objects and base-anchored history. A pinned optional Lizard adapter receives source strings, never a checkout to execute. A cancellable UI actor owns the comparison result and transient rail selection; the existing organization actor owns hotspot ordering and evidence filters in URL controls.

**Tech stack:** Bun workers, TypeScript, Svelte, XState, Git, isolated Python/Lizard. The existing changed-file import graph supplies explicitly partial dependency observations.

## Global constraints

- Keep all native review actions and the compact default; no GitHub mutations or PR scripts are part of analysis.
- Insights are independent of sorting. Default ordering remains File path and all files visible. Unsupported, truncated, missing or ambiguous analysis is explicit, never zero.
- Use immutable SHAs, literal Git pathspecs, fixed commands, bounded input/output/time/concurrency and trusted analyzer configuration. No automatic package installation in an HTTP request.
- New comparison/close/unmount cancels obsolete UI work. Metrics name tool/version, comparison and coverage; history ends at base rather than wall-clock or local HEAD.

## Files and verification tasks

1. **Analyzer and history service.** Create `scripts/review-analysis-requirements.txt`, `scripts/setup-review-analysis`, `scripts/review-complexity.py`, `server/reviewInsights.ts`, `server/reviewInsightsWorker.ts` and focused tests. The server returns `ReviewInsights` with per-file function comparisons, history/co-change observations, scoped dependencies and coverage. Reuse `extractSourceFacts`, `buildReferenceGraph` and `orderByImports`; do not invent another dependency resolver. Verify real Git fixture base/head deltas, additions/removals/rename mapping, ambiguous names, missing provider, bounded history, malformed requests and worker recovery.
2. **Shared facts and discovery.** Create `shared/review-insights.ts`; add optional insight facts to `organizationModel`, Hotspots order and bounded `insightFilters` URL controls to the existing actor. Verify old URLs preserve defaults; filtered ranks retain global positions; missing metrics sort after measured files; new-cycle filters use only comparable observed graphs.
3. **Review UI.** Create `ui/src/lib/reviewInsightsMachine.js`, its tests and `ReviewInsights.svelte`. Add a quiet relevant-findings button and always-available file-menu entry in `DiffView`; mount one contextual rail in `PrDetail`, sharing loaded facts with `ReviewOrganization` regardless of its order. Use existing code-navigation callbacks for exact-line PR jumps and existing revision-aware read-only context for unchanged related files. Verify source/diff actions, Back, changed comparison, stale-result suppression, tab/close/Escape, loading/retry/coverage, independent scrolling and narrow layout.
4. **Delivery.** Add fixed feature timestamp and current docs. Run focused tests, strict types and tracked-source build. Verify real PR observations and optional tool setup, with no live GitHub writes. Obtain the build skill’s required independent trust-boundary review of the new subprocess/HTTP path; resolve findings, commit on main and push, close Bead and export outer snapshot.

## State contract

| Owner / event | Result |
| --- | --- |
| Insights / comparison load | Clear prior result/rail; invoke one cancellable request |
| Loading / new comparison | Stop prior invocation; only new comparison may publish |
| Loading / result | Accept matching identity; show ready facts and coverage |
| Loading / failure | Keep review usable; expose retry and error |
| Error / retry | Reinvoke the captured comparison |
| Insights / open file, choose tab, close | Change transient rail context only; no sort change |
| Insights / jump | Existing navigation actor updates exact file/side/line URL; rail remains context |
| Organization / Hotspots or evidence filter | Recompute against matching comparison facts; persist only controls in URL |
| Either / unmount | Stop actors; no obsolete result or focus work |

The reviewed sketch is the user-facing `prview-insights-prototype.html` artifact. The accepted flow is quiet default → explicit inspection, with hotspot sorting and filters optional. Dependency evidence is limited to supported changed-file imports and explicitly labeled as such; it is not a repository-wide blast-radius claim.

## Delivery evidence

Implementation and verification are recorded in [review insights](../review-insights.md). The accepted UI uses real Lizard/Git measurements, merge-base-aligned code and target-base-anchored history. All six reading orders, evidence filters, exact jumps, Back, unchanged-file rail context, docked panes, narrow layout and legacy isolation were exercised. The independent subprocess/HTTP boundary review passed after targeted regressions.
