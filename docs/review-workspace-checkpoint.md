# Review workspace verification — 2026-11-07

The enhanced Cockpit review supports browser history, independent code panes, native GitHub Viewed state and durable Markdown drafts. It is the default workspace. Existing `?organize=1` links remain valid; `?legacy=1` before the PR hash route selects the original Cockpit layout. The outer repository's `COCKPIT_ADOPTION.md` owns launch instructions; Beads owns the roadmap and completion status.

## Review behavior

Use **Open beside** beside a changed file to keep the current file while opening another. Each code pane has visible **Diff/Source** and **Unified/Split** controls. File selection targets the focused code pane. Drag a tab or file to an edge to split, or into a group to add a tab. **Move** offers the same arrangements; **F6/Shift+F6** changes pane focus. **Files pane** and **Related pane** add movable views. **Reset layout** arranges the open panes again without changing their locations.

URLs identify the PR, immutable comparison, selected file, line/side, source/diff view, organization controls and each pane's location. Browser Back/Forward restores those locations; search edits replace the current entry. Personal docking and sizes stay on the device. Narrow screens retain Cockpit's automatic unified rendering; stored split choices return on wider screens.

Collapse changes visibility. **Viewed** confirms the current user's native GitHub state and requires the full current PR comparison. Loading, failed, stale and historical comparisons disable writes. Files dismissed by a new change show **Changed since viewed**. Returning to the app refreshes the account's state. GitHub has no expected-head field on its Viewed mutation: a push during a request can be detected after submission, but cannot be atomically excluded. An uncertain result requires refresh.

Inline drafts retain exact repository/PR/revision/file/side/range identity. **Write/Preview** and formatting preserve text; preview uses the existing sanitized renderer. **Comment now** and **Start/Add to pending review** retain separate queue semantics. Cancel retains a draft; explicit discard clears it. Code-edit drafts also retain code and commit-message text when a pane closes. Successful saves clear only the submitted version. Immediate queued comments now reject a changed head instead of silently retargeting it.

Dockview 8.8.3 supplies the MIT-licensed tab, split and resize foundation. Its documented pointer strategy works in the embedded browser where HTML5 tab dragging failed. A small pointer adapter lets file rows outside Dockview enter its groups. Enterprise modules are not installed.

## Verified checkpoint

- Production Node/Vite build passed. Existing upstream Svelte and bundle warnings remain.
- **121 focused tests passed, 397 assertions**, covering engine parity, native source lookup, URL normalization, navigation/search cancellation, pane transitions, review identity guards, comment/code drafts, uploads and queued comment heads.
- Strict shared-engine TypeScript passed, including unchecked indexed access. Full server checking retains the **55 existing upstream diagnostics**; this is not a clean upstream typecheck.
- CUA browser checks passed two different diff panes, independent layout choices and scrolling, resizing, tab grouping by drag, file drops into an edge, canceled drops, movable auxiliary views, F6 focus, reset, and docking/size restoration after reload.
- Browser Back/Forward passed after pane layout changes and source jumps. A head-side import resolved to `ast.ts:595`; an original-side import resolved to `valueToSource.ts:26` at the base SHA, leaving the other pane unchanged. Typing repository search produced 21 results; one Back left search, and Forward restored the complete query.
- Whole-file expansion and return to hunks passed. Switching files afterward exposed stale native row state; keying each pane's viewer by comparison and file fixed the reproduced blank-code case. The same browser sequence then rendered the new rows.
- Bold formatting produced Markdown and rendered strong text in Preview. Cancel/reopen and reload/file navigation recovered the exact draft. An isolated public-source fixture recovered edited code and its commit message in a fresh page and after pane close. Synthetic test text was reverted; no comment or code commit was published.
- Native Viewed round trip on Storybook #36948 confirmed `UNVIEWED → VIEWED → UNVIEWED`, restoring the original state. A real read returned all **113 files** on #36212. Collapse/reload, docking and navigation kept progress at 0/38 in the main benchmark.
- Modified-click opened the actual GitHub PR Files page. Its DOM contains the generated `diff-bbe1160b98330ab07cd089beb78313197df88dae131723ea1855fa4582748908R1` anchor for `update-args-in-csf-file.ts`.
- Desktop 1280×900 and narrow 514×968 checks passed; pane close controls remained visible on the narrow screen. The temporary viewport override was reset.
- Independent reviews passed the Viewed and attachment boundaries after the reported defects were fixed. The attachment reviewer independently passed its 24-test/112-assertion suite.

Focused suite from the Cockpit root, with the workspace Bun runtime on PATH:

```sh
bun test server/reviewViewed.test.ts server/reviewAttachments.test.ts server/tsService.test.ts server/repoSearch.test.ts server/reviewOrganization.test.ts server/mutations.test.ts server/github-inline-comment.test.ts ui/src/lib/reviewRoute.test.ts ui/src/lib/reviewNavigation.test.ts ui/src/lib/reviewSearch.test.ts ui/src/lib/reviewViewedGuard.test.ts ui/src/lib/workspaceMachine.test.ts ui/src/lib/reviewFileDrag.test.ts ui/src/lib/reviewComposer.test.js ui/src/lib/reviewCodeDrafts.test.js ui/src/lib/reviewAttachments.test.js shared/review-organization/tests
```

## Attachment verification boundary

The real native adapter uploaded the authorized 79-byte synthetic PNG to public `mcgrathg/danger-plugin-jira-integration#3` as `mcgrathg` and returned HTTP 201. The authenticated image proxy returned the identical bytes and the Markdown preview loaded a complete 16×16 image. The unposted asset returned 404 anonymously; public-repository disclosure now acknowledges that pre-submission access can vary. No comment was submitted and private access was not tested. The browser file-chooser bridge failed before transfer, so live transport used the actual multipart endpoint and the returned Markdown was placed in the composer; focused automated coverage verifies picker/paste/drop insertion and recovery. After the disclosure edit, 13 focused tests/60 assertions and the production build passed. See `review-attachments.md` for the provider contract and limits.

## Search and initial-sync limits

Imported package/type aliases now resolve through tracked package exports and tsconfig conditions. The real Storybook import and use resolve to the exported declaration at `ast.ts:6`; the import binding is no longer reported as the definition. That initial cold lookup measured 14.67 seconds. The subsequent batched-read optimization measured a 0.715-second cold median over three fresh workers, with the same declaration target; see `definition-lookup-performance.md` for comparable inputs and limits.

`first-sync-spike.md` records a bounded-fetch experiment with exact diff/source parity on two real PRs. It is a completed investigation, not a production mirror change. The app still uses the full mirror; the spike's 2.5–3.2-second Git results are not application load-time claims. Shallow history and repository search require separate readiness handling before adoption.
