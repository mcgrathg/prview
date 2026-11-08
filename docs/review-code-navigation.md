# Contextual review code — 2026-11-08

With `?organize=1`, ordinary clicks on symbols and import paths open a small symbol card. The review file, URL and panes stay in place. Definition expands a real source excerpt; Usages opens the existing reference search. Open file and Open beside deliberately navigate using the captured immutable source revision. Cmd/Ctrl-click retains direct definition navigation. The upstream default retains modifier-only navigation.

The card uses the shared lookup state machine: idle → loading → ready, empty, unavailable or error. Superseding a request, closing the card, navigation or teardown aborts its work. Lookup completion only changes the card; it cannot navigate. Ambiguous candidates require an explicit choice, unavailable excerpts retain the real declaration, and missing definitions remain explicit. No signatures or explanations are generated.

Double-click selects a word. The second click and selection changes dismiss and cancel inspection, so the first click cannot later pull the user away. Drag selection remains native. Right-click offers Inspect symbol, Open definition file and Find references. Escape closes the card first; keyboard-focused cards restore focus to their origin. Hover only underlines tokens and makes no request. Valid member names such as `cache.get` and `cache.set` are actionable; keyword/accessor syntax remains filtered.

Explicit navigation records the exact caller line before pushing the destination. A docked jump changes its originating pane; Open beside keeps the caller. Original-side lookups use the comparison base, and their return anchor preserves the original comparison. Cards are also shared by the opt-in investigation source panes; those actions stay inside the investigation actor.

The server verifies full import strings against their exact source position and import/export/require context. Resolution remains limited by supported languages, available source and repository configuration; it does not install dependencies or execute the reviewed repository.

## Verification

46 focused tests / 201 assertions passed across symbol/context/lookup, review navigation/routes, docking and investigation actors. They cover immutable head/original capture, real bounded excerpts, unavailable source, ambiguity, superseded and canceled requests, keyword/member extraction and selection/modifier gestures. Browser checks on the pinned dogfood PR resolved `ImportFact` in a diff without changing the URL; Open beside retained its diff alongside source. Source import inspection kept the panes and URL unchanged. Double-click selected `ImportFact` with no card or navigation. Native drag selected an import line without opening a card. The actual `measuredFiles.get` call at DiffView.svelte:694 resolved to keyedState.svelte.js:40 only inside the card; explicit Open file and browser Back restored the caller. Original source inspection showed the pinned `5fd8c3b` revision. No GitHub state was written.

The card does not replace the full source browser, repository search or references panel. Those remain explicit destinations.
