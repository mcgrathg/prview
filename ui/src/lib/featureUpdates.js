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
