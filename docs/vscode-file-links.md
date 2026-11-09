# Open a local file in VS Code

Enhanced diff headers keep the VS Code link in File actions (⋯); source toolbars also expose it. On first use, enter the repository’s absolute local checkout folder. The link then opens that local file; source views include their displayed line. The adjacent ⋯ edits the folder. This opens the working tree and does not retrieve the pinned revision, change branches, or require an extension/server endpoint. Local files and line numbers can differ from the PR.

The URI uses [VS Code’s supported file format](https://code.visualstudio.com/docs/configure/command-line#_opening-vs-code-with-urls). Relative paths and positions are validated; path components encode spaces, Unicode, percent signs and URL delimiters. Explicit mappings remain in browser storage under `prview:vscode-root:v1:<repo>` and never enter review URLs or server requests.

| Event | Result |
| --- | --- |
| First use / ⋯ | Open a native folder dialog with an editable draft |
| Use folder | Validate and update the shared per-repository browser preference |
| Close / Escape | Close and restore focus; unsaved folder draft is discarded |
| Configured link | Hand off the file/line to the installed VS Code protocol handler |
| Reload | Restore the saved mapping; storage failure retains a session-only choice with a notice |

Verification:28 focused tests/216 assertions plus production and tracked-source builds. Browser checks confirmed first-use setup, shared file controls, persistence after reload, Escape dismissal, and an actual source-view URI ending `analysis.ts:13:1`. No branch or file changes occurred. Browser automation rejected the external-app navigation, so native VS Code launch remains a manual check; no workaround was attempted. Windows drive-root URI construction is covered by a regression, without claiming a Windows launch test.
