import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const reviewUrl = new URL("./reviewViewed.ts", import.meta.url).href;
const httpUrl = new URL("./http.ts", import.meta.url).href;
const serverUrl = new URL("./cockpitServer.ts", import.meta.url).href;
const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);

async function scenario(script: string) {
  const dataDir = mkdtempSync(join(tmpdir(), "review-viewed-"));
  try {
    const child = Bun.spawn([process.execPath, "-e", script], {
      env: { ...process.env, COCKPIT_DATA_DIR: dataDir, COCKPIT_GH_BIN: "/bin/echo", COCKPIT_MOCK: "", COCKPIT_MOCK_DATA: "" },
      stdout: "pipe", stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    if (exitCode !== 0) throw new Error(stderr);
    return JSON.parse(stdout.trim());
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
}

const transport = `
  let head = "${HEAD}", base = "${BASE}", accountId = "U_viewer", prId = "PR_7";
  let mode = "normal";
  const calls = [];
  const files = Array.from({ length: 113 }, (_, i) => ({
    path: "src/file-" + i + ".ts", viewerViewedState: i === 1 ? "DISMISSED" : i === 2 ? "VIEWED" : "UNVIEWED",
  }));
  globalThis.fetch = async (input, init = {}) => {
    if (String(input) !== "https://api.github.com/graphql") throw new Error("unexpected request " + input);
    const { query, variables } = JSON.parse(String(init.body));
    calls.push({ query, variables, authorization: init.headers.Authorization });
    const mutation = /^\\s*mutation/.test(query);
    if (mutation) {
      if (mode === "failure") return Response.json({ data: { markFileAsViewed: null }, errors: [{ type: "FORBIDDEN", message: "denied" }] });
      const viewed = query.includes("  markFileAsViewed(");
      if (mode !== "unconfirmed") files.find((file) => file.path === variables.path).viewerViewedState = viewed ? "VIEWED" : "UNVIEWED";
      if (mode === "push-during-write") head = "${"c".repeat(40)}";
      return Response.json({ data: { [viewed ? "markFileAsViewed" : "unmarkFileAsViewed"]: {
        pullRequest: { id: prId, headRefOid: head, baseRefOid: base },
      } } });
    }
    const second = variables.cursor === "page-2";
    if (mode === "token-expiry" && calls.length === 2) {
      const expired = Date.now() + 61_000;
      Date.now = () => expired;
      process.env.COCKPIT_GH_BIN = "/usr/bin/false";
    }
    const nodes = files.slice(second ? 100 : 0, second ? 113 : 100);
    return Response.json({ data: {
      viewer: { id: mode === "account-during-read" && second ? "U_other" : accountId, login: "viewer" },
      repository: { nameWithOwner: "acme/app", pullRequest: {
        id: prId, headRefOid: head, baseRefOid: base,
        files: {
          totalCount: mode === "truncated" ? 114 : 113,
          nodes: mode === "invalid-state" ? [{ path: "src/file.ts", viewerViewedState: "UNKNOWN" }] : nodes,
          pageInfo: { hasNextPage: !second || mode === "repeated-cursor", endCursor: "page-2" },
        },
      } },
    } });
  };
  const { fetchReviewViewed, writeReviewViewed } = await import(${JSON.stringify(reviewUrl)});
  const change = {
    repo: "acme/app", number: 7, accountId, pullRequestId: prId,
    expectedHeadOid: head, expectedBaseOid: base, path: "src/file-112.ts", viewed: true,
  };
`;

test("native Viewed transport paginates and confirms mark/unmark with the personal viewer", async () => {
  const result = await scenario(`${transport}
    const before = await fetchReviewViewed("acme/app", 7);
    const marked = await writeReviewViewed(change);
    const unmarked = await writeReviewViewed({ ...change, viewed: false });
    console.log(JSON.stringify({ before, marked, unmarked, calls }));
  `);
  expect(result.before).toMatchObject({ account: { id: "U_viewer", login: "viewer" }, repo: "acme/app", number: 7, pullRequestId: "PR_7", headOid: HEAD, baseOid: BASE });
  expect(result.before.files).toHaveLength(113);
  expect(result.before.files[1].state).toBe("DISMISSED");
  expect(result.before.files[2].state).toBe("VIEWED");
  expect(result.marked.files[112].state).toBe("VIEWED");
  expect(result.unmarked.files[112].state).toBe("UNVIEWED");
  const mutations = result.calls.filter((call: { query: string }) => call.query.startsWith("mutation"));
  expect(mutations).toHaveLength(2);
  expect(mutations[0].query).toContain("markFileAsViewed(");
  expect(mutations[1].query).toContain("unmarkFileAsViewed(");
  expect(mutations.map((call: { variables: unknown }) => call.variables)).toEqual([
    { pullRequestId: "PR_7", path: "src/file-112.ts" }, { pullRequestId: "PR_7", path: "src/file-112.ts" },
  ]);
  expect(result.calls.filter((call: { variables: { cursor?: string } }) => call.variables.cursor === "page-2")).toHaveLength(5);
  expect(result.calls.every((call: { authorization: string }) => call.authorization === "bearer auth token")).toBe(true);
});

test("Viewed write keeps the validated personal credential through token-cache expiry", async () => {
  const result = await scenario(`${transport}
    mode = "token-expiry";
    const snapshot = await writeReviewViewed(change);
    let nextError;
    try { await fetchReviewViewed("acme/app", 7); } catch (error) { nextError = error.message; }
    console.log(JSON.stringify({ snapshot, nextError, authorizations: [...new Set(calls.map((call) => call.authorization))] }));
  `);
  expect(result.snapshot.files[112].state).toBe("VIEWED");
  expect(result.authorizations).toEqual(["bearer auth token"]);
  expect(result.nextError).toBe("GitHub CLI is not authenticated");
});

test("Viewed guards reject stale account, PR, head, base and foreign paths before mutation", async () => {
  const result = await scenario(`${transport}
    const errors = [];
    for (const override of [
      { accountId: "U_other" }, { pullRequestId: "PR_other" }, { expectedHeadOid: "${"c".repeat(40)}" },
      { expectedBaseOid: "${"d".repeat(40)}" }, { path: "src/not-in-pr.ts" },
    ]) {
      try { await writeReviewViewed({ ...change, ...override }); }
      catch (error) { errors.push({ status: error.status, code: error.code }); }
    }
    console.log(JSON.stringify({ errors, mutations: calls.filter((call) => call.query.startsWith("mutation")).length }));
  `);
  expect(result.mutations).toBe(0);
  expect(result.errors).toEqual([
    ...Array.from({ length: 4 }, () => ({ status: 409, code: "stale-viewed-context" })),
    { status: 400, code: "invalid-viewed-path" },
  ]);
});

test("Viewed reads reject incomplete pages, invalid states and account changes", async () => {
  const result = await scenario(`${transport}
    const errors = [];
    for (const next of ["truncated", "repeated-cursor", "invalid-state", "account-during-read"]) {
      mode = next;
      try { await fetchReviewViewed("acme/app", 7); }
      catch (error) { errors.push({ mode, status: error.status, code: error.code ?? null }); }
    }
    console.log(JSON.stringify(errors));
  `);
  expect(result).toEqual([
    { mode: "truncated", status: 502, code: null },
    { mode: "repeated-cursor", status: 502, code: null },
    { mode: "invalid-state", status: 502, code: null },
    { mode: "account-during-read", status: 409, code: "stale-viewed-context" },
  ]);
});

test("Viewed writes surface GraphQL failure, require confirmation and detect a racing push", async () => {
  const result = await scenario(`${transport}
    const errors = [];
    for (const next of ["failure", "unconfirmed", "push-during-write"]) {
      mode = next;
      try { await writeReviewViewed(change); }
      catch (error) { errors.push({ mode, status: error.status, code: error.code ?? null, message: error.message }); }
    }
    console.log(JSON.stringify(errors));
  `);
  expect(result.map(({ mode, status, code }: { mode: string; status: number; code: string }) => ({ mode, status, code }))).toEqual([
    { mode: "failure", status: 502, code: null },
    { mode: "unconfirmed", status: 409, code: "viewed-not-confirmed" },
    { mode: "push-during-write", status: 409, code: "stale-viewed-context" },
  ]);
  expect(result[0].message).toContain("denied");
});

test("Viewed HTTP validates identity input, preserves errors, and inherits browser origin protection", async () => {
  const result = await scenario(`
    const { buildFetchHandler } = await import(${JSON.stringify(httpUrl)});
    const { startCockpitServer } = await import(${JSON.stringify(serverUrl)});
    const { ReviewViewedError } = await import(${JSON.stringify(reviewUrl)});
    const snapshot = { account: { id: "U_viewer", login: "viewer" }, repo: "acme/app", number: 7,
      pullRequestId: "PR_7", headOid: "${HEAD}", baseOid: "${BASE}", files: [{ path: "src/file.ts", state: "VIEWED" }] };
    const calls = [];
    let failure = false;
    const handler = buildFetchHandler(4820, {
      fetchReviewViewed: async (...args) => { calls.push(args); return snapshot; },
      writeReviewViewed: async (input) => { calls.push(input); if (failure) throw new ReviewViewedError("changed", 409, "stale-viewed-context"); return snapshot; },
    });
    const url = "http://127.0.0.1:4820/api/pr/acme/app/7/viewed";
    const body = { accountId: "U_viewer", pullRequestId: "PR_7", expectedHeadOid: "${HEAD}", expectedBaseOid: "${BASE}", path: "src/file.ts", viewed: true };
    const request = (value) => new Request(url, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
    const read = await handler(new Request(url + "?fresh=1"));
    const write = await handler(request(body));
    const validCalls = [...calls];
    const invalid = [];
    for (const override of [{ accountId: "" }, { pullRequestId: null }, { expectedHeadOid: "bad" },
      { expectedBaseOid: "bad" }, { path: "../outside" }, { viewed: "yes" }]) invalid.push((await handler(request({ ...body, ...override }))).status);
    const invalidRepo = (await handler(new Request("http://127.0.0.1:4820/api/pr/acme%2Fother/app/7/viewed"))).status;
    const invalidNumber = (await handler(new Request("http://127.0.0.1:4820/api/pr/acme/app/7.5/viewed"))).status;
    failure = true;
    const stale = await handler(request(body));
    const server = startCockpitServer(0, handler, "");
    let forbidden;
    const beforeForbidden = calls.length;
    try { forbidden = (await fetch("http://127.0.0.1:" + server.port + "/api/pr/acme/app/7/viewed", {
      method: "PUT", headers: { "content-type": "application/json", origin: "https://untrusted.example" }, body: JSON.stringify(body),
    })).status; } finally { server.stop(true); }
    console.log(JSON.stringify({ read: await read.json(), readCache: read.headers.get("cache-control"), write: await write.json(), validCalls,
      invalid, invalidRepo, invalidNumber, staleStatus: stale.status, stale: await stale.json(), forbidden, forbiddenCalled: calls.length !== beforeForbidden }));
  `);
  expect(result.read.files[0].state).toBe("VIEWED");
  expect(result.readCache).toBe("no-store");
  expect(result.write).toEqual(result.read);
  expect(result.validCalls).toEqual([
    ["acme/app", 7],
    { repo: "acme/app", number: 7, accountId: "U_viewer", pullRequestId: "PR_7", expectedHeadOid: HEAD, expectedBaseOid: BASE, path: "src/file.ts", viewed: true },
  ]);
  expect(result.invalid).toEqual([400, 400, 400, 400, 400, 400]);
  expect(result.invalidRepo).toBe(400);
  expect(result.invalidNumber).toBe(400);
  expect(result.staleStatus).toBe(409);
  expect(result.stale.code).toBe("stale-viewed-context");
  expect(result.forbidden).toBe(403);
  expect(result.forbiddenCalled).toBe(false);
});
