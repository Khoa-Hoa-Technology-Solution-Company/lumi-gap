# Mentor Workspace and Manuscript Review: independent re-audit

Date: 2026-11-16. Checkout: `D:\lumi-gap`, branch `feat/team-paper-screening-workflow`.

This audit re-read the implementation and [previous report](MENTOR_REVIEW_SCOPED_ACCESS.md), executed new failure reproductions, ran clean-database regressions and exercised the real React pages against authenticated HTTP APIs. The normal local application database was inspected in a PostgreSQL **READ ONLY** transaction. No application data, migration records or production configuration were changed by the database audit. No commit, push or deployment was performed.

## Decision

The scoped mentor-review feature is suitable for a scoped commit after reviewing the selected diff. Its tested critical paths have no remaining known P0/P1 defect after the fixes below. This is not approval to deploy the whole checkout or apply all migrations to the existing local database: its mixed migration history remains a P1 release concern. There are also nonblocking P2 follow-ups below.

The checkout contains hundreds of existing pending files from earlier work. Do not treat the whole working tree as one reviewed change or use an indiscriminate `git add .`.

## Verified behavior and evidence

| Scenario | Actual verification |
| --- | --- |
| Student invites mentor; pending mentor cannot read private work | Isolated PostgreSQL consent and authorization suites; failed initial delivery rolls back manuscript/request/task |
| Mentor accepts supervision, then receives v1 review invitation | Real consent services and authenticated review endpoints; canonical request and scoped grant require accepted effective supervision |
| Mentor opens v1 from global queue | Browser on real product components/API, disposable database; exact project, request, assignment and revision displayed |
| Mentor submits feedback and requests changes | Browser: eight rubric ratings, eight integrity checks, one Methods revision item; feedback saved and request becomes `REVISION_REQUESTED` |
| Student receives feedback | Browser student role: actual submitted rubric, comment and required change shown; API suites assert notification recipient and target |
| Student creates private v2 | Browser saves Markdown v2; mentor queue still shows v1 waiting for the team until explicit resubmission; HTTP tests deny download of an undisclosed v2 |
| Student responds and resubmits v2 | Browser selects v2, responds to the required item and submits; mentor sees `RESUBMITTED`, version 2 and the author response |
| Mentor reviews v2 and preserves v1 | Browser accepts the correction, completes a second rubric and approves internally; student sees both immutable rounds linked to their respective versions |
| Review next across projects | Browser follows `Review next` from completed Methods-team v2 directly to Evidence-team v1, without visiting either project page |
| Multiple projects, filters, sorting, grouping, pagination | Browser confirms project filtering and real empty search; PostgreSQL/web suites verify multi-project totals, deadline/priority order, literal wildcard search, grouping and pages |
| Pending/accepted/expired/cancelled/revoked access | HTTP/service tests check 401, 403/404, reviewer identity, foreign IDs, policy replacement, request state, PDF version download and frozen source snapshots |
| Edit/delete protection | Review grant does not provide project author/editor roles; create-version and live manuscript operations are denied; existing mentor-access suite checks mutation boundaries |
| Two mentors | Concurrent independent draft writes and cross-reviewer denial verified in PostgreSQL; no draft overwriting |
| Consistent work data | Global/project projections agree, sender-created historical tasks deduplicate, no ordinary task is created for a new canonical request |
| Snapshot LaTeX | Actual stored snapshot source is read; live editor, unrelated snapshot, fabricated quotation and private revision access are rejected |
| Transport failure and concurrent sends | New regressions reproduce queue failure after feedback persistence, verify notification recovery, rollback on notification persistence failure, and simultaneous-request deduplication |

The browser used the existing product pages and hooks with a test-only wrapper on `127.0.0.1:8094`, proxied to real Express routes on `127.0.0.1:4001`, backed by a newly migrated disposable PostgreSQL database. Its role switch supplies isolated test sessions; it is not an implementation of the production login UI. Only queue transport/storage test boundaries were stubbed in the test process. Product data, permissions, version creation, review writes and state transitions used the real backend and database. This was not a browser test of e-mail delivery or external publication submission.

The normal localhost mentor session was inspected separately. It shows the existing real historical delivery as version-1 review work with the proper recovery route. The audit did not upgrade that real delivery, submit real feedback, or change its access policy.

## Bugs reproduced and fixed

### P0: queue destination had no way to accept a new review

`review-request-detail.tsx` showed a `REQUESTED` invitation, template and empty history, but no accept/decline controls. New canonical work links intentionally point there, so the mentor could not continue from the queue. This was observed in the browser and reproduced by two failing frontend tests.

Added reviewer-only accept/decline actions using the existing request-action hooks/APIs. Successful acceptance opens the exact assignment. Failures retain the invitation and permit retry; sender accounts cannot accept on the mentor's behalf. Three frontend regressions cover these paths. The full browser v1/v2 cycle then succeeded.

### P1: list endpoints leaked revoked manuscript metadata

Detail/file guards rejected revoked access, but `GET /reviews` and the incoming part of `GET /review-requests` still returned assignment metadata and review data without the equivalent live mentor-policy check. A new authenticated HTTP test failed before the fix.

Both lists now use the same batched mentor-scope filter, checking project, user verification, accepted invitation, active relationship, effective policy, assignment, pinned revision and request status. A bound grant cannot fall back to a different broad sharing policy. The filtering uses a fixed set of queries rather than one permission lookup per row. Submitted history remains stored, but the removed mentor cannot retrieve its private contents through these list routes.

### P1: transport failure produced a false feedback-submission error

Rejecting `notificationQueue.add` reproduced an HTTP 500 after the review had already been committed. Retrying risked confusing the mentor about whether feedback had been saved.

Review delivery, feedback submission and v2 resubmission now persist their in-app notification within the corresponding transaction. Transport dispatch happens after commit and cannot turn an already-saved review into an API failure. The existing worker recovery loop includes review event-key prefixes, so an undispatched durable row is eligible for recovery. New tests verify HTTP success despite transport failure, one feedback/notification after retry, successful recovery and full rollback if the durable notification itself cannot be persisted.

Other existing review-request notification calls use the same safe dispatch helper. There is no claim of exactly-once external push/e-mail delivery, nor was a new notification system introduced.

### P2: replacement access could make inaccessible old work reappear

The queue allowed a non-null old grant to fall back to any effective shared-submission permission. A replacement mentorship/share could therefore display work whose exact assignment reader correctly rejected. The queue's legacy fallback now applies only when `mentor_access_id IS NULL`. A PostgreSQL regression replaces the relationship/policy and verifies both reader denial and queue exclusion.

### P2: misleading text after a request already existed

The student progress panel always displayed the instruction that saving does not send a review, even alongside an existing sent request. That introductory instruction now appears only when there are no requests. Mentor-guidance request detail no longer describes the guidance request as a separate formal peer-review agreement.

## Remaining findings

| Priority | Finding | Impact / safe follow-up |
| --- | --- | --- |
| P1, release/database | Existing local migration history differs from this checkout | Do not run all pending migrations or deploy based only on clean-DB success; reconcile in a cloned database first |
| P2, performance | `review-request.service.ts`: `listCenter` expands every request through `summary`, and detail/workspace readers fetch revision responses per item | Review Center can issue queries proportional to historical requests/items. The paginated global Mentor Work Queue itself is set-based. Batch the remaining historical summary/response reads and profile with a large fixture before a volume release; this audit did not rewrite those working readers |
| P2, error UX | Full review/request load errors still use one generic unavailable/access message without a dedicated retry action | A transient outage can look like a permission error. Queue, PDF and legacy-entry retry paths exist, and invitation-action failures are retryable; add a shared existing-style page error state in a focused UI follow-up |

No remaining P0/P1 feature bug was found in the executed scenarios. This is a scoped verification result, not a guarantee that the whole repository is defect-free. PDF ink annotations remain intentionally unsupported; section/criterion/page feedback is the supported mechanism.

## Local database: observed state and safe recovery plan

Machine-readable read-only evidence: [local-database-reaudit.json](audits/2026-11-16-mentor-review/local-database-reaudit.json). Reproduce with:

```powershell
node apps/backend/scripts/audit-mentor-review-local.mjs --git-history
# Optional: --reference-migrations <absolute-path-to-another-checkout/prisma/migrations>
```

Observed:

- 145 checked-in migration directories; 155 successful non-rolled-back applied records.
- 13 applied migrations are absent from `D:\lumi-gap`. Every one was found in the original `submission-workflow-fix` checkout and matched the applied checksum, allowing LF/CRLF variants. This confirms shared database use across divergent source checkouts rather than missing execution of this feature's migration.
- Three checked-in migrations remain pending: OpenAlex uniqueness, verified ORCID uniqueness and the Screening team-workflow status constraint. There are no currently unresolved failed migration attempts. Previous rolled-back attempts remain recorded; they were not changed during this audit.
- 40 raw checksum differences are explained exactly by LF versus CRLF. Eight other files differ in content from the recorded checksum. The old `forum_categories` SQL matches local Git commit `6180d6571721a47995a8df918976b9e116a3343c`; the other seven applied contents were not recovered from available local file history or the reference checkout. `_prisma_migrations` stores hashes, not the original full SQL, so the exact historical SQL for those seven cannot be reconstructed from that table alone.
- The new `mentor_access_id` UUID column, foreign key with `ON DELETE SET NULL`, index and migration record are present.
- The existing local database has zero canonical `MENTOR_GUIDANCE` requests/scoped grants. Its visible task is a historical delivery. The canonical workflows were therefore verified on clean fixture databases, not inferred from nonexistent local canonical records.
- No mismatched mentor request/assignment revision, mismatched feedback revision, duplicate active assignment, or placeholder snapshot was found by the implemented local audit queries. These are named consistency checks, not a complete semantic audit of every row.

OpenAlex: seven duplicate identifiers spanning fourteen paper rows. The first/last timestamps of several pairs are milliseconds apart, consistent with the lookup-then-insert race noted in the existing unique-index migration. The current writer still looks up before insert and relies on unique-violation retry; the local non-unique index cannot enforce that protection. The audit cannot prove which historical worker created each row.

The duplicate papers have foreign-key references: 27 author rows, 5 documents, 146 keywords, 14 source records and 42 topic rows. This count covers declared single-column foreign keys to `papers`; polymorphic references and embedded JSON identifiers require a separate merge audit. No papers/references were deleted, merged or rewritten.

The pending ORCID index already exists from the other branch, and there are zero duplicate provider-connected ORCIDs in the inspected data. The pending migration also contains data-demotion SQL, so its presence must not be treated as harmless metadata bookkeeping. The pending Screening migration would replace the current status constraint: it adds `CLOSED_UNRESOLVED` but removes allowed `CONSENSUS_REQUIRED`/`CONSENSUS_IN_PROGRESS` values. Those consensus values have no current rows, yet applying that SQL without aligning running source versions would still change the workflow contract.

Safe next steps, not executed:

1. Back up and restore the local database to an isolated reconciliation database; collect the canonical branch/migration lineage and recover historical SQL from team backups/releases where available.
2. Preserve all applied migration records. Compare actual schema/constraints and contents against the canonical migration chain; use reviewed forward migrations for genuine changes. Do not reset, edit `_prisma_migrations`, or mark missing work as applied merely to suppress errors.
3. Produce a reviewed OpenAlex canonical-ID and reference mapping with collision handling for authors, documents, topics, source records and polymorphic links. Validate preserved scientific history and row/reference totals in the clone. Only after an approved reconciliation results in zero duplicate identifiers should the unique index be enforced and all writers exercised concurrently.
4. Resolve ORCID and Screening lineage/constraint differences in that same clone; test both relevant source versions before choosing the next migration/deployment sequence.

## Tests actually executed

| Check | Result |
| --- | --- |
| Clean PostgreSQL mentor-access, workspace, guidance, delivery and formal peer-review regressions | **86 passed**, 5 suites; one interactive-only case skipped in unattended run |
| Interactive real-API UI fixture run | **14 passed**, including the interactive case; UI cycle verified manually before finishing |
| Web queue/review/Academic Support/project-submission regressions | **110 passed**, 13 suites |
| Backend review/submission/notification unit regressions | **24 passed**, 5 suites |
| PostgreSQL-only runtime boundary tests in backend build | **4 passed** |
| Backend typecheck and backend/web production builds | Passed |
| Targeted backend/web ESLint and diff whitespace check | Passed |
| Normal localhost `/health`, `/ready`, `/mentor-workspace?view=work` | HTTP 200 |

Do not add 14 to 86 as if they were all distinct tests: the interactive run repeats delivery regressions. The interactive fixture API and Vite server were stopped, its disposable database was removed by the runner, and the normal backend/web services were retained.

Main commands:

```powershell
node apps/backend/scripts/test-mentor-workspace.mjs --regression
pnpm --filter web exec vitest run src/features/projects/__tests__/mentor-workspace.test.tsx src/features/projects/__tests__/project-submissions.test.tsx src/features/reviews/__tests__ src/pages/academics/__tests__/academic-support.test.tsx --maxWorkers=1 --minWorkers=1
pnpm --filter backend typecheck
pnpm --filter backend build
pnpm --filter web build
```

The runner's optional `--review-only --interactive-ui` keeps an isolated real API available for manual UI verification and times out safely. The ignored `.cache` wrapper is test tooling, not a production route or a mock-data fallback. The normal API never mounts the test-only session/finish routes.

Responsive checks: desktop two-column review layout, tablet 820px and mobile 412px. On mobile `scrollWidth=clientWidth=397`; on tablet both equal 805. The source reader and form stack into one column without horizontal overflow. Loading/update indicators, empty search, disabled submission controls, saved draft, submitted immutable state, student response, review-next navigation and retained two-round history were observed. The full application shell, real e-mail/push delivery and every device browser were not exhaustively tested.

Screenshots: [completed v2 desktop](audits/2026-11-16-mentor-review/reaudit-v2-completed-desktop.png), [mobile review](audits/2026-11-16-mentor-review/reaudit-review-mobile.png), [tablet review](audits/2026-11-16-mentor-review/reaudit-review-tablet.png), [student v1/v2 history](audits/2026-11-16-mentor-review/reaudit-student-history.png).

## Files changed in this re-audit

- Backend: `src/modules/reviews/mentor-review-access.ts`, `mentor-review-request.ts`, `review-notifications.ts`, `review-request.service.ts`, `review.service.ts`; `src/modules/submissions/submission.service.ts`; `src/modules/projects/mentor-workspace.service.ts`; `src/workers/notification.worker.ts` (all under `apps/backend`).
- Backend regression/tooling: `src/modules/reviews/__tests__/mentor-review-workflow.persistence.test.ts`; `src/modules/projects/__tests__/mentor-workspace.persistence.test.ts`; `scripts/test-mentor-workspace.mjs`; new read-only `scripts/audit-mentor-review-local.mjs`.
- Web: `apps/web/src/pages/reviews/review-request-detail.tsx`; `features/reviews/__tests__/review-response-drafts.test.tsx`; `features/submissions/components/submission-review-progress.tsx`; `i18n/locales/mentor-workspace.ts`.
- Documentation: this report, link from the previous report, read-only database evidence and screenshots.

No Prisma model or migration SQL was changed in this re-audit. The existing schema addition from the implementation remains intact.
