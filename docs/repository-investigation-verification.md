# Whole-repository investigation

The opt-in investigation workspace (`?organize=1&investigate=1`) now uses a lazy Monaco core editor for read-only pinned source. Native PR diffs remain on Cockpit’s renderer. Repository opens the full Git catalog at the active pane’s immutable revision; text search includes unchanged tracked files. Results group by path/folder and support Changed/Outside filters, temporary Inspect, explicit Open and Beside. The visible cap applies after client filtering. Server text and semantic limits are disclosed.

Source supports ordinary-click symbol cards, F12 definition previews, usages, type/implementation lookup, literal signature/documentation hover, file outline, sticky scope and local Find. TypeScript analysis uses tracked source without installed packages; Svelte covers script blocks. Large implementation/reference scans are candidate-scoped. Empty, unsupported, loading and failed requests remain distinct. Text rendering remains an explicit fallback.

## State ownership

| Event | Owner and transition | Lifetime |
| --- | --- | --- |
| BROWSER.SET | Question captures kind/query/origin; research actor replaces or debounces request | Saved question and validated URL |
| BROWSER.FILTER | Question changes local scope/filter before visible cap | Saved question and URL |
| Result Inspect/Open/PIN | Question changes preview/main/comparison; search origin stays fixed | Independent code history |
| BROWSER.CLOSE | Stops research, retains configuration, closes results | Question survives |
| Select/restore question | Resumes only that question’s open browser; closed siblings do no work | Workspace session |
| QUERY/LOAD/cancel | Lookup aborts prior invocation and rejects late completion | Request |
| Source teardown/failure | Disposes provider requests, subscriptions, model and editor | Source pane |

Search results are recomputed from the saved immutable query, rather than placing thousands of result rows in URLs. Findings remain independently private. Old question checkpoints acquire default browser state without losing existing fields.

## Evidence

On the pinned dogfood PR `mcgrathg/prview#1` (head `97cac0f9b695272b5b71c177beadf842eb371be8`), the browser found and previewed unchanged `server/gitShow.ts`, retained its file query after reload, and returned two text matches for CallFact. Semantic usages returned declaration line12 and use line35. Filtering by Outside excluded these changed locations; filtering by line35 retained the use. Type navigation reached the interface at line12. Implementation search returned no matches with its candidate-scope limitation, rather than inventing an implementation. Hover showed the actual `interface CallFact` signature. Escape dismissed that hover while keeping the investigation open.

Three simultaneous source panes had distinct model URIs and read-only options. Ordinary clicks opened cards without changing the URL; double-click selected a word, attempted typing left source unchanged, and F12 opened a temporary preview. Saving a keyboard-selected range ending at line15 column1 retained evidence lines12–14. Return to review left zero prview editor models. Existing notebook evidence and drafts were retained. The screenshot `prview-repository-investigation.png` shows code and grouped text results.

Focused tests cover independent searches, reload, captured origin after main navigation, closed-sibling inactivity, cancellation/late results, catalog reuse,201-file post-filter coverage, source-provider disposal, literal hover content and source insight. Strict worker TypeScript and a tracked-source UI build are completion checks. Independent boundary review found and resolved active-pane revision selection, scope-before-cap and cleanup-on-initialization-error defects; the last failure path is source-reviewed, not fault-injected in the browser.

Three fresh production AST workers produced hover timings 151.85/160.49/193.25ms; repeated requests34.84/38.35/44.85ms. Existing mirror and OS caches were warm; these are worker timings, not clone or cold-machine timings. Reproduce with `scripts/benchmark-source-insight.ts`; raw samples are in `source-insight-benchmark.json`. Browser model readiness observations ranged from3.1ms warm creation to144–152ms initial integration on the already-running loopback app; they are illustrative, not a comparative benchmark.
