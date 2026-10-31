# Collaborative Research Library verification, 2026-10-29

## Existing architecture and implementation choices

- Reused project sources/imports, DOI identity checks, screening rounds, individual
  reviews/revisions, final decisions, workspace revisions, evidence matrix and the
  existing BullMQ gap-analysis worker. No new service or AI engine.
- The Papers landing view is now a shared library with search, filters, sorting,
  pagination, added-by information, notes/tags and individual opinions.
- Projects without configured review settings default to COLLABORATIVE. Existing
  SIMPLE/INDEPENDENT settings and historical round policies remain unchanged.
- Opinions do not decide scientific relevance automatically. The authorized
  finalizer records an explicit justified selection. Reopening preserves history.
- Analysis sets are immutable workspace revisions. Draft sets permit exploration;
  official sets require real current INCLUDED finals and owner confirmation.
  Source fingerprints, per-round policy, decisions and evidence revisions are saved.
- The gap API accepts an exact saved set and preserves its draft/official label,
  source/configuration hash and original input packet. Source changes invalidate a
  new run instead of silently replacing the saved scientific evidence.

## Completed feature scope

- P0: shared collection UI, assessments with editable own history, disagreement,
  authorized selection/defer, strict protocol compatibility, analysis sets and real
  integration with existing gap enqueue/worker code.
- P1: stored references and source-supplied similar works, clearly distinguished;
  membership/DOI duplicate prevention when adding a related paper; independent
  missing-data and API-error states.
- P2: navigation to the existing manual evidence extraction and matrix. Draft AI
  suggestions retain their existing human-verification requirement.

## Automated verification executed

| Check | Result |
| --- | --- |
| Isolated PostgreSQL screening, workspace and research regression suites | 83/83 passed |
| Web library, relationships, screening, literature, research and gap workflow suites | 101/101 passed (rerun 2026-10-30) |
| PostgreSQL runtime boundary tests | 4/4 passed |
| Shared types build | Passed |
| Backend build, Prisma generation and TypeScript | Passed |
| Web TypeScript and production Vite build | Passed |
| Targeted ESLint on new/changed screening/library/gap files | Passed |
| Migration 20261029120000 on isolated test DB | Applied successfully |
| Same migration on local application DB after backup | Applied successfully |

Initial backend attempts timed out while Docker was unavailable; those attempts
were not counted as passes. A new preassigned-review regression initially used an
unsupported Prisma relation in its assertion; the assertion was corrected to use
assignmentId and the complete 83-test suite was rerun successfully.

The preassigned collaborative-review case also exposed an actual UI revision bug.
The form now starts from its own assignment revision, and uses the revision returned
by the server after a successful save. It does not assume every save increments it.

## Browser verification against real isolated PostgreSQL

Test-only project and two real accounts were created in
`lumigap_screening_workflow_v3_test`; no fixture data was added to the user's project.

- Owner saved Relevant; member saved Not Relevant with a required reason.
- Both opinions and their comments remained visible; disagreement count became 1.
- A regular member had no finalization control.
- Member selected two papers, created a DRAFT snapshot, and opened the existing
  analysis integration with the correct exact sources and preliminary label.
- The draft-set action did not run AI or charge credits. The subsequent real gap
  enqueue/credit/input-packet boundary was verified in PostgreSQL integration tests,
  with the queue transport stubbed. No paid external LLM was called on fixture text.
- Owner subsequently finalized the conflicting paper as INCLUDED with an explicit
  explanation. Both opinions remained visible, the final decision appeared in
  history, and manual evidence extraction became available.
- The user's authenticated project opened successfully on port 8080 with all three
  original papers. Legacy classifications were disclosed separately, with zero
  fabricated assessments or new official selections.

The real-project browser check found an additional integration bug: the stored
references/related APIs return arrays, whereas the new UI expected objects. Opening
the section crashed React. The paper API adapter now accepts the actual arrays,
keeps source totals unknown instead of inventing coverage, and rejects malformed
responses independently for each relationship type. Three new adapter/component
regressions passed alongside six library tests and nine paper-detail tests (18/18).
The test harness initially lacked its i18n provider; it was corrected before the
successful run. The contribution UI regression also passed (9/9) after aligning its
fixture with the required category field. The existing allocation edit request
type was aligned with the shared matrix input accepted by the backend, which
removed another TypeScript build blocker encountered during the final rebuild.

Evidence: `two-opinions.png`, `draft-analysis-set.png`, `finalized-selection.png`,
`library-desktop.png`.

After deploying the API adapter fix, the actual project detail successfully showed
two indexed references and three source-supplied similar works, with separate
relationship labels and add-to-project actions. No new paper was added to the
user's project during this verification. The library layout was also visually
checked at 412 x 892 and the temporary viewport override was reset.
Additional evidence: `real-related-papers.png`, `library-mobile.png`.

## Data preservation

- Full local PostgreSQL backup completed before applying the application migration:
  `%LOCALAPPDATA%/LumiGap/backups/lumigap-before-library-20261029.dump` (29,331,660 bytes).
- Compared all three original project paper IDs, metadata, notes, historical
  classifications, timestamps and decision fields before/after migration: unchanged.
- No original assessment, final decision or source was deleted or fabricated.

## Changed boundaries

- Shared contracts: `project-screening.ts`, `project-analysis-set.ts`, `gaps.ts`.
- Backend: `library-assessment.service.ts`, `project-analysis-set.service.ts`,
  screening routes/controller/context/service/DTO, gap discovery/service/presenter.
- Web: collaborative library, individual assessment form, related-paper list,
  analysis-set discovery, existing screening/detail and gap result surfaces.
- Persistence: one backward-compatible SQL migration extending existing CHECKs and
  preventing deletion of immutable analysis sets. No extra domain table.
- API additions under `/projects/:id/research/screening-v2`: paper assessment,
  round defer, analysis-set create/list/detail. `/gaps/analyze` adds analysisSetId.

## Deliberate remaining boundaries

- External non-member advisors do not obtain finalizer authority implicitly. An
  explicit scoped advisor-finalizer capability is not implemented in this release.
- Cited-by, inferred topic/method/dataset relations and citation graphs are not added.
- Relationships show stored corpus metadata; they do not fetch an unlimited external
  citation network or invent absent reference records.
- Private project PDF content is not ingested into the global gap worker. Missing
  analyzable source content produces a real error instead of invented findings.
- A paid LLM run and its scientific output quality were not verified in this task.
- Web build retains existing large-chunk warnings; targeted tests retain React Router
  future-version warnings. Neither prevented the successful builds or tests.

No commit or push was performed.

## Local runtime recovery

Backend/web runtime images were created from successful host builds, and the app
initially ran on port 8090 with a healthy API. Port 8080 was occupied by another
application at the start; the user subsequently authorized reclaiming it, and a
fresh listener check found it already free. No unrelated Java/Gradle process was
terminated.

Restoring all ten workers repeatedly made the Docker/WSL control API unavailable
(HTTP 500 and WSL connection timeouts). Running workers from compiled JavaScript
reduced individual startup memory, but did not resolve the complete stack's runtime
failure. Docker had 3 GB RAM and two CPUs; the guest reported no active swap.

After explicit user approval, the previous `.wslconfig` was backed up to
`C:/Users/tdinh/AppData/Local/LumiGap/backups/wslconfig-before-library-20261029-223754.ini`
and the configuration in `wslconfig-proposed.ini` was applied. After restarting WSL
and Docker, the guest reported 3920 MiB RAM, four CPUs and 4096 MiB active swap.
Only Docker's WSL distribution was running before the restart. No container,
volume or database was deleted.

All 17 containers were restored, including ten workers. Backend health and readiness
returned HTTP 200 with PostgreSQL and Redis ready; web served HTTP 200 on port 8080.
The stack remained running at a subsequent check after approximately ten minutes.
This is a successful local recovery check, not a long-duration load test.
On resuming 2026-10-30, all 17 containers were running (current uptime approximately
48 minutes) and `/ready` again returned HTTP 200 with PostgreSQL and Redis healthy.
The browser continued to show the user's three-paper project and its current
assessment state. Later project edits made outside this verification were preserved.

The temporary compiled-worker override is at
`%TEMP%/lumigap-library-compiled-workers.yml`; repository Compose files are unchanged.
