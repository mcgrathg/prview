import type { AstDefinition, AstReferences } from "./tsService.ts";
import type { AstRequest, AstResponse } from "./tsWorker.ts";

// Client for the AST worker. Keeps the HTTP loop responsive: all sync
// LanguageService and git-show work happens in the worker. Requests run one
// at a time (client-side FIFO); the timeout arms only at dispatch, so queue
// wait can never expire a lookup. A wedged request kills and respawns the
// worker, resolving that lookup null (grep fallback) while queued jobs retry
// on the fresh worker.
const WORKER_TIMEOUT_MS = 20_000;

interface Job {
  req: Omit<AstRequest, "id">;
  resolve: (result: AstResponse | null) => void;
}

interface Inflight {
  id: number;
  resolve: (result: AstResponse | null) => void;
  timer: Timer;
}

let worker: Worker | null = null;
let seq = 0;
let inflight: Inflight | null = null;
const queue: Job[] = [];

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./tsWorker.ts", import.meta.url).href);
  worker.onmessage = (event: MessageEvent<AstResponse>) => {
    if (inflight?.id !== event.data.id) return;
    clearTimeout(inflight.timer);
    inflight.resolve(event.data);
    inflight = null;
    dispatch();
  };
  worker.onerror = (err) => {
    console.error("ast worker crashed:", err.message);
    resetWorker();
  };
  return worker;
}

function resetWorker(): void {
  worker?.terminate();
  worker = null;
  if (inflight) {
    clearTimeout(inflight.timer);
    inflight.resolve(null);
    inflight = null;
  }
  dispatch();
}

function dispatch(): void {
  if (inflight) return;
  const job = queue.shift();
  if (!job) return;
  const id = ++seq;
  const timer = setTimeout(() => {
    console.error("ast worker timed out; respawning");
    resetWorker();
  }, WORKER_TIMEOUT_MS);
  inflight = { id, resolve: job.resolve, timer };
  ensureWorker().postMessage({ id, ...job.req });
}

// Aborting drops the job if it is still queued; a dispatched job runs to
// completion (the worker is sync) bounded by the dispatch timeout.
async function astLookup(req: Omit<AstRequest, "id">, signal?: AbortSignal): Promise<AstResponse | null> {
  if (signal?.aborted) return Promise.resolve(null);
  const { promise, resolve } = Promise.withResolvers<AstResponse | null>();
  const job: Job = { req, resolve };
  queue.push(job);
  signal?.addEventListener(
    "abort",
    () => {
      const i = queue.indexOf(job);
      if (i < 0) return;
      queue.splice(i, 1);
      resolve(null);
    },
    { once: true },
  );
  dispatch();
  return promise;
}

export async function astDefinitions(req: Omit<AstRequest, "id">, signal?: AbortSignal): Promise<AstDefinition[] | null> {
  return (await astLookup(req, signal))?.defs ?? null;
}
export async function astReferences(req: Omit<AstRequest, "id">, signal?: AbortSignal): Promise<AstReferences | null> {
  return (await astLookup({ ...req, kind: "references" }, signal))?.references ?? null;
}
