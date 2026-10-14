# Project research workflow

## Implementation direction (14 October 2026)

Continue the existing ProjectPaper, CorpusPaper, ResearchGap, GapEvidenceRecord,
ResearchPlan and project discussion domains. ProjectPaper remains the authority
for inclusion. Collections describe organization, never screening eligibility.

- Exploratory screening stays the default. Optional independent screening keeps
  reviewer decisions separate, supports blinding, and requires a recorded team
  resolution. Old screening endpoints must not bypass that policy.
- Structured project evidence is a versioned extraction from a ProjectPaper,
  independent of any particular gap. Corpus extraction can propose an item but
  cannot accept it. Acceptance is an explicit human action; editing resets review.
- GapEvidenceRecord links a supporting/counterevidence relation to a fixed accepted
  extraction revision. Legacy links remain readable with unreviewed provenance.
- Team assessment is separate from external expert validation. Revisions and
  changes to linked evidence invalidate the current assessment and expert packet.
- Questions live in ResearchPlan and pin the originating gap/evidence revisions.
  Generic project comments, tasks and discussions are reused.
- Privately uploaded PDFs belong to a project source, never the public paper URL.
  Bounded bytes stay in PostgreSQL initially, behind current membership checks.
  No private PDF is sent to an AI provider by upload or indexing side effect.

## Interface

A team reading papers together in a bright study room needs a white, compact
workspace that puts source text beside its interpretation. Keep the established
pure-white background, restrained blue, existing typography and controls.
Literature contains Library, Screening and Evidence views. Progressive forms and
source detail panels replace repeated metrics. The evidence matrix becomes a
stacked list on mobile. Gap evaluation shows source provenance, counterevidence,
assessment rationale, history and question derivation separately.

## Implemented workflow

1. **Collect and organize:** reuse the existing discovery and saved-paper library.
   Manual references accept missing DOI/year, authors, venue, abstract, HTTP(S)
   source URL and import reference. Reliable DOI imports deduplicate under a
   PostgreSQL lock; DOI-less papers are not merged by title. Collections and tags
   belong to the project source, not its canonical paper metadata.
2. **Screen:** exploratory decisions map to UNDECIDED, INCLUDED, EXCLUDED and
   MAYBE. Exclusion requires a reason. Optional independent screening assigns
   current members to a phase, preserves each vote, hides other votes until the
   phase is complete when configured, and lets the owner record a final decision.
   Removal/leave revokes assignments; rejoining does not restore old votes.
3. **Extract and review:** extract only from included project sources. Findings,
   quotation/locator, context, method, sample, results, limitations and themes are
   separate fields. HUMAN/AI_SUGGESTED provenance is immutable. Saving or revising
   an extraction leaves it PENDING; acceptance/rejection requires an explicit
   human action and rationale. Indexed quotations retain a saved source snapshot;
   manually entered quotations are visibly marked as unchecked.
4. **Evaluate a candidate:** propose a human hypothesis or explicitly queue the
   existing AI gap pipeline. Link accepted extraction revisions as SUPPORTING or
   COUNTER evidence. The detail view shows claim, rationale, scope, assumptions,
   related literature, discussions, mentor feedback, team assessment and history.
   Team assessments use PROPOSED, IN_REVIEW, NEEDS_MORE_EVIDENCE, TEAM_SUPPORTED
   and REJECTED; external expert opinions remain separate and optional.
5. **Derive a question:** a supported candidate can create a ResearchPlan question
   that pins the candidate version and extraction revisions. Source papers remain
   traceable through those links. Editing questions does not overwrite evidence.

An empty extraction source picker now explains that a source must first be
included through Screening. The save action remains disabled without a source.

## Consistency and authorization

- Research endpoints mount under `/projects/:id/research` with existing project
  authentication, request validation and `createRateLimiter` policies.
- Project locks and expected-version guards protect concurrent changes. Stale
  writes return conflicts; the UI retains the draft for correction/retry.
- Extraction revisions, screening votes, candidate revisions and expert review
  packets retain history. Changes to linked source eligibility, evidence or claim
  invalidate current assessments and expert packets without deleting old opinions.
- Private PDF files are limited to 10 MiB per file and 100 MiB per project. Current
  team membership is checked at download time. Private bytes are stored in
  PostgreSQL; public paper metadata does not receive the private file path.
- Active verified mentors can submit version-specific feedback with an idempotency
  key. They cannot edit screening, extractions or team assessments. The mentor UI
  does not request team-only edit resources. Formal review remains assignment scoped.
- AI input uses an authorized snapshot of the included project corpus. Source IDs
  and corpus freshness are rechecked before publishing results. Paper text is
  treated as untrusted data. Existing LLM modules, provider settings and queue are
  reused; project candidates do not receive a numerical scientific-confidence score.

## Database and localhost

Additive handwritten migrations applied successfully to a disposable PostgreSQL
database and the local application database on 14 October 2026:

- `20261014000400_collaborative_research`
- `20261014000500_screening_assignments`
- `20261014000600_research_history_kinds`

The local database has 68 applied migrations. Before applying these migrations,
a custom-format PostgreSQL backup was saved to
`C:\Users\tdinh\AppData\Local\Temp\lumigap-before-research-20261014-1600.dump`
(11,095,653 bytes). `pg_restore -l` could read its 1,359-entry listing. A restore
drill was not performed.

Backend, web and affected workers were built/recreated through the existing local
Compose stack. No dependency versions were changed. No commit or push was made.

## Verification performed

### Persistence, authorization and regressions

Tests used a disposable PostgreSQL/pgvector database and Redis instance, with
email delivery disabled. They did not create demonstration research in the user's
project or invoke a live LLM provider.

| Suite | Passed cases |
| --- | ---: |
| Collaborative research persistence and signed HTTP authorization | 11 |
| Workspace collaboration | 21 |
| Project creation/team | 17 |
| Forum persistence | 41 |
| Gap pipeline scope and stale corpus | 5 |
| Expert validation access | 4 |
| Expert validation quorum | 4 |
| Report project gap fanout | 2 |

The broad regression run passed 102 tests; subsequent affected-suite runs covered
the additional stale-corpus and report fanout cases. Coverage includes identifier
deduplication, missing metadata, private files, cross-project denial, blinded
conflicts, membership revocation, concurrent edits, immutable extraction provenance,
human review, supporting/counterevidence revisions, derived-question provenance,
mentor retries/revocation and archived-project writes.

### Frontend, static checks and production builds

- Initial four-suite frontend regression run: 39 tests passed (research workflow,
  coordination, literature flow and validation progress).
- Final research workflow suite: 9 tests passed, including mentor permission-aware
  rendering and the empty eligible-source explanation.
- Shared-types build, direct backend TypeScript check, web TypeScript check and
  mobile TypeScript check passed. Targeted ESLint checks passed without warnings.
- Backend/web production Docker builds passed, including web `tsc -b` and the
  PostgreSQL runtime audit. Prisma validation succeeded in Docker.
- `git diff --check` passed for the affected application/shared-types/documentation
  paths, apart from existing line-ending notices.

The native Prisma command has a pre-existing `jiti/createJiti` resolution problem.
Docker Prisma generation/validation and backend build succeeded. This is not a
claim that the root `pnpm typecheck`/`pnpm build` commands passed natively.

### Browser checks

Checked the production build at `http://localhost:8080` using the existing logged-in
owner session. Verified Library/Screening/Evidence navigation, real paper metadata,
source expansion, exclusion-reason requirement, private-file controls, source search
and reset, empty evidence/editor states, manual reference fields, candidate filters
and proposal form. No real research decisions or uploads were submitted.

Checked the candidate form, screening and evidence editor at a 412 × 892 viewport;
the inspected pages had no horizontal document overflow. The project navigation
changes to the mobile section picker and evidence rows use a stacked layout.
No browser error/warning entries were captured during this pass. The real project
has no active mentor, so mentor authorization/UI were covered by tests rather than
a live second-user session. A full screen-reader audit and native Android run were
not performed.

Screenshots from the final local build:

- [Desktop screening](../artifacts/collaborative-research/desktop-screening.png)
- [Mobile evidence editor](../artifacts/collaborative-research/mobile-evidence.png)

## Remaining limits

- The existing broad verified-active mentor research-context policy is reused.
  Owner-authorized grants per individual research resource remain a separate
  hardening task described in the earlier workspace audit.
- App navigation/close controls and `beforeunload` protect drafts. Generic browser
  Back/Forward draft loss and durable offline drafts remain limitations.
- Existing corpus extractions supply suggestion drafts. Uploaded private PDFs are
  stored/downloaded, without a new parsing/indexing pipeline or automatic AI upload.
- AI failure/privacy/staleness tests use mocks; live Gemini/provider output was not
  tested. Team support, human acceptance and expert quorum do not prove a scientific
  claim.
- Project detail still loads the full existing Library; new research lists are
  paginated. Load/p95 testing was not performed.
- Research-question provenance is implemented through the gap/evidence/source
  chain. Full collaborative manuscripts, CRDT LaTeX editing and secure compilation
  remain outside this implementation and must not be presented as complete.
