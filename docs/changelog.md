# Changelog

The release history lives in `ui/src/lib/releases.js`. Append an entry with the next integer version, an ISO calendar date, a short title and user-facing changes when a batch is ready to release. Never reuse a version. The highest entry is the running product version; Git hashes remain source identifiers rather than user-facing release numbers. Version 1 starts the history with the existing stable baseline; it does not assign fictional dates or release numbers to earlier commits. Experimental or unfinished work is not a release note.

On app open/refresh, versions above this browser's last acknowledged version appear in a modal. Closing it acknowledges the current version. Settings always offers the full history and current version. The one localStorage value is browser/device-local; no cookies, backend or account sync are needed. A storage failure leaves the app usable and acknowledgement lasts for that visit.

| State / event | Result |
| --- | --- |
| Closed / app ready with unseen versions | Show only versions greater than last acknowledged |
| Closed / Settings What's new | Show complete history |
| New updates / View full changelog | Show complete history |
| Either open view / Got it, Close or Escape | Store max(current version, previously acknowledged); return focus |
| Closed / refresh after acknowledgement | Stay closed until a higher version ships |

The native modal owns focus and makes the underlying app inert while open. This feature has no polling, dependencies or connection to unfinished navigation changes.
