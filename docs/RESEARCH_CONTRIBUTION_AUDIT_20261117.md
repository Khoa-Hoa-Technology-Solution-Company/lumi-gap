# Research Contribution System: audit and implementation

Date: 17 November 2026. Workspace: `D:\lumi-gap`. No commit, push, deployment, application database reset, historical migration edit or data deletion was performed.

## Existing system and confirmed problems

LumiGap already persisted research activity in `ProjectActivity`, work declarations in `ProjectContributionProposal` with participants/reviews/append-only history, mentor feedback in `MentorFeedback`, version-bound reviews in `HumanReview`, and manuscript editing/snapshots in the existing writing subsystem. `ResearchContribution` provided a review summary; it updated the latest evidence for a reviewer/submission rather than representing every review round. The 14 CRediT roles already existed in shared types.

The old Contribution workspace opened a four-category, weighted percentage allocation matrix. Its separate outcome evaluation and writing metrics could supply normalized participation suggestions. The project overview also ranked people using activity counts and displayed activity shares. These were not valid evidence of relative scientific value.

Confirmed findings:

| Priority | Finding | Change |
| --- | --- | --- |
| P1 | Manuscript attribution gathered project-wide declarations, allocation shares and advisor agreements for each manuscript. | Only explicitly manuscript-linked declarations/evidence are considered; a mentor agreement alone supplies no contribution. Actual version reviews are linked through published revisions/snapshots. |
| P1 | Mentor review rounds were absent from the common activity timeline; the legacy review summary described only the latest round. | Read canonical submitted `HumanReview` records, each with its own review/revision ID. Also append a replay-safe activity receipt in the existing review transaction. |
| P1 | A collaborator removed from a corrected declaration could disappear from personal contribution export despite remaining in immutable history. | Include historical participant snapshots and their recorded roles in the individual's redacted export. |
| P1 | Local migration history differs from this checkout. | Read-only inventory recorded below. No automatic repair or migration application. |
| P2 | Default percentage allocation and overview ranking misrepresented academic contribution. | Workspaces now use activity, research profiles and manuscript evidence. New allocation/evaluation writes are rejected; history remains readable. |
| P2 | Mentor contribution declarations were restricted by team-membership-only validation. | Reuse the same declaration workflow for an authorized active mentor's own work. Only allowed shared review evidence can be linked. |
| P2 | Cached private manuscript options could remain visible after a failed refresh. | Hide cached scopes/profiles/records on errors; regression test covers access loss. |

## Contribution core

`research-contribution-projection.ts` creates a read model from existing persisted sources. It does not introduce a second contribution database or copy all project events into a new ledger.

- System records use stable source-based identities: `ACTIVITY:<id>`, `REVIEW:<id>`, and `SYNTHESIS:<revision-id>`. Declared work uses the existing proposal and participant IDs.
- Each response records the actor, project, event/source type, source ID, timestamp, evidence link, available version, manuscript scope keys, provenance and unconfirmed role suggestions.
- `SYSTEM_RECORDED`, `USER_DECLARED`, `IMPORTED` and `INFERRED` remain distinct. A user choosing "Work in LumiGap" does not make a self-declaration provider-verified. Legacy records are identified as imported history. Suggestions are displayed as unconfirmed.
- Views, refreshes, login, mentorship acceptance, assignment acceptance, routine reordering and autosaves are excluded. Import attempts already marked duplicate are excluded. Unreviewed AI-generated synthesis is excluded; human synthesis and recorded review of synthesis are included.
- Task events name the authenticated performer rather than substituting the assignee. Completing a task provides execution evidence, not a confirmed CRediT role. Task-to-manuscript attribution follows the saved task revision, so changing a later deliverable link does not move earlier work to another manuscript.
- Legacy review proxy tasks are excluded from this projection when they represent the same manuscript review. Review requests themselves are not contributions.
- Projection pagination, filters, counts and profile aggregation run in PostgreSQL before pagination. Person profiles are alphabetical and split by research member/mentor, not ranked by count. Active participants may have zero records; accepting mentorship does not manufacture evidence.
- The original source rows and existing append-only histories remain authoritative. Re-reading old data produces the same record IDs and does not create backfill rows. Ambiguous historical events are not merged or reassigned by guessing.

The existing authenticated writing subsystem still records editing sessions and retained-source information. An editing session or snapshot identifies an action by an account; it does not prove authorship of every word or intellectual ownership. No role is automatically assigned from snapshot creation or task completion.

## Project scope, manuscript scope and CRediT

Project scope includes the research team's authorized research records. Manuscript scope follows explicit references to a draft workspace, its snapshots, published submission revisions, submitted review IDs or directly linked task revisions. A standalone uploaded submission is also a manuscript scope. Published versions backed by a draft resolve to that draft's manuscript scope for team members; an authorized mentor sees only the shared submission scope.

There is no inference that all project work belongs to all manuscripts. Reviewer feedback remains bound to its exact submitted revision; v2 does not replace v1 evidence. An old snapshot's source contributor detection also excludes edits/suggestions that happened after that snapshot.

CRediT uses the existing complete 14-role taxonomy. Several people can hold the same role and a person can declare several roles. Conservative suggestions currently include Data curation for extraction and Writing – review & editing for submitted manuscript feedback. Other roles, including Methodology, Formal analysis and Supervision, can be declared with evidence and reviewed through the existing workflow. They are not inferred merely from a person's project role.

External work is entered once in the existing declaration editor, which supports multiple named participants, evidence, manuscript references, corrections and disagreements. Mentors can declare their own work without gaining membership or access to other private artifacts. Member and mentor declarations use the same proposal/participant/review/history tables.

The manuscript statement endpoint includes explicitly linked, acknowledged CRediT declarations, and blocks export while there are unacknowledged changes/disputes. The existing `SELF_RECORDED` state represents all named team participants acknowledging their roles without inventing an independent reviewer. A statement does not determine author eligibility, first/corresponding authors, author order, scientific quality or publication acceptance. Existing authorship review remains separate.

Reference: [NISO CRediT role definitions](https://credit.niso.org/contributor-roles-defined/), [ANSI/NISO Z39.104-2022](https://www.niso.org/publications/z39104-2022-credit). CRediT is not an authorship eligibility policy; the institution, discipline and publication venue determine that policy.

## API and UI

Existing `/projects/:id/contributions/activity` and `/work` APIs are reused and extended. New read-only endpoints are:

- `GET /projects/:id/contributions/research`: paginated, actor/group/category/manuscript-filtered projection and profile roster.
- `GET /projects/:id/contributions/research-artifact`: authorize an exact evidence source before returning its destination or decision history.
- `GET /projects/:id/contributions/manuscript-statement?scopeKey=...`: agreed manuscript CRediT statement, not an author list.

All paths are beneath `/api/v1`. DTOs are strict, identities come from the authenticated session, SQL is parameterized, and limits are bounded. Clients cannot create synthetic system events or set system provenance.

The primary UI has three sections: Research activities, Research contributions, and By manuscript. Supporting links retain declarations/corrections, personal evidence export, the integrity package and read-only allocation history. There is no new percentage calculator or leaderboard. Mentor links retain the mentor sidebar. Each source is read through its existing authorized workflow; decision evidence is shown with source revision history.

The activity timeline retains date/timezone/day filters and adds manuscript scope. Profiles show the actual work/evidence, provenance, saved version and role suggestions. Empty/loading/error states, retry, escaped source text, keyboard focus, responsive layout and Vietnamese/English copy are implemented.

Mentors require an effective policy with `CONTRIBUTIONS_VIEW`. They see their own permitted review/feedback/declaration evidence; team draft work and unrelated member activity are redacted. Existing version-bound review grants are reused, including grants that do not provide broad `SUBMISSIONS_VIEW`. Revocation removes source access without removing recorded evidence. A mentor policy without Contribution permission is not silently expanded.

## Data preservation and local audit

No Prisma schema or SQL migration was necessary for this feature. Existing idempotency keys, unique review IDs, saved source revisions and append-only histories are reused. No historical percentages, declarations, review feedback, participant history or snapshots were removed.

Read-only local inventory:

| Data | Count |
| --- | ---: |
| Project activity rows | 784 |
| Activity rows matching the meaningful-event taxonomy | 433 |
| Such legacy rows without an idempotency key | 110 |
| Work declarations | 52 |
| Historical allocation revisions | 79 |
| Submitted Mentor-guidance reviews in this local DB | 0 |
| Duplicate non-null project/idempotency keys | 0 |

The local application therefore has no submitted formal Mentor-guidance feedback to demonstrate as a real contribution yet. Review and multi-version browser scenarios were verified using a separate disposable PostgreSQL database, not by adding reviews to a real project.

Migration audit: 156 applied records, 146 local migration directories, three local migrations not recorded as applied, 13 applied names absent from this checkout, eight checksum mismatches not explained by LF/CRLF variants, 40 additional differences explainable by line endings, and no unfinished migration records. Full names are in [local-data-audit.json](audits/2026-11-17-research-contributions/local-data-audit.json).

The three pending names are `20261102090000_papers_openalex_id_unique`, `20261107113000_orcid_verified_unique` and `20261110090000_screening_team_workflow`. Do not blindly run all pending migrations on this local DB. First take a backup, recover the exact applied migration files from the correct Git history, compare the physical schema against both histories, and produce a reviewed forward-only reconciliation plan. This task did not edit `_prisma_migrations`, normalize its checksums, mark anything resolved or reset a database.

`scripts/audit-research-contributions.ts` can repeat the read-only inventory. Clean-database integration uses `scripts/test-mentor-workspace.mjs --contributions-only`; only a randomly named `codex_mentor_workspace_<hex>_test` database is created and removed. The application DB is untouched.

## Verification and remaining limits

Executed checks:

| Check | Result |
| --- | --- |
| Isolated PostgreSQL + real HTTP + research rules + Mentor review workflow | 46 passed, two optional interactive fixture tests skipped in the final noninteractive run |
| Web contribution, Mentor, project navigation and stale-access regression | 90 passed |
| Retained-writing calculator/service and contribution domain/rule regression | 45 passed; includes the same 14 new rule tests as the first row, so totals should not be added as unique tests |
| Shared-types compilation, backend typecheck, backend `tsc -p tsconfig.build.json`, web `pnpm build`, targeted frontend/backend ESLint | Passed |
| Local data/migration audit | Read-only inventory completed; existing mismatch described above |

The integration tests exercise actual screening submission/retry, extraction/review, human synthesis, exclusion of unreviewed AI output, task actor/assignee attribution, task version scope, manuscript separation, v1/v2 review evidence, duplicate prevention, manual evidence/corrections/disputes, departed collaborator history, mentor grant/revocation, outsiders, soft deletion and strict authenticated HTTP routes.

Browser QA used real API/database records in the isolated fixture: separate member and mentor views, manuscript selection, an acknowledged statement, the full 14-role declaration editor, mentor sidebar continuity, desktop and 390px mobile. The Mentor view did not contain the private draft title or student evidence. There were no browser errors for the verified 13101 QA origin. Screenshots: [manuscript desktop](audits/2026-11-17-research-contributions/manuscript-desktop.png), [mobile](audits/2026-11-17-research-contributions/manuscript-mobile.png), [mentor desktop](audits/2026-11-17-research-contributions/mentor-desktop.png). The optional QA server was closed after verification.

Remaining limitations:

- P1, existing environment: migration divergence must be reconciled before a release or applying pending migrations to the local application DB. Clean migration replay succeeds; that does not repair this environment's history.
- P2, legacy evidence: 110 meaningful legacy events have no request key. Their original rows remain visible and stable; this implementation cannot prove whether two separately recorded historical actions were semantically duplicates. It does not invent a destructive deduplication rule.
- P2, scope completeness: activities without an explicit manuscript link remain project-scoped. Historical missing links are not guessed. Current project scope is not a statement of scientific completeness.
- External software/experiment integrations are not fabricated. Work from such sources can be declared with evidence. `IMPORTED` currently labels existing legacy records; this is not a new GitHub/ORCID ingestion feature.
- Lead/Equal/Supporting degrees were not added as a separate persistent scale. Existing 14-role declarations and acknowledgement are supported without introducing another weighting system.
- The display counts evidence/action records; it does not infer elapsed effort, intellectual ownership, research quality or relative scientific value. A user's pasted/AI-assisted writing cannot be distinguished from intellectual authorship by account edit provenance alone.

Contribution Core is implemented on existing sources and verified for the tested workflows. Environment-wide release readiness remains conditional on resolving the existing migration mismatch; no production deployment was attempted.

## Changed-file map

- Shared contract: `packages/shared-types/src/project-contributions.ts`.
- Core: `research-contribution.rules.ts`, `research-contribution-projection.ts`, `contribution-activity.service.ts`, `work-contributions.service.ts`, `contribution-protection.service.ts`, `project-overview.service.ts`.
- Integration: `projects/dto/project-contributions.schema.ts`, `project-contributions.controller.ts`, `project-contributions.routes.ts`, `reviews/review.service.ts`, `workspaces/manuscript-attribution.service.ts`.
- UI: `research-contributions-panel.tsx`, `project-contributions-workspace.tsx`, `contribution-activity.tsx`, `contribution-artifact-link.tsx`, `work-contributions.tsx`, `mentor-project-workspace.tsx`, `workspace-overview.tsx`, `pages/projects/projects-workspace.tsx`, contribution API/CSS and contribution locales.
- Tests/tooling: research contribution unit/persistence/UI tests, the existing contribution UI regression, the isolated mentor test runner extension and read-only audit script.

Unrelated dirty files from earlier work were preserved.
