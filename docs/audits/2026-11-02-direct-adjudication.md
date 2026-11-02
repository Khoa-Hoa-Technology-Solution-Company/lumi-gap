# Direct adjudication after balanced reviewer statements

## Workflow and UI

- A/B retain their original ballots and discussion. Either reviewer can request the same active case; project transaction locks and partial unique indexes prevent duplicate cases and active assignments.
- Both reviewers have their own statement editor, or can use their recorded ballot. The common deadline defaults to 48 hours. Supplement versions are retained; the other side's text stays private until the packet is ready. Silence never becomes agreement.
- Both completed statements, or deadline expiry, lock the packet. An eligible person is assigned directly, without accept/decline. Starting review is optional and never a prerequisite for a valid conclusion.
- Priority follows Project policy: predesignated, primary mentor, secondary mentor, independent member, independent Owner. A/B and the proposer are excluded. Equal-priority candidates require an independent coordinator's reasoned selection; no arbitrary random selection.
- Default screen shows adjudicator identity/status and two opinions. Sources, criteria, original ballots, previous discussion, assignment history and conflict reports use disclosures.
- A conclusion requires a decision, reason and source basis. It is a separate record, never a third reviewer ballot. A/B see adjudicator name/role, outcome, reason, source and timestamp. Reopening requires a reason and preserves the old case/decision linkage.
- Missing information stays unresolved for binary screening. Status is reflected in My Work, proposals and library.
- The notification worker checks deadlines every minute. Default reminders are 72 hours, coordinator followup 168 hours, configurable through Project policy and frozen into round snapshots. It never automatically decides or replaces the assignee on a timer.

## Database and compatibility

Migration `20261102000600_screening_direct_adjudication` adds packet lock time, followup policy fields and statuses. Existing invitations remain in history; active historical invitations become direct assignments only once the packet is ready. Historical acceptance responses and reasons are retained.

No extraction, ballot, statement, invitation or decision history was deleted. No production Project/paper identifier was hardcoded. Existing packet/source access checks remain enforced by the backend.

## Verification

- Shared types build, backend production build, web TypeScript build and isolated Vite production build passed.
- Backend PostgreSQL runtime audit: 4/4 passed.
- Frontend: 43/43 passed across case controls, conflict resolution and adjudication.
- Broad isolated PostgreSQL regression: 168/174 passed initially. Six failures identified stale completed-task deadlines and missing independent review history; these were fixed. A targeted rerun passed 15 tests, including all six failures, HTTP authorization/validation, concurrent sealed opinions, legacy invitations, mentor priority and idempotent reminders (159 unrelated tests skipped).
- A subsequent full run was interrupted by Docker engine HTTP 500 and PostgreSQL/Redis unavailability during local service replacement. It is not an all-green full-suite result.
- Bundle budget passed: 88 KiB entry, 567.4 KiB initial graph.
- Desktop and 412px fixture screenshots: `2026-11-02-direct-adjudication-reviewer.jpg`, `2026-11-02-direct-adjudication-assigned.jpg`, `2026-11-02-direct-adjudication-mobile.jpg`. Fixture data is explicitly labeled; no real statement or decision was submitted.

## Local runtime

Migration deployed successfully to the local application PostgreSQL database. Before migration: 11 reviewer records, 3 statement records, 0 final decisions.

Both local runtime images built successfully, including updated backend source for the notification worker's normal `tsx` command. Container replacement was interrupted by Docker Desktop engine HTTP 500. A restart of the observed Docker processes and `docker-desktop` WSL distribution exposed a stale `C:\Users\tdinh\AppData\Local\Docker\run\dockerInference` socket (`Archive, ReparsePoint`, zero bytes). Docker logs report that the Inference manager cannot remove this socket, then abort startup. Automatic approval review rejected deleting that temporary socket. User assistance was requested. No data directory or volume was removed, and final live verification remains pending until Docker is restored.

Followup: Docker was restored with user assistance. The backend, web and notification worker were started successfully. The subsequent missing-opinion reminder was deployed at 22:36 (UTC+7); see `2026-11-02-adjudication-reminder.md` for successful readiness, artifact integrity and final PostgreSQL test evidence. Authenticated live UI verification remains limited by the browser's unsigned session; fixtures were verified without submitting real opinions.

## Practical limits

Expertise follows accepted Project mentorship and Project permissions/allowlists; no automated expertise scoring was introduced. Reminders use existing in-app durable notifications. Historical Project policies remain snapshots; changes configure new rounds. No commit or push was performed.
