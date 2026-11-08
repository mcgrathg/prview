# Clickable review code — 2026-11-08

With `?organize=1`, ordinary primary clicks on code symbols and import paths follow their pinned definitions in unified diffs, split diffs and source panes. Hover underlines the token and changes its cursor without requesting a definition. Dragging still selects code. Gutter links, comment controls, Viewed and context menus retain their own actions. The default upstream view keeps modifier-only symbol navigation.

The existing definition request lifecycle and URL navigation remain authoritative: a new lookup aborts its predecessor, stale responses cannot navigate, and Back/Forward restore the caller/destination. In docked workspaces the originating pane changes while other panes stay open. Source-browser jumps now record the exact clicked line before leaving.

| Event | Effect |
| --- | --- |
| Primary single click on a code reference | Resolve and follow when enhanced review is enabled. |
| Ctrl/Cmd-click | Keep the existing symbol action. |
| Drag creating a selection | Keep the selection; do not navigate. |
| Shift/Alt, secondary click, repeated click event or an already handled click | Leave it to its existing action. |
| Hover | Highlight the token locally; leave/blur/destroy clears the highlight. |
| New lookup, navigation or teardown | Existing request identity/cancellation rules discard obsolete results. |
| No unique target | Keep the current code and show existing missing-definition feedback or candidate choices. |

Hit testing stays inside the code cell and spans syntax/word-diff text nodes, avoiding gutter offsets and whitespace hits. Full module strings use the same immutable-revision TypeScript resolver as identifiers. The server verifies their exact source position and import/export/require context before accepting a target; stale or ordinary string values cannot become module links. Non-identifier requests never fall through to global grep. Resolution remains limited by source availability, supported languages and repository configuration; this does not install dependencies or execute the reviewed repository.

## Verification

52 focused tests passed with 143 assertions, including source-package aliases, exact-position module strings, malformed/stale requests, selection/modifier click rules, ambiguity, cancellation and URL state. Focused strict TypeScript and the production UI build passed. Existing broad server typing diagnostics remain outside this change.

On pinned Storybook #36948 (`59c927082239afee5a702036c62c8b61c192c865`), ordinary clicks from both unified and split diffs followed `isValidIdentifier` in `update-args-in-csf-file.ts:13` to `estree/ast.ts:595`. Back restored the caller at line 13. In a two-pane workspace, a jump changed only its source pane; an import path opened `utils.ts:1`, and Back restored source line 4 with the second `editor.ts` pane intact. Drag selection visibly stayed in its source pane. The standalone source browser followed `../template-grammar.ts` and restored the caller at line 14 through Back; Forward restored the target. No GitHub state was written.

```sh
../.working/runtime/bun test ui/src/lib/codeReference.test.js server/tsService.test.ts server/repoSearch.test.ts ui/src/lib/reviewSearch.test.ts ui/src/lib/reviewNavigation.test.ts ui/src/lib/reviewRoute.test.ts
```
