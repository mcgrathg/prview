// Runs the synchronous LanguageService and Git object reads off the HTTP event
// loop. One request at a time; the client (astResolve.ts) serializes.
import { definitionsAt } from "./tsService.ts";
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
}

declare var self: Worker;

self.onmessage = (event: MessageEvent<AstRequest>) => {
  const { id, checkout, repo, sha, fromPath, symbol, line, character } = event.data;
  let defs = null;
  try {
    defs = definitionsAt(
      {
        key: `${repo}\n${sha}`,
        paths: () => lsTree(checkout, repo, sha),
        readFile: astGitSource(checkout, sha),
      },
      fromPath,
      symbol,
      line,
      character,
    );
  } catch (err) {
    console.error("ast definition failed:", err);
  }
  postMessage({ id, defs });
};
