# Paper cards in My Work

## Scope

Redesigned cards for `tab=papers&view=my-work` and reused the same components for Screening Tasks. Review rules, assignment, adjudication, permissions, personal ballots and historical records are unchanged. No new endpoint, write operation, table or migration.

## Implementation

- `screening-paper-card.tsx` owns the shared card, task actions, evaluation summary and disclosed ballots. All three Papers tabs and both Screening Tasks tabs use this structure.
- Information order: round/phase, status, title, authors, year/journal, submitted-review progress, context, deadline and action. Missing metadata is omitted. Long titles and reasons wrap; reasons are limited to two visible lines, with the existing detail action exposing full context.
- `workspaceSummary.workPapers` is an additive read projection of rounds already present in the authorized summary. The batch query returns paper metadata, round snapshot, effective submitted count, configured required count, disclosed choices and final-decision provenance. It does not return peer comments or sealed statements.
- Disclosure reuses `screeningReviewsVisible`; effective assignments follow current membership and claim-expiry rules. Submitted revisions count as one assignment rather than additional reviewers. Database tests cover 0/2, blinded 1/2 and disclosed 2/2.
- Acceptance is derived from the immutable round protocol and `acceptedForAnalysis`. Passing an intermediate title/abstract round is shown as `Qua vòng N`, without inventing a final selection. The existing single-stage acceptance policy still works.
- Case collection, waiting assignment, assignment, adjudication and information requests have separate labels. Unsure remains distinct from a binary disagreement. Personal decisions and team outcomes are separate fields, with discussion/adjudication provenance.
- A shared clock uses the backend deadline directly; expiry updates tasks and counters and refetches the summary. Claim extension/release reuse existing commands and cache invalidation, display errors and only report success after successful requests.
- Paper actions carry the exact round and section. Case actions focus the existing statement/decision/coordination region. The discussion selector now supports its existing `data-screening-section` attribute.

## Verification

- **123/123 web tests passed** in eight suites: screening-paper-card (18), screening-tasks-panel, my-work-model, adjudication-reminder, screening-adjudication, task-first-papers-workspace, screening-workspace and screening-case.
- **67/67 PostgreSQL integration tests passed** in screening-case and screening-slots, against the isolated `lumigap_evidence_workspace_test` database. New assertions verify effective card progress and peer-choice disclosure.
- Shared-types build, backend TypeScript emit and the full web production build passed.
- Playwright fixture checks passed at **1280px and 390px**, across Papers and Tasks, with 0/2, 1/2, 2/2, disagreements, statements, assigned adjudication, waiting, selected, excluded and unsure states. No horizontal page overflow or browser exceptions. Long reasons were visibly clamped. Screenshots were also inspected in light and dark modes.
- Browser checks use an isolated fixture rather than modifying a real user's papers. Real state transitions and permissions are verified by the PostgreSQL suites.
- A duplicate `draft` translation blocked a build during concurrent changes elsewhere in the repository. Removed the earlier overridden key, preserving the effective translation. The other concurrent submission-page type/import errors were resolved in the shared workspace before the final build.

Reproduce:

```powershell
node apps/backend/scripts/test-screening-cases.mjs --tasks --slow
pnpm --filter web test src/features/projects/__tests__/screening-paper-card.test.tsx src/features/projects/__tests__/screening-tasks-panel.test.tsx src/features/projects/__tests__/my-work-model.test.ts src/features/projects/__tests__/adjudication-reminder.test.tsx src/features/projects/__tests__/screening-adjudication.test.tsx src/features/projects/__tests__/task-first-papers-workspace.test.tsx src/features/projects/__tests__/screening-workspace.test.tsx src/features/projects/__tests__/screening-case.test.tsx
pnpm --filter web build
# In apps/web, run the fixture and verifier in separate terminals:
node scripts/paper-card-preview.mjs
node scripts/verify-paper-card-ui.mjs
```

Logs and screenshots: `apps/web/scratch/paper-card-*.log` and `apps/web/scratch/paper-card-ui/`.

## Local runtime

Updated the compiled Screening service, its new read-projection helper, and web assets in the existing containers. Backend readiness returned HTTP 200. Old hashed assets are retained and the new index is published last. The update survives restarts; recreating containers from older images requires rebuilding them from the repository. No automatic commit or push.
