# Integrated investigation acceptance

Verified on Storybook PR36212, a113-file merged PR, at immutable head `301d93ce7db832ba8e424db332203e2382dfa2e1` and base `689357da10260f9620d5871b3c155f0de091e923`. These were new investigation questions and findings for this PR; the repository mirror already existed. No comment, review, Viewed change, AI request or attachment was published during this acceptance.

## Observed workflow

1. Selected changed `code/lib/docgen-harness/src/compare/argtypes.ts` from the existing organization order and created “How are docgen argtypes compared?”. Ordinary click on imported SBType produced a card for unchanged `code/core/src/csf/SBType.ts:49`; Open beside retained main.
2. File Symbols produced104 real source entries. Filtering compareArgTypes and Open moved main to line20 while retaining result context. Browser Back restored line1, Forward restored20, and reload retained20 plus the outline query.
3. Semantic usages returned75 locations with an explicit candidate-scope limitation. Filtering expect-current-or-better located the unchanged caller at47. Inspect left main/pinned type intact; saving evidence captured that exact caller/revision.
4. Added a private finding and checkpoint, prepared its native Markdown draft, inserted prior draft text, canceled and prepared again. The existing prefix and evidence links remained. No publishing action was used.
5. Branched “Which repository conventions guide this caller?” from the preview. Patterns showed79 reasoned candidates, including parsed dependencies, source-backed mentions and repository guidance, with category limits. Inspected CONTRIBUTING, made an independent finding, kept guidance beside the caller and promoted that question. The first question retained its own main20, type49, preview47 and result filter.
6. Closed the first question, then resumed its saved finding checkpoint. Main, comparison, preview and search context returned; both findings remained. Reload and a later Resume repeated this result.
7. Return to review retained argtypes.ts. Unified/Split switches kept the selected file. Native whole-file expansion and return to hunks worked; Viewed remained available without changing it. Existing review threads rendered. The pending/immediate draft controls were present, but this merged PR’s publication paths were deliberately not exercised. Live mutation semantics retain their earlier verification.
8. Cmd/Ctrl+P and Cmd/Ctrl+Shift+F opened the question-owned file/text browser. Closing results restored focus inside the workspace. Repeated question switches and return disposed old models; Return left zero prview models. After the lifecycle fix, the repeated sequence logged no new errors or proxy-identity warnings; an unrelated existing quota assignment warning remained.
9. At620px viewport width, the workspace was606px wide; question strip, wrapped commands and code/comparison stayed accessible. The normal1280px viewport was restored. A separate ordinary `?organize=1` review had zero investigation tabs, workspaces or editor models: the preview remains opt-in.
10. Optional AI accurately showed no configured provider with disabled Ask. Independent draft/reload checks and injected-provider tests cover its adapter; a live model answer remains unverified until a key/model is configured.

## Integration corrections

Acceptance found two real defects and one space issue. The legacy full-screen browser could intercept a command after focus fell to the document body; active investigations now unmount that browser, own fallback navigation commands and delegate file-rail search. A Svelte-proxied editor handle failed raw identity comparison during cleanup, leaving a disposed handle; the resource now uses `$state.raw`, clears before disposal, and passed the repeated live sequence. Active question tabs move to the top, placing the workspace immediately below them at43px instead of leaving the full PR header above code.

| Boundary/event | State owner and effect |
| --- | --- |
| Enter/switch investigation | Workspace identity activates its question; legacy code browser unmounts |
| Repository command | Current source editor or workspace owns Files/Text/Symbols; native hidden PR shortcuts yield |
| Close results | Research cancels; focus returns to code/workspace |
| Source replacement/teardown | Raw editor handle clears before model disposal; late providers cannot publish |
| Return to review | Question remains saved, investigation resources stop, native browser may restore its prior explicit search |
| Active question strip | Derived presentation only; review URL and private geometry remain separate |

## Evidence and limits

Screenshots: `prview-investigation-acceptance-before.png` and `prview-investigation-acceptance-after.png`. The after image contains changed main source, unchanged type/caller context and semantic results. Other feature-level reports cover storage failures, cross-PR isolation, alias/candidate limitations and source analysis. `source-insight-benchmark.json` records three fresh-worker samples151.85–193.25ms and warm34.84–44.85ms with an existing mirror and warm OS cache; browser-ready observations on this PR included34.4ms and2.2–14.1ms warm model creation, not a cold-machine claim.

The final completion suite passed111 tests /562 assertions across19 files, both in the checkout and the staged tracked-source snapshot. Strict worker/benchmark typing and the tracked-source production UI build passed. The suite is intentionally focused on investigation, URL/navigation, search, symbol actions, private draft/evidence and server source analysis. Strict worker typing and a staged tracked-source UI build verify the final artifact. Full-server typechecking retains documented unrelated upstream diagnostics. No Electron-shell behavior or live AI response quality is claimed.
