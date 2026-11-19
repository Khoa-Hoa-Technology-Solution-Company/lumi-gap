# Mentor Workspace and version-scoped manuscript review

> Follow-up: [2026-11-16 independent re-audit](MENTOR_REVIEW_REAUDIT_2026-11-16.md) found and fixed additional queue-acceptance, revoked-list access and notification-dispatch bugs. It contains the current test counts, real-API browser verification and a read-only migration/data assessment. The initial verification below is retained as historical implementation context.

Implemented and verified locally on 2026-11-16 in `D:\lumi-gap`. This report supersedes the historical manual-sharing recovery described in [MENTOR_WORKSPACE.md](MENTOR_WORKSPACE.md).

## Root cause

The initial manuscript delivery path accepted `mentorId` and created a legacy reviewer assignment and an ordinary project task. It did not create the canonical review request or its document access. An accepted mentor commonly had only `MENTOR_CHAT`; the reader separately required `SUBMISSIONS_VIEW` and an explicit manuscript share. Consequently a valid student delivery produced a task that could not open the manuscript.

The fix is at request creation and every protected reader, rather than a frontend permission bypass. New deliveries create the existing `ReviewRequest`, version-pinned `ReviewerAssignment`, and scoped grant in one sender-authorized transaction. Invalid consent, revision or reviewer eligibility rolls back delivery. Notifications are emitted after commit; notification failures do not pretend an already-saved manuscript was not saved.

## Existing models and permissions

| Requested concept | Existing implementation |
| --- | --- |
| Supervision invitation | `MentorshipRequest` |
| Accepted supervisor relationship | `MentorRelationship` and effective `MentorAccess` |
| Ordinary assigned work | Existing project task |
| Paper review request | `ReviewRequest` with `origin=MENTOR_GUIDANCE` |
| Delivered manuscript/version | `Submission` and `SubmissionRevision`; frozen manuscript snapshot when applicable |
| Scoped review grant | Existing `ReviewerAssignment`, pinned revision and new nullable `mentorAccessId` |
| Feedback/history | Existing human reviews, rounds, rubric responses and revision items |

No new membership role or parallel review/task system was added. Mentors remain accepted academic relationships rather than student `ProjectMember` contributors; adding contributor membership would conflict with the existing external-review safeguards.

Before supervision acceptance, the existing proposal-preview restrictions remain. Acceptance grants only the agreed project scope. A manuscript review invitation must also be accepted before its canonical content is readable. The assignment grants access to the delivered version, not edit/delete rights, live LaTeX editing, unrelated snapshots, or private v2 drafts. Reading files, version lists, review detail and history all check live authorization. Cancellation, expiry and policy revocation stop access; submitted history remains stored.

The grant is bound to project, submission, reviewer, request, revision and the accepted mentor policy. Policy/share locks and fresh checks serialize protected writes with revocation. Actor-specific review query keys prevent another account's cached manuscript appearing during an account switch.

### Historical deliveries

The existing `POST /submissions/:id/mentor-review` can upgrade an explicit historical student delivery. It requires the original sender-generated task, the exact pinned legacy assignment, an active authorized sender and accepted effective mentorship. A guessed submission ID or mentorship alone cannot grant access. The conversion creates the canonical request and audit entry atomically and reuses the retained assignment. Unproven legacy tasks remain blocked with the existing recovery explanation.

## Implemented experience

- The existing global Mentor Workspace aggregates accepted projects, actionable work, overdue work, blocked work and review invitations; search, project/type/status filters, sorting, grouping and pagination are retained.
- Canonical review requests appear without requiring a broad manuscript-sharing permission. Project Tasks and the global queue use the same projection. Proven historical deliveries open the recovery entry and then the exact assignment; ordinary tasks remain ordinary tasks.
- Review Workspace uses approximately 65/35 columns on desktop and one column on tablet/mobile. The left reader contains the assigned artifact, sender and timestamp; the right contains applicable AI advice and feedback controls.
- Markdown/LaTeX headings offer section navigation. The LaTeX delivery bug reading `content` instead of manifest `text` is fixed: submissions freeze actual source and reject an empty snapshot. Caller-provided text cannot replace a supplied frozen snapshot.
- Existing rubric, section/criterion evidence, draft saving, unsaved-work guard and `COMMENT`, `REQUEST_CHANGES`, `APPROVE` semantics are reused. Comment-only feedback does not require revision items or grant readiness. Approval means internal readiness, not journal acceptance.
- Revision responses, v2 resubmission and immutable v1 feedback use existing rounds/history. Only explicit delivery exposes v2. Two mentors' drafts stay independent.
- Completed mentor reviews remain visible with an actionable next-review link or queue fallback. A server-side `kind=REVIEW` filter avoids ordinary tasks displacing the next review.
- Sending, accepting, declining, cancelling, resubmitting and completing reviews refresh relevant query data. The queue also retains its existing refresh interval for changes from other users.

## API and schema changes

All routes below are under `/api/v1`; existing authentication and envelope conventions remain.

| Interface | Change |
| --- | --- |
| `POST /submissions` | `mentorId` delivery creates request and version-scoped grant atomically |
| `POST /review-requests` | Optional `revisionId` selects an existing version belonging to the submission; mentor-guidance requests bind the accepted policy |
| `POST /submissions/:id/mentor-review` | Proven historical delivery conversion; standard per-user rate limiter, 30/minute |
| `GET /projects/academic-support/workspace` | Existing aggregate projection includes scoped and proven legacy reviews; additive `kind=REVIEW` filter |
| `GET /reviews/:assignmentId` | Exact assignment authorization plus sender/time metadata |
| `PUT /reviews/:assignmentId`, `POST /reviews/:assignmentId/submit` | Live grant checks; existing drafts and outcome workflow |
| Existing submission revision/file/history and manuscript snapshot readers | Filter by currently readable assignments and delivered versions |

`ReviewerAssignment.mentorAccessId` is nullable UUID, with an index and a foreign key to `mentor_access(id)` using `ON DELETE SET NULL`. Existing assignments are preserved. Migration: `20261116090000_scoped_mentor_review_access`. Shared types add optional request `revisionId` and the `REVIEW` workspace filter. No production credentials or environment variables are required for this change.

## Files changed for this implementation

Paths below are relative to the repository. Other pending checkout edits predate this request and are preserved.

- Schema: `apps/backend/prisma/review.prisma`, `apps/backend/prisma/migrations/20261116090000_scoped_mentor_review_access/migration.sql`.
- Backend review: `apps/backend/src/modules/reviews/mentor-review-request.ts`, `mentor-review-access.ts`, `peer-review-access.ts`, `review-request.service.ts`, `review.service.ts`.
- Backend submissions/snapshots: `apps/backend/src/modules/submissions/submission.service.ts`, `submission.routes.ts`; `apps/backend/src/modules/workspaces/manuscript.service.ts`.
- Backend queue: `apps/backend/src/modules/projects/mentor-workspace.service.ts`, `dto/mentor-workspace.schema.ts`.
- Shared contracts: `packages/shared-types/src/research-review.ts`, `mentor-workspace.ts`.
- Review UI: `apps/web/src/pages/reviews/review-workspace.tsx`, `mentor-review-entry.tsx`; `apps/web/src/features/reviews/components/assigned-revision-reader.tsx`, `next-mentor-review.tsx`, `submit-review-dialog.tsx`; `apps/web/src/features/reviews/hooks/use-reviews.ts`.
- Project/submission integration: `apps/web/src/features/projects/components/mentor-project-tasks.tsx`; `apps/web/src/pages/academics/mentor-workspace.tsx`; `apps/web/src/pages/submissions/submission-detail.tsx`; `apps/web/src/features/submissions/hooks/use-submissions.ts`; `apps/web/src/routes/app-routes.tsx`; `apps/web/src/i18n/locales/mentor-workspace.ts`.
- Tests: `apps/backend/src/modules/reviews/__tests__/mentor-review-workflow.persistence.test.ts`, `mentor-guidance.persistence.test.ts`; `apps/backend/src/modules/projects/__tests__/mentor-workspace.persistence.test.ts`; `apps/web/src/features/reviews/__tests__/mentor-review-navigation.test.tsx`, `review-workspace-cache.test.tsx`, `assigned-revision-reader.test.tsx`.
- Tooling/report: `apps/backend/scripts/test-mentor-workspace.mjs`, `migrate-mentor-review-local.mjs`; this report, `docs/MENTOR_WORKSPACE.md` and `docs/audits/2026-11-16-mentor-review/` screenshots.

## Verification

PostgreSQL tests use randomly named isolated local databases, apply checked-in migrations and drop only their own test database. The workflow suite includes authenticated HTTP review/PDF access as well as service/transaction checks. No real user feedback was submitted for browser testing.

| Executed check | Result |
| --- | --- |
| PostgreSQL mentor-access, queue, guidance and new delivery workflow | 65 passed, 4 suites |
| Review/queue/Academic Support frontend regression | 78 passed, 12 suites |
| Backend mentor-feedback, project-submissions and review rules | 21 passed, 4 suites |
| PostgreSQL runtime boundary checks within backend build | 4 passed |
| Backend and web type checks | Passed |
| Backend and web builds, web bundle budget | Passed |
| Targeted ESLint for touched implementation files | Passed |
| Local API `/health`, `/ready` and web `/mentor-workspace` | HTTP 200 |

The tests cover pending mentor rollback; accepted supervision; version-bound delivery; authenticated PDF access; other-reviewer and guessed-version denial; edit restrictions; feedback/notifications; global/project status synchronization; hidden v2; explicit resubmission and v1 history; independent mentor drafts; multiple projects; exact LaTeX snapshots; and cancelled, expired or revoked access. Frontend regression additionally verifies account cache isolation and queue refresh immediately after delivery without waiting for polling.

Reproduce the main database and frontend checks from the repository root:

```powershell
node apps/backend/scripts/test-mentor-workspace.mjs --regression
pnpm --filter web exec vitest run src/features/projects/__tests__/mentor-workspace.test.tsx src/features/reviews/__tests__ src/pages/academics/__tests__/academic-support.test.tsx --maxWorkers=1 --minWorkers=1
pnpm --filter backend typecheck
pnpm --filter web typecheck
pnpm --filter backend build
pnpm --filter web build
```

Browser verification confirmed that the real previously blocked LumiGap item now projects as a versioned manuscript review, with its proper review-entry route. Full review layouts were exercised on a separate local QA origin using actual API output from the disposable test database and the real page/components. The ignored harness is not a production route and contains no authentication credentials. No horizontal overflow at desktop 1440px, tablet 820px or mobile 412px. The temporary QA server was stopped afterward; normal local backend/web services remain running.

Screenshots: [Desktop](audits/2026-11-16-mentor-review/review-desktop.png), [Tablet](audits/2026-11-16-mentor-review/review-tablet.png), [Mobile](audits/2026-11-16-mentor-review/review-mobile.png).

## Local migration history and remaining limits

The existing local application database contains migration history from multiple branches, including 13 applied migrations absent from this checkout and unrelated pending ORCID/Screening migrations. An older failed OpenAlex unique-index migration also blocked deployment. Read-only inspection found seven duplicate OpenAlex groups; the failed transaction had not installed the unique index. Its failed attempt was marked rolled back with Prisma, without removing/merging papers or claiming the index exists.

The new scoped-review migration was applied and recorded successfully on localhost using `migrate-mentor-review-local.mjs`. This runner allows only local PostgreSQL and supplies only this checked-in migration to Prisma. It is a local mixed-history repair tool, not the deployment path. Normal clean environments use `prisma migrate deploy`. Unrelated migration divergence and OpenAlex duplicates remain unresolved and need their own data review before a full local migration reconciliation.

PDF ink/selection annotations are not implemented. Existing criterion/section feedback, source quotations and page/section locators provide the supported evidence path; no fake annotation controls were added. The responsive QA is not a full two-account browser end-to-end test; role transitions and file permissions were verified through the isolated PostgreSQL/HTTP suites. Existing Vite chunk/import notices remain non-fatal. No production deployment, commit or push was performed.
