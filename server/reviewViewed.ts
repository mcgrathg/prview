import { GithubRequestError, withGithubViewerGraphql, type GithubViewerGraphql } from "./github.ts";

export type ReviewViewedState = "VIEWED" | "UNVIEWED" | "DISMISSED";

export interface ReviewViewedSnapshot {
  account: { id: string; login: string };
  repo: string;
  number: number;
  pullRequestId: string;
  headOid: string;
  baseOid: string;
  files: { path: string; state: ReviewViewedState }[];
}

export interface ReviewViewedWrite {
  repo: string;
  number: number;
  accountId: string;
  pullRequestId: string;
  expectedHeadOid: string;
  expectedBaseOid: string;
  path: string;
  viewed: boolean;
}

export class ReviewViewedError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = "ReviewViewedError";
  }
}

const FILES_QUERY = `query ReviewViewedFiles($owner: String!, $name: String!, $number: Int!, $cursor: String) {
  viewer { id login }
  repository(owner: $owner, name: $name) {
    nameWithOwner
    pullRequest(number: $number) {
      id headRefOid baseRefOid
      files(first: 100, after: $cursor) {
        totalCount
        nodes { path viewerViewedState }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;

const markMutation = (viewed: boolean) => `mutation ReviewViewedFile($pullRequestId: ID!, $path: String!) {
  ${viewed ? "markFileAsViewed" : "unmarkFileAsViewed"}(input: { pullRequestId: $pullRequestId, path: $path }) {
    pullRequest { id headRefOid baseRefOid }
  }
}`;

function invalidResponse(): never {
  throw new GithubRequestError("GitHub returned incomplete Viewed state", 502, [], "graphql", "graphql");
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : invalidResponse();
}

function identity(value: Record<string, unknown>): { pullRequestId: string; headOid: string; baseOid: string } {
  if (typeof value.id !== "string" || !value.id
    || typeof value.headRefOid !== "string" || !/^[a-f0-9]{40}$/i.test(value.headRefOid)
    || typeof value.baseRefOid !== "string" || !/^[a-f0-9]{40}$/i.test(value.baseRefOid)) return invalidResponse();
  return { pullRequestId: value.id, headOid: value.headRefOid.toLowerCase(), baseOid: value.baseRefOid.toLowerCase() };
}

function sameContext(left: ReviewViewedSnapshot, right: Pick<ReviewViewedSnapshot, "account" | "pullRequestId" | "headOid" | "baseOid">): void {
  if (left.account.id !== right.account.id || left.pullRequestId !== right.pullRequestId
    || left.headOid !== right.headOid || left.baseOid !== right.baseOid) {
    throw new ReviewViewedError("The account or pull request changed. Refresh Viewed state before trying again.", 409, "stale-viewed-context");
  }
}

async function readSnapshot(repo: string, number: number, request: GithubViewerGraphql): Promise<ReviewViewedSnapshot> {
  const [owner, name] = repo.split("/");
  let snapshot: ReviewViewedSnapshot | undefined;
  let cursor: string | null = null;
  let total: number | undefined;
  const cursors = new Set<string>();
  const paths = new Set<string>();
  for (;;) {
    const data = object(await request(FILES_QUERY, { owner, name, number, cursor }, "Viewed files"));
    const viewer = object(data.viewer);
    if (typeof viewer.id !== "string" || !viewer.id || typeof viewer.login !== "string" || !viewer.login) return invalidResponse();
    if (data.repository === null) throw new ReviewViewedError("Pull request not found or inaccessible", 404, "not-found");
    const repository = object(data.repository);
    if (typeof repository.nameWithOwner !== "string" || repository.nameWithOwner.toLowerCase() !== repo.toLowerCase()) return invalidResponse();
    if (repository.pullRequest === null) throw new ReviewViewedError("Pull request not found or inaccessible", 404, "not-found");
    const pr = object(repository.pullRequest);
    const context = { account: { id: viewer.id, login: viewer.login }, ...identity(pr) };
    if (snapshot) sameContext(snapshot, context);
    else snapshot = { ...context, repo, number, files: [] };
    const files = object(pr.files);
    if (typeof files.totalCount !== "number" || !Number.isSafeInteger(files.totalCount) || files.totalCount < 0
      || (total !== undefined && total !== files.totalCount) || !Array.isArray(files.nodes)) return invalidResponse();
    total = files.totalCount;
    for (const node of files.nodes) {
      const file = object(node);
      if (typeof file.path !== "string" || !file.path || paths.has(file.path)
        || (file.viewerViewedState !== "VIEWED" && file.viewerViewedState !== "UNVIEWED" && file.viewerViewedState !== "DISMISSED")) return invalidResponse();
      paths.add(file.path);
      snapshot.files.push({ path: file.path, state: file.viewerViewedState });
    }
    const page = object(files.pageInfo);
    if (typeof page.hasNextPage !== "boolean") return invalidResponse();
    if (!page.hasNextPage) {
      if (snapshot.files.length !== total) return invalidResponse();
      return snapshot;
    }
    if (files.nodes.length === 0 || snapshot.files.length >= total
      || typeof page.endCursor !== "string" || !page.endCursor || cursors.has(page.endCursor)) return invalidResponse();
    cursors.add(page.endCursor);
    cursor = page.endCursor;
  }
}

export function fetchReviewViewed(repo: string, number: number): Promise<ReviewViewedSnapshot> {
  return withGithubViewerGraphql(repo, "app detail", (request) => readSnapshot(repo, number, request));
}

export function writeReviewViewed(input: ReviewViewedWrite): Promise<ReviewViewedSnapshot> {
  return withGithubViewerGraphql(input.repo, "user action", async (request) => {
    const before = await readSnapshot(input.repo, input.number, request);
    sameContext(before, {
      account: { id: input.accountId, login: "" }, pullRequestId: input.pullRequestId,
      headOid: input.expectedHeadOid, baseOid: input.expectedBaseOid,
    });
    if (!before.files.some((file) => file.path === input.path)) {
      throw new ReviewViewedError("This path is not a changed file in the pull request", 400, "invalid-viewed-path");
    }
    const data = object(await request(markMutation(input.viewed), {
      pullRequestId: before.pullRequestId, path: input.path,
    }, input.viewed ? "mark file viewed" : "unmark file viewed"));
    const payload = object(data[input.viewed ? "markFileAsViewed" : "unmarkFileAsViewed"]);
    sameContext(before, { account: before.account, ...identity(object(payload.pullRequest)) });
    const after = await readSnapshot(input.repo, input.number, request);
    sameContext(before, after);
    if (after.files.find((file) => file.path === input.path)?.state !== (input.viewed ? "VIEWED" : "UNVIEWED")) {
      throw new ReviewViewedError("GitHub did not confirm the Viewed change. Refresh before trying again.", 409, "viewed-not-confirmed");
    }
    return after;
  });
}
