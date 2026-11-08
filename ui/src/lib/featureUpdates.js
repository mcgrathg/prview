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
