# Reviewer count and team size

## Read-only diagnosis

The reported project has four active members. Its current independent rounds use
workflow V5 with `requiredReviewers: 2`, and each has two assignments. Reviewer
pairs differ across papers. The reported first-round pair matches the stored
assignments. Team membership does not create an additional screening ballot.

The round snapshot contains empty research questions, inclusion criteria and
exclusion criteria. This is missing research configuration, rather than lost
member data. No real assignments, criteria, reviews or memberships were changed.

## Changes

- Explain team eligibility, configured reviewer count and per-paper assignment.
- Label the assigned reviewer list and mark the viewer's assignment with “Bạn”.
- Explain explicitly why an unassigned member, including an owner, has no ballot.
- Replace blank frozen-criteria lists with an explicit “Chưa thiết lập” state.
- Warn when both inclusion/exclusion criteria are absent. The warning does not
  invent research criteria or rewrite a historical round snapshot.

## Verification

- 25 web screening tests passed, including four new cases covering four team
  members vs. two reviewers, unassigned member/owner views and missing criteria.
- 68 isolated PostgreSQL screening tests passed. The new four-person regression
  verifies exactly two non-proposer assignments, actor-specific `canReview`,
  rejection of forged extra ballots and automatic consensus after two reviews.
- Web TypeScript, targeted ESLint and production build passed.
- Browser fixture verified reviewer and unassigned-owner views using synthetic
  data. Screenshot: `2026-10-31-screening-reviewer-context.png`.
- Updated the web container at localhost:8080. No backend runtime or migration
  change was needed.

Evidence logs: `2026-10-31-screening-reviewer-context-persistence.log` and
`2026-10-31-screening-reviewer-context-web-build.log`.

Read-only diagnostic command:

```powershell
pnpm --filter backend exec tsx scripts/inspect-screening-assignments.ts <public-project-id>
```
