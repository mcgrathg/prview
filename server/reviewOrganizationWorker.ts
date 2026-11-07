import { extractSourceFacts, changedHeadLines } from '../shared/review-organization/source-analysis.js';
import { buildReferenceGraph } from '../shared/review-organization/relationships.ts';

declare const self: Worker;
self.onmessage = ({ data: { capture, checkout } }) => {
  try {
    let bytes = 0;
    const units = capture.files.filter((file: any) => file.status !== 'removed' && /\.[cm]?[jt]sx?$/.test(file.filename))
      .slice(0, 128).flatMap((file: any) => {
        const sizeResult = Bun.spawnSync(['git', '-C', checkout, 'cat-file', '-s', `${capture.head_sha}:${file.filename}`], { stdout: 'pipe', stderr: 'ignore' });
        const size = Number(sizeResult.stdout.toString().trim());
        if (!sizeResult.success || !Number.isSafeInteger(size) || size < 0 || size > 2_000_000 || bytes + size > 16_000_000) return [];
        const source = Bun.spawnSync(['git', '-C', checkout, 'show', `${capture.head_sha}:${file.filename}`], { stdout: 'pipe', stderr: 'ignore', maxBuffer: 2_000_000 });
        if (!source.success) return [];
        const content = source.stdout.toString();
        bytes += size;
        return [{ path: file.filename, content, changedLines: changedHeadLines(file.patch) }];
      });
    const facts = extractSourceFacts(units).map((file: any) => ({
      ...file, side: 'head', revision: capture.head_sha,
      lineCount: units.find((unit: any) => unit.path === file.path)!.content.split('\n').length,
    }));
    const graph = buildReferenceGraph(capture, {
      schemaVersion: 1, repository: capture.repository, headSha: capture.head_sha,
      reportedBaseSha: capture.reported_base_sha, files: facts,
    });
    graph.diagnostics.push('Relative-reference targets are candidates among changed files, not complete repository module resolution.');
    if (facts.length < capture.files.filter((file: any) => file.status !== 'removed' && /\.[cm]?[jt]sx?$/.test(file.filename)).length) {
      graph.diagnostics.push('Some source files were unavailable or exceeded the bounded analysis size.');
    }
    self.postMessage({ capture, graph });
  } catch (error) {
    self.postMessage({ error: String(error) });
  }
};
