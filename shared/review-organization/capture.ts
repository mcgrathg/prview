import type { Capture } from './analysis.ts';

export function captureFromDiff(repo: string, number: number, base: string, head: string, files: any[]): Capture {
  return {
    repository: repo, pull_request: number, title: '', url: `https://github.com/${repo}/pull/${number}`,
    head_sha: head, reported_base_sha: base, changed_files: files.length,
    additions: files.reduce((sum, file) => sum + file.additions, 0),
    deletions: files.reduce((sum, file) => sum + file.deletions, 0),
    files: files.map(file => ({
      filename: file.path, ...(file.previousPath ? { previous_filename: file.previousPath } : {}),
      status: file.isDeleted ? 'removed' : file.previousPath ? 'renamed' : file.isNew ? 'added' : 'modified',
      additions: file.additions, deletions: file.deletions, changes: file.additions + file.deletions,
      patch: file.hunks?.some((hunk: any) => hunk.rows) ? file.hunks.map((hunk: any) => [hunk.range,
        ...(hunk.rows ?? []).map((row: any) => `${row.type === 'add' ? '+' : row.type === 'del' ? '-' : ' '}${row.text}`),
      ].join('\n')).join('\n') : null,
    })),
  };
}
