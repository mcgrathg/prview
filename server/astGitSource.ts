import { showFile } from "./gitShow.ts";

const MIB = 1024 * 1024;
const BATCH_FILES = 512;
const BATCH_BYTES = 4 * MIB;
const FILE_BYTES = 512 * 1024;
const CACHE_BYTES = 64 * MIB;
const CACHE_ENTRIES = 8192;
interface BlobInfo { oid: string; size: number; prefetched?: boolean }

export function astGitSource(checkout: string, sha: string) {
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(sha)) throw new TypeError("AST source requires an immutable commit SHA.");
  let index: Map<string, BlobInfo> | null | undefined;
  const cache = new Map<string, { text: string; bytes: number }>();
  let cachedBytes = 0;
  function catalog() {
    if (index !== undefined) return index;
    index = null;
    const result = Bun.spawnSync(["git", "--no-lazy-fetch", "-C", checkout, "ls-tree", "-r", "-l", "-z", sha], { stdout: "pipe", stderr: "ignore", timeout: 2000, maxBuffer: 16 * MIB });
    if (!result.success) return null;
    const parsed = new Map<string, BlobInfo>();
    for (const record of result.stdout.toString().split("\0")) {
      if (!record) continue;
      const match = record.match(/^\d+ blob ([a-f0-9]{40,64})\s+(\d+)\t([\s\S]+)$/);
      if (!match) continue;
      const size = Number(match[2]);
      if (Number.isSafeInteger(size) && size >= 0) parsed.set(match[3]!, { oid: match[1]!, size });
    }
    index = parsed;
    return index;
  }
  function remember(path: string, text: string) {
    const bytes = (path.length + text.length) * 2;
    if (bytes > CACHE_BYTES) return;
    const previous = cache.get(path);
    if (previous) { cachedBytes -= previous.bytes; cache.delete(path); }
    while (cache.size && (cache.size >= CACHE_ENTRIES || cachedBytes + bytes > CACHE_BYTES)) {
      const oldest = cache.keys().next().value!;
      cachedBytes -= cache.get(oldest)!.bytes; cache.delete(oldest);
    }
    cache.set(path, { text, bytes }); cachedBytes += bytes;
  }
  function batch(path: string, blobs: Map<string, BlobInfo>): boolean {
    const required = blobs.get(path);
    if (!required || required.size > FILE_BYTES) return false;
    const selected = new Map<string, BlobInfo>([[path, required]]);
    let total = required.size;
    const configs = path.endsWith("package.json") || /(?:^|\/)tsconfig[^/]*\.json$/.test(path);
    const include = (candidate: string, blob: BlobInfo) => {
      if (selected.has(candidate) || blob.prefetched || cache.has(candidate) || blob.size > FILE_BYTES || total + blob.size > BATCH_BYTES || selected.size >= BATCH_FILES) return;
      if (!/\.(?:[cm]?js|jsx|tsx?|svelte|json)$/.test(candidate)) return;
      selected.set(candidate, blob); total += blob.size;
    };
    if (configs) {
      for (const [candidate, blob] of blobs) if (candidate.endsWith("package.json") || /(?:^|\/)tsconfig[^/]*\.json$/.test(candidate)) include(candidate, blob);
    } else {
      let prefix = path.slice(0, path.lastIndexOf("/") + 1);
      while (true) {
        for (const [candidate, blob] of blobs) if (candidate.startsWith(prefix)) include(candidate, blob);
        if (!prefix || selected.size >= BATCH_FILES || total >= BATCH_BYTES) break;
        prefix = prefix.slice(0, -1); prefix = prefix.slice(0, prefix.lastIndexOf("/") + 1);
      }
    }
    const result = Bun.spawnSync(["git", "--no-lazy-fetch", "-C", checkout, "cat-file", "--batch", "-Z"], { stdin: Buffer.from([...selected.values()].map(blob => blob.oid).join("\0") + "\0"), stdout: "pipe", stderr: "ignore", timeout: 2000, maxBuffer: BATCH_BYTES + BATCH_FILES * 128 });
    if (!result.success) return false;
    const contents = new Map<string, string>();
    let offset = 0;
    for (const [candidate, blob] of selected) {
      const end = result.stdout.indexOf(0, offset);
      if (end < 0 || result.stdout.subarray(offset, end).toString() !== `${blob.oid} blob ${blob.size}`) return false;
      offset = end + 1;
      if (offset + blob.size >= result.stdout.length || result.stdout[offset + blob.size] !== 0) return false;
      contents.set(candidate, result.stdout.subarray(offset, offset + blob.size).toString());
      offset += blob.size + 1;
    }
    if (offset !== result.stdout.length) return false;
    for (const [candidate, text] of contents) { blobs.get(candidate)!.prefetched = true; remember(candidate, text); }
    return cache.has(path);
  }
  return (path: string): string | null => {
    const cached = cache.get(path);
    if (cached) { cache.delete(path); cache.set(path, cached); return cached.text; }
    const blobs = catalog();
    if (blobs && batch(path, blobs)) return cache.get(path)!.text;
    return showFile(checkout, sha, path);
  };
}
