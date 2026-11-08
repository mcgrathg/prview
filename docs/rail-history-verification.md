# History controls in navigation — 2026-11-08

Enhanced mode mounts one HistoryNav inside app navigation. Collapsed navigation starts with Home, Back and Forward; pinned navigation lays out the same owner horizontally beside Collapse. The dedicated history row and its 42px browser padding are removed. The Electron shell retains its existing drag clearance; shell rendering was not part of this browser proof. The default upstream layout is unchanged.

History controls sit outside the sidebar interaction boundary. Pointer/focus entry there does not send preview-opening events. Moving into the rest of the rail still previews navigation. Collapse/pin persistence and the independent file sidebar retain their existing actor. Home opens Inbox, so the duplicate collapsed Inbox shortcut is removed. Back only says “Back to inbox” when it actually needs that fallback.

Browser checks on the dogfood PR showed one history owner, zero main history rows and 0px top padding. Home opened Inbox, Back returned to the pinned file/line, Forward returned to Inbox, and native browser Back restored the review. History clicks and Tab focus left the sidebar closed. Pinned controls stayed horizontal at x8/39/70; disabled positions remained reserved. At 620px width the pinned controls aligned inside the floating panel, preview opening and Escape worked, and the viewport and collapsed preference were restored afterward.

Before: the symbol-card-before screenshot retains the old top row. After: rail-history-collapsed and rail-history-pinned screenshots show the reclaimed review space. No GitHub state was changed.
