export const FEATURE_UPDATES = [
  {
    version: 1794168522000,
    title: 'A clear place to catch up',
    summary: 'The existing review workspace when feature history began.',
    howToTry: 'Open a PR’s Files tab to explore the existing review controls.',
    changes: [
      { title: 'A changelog you can revisit', body: 'Find the history and your current version in Settings → What’s new.' },
      { title: 'Review your way', body: 'Switch directly between unified and split diffs, resize and arrange panels, compare files beside each other, and collapse the navigation rails.' },
      { title: 'Follow code and find references', body: 'Follow imports and definitions, find semantic references at a pinned revision, and use browser Back to return. Large-repository reference results are labeled when partial.' },
      { title: 'Keep the review organized', body: 'Choose file categories and reading order, sync Viewed with GitHub, keep review drafts, and jump to the corresponding code on GitHub.' },
    ],
  },
  {
    version: 1794169297574,
    title: 'Quiet, timestamped feature updates',
    summary: 'Completed features now get a fixed timestamp and a short note. Rebuilding prview does not create announcements.',
    howToTry: 'Open What’s new in the left navigation or Settings. A small dot means there are notes you have not opened yet.',
    changes: [
      { title: 'Catch up when you choose', body: 'The permanent What’s new link opens the latest notes. New features add an unread dot without interrupting the review with an automatic modal.' },
      { title: 'A version for each finished feature', body: 'Every entry shows its completion date, version timestamp, what changed and how to try it. Read progress stays in this browser.' },
    ],
  },
  {
    version: 1794170240049,
    title: 'Inspect symbols without leaving the review',
    summary: 'Ordinary code clicks now open a small symbol card. Your review stays in place until you choose where to go.',
    howToTry: 'Click an import or symbol in a diff or source pane. Expand Definition, find Usages, or deliberately choose Open file or Open beside. Double-click and drag still select code.',
    changes: [
      { title: 'Context before navigation', body: 'The card shows the real definition at the clicked revision, with explicit loading, missing and ambiguous results. Escape dismisses it; stale lookups cannot navigate.' },
      { title: 'Follow the right code', body: 'Head and original source keep their pinned revisions. Member names such as get and set are clickable, and browser Back returns to the exact caller after an explicit jump.' },
    ],
  },
  {
    version: 1794170582849,
    title: 'More room for code, navigation in the rail',
    summary: 'Home, Back and Forward now belong to the left navigation instead of a separate row above the review.',
    howToTry: 'Use the first three buttons in the collapsed left rail. Pin the sidebar open to see them in a compact horizontal row beside its collapse button.',
    changes: [
      { title: 'Keep navigation close', body: 'History controls stay reachable without opening the sidebar preview. The browser review gains the space previously reserved for their top row.' },
    ],
  },
  {
    version: 1794171156999,
    title: 'Commit context when you need it',
    summary: 'Inspect the commits behind a file without leaving its diff or adding a permanent panel.',
    howToTry: 'Hover or focus a diff file header and choose its small commit icon. Read the real commit titles and messages, then press Escape to return.',
    changes: [
      { title: 'Messages at the selected comparison', body: 'The popover lists commits touching this file between the pinned revisions. Historical comparisons exclude later commits, and GitHub commit links open only when chosen.' },
      { title: 'Scope stays clear', body: 'These are file-level candidates. Exact line attribution and earlier file names are outside this view; truncated histories and missing message bodies are labeled.' },
    ],
  },
  {
    version: 1794172925485,
    title: 'Private findings for investigations',
    summary: 'Keep notes, pinned code evidence and resumable checkpoints beside an investigation. Prepare an editable review draft when you choose.',
    howToTry: 'In the investigation preview, choose Jot or Save evidence. Findings reopens the notebook; Resume investigation restores a checkpoint. Prepare review draft preserves existing comment text.',
    changes: [
      { title: 'Keep your evidence', body: 'Notes survive reload and question closure. Saved ranges retain their exact source revision; earlier revisions and shortened excerpts are labeled. Independent findings from other tabs are retained.' },
      { title: 'Stay private until you publish', body: 'Finding bodies stay in this browser and out of shared URLs. Draft preparation adds your explanation and pinned source links to the native editor without posting a comment.' },
    ],
  },
  {
    version: 1794175923594,
    title: 'Investigate the whole repository',
    summary: 'Each investigation now keeps a repository browser, search results and read-only source editor at its captured revision.',
    howToTry: 'In the investigation preview (?organize=1&investigate=1), choose Repository or Search text. Click a result to inspect it, or choose Open/Beside. Right-click code for signatures, usages, types and implementations; Symbols lists the current file.',
    changes: [
      { title: 'Search beyond the PR', body: 'Browse unchanged files, group results by path, filter changed or other files, and restore each question’s query and origin through reload and browser history.' },
      { title: 'Understand code in place', body: 'The lazy read-only editor adds signatures, documentation, file symbols, sticky scopes and local Find. Ordinary symbol clicks keep the contextual card. Analysis labels missing dependencies and partial results.' },
      { title: 'Keep evidence precise', body: 'Selections save exact source ranges and immutable revisions to Findings. Native PR diffs, comments, Viewed and layout controls retain their existing behavior.' },
    ],
  },
  {
    version: 1794176253155,
    title: 'Explore repository patterns and dependencies',
    summary: 'Patterns opens a source-backed neighborhood around the current file, beyond the PR’s changed files.',
    howToTry: 'In an investigation, choose Patterns. Inspect a dependency, test, comparable filename or repository guide. Explore expands from that candidate; Save evidence creates a private finding with pinned source excerpts.',
    changes: [
      { title: 'Reasons you can inspect', body: 'Dependencies come from parsed static imports and re-exports. Test, filename and guidance candidates explain their discovery hints; possible callers are explicitly labeled literal mentions.' },
      { title: 'Keep the useful context', body: 'Expand outward without replacing your working file, filter changed or unchanged candidates, and save both the dependency and its importing statement as evidence. Limits and unresolved packages remain visible.' },
    ],
  },
  {
    version: 1794176744497,
    title: 'A private conversation for each investigation',
    summary: 'Optional code questions now keep independent drafts and transcripts beside each investigation.',
    howToTry: 'Choose Ask about code in an investigation. If a provider is configured in Quick Generate, choose its model and inspect the source context before Ask. Without a provider, the panel explains setup and still saves your question.',
    changes: [
      { title: 'Keep context separate', body: 'Questions and completed answers stay private in this browser, scoped to the PR and investigation. Switching questions or reloading restores them; closing a request cancels it.' },
      { title: 'Check evidence before trusting an answer', body: 'Only the selected pinned source excerpts and recent conversation go to the chosen provider on Ask. Findings and drafts are excluded. Valid citations open exact source; Save as finding keeps an editable, explicitly AI-assisted note.' },
      { title: 'Configuration stays honest', body: 'AI requires an existing supported provider key and model. The local verification machine has no provider configured, so live answers were not verified here.' },
    ],
  },
  {
    version: 1794177724614,
    title: 'More code space and consistent investigation shortcuts',
    summary: 'Active investigations use the available height and keep file/search commands inside the current workspace.',
    howToTry: 'Open an investigation: its question strip moves to the top. Use Cmd/Ctrl+P for files or Cmd/Ctrl+Shift+F for repository text. Return to review restores the native diff.',
    changes: [
      { title: 'Code takes the space', body: 'The PR header stays underneath the active workspace. Switching questions, previews and results releases old editor resources cleanly.' },
      { title: 'One owner for browsing', body: 'Active investigations suspend the legacy full-screen browser and keep keyboard commands and file-rail search in the repository panel. Closing results restores focus inside code.' },
      { title: 'Checked on another real PR', body: 'The integrated workflow retained independent questions, unchanged caller/type context, saved findings, browser history and existing draft text. Native diff layout, context expansion and Viewed controls remained available.' },
    ],
  },
  {
    version: 1794178598048,
    title: 'Jump to a local file in VS Code',
    summary: 'A small VS Code link is available in enhanced diff and source file controls.',
    howToTry: 'Click VS Code in a file header or source toolbar. Enter the repository’s local checkout folder once, then use the link to open the local file. The adjacent ⋯ changes the folder.',
    changes: [
      { title: 'An occasional shortcut', body: 'The folder is remembered per repository in this browser. Source views carry their displayed line into the link. This opens the local working tree, which may differ from the PR revision; it does not switch branches.' },
    ],
  },
  {
    version: 1794181746411,
    title: 'Reference links stay with your PR review',
    summary: 'Changed files open in their PR diff. Other files open as read-only context in the reference rail.',
    howToTry: 'Open a symbol’s Usages, then click a filename or result. PR change labels identify files in the current comparison. Repository context stays beside the review; Back to references returns to the results. Browser Back and Forward restore both.',
    changes: [
      { title: 'Keep the review in place', body: 'Reference jumps reveal collapsed files and lines outside visible hunks, including docked diffs. Context previews and Open beside preserve the existing review files and comparison.' },
      { title: 'Know which revision you are reading', body: 'Original-side references use original diff line numbers. Files outside the displayed comparison stay pinned to their requested revision in the rail.' },
    ],
  },
  {
    version: 1794183582666,
    title: 'Search with context and follow code consistently',
    summary: 'Selected search results show nearby code and highlighted matches. Diff and source viewers share the same code actions.',
    howToTry: 'Search repository text, then use the arrow keys to select a result. In the repository rail, Space previews, Enter opens and Cmd/Ctrl+Enter keeps it beside the working file. Right-click a symbol for Preview definition, Usages, Open in review, Open beside and VS Code.',
    changes: [
      { title: 'Compact results, useful context', body: 'Only the selected text result expands to nearby numbered lines. Matching text follows literal smart-case search. Revisited source uses a small pinned-file cache, and obsolete context requests are canceled.' },
      { title: 'One set of code actions', body: 'Preview definition stays in the symbol card; F12 uses the same preview in the repository editor. Open in review takes changed definitions to their PR diff and other definitions to read-only rail context. Open beside preserves existing code panes, and Back restores the prior review or investigation.' },
      { title: 'Local editor access', body: 'VS Code is available from symbol cards and code menus, using the existing per-repository checkout setting. It opens local working-tree code, which can differ from the pinned PR revision.' },
    ],
  },
  {
    version: 1794199851848,
    title: 'Find the line after a jump',
    summary: 'PR diff jumps now mark the destination line and the matching reference entry in blue.',
    howToTry: 'Click a reference or search result that opens a PR diff. Look for the blue outline and gutter accent on the destination line. The matching reference entry stays marked too.',
    changes: [
      { title: 'A marker that stays useful', body: 'The marker follows the current file, line, revision and side. Another jump replaces it; Back, reload and Unified/Split restore it. Docked panes keep independent targets. Diff addition/deletion colors and commenting controls remain visible.' },
    ],
  },
  {
    version: 1794200658793,
    title: 'See why a file has its Attention rank',
    summary: 'Hover a reading-order number for the facts behind that file’s position.',
    howToTry: 'Hover #1, #2 or another file rank. The tooltip shows its role group, added control-flow text signal, change size and what separates it from a neighboring rank. File details → Why this order? provides the same explanation.',
    changes: [
      { title: 'A reading plan you can inspect', body: 'Attention puts implementation, configuration and dependency manifests before tests and supporting files. Within a group, added control-flow text comes first, followed by change size and file-path ties. The tooltip identifies text-only heuristics and unavailable patches; it does not claim a risk score.' },
      { title: 'Correct reasons for the selected mode', body: 'Original, Changed lines and Import flow explain their own policies. Ranks still cover all changed files before filters, folder grouping or visibility rules. The sorting algorithm is unchanged.' },
    ],
  },
  {
    version: 1794205255741,
    title: 'Enhanced prview is now the default',
    summary: 'Ordinary PR links open the complete review workspace without an extra URL flag.',
    howToTry: 'Open or refresh a normal PR link. Review order, collapsible rails, symbol cards, panes and direct Unified/Split controls are available. Existing organize=1 links still work. Use ?legacy=1 before the # route for the original Cockpit layout.',
    changes: [
      { title: 'One normal workspace', body: 'The app navigation and PR review share the same default-mode policy. Repository investigations still require investigate=1; legacy=1 takes precedence over both older and preview flags.' },
    ],
  },
];
export const LATEST_UPDATE = FEATURE_UPDATES.at(-1);
export const FEATURE_SEEN_KEY = 'prview:last-seen-feature';
const LEGACY_BASELINE_VERSION = 1794168522000;
function versionNumber(raw) {
  const version = raw && /^\d+$/.test(raw) ? Number(raw) : 0;
  return Number.isSafeInteger(version) && version >= 0 ? version : 0;
}
export function unseenUpdates(lastSeen, updates = FEATURE_UPDATES) {
  return updates.filter(update=>update.version>lastSeen).toSorted((a,b)=>b.version-a.version);
}
export function readSeenUpdate(storage) {
  try {
    const raw=storage?.getItem(FEATURE_SEEN_KEY);
    if(raw!==null && raw!==undefined)return versionNumber(raw);
    return versionNumber(storage?.getItem('prview:last-seen-release'))>0 ? LEGACY_BASELINE_VERSION : 0;
  } catch { return 0; }
}
export function acknowledgeUpdate(storage, version = LATEST_UPDATE.version) {
  try {
    if(!storage)return false;
    storage.setItem(FEATURE_SEEN_KEY,String(Math.max(version,readSeenUpdate(storage))));
    return true;
  } catch { return false; }
}
