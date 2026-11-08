import { captureFromDiff } from '../shared/review-organization/capture.ts';
import type { ReferenceGraph } from '../shared/review-organization/relationships.ts';
import { parseDiff } from '../ui/src/lib/diff.js';

export type OrganizationResult = { capture: ReturnType<typeof captureFromDiff>; graph: ReferenceGraph };
const cache = new Map<string, Promise<OrganizationResult>>();
let running = 0;

export function reviewOrganization(repo: string, number: number, base: string, head: string, patch: string, checkout: string): Promise<OrganizationResult> {
  const key = `${repo}#${number}:${base}...${head}`;
  const existing = cache.get(key);
  if (existing) return existing;
  if (running >= 4) return Promise.reject(new Error('Organization analysis is busy; retry shortly.'));
  const capture = captureFromDiff(repo, number, base, head, parseDiff(patch));
  const result = new Promise<OrganizationResult>((resolve, reject) => {
    running++;
    let worker: Worker | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      try { worker?.terminate(); } finally { running--; }
    };
    try {
      worker = new Worker(new URL('./reviewOrganizationWorker.ts', import.meta.url).href);
      timer = setTimeout(() => { finish(); reject(new Error('Organization analysis timed out.')); }, 15_000);
      worker.onmessage = ({ data }) => {
        finish();
        if (data.error) reject(new Error(data.error));
        else resolve(data);
      };
      worker.onerror = error => { finish(); reject(new Error(error.message)); };
      worker.postMessage({ capture, checkout });
    } catch (error) {
      finish(); reject(error);
    }
  });
  cache.set(key, result);
  void result.catch(() => cache.delete(key));
  while (cache.size > 16) cache.delete(cache.keys().next().value!);
  return result;
}
