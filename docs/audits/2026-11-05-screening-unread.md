# Screening discussion unread notifications

## Behavior

- A saved discussion message notifies the other active, submitted reviewer who still belongs to the project.
- Notification creation shares the authorized comment transaction and idempotency key; retries do not duplicate notifications.
- Notifications contain the sender and paper title, without the private message body.
- Paper cards show an unread link; the discussion tab shows its unread count. The bell opens the exact paper, round and discussion section.
- Clicking the notification does not immediately acknowledge it. The visible discussion acknowledges only loaded messages while following the latest messages and the browser document is visible.
- Notification queries are scoped to the authenticated account. Failed acknowledgements preserve unread state.
- Existing notification storage and read APIs are reused. No migration or historical notification backfill.
- Outside the open discussion, notifications refresh every 30 seconds and on window focus. The open discussion also invalidates notifications on its existing SSE events.

## Verification

- Shared types build: passed.
- Backend build: passed, including 4 PostgreSQL runtime audit tests.
- Web production build and bundle budget check: passed. Existing large chunk warnings remain.
- Focused web suites: 136 tests passed (unread state, discussion, conflict resolution, paper cards, notification destinations and navigation).
- Focused PostgreSQL persistence suites: 2 tests passed, including recipient permissions, idempotent concurrent requests, payload privacy, cross-user read rejection and removed-member exclusion.
- Real component fixture verified at desktop and 390px width. Two unread notifications remained on the ballot tab and cleared after opening the loaded conversation. Fixture data only; no chat was sent to real users during visual verification.
- Local backend modules and web build published with backups. Backend health and readiness: HTTP 200. Web root and 8 entry assets: HTTP 200. Unauthenticated notifications endpoint: HTTP 401 as expected.

## Screenshots

- `2026-11-05-screening-unread-desktop.png`: unread tab count before opening the discussion (fixture).
- `2026-11-05-screening-unread-mobile.png`: loaded discussion at 390px width (fixture).

## Limits

- Notifications are created for new messages after this update; existing discussion history remains available without retroactive alerts.
- Live two-account UI verification was not performed; authorization and notification lifecycle were verified through the PostgreSQL tests and the isolated component fixture.
