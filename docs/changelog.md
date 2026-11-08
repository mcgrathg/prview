# Feature updates

When a user-facing feature is complete, run `bun -e 'console.log(Date.now())'` once and append the returned fixed integer as its version in `ui/src/lib/featureUpdates.js`. Include a short explanation and a how-to-try note in the same completion commit. Versions are increasing millisecond timestamps, not counters or hashes. Never calculate a feature version at runtime or during an ordinary build. Internal checkpoints and unfinished experiments do not add feature entries.

The latest feature timestamp identifies the product version shown in Settings and the history modal. A separate build identifier may describe a build, but never drives unread announcements. The initial baseline uses the original changelog commit's timestamp so existing history remains dated truthfully.

What’s new is permanently available in app navigation and Settings. A small unread dot compares the latest feature timestamp with one browser-local last-seen value. Opening the notes acknowledges the latest entry and shows all feature notes newest first. Startup, refresh and rebuild never open the modal automatically. Read progress from the original numbered history migrates to its baseline timestamp; older tabs cannot lower newer progress. No backend or account sync is involved.

| State / event | Result |
| --- | --- |
| Closed / open, refresh or rebuild | Stay closed; expose an unread dot if feature timestamps are newer |
| Closed / What’s new | Open latest history; acknowledge the newest fixed feature timestamp |
| Open / Close, Got it or Escape | Close and restore focus |
| Either / another tab updates read progress | Refresh the unread indicator |

The native modal owns focus and makes the background inert while open. Storage failure leaves the app usable; read progress lasts for that visit.
