# Reviewer discussion detail — 2026-11-04

## Scope

Simplify the clarification/conflict detail inside the paper reading modal, following the calmer My Work card design. Preserve screening workflow, APIs, project permissions, revision history and chat persistence.

## Implementation

- One round status remains in the round heading. Replaced the additional colored issue banner and duplicate badge with a short contextual explanation.
- Two reviewer ballots use neutral rows with names, a smaller revision/time line, a semantic decision badge and their rationale. Short reasons are shown fully. Long reasons use two lines with an accessible, named detail link; multiple source fields remain available in the detail dialog.
- Full ballot details use plain source sections. The dialog is capped at 85dvh; only the content scrolls, keeping the heading and close controls visible. React text rendering protects reviewer input from HTML execution. Hidden reviews and an already-open detail dialog are suppressed when disclosure permission changes.
- Discussion has one header combining its message count and connection state. Uses existing ProjectChatMessage/ProjectChatComposer and existing query, polling, SSE, pagination, draft, keyboard and permission behavior. Scoped Screening CSS does not change team/mentor chat.
- Replaced the colored action card, equality label and long tip with the two existing permitted actions and one revision-history note. No message quota, new invitation step or third reviewer ballot.

## Verification

- **142 tests passed across 5 suites:** conflict resolution (29), discussion (18), workspace (43), adjudication (26), status (26).
- Tests exercise actual paper-modal actions, reviewer A/B requests, permission revocation, fulltext/RQ reassessment, private/closed discussion, chat order/polling/SSE/pagination, XSS-safe content, long-reason expansion and disclosure changes.
- Production TypeScript/build and bundle-budget checks passed.
- CUA used actual ReadingPaperModal and components with isolated fixture APIs: sent a message as A, loaded the same 6 messages as B and verified the latest A message was not marked as B's own.
- At 390px: document width 375px; reviewer rows 311px with no horizontal overflow. Main actions stack at full width. Tested light and dark themes.
- Stress case: a 22,059-character rationale occupied 40px in the row and remained available in the dialog. Dialog height 716px in an 844px viewport, body height 517px with its own scroll area and fixed close controls.
- Frontend copied into the existing localhost web container, retaining old hashed assets. Published index matches build; all 8 entry assets return HTTP 200.

Authenticated private Project behavior was not exercised through the signed-out browser session. UI screenshots use fixture data, with production components. No backend or database changes, commit or push in this task.

## Screenshots

- [Round and ballots](2026-11-04-review-detail-overview.png)
- [Chat and actions](2026-11-04-review-detail-chat.png)
- [Mobile](2026-11-04-review-detail-mobile.png)
- [Long rationale](2026-11-04-review-detail-long-reason.png)
- [Dark theme](2026-11-04-review-detail-dark.png)
