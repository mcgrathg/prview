import { buildReviewHash } from './reviewRoute.js';
export const REVIEW_NAVIGATION_EVENT = 'reviewnavigate';

export function commitReviewLocation(repo, number, review, mode = 'push') {
  const hash = buildReviewHash(repo, number, review);
  if (location.hash === hash) return;
  const state = { ...window.history.state };
  if (mode === 'push') delete state.navId;
  window.history[mode === 'replace' ? 'replaceState' : 'pushState'](state, '', hash);
  window.dispatchEvent(new CustomEvent(REVIEW_NAVIGATION_EVENT, { detail: { mode } }));
}
