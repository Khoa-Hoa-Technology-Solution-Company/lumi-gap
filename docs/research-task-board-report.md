# Research task board implementation

Date: 2026-10-15. Branch: `codex/research-task-kanban`.

## Audit and scope

The project already had canonical `ProjectTask`, milestones, workspace comments,
immutable revisions, project activity, notifications and contribution governance.
The previous task UI was a paginated list with an inline editor. This implementation
extends those records and APIs; it does not create a second task store or team model.
The existing project shell, research stages and milestone module are reused.

## Delivery status

| Feature | Status | Implementation and evidence |
| --- | --- | --- |
| Create, edit, assign, complete | IMPLEMENTED | `apps/backend/src/modules/projects/project-tasks.service.ts`; HTTP and browser scenarios in `research-task-board.e2e.test.ts` |
| Board and list | IMPLEMENTED | `apps/web/src/features/projects/components/workspace-task-board.tsx`; four independently paginated columns with authoritative totals |
| Drag, keyboard reorder, status menu | IMPLEMENTED | `@dnd-kit/react` sortable handles; versioned move API; browser persistence and rollback scenario |
| Search, My Tasks, unassigned, overdue, filters/sorts | IMPLEMENTED | Canonical task query with authenticated actor; priority/member/milestone filters; list status and ordering controls |
| Task drawer and deep links | IMPLEMENTED | `workspace-tasks.tsx`; Radix Sheet, `?task=`, unsaved draft guard and explicit conflict recovery |
| Priority and deadlines | IMPLEMENTED | Four priorities; calendar deadline presentation and server overdue query |
| Subtasks and checklists | IMPLEMENTED | One level of independently assignable tasks; stable checklist UUIDs; parent completion constraints |
| Comments, mentions, history | IMPLEMENTED | Existing workspace comments and immutable revisions; `workspace-task-history.tsx` renders readable changes |
| Research artifact linking | IMPLEMENTED | Project-scoped picker, validators and resolved snapshot/mentor feedback links |
| Contextual creation | PARTIAL | Evidence detail and working manuscript actions; paper/gap contextual actions use the canonical picker in the drawer |
| Notifications | IMPLEMENTED | Durable, deduplicated in-app rows inside the task transaction; assignment, reassignment, mentions, block/unblock and deadline changes |
| Milestones and Overview | IMPLEMENTED | Existing milestones retained; actual subtask/completion metadata in Overview; date-only overdue count |
| Contributions | IMPLEMENTED | Completion and artifact-link activity enters existing contribution activity; no automatic percentage allocation |
| Resource authorization and archive | IMPLEMENTED | Live team/account authorization inside project transaction; private task data remains team-only |
| Retention and migration | IMPLEMENTED | Additive SQL migration; soft deletion keeps authorized deep links and immutable evidence |
| Mobile, tablet, dark theme | IMPLEMENTED | Horizontally scrolling board, responsive drawer and existing theme tokens; Chromium screenshots |
| Task dependencies | NOT_IMPLEMENTED | P1; no dependency graph introduced |
| Workload dashboard and recurring reminders | NOT_IMPLEMENTED | Optional/P1 features outside this implementation |
| Live multi-browser subscriptions | NOT_IMPLEMENTED | Query invalidation/focus refresh and explicit version conflicts are used |

## Domain and persistence decisions

- Statuses remain `TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`. Team members may move
  between them subject to blocker, parent and unfinished-child rules.
- `BLOCKED` requires a reason. Leaving it clears the active reason while preserving
  it in immutable history. Discussion and editing remain available.
- One primary assignee must be a current active team account on assignment/reassignment.
  Existing assignments to departed members remain historical; departure never grants
  access. The completion actor is recorded separately from the assignee.
- A parent cannot become a subtask while it has live children. Children must belong
  to the same project, cannot themselves be parents and cannot point to themselves.
- Parent completion is explicit and requires every live child to be done. Reopen the
  parent before adding or reopening unfinished child work. Checklist completion is
  lightweight and does not independently assign work or complete the parent.
- Deadlines use UTC calendar dates at midnight. Today is not overdue; completed work
  is not overdue. The UI states this calendar policy. Existing recorded UTC dates are
  retained during normalization.
- Legacy completion actors remain unknown rather than being inferred from assignees.
- A task is soft deleted. Authorized teammates can read its tombstone/history/comments;
  writes and new comments are rejected. Parents with live children cannot be deleted.
- Task completions are work evidence, not scientific validation or an effort score.
  Contribution allocation remains the existing separate consent-based workflow.

### Schema and migration

`apps/backend/prisma/migrations/20261015000200_research_task_board/migration.sql`
adds the board version, priority enum, integer rank, scoped parent reference, checklist
JSON and completion actor. Existing IDs, comments, revisions and contributions survive.
It backfills deterministic ranks from prior creation order and adds board/parent indexes.
The same-project composite parent FK and no-self-parent constraint protect basic integrity.
Application transactions enforce one-level nesting and progress rules.

The disposable PostgreSQL database has all 74 migrations applied successfully.
Deploy this migration before serving code that reads the new columns. Use the repository's
`pnpm --filter backend db:migrate:deploy`; never use `prisma migrate dev`.

## API, concurrency and authorization

Existing task/list/detail/update/delete/comment and milestone endpoints are retained.
New endpoints:

- `GET /projects/:id/tasks/board`: bounded pages for each status, actual totals and board version.
- `POST /projects/:id/tasks/:itemId/move`: task version, board version, destination,
  insertion anchor, blocker reason and retry UUID.
- `GET /projects/:id/workspace/artifacts/:itemId?kind=...`: authorized deep-link resolution.

DTOs reject unknown fields, forged actors, invalid enums, duplicate checklist IDs and
cross-project references. All new mutations use the existing `createRateLimiter`.
Queries use Prisma/parameterized SQL. No user-supplied HTML is injected.

Project locks serialize task changes, ordering and archive/membership races. Stale
task or board versions return conflicts. Creation retries compare the original request;
update retries recognize the applied revision without silently adopting a later version.
Move retry UUIDs deduplicate activity. The board renders an optimistic move and refetches
authoritative state after success/rejection. A stale drawer retains its draft and original
version, then offers an explicit Load latest action.

Owners and active members can collaborate. Task deletion is limited to owner/creator.
Mentorship, formal review assignment, public project visibility and admin role alone do
not grant private team task access. Existing explicitly shared academic discussions remain
separate. Removed members immediately lose task access. Archived projects preserve reads
and reject writes on the server.

## Research integration and notifications

`workspace-access.ts` validates papers, screening items, evidence, gaps, plan questions,
plans/revisions, manuscripts/snapshots, mentor feedback, review requests and reports
against the current project. References never copy private artifact bodies or grant access.
`project-overview.service.ts` supplies the picker and resolves snapshot/feedback destinations.
Contextual Evidence and Manuscript actions open the same canonical task form with a link;
the manuscript action flushes pending edits before navigating.

`workspaceNotify` writes existing notification rows in the same transaction. Event keys
prevent duplicate notifications on retry; slow email does not run inside task creation.
This release uses in-app notifications and marks email skipped. It does not add reminder
scheduling or change notification delivery preferences.

`contribution-activity.service.ts` includes `TASK_ARTIFACT_LINKED` alongside actual task
completion activity. Completion actor/history preserves attribution across reassignment.
No checklist counts, priority, punctuality or task totals change allocation percentages.

## UI implementation

- `workspace-task-board.tsx`: cards, status columns, board/list, filters, due dates,
  assignee initials from actual names, keyboard/pointer handles and per-column pagination.
- `workspace-tasks.tsx`: title-first creation, progressive details, editable task drawer,
  subtasks, checklists, comments/history, milestones and retained deep links.
- `workspace-task-history.tsx`: actor/time and field before/after timeline.
- `workspace-task-utils.ts`: shared form/status/date helpers; board code is lazy loaded.
- `research-tasks.css`: existing white/blue product direction, compact spacing, restrained
  status colors, clear focus/drag feedback, responsive drawer, dark theme and reduced motion.
- `apps/web/src/i18n/locales/research-tasks.ts`: Vietnamese and English copy.
- Shared API contracts: `packages/shared-types/src/project-workspace.ts`.

The native status menu provides a drag alternative. The Sheet supports keyboard focus,
Escape and accessible titles. Long titles wrap; names truncate with full-name tooltips.
The mobile board scrolls inside its region instead of squeezing four columns onto a phone.

## Verification

| Check | Result | Evidence |
| --- | --- | --- |
| PostgreSQL + HTTP + Chromium task scenarios | PASS, 15/15 | `apps/backend/src/modules/projects/__tests__/research-task-board.e2e.test.ts`; local `task-e2e.log` |
| Backend regression | PASS, 87/87 | Workspace collaboration 26, collaborative research 12, contributions 17, creation/team 17, schemas 6, rules 9; local `backend-tests.log` |
| Frontend regression | PASS, 109/109 in 12 files | `pnpm --filter web exec vitest run src/features/projects/__tests__ src/features/manuscripts/__tests__ --maxWorkers=1 --minWorkers=1`; local `web-tests.log` |
| PostgreSQL runtime boundary | PASS, 4/4 | Backend build runs `runtime:audit:postgres`; local `backend-build.log` |
| TypeScript | PASS | Shared types build, backend `tsc --noEmit`, web `tsc -b` through production build |
| Targeted ESLint | PASS, zero warnings | Changed backend and frontend source/tests; local `backend-lint.log`, `web-lint.log` |
| Production build | PASS | `pnpm --filter backend build`, `pnpm --filter web build`; local build logs |
| Database migration state | PASS, 74 applied | Disposable PostgreSQL `_prisma_migrations`, including new additive migration |

The first combined backend run had one browser assertion failure because the drag library
temporarily renders an inert placeholder with the same task ID. The test now waits for
the persisted API status and selects the real card. The final complete 15-scenario task
suite passes, including keyboard ordering. A CSS specificity collision that clipped native
status text was fixed and verified with a browser layout assertion and screenshot.

Browser scenarios verify actual notifications, scope checks, blockers, completion actor,
parent/child constraints, checklist validation, move retries, competing edits, independent
column paging, snapshot/feedback destinations, deletion retention, drawer creation/comments,
mouse/keyboard reorder persistence, rejection rollback and two-browser conflict recovery.

Screenshots use synthetic test fixtures and are stored under `artifacts/research-task-board/`:
`board-empty.png`, `board-desktop.png`, `list-desktop.png`, `drawer-desktop.png`,
`board-dark.png`, `board-tablet.png`, `board-mobile.png`, `drawer-mobile.png`.
Desktop, drawer, dark and mobile screenshots were visually inspected; tablet/mobile page
and drawer overflow assertions pass. Run logs are local diagnostic artifacts, not credentials
or production data. Production deployment was not performed.

Known limits: artifact picker searches return up to 50 results; subtasks support one level;
deadline timezone is explicitly UTC; board filters/search apply to loaded queries rather
than subscriptions; contextual creation is available on Evidence and working Manuscript,
with the other artifact types available through the validated picker.
