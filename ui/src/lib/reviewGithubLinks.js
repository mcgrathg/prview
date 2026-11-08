const fileHashes = new Map();
function pathHash(path) {
  if (!fileHashes.has(path)) {
    if (fileHashes.size >= 1024) fileHashes.delete(fileHashes.keys().next().value);
    fileHashes.set(path, crypto.subtle.digest('SHA-256', new TextEncoder().encode(path)).then(bytes => [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, '0')).join('')));
  }
  return fileHashes.get(path);
}
function prUrl(repo, number) {
  return /^[\w-][\w.-]*\/[\w-][\w.-]*$/.test(repo) && Number.isInteger(number) && number > 0
    ? `https://github.com/${repo.split('/').map(encodeURIComponent).join('/')}/pull/${number}` : null;
}
export function reviewPrGithubHref(repo, number) { return prUrl(repo, number); }
export function reviewSourceGithubHref(repo, sha, path, start = null, end = start) {
  if (!/^[\w-][\w.-]*\/[\w-][\w.-]*$/.test(repo) || !/^[a-f\d]{40}$/i.test(sha) || !path) return null;
  const anchor = Number.isInteger(start) && start > 0 ? `#L${start}${Number.isInteger(end) && end > start ? `-L${end}` : ''}` : '';
  return `https://github.com/${repo}/blob/${sha}/${path.split('/').map(encodeURIComponent).join('/')}${anchor}`;
}
export async function reviewFileGithubHref(repo, number, path, side = null, start = null, end = start) {
  const pr = prUrl(repo, number);
  if (!pr || !path) return null;
  const hash = await pathHash(path);
  const marker = side === 'LEFT' ? 'L' : 'R';
  const anchor = Number.isInteger(start) && start > 0 ? `${marker}${start}${Number.isInteger(end) && end > start ? `-${marker}${end}` : ''}` : '';
  return `${pr}/files#diff-${hash}${anchor}`;
}

export function githubReviewAnchor(node, initial) {
  let generation = 0;
  function update(input) {
    const current = ++generation;
    reviewFileGithubHref(input.repo, input.number, input.path, input.side, input.start, input.end).then(href => {
      if (current === generation && href) node.href = href;
    }).catch(() => {});
  }
  update(initial);
  return { update, destroy() { generation++; } };
}
