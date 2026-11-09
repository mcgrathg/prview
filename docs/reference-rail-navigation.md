# Reference navigation stays in the review

In enhanced review (`?organize=1`), reference filenames and individual locations use the same destination policy. A changed path at the displayed head or base goes to its native PR diff and the appropriate line/side. A repository path outside that comparison opens read-only source inside the reference rail. Results distinguish PR changes, repository context and other revisions. Deliberately opening source elsewhere remains available.

## State and effects

The review navigation actor owns the URL snapshot and restoration. `references.preview` is an optional validated relative path, one-based line and zero-based character; its revision comes from the immutable reference origin. Older links without this field remain valid. The lookup identity excludes the preview so opening context does not restart the references request or discard the current filter.

| Event | State and effect |
| --- | --- |
| Click changed filename/result or Return to caller | Clear rail preview; select the current comparison’s diff, including renamed original-side paths; preserve other code panes |
| Click repository context or another revision | Set `references.preview`; preserve review anchor and panes; load exact source in the rail |
| Back to references / Escape in context | Clear preview; keep the reference origin and results |
| Close references | Remove the reference origin and preview |
| Browser Back/Forward/reload | Restore the URL snapshot without a new history push |
| Context symbol Open file | Apply the same changed/context policy |
| Context symbol Open beside | Add a pinned pane; preserve existing review files and the global comparison |
| New lookup, changed preview or component disposal | Cancel the previous lookup actor; ignore obsolete completions |
| Diff reveal superseded or comparison changed | Stop obsolete scroll/expansion; share in-flight pinned source loads and clear comparison-specific caches |

Single and docked diff reveals use the same navigation invocation. Pane instances are registered by stable pane ID; node lookup stays inside its owning DiffView. Docked scrolling affects only the nearest workspace scroller. Missing unchanged lines are reconstructed with the existing annotated whole-diff renderer, preserving additions/deletions rather than switching to a source browser. Source fetch failures and size limits retain the file-level diff fallback.

## Verification

The initial route regression run failed four destination/preview assertions under the old source-only policy. The changed policy passes original-side renames, unchanged preview URL round trips, invalid preview rejection, different-revision context, legacy source return and independent pane preservation.

Running browser checks on the local foreground-only server covered:

- prview #1 / CapturedFile: filename and location links select `analysis.ts:13` in its PR diff; clicking the same result reopens a collapsed file.
- Storybook #36212 / compareArgTypes: unchanged `expect-current-or-better.ts:47` loads in the rail, labeled Not changed in this PR; main file and serialized panes stay unchanged. Browser Back/Forward/reload restore context and the diff. Returning to results preserves the filter within the visit.
- Symbol cards remain usable inside context; Open file returns a changed definition to its diff. Open beside preserves both prior panes.
- A new docked pane reveals `argtypes.ts:20` outside the patch hunks. A jump to `argtypes.test.ts:896` moves only the active pane, with all outer ancestor scroll positions unchanged.
- Original-revision StrictArgTypes opens unchanged `core/src/csf/story.ts:166` beside the review at the base SHA, while the first diff pane and global comparison retain the PR head/base pair.

The focused route/navigation/lookup/diff/symbol suite passes 71 tests / 228 assertions. The completion check passes 75 tests / 329 assertions, including feature-history invariants, and builds the tracked-source snapshot under Node Vite. Independent review found pane reveal, beside-origin and concurrent context-load gaps; those were corrected and the relevant real UI paths rechecked. No GitHub comments, reviews, Viewed changes or code edits were submitted during these checks.

## Visible jump destinations

PR diff destinations use the existing URL/pane location to mark the exact row with a blue outline, gutter accent and light overlay. Addition/deletion background colors remain visible. The matching rail reference exposes `aria-current="location"` and the same accent. Read-only text context uses a matching outline. No timer, animation, extra URL field or independent selection store is added.

| Event | Marker |
| --- | --- |
| Jump to a line | Mark the matching file, line and diff side; expose the matching rail entry |
| Another jump or file-only navigation | Replace the old target, or clear it when no line is selected |
| Back/Forward, reload or Unified/Split | Derive the marker from the restored location |
| Docked navigation | Update the active pane’s marker; preserve the other pane’s location |
| Different comparison or source view | Do not mark a mismatched diff row |

Browser verification covered the reported CapturedFile result at `analysis.ts:37`, a subsequent jump to40, Back and reload to37, original-side `argtypes.ts:20` in Split and Unified, and independent docked targets at13 and37. The original-side case marks only the left cell even when the right cell has the same line number. Before/after screenshots show both the code line and the selected reference. The focused route/navigation/history suite passes32 tests/246 assertions, with production and tracked-source builds. Removing the side guard failed the original/head regression; the guard was restored and the policy rechecked.
