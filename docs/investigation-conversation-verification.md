# Optional investigation conversations

Ask about code is an explicitly opened drawer inside the opt-in investigation workspace. Each PR/question owns a browser-local conversation key, independent of shareable URL state and private Findings. It reuses Cockpit’s Quick Generate configuration, model discovery and fixed provider transport. No new provider, credentials, background agent or Codex chat is created.

Opening checks local provider configuration. When keys are absent, the panel explains the real prerequisite, disables Ask, links existing settings and retains a private question draft. A configured provider requires a listed model. Only explicit Ask sends code: at most four captured pinned source locations, up to32 lines/8KiB each, the question and the last six turns (earlier answers shortened to6000 characters). Findings and review drafts are excluded. The context list and provider are visible before sending. This is evidence-assisted conversation, not an autonomous repository agent; discovering new files remains an explicit browsing action.

Answers render as plain text. Only [S1:L12] or [S2:L4-L8] references validated inside that answer’s supplied pinned excerpts become source buttons. Model-provided URLs and commands have no executable UI action. Save as finding labels the answer AI-assisted and unverified, retains cited source excerpts, and uses the existing private notebook. Publication remains the native explicit review action.

| Event | State/lifetime |
| --- | --- |
| Open drawer | Create the current question’s session; read local provider metadata |
| DRAFT | Save current private question synchronously |
| ASK | Capture provider/model/locations and invoke source reads plus generation |
| DELTA | Update only the matching active request’s transient text |
| Complete | Save bounded answer and immutable source context in that question |
| CANCEL / close / question switch / PR teardown | Abort transport; discard late output; retain question draft |
| Reload | Restore completed turns and draft; no automatic provider request |
| Invalid/foreign stored data or storage failure | Keep original bytes; new work stays in memory with notice |

Conversation has a40-turn creation limit; existing saved turns are retained. Per-question writes merge independently identified completed turns already on disk. This does not provide live cross-tab transcript synchronization. Local drafts remain local to the browser; no account sync is implied.

## Evidence and remaining integration prerequisite

The live local backend returned zero configured providers. No external AI request was sent. The actual UI showed the setup message and disabled Ask, and two questions retained distinct drafts across switching and reload. Their private question text was absent from the URL. `prview-investigation-conversation.png` records the prerequisite state.

Focused tests inject a provider to prove independent answer/context retention, exact source revision, bounded safe citations, cancellation/teardown rejecting late output, storage quarantine and cross-repository isolation. These verify the adapter and state model, not a live model’s response quality. A real provider key/model remains necessary to exercise a live answer; the app does not present test answers as real output. Existing transport tests cover provider behavior separately.
