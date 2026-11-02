# Reviewer discussion consistency and shared chat UI

## Scope

Paper reading modal, discussion tab, and conflict resolution. No database migration or history deletion. No live messages or adjudication actions sent during QA. Concurrent changes added SSE during implementation; the final integration retains and hardens that capability.

## Causes found

- Discussion fetched page one on mount and after the local sender submitted. The other reviewer had no interval refresh and could retain a stale list.
- Conflict view counted `items.length` (at most 20) and rendered the API's newest-first order directly.
- Collaborative rounds selected their layout using individual action capabilities. The same conflict could therefore use different interfaces for different viewers.
- Auth serializes migrated users with `publicDatabaseId(user)`, whereas screening audits and round membership contain database UUIDs. Comparing these IDs directly lost the own-message and own-ballot indicators. Identity now comes from the server's `myReview` or `myAssignmentId` mapping, with the session ID as fallback. This is presentation only; backend permissions remain authoritative.
- Final deployed inspection exposed an integration regression: `roundView` omitted the adjudication case summary and reassessment capability. It now returns the shared case status, invitation identity/role, common deadline, readiness and action capabilities without exposing either reviewer's private statement. Both reviewers receive identical case summaries; no discussion-message quota gates requests.

## Implementation

- Extracted `ProjectChatMessage` and `ProjectChatComposer` from team chat and reused them for reviewer discussion. Team chat retains its existing API, SSE, receipts, and delete permissions.
- Both conflict and ordinary round views render the same `RoundHistory` / `ScreeningDiscussion` components. Round state determines the shared layout; personal permissions determine available actions.
- Actor-scoped infinite query, SSE invalidation hints and 2.5-second foreground polling while the discussion tab is open and the round is active, focus/reconnect refresh, server total count, and older-message pagination.
- Chronological message display, ID deduplication across overlapping pages, day separators, own-message bubbles, and author names. Redacted records stay redacted; messages render as React text.
- Existing chat scroll hook follows the latest message only while the reader is at the end. Older-page loading preserves scroll position. A jump button appears when reading older messages.
- Shared multiline composer supports Enter, Shift+Enter, IME, touch input, 2,000-character limit, backend minimum of three trimmed characters, and idempotent retries. Failed sends preserve the draft. History-tab switching preserves it; actor/project/round changes reset the local component.
- Read-only, blinded, inactive, finalized, and opened-adjudication states have no composer. Opened cases direct reviewers to their separate statements in the existing dossier.

- SSE sends only invalidation metadata after the command transaction commits. It never transports review text or comments. Stream delivery and heartbeat recheck the current session and project access; revoked or expired access closes the connection. The browser reconnects after EOF/disconnection and continues authorized polling. Streams pause when the history tab is selected. Pending send feedback stays in the shared composer to avoid duplicate optimistic/persisted bubbles.

## Verification

Vitest coverage across six suites: discussion (14), conflict modal (16), chat usability (13), screening workspace (25), screening case (6), adjudication (16). All 90 frontend tests passed in one final run. Four backend stream tests passed (round isolation/cleanup, initial access denial, access revoked during delivery, session expiry at heartbeat). Four targeted PostgreSQL tests passed across the initial run and focused rerun: history separation, committed/idempotent content-free events, no follow-up adjudicator chat, and hidden-review privacy. The first PostgreSQL run had one incorrect test expectation (403 instead of the existing outsider 404); the assertion was corrected and the affected test rerun successfully. Backend PostgreSQL runtime audit: 4/4 passed.

Covered two separate query clients, received-message polling, ownership from both sides, over-20-message pagination, overlap deduplication, chronological order, failed-send retry keys, multiline/IME/mobile input, draft retention, account isolation, capability-independent layout, redaction, and composer restrictions. Existing adjudication and team chat regressions passed.

Production build includes TypeScript checking. Visual QA used the real `ReadingPaperModal` with an isolated API fixture at desktop and 412px widths, plus read-only inspection of the deployed project modal. Fixture messages are stored only in local fixture storage; `/api/` requests are denied by the fixture server.

Final integration rerun: 90/90 frontend tests, 4/4 SSE tests and 3/3 targeted PostgreSQL case regressions passed (20 other case tests skipped by name filter). PostgreSQL checks exercise both reviewers requesting without discussion, identical case summaries on both sides, and the legacy collaborative case path. Web and backend production builds passed again. Logs: `2026-11-02-reviewer-discussion-{web-tests,events,case-regression,web-build,backend-build}.log`.

## Operational notes

The web build is packaged into the existing nginx runtime and served on port 8080. Backend dist is packaged into the existing backend runtime for the new event endpoint; no application database migration was needed. Final deployment verification compares the served index with `apps/web/dist/index.html` and checks backend `/ready` separately.

Compose reported backend/web healthy after replacement, then Docker engine returned HTTP 500 and both application ports timed out. Recovery stopped the exact Docker Desktop/backend/build processes observed in this session, terminated only the `docker-desktop` WSL distribution, and restarted Docker Desktop hidden. No volumes, application data, other WSL distributions, or Docker memory settings were changed.

After recovery, final backend/web images were replaced successfully at 15:04 on 2026-11-02 (UTC+7). `/ready` confirms PostgreSQL and Redis healthy; port 8080 serves the exact current `apps/web/dist/index.html`. The deployed `screening-context.js` SHA-256 matches the host build (`54a853617bc47529316a61c6f9a6a51a487eb3c3308051b9205d9d3b6fba13fb`).

Final read-only browser verification confirms six chronological messages, own-author attribution, a connected SSE status, the read-only discussion notice, reassessment action and the invited adjudicator's name/role/common deadline. Screenshot: [live final UI](2026-11-02-review-discussion-live-final.jpg).

SSE is an in-process invalidation channel; polling remains the fallback, including for events emitted by another backend instance. A background browser can show old content until it receives focus again. Live two-account sending was tested with independent query clients and fixture data, not by posting into real reviewer history.
