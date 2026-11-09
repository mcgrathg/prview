# Default review workspace

Enhanced prview is the default for ordinary application and PR URLs. The app rail and PR detail use one `reviewMode` policy. No browser preference or URL rewrite is involved.

| Document query | Workspace |
| --- | --- |
| None, or existing `?organize=1` | Enhanced review |
| `?legacy=1` | Original Cockpit layout |
| `?investigate=1` | Enhanced review with repository investigations |
| `?legacy=1&investigate=1` | Original layout; investigations disabled |

Only the exact `legacy=1` value selects the fallback. The former `organize` flag is unnecessary, including old `organize=0` links. Flags belong before the `#` route; change them by loading the document URL.

| Event | Mode behavior |
| --- | --- |
| Open or reload a document | Derive mode from its query |
| Select a file, change layout, use Back/Forward within the review | Preserve the document query and restore the existing review snapshot |
| Load a legacy or investigation URL | Derive the requested mode on that document load |

Verification: 36 focused tests / 274 assertions cover mode precedence, route compatibility, navigation transitions, history and feature versions. A tracked-source production build checks both consumers import the published module. Live browser checks on the 103-file dogfood PR confirmed plain and older organization links share enhanced controls, legacy takes precedence over both flags, ordinary review has no investigation workspace, and file selection plus layout survive Back/Forward and reload. No GitHub writes were performed.
