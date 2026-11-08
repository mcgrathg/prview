# Repository-aware investigation workspace

Greg approved this design in the side conversation on 2026-11-08 and delegated implementation to the main session. Beads epic `prv-9sn` owns scope and completion; this document records behavior and architecture, not a second task list.

## Product outcome

Help a reviewer judge whether a PR fits its repository's patterns, strategies, architecture and conventions. Changed files are a starting point, not the boundary of investigation. Blend precise code navigation, GitHub review conventions, progressive investigation and independent side conversations while keeping code primary.

## Repository understanding

Changes and Repository are explicit views. Repository browsing and search include unchanged files at the selected immutable revision. Definition, references, type and implementation navigation are available where supported; hover signatures/documentation, outline, breadcrumbs/sticky scope and consistent file/symbol commands reduce context switching. Search/reference results retain useful surrounding code, grouping and filters. Semantic references and text matches remain distinguishable, and limits or unsupported analysis are visible.

Every code location and piece of evidence names its exact revision. Original-side resolution uses the comparison's original revision; head-side resolution uses its head. Existing-pattern discovery is distinct from Find references: candidate implementations, callers, dependencies, tests and relevant conventions/ADRs have source links and reasons. The product does not declare one implementation canonical without evidence. A focused architecture neighborhood can expand outward with source-backed relationships and explicit incomplete analysis.

## Investigation commands

The workspace retains a review anchor and Return to review action. Main can show the diff, source, search or a promoted investigation. Independent side tabs are named for questions, such as how handlers manage errors or which tests cover a behavior. Each investigation retains code/search context, navigation history, notes/findings and an optional AI conversation. Switching tabs resumes that context exactly.

Inspect opens a reusable temporary preview inside the current investigation without changing main. Following connections continues that preview's trail. Explore in side tab starts an independent investigation from the current code. Promote to main makes the exact investigation/location the main focus while retaining its prior context and a direct route back to review. Keep beside pins a lasting comparison and is separate from Promote. There is one temporary preview per investigation, not one global preview. Close/Escape dismisses temporary context and restores origin focus; closing an investigation preserves saved notes/findings.

URLs and browser history restore code locations, revisions and relevant investigation identity. Personal geometry remains outside those shareable locations. Layout changes preserve meaningful location and context.

## Private notebook

A compact collapsible Findings drawer provides Jot without a required form. Save evidence captures selected source, path/range/revision and optional explanation. A finding can collect multiple source, test and document references from either pane. Save checkpoint captures main, preview, search and navigation trail. Open evidence inspects it temporarily; Resume investigation restores its checkpoint.

Autosaved notes/findings survive reload and tab/pane closure. Earlier-revision evidence stays anchored and is labeled when the PR moves. Question/observation/concern labels are optional. Findings aggregate per PR with their investigation provenance. Turn into review comment creates an editable draft with explanation and evidence links; findings remain private until deliberately shared, and publication uses the normal GitHub action.

## Optional AI

Each investigation may have an independent conversation alongside code/search/notes. Its role is locating and comparing repository-specific evidence with clickable source citations and converting discoveries into findings. Conversation state retains the originating revision/context and never silently shares one live conversation across all views. Reuse an established app/provider integration when suitable. Surface a genuine configuration prerequisite accurately; a nonfunctional stub must not appear to be a working assistant.

## State ownership

| Owner | Owns | Does not own |
| --- | --- | --- |
| Workspace actor | Investigation identities, active investigation, main/review anchor and promote/pin commands | Each investigation's mutable search or navigation |
| Investigation actor | Working locations, navigation trail, current search, one preview, notes/conversation provenance | Sibling investigations or global source contents |
| Lookup actors | Captured immutable request, loading/result/error/retry/cancel lifecycle | Current location after a superseding navigation |
| Source cache | Immutable repo/revision/path bytes and reusable analysis | Any investigation's current selection |
| URL/history adapter | Validated serialization and restoration events | An independent mutable selected-file copy |
| Docking adapter | Personal group geometry and resizing | Semantic code identity or review progress |
| Views | Rendering snapshots and issuing named commands | Duplicated authoritative navigation state |

LOAD replaces the lookup origin and aborts the preceding invocation. Success, empty, unsupported and error are distinct. Close/teardown/context replacement stops work; late results have no transition. Location/layout commands preserve unrelated location fields. History restore emits no new history write. Notes persist independently of temporary view lifetime. Inspect/Open/Open beside/Promote have consistent semantics across diff, source, preview and results.

## Adoption boundary

Evaluate Monaco in a bounded read-only-pane spike before investing heavily in custom editor interactions; compare with the actual GitHub Pull Requests extension experience in VS Code. Monaco does not supply the VS Code workbench or extension host. This evaluation does not authorize an assumed wholesale rewrite. Preserve the native diff/context expansion/gutter comments/suggestions/drafts/pending reviews/Viewed and direct GitHub links. Direct Viewed retains its normal behavior; confirmation rules remain limited to shortcut/footer activation.

## Delivery and proof

The existing navigation defect (`prv-q4m`) and semantic references (`prv-677`) are linked into the epic rather than duplicated. Child records cover the editor evaluation, independent investigation actors, whole-repository navigation, private notebook, pattern/neighborhood discovery, optional AI and integrated proof. Beads records dependencies and current status.

On a fresh real PR, investigate changed code against existing patterns, follow callers/dependencies/tests, branch into independent investigations, promote/pin context, save durable revision-specific findings, return to the exact review and prepare an evidence-backed comment draft without losing text or other panes. Verify cancellation/stale results, reload/Back/Forward, keyboard/pointer paths, meaningful cold/warm performance and before/after UI evidence.

## Primary references

- [Stately actors](https://stately.ai/docs/actors) and [invoked actor lifecycles](https://stately.ai/docs/invoke).
- [VS Code navigation](https://code.visualstudio.com/docs/editing/editingevolved), [workbench and previews](https://code.visualstudio.com/docs/editing/getting-started/userinterface), [Search Editor](https://code.visualstudio.com/docs/editing/codebasics#_search-editor) and [GitHub integration](https://code.visualstudio.com/docs/sourcecontrol/github).
- [Monaco boundaries](https://github.com/microsoft/monaco-editor#faq).
- [Datadog log side panels](https://docs.datadoghq.com/logs/explorer/side_panel/), [progressive trace views](https://docs.datadoghq.com/tracing/trace_explorer/trace_view/) and [findings](https://docs.datadoghq.com/logs/explorer/findings/).
