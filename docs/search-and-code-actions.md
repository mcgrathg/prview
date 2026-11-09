# Search context and code actions

Approved behavior: the selected text-search result shows nearby pinned code and smart-case literal highlighting. Other rows stay compact. Arrow keys select results; Space previews, Enter opens, and Cmd/Ctrl+Enter opens beside. Typing in a search field keeps normal spaces and shortcuts. Code viewers share Preview definition, Usages, Open in review, Open beside and deliberate local VS Code actions. Changed definitions open their PR diff; other definitions stay in rail context.

| State / event | Result |
| --- | --- |
| Search results arrive | Select the first visible result; load context only for the selection |
| Focus another result | Cancel obsolete context and load the selected pinned file; reuse a bounded per-browser cache |
| Query, mode, revision or result list changes | Clear obsolete selection/context; the current request determines highlighting |
| Space on a result | Open temporary preview, preserving the working location |
| Enter / Cmd or Ctrl+Enter on a result | Open / open beside at the same captured result and revision |
| Typing or composing in an input | Preserve text entry; ordinary Space remains a space |
| Close browser / dispose | Cancel context and release its cache with the component |
| Inspect symbol / Preview definition | Load the captured symbol into a card; preview expands nearby definition code |
| Open in review / Open beside | Resolve the same captured symbol, then navigate only on a unique current result; ambiguity remains a choice |
| Card closed, context changes, another action starts | Cancel obsolete work; late results cannot navigate |
| VS Code | Use the existing explicit local-checkout link/setup; do not change revisions or branches |

## Navigation ownership

Complete code destinations use the navigation actor’s NAVIGATE event. PATCH is reserved for partial controls, so removing search, context or investigation fields cannot merge the previous overlay back into the result. Search opens and beside destinations preserve the prior result entry for browser Back. Opening from an investigation to the PR clears that overlay in one pushed destination and retains the saved question.

Context-only reference URLs explicitly carry `kind: context`, a bounded display label, a validated preview path/line and immutable revision. They show Code context without starting a semantic usages lookup. Module-path labels are supported; normal reference requests still require identifier symbols. A definition from the original side maps to the original diff line; an unrelated revision remains context. Transient source previews cannot rewrite a caller at a different view or effective revision.

The shared symbol lookup actor captures an explicit preview/open/beside intent. It navigates once on a unique current definition, leaves ambiguous definitions as choices, and ignores canceled or obsolete results. VS Code’s setup modal retains Escape ownership; editor cursor positions reset on source or line navigation.

## Verification

- 73 focused tests / 447 assertions cover snippets, smart-case matching, result shortcut decisions, pinned context caching and cancellation, symbol intents, original-side/renamed destinations, pane preservation, complete snapshot restoration, investigation history and local editor links. Removing surrounding lines or omitting the symbol lookup’s context guard was rejected by the relevant tests; both temporary mutations were restored.
- Production and tracked-source Node Vite builds include the new shared modules. No dependency or backend change is needed.
- Real Storybook #36212 search: selecting `expect-current-or-better.ts:47` shows numbered lines46–48 with the exact match highlighted. Arrow keys select; Space preserves the working file and opens temporary preview; Cmd+Enter pins the same revision beside it; Enter opens the same line.
- Enhanced code-browser search shows surrounding lines19–21 for `compareArgTypes:20`. Enter reaches its PR diff, and Cmd+Enter opens a diff pane while preserving the first. Browser Back restores the query/results.
- prview #1 native diff: right-click CapturedFile and Preview definition shows its actual declaration excerpt. Open in review reaches `analysis.ts:13`; Back restores `relationships.ts:1`.
- Plain context source and the repository editor expose the shared action labels. Original symbol clicks still open cards. F12 previews the same definition in the editor; Open in review closes the investigation and Back restores its question. Unchanged StrictArgTypes remains read-only `core/src/csf/story.ts:166` in the rail with the PR anchor intact.
- VS Code setup was opened from both a symbol card and editor menu. Escape closed only setup and retained the card/question. Native protocol launch remains a manual check because browser automation blocks external-app navigation; it was not attempted again.

Before/after screenshots were captured from the preserved baseline assets and final running UI. Native diff/source APIs were read only; no GitHub comments, Viewed changes, reviews or repository edits were submitted by the browser checks.
