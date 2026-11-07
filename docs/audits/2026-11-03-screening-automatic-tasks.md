# Screening automatic tasks and handoff

Date: 2026-11-03

## Implemented

- Kept the existing four Kanban columns, board/list views and manual task editor.
- Added a separate PostgreSQL obligation ledger, controlled exclusively by Screening. Manual task endpoints cannot move or complete an automatic obligation.
- Obligations are identified by project, paper, round, assignee, action and workflow instance. A partial unique index prevents two live instances of the same action for one person in one round.
- Stored transition events and explicit DONE, EXPIRED, CANCELLED and REPLACED outcomes. Historical ballots retain their recorded submission time when backfilled into the ledger.
- Claims create review work; successful submission completes it. Release, expiry and loss of authority end work without manufacturing completion.
- Disagreement creates work for the relevant reviewers. Escalation replaces that discussion obligation and creates independent statement obligations. One reviewer's submission cannot complete the other's task.
- The existing common deadline seals the case and directly assigns an eligible adjudicator. Missing responses expire without creating statements or consent. Conflict of interest blocks the adjudicator and creates coordination work only for an authorized independent coordinator.
- Reused the existing Screening outcome rules, including Unsure, stage transitions and preserved individual ballots.
- Scoped mentors receive their own adjudication tasks and recent ended tasks in their workspace, without gaining project membership or wider resource access.
- Automatic cards show action, round, title limited to two lines, state, reason, deadline and one contextual CTA. They have no manual status or drag controls.
- Added a source filter to the existing Filters menu. Filter state is kept in the URL and carried in the return link.
- Added backend-confirmed action feedback and a guard for ended, expired, blocked, unknown or mismatched task links. External return URLs are rejected. Beginning a new command clears obsolete success feedback.

## Synchronization

Screening remains the source of truth. Reconciliation runs under the existing project transaction lock before/after Screening commands, on workspace/task reads, and in notification-worker maintenance. Business state, task transitions and event writes commit together. Idempotency receipts include the handoff response. Maintenance retries failed reconciliation; web query invalidation and existing polling update Kanban, paper work and mentor tasks.

The ledger contains task metadata, not private ballot/statement text. Source and case permissions continue to be checked by existing backend services.

## Main files

### Database/backend

- `apps/backend/prisma/screening-obligation.prisma`
- `apps/backend/prisma/migrations/20261103200000_screening_obligations/migration.sql`
- `apps/backend/src/modules/projects/screening-obligations.ts`
- `apps/backend/src/modules/projects/screening-context.ts`
- `apps/backend/src/modules/projects/screening.service.ts`
- `apps/backend/src/modules/projects/screening-case.service.ts`
- `apps/backend/src/modules/projects/screening-case-maintenance.ts`
- `apps/backend/src/modules/projects/screening.controller.ts`
- `apps/backend/src/modules/projects/screening.routes.ts`
- `packages/shared-types/src/project-screening.ts`

### Web

- `apps/web/src/features/projects/my-work-model.ts`
- `apps/web/src/features/projects/api/screening.api.ts`
- `apps/web/src/features/projects/hooks/use-project-research.ts`
- `apps/web/src/features/projects/components/workspace-task-board.tsx`
- `apps/web/src/features/projects/components/screening-team-task.tsx`
- `apps/web/src/features/projects/components/screening-task-feedback.tsx`
- `apps/web/src/features/projects/components/screening-round.tsx`
- `apps/web/src/features/projects/components/screening-adjudication.tsx`
- `apps/web/src/features/projects/components/mentor-access-workspace.tsx`
- `apps/web/src/features/projects/research-tasks.css`

## Actual verification

### Backend: 256 passing tests across the relevant suites

| Suite | Passed |
| --- | ---: |
| Screening persistence and HTTP authorization | 79 |
| Screening calculator | 31 |
| Stage rules | 30 |
| Stage persistence and scoped Lecturer tasks | 36 |
| Two-slot persistence | 32 |
| Obligation persistence | 10 |
| Sealed packets and direct adjudication | 38 |

Commands used: `node apps/backend/scripts/test-screening-workflow.mjs`, targeted `--tasks-only --slow` / `--obligations-only --slow` reruns, and `node apps/backend/scripts/test-screening-cases.mjs --slow`.

The initial combined run was interrupted by Docker/WSL memory exhaustion. Targeted reruns passed after stopping unused workers with the user's approval. Counts above include each suite once, not repeated executions.

### Web: 151/151 tests, 10 suites

Team tasks, task feedback/guards, My Work model, case UI, adjudication UI, paper cards, tasks panel, workspace coordination, draft retries and mentor conversation/tasks.

Two existing allocation retry tests still referred to a removed single percentage input. Their input setup was updated to the current four-category matrix; retry and read-only assertions remain intact. No allocation product logic changed.

### Builds and UI

- Prisma client generation and shared types build succeeded.
- Backend `tsc -p apps/backend/tsconfig.build.json`: exit 0.
- Web `pnpm build`: exit 0, including bundle budget checks.
- Browser fixture verified four lifecycle columns, automatic/manual source filtering, return filters and absence of manual controls on automatic cards.
- Checked 390px viewport: Kanban scrolls within its board; document width did not overflow.
- Screenshots: `2026-11-03-automatic-tasks-desktop.png`, `2026-11-03-automatic-tasks-mobile.png`.

## Runtime and limits

- Publication completed at 2026-11-03 21:40 local time. API readiness returned 200; the served web index matched the production build and all eight referenced entry assets returned 200. Prisma reported all 132 migrations up to date.
- Executed `maintainScreeningCases()` in the updated notification-worker container: exit 0, `Screening maintenance completed`.
- Reloaded Nginx after a stale upstream produced a transient 502 following Docker recovery. The new automatic-task route through port 8080 then returned the expected 401 without authentication.
- Localhost publication is recorded in `apps/backend/scratch/obligation-deployment-*/deployment.json`; API/worker code and previous web index are backed up before publication. Previous hashed assets are preserved.
- The only new application migration adds the task ledger and its events. It does not delete ballots, decisions, discussion or extraction history.
- Docker's WSL VM is limited to 4 GB; logs showed actual OOM kills with all workers running. With user approval, unused AI, ingestion and compilation workers were temporarily stopped. PostgreSQL, Redis, API, web and notification maintenance remain the required running services for this verification.
- UI checks used a local fixture. The private project session was signed out, so a complete live multi-account browser walkthrough was not performed. Backend persistence tests cover the real actor, transaction and permission transitions.
- Worker logs also contain retries of older Contribution email jobs because the runtime uses production mode with an HTTP origin. This separate email configuration issue was not changed; Screening maintenance completed successfully and in-app case notifications were verified in persistence tests.
- The existing review form has no persisted draft workflow; opening a task therefore leaves it TODO. IN_PROGRESS is used only where a saved business transition exists.
- No commit or push was performed for this request.
