# Familiar review with contextual tools

Approved direction: a compact folder tree and native diffs form the everyday view. All changed files start visible, ordered by file path. Attention, Original, Changed lines, Import flow, category rules, per-file overrides, evidence and related files remain explicit choices in File and review options. Active custom choices stay visible; full controls continue to use the existing bounded URL snapshots. Old explicit Attention/fold snapshots retain their behavior.

All five reading orders use the same compact file renderer. Flat lists preserve the engine’s input sequence; optional folder grouping uses the same collapsible tree. Ranked modes keep global rank and reasoning tooltips without a repeated directory row. Folded and hidden disclosures use those same compact rows; hidden selections restore the file to review. File links preserve modified-click browser navigation.

File headers retain collapse, path/copy, change counts and direct Viewed. Open beside, whole-file expansion, Edit, commit context, history, GitHub and VS Code move into File actions. The fixed shortcut footer becomes a toolbar help popover, retaining the existing scoped confirmation path. Unified/Split remains directly visible. PR tools and workspace controls remain reachable through small menus.

The native page scrolls the full PR metadata away. The review toolbar sticks at the top; the current file header sticks below its measured height. The file tree scrolls independently beneath its filter. Docked panes retain their own scroll roots and filename headers. Inbox search and view options stay in a measured sticky group; PR rows and code-context results remain independent of other panes.

Quick commands use a separate local XState actor and a native modal. Cmd/Ctrl+Shift+P opens commands. Typing `>` in the enhanced Cmd/Ctrl+P picker switches to commands; Cmd/Ctrl+K retains the PR finder. The command registry contains navigation and reversible review configuration only. Existing navigation, organization, sidebar and workspace actors execute those actions; the palette owns no duplicate review state and cannot publish reviews or change GitHub Viewed state.

| Owner / event | Transition or effect |
| --- | --- |
| Organization / new comparison without restored controls | File-path order, folder tree, all files visible |
| Organization / order, category, folder or query change | Existing actor changes controls; URL history receives the snapshot |
| Organization / restore old explicit controls | Preserve its order, rules, grouping and selected code |
| Native popover / trigger, outside click, Escape | Open or close one transient options surface; no persisted disclosure state |
| Commands closed / Open or prefixed file query | Open with that query and first selection |
| Commands open / query or arrows | Reset selection on query; bound arrow selection to current results |
| Commands open / registry changes | Refresh available commands; clamp selection |
| Commands open / Enter or result click | Re-read current command availability, close and invoke its existing callback |
| Commands open / Escape, URL navigation, PR or file finder switch | Close and discard query; restore focus or hand off to the requested finder |
| Review / scroll or toolbar resize | CSS sticky positioning uses measured toolbar height; no saved scroll-mode flag |

Native popovers use the browser's top layer and dismissal behavior: [HTMLElement.showPopover](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/showPopover). There is no new framework or dependency. The legacy URL retains its original review controls.

Verification scope: all-file defaults and old URL restoration; Attention/category/folder changes across Back and reload; sticky code and independent sidebar scrolling; direct Viewed and scoped shortcut confirmations; symbol card/usages and docked panes; file-to-command and PR-finder handoffs; narrow layouts; a production build from staged tracked source. No live publication or native-editor launch is needed for these checks.


Browser acceptance used the real 103-file dogfood PR for file filtering, Attention, old comparison URLs, sticky headers, independent tree/pane scrolling, symbol cards/usages, exact-line markers, commit context, VS Code setup, and keyboard confirmation cancellation. Compact file/command/PR-finder handoffs and browser Back were exercised, including keeping line 37 in the original pane when opening beside and closing transient commands on Back. Menu-to-command handoff was checked after fixing dismissal timing. No review, Viewed mutation or native-editor launch was submitted.

A separate public VS Code fixture supplied 15 PRs for the inbox scroll check. Search and sorting stayed visible while rows scrolled; filtering reduced the list to one matching PR. At 520px and 110% interface scale, file headers remained sticky, tree labels retained usable width, and options stayed within the viewport. Collapsing the first file without a selected-file URL stayed collapsed and preserved its controls. Saved folder disclosures remain authoritative rather than reopening automatically around a selection. The fixture intentionally blocked mirror/GitHub access, so unavailable analysis and Viewed state there were expected. The explicit legacy fallback retained its original footer and controls, with file headers at their original sticky offset.

Final tracked-source verification passed 98 tests / 454 assertions, including the new fixed feature version, and a production build. Shared organization modules pass strict TypeScript checking. Production assets are built with Node Vite in scratch storage before deployment, preserving chunks used by open tabs.


The compact-sort follow-up checked every order on the real 103-file PR: 32px rows, original/size/flow ordering, rank reasons and compact contextual actions. Filtered analysis.ts retained global Attention rank #2 through reload; a collapsed selected folder also restored correctly. Open beside created two native panes and Back restored the single review. Six folded and six hidden fixture files retained compact rows and selection behavior. An expanded 101-file hidden section kept a stable scroll height on repeated scrolling; the main virtualized spacer stayed bounded. Sidebar scrolling left the code scroll position unchanged, and narrow rows retained their 44px touch height. No GitHub writes were performed.

Final follow-up verification passed 65 focused tests / 336 assertions and the Node Vite production build from staged source. The sorting engine and URL control format are unchanged.

## Contextual evidence

Insights is available in every reading order through file actions or Review tools. A quiet header entry appears only for measured complexity increases, new resolved cycles or frequent historical activity. The contextual Change/History/Dependencies rail, optional Hotspots order and evidence filters keep the compact defaults intact. See [review insights](review-insights.md) for setup, measurement scope and the state contract.
