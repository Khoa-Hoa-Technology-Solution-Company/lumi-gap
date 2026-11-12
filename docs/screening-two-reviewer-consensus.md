> Superseded for active discussions by [workflow 13: reviewer evaluation updates](screening-reviewer-discussion.md). Separate locked confirmations below describe historical workflow 12 only.

# Two-Reviewer Consensus, workflow 12

Implemented 2026-11-08. This replaces active independent-screening arbitration. The older screening documents describe historical protocols, not new escalation behavior.

## Existing components and decisions

The implementation reuses ScreeningRound, ScreeningAssignment, immutable ScreeningReview revisions, ScreeningFinalDecision, ScreeningAudit, the existing project transaction lock, notification service, discussion/SSE components and ScreeningObligation task ledger. It does not add a second review or chat subsystem.

New independent ballots are binary: INCLUDE (Phù hợp) or EXCLUDE (Không phù hợp), with a reason. The peer ballot remains hidden until both assigned reviewers submit. Two matching independent ballots finalize immediately. Two different ballots enter CONSENSUS_REQUIRED. A discussion message or first final confirmation changes it to CONSENSUS_IN_PROGRESS.

Each reviewer chooses their own final decision and reason, then explicitly confirms once. A confirmation is append-only and locks only that person's final choice. It never overwrites the independent ballot or confirms for the peer. Both matching final confirmations resolve immediately. Different confirmed choices remain pending until the deadline; neither reviewer can change a confirmed choice.

The deadline starts when disagreement is detected, defaults to 48 hours and is frozen in the round. Owners can configure `consensusWindowHours` from 1 to 336 hours for future rounds through existing screening settings. Changing settings, sending messages, submitting a confirmation or extending a claim does not extend an existing consensus deadline.

When the deadline expires without two matching timely confirmations, the result is EXCLUDED with resolutionType CONSENSUS_NOT_REACHED. This describes lack of project consensus, not the academic quality of the article. The original paper, independent ballots, final confirmations, reasons and messages remain available.

The established API/storage result codes INCLUDED and EXCLUDED are retained for compatibility. Their UI labels are Đã chấp nhận and Đã loại; the consensus view projects them as ACCEPTED and REJECTED. New independent workflow-12 rounds accept a matching relevant pair directly rather than silently opening another full-text round. Completed older stage decisions retain their original protocol and history. Existing SIMPLE and COLLABORATIVE history is preserved.

## API, permissions and race handling

New authenticated endpoint:

```text
POST /api/v1/projects/:projectId/research/screening-v2/rounds/:roundId/consensus/confirm
```

```json
{
  "decision": "INCLUDE",
  "reason": "Căn cứ sau khi đối chiếu tiêu chí và trao đổi",
  "confirmed": true,
  "clientKey": "client-generated UUID"
}
```

The DTO is strict: no reviewerId, deadline, status or peer decision is accepted. The authenticated actor must be an active project participant with their own submitted assignment in that round. A project owner who did not review cannot confirm. Existing write permission, project-state and rate-limiter checks apply.

All transitions use the existing account/project lock and a Prisma transaction. Confirmation events are unique per round, reviewer and consensus-start timestamp, backed by a partial database unique index. Client keys retain existing idempotency semantics. Two simultaneous confirmations produce one final decision. A late confirmation is not stored; the API returns the canonical expired result so the client can refresh. Confirmation timestamps are recorded at confirmation time, not at a possibly older transaction-start time.

The notification worker's existing maintenance schedule enforces deadlines without an open browser. It selects projects with due consensus rounds, due obligations or remaining legacy cases, in bounded project batches. Authorized detail, board, summary, task and analytics reads also reconcile deadlines before presenting results. An archived/completed project remains read-only; an expired deadline is enforced when an unfinished project becomes active again. No deadline is extended by archiving.

Finalization records the decision, updates the project-paper screening status, invalidates dependent evidence where required, and notifies both eligible reviewers and the project owner in the same transaction. No sensitive ballot text is copied into notifications. Tasks and counters use the existing ledger: a personal confirmation completes that person's task; the peer's unfinished confirmation remains actionable. Different confirmed decisions create no extra human task while the backend awaits the deadline.

Arbitration request/action endpoints now reject mutations with a Vietnamese conflict message. Independent reassessment, reopening, manual finalization, finalizer assignment and old agreement actions cannot bypass the new confirmation flow. Existing historical adjudication GET/source endpoints keep their original authorization and return read-only history. No invitation, assignment, reminder or automatic extension is created for a new disagreement.

## Migration and rollout

Handwritten additive migration:

```text
apps/backend/prisma/migrations/20261108090000_two_reviewer_consensus/migration.sql
```

It adds:

- ScreeningSettings.consensusWindowHours, default 48; the default resolution policy becomes CONSENSUS.
- ScreeningRound.consensusStartedAt and consensusDeadline, with a valid-window constraint and due-round index.
- The two consensus statuses and CONSENSUS_NOT_REACHED resolution provenance.
- A unique index for append-only personal confirmations in ScreeningAudit.

Before transitioning unfinished independent rounds, the migration stores their original protocol, status and finalizer in CONSENSUS_WORKFLOW_MIGRATED audit events. Eligible open disputes receive a **fresh 48-hour window at migration time**. Unsupported historical reviewer counts are flagged legacyNeedsAudit for explicit owner repair instead of inventing a reviewer or silently choosing which ballots count. Archived/completed projects and finalized decisions are left unchanged.

Legacy cases, packets, statements, invitations, source files and final decisions are not deleted. Existing active cases are closed and active invitations revoked by authorized reconciliation/maintenance; read-only case history remains. Historical notification records are retained. No new arbitration reminders are scheduled.

Rollout requires a reviewed migration deploy and matching backend/web/notification-worker versions. The migration has been applied only to isolated local test databases, **not the application database**. Back up the application database before an eventual rollout. No production deployment or secrets changes are part of this work.

## UI

The Paper Detail discussion section displays the two initial decisions and expandable reasons, each person's final-confirmation state, existing criteria, available prior AI insights, the existing chat and a deadline countdown. The final form offers only Phù hợp and Không phù hợp. After submission it shows a locked personal-confirmation state.

Reviewer cards are side by side on desktop and stack on mobile. Long reasons wrap inside disclosure content. Native radios, named form controls, semantic headings, disabled pending controls and status messages preserve accessibility. A failed API request retains the draft. At the deadline the form is disabled and queries refresh from the backend. Final results expose the stored confirmations and discussion as history.

Paper cards, evaluation history and automatic tasks share the Cần thảo luận / Đang thảo luận labels and semantic colors. Personal original assessment remains separate from the group's eventual result. Accepted lists exclude CONSENSUS_NOT_REACHED papers.

## Changed-file inventory

- Database/shared contracts: `apps/backend/prisma/project-screening.prisma`, the migration above, `packages/shared-types/src/project-screening.ts`.
- Consensus logic: new `apps/backend/src/modules/projects/screening-consensus.ts`; existing `screening-context.ts`, `screening.service.ts`, `screening-obligations.ts`, `screening-work-papers.ts`, `screening.calculator.ts`.
- HTTP: `dto/screening.schema.ts`, `screening.controller.ts`, `screening.routes.ts`; retired mutations/read-only history in `screening-case.service.ts`, `screening-case-context.ts`, and existing maintenance in `screening-case-maintenance.ts`.
- Web: new `components/screening-consensus-discussion.tsx`, re-exported by `screening-conflict-resolution.tsx`; existing `screening-round.tsx`, `screening-management.tsx`, `screening-common.tsx`, `screening-paper-card.tsx`, `my-work-model.ts`, `screening-status.ts`, `hooks/use-screening-clock.ts`, `api/screening.api.ts`.
- Verification: new backend `__tests__/screening-consensus.persistence.test.ts` and `scripts/test-screening-consensus.mjs`; updated web conflict-resolution, workspace and status tests; repaired the missing reviewer-cohort shape in the retained historical eligibility unit fixture. Legacy manual-finalization UI tests remain scoped to the legacy SIMPLE workflow.
- Documentation: this file and the historical-workflow notice in `screening-independent-workflow.md`.

## Verification

Run the isolated PostgreSQL integration suite with:

```powershell
node apps/backend/scripts/test-screening-consensus.mjs --env-file D:\lumi-gap\.env
```

The runner requires local PostgreSQL and derives `lumigap_screening_consensus_v6_test`; it never migrates the configured application database. It applies all forward migrations and runs real persistence assertions for initial agreement, disagreement, both matching final choices, different choices, missing/late confirmations, configured windows, expiry idempotency, authorization, concurrency, duplicate requests, two-person teams, archived history and retained legacy case records. It also runs the existing calculator and event tests.

Browser verification used synthetic accounts and a real isolated API/database on ports 8097/8098. Desktop 1280×900 and mobile 390×844 were inspected. A personal confirmation was submitted through the actual UI, persisted and visibly locked while the peer stayed pending. Mobile document width matched its scroll width (375 pixels), with no outer horizontal overflow. No real project members were messaged or invited.

Executed verification:

- **53/53** tests through the isolated runner: 18 PostgreSQL consensus cases, 31 existing calculator cases and 4 event cases.
- **63/63** additional backend unit/regression cases across query validation, historical stage/classification helpers, eligibility, claim leases and the PostgreSQL-only runtime boundary.
- **244/244** web cases in 13 files: 140 screening cases and 104 academic-profile/onboarding/ORCID/discovery/i18n regressions.
- Prisma client generation, shared-types build, backend production TypeScript build (including auth-mail asset copy), web TypeScript build and Vite production build succeeded.
- Scoped ESLint and `git diff --check` passed. Vite retains its existing warnings about large unrelated chunks; the build succeeds.

The entire repository test suite was not run. Older arbitration/stage persistence fixtures describe superseded behavior; the new consensus suite is the current workflow specification. Their historical calculators and eligibility helpers still have explicit regression coverage. No live application database or production service was changed.
