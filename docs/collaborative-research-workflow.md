# Project research workflow

## Paper selection and grounded directions (19 October 2026)

The picker has title/DOI search, bulk selection capped at the analysis limit,
clear selection, visible selected rows and a missing-paper hint. Selections
survive search and pagination. Saved results explicitly identify their input
count; changing the selection applies only to the next run. The results query
uses the latest completed analysis ID, within existing membership boundaries.

Project discovery uses the existing project title, description and research
areas as bounded context, snapshotted when queued. Context is not evidence.
The synthesis separates unrelated papers. Candidate generation returns 0–5
directions without a minimum quota and must supply a concrete research question,
documented limitation, missing evidence, scope and assumptions. Every supporting
paper requires an inline citation and a quote anchored to one of its indexed
source chunks. Wrong source IDs, fabricated quotations, incomplete support and
duplicate titles are excluded before persistence. Malformed provider output
fails the job rather than pretending no research opportunity exists.

Matching quotations are stored in the existing pending extraction/evidence
records; research questions and limitations reuse existing ResearchGap columns.
Source matching is a mechanical check, not proof that the proposed question is
novel or the model's interpretation is correct. Human assessment remains required.
Existing candidates are retained, with a compact note to reanalyze for the new
format. No automatic AI calls, extra credit charge, dependency or migration.

Verification: 52 backend persistence/workflow tests, 21 prompt/source-format
tests, 39 web tests, PostgreSQL runtime audit and both production builds passed.
Tests mock provider responses and do not evaluate live AI output quality.

## Combined Research Gaps discovery (19 October 2026)

This is the current default flow. It supersedes the separate evidence/synthesis
navigation and the accepted-synthesis prerequisite described in the historical
implementation notes below. Existing records, manual extraction tools, reviewed
synthesis APIs and deep links remain available.

1. In Literature, mark papers **Relevant / Included**. The Research Gaps page
   immediately shows the active eligible count. No eligible papers means a clear
   explanation and a direct Literature link.
2. Select papers in the visible checklist, then choose **Analyze papers**.
   By default, the first ten eligible papers are selected. The project title
   supplies the research context, without another required topic field.
   Each run uses 2–10 selected papers, respecting `GAPS_TOP_K` if lower. Other
   papers, private project attachments and discussions are never added to this
   discovery pack.
3. The existing `/gaps/analyze` queue receives `projectDiscovery: true`, the
   project ID and selected paper IDs. Its worker reuses canonical source indexing
   and structured extraction, then cached cross-paper synthesis and the existing
   candidate-generation service. No LLM work runs in HTTP handlers. The existing
   worker binds the requesting member's AI connection.
4. Progress and partial results survive navigation in versioned
   `GAP_ANALYSIS_INPUT` packets: queued, extracting N/M, synthesizing, generating,
   ready. Members can read shared progress and results through
   `/projects/:id/research/discovery`. The existing analysis status endpoint now
   authorizes current project members; personal analyses remain private.
5. Completed candidates appear under **Results**. There are no top-level
   assessment filters, manual proposal forms or partial extraction panels.
   Open a candidate to inspect research questions, methods, findings,
   limitations, future work, coverage warnings and indexed source passages.
   Synthesis `[n]` references correspond to the numbered paper list. Fields absent
   from the source are shown as not reported, without inventing content.
6. Open a candidate for its rationale, supporting papers and pending AI
   extraction links. Read the quoted source and interpretation, then record
   review, a request for evidence, rejection, or team support. Team support can
   explicitly accept checked source revisions in the same transaction. It never
   makes a candidate scientifically validated. Existing manual evidence editing,
   counterevidence, discussion, feedback and question derivation remain available.

The full run uses the existing 30-credit gap-analysis policy. Source selection and
authorization are checked before charging and again during processing and
publication. Concurrent project runs are serialized; failed enqueue attempts are
marked failed and refunded. Provider failures follow existing worker retries and
idempotent refunds. Final gap cache hits retain the existing refund policy.

Source fingerprints, document content hashes, immutable excerpts and exact
extraction versions prevent stale support. Source changes during processing
discard the candidate output. Removed members cannot read old analyses or publish
queued output. AI extractions stay `PENDING` until an explicit human review.
No additional schema migration or dependency is required for this simplification.

The synthesis provider contract explicitly specifies three string sections.
String bullet arrays are normalized to newline-separated text; redundant
`citingPaperNumbers` metadata is discarded. Inline source citations and section
length limits remain mandatory. This fixes the observed provider format failure
without inventing evidence or accepting unsupported sections. Prompt version v2
invalidates the previous synthesis cache.

Verification uses disposable PostgreSQL/Redis and mocked provider/indexer calls;
it does not submit real user data to an AI service or spend user credits. Live
provider output quality still needs human evaluation on the original sources.

The follow-up select/analyze/results simplification passed 57 web tests, 50
backend workflow tests and four provider-format parser tests, including the
observed bullet-array regression. Both production builds passed. Provider calls
are mocked in these tests; this does not establish live provider availability.

Verification for the initial combined workflow: 49 backend tests, 54 web tests and the four
PostgreSQL runtime checks passed. Backend and web production builds passed, as
did targeted ESLint checks for the discovery, evidence review and evaluation
changes. Cases include the complete two-paper discovery, pending provenance,
explicit source acceptance, review/rejection, concurrent runs/assessments,
queue failure refunds, stale sources, revoked membership and retained UI inputs.

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
Literature opens directly to the shared paper list. Search, relevance and
contributor filters combine; each row shows who added and reviewed the paper.
Members can set Not reviewed, Considering, Relevant or Not relevant directly.
Not relevant requires a reason; removing a paper requires confirmation and keeps
the existing backend protections for linked research records.
The list has five direct filters with counts on one horizontal bar: All papers,
Not reviewed, Considering, Relevant and Not relevant. On small screens this bar
scrolls horizontally. These groups follow the team's relevance
decision; reading progress is separate. Saving a decision moves the paper to its
new group after the existing project query refreshes.
The More options block and its criteria, independent review, evidence matrix,
artifact and gap shortcuts have been removed from the shared paper list.
Existing independent projects retain their assigned review workflow from the
reader; no stored criteria, votes or evidence are deleted.
Gap evaluation shows source provenance, counterevidence,
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

## Literature simplification verification (19 October 2026)

- Web literature/navigation suite: 23 tests passed; targeted ESLint, TypeScript
  and production build passed, including the bundle budget.
- Disposable PostgreSQL/Redis run: 6 tests passed, including the 5 existing
  workspace persistence tests and a real browser/API flow. The browser flow added
  a saved paper, persisted all three relevance decisions through reload, combined
  contributor/status filters, opened the reader and confirmed project removal
  without deleting the canonical paper. No real project data was changed.
- Desktop (1440px) and mobile (390px) screenshots inspected; mobile list and
  reader had no horizontal overflow. Browser captured no page errors.

## Project gap flow audit (19 October 2026)

- Project evidence retrieval and the manual picker are restricted to INCLUDED
  (Relevant) project papers. Not reviewed, Considering and Not relevant papers
  are not eligible. The approved pack requires at least three active sources;
  analysis submits selected mode so the worker does not add new evidence papers.
- Fixed selected-source authorization when a queued worker uses UUIDs while
  selected papers expose legacy IDs. Both scopes now intersect on canonical
  database IDs. Excluded and outside-project legacy IDs remain ineligible.
- Regression test reproduced the legacy-ID failure before the fix. After the
  fix, 7 PostgreSQL scope tests and 6 request-schema tests passed. Backend
  TypeScript compilation, targeted ESLint and 4 PostgreSQL runtime audit tests
  passed. LLM and embedding calls were mocked in these tests; no user analysis
  was queued and no user credits were charged.

## Reviewed synthesis and research directions (19 October 2026)

The About project/README (step 9) is unchanged. Steps 1–8 now connect through
the existing project Library and Research Gaps navigation:

1. Collect papers in the shared Library using the existing search/import flow.
2. Use Not reviewed, Considering, Relevant and Not relevant to screen together.
   Only Relevant (`INCLUDED`) sources qualify for downstream synthesis.
3. Open a paper reader to request or refresh its canonical paper analysis and
   inspect questions, methods, sample, results, limitations and source passages.
   Coverage explicitly distinguishes abstract-only analysis from indexed text.
4. Copy an AI finding into an extraction draft or write one manually. Select an
   indexed passage to retain a checked quotation; review and accept explicitly.
   AI suggestions retain their source-analysis hash and never self-approve.
5. In Research Gaps → Cross-paper synthesis, choose 3–30 accepted extractions
   from 3–10 distinct Relevant papers. Write shared findings, differences and
   unresolved questions with `[n]` source citations, or queue an AI draft.
   Each nonempty section needs valid citations; unsupported sections can be empty.
   Review the result and accept it with a rationale. Version history is retained.
6. Find candidate gaps using that accepted synthesis and its exact paper set.
   New project analysis requests require `synthesisRevisionId` and selected mode.
   Standalone discovery and previously queued legacy jobs remain supported.
7. Inspect AI-proposed evidence links and supporting/counter evidence, discuss
   the candidate and record a team assessment using the existing evaluation UI.
8. Derive a research question from a team-supported candidate. The Questions
   view keeps its originating gap version and pinned evidence revisions visible,
   and flags directions whose source assessment or evidence changes.

### Persistence, costs and recovery

Migration `20261019010000_reviewed_research_synthesis` extends the allowed kinds
in `project_workspace_revisions`; it does not replace or delete existing records.
Synthesis and gap input packets pin immutable extraction revisions and source
snapshots. Expected versions and project locks reject conflicting writes. Source
eligibility and snapshots are checked before billing, worker generation and
publication. The UI retains edits when a version conflict occurs.

AI synthesis reuses the gaps queue, cached LLM service and `fast_report` credit
policy (20 credits); gap analysis retains its existing 30-credit policy. Manual
synthesis does not call AI. Queue/provider failure, permission revocation and
source changes prevent publication and trigger idempotent synthesis refunds.
Startup recovery sweeps orphaned queued synthesis revisions older than 30 minutes.

Private project attachments are not sent to the canonical paper index by the
new analysis action. Existing private PDF storage/download and manual extraction
remain available; automated private-PDF analysis is not part of this change.

### Verification

- 37 backend tests passed against disposable PostgreSQL and Redis, with mocked
  LLM/embedding/queue calls. Coverage includes the complete synthesis-to-question
  flow, signed HTTP sessions, outsider/archived writes, duplicate saves,
  concurrent versions, source changes during generation and refunds after
  membership revocation. Actual project research and user credits were untouched.
- 43 relevant web tests passed covering the Library, extraction/evaluation workflow and
  synthesis UI, including retained drafts, frozen version submissions, read-only
  access, untrusted text and question provenance.
- Backend TypeScript and the web production build passed, including the web
  bundle budget. Global locale tests still have existing dictionary/static-key
  failures unrelated to the new workflow; new Vietnamese labels are supplied.
- The local database was backed up before `prisma migrate deploy`. Backend,
  gaps/paper-analysis workers and web were updated; PostgreSQL/Redis readiness
  passed. Live browser checks verified paper analysis → preselected extraction,
  AI suggestion drafts, synthesis setup, candidate gating and the Questions view.
  Desktop (1440px) and mobile (390px) checks showed no document-width overflow.
  The current project has two Relevant papers, so no real AI job was launched.

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
