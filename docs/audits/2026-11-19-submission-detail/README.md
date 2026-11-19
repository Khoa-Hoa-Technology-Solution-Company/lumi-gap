# Submission Detail: audit, implementation and verification

Date: 2026-11-19. Workspace: `D:\lumi-gap`.

## Scope and outcome

The student manuscript-feedback detail page uses the existing submission, revision,
review request and human-review records. The redesign applies to any submission
and project; no example project or submission ID is embedded in application code.

The working tree already contained an unfinished redesign when this audit began.
This work completed and hardened that implementation. Other uncommitted changes
in manuscript writing, screening, evidence and mentor discovery were preserved.
No commit, push, deployment, production secret change, application-data deletion,
database reset or migration-history repair was performed.

## Before and after

The earlier detail page combined upload, AI analysis, external review, status,
comparison and contribution sections in a long page. The initial redesign still
had incorrect or incomplete behavior around accepted requests, historical versions,
PDF failures, editor permissions, repeated actions and version-history disclosure.

The final page has:

- A compact title/type/version/status header and one contextual primary action.
- A short summary for the selected mentor and version, with its send date.
- A protected PDF reader alongside feedback at desktop width; document/feedback
  tabs on narrower screens, with keyboard navigation.
- Independent mentor tabs, round/date/conclusion, comments, required revisions
  and criterion feedback when present. No fabricated score or score denominator.
- Collapsed version history. Selecting an earlier version preserves that selection
  and loads its PDF and reviews. Unsupported comparison pairs are excluded.
- Optional, collapsed AI analysis and shared research context. AI results are
  selected for the viewed revision, rather than displaying v2 analysis under v1.
- External peer review remains in its existing workflow; the project mentor page
  does not present it as another internal submission action.

Images were opened and inspected after capture:

- [Desktop, PDF and two mentors](desktop.png)
- [Mobile document](mobile.png) and [mobile feedback](mobile-feedback.png)
- [Tablet](tablet.png), [dark theme](dark.png), [English](english.png)
- [Pending](pending.png), [in progress](in-progress.png), [completed](completed.png)
- [Earlier version](previous-version.png)
- [PDF request failure](pdf-error.png), [malformed PDF](pdf-invalid.png)
- [History access denied](denied.png)

These are screenshots of the real React components and PDF.js canvas, with
isolated API fixtures and valid two-page PDF fixtures. They are not screenshots
of the user's private project or evidence of a live TeX compilation.

## Verified defects and fixes

| Finding | Resolution |
| --- | --- |
| An accepted invitation could appear as review already in progress | `ACCEPTED` is pending, labelled lecturer accepted; `IN_REVIEW`/`RESUBMITTED` are in progress |
| Unsupported request state could invent submitted feedback | Only real request states or an actual submitted HumanReview produce feedback |
| Current request state could contaminate a prior round/version | Exact revision IDs take precedence over revision numbers; historical reviews retain their own verdict |
| Repeated requests from one mentor could select an older cancellation | Latest request is selected by creation time; reviews remain associated with the revision |
| A late PDF response could appear under another version | Reader remounts per actor/submission/revision, aborts requests and ignores late responses |
| PDF parser failure did not reach retry/download UI | Optional renderer `onError` callback reports actual parse failure; initial validation/loading is not an error |
| Cached history could remain visible after access was denied | Protected history, reader and actions are withheld on history error; queries are actor scoped |
| Editable-source action was based only on source ID | Backend supplies a writable-source hint after checking current membership, project/source state and source association |
| A guessed/unavailable revision silently showed the newest document | Explicit unavailable-version state; user deliberately chooses an available version |
| In-flight review policy appeared only after attempting to send | Concise notice explains that the sent version remains fixed and directs users to existing send rules |
| Arbitrary rubrics were displayed as scores out of five | Display actual recorded scores without inventing a maximum |
| Feedback duplicated the header's send/review actions | Header owns the primary action; feedback links to the existing request detail |
| History queries performed database calls per review/item | Responses and required-item responses are fetched in batches |

The backend still enforces all mutation and file-access authorization. The
`sourceManuscriptWritable` field is a UI hint, not an access grant. Legacy
snapshot-only submissions without an explicit live-source association deliberately
do not receive an editor link.

## Status mapping

| Recorded state | Student presentation |
| --- | --- |
| `REQUESTED` | Waiting for lecturer feedback |
| `ACCEPTED` | Lecturer accepted the request, still pending |
| `IN_REVIEW`, `RESUBMITTED` | Lecturer is reviewing |
| `REVISION_REQUESTED` | Revisions requested |
| `COMPLETED` | Internal feedback round completed |
| `DECLINED`, `CANCELLED`, `EXPIRED` | Respective unavailable request state |
| Submitted review without an authoritative current request | Submitted feedback, or revision requested from the actual verdict |

Opening the PDF does not change review status. Internal readiness never implies
journal acceptance or publication. Different mentors' conclusions are not merged
into a fabricated overall decision. The selected mentor's state is shown.

## Reused components and API contract

Reused `PrivateEvidencePdfPreview`, `ContentComparison`, score-comparison helpers,
`MentorManuscriptDialog`, `SubmissionIntroductionView`, shadcn controls, i18n,
submission hooks and the existing Mentor Review Workspace.

No new API route, database model, enum or migration was needed.

- `GET /api/v1/submissions/:id/history` adds optional
  `sourceManuscriptWritable`; revision metadata includes protected
  `originalFileName`; requests expose revision/reviewer/origin/timestamp metadata.
- `GET /api/v1/submissions/:id/revisions/:revisionId/download` is reused for the
  authenticated reader and download. No public file URL or live working-draft
  replacement is introduced.
- Existing mentor-send/resubmit and mentor review APIs retain their existing
  transaction, idempotency, scoped access and version-history behavior.

## Files in this change

- `apps/web/src/pages/submissions/submission-detail.tsx`
- `apps/web/src/features/submissions/submission-review-status.ts`
- `apps/web/src/features/submissions/submission-detail.css`
- `apps/web/src/features/submissions/components/submission-document-viewer.tsx`
- `apps/web/src/features/submissions/components/submission-feedback-panel.tsx`
- `apps/web/src/features/submissions/components/submission-version-panel.tsx`
- `apps/web/src/features/submissions/components/submission-ai-prereview.tsx`
- `apps/web/src/features/submissions/hooks/use-submissions.ts`
- `apps/web/src/features/academic-profile/components/private-evidence-pdf-preview.tsx`
- `apps/web/src/i18n/locales/submission-detail.ts`, `en.ts`, `vi.ts`
- `apps/web/src/features/submissions/__tests__/submission-detail-redesign.test.tsx`
- `apps/web/src/features/projects/__tests__/project-submissions.test.tsx`
- `apps/backend/src/modules/submissions/submission.service.ts`
- `apps/backend/src/modules/reviews/__tests__/mentor-review-workflow.persistence.test.ts`
- `packages/shared-types/src/submission-history.ts`
- This report, screenshots and `browser-results.json`.

The pre-existing edits in `mentor-manuscript-dialog.tsx` and unrelated working-tree
files were retained; they are not described as newly implemented by this audit.

## Tests actually executed

| Command / check | Result |
| --- | --- |
| `pnpm --filter @trend/shared-types build` | Passed |
| Web Vitest: submission-detail-redesign, project-submissions, mentor-manuscript-dialog, single worker | **45 passed** |
| `node scripts/test-mentor-workspace.mjs --review-only` | **13 passed, 1 intentionally skipped interactive fixture** |
| `node scripts/test-mentor-workspace.mjs --review-only --regression` | **42 passed, 1 intentionally skipped interactive fixture**, across scoped workflow, mentor guidance and external peer-review suites |
| Scoped web ESLint, including the PDF renderer and new components | Passed |
| Scoped backend ESLint, service and persistence regression | Passed |
| Playwright Chromium UI verification | **11 scenarios passed**, no page exceptions or document horizontal overflow; see `browser-results.json` |
| Web `typecheck` / full `build` | Blocked by the unrelated type errors listed below |
| Backend `typecheck` / full `build` | Blocked by the unrelated type errors listed below; PostgreSQL runtime audit and Prisma generation passed during build |
| `node scripts/build.mjs` (Vite bundle and bundle budget, without TypeScript gate) | Passed; this does not replace the failing full build/typecheck |

The database runner creates a randomly named isolated PostgreSQL database,
successfully applies the repository migrations, runs tests, and removes only that
test database. The application database and migration history were not changed.

Coverage includes unauthorized PDF/review access, revoked grants, pending mentor
delivery, exact snapshot access, old feedback preservation, v2 resubmission,
multiple projects/mentors, duplicate/concurrent requests, durable notifications,
reviewer-only decisions, invalid explicit revisions, stale PDF response rejection,
renderer/network failure and retry, non-writable sources, AI separation and
conditional comparison visibility.

Browser fixtures intercept all `/api/v1` traffic in an isolated browser context;
unknown API requests are aborted. Initial verification used the existing Vite
server. When that listener became unavailable, final verification used a separate
local Vite server on port 8091. No live project records were written by browser QA.

## Remaining limitations / readiness

1. **Full project build is blocked** by the existing `evidenceStatus` type
   intersection in Manuscript AI/editor/integrity, plus `AvailableMentor.institution`
   references in mentor discovery. These errors are outside the changed submission
   files. They were observed in both typecheck/build logs and were not overwritten
   as part of this scoped UI task. Full green CI is required before merging.
2. A real new TeX compile was not run: the configured compiler ports were not
   available during this audit. The frontend send-dialog tests mock compilation;
   persistence tests verify delivered snapshot identity and scoped access. A real
   compiled-snapshot smoke test remains necessary with the compiler running.
3. Browser screenshots use isolated fixtures, not the private example account.
   Final sign-off should include the real Owner and Mentor sessions and actual
   uploaded/compiled files once the application's local backend is running.
4. PDF comparison reuses the existing manual side-by-side viewer. No automated
   PDF diff or inferred research-quality score has been added.

The scoped implementation and automated workflow checks are complete. It is not
reported as a fully build-green release, and no commit/push/deployment was made.
