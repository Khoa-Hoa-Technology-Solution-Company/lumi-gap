# Mentor Workspace

> **2026-11-16 update:** [Version-scoped mentor review access and verification report](MENTOR_REVIEW_SCOPED_ACCESS.md) is the current behavior. New student deliveries atomically create a canonical review request and a grant for its pinned version; they no longer require broad `SUBMISSIONS_VIEW` plus manual sharing. Proven historical deliveries use the authorized recovery entry. The manual-sharing/blocker notes and earlier test counts below are retained as historical context and are superseded by that report.

Implemented locally in `D:\lumi-gap` on 2026-11-14. No commit, push, or production deployment is part of this task.

## Entry points and user experience

- `/mentor-workspace`: a lecturer's global overview, priority work queue and searchable mentored-project directory. The existing lecturer navigation points here.
- `/mentor-workspace?view=work`: searchable, paginated personal work with project, type and status filters, priority/deadline sorting, and optional grouping by project or status. Groups apply to the current page.
- `/mentor-workspace?view=projects`: accepted project relationships, team lead and size, research field/stage, update time, outstanding work count and project links.
- `/projects/:id?tab=tasks`: the same work projection restricted to the current project. Exact task/discussion links open that item's existing context. Team overview and mentor chat remain available.
- Invitations stay in `/academic-support?view=incoming`; notifications stay in `/notifications`. An invitation is not a work assignment.

The dashboard uses compact summary counts and a list of actionable work, without charts or synthetic analytics. Loading, retry, empty, keyboard-focus and responsive layouts follow the existing components and tokens. New copy is available in English and Vietnamese.

## Data and authorization

`GET /api/v1/projects/academic-support/workspace` returns a read-only projection over existing records. No task model, task scheduler or duplicate task records were added.

The projection requires an active, email-verified lecturer with verified role and position. Every included project has an accepted invitation, active mentorship relationship and effective, unexpired, unrevoked mentor access. Deleted projects are excluded. Archived/completed projects remain readable but produce no actionable work.

Included work:

1. Existing project tasks assigned directly to this mentor, excluding deleted tasks and other assignees' tasks.
2. Mentor-guidance manuscript/proposal review requests with an exact matching reviewer assignment and pinned artifact revision. Effective `SUBMISSIONS_VIEW` permission and an unrevoked share of that exact manuscript are required. Formal external peer review stays in its existing review center.
3. Explicit questions associated with a plan revision shared with this mentor relationship. After the mentor replies, the question becomes waiting for the team; after resolution it is completed. Unshared and cross-project threads stay inaccessible.

Only the legacy generated `Cần góp ý bản thảo…` task is suppressed when its canonical review request is included. A separately assigned task about the same manuscript remains visible.

### Unshared legacy review tasks (2026-11-15)

A legacy feedback assignment can exist while the accepted mentor only has `MENTOR_CHAT` permission and no submission share. Previously this appeared as ordinary TODO work and opened a description without a next action. These tasks now project as BLOCKED, explain the missing manuscript access and link to the existing mentor conversation only when `MENTOR_CHAT` is effective. Existing task detail URLs show the same explanation and recovery action. This does not grant permissions or modify existing task records.

When the owner enables `SUBMISSIONS_VIEW` (UI: `Xem thông tin nộp bài đã chia sẻ`) and shares the exact submission, the projection removes the access warning and links to `/submissions/:id`, where the existing authorized mentor-review action opens the pinned review workspace. Old task detail URLs also expose an `Open manuscript` action. Revoking the share blocks the task again. No private submission identifier is exposed in the blocked queue entry.

Verification for this correction: 15 isolated PostgreSQL tests and 16 web tests passed; shared-contract compilation, backend/web type checks and targeted ESLint passed. Confirmed the real blocked LumiGap item and its working team-conversation link in the existing local mentor session. The real project's permissions and shares were left unchanged.

Default ordering: overdue actionable work, blocked work, due within 48 hours, pending reviews, ordinary tasks; then priority, deadline and stable record ordering. All filters are validated and SQL values are parameterized, including literal wildcard searches. Pagination is performed after server filtering and sorting.

Query caches are keyed by signed-in actor. A denied refetch hides cached private work. Task/discussion commands, review drafts/submission, invitation decisions and review-request actions invalidate the aggregate queue; the queue also refreshes every 30 seconds while open.

## Mentor review outcomes

The existing review workspace provides three explicit choices:

- **Comment**: submit version-bound feedback without an assessment or mandatory revision items. The request is completed; the manuscript does not become `READY_TO_ADVANCE`.
- **Request changes**: existing minor/major/not-ready assessments, rubric and integrity checks, plus actionable revision items. Author responses and subsequent rounds retain the existing workflow.
- **Approve internally**: the existing `STRONG` assessment, with rubric, integrity and unresolved-revision gates. This is internal readiness, not publication acceptance.

The explicit comment-only choice is preserved in the existing recommendation field (`COMMENT_ONLY`) for drafts and immutable submitted history. It is rejected for formal peer review, cannot accompany an approval or required changes, and cannot close unresolved previous revision items. Existing records and assessments are preserved.

Existing AI pre-review output is displayed read-only only when its `sourceRevisionId` matches the exact review revision and it has completed. The reviewer cannot launch AI from this panel. AI output never selects an assessment or grants readiness.

## Main files

- Backend projection and validation: `apps/backend/src/modules/projects/mentor-workspace.service.ts`, `mentor-workspace.controller.ts`, `dto/mentor-workspace.schema.ts`, mounted in `project.routes.ts`.
- Shared contracts: `packages/shared-types/src/mentor-workspace.ts`, exported from `index.ts`; `research-review.ts` adds the optional comment-only input.
- Global UI: `apps/web/src/pages/academics/mentor-workspace.tsx`.
- Reused project UI/API: `apps/web/src/features/projects/components/mentor-work-queue.tsx`, `mentor-project-tasks.tsx`, `api/mentor-workspace.api.ts`, `hooks/use-mentor-workspace.ts`, `mentor-workspace.css`.
- Navigation and refresh: `apps/web/src/routes/app-routes.tsx`, `layouts/MainLayout.tsx`, `pages/academics/academic-support.tsx`, `features/projects/hooks/use-workspace.ts`, `features/reviews/hooks/use-reviews.ts`.
- Review changes: `apps/backend/src/modules/reviews/review.service.ts`, `review.routes.ts`; `apps/web/src/pages/reviews/review-workspace.tsx`, `features/reviews/components/mentor-review-outcome.tsx`, `assigned-review-advisory.tsx`, `scientific-review-model.ts`, `api/reviews.api.ts`, `pages/reviews/review-request-detail.tsx`.
- New translations: `apps/web/src/i18n/locales/mentor-workspace.ts`, registered in `en.ts` and `vi.ts`.

## Verification

Run from `D:\lumi-gap`:

```powershell
node apps/backend/scripts/test-mentor-workspace.mjs
pnpm --filter web exec vitest run src/features/projects/__tests__/mentor-workspace.test.tsx src/features/reviews/__tests__ src/pages/academics/__tests__/academic-support.test.tsx --maxWorkers=1 --minWorkers=1
pnpm --filter backend typecheck
pnpm --filter web typecheck
pnpm --filter backend build
pnpm --filter web build
```

The database runner creates and migrates a randomly named local throwaway PostgreSQL database, and removes only that database afterward. It refuses non-local PostgreSQL. Use `--workspace-only` for a focused rerun without repeating the existing mentor-access suite. No project data is seeded or changed in the application's normal database by these tests.

Executed verification:

- PostgreSQL mentor access: 28 passed; initial workspace suite: 13 passed; final focused workspace rerun after the independent-task fix: 14 passed (42 distinct backend tests across the two suites).
- Web: 66 distinct tests passed across Mentor Workspace, existing Academic Support and the review component suites. An initial asynchronous-render test issue was fixed and the affected advisory tests rerun successfully. The final review UI adjustment also passed its 4 focused regression tests.
- Backend and web type checks passed; backend build passed, including 4 PostgreSQL-only runtime-boundary tests.
- Targeted ESLint for new workspace/review files and touched service/components passed.
- Opened `/mentor-workspace` in the browser using the existing mentor session and verified real project/work counts and task routes. Local API health and the workspace URL returned HTTP 200.

Web production build and its bundle-budget check passed. Existing Vite notices about large chunks and a mixed static/dynamic import remain; there were no build errors. Existing changes elsewhere in this checkout belong to earlier work and are preserved.

## Deliberate limits

- No Kanban: the optional view was omitted in favor of the requested default list.
- Academic-decision/support work appears when represented by an existing directly assigned task or an explicitly shared proposal question. No new decision-request workflow was invented.
- Unstructured mentor chat messages are not automatically converted into tasks. Notifications and general team tasks stay separate.
- Existing task status editing permissions and invitation limits remain in force.
