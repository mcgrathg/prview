// Layout, navigation and historical comparisons cannot acknowledge the current PR's code.
export function canChangeViewed({ rangeKey, comparison, pullRequest, snapshot, state }) {
  return state === 'ready' && rangeKey === 'all' && !!snapshot && !!pullRequest
    && comparison.head === pullRequest.headRefOid && comparison.base === pullRequest.baseRefOid
    && snapshot.headOid === pullRequest.headRefOid && snapshot.baseOid === pullRequest.baseRefOid;
}
