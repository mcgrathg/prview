export const RELEASES = [
  {
    version: 1,
    date: '2026-11-08',
    title: 'A clear place to catch up',
    summary: 'Our first numbered release starts the history with what is available in prview today.',
    changes: [
      { title: 'A changelog you can revisit', body: 'New releases appear when you open or refresh prview. Find the full history and your current version in Settings → What’s new.' },
      { title: 'Review your way', body: 'Switch directly between unified and split diffs, resize and arrange panels, compare files beside each other, and collapse the navigation rails.' },
      { title: 'Follow code and find references', body: 'Follow imports and definitions, find semantic references at a pinned revision, and use browser Back to return. Large-repository reference results are labeled when partial.' },
      { title: 'Keep the review organized', body: 'Choose file categories and reading order, sync Viewed with GitHub, keep review drafts, and jump to the corresponding code on GitHub.' },
    ],
  },
];
export const CURRENT_RELEASE = RELEASES.at(-1);
export const RELEASE_SEEN_KEY = 'prview:last-seen-release';

export function unseenReleases(lastSeen, releases = RELEASES) {
  return releases.filter(release => release.version > lastSeen).toSorted((a,b) => b.version-a.version);
}
export function readSeenRelease(storage) {
  try {
    const raw = storage?.getItem(RELEASE_SEEN_KEY);
    const version = raw && /^\d+$/.test(raw) ? Number(raw) : 0;
    return Number.isSafeInteger(version) && version >= 0 ? version : 0;
  } catch { return 0; }
}
export function acknowledgeRelease(storage, version = CURRENT_RELEASE.version) {
  try {
    if (!storage) return false;
    storage.setItem(RELEASE_SEEN_KEY,String(Math.max(version,readSeenRelease(storage))));
    return true;
  } catch { return false; }
}
