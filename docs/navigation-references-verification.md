# Navigation and semantic references checkpoint

Verified 2026-11-08 against the working source committed with this report. Beads `prv-q4m` and `prv-677` own the delivered behavior; the broader investigation workspace remains in `prv-9sn`.

## Behavior

Enhanced mode (`?organize=1`) supports Find references through the code context menu or Alt-click in diffs, source panes and the code browser. Results retain their exact origin revision, group semantic locations by path, mark declarations, filter by path/code and open unchanged source. Ordinary and modified-click links share one destination builder. Browser Back/Forward and reload restore origin, destination and sibling panes.

The navigation actor owns normalized location. Layout commands merge there, rather than reconstructing location from stale UI fields. A cancellable render invocation hydrates the selected file and row before becoming ready. Diff viewport resize now warms visible virtual chunks; this fixes initially blank docked panes.

## State event table

| Owner / event | Transition and effect |
| --- | --- |
| Navigation PATCH / LAYOUT.SET | Normalize the updated location; preserve unrelated file, line and panes; URL adapter writes history |
| Navigation RESTORE | Replace location from validated URL; no new history write |
| Navigation APPLY | Invoke rendering for captured location; newer navigation aborts preceding invocation |
| Lookup LOAD | Replace immutable request; abort predecessor; enter loading |
| Lookup success | Ready, empty or unsupported are distinct; fetching retries are bounded |
| Lookup failure / RETRY | Visible error retains request; explicit retry starts a fresh invocation |
| Lookup CANCEL / teardown | Stop invocation; stale completion cannot update current snapshot |
| Reference selection | Change only the chosen code destination; retain lookup origin and sibling panes |
| Overlay keyboard input | Source browser yields to owned menu/reference controls; Escape closes the focused temporary surface |

These boundaries apply [Stately actors](https://stately.ai/docs/actors) and [invoked lifecycles](https://stately.ai/docs/invoke), using installed XState 5.33.3. They are an architectural application, not a claim about David Khourshid's personal recommendation.

## Analysis scope

The existing serialized TypeScript worker analyzes immutable Git objects. Small repositories include all tracked JS/TS/Svelte roots up to 300 files. Larger repositories discover candidates by identifiers and semantic alias expansion; the UI explicitly reports partial coverage because separately named default imports can be absent. Limits: 300 candidate files, 24 identifier spellings, six rounds, 1,000 locations and the existing grep cap. Text candidates are never emitted as semantic references. Dynamic runtime connections and unresolved project configuration are outside the guarantee. Dispatched synchronous worker work can finish after client cancellation, bounded by its existing 20-second timeout; obsolete UI results are discarded.

## Proof

- 149 focused tests / 535 assertions across 24 files passed, including navigation supersession, bounded retries, reference revision/URL round trips, independently renamed imports, shadowing, unrelated names and existing native review mutations.
- Strict TypeScript check passed for tsService.ts, tsWorker.ts and astResolve.ts. Broader upstream server typing still has pre-existing diagnostics; this is not a claim that the whole server typechecks.
- Production Vite build and git diff --check passed.
- Real browser: caller update-args-in-csf-file.ts:13 → ast.ts:595 → Back → Unified → Split retains caller and actual code. References open unchanged ConfigObject.ts:347, survive reload, and retain their origin through definition navigation and Back.
- Docked browser: reference navigation changes only the caller pane; editor.ts remains. Deleted original line 33 resolves base 3df9f383 while sibling stays head 59c92708. Back restores original caller position. Source-menu ArrowDown/Enter and focused-reference Escape verified after rebuilding.
- Independent boundary review identified three defects (default-import coverage, explicit side precedence, keyboard ownership); all were fixed and the bounded follow-up review confirmed them.
- Final warm endpoint samples: 854.27, 174.92, 168.44 ms; 16 semantic locations, 10 candidate files. Existing full Storybook mirror and warmed worker/OS caches. This does not measure clone time or rendered readiness. Raw request/revision/result/coverage saved in reference-benchmark.json.
- No GitHub comment, review, Viewed or attachment mutation was performed in this slice.

Before/after screenshots and terminal logs are saved with the chat deliverables. The checkpoint leaves investigation actors, repository browsing, findings and optional AI to their separate approved Beads.
