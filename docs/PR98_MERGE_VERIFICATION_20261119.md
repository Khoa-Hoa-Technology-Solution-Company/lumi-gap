# PR #98 merge verification — 2026-11-19

Merged `origin/main` at `59f3fe4b456c7d7da354a8d0a413ddcb2f77faf6`
into `feat/mentor-workflow-single-sidebar-20261116`, previously at `c0b33881`.
Resolved 38 conflicting paths without rewriting either branch's history.

## Integration decisions

- Keep the sender/recipient invitation viewer, frozen dossier, direct invitation
  form, role consent and viewport-bounded popup from the feature branch. Preserve
  main's applicant pool, matching evidence and research classification. Selecting
  an applicant carries its ID and version through the existing invitation form
  and consent transaction; it does not create another invitation system.
- Preserve private project creation, the feature branch's two-step team setup,
  and optional structured research classification. Recover older draft fields
  without restoring public visibility.
- New screening rounds use main's server-provided consensus contract. Historical
  rounds without that contract retain the original joint-agreement UI in
  `screening-legacy-discussion.tsx`. The small public component selects the
  appropriate renderer; backend authorization remains authoritative. Historical
  arbitration remains read-only and cannot assign any mentor automatically.
- Keep manuscript-scoped contribution attribution and main's pending-review and
  evidence-fingerprint features. Fingerprints now support the submission,
  revision, published review, synthesis and decision references supported by the
  feature branch. Mentor evidence must belong to this project and the exact
  delivered review revision, unless an effective explicit submission share grants
  broader access. Private team drafts remain unavailable.
- Preserve main's manuscript integrity checks, mobile changes and migration
  files. No application database migration, data reset or production deployment
  was performed in this merge task.

## Verification

- Shared-types build: passed.
- Backend and web typechecks: passed.
- Backend and web production builds: passed. Backend build includes the
  PostgreSQL-only runtime audit.
- Scoped ESLint: zero errors; eight unused-import/argument warnings remain.
- Web regression: 15 files, 292 tests passed. Includes both screening contracts,
  private creation/draft recovery, invitation viewer and accept refresh,
  contributions, notifications, manuscript workspace and chat.
- PostgreSQL regression: 7 files, 111 passed, 3 optional scenarios skipped.
  Includes formal invitation and applicant consent/concurrency, scoped review
  v1/v2, contribution scope/privacy and consensus races/deadlines. Added checks
  rejecting an unshared revision and cross-project mentor evidence.
- All combined migrations replayed successfully on a fresh, randomly named
  local test database. The isolated runner removed that test database afterward.
  This does not reconcile previously reported drift in the application's local
  migration history.

Logs are local ignored files under each app's `.cache/pr98-*`. These checks do
not constitute a new live-browser review or a full Flutter/monorepo test run.
