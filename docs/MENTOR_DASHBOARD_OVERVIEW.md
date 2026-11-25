# Mentor dashboard overview

The `/mentor-workspace?view=overview` page uses the existing mentor workspace API and verified-lecturer access checks. It is a work dashboard, not a project-wide analytics report.

## Interface

- A compact summary links to mentored projects, actionable work, all actionable manuscript/proposal reviews, and pending mentorship invitations.
- Overdue and blocked notices appear only when their counts are positive.
- The main list reuses `MentorWorkRows`, including the exact revision, sender, deadline, access warnings and canonical request/review destination.
- Recently updated teams show their project status, research stage, team lead, membership count and project-scoped pending work. The overview always requests the first project page, independent of project-list pagination.
- Review Center and Review Templates open inside the existing mentor sidebar.
- Manual refresh and the existing 30-second polling refresh real server data. Errors hide previously loaded private work. The overview waits for its own result when navigating from another filter.
- Layout stacks on narrow screens; controls retain accessible labels, keyboard focus indicators, and Vietnamese/English translations. Existing theme tokens supply light/dark colors.

## Filter corrections

`status=OVERDUE` is a validated query filter applied before SQL pagination. It requires actionable work and a past deadline. Completed work, undated work and future deadlines are excluded. It does not change the underlying task status or permissions.

The review count already includes manuscript and proposal reviews. Its shortcut now uses `kind=REVIEW`, and the queue exposes that option instead of silently narrowing the count to manuscript reviews.

No database migration or new endpoint is needed.

## Verification

- Web: 52 tests passed across mentor workspace, navigation and embedded review shell tests, including new filter, empty, project action, overview pagination and stale-access regressions.
- PostgreSQL: 30 tests passed, one optional interactive fixture test skipped, using `node scripts/test-mentor-workspace.mjs --workspace-only`. The runner creates a separate database, applies migrations and removes only that generated database.
- Shared types build, web production build, backend TypeScript check and targeted frontend/backend ESLint passed.
- Browser visual QA remains unverified: the in-app browser could not attach, and Windows browser automation stopped because URL policy enforcement is unsupported. Desktop/mobile CSS has been implemented but needs a human visual check.

Local development runs through Vite on port 8080 and the native backend on port 4000. Source changes update directly; no Docker web image replacement is needed.
