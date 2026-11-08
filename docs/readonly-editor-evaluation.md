# Bounded read-only editor evaluation

2026-11-08 · Beads prv-9sn.1. This is an isolated Svelte comparison, not a replacement of the production diff.

## Decision

Adopt Monaco's read-only editor core lazily for investigation source views once the repository providers are connected. Retain the native PR diff and all GitHub review controls. Keep the current source renderer available during integration. Do not ship Monaco's browser TypeScript worker as a second repository index: the existing server worker owns immutable Git revisions and project resolution. The spike demonstrates the editor APIs and separates editor readiness from analysis support; production adoption needs server-backed providers and an explicit opt-in boundary.

## Working example

Pinned development dependency: monaco-editor 0.57.0, MIT. From ui/, build with `node node_modules/vite/bin/vite.js build --config vite.editor-spike.config.js`, then preview with the same command's `preview` subcommand. Port 4902, `/editor-spike.html`; the existing safe live backend runs at 4900. The spike entry imports no application shell, poll loop or GitHub mutation UI. It fetches the exact immutable public Storybook source used by the current renderer. The standard production build never imports this entry.

`ReadonlyEditorSpike.svelte` places the actual WorkspaceSource renderer beside the lazy editor. `monacoReadonlySpike.js` owns the model, editor and selection listener and disposes them together. Model URIs include repo/revision/path. Recreating or switching revision leaves zero old models, then one live model; Dispose leaves zero. Read-only and DOM read-only are both enabled. Native keyboard selection recovered the entire isValidIdentifier declaration; attempted typing displayed Cannot edit in read-only editor and the source stayed identical.

The TypeScript worker in the isolated spike returned 69 top-level navigation items, a 189-item symbol picker including nested entries, and `const isValidIdentifier: (name: string, reserved?: boolean) => boolean`. Selection, Home/Shift-End, Escape and the focused symbol picker worked. This built-in analysis only sees supplied models; it did not establish cross-repository semantic navigation. Svelte files need server-backed analysis; Monaco itself does not resolve the Git mirror.

## Measurements and limits

Built Vite preview, same pinned 22,227-byte / 598-line source, existing mirror, loopback, one browser. Current source first rows: 198.60 ms in the first trial. Monaco first module/model/two-frame readiness: 433.60 ms in that trial; warm recreations 272.10 and 59.40 ms. Final rebuilt spike: first module/model readiness 452.70 ms, then revision switch 124.00 ms and two recreations 46.60 / 46.60 ms. Browser HTTP caches may be warm; none is a cold machine or clone measurement. The current-viewer row mark excludes syntax-color readiness, and Monaco's mark excludes TypeScript worker analysis readiness, so these are observation points rather than a blanket performance ranking. A separate final outline request took 9.10 ms after the editor had had time to initialize analysis.

Selected emitted assets (bytes / gzip bytes): editor core 2,738,975 / 695,149; editor worker 303,397 / 92,104; TypeScript worker 6,918,683 / 1,482,770; TS mode 811,638 / 204,570; adapter 2,775 / 1,303. These five files total 10,775,468 / 2,475,896 bytes, excluding CSS/fonts/shared chunks. Core-only server-backed adoption can avoid the browser TS payload. The npm package's unpacked size is 101,674,083 bytes; installed size is not network payload.

## VS Code comparison

Microsoft's actual GitHub Pull Requests and Issues extension is installed locally (0.176.1 among installed versions). A fresh reference window opened the actual cockpit checkout through File → Open Recent, then GitHub → All Open → the dogfood PR #1. Its overview showed the real commit list; Open Changes loaded the 103-file review. Folder expansion exposed file-level Viewed controls, and selecting astGitSource.ts opened its read-only PR code without checking out the PR branch. Main remained checked out; no Viewed, comment, review or branch change was made.

At astGitSource.ts:1:12, F12 in the pinned PR view reported No definition found for showFile. Explicit Open File opened the working checkout's file; the same F12 reached gitShow.ts:17 through the local language service. Back and Alt-F12 opened a temporary Peek containing that declaration; Escape dismissed it. This is evidence for the sampled virtual PR file and local project, not a claim about every extension/provider configuration. The actual review showed explicit Open File, previous/next change and split controls. Native screenshots record the PR view and populated Peek.

This completes the previously unavailable live comparison. It supports adopting the bounded editor core for source interaction while retaining a distinct pinned repository provider and explicit review/exploration boundary. A browser editor alone does not inherit the local VS Code language-service context.
The authoritative workflow comparison is [VS Code's GitHub guide](https://code.visualstudio.com/docs/sourcecontrol/github): its checked-out Review Mode couples PR changes with a local project, Open File and the local language service, then submits the review through the PR description. We adopt the distinction between changed-code review and full repository exploration without requiring a checkout for each revision. [VS Code navigation](https://code.visualstudio.com/docs/editing/editingevolved) distinguishes temporary Peek, normal navigation and references; these map to Inspect, Open and persistent grouped results in prview. The [Monaco FAQ](https://github.com/microsoft/monaco-editor#faq) explicitly states VS Code extensions do not run in Monaco. Monaco supplies neither the workbench nor the GitHub PR extension, authentication, review threads, Viewed sync or our repository indexing.

Screenshots and browser-read measurement JSON are saved with the chat outputs. The spike remains isolated while investigation actors and repository providers are implemented.
