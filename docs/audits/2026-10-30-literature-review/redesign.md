# Collaborative literature review redesign

## Request and audit

Implement the user brief in the existing Papers library, preserving stored papers,
independent assessments, final decisions, evidence and immutable history.

Existing implementation inspected: collaborative-library.tsx, library-assessment.tsx,
screening-round.tsx, screening-management.tsx, screening.service.ts,
screening-context.ts, library-assessment.service.ts, project-sources.service.ts,
project-evidence.service.ts, project-screening.prisma and their DTO/shared types.

Working foundations:

- Default settings without an explicit protocol are collaborative, with one reviewer.
- Personal assessments are append-only versions per reviewer assignment.
- Finalization is an explicit authorized command with review IDs, version and reason.
- Project locking, expected versions and idempotency protect mutations.
- Historic submitted reviews survive membership changes; current access uses project membership.
- DOI identity protection and evidence extraction already exist.

Gaps found:

- Detail view is a tall administrative modal with repeated sections and no next/previous reading flow.
- Paper board lacks authors, actual RQ choices, full-text availability, and reviewer filter controls.
- Personal reviews have no structured RQ references or declared reading scope/source.
- A personal negative opinion requires an explanation even in ordinary review mode.
- Final decisions lack a background-only outcome.
- Protocol stages are not configured; a full-text round can be recorded without documenting access.
- History mixes formal revisions with discussion, and includes vote-oriented labels.
- A legacy snapshot is created even for an unclassified new paper, producing misleading legacy UI.
- Search currently covers title/DOI and project notes/tags, but not author/keyword metadata.

## Design decisions

- Keep the library and one focused detail surface. Metadata and abstract precede a compact personal assessment. Advanced protocol management is disclosed separately.
- Keep a lightweight explicit save, clear dirty/saved/error states and guarded next/previous navigation.
- Distinguish personal choice, group selection and extracted evidence.
- Reuse stable IDs from ResearchPlan questions; store server-resolved question text snapshots with assessment versions so historic references remain explainable.
- Record declared reading scope with the review version. Require a full-text source or documented process for new full-text reviews. Do not invent reading scope or source for old reviews.
- Add a background-only final outcome without deleting or converting prior decisions or evidence.
- Preserve configured independent-review rules and immutable round settings. New ordinary work remains collaborative; protocol complexity is opt-in.
- Separate discussion from formal history in the interface and pagination.
- Preserve metadata provenance and DOI identity protections.

## Method references

Protocol defaults and terminology follow the selected process, not a scientific vote.
For protocols requiring independent eligibility decisions, see
[Cochrane chapter 4](https://www.cochrane.org/authors/handbooks-and-manuals/handbook/current/chapter-04)
and [JBI source selection](https://jbi-global-wiki.refined.site/space/MANUAL/355862769/10.2.7%2BSelecting%2Bthe%2Bevidence).
These requirements are not imposed on ordinary collaborative literature review.

## Verification plan

Use isolated PostgreSQL fixtures for proposals/DOI identity, independent assessment versions,
question validation/snapshots, one-person workflow, protocol requirements/full-text claims,
decision permissions/reopening, membership removal, evidence retention and concurrency.
Use focused React tests for reading/navigation/save states, selection controls and history.
Inspect the real Papers UI read-only on desktop/mobile; use disposable fixtures for mutations.
Record executed commands/results and remaining limits after implementation.

## Implemented scope

### P0 — daily research workflow

- Two-column reading workspace on desktop, one column on mobile; compact author/year/venue/DOI/source metadata, independently scrollable abstract, prominent assessment choices.
- Explicit lightweight save, draft/saved feedback, duplicate-submit guard, retry keys and existing unsaved-navigation protection.
- Previous/next paper navigation within the current filtered order, including page boundaries. A linked paper outside that filtered list is shown independently rather than assigned a fabricated position.
- Author/keyword search added to title/DOI/project tag/note search. Reviewer and personal-assignment filters exposed; pagination remains accessible on an empty later page.
- Actual ResearchPlan question IDs resolved and validated on the server; question text sealed into each immutable review version. No question text is accepted from the client as authoritative.
- Personal assessments remain separate from explicit, authorized group decisions. A short negative opinion in collaborative mode no longer requires an exclusion essay; final decisions still require an explanation.
- Dedicated discussion/history views and independently paginated server queries; historical actors resolved from retained user records, including former members.
- Empty legacy snapshots hidden without deleting stored records. New unclassified sources do not create a misleading legacy record.

### P1 — methodological context

- Reading scope (`TITLE_ABSTRACT` / `FULL_TEXT`) and documented full-text reference stored with new review versions. Historic scope stays null; the interface says it was not recorded.
- Optional protocol stages stored with settings and frozen into subsequent rounds. When both stages are configured, full-text screening requires the preceding title/abstract inclusion.
- Stage inclusion is not necessarily eligibility for extraction: a protocol requiring full text keeps the legacy extraction projection at `MAYBE` until full-text inclusion. Both Evidence Matrix and official analysis sets enforce this boundary.
- `BACKGROUND` is an explicit final selection outcome. It is retained in rounds/final decisions and mapped to `MAYBE` only at the old four-state integration boundary; it never grants extraction eligibility.
- Adjudication can document a decision that differs from reviews. Consensus policy still requires agreement, and unresolved independent `UNSURE` assessments cannot be silently finalized.
- Project owners can recover/reopen collaborative selection when a delegated decision owner leaves. Previous decisions/reviews and existing evidence remain stored.

### P2 — restrained scope

Existing workload, agreement and Kappa calculations are retained. No new PRISMA compliance claim, automated eligibility decision, or automatic scientific finding is introduced.

## Changed implementation files

Backend/model:

- `apps/backend/prisma/project-screening.prisma`
- `apps/backend/prisma/migrations/20261030180000_literature_review_context/migration.sql`
- `apps/backend/src/modules/projects/screening-review-context.ts`
- `apps/backend/src/modules/projects/screening-context.ts`
- `apps/backend/src/modules/projects/screening.service.ts`
- `apps/backend/src/modules/projects/library-assessment.service.ts`
- `apps/backend/src/modules/projects/project-analysis-set.service.ts`
- `apps/backend/src/modules/projects/dto/screening.schema.ts`
- `apps/backend/src/modules/projects/screening.controller.ts`
- `apps/backend/src/modules/projects/screening.routes.ts`
- `packages/shared-types/src/project-screening.ts`

Frontend:

- `apps/web/src/features/projects/components/assessment-context.tsx`
- `apps/web/src/features/projects/components/library-assessment.tsx`
- `apps/web/src/features/projects/components/collaborative-library.tsx`
- `apps/web/src/features/projects/components/screening-round.tsx`
- `apps/web/src/features/projects/components/screening-management.tsx`
- `apps/web/src/features/projects/components/screening-common.tsx`
- `apps/web/src/features/projects/api/screening.api.ts`
- `apps/web/src/features/projects/collaborative-library.css`

Tests/verification fixtures:

- `apps/backend/src/modules/projects/__tests__/screening.persistence.test.ts`
- `apps/backend/src/modules/projects/__tests__/screening.calculator.test.ts`
- `apps/backend/scripts/serve-screening-verification.mjs`
- `apps/web/src/features/projects/__tests__/collaborative-library.test.tsx`
- `apps/web/src/features/projects/__tests__/screening-workspace.test.tsx`

## Executed verification

- `node apps/backend/scripts/test-screening-workflow.mjs`: **49 passed** (33 PostgreSQL workflow tests, 16 calculator/DTO tests). The additive migration was applied to isolated `lumigap_screening_workflow_v3_test` first. This includes retained evidence after reopening, question snapshots/foreign-question rejection, full-text context/stage enforcement, background selection, sole researcher, concurrent decisions and submissions, permissions and former-member retention.
- Focused frontend run: **59 passed** across library, screening workspace, existing literature flow and related papers. Additional navigation refusal case subsequently brought the focused library file to **9 passed**; unique total across these files is **60**.
- Scoped backend/frontend ESLint: **0 errors, 0 warnings**.
- Backend TypeScript check and shared-types build passed; full Docker backend build also runs the PostgreSQL-only boundary audit.
- Web production build passed including TypeScript and initial-bundle budget. Existing large async chunk warnings remain (manuscript editor and localization bundle).

## Limits and compatibility

- A full-text reference is a researcher declaration of source/process, not automatic proof that the source was read. No publisher PDF is fetched or redistributed by this change.
- Full-text availability means a saved URL/file reference exists; it does not promise that every reader can access it.
- Existing protocol snapshots without an explicit stages list keep their prior behavior. To require a staged process, an owner saves a new configuration and starts subsequent rounds; historic assessments are not rewritten.
- Existing evidence fields and related RQ/gap links remain in use. Assessing relevance never fabricates extraction content or marks a finding scientifically verified.
- Existing metadata provenance, DOI canonicalization and project access controls are reused. No title-only deduplication is introduced.
- Browser/runtime results and screenshots are recorded below.

## Runtime verification completed — 2026-10-31

Reverified the current checkout after the subsequent security changes. No new
screening defect was found in this pass, so no additional runtime code change
was needed.

- `node apps/backend/scripts/test-screening-workflow.mjs`: **49/49 passed**, exit 0.
  See `backend-reverify-2026-10-31.log`.
- Focused React run of `collaborative-library`, `screening-workspace`,
  `project-literature-flow` and `library-related-papers`: **60/60 passed**, exit 0.
  See `frontend-reverify-2026-10-31.log`. React Router v7 migration notices remain
  non-failing warnings.
- Actual application at `localhost:8080`: inspected the existing project's
  library and reading workspace without modifying its research records. The
  existing opposing assessments stayed independently attributable. Missing
  research questions and unrecorded historic reading scope were stated accurately.
- Desktop at 1440 × 1000: metadata/abstract and assessment occupy two columns.
  Dark mode was inspected and the original light theme restored afterward.
- Mobile at 390 × 844: the workspace occupies one column; document scroll width
  was 375 CSS px, within the 390 px viewport. Assessment choices stack, keyboard
  focus reaches the optional note, and the previous/next controls remain visible
  while scrolling. Temporary viewport overrides were reset afterward.
- Disposable fixture at `127.0.0.1:4180`, using only
  `lumigap_screening_workflow_v3_test`: created 14 clearly labeled fake papers
  and two test accounts. Through browser login and real API requests, the owner
  saved INCLUDE with the actual RQ1; the member subsequently saved EXCLUDE on the
  same paper. Both version-1 assessments, timestamps and the owner's RQ remained
  visible. The member began with no personal assessment and had no final-selection
  control. The disagreement appeared without automatically selecting/excluding the
  paper; evidence extraction remained disabled.
- Rechecked navigation **12/14 → 13/14 → 12/14** through the actual UI. Titles
  changed from fixture paper 03 to 02 and back, confirming the page boundary in
  both directions.
- The earlier browser pass verified explicit background-only finalization and
  its attributed decision history on a separate disposable fixture. Final
  decision permissions, reopening, evidence retention and strict protocol
  behavior were also rechecked by the PostgreSQL suite above.

Screenshots saved alongside this report:

- `verified-desktop-2026-10-31.png`
- `verified-mobile-2026-10-31.png`
- `verified-dark-2026-10-31.png`
- `verified-independent-reviews-2026-10-31.png`
- `verified-page-boundary-2026-10-31.png`

Scope of verification: responsive checks use browser viewport emulation, not
physical mobile devices. This pass did not call a paid AI provider, fetch a
publisher's full text, or perform a production-scale load test. The fixture
server was stopped after verification; normal application containers stay running.
