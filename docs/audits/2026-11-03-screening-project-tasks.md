# Paper Screening in Project Tasks

Implemented on 2026-11-03. Entry: `/projects/:projectId?tab=tasks`.

## Behaviour

- The default Tasks view is **Đánh giá tài liệu → Cần xử lý**. The existing team board, list, task editor, milestones and their APIs remain available beside it.
- Pending work is separated into **Đang đánh giá**, **Cần giải quyết**, and **Cần tôi phân xử**. Coordination work appears in Cần giải quyết only for authorized independent coordinators.
- **Đã đánh giá** includes every submitted personal ballot, including unresolved disputes. Its filters are Chưa có kết quả / Đã có kết quả / Toàn bộ lịch sử. Counts are independent of actionable tasks, and papers are grouped with older rounds underneath.
- Task rows are derived from the existing screening workspace summary. No ProjectTask rows, duplicate task store, schema change, or migration were added.
- A reviewer who has submitted a statement has no remaining statement task while waiting for the other reviewer or adjudicator. Expired claims and expired statement deadlines are omitted.
- The shared summary reconciles expired cases under the existing project transaction lock. Missing statements remain absent; no consent or opinion is fabricated. Assignment follows the existing deterministic policy and independent coordination rules.
- Personal ballots and team results remain separate. The API provides the round number, current case status, reason, source context, and whether inclusion actually completes the configured screening process. A stage-only inclusion is labelled Qua vòng; final eligibility can be labelled Được chấp nhận.
- Assignment/coordinator links reopen the scoped dossier at the statement, decision or coordination form. Review/discussion/history links contain both paper and round IDs. Historical rounds are fetched directly, so pagination and later rounds cannot silently change the target. A paper/round mismatch is rejected.
- Adjudicators can choose Qua vòng / Loại theo tiêu chí / Cần bổ sung thông tin. Rationale and grounds are required; an information request additionally requires source context and does not create a binary final decision.
- An independent coordinator can act on conflict reports through the existing REVIEW_CONFLICT API, with a recorded reason.

## Security and history

- Existing project authorization and scoped case permissions are reused. Mentors retain their existing scoped adjudication workspace; no general Project Tasks or library access is granted.
- Fixed a pre-existing disclosure: another reviewer's supplement could be returned before the common deadline/lock. Until both participants finish or time expires, only the author sees their supplement. The UI also suppresses text marked hidden.
- Locked packets, own-statement permissions, assignee-only resolutions, coordinator-only reassignment, original ballots, immutable decisions and revision history remain protected by the existing backend services.
- Read-only project status suppresses actionable work even if an older client supplied a writable view flag.

## Main files

- Web: `components/workspace-tasks.tsx`, new `components/screening-tasks-panel.tsx`, `my-work-model.ts`, shared evaluation components in `components/my-work-view.tsx`.
- Navigation/forms: `components/reading-paper-modal.tsx`, `components/research-literature.tsx`, `components/screening-round.tsx`, `components/screening-adjudication.tsx`, `components/screening-case-controls.tsx`.
- Backend: `screening.service.ts`, `screening-case-context.ts`.
- Contract: `packages/shared-types/src/project-screening.ts`.
- Test runner: `apps/backend/scripts/test-screening-cases.mjs` supports `--tasks` for the case and slot suites together.

All component paths above are under `apps/web/src/features/projects/`; backend modules are under `apps/backend/src/modules/projects/`.

## Verification

- Web: **105/105** tests passed in seven suites: screening-tasks-panel, my-work-model, adjudication-reminder, screening-adjudication, task-first-papers-workspace, screening-workspace, screening-case.
- PostgreSQL: **67 distinct cases passed across the combined run and targeted retry**. These are the 34 case tests and 33 slot tests, against `lumigap_evidence_workspace_test`, with email delivery disabled. The combined run passed 61; six encountered connection/transaction timeouts during a concurrent build. All six passed when rerun after the build. The case suite had also passed 34/34 in a separate full run. No assertions or permission checks were weakened to address timeouts.
- Coverage includes first submission, binary disagreement, separate A/B statements, common deadline expiry, direct assignment, reasons, information requests, expired/released claims, concurrent requests, no third ballot/chat, scoped mentor access and historical results.
- Shared-types build, backend TypeScript emit and web production build passed.
- Playwright fixture checked pending groups, reviewed results, filters, direct URLs and reload at 1280px and 390px. No horizontal overflow or browser exceptions. Screenshots: `apps/web/scratch/tasks-ui/`.
- Logs: `apps/web/scratch/tasks-*.log`. Fixture: `apps/web/scripts/screening-tasks-preview.mjs`; browser check: `apps/web/scripts/verify-screening-tasks-ui.mjs`.

Reproduce:

```powershell
node apps/backend/scripts/test-screening-cases.mjs --tasks --slow
pnpm --filter web exec vitest run src/features/projects/__tests__/screening-tasks-panel.test.tsx src/features/projects/__tests__/my-work-model.test.ts src/features/projects/__tests__/adjudication-reminder.test.tsx src/features/projects/__tests__/screening-adjudication.test.tsx src/features/projects/__tests__/task-first-papers-workspace.test.tsx src/features/projects/__tests__/screening-workspace.test.tsx src/features/projects/__tests__/screening-case.test.tsx --maxWorkers=1 --minWorkers=1
```

## Local runtime

Compiled backend modules and web assets are applied to the existing localhost containers. This survives a container restart. Recreating containers from old images requires rebuilding images from this repository. No new migration is needed for this integration.
