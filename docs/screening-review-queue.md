# Paper Review Queue UX

Implemented 2026-11-09. This change reuses the existing Screening rounds,
assignments, claim commands, Paper Reader and My Work. It introduces no migration.

## User experience

- Search title, authors, DOI and keywords with a 250 ms debounce and a 200-character limit.
- Filter all available papers, papers without reviewers, or papers with one remaining slot.
- Counts describe the viewer's entire eligible queue; search results have a separate count.
- Cards distinguish occupied slots, remaining slots and submitted reviews. A held slot
  is never counted as a submitted review. Papers awaiting their second review come first.
- Preview opens the source section without claiming. Claim and Claim Next use the
  backend's canonical paper and round IDs, then open the Reader's review section.
- Successful commands refresh the existing project research query family, including
  Queue, My Work and Screening tasks. Failed claims refresh stale availability and
  display a friendly message, including races for the final slot.
- The Reader moves keyboard focus into the requested form after its dialog mounts.
- Loading skeletons, empty states, retry, pagination clamping, Vietnamese/English
  strings and a responsive shared card replace the old queue presentation.

The existing binary Include/Exclude choices are preserved, as explicitly confirmed
by the user. Claim deadlines, extension limits, proposer restrictions, blind review,
saved protocols and disagreement resolution continue to be enforced by existing
backend services. Archived/completed projects cannot supply actionable queue entries.

## Files for this task

Paths below are relative to the repository root. Some also contain earlier work;
this list does not imply that all their uncommitted changes belong to the queue task.

| Area | Files |
| --- | --- |
| Shared contract | `packages/shared-types/src/project-screening.ts` |
| Queue summary and eligibility | `apps/backend/src/modules/projects/screening.service.ts`, `screening-slots.ts` |
| Queue presentation | `apps/web/src/features/projects/components/screening-queue-view.tsx`, `screening-queue-card.tsx`, `../screening-queue.css` |
| Shared card and navigation | `apps/web/src/features/projects/components/screening-paper-card.tsx`, `my-work-view.tsx`, `reading-paper-modal.tsx`, `screening-round.tsx` |
| Translations | `apps/web/src/i18n/locales/screening-queue.ts`, `en.ts`, `vi.ts` |
| Backend tests | `apps/backend/src/modules/projects/__tests__/screening-queue.persistence.test.ts`, `apps/backend/scripts/test-screening-queue.mjs` |
| Frontend tests | `apps/web/src/features/projects/__tests__/screening-queue-view.test.tsx`, `task-first-papers-workspace.test.tsx`, `screening-workspace.test.tsx` |

## Verification executed

- Shared-types compilation; backend production TypeScript build; web TypeScript check.
- 40 backend tests passed: 13 queue persistence cases, 5 lease/schema cases,
  and 22 consensus persistence regressions.
- 89 frontend tests passed across queue, task-first workspace, shared card and
  Screening workspace. The final Reader focus regression test was then added and
  the workspace suite passed again with 47 tests (90 distinct frontend cases total).
- Production web build and bundle budget check passed.
- Scoped frontend and backend ESLint and `git diff --check` passed.

Backend reproduction from the repository root:

```powershell
node apps/backend/scripts/test-screening-queue.mjs --env-file D:\lumi-gap\.env
```

The runner accepts only a local PostgreSQL host and derives the separate
`lumigap_screening_queue_test` database. It does not migrate or reset the application
database. Its tests create their own fixtures.

Browser QA used a temporary API on port 8097 and Vite on 8098 against that isolated
database. It verified English/Vietnamese presentation, priority order, preview
without claiming, claim-next opening the exact review round, hidden peer rationale
before submission, successful submission publishing both reviews, Queue count
decreasing from 3 to 2, and immediate My Work synchronization. Mobile viewport
390 × 844 had equal document client/scroll widths, with no horizontal overflow.
The mobile check also caught and fixed insufficient contrast on the claim button.

## Limits and delivery

- No production data was changed and no deployment to localhost:8080 was performed.
  Deployment awaits the authorization required by the task prompt.
- No commit or push was made by this task.
- Full-text availability and AI insights remain dependent on the existing Reader's
  sources, saved protocol and permissions; no AI request was introduced.
- Preview remains read-only: close it to claim from Queue.
- Queue status polling uses the existing ten-second interval between actions;
  commands refresh immediately, while backend transactions remain authoritative.
