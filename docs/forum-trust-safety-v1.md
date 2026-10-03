# Forum Trust & Safety V1

The forum moderation implementation uses the existing `ContentReport`,
`ForumModerationAction`, `AuditLog`, notification, community membership and
PostgreSQL/Redis infrastructure. Moderation is limited to safety and community
organization; it does not make decisions about scientific truth or modify
Research Gap evidence state.

The following settings are deliberately configurable and require confirmation
from FPT policy/legal owners before production launch:

- `FORUM_APPEAL_SUBMISSION_WINDOW_DAYS`
- `FORUM_MODERATION_CLAIM_LEASE_MINUTES`
- `FORUM_MODERATION_EVIDENCE_RETENTION_DAYS`
- `FORUM_AUDIT_METADATA_RETENTION_DAYS`
- `FORUM_MAX_PINNED_THREADS_PER_COMMUNITY`
- `FORUM_COPYRIGHT_EMAIL_VERIFICATION_MINUTES`
- `FORUM_RATE_LIMIT_UNVERIFIED`
- `FORUM_RATE_LIMIT_VERIFIED`
- `FORUM_COPYRIGHT_PUBLIC_RATE_LIMIT`
- `FORUM_ALLOW_SOLE_ADMIN_APPEAL_REVIEW`

Copyright intake stores bounded text and URLs only. Forum posts do not accept
arbitrary file uploads. Policy pages and final retention/legal durations remain
operational product work and are not invented in this implementation.

## Completed moderation workflows

- Admin Trust & Safety includes report claims and reassignment, reasoned
  content decisions, appeal review, restriction revocation and verified
  copyright-claim review. Response links retain the parent discussion.
- Signed-in users can review their affected decisions and submit an appeal at
  `/forum/moderation`. Public copyright intake is at `/forum/copyright`; the
  report dialog carries the exact content identifier into this form.
- Community report decisions use the atomic report-action endpoint after
  claiming. Stale versions, expired leases and resolved reports are rejected.
- Decisions on escalated reports remain restricted to Admin after a claim changes status.
  Posting restrictions respect community scope; private reports require access.
- Appeals retain the prior content state and restore only the affected target.
  Later moderation prevents an unsafe automatic reversal. Counters and
  activity update in the same transaction, with a compensating audit action.
- Migrations `20261003000100_forum_appeal_state` and
  `20261003000200_forum_moderation_targets` store snapshots and allow explicit
  canonical targets alongside report/discussion context. Legacy target checks
  remain supported for old records.
- Verification: 68 backend forum tests and 157 frontend forum/home tests pass;
  TypeScript and the web production build pass. New tests cover concurrency,
  scope, response links, appeals, duplicate counts and moved-report scope.

## Follow-up logic audit — 2026-10-03

- Community moderators can escalate legacy own, peer and Admin reports without
  gaining permission to decide those reports. New reports about Admin or active
  community moderators route directly to Admin. Escalation notifies Admin and
  tells the reporter that review is pending. The community queue exposes an
  escalation action and excludes Admin-only reports even after claiming.
- The legacy review endpoint enforces target scope and a live moderator claim;
  an atomic version/lease condition rejects stale decisions.
- Legacy response queue entries resolve the parent discussion and public
  response identifier. Community links include the response anchor.
- Copyright verification consumes the token atomically. React Query deduplicates
  the one-time request in StrictMode and preserves the result across remounts.
  The page handles missing/stale tokens and uses translated copy. Concurrent
  requests create only one verification audit event and Admin notification.
- Report decision notes accept 2,000 characters, matching the API; appeal and
  copyright decision notes retain their 5,000-character allowance.
- Author-deleted content cannot be restored or converted into a moderation
  removal. Admin restoration of removed content requires the recorded removal
  and its matching moderation version.
- Response decisions snapshot acceptance under response → thread locks.
  Overturned appeals restore an accepted answer only for a question with no
  newly accepted answer. Counters and activity remain transactional.
- Direct pins, queue pins and appeal restores share thread → pin-scope locking
  and capacity checks, including discussions outside communities. Moves lock
  communities in a stable order and reject pinned moves into a full scope.
- Content is locked before reports. This avoids a move/review lock cycle and
  keeps legacy response reports in the new community. Report creation locks
  content before taking its snapshot so a concurrent move cannot leave an
  active report in an outdated community.

Verification: backend Forum 68/68, frontend Forum/Home 157/157; backend/web
TypeScript, targeted frontend ESLint and production web build pass. Initial
bundle graph is 862.3 KiB against the 900 KiB budget. Live browser checks cover
the Vietnamese missing-token state and its return-to-Forum link. Privileged
decisions and concurrent database behavior are covered with isolated test
fixtures. Real email delivery was mocked in those tests.
