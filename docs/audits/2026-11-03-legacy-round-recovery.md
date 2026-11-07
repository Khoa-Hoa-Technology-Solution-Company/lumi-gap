# Legacy round recovery in the Library reading modal

## Finding

The reported paper has one active TITLE_ABSTRACT round with workflow version 5,
three assignments and two stored reviews. Its legacyNeedsAudit flag is true.
The backend correctly rejected additional submissions, but roundView still
advertised canReview for the unfinished assignment. The Library reading modal
rendered a writable ballot and had no recovery action. The existing owner recovery
control was available only in the separate screening oversight view.

The diagnostic query was read-only and did not fetch review text or credentials.
No application review, assignment, round or decision was changed during the fix.

## Changes

- roundView now disables review, claim, reopen and resolution capabilities for
  legacy-audited rounds while retaining the owner's management capability for
  explicit recovery. The backend also rejects reopening a legacy ballot in place.
- The Library reading modal and oversight view share LegacyScreeningRepair.
  The owner must check an explicit confirmation before opening a fresh round using
  the project's current rules. Members see the owner guidance without this action.
- Existing owner controls for changing an old round are hidden in the modal.
  Historical ballots remain visible according to their original visibility rules.
  A draft already being written remains available to copy if a refresh marks the
  round for audit; its submit action is disabled.
- Recovery reuses screeningApi.start and its project-owner permission check,
  transactional command and idempotency key. Query invalidation switches the
  modal to the new round. Prior assignments, ballots and decisions are retained.
- No migration, project ID hardcoding, automatic re-screening or history deletion.

## Verification

- 38 web tests passed (screening-workspace and task-first-papers-workspace).
  Covers owner confirmation, no member/read-only action, stale capability
  protection, retaining an unfinished draft and refreshing into the new round.
- All 33 PostgreSQL two-slot integrity tests passed on the isolated test database.
  The new legacy-cohort case verifies blocked submissions/reopening, owner-only
  confirmed recovery, a fresh two-slot round, preserved old assignments/reviews
  and continued ballot visibility boundaries.
- Backend TypeScript emit build and node syntax checks passed.
- Web TypeScript and production build passed. The localhost web bundle returns
  HTTP 200 and contains the recovery component; the restarted backend is healthy.
- Browser fixture: owner confirmation creates round 2 and retains round 1 in the
  history list. Fixture uses in-memory data only. Screenshots are under
  artifacts/my-work-two-tabs/legacy-recovery-*.png.
- Member fixture at 390px: no reopen button, no writable review form, no horizontal
  overflow. No authenticated live-browser mutation was performed.
- Localhost was updated by copying the compiled JavaScript and web assets into
  the existing running containers. As with the preceding UI update, recreating
  containers from older images requires rebuilding from the current repository.
