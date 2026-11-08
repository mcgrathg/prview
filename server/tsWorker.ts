// Runs the synchronous LanguageService and Git object reads off the HTTP event
// loop. One request at a time; the client (astResolve.ts) serializes.
import { definitionsAt, referencesAt, type AstReferences } from "./tsService.ts";
import { lsTree } from "./gitShow.ts";
import { astGitSource } from "./astGitSource.ts";

export interface AstRequest {
  id: number;
  checkout: string;
  repo: string;
  sha: string;
  fromPath: string;
  symbol: string;
  line: number;
  character: number;
  kind?: "references";
  candidatePaths?: string[];
}

export interface AstResponse {
  id: number;
  defs?: ReturnType<typeof definitionsAt>;
  references?: AstReferences | null;
}

declare var self: Worker;

self.onmessage = (event: MessageEvent<AstRequest>) => {
  const { id, checkout, repo, sha, fromPath, symbol, line, character, kind, candidatePaths = [] } = event.data;
  const source = { key: `${repo}\n${sha}`, paths: () => lsTree(checkout, repo, sha), readFile: astGitSource(checkout, sha) };
  try {
    if (kind === "references") postMessage({ id, references: referencesAt(source, fromPath, symbol, line, character, candidatePaths) });
    else postMessage({ id, defs: definitionsAt(source, fromPath, symbol, line, character) });
  } catch (err) {
    console.error("ast lookup failed:", err);
    postMessage(kind === "references" ? { id, references: null } : { id, defs: null });
  }
};
