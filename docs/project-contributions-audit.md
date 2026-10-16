# Project Contributions & Contribution Allocation — Independent Audit

Date: 14 October 2026. Workspace: `D:\lumi-gap`. Classification: **FUNCTIONALLY_COMPLETE_WITH_RISKS** for the existing V1 work-record and unanimous-allocation workflows.

This report audits the actual implementation and records conservative fixes. The earlier `docs/project-contributions-implementation.md` remains unchanged. Its earlier test results are not counted as evidence for this audit. No commit, push, deployment, or migration of the normal application database was performed.

## Evidence conventions

**PASS** means the identified checks were executed successfully. **PARTIAL** means some behavior was executed and some was inspected or remains unsupported. **NOT_TESTED** identifies an unexecuted check. **BLOCKED** identifies a scenario requiring infrastructure or functionality absent from this implementation. Code inspection alone does not establish a runtime PASS.

Evidence aliases below refer to actual files, with test names searchable in those files:

| Alias | Evidence |
|---|---|
| DOMAIN | `apps/backend/src/modules/projects/__tests__/contributions-domain.test.ts` — seven percentage, DTO, CRediT, date and query-bound tests |
| CP | `apps/backend/src/modules/projects/__tests__/project-contributions.persistence.test.ts` — seventeen work, allocation, membership, artifact, HTTP and saver-provenance tests |
| AUDIT | `apps/backend/src/modules/projects/__tests__/project-contributions.audit.persistence.test.ts` — thirteen new database, workflow, race, privacy, failure, aggregation and retry tests |
| PERF | `apps/backend/src/modules/projects/__tests__/project-contributions.performance.test.ts` — work-list and historical-revision query counts |
| COORD | `apps/backend/src/modules/projects/__tests__/workspace-collaboration.persistence.test.ts` — twenty-six adjacent workspace tests |
| RESEARCH | `apps/backend/src/modules/projects/__tests__/collaborative-research.persistence.test.ts` — twelve source, screening, evidence, gap, mentor and HTTP tests |
| PROJECT | `apps/backend/src/modules/projects/__tests__/project-workspace.persistence.test.ts` — five project membership, privacy and persistence tests |
| NOTIFY | `apps/backend/src/modules/notifications/__tests__/notification.service.test.ts` — three notification target/transaction tests |
| WEB | `apps/web/src/features/projects/__tests__/project-contributions.test.tsx` — eight contribution component checks |
| BROWSER | `apps/backend/src/modules/projects/__tests__/project-contributions.e2e.test.ts` — three Chromium workflows using real Express, authentication and PostgreSQL |
| PLAN | `artifacts/contributions-audit/heatmap-plan.sql` and `heatmap-plan.log` — executed PostgreSQL plans with rollback-only synthetic fixtures |

Final verification output is in `artifacts/contributions-audit/verification-final.log`. Browser results are in `browser-final.log`; the subsequent screenshot recapture is in `browser-capture.log`. `verification.log` and `browser.log` preserve earlier runs and must not be mistaken for final totals.

## A. Current implementation

### Routes and UI

The canonical API prefix is `/api/v1/projects/:id/contributions`. The actual router is `apps/backend/src/modules/projects/project-contributions.routes.ts`, mounted behind `requireAuth` and `requireResearchWorkflow` in `project.routes.ts`. Controllers use authenticated `req.user.sub`; Zod middleware validates body/query/params. Writes use `createRateLimiter("projects:contribution-writes", ...)`.

| Method | Suffix | Service operation |
|---|---|---|
| GET | `/activity` | `contributionActivityService.list` |
| GET / POST | `/work` | Work list / creation |
| GET / PATCH | `/work/:itemId` | Scoped detail / versioned correction |
| POST | `/work/:itemId/submit` | Work submission |
| POST | `/work/:itemId/reviews` | Acknowledgement, independent acceptance, changes or dispute |
| GET / POST | `/periods` | Current-team periods / owner creation |
| GET | `/periods/:itemId` | Scoped period and eligibility |
| GET / POST | `/periods/:itemId/history`, `/periods/:itemId/revisions` | Revision history / owner draft |
| POST | `/periods/:itemId/challenges` | Explicit roster challenge |
| GET / PATCH | `/revisions/:itemId` | Scoped revision / owner draft edit |
| POST | `/revisions/:itemId/submit`, `/revisions/:itemId/decisions` | Submission / authenticated participant decision |
| GET | `/revisions/:itemId/export` | Finalized or superseded JSON export |

There is no trusted activity POST, contribution DELETE, allocation DELETE, arbitrary status setter, or owner Finalize endpoint. Legacy academic proposal mutation controllers return 409 and direct callers to the revision-controlled workflow. Their legacy service methods still exist for older academic flows/tests; they are not the canonical HTTP mutation entry point.

The web project detail mounts `ProjectContributionsWorkspace` with Activity, Work Contributions and Allocation tabs. Actual components are `contribution-activity.tsx`, `work-contributions.tsx`, `contribution-allocation.tsx`, and `contribution-artifact-link.tsx`. `contributions.api.ts` unwraps the response envelope. `use-workspace.ts` owns user/project/query keys and mutation invalidation. Restricted routes are `/projects/:id/allocation?revision=...` (or `period=...`) and `/projects/:id/contribution-review?record=...`, with dedicated page components. Notification destinations use the exact record/revision IDs returned by the notification API.

### Services and stores

| Responsibility | Actual implementation | State |
|---|---|---|
| Trusted activity | Canonical `ProjectActivity`; `workspaceEvent` and section-save producers; `contribution-activity.service.ts` | IMPLEMENTED_AND_TESTED for tested producers/aggregation; other producers inspected |
| Work records | `ProjectContributionProposal`, `ContributionParticipant`, `ContributionReview`, `ProjectContributionHistory`; `work-contributions.service.ts` | IMPLEMENTED_AND_TESTED |
| Membership provenance | `ProjectMember` plus trigger-maintained `ProjectMembershipPeriod` | IMPLEMENTED_AND_TESTED; pre-migration history is PARTIAL |
| Allocation | `AllocationPeriod`, `AllocationRevision`, `AllocationShare`, `AllocationApproval`; `allocation.service.ts` | IMPLEMENTED_AND_TESTED for supported V1 |
| Durable notifications | Existing `Notification` outbox, `contributions-notification.ts`, `contributions-mail.service.ts`, `notification.worker.ts` | Persisted intent and mocked SMTP failures tested; live delivery NOT_TESTED |
| Academic public records | Existing `ResearchContribution`, review service and legacy academic proposal service | Separate purpose; public-profile exposure inspected |
| Manuscript source | `DraftWorkspace`, `WorkspaceSection`, `SectionRevision`; `workspace.service.ts` | Saver provenance tested; exact collaborative authorship NOT_IMPLEMENTED |

The conceptual names ContributionEvent, ContributionRecord and AllocationParticipant are not extra tables. Activity and work reuse the canonical stores; the frozen allocation roster is revision JSON paired with share rows. `ResearchContribution` represents academic verification/public archive records, not effort percentages. New manual work records are PRIVATE and do not create public academic records. Historical legacy records can coexist in the canonical proposal table and are read-only in the new work UI.

Schemas are in `collaboration.prisma`, `project-workspace.prisma`, and `project-allocation.prisma`. Relevant handwritten migrations:

- `20261014000300_project_workspace_collaboration` through `20261014000600_research_history_kinds`: adjacent research collaboration/history.
- `20261014000700_project_contribution_allocation`: membership intervals, participants/reviews, exact shares, frozen revisions, append-only guards and SQL-only foreign keys.
- `20261014000800_allocation_integrity_guards`: submitted share protection, consensus/update guard and decision insert guard.
- **New:** `20261014000900_allocation_lifecycle_boundary`: draft-only insertion and status/timestamp boundary guard.

## B. Business logic assessment

The supported allocation is a documented agreement for one scope, using integer basis points. No activity count, task count, text volume, CRediT role or manuscript saver event computes a percentage. There is no phase weighting or additive aggregation of overlapping periods. Creation/submission is separate from the owner's approval; every frozen participant, including a zero-percent or departed participant, must approve the same revision. Disputes and roster challenges block finalization. Single-person results require an explicit decision and are labelled self-acknowledged.

`CORE_TEAM_UNANIMOUS_V1` conservatively includes membership overlapping the period plus documented submitted team work in that scope. Historical submitted attribution survives later corrections. This intentionally includes some people who may ultimately agree to 0%; it does not infer objective work quality. Mentorship/reviewer/badge/admin status does not add a person to the denominator or grant allocation authority. An actual project member with another academic role receives ordinary membership rights.

The principal confirmed defects were a direct-database lifecycle bypass, a misleading exact-submission retry conflict, invalid draft submission being enabled in the UI, repeated database reads in list/history presentation, untranslated work-history actions, and missing request receipts for research decision creation. Fixes and limitations are detailed below.

## C. Workflow audit matrix

This table covers the request's numbered audit areas. “Inspection” limits the claim to the indicated code; it is not fabricated test evidence.

| # | Expected / actual result after fixes | Status | References and executed evidence | Severity / limit |
|---|---|---|---|---|
| 1 | Activity, claimed work and agreed effort remain separate; no automatic score or grade/authorship assignment | PASS | Allocation service shares; DOMAIN, CP, AUDIT saver case, WEB, BROWSER | No observed violation |
| 2 | Canonical stores/routes identified; legacy/public academic records have separate roles | PARTIAL | A inventory; actual schemas/routes inspected; listed suites executed | No exhaustive test of every old internal academic caller |
| 3 | Research operations persist meaningful events; task and manuscript ingestion checked directly | PARTIAL | Producers in D; CP task/manuscript; AUDIT decision receipt; COORD screening event assertions; RESEARCH operation tests | Independent ingestion assertions missing for every gap/evidence event variant |
| 4 | Actor is server-derived; denied forgery; events participate in transactions; tested retries produce one event | PARTIAL | `workspace-access.ts`; CP HTTP/retries; AUDIT F, rollback and decision retry | Unkeyed legacy decision creation remains compatible; section creation retry not fault-injected |
| 5 | Persisted timeline and heatmap agree by timezone/member/day; paging deterministic | PASS | Activity service; DOMAIN midnight; AUDIT persisted boundary fixtures; WEB and BROWSER | Large production scale not established |
| 6 | Draft → submission → peer result; material corrections increment version and keep snapshots | PASS | Work service; CP shared/corrections; AUDIT retry; BROWSER offline/acceptance | No author edit during unresolved submission |
| 7 | Named contributors acknowledge; creator cannot independently accept; owner cannot edit another claim | PASS | Work review/save; CP shared/historical attribution; AUDIT F | Departed creators can challenge their record but cannot edit project work |
| 8 | Offline work is declared MANUAL, not fabricated trusted research activity | PASS | DOMAIN, CP, BROWSER | Evidence is declared unless reviewed; no quality certification |
| 9 | Cross-project task/manuscript references denied; record/history retains descriptions and reference IDs | PARTIAL | `validateWork`, `assertWorkspaceLink`; CP artifact isolation; COORD task history | Loss of external file content not simulated; record does not archive every linked file |
| 10 | Fourteen CRediT roles support shared/multiple roles without scores | PASS | Shared role enum; DOMAIN validation and CP shared work | No authorship inference |
| 11 | Scope/dates persisted and each period has its own 100% | PASS | CP periods; AUDIT A/B; BROWSER date display | Overlap warning inspected; no weighted aggregation exists |
| 12 | Departed/documented participants retained; changed roster or challenge blocks agreement | PASS | Eligibility service; membership SQL trigger; CP intervals/historical attribution/roster changes; AUDIT C/D | Legacy erased membership cannot be reconstructed |
| 13 | Exact total, integer bounds, complete unique roster and explicit zero rationale/consent | PASS | SQL checks, DOMAIN, CP, AUDIT zero objection, WEB disabled draft checks | Draft totals may be incomplete until submission |
| 14 | Owner creates scope/proposal; frozen roster, rationale, evidence summary and submission retained | PASS | Allocation draft/submit; AUDIT A/B; BROWSER | Summary is intentionally minimal and capped at 500 current records |
| 15 | Actual transitions enforce draft/awaiting/disputed/finalized/superseded; no arbitrary UI status | PASS | CP transitions; AUDIT SQL boundary and HTTP F; new migration 009 | P1 database bypass fixed; no HTTP bypass was reproduced |
| 16 | Unanimity includes owner; forged/missing/stale approvals do not count | PASS | CP final-approval race/revisions; AUDIT A/B, F; BROWSER three approvals | No silence or owner override |
| 17 | Submitted payload and decisions immutable; revised proposal starts without approvals | PASS | SQL 007–009; CP amendment/history/SQL edits; AUDIT A/B; BROWSER | DB privileges capable of disabling triggers are outside app authorization |
| 18 | Reasons persisted; owner revises; old disputes remain unresolved history | PASS | CP challenges/revisions; AUDIT races; BROWSER C and former-member dispute | No automatic arbitration/timeout |
| 19 | One-person 100% still requires a separate self decision | PASS | CP single/shared self-recording; Vietnamese BROWSER solo | No invented independent reviewer |
| 20 | Owner/member/former/nonmember and privilege boundaries enforced server-side | PARTIAL | G matrix; CP; AUDIT actual mentor + verified lecturer + ADMIN HTTP probe | Assigned formal reviewer fixture not separately executed against every contribution route |
| 21 | Former D reviews/disputes only relevant allocation and cannot open project manuscript/general work | PASS | CP departed/historical rights; AUDIT four-member C/D; BROWSER notification → scoped view and denied work API | Scope shares minimal titles/participants by design |
| 22 | Mentor relationship/badge/admin does not grant team percentage authority | PASS | AUDIT actual active relationship and badge/admin probe; CP denominator denial; COORD mentor boundaries | Formal reviewer denial additionally inspected, not separately fixture-tested |
| 23 | Public project does not expose private contributions or guessed allocation IDs | PARTIAL | CP PUBLIC isolation; AUDIT F cross-project/guessed IDs; public archive service inspected | New work is not published to public archives; all public-profile combinations not rerun |
| 24 | Actual manuscript saves identify saver only, preserve source versions and ignore unchanged content | PASS | CP; AUDIT E; workspace service inspection | CRDT ownership/replay transport is BLOCKED: absent implementation |
| 25 | 100 lines vs small correction creates no automatic effort ranking; text replacement retains old versions | PARTIAL | AUDIT E actual section edits/replay conflict/source retention | AI import and three-way real-time snapshot/reconnect scenario NOT_TESTED/unsupported |
| 26 | FKs, uniqueness, exact totals, consent and append-only allocation/work history protect records | PARTIAL | Schema/migrations; CP SQL guards; AUDIT direct SQL boundary passed for allocation/work | Existing manuscript source rows have no equivalent universal SQL append-only guard |
| 27 | Final approvals, dispute, tabs, removal and revision creation serialize correctly | PARTIAL | CP simultaneous last approvals + duplicate; AUDIT approve/dispute, conflicting tabs, removal/revision race | Real TCP response loss, every archive/approval ordering and many-instance stress not executed |
| 28 | Durable intent rolls back with transaction failure; delivery failures cannot change finalized agreement | PARTIAL | AUDIT outbox failure + mocked SMTP refusal/retry/uncertain delivery; CP archived/inactive account | Live worker crash/restart, live SMTP/push, file loss and refresh-expiry browser paths NOT_TESTED |
| 29 | Heatmap/timeline dates, filters, empty state and disclaimer work on desktop/mobile | PARTIAL | AUDIT aggregate paging/midnight; WEB empty/day selection; BROWSER screenshots | Very long names and 390px checked; screen reader/contrast audit not formally measured |
| 30 | Work create/evidence/acceptance/dispute/history and permitted actions usable | PARTIAL | WEB + CP + BROWSER; localized action labels fixed | Full browser sequence of every correction/CRediT checkbox not executed |
| 31 | Owner/member, former participant and solo user see distinct allowed allocation actions | PASS | WEB capability tests; three BROWSER scenarios; no owner Finalize CTA | Cross-user live refresh is focus/reload driven |
| 32 | Precise numeric entry; invalid saved drafts cannot submit; failures retain unresolved state | PARTIAL | DOMAIN; WEB total/precision/zero/roster/error; BROWSER 60/25/15 → 40/35/25 | No slider; 100-person rendering/keyboard-only form traversal NOT_TESTED |
| 33 | Vietnamese contribution wording, responsive layout, labels/focus and long names | PARTIAL | Vietnamese BROWSER solo; all screenshots reviewed; UI labels/focus CSS inspected | Raw snapshot JSON is technical; global notification shell localization not comprehensively audited |
| 34 | Fresh domain/integration/auth/persistence/race/frontend/browser execution | PASS | J exact commands/results | Coverage limits remain explicitly listed |
| 35 | Query growth and SQL plans measured; expensive list/history work reduced | PARTIAL | PERF and PLAN | Period eligibility fan-out, large outbox and 100-member UI still need production-scale measurement |
| 36 | Confirmed defects conservatively fixed and classified | PASS | I change inventory and regression results | No destructive migration or major policy change |

### Requested scenarios

| Scenario | Executed result |
|---|---|
| A — A40/B35/C25 | PASS: exact shares, three separately authenticated UI approvals, PostgreSQL final row, three approval rows and one finalization event; export downloaded |
| B — disagreement/revision | PASS: first A60/B25/C15 has A/B approvals and C dispute; second A40/B35/C25 starts with zero approvals and requires three new decisions; original remains disputed history |
| C — departed D | PASS: four-member service workflow and Chromium notification → restricted view; D's documented work retained, minimal evidence summary shown, general work API and manuscript service denied; D disputes |
| D — owner manipulation | PASS for tested exclusion, 0% objection, mutable submitted terms, another claim edit, forgery, absent finalize/delete routes and protected SQL history. No claim of comprehensive SQL-admin security |
| E — collaborative LaTeX | PARTIAL: actual versioned section saver provenance, unchanged/stale replay, replacement and retained source tested. Real Yjs/CRDT/reconnect and whole-manuscript snapshot attribution are BLOCKED/unsupported |
| F — unauthorized requests | PASS for the concrete HTTP cases in AUDIT and CP, including actual mentor/badge/admin status, guessed IDs, forged identity/status, fake activity, cross-project substitution and revoked/nonexistent session |
| G — concurrent final approvals | PASS: CP issues simultaneous approvals with duplicate retry; two immutable decisions and exactly one finalization event. AUDIT additionally tests approve/dispute and two conflicting tabs |

## D. Activity tracking

The activity feed selects an explicit meaningful-event allowlist. It excludes chat/presence, allocation decisions, contribution declarations, ordinary task updates and administrative audits. No fake dates/events populate empty heatmap days; empty calendar cells represent zero persisted events.

| Producer | Persistent route/service path | Audit evidence and limit |
|---|---|---|
| Plan | `project-plan.service.ts` → immutable plan snapshot + PLAN_UPDATED through `workspaceEvent` | COORD plan persistence/concurrency executed; event producer inspected |
| Literature | `project-sources.service.ts`, `project.service.ts`, `literature.service.ts` → canonical project activities | RESEARCH import/upload retries and COORD screening executed; every legacy ingestion path not individually fault-injected |
| Screening | `project-screening.service.ts` and existing project paper mutation → decisions/revisions + events | COORD directly checks PAPER_SCREENED event history; RESEARCH blind-vote and resolution operations executed |
| Evidence/gaps | `project-evidence.service.ts`, `project-gap-research.service.ts`, `gap-validation.service.ts` → transactional revisions and events | RESEARCH full operations executed; all event-count assertions not independent |
| Decisions | `project-discussions.service.ts` → ProjectDecision + workspace revision + DECISION_RECORDED/REVISED | AUDIT now checks concurrent keyed retry and original receipt after edit; only one creation event |
| Task completion | `project-tasks.service.ts` → DONE transition + TASK_COMPLETED | CP repeated same creation key produces one completion; COORD reopening/concurrency executed |
| Manuscript | `workspace.service.ts` → SectionRevision + MANUSCRIPT_REVISION_SAVED | CP/AUDIT exact saver IDs and versions checked; unchanged save produces no new event |

Identity comes from server context. Historical actor UUIDs are retained; names are current user display names rather than claimed historical name snapshots. Null/system actors are not backfilled using the current owner. Feed responses omit raw metadata, including blinded screening details. Polymorphic links are references and do not grant access; some older import events use request IDs and therefore have no artifact link. Not every adjacent producer supplies an `artifactVersion`.

Heatmap grouping uses PostgreSQL `AT TIME ZONE`; the API validates the IANA timezone and limits a requested range to 366 days. Timeline paging uses `(created_at DESC,id DESC)`; the day's total derives from the same filtered aggregation. AUDIT fixtures straddle exactly 17:00 UTC and verify different UTC/UTC+7 totals. Those fixtures prove aggregation, not event ingestion. A new SQL DISTINCT actor query avoids transferring every historical actor occurrence to Prisma for deduplication.

Receipt guarantees apply to routes with request keys or optimistic versions. Work/period/proposal/task/import retries are tested. New decision UI supplies a stable key; the optional key preserves older internal/API callers, which must supply one to obtain creation deduplication. Unkeyed section creation and other unkeyed legacy mutations are not proven idempotent after lost responses. A stale version conflict safely prevents duplicate writes for the tested manuscript update path.

## E. Contribution records

`validateWork` requires the creator in the named roster, documented team membership for each participant, a nonfuture work date and project-local artifact references. CRediT roles remain categorical. The record's MANUAL/WORKSPACE source is a declared classification, not a claim of cryptographically verified evidence.

Independent acceptance requires a current peer outside the named roster. Other named collaborators must acknowledge their roles. The creator's declaration is not independent acceptance. If every active team member is named and acknowledges, the supported result is SELF_RECORDED, which avoids requiring a nonexistent external peer. A later dispute/changes request is a separate immutable review response. A material correction increments the version, resets DRAFT, clears current confirmation and stores new snapshots without deleting old reviews.

Only the original creator may correct a work record, and only while currently able to write project work. The owner has no special ability to overwrite someone else's record. Current and historically named collaborators retain restricted record/challenge access after departure or removal from a correction. Their responses hide artifact reference arrays and return restricted historical snapshots. Their own record's description/evidence and review feedback remain shared for attribution review; allocation-only access does not grant this record access or project-document access.

Historical work meaning is supported by immutable proposal snapshots and retained descriptions/evidence. JSON links do not archive all remote file bytes. The accepted-work correction remains visibly auditable; it is not a new independent score entry for every contributor.

## F. Allocation

Share rows store integer basis points with SQL range/unique constraints. Drafts may have incomplete totals; submission requires 10000, exactly one share per eligible user, a substantial rationale and a zero-share rationale. The submitted roster and evidence summary are frozen. Submission does not create approval rows. Decisions derive their user ID from authentication and are immutable per revision/user.

The project transaction lock serializes submission, share edits, revision numbering, approvals, roster challenges, membership mutations and finalization. Finalization requires every frozen participant's APPROVE decision for that revision. Superseding an earlier final and creating the new final happen in the same transaction. SQL triggers defend submitted payload/shares/decisions and final consensus. Migration 009 closes INSERT and draft-status/timestamp shortcuts that escaped the earlier UPDATE-only guard.

Former-user access first establishes eligibility or historical frozen participation in the exact period; unrelated projects/periods still fail authorization. Drafts remain private to the current team. Submitted summaries include contribution titles/status/participant IDs, not artifact text, private evidence URLs or contribution review explanations. A legitimate former participant can challenge a roster while awaiting. Scope/date policy and pre-migration uncertainty are explicit, not fabricated membership history.

History now presents the frozen roster directly; it no longer recomputes live eligibility for every historical revision. Live eligibility is still recomputed for period presentation, draft/submission and approval checks. Unavailable accounts cannot provide missing consent; previous consent is not silently removed or transferred. No admin override or timeout resolution exists. A finalized agreement can be amended through a new revision, preserving the old final until the new agreement supersedes it.

## G. Permissions, IDOR and privacy

The following is the actual server policy for the Contributions API. “Former” means legitimate scoped membership/attribution/frozen participation, not an arbitrary ex-member. Academic roles apply only when the person is not also a current project member.

| Operation | Owner | Current member | Former scoped participant | Active mentor / formal reviewer / nonmember / admin alone |
|---|---|---|---|---|
| Activity / team work list | Yes | Yes | No | No |
| Relevant work detail | Yes | Yes | Only current/historical named record | No |
| Create work | Yes, must name self | Yes, must name self | No | No |
| Edit/correct work | Own original record | Own original record | No general write right | No |
| Acknowledge / independently accept | Named / independent rules | Named / independent rules | Own named acknowledgement; historical challenge; no independent acceptance | No |
| Dispute attribution | Permitted peer outside creator | Permitted peer outside creator | Relevant named/historical record | No |
| Create periods / edit proposals | Owner only | No | No | No |
| Read submitted allocation/history | Yes | Yes | Relevant authorized period only | No |
| Approve/dispute allocation | Frozen participant only | Frozen participant only | Frozen participant only | No automatic permission |
| Challenge awaiting roster | Authorized period viewer | Authorized period viewer | Authorized period viewer | No automatic permission |
| Export final/superseded allocation | Authorized viewer | Authorized viewer | Relevant authorized viewer | No automatic permission |
| Rewrite submitted payload/approval/history | No | No | No | No app endpoint |

Archived projects reject writes for all actors. Read-only UI capabilities derive from server responses, not hidden-button assumptions. Active/email-verified account checks are inside the service transaction as well as HTTP authentication. IDs are scoped by project; the revision's lookup does not itself authorize its period/project.

AUDIT uses an actual active MentorRelationship, verified lecturer profile and ADMIN system role on a nonmember and checks real HTTP denials. It also attempts another member's record edit, guessed/private revision/export/history access, actor forgery, direct status forgery, cross-project revision substitution, fake activity ingestion and the nonexistent Finalize/Delete routes. Assigned formal-reviewer status was inspected through the membership-only code path but was not instantiated in a dedicated contribution-route fixture.

Public-profile `reviewService.listContributions` reads the separate `ResearchContribution` store with visibility/resource checks and omits private explanation/evidence for other viewers. The new work/allocation services never write those public academic records. This conclusion is code inspection plus PUBLIC-project contribution denial tests, not a complete fresh public-profile penetration test.

Contribution notifications contain generic text and authenticated restricted links. Delivery authorization for PROJECT_CONTRIBUTION_UPDATE/PROJECT_ALLOCATION_UPDATE is not rechecked by the existing workspace notification audience helper, which only gates PROJECT_WORKSPACE_* types. Thus a removed, no-longer-eligible recipient can receive an obsolete generic alert; the deep link still enforces authorization. No private-content leak from this generic delivery was reproduced. This remains a P2 audience/UX risk, not evidence of a forged approval or document-access grant.

## H. UI/UX and frontend state

Query keys include user ID, project ID, section and parameters; stale time is 15 seconds. Mutations await API completion and invalidate workspace, research, project and project-list caches. There is no optimistic finalization, synthetic success toast or carried approval. WEB verifies a failed decision leaves the unresolved proposal/error state. Creation forms retain stable request keys while mounted and unsaved-input guards exist. Exact retries after the team already finalized/accepted now return current committed results.

Cross-user changes do not stream into these tabs. Query refetch on focus/remount and explicit reload reveal updates; BROWSER reloads the other participant's page after finalization. The module does not promise live agreement synchronization. Real packet loss, failed cache invalidation, account switching during refresh, and a completely expired browser session were not fault-injected. The shared Axios client refreshes 401s once and clears invalid auth on failure; pending contribution requests do not use its optional expectedUserId binding.

The percentage editor uses decimal text inputs converted to exact basis points. Saved invalid drafts now have a disabled Submit CTA with a translated explanation. Provisional and agreed states have different labels, warning text, export availability and badge treatment. Owner/member/former/solo views were exercised. Work-history actions are translated instead of exposing raw action codes; stored snapshot JSON remains a technical disclosure panel.

Fresh screenshots in `docs/contributions-audit-screenshots/`:

- `activity-desktop.png`, `activity-mobile.png`
- `work-desktop.png`, `work-mobile.png`
- `allocation-desktop.png`, `allocation-mobile.png`
- `former-participant-mobile.png`
- `single-participant-vi-mobile.png`

All were visually inspected at least once, including the recaptured former/solo images. Browser checks assert document scrollWidth ≤ viewport width at 390px. Long project/member names wrap; the heatmap scrolls within its container and its cells have date/count labels. Numeric entry, labels and focus styling are present. Screen-reader traversal, measured contrast, 320px layouts, every Vietnamese error/empty state and 100-person roster usability remain NOT_TESTED. The shared notification-page shell includes existing English strings outside the contribution-specific translations. Heatmap month/weekday headers would improve visual date scanning (P3).

## I. Confirmed findings and fixes applied

| Finding | Before / after | Severity | Actual changed files |
|---|---|---|---|
| Database lifecycle shortcut | Rollback probe accepted INSERT FINALIZED without consent and draft → DISPUTED without submission. New trigger requires draft-only insertion and consistent transition timestamps | P1 database integrity; no HTTP exploit demonstrated | New migration `20261014000900_allocation_lifecycle_boundary/migration.sql`; AUDIT SQL regressions |
| Exact submission retry after downstream decision | Allocation submission after finalization returned 409; analogous work submission after acceptance also conflicted. Same version now returns committed state without replaying side effects | P2 failure handling | `allocation.service.ts`, `work-contributions.service.ts`; AUDIT retry regression |
| Work list N+1 | 20 records measured 72 database operations; batched participants/reviews/people now measured 15 | P2 performance | `work-contributions.service.ts`; new PERF suite |
| Historical revision fan-out | Presenter previously recomputed eligibility and child reads per revision. Child reads now batch and period history uses frozen roster; 12 revisions measured 13 operations | P2 performance/presentation | `allocation.service.ts`; PERF suite |
| Activity actor deduplication | Prisma distinct potentially transfers repeated actor occurrences; now SQL DISTINCT returns identities only | P3 query efficiency, code-inspected source | `contribution-activity.service.ts` |
| Invalid draft CTA | Submit was active for incomplete totals/rosters/zero rationale. It now requires the same applicable exact validations and explains failures | P2 validation/UX | `contribution-allocation.tsx`, locale file; WEB regressions |
| Raw history action strings | Work history displayed CREATED/CORRECTED/SUBMITTED and response codes without localization. Known actions now use translated labels | P2 localization | `work-contributions.tsx`, `project-contributions.ts` locale |
| Research decision duplicate retry | New regression returned two IDs for the same creation input/key. Stable key is now stored in canonical activity receipt; original creation snapshot validates later retries and altered reuse returns 409 | P2 activity/persistence | `project-discussions.service.ts`, `workspace-access.ts`, `dto/project-workspace.schema.ts`, shared `project-workspace.ts`, web `workspace-decisions.tsx`; AUDIT concurrent receipt test |
| Verification coverage | Added direct SQL/fault/race/performance checks; extended Chromium to exact three-person percentages, former notification review and Vietnamese solo agreement | Test coverage | New AUDIT/PERF files; extended `project-contributions.e2e.test.ts`, web contribution tests; audit runner/logs/SQL fixture/screenshots/report |

The new migration adds a trigger; it does not drop data, rewrite historical decisions or alter consensus policy. Already-invalid production rows would require a separate read-only assessment before repair; this audit did not connect to or repair the normal database.

Initial regressions intentionally failed for the SQL bypass, retry conflict, duplicate decision creation and 72-query list. The first added suite also had one test-authoring error (`getProjectDetail` was not an existing method), corrected to the real manuscript service check. The first extended browser run's solo case used the wrong language-storage setup; that test setup was corrected and the final three scenarios passed. These errors were not classified as product defects.

## J. Exact verification commands and results

All database tests ran against new disposable containers on guarded loopback ports, with synthetic credentials only. The normal containers on ports 5433/6379 were not changed. PowerShell test environment:

```powershell
$env:PROJECT_SLICE_TEST='1'
$env:DATABASE_URL='postgresql://lumigap_test:local_test_only@127.0.0.1:15439/lumigap_project_slice_test'
$env:REDIS_URL='redis://127.0.0.1:16389'
$env:LOG_LEVEL='error'
```

Infrastructure and migration commands actually executed:

```powershell
docker run --detach --name lumigap-contributions-audit-db-20261014 --publish 127.0.0.1:15439:5432 --env POSTGRES_USER=lumigap_test --env POSTGRES_PASSWORD=local_test_only --env POSTGRES_DB=lumigap_project_slice_test pgvector/pgvector:pg16
docker run --detach --name lumigap-contributions-audit-redis-20261014 --publish 127.0.0.1:16389:6379 redis:7-alpine
pnpm --filter backend db:migrate:deploy
pnpm --filter @trend/shared-types build
```

Deploy ran twice: all 70 existing migrations on an empty PostgreSQL database, then migration 009 after its regression was reproduced. Both succeeded. The complete 71-migration chain was thus applied starting from an empty database, without `migrate dev` or a reset. Shared-types build succeeded initially and again after extending the shared decision input.

Final check runner: `& ./artifacts/contributions-audit/run-verification.ps1`. It executed the following commands with the environment above and logged individual exit codes:

```powershell
pnpm --filter backend exec vitest run --fileParallelism=false src/modules/projects/__tests__/contributions-domain.test.ts src/modules/projects/__tests__/project-contributions.persistence.test.ts src/modules/projects/__tests__/project-contributions.audit.persistence.test.ts src/modules/projects/__tests__/project-contributions.performance.test.ts src/modules/projects/__tests__/project-workspace.persistence.test.ts src/modules/projects/__tests__/workspace-collaboration.persistence.test.ts src/modules/projects/__tests__/collaborative-research.persistence.test.ts src/modules/notifications/__tests__/notification.service.test.ts
pnpm --filter web exec vitest run src/features/projects/__tests__/project-contributions.test.tsx src/features/notifications/utils/notification-destination.test.ts src/features/projects/__tests__/project-workspace-navigation.test.tsx src/features/projects/__tests__/workspace-coordination.test.tsx
pnpm --filter backend db:validate
pnpm --filter backend db:migrate:status
pnpm --filter backend typecheck
pnpm --filter web typecheck
pnpm --filter backend lint
pnpm --filter web lint
pnpm --filter backend build
pnpm --filter web build
```

| Check | Final result |
|---|---|
| Backend selected suites | **85 passed**, eight files, no skips; lifecycle is exercised through actual PostgreSQL service transitions |
| Web selected suites | **69 passed**, four files; includes 8 contribution, 38 destination, 10 workspace navigation, 13 coordination |
| Chromium | **3 passed**; independent real sessions, actual Express API, actual PostgreSQL and browser export |
| PostgreSQL runtime boundary | **4 passed**, executed by backend build |
| Shared types | Build passed |
| Backend/web typechecks | Passed |
| Backend lint | 0 errors, 7 warnings in other existing files |
| Web lint | 0 errors, 101 warnings in other existing files |
| Backend/web production builds | Passed |
| Prisma | Schema valid; client generation succeeded; 71 migrations, schema up to date |

Browser commands:

```powershell
$env:API_PORT='14039'
pnpm --filter web exec vite --host 127.0.0.1 --port 13000 --strictPort
$env:CONTRIBUTIONS_BROWSER_TEST='1'
pnpm --filter backend exec vitest run src/modules/projects/__tests__/project-contributions.e2e.test.ts
pnpm --filter backend exec vitest run src/modules/projects/__tests__/project-contributions.e2e.test.ts -t 'follows D|Vietnamese single'
```

The full browser suite passed three cases. The last command recaptured two mobile artifacts after resetting page scroll; it passed two cases with the other case deliberately skipped. Counts above do not add repeated runs or overlapping checks. Logs were captured using `2>&1 | Tee-Object -FilePath ...; exit $LASTEXITCODE`. The test launches/stops Express on 14039 and launches/closes headless Chromium itself.

Additional reproduction commands actually run before/after fixes:

```powershell
pnpm --filter backend exec vitest run src/modules/projects/__tests__/contributions-domain.test.ts src/modules/projects/__tests__/project-contributions.persistence.test.ts
pnpm --filter backend exec vitest run src/modules/projects/__tests__/project-contributions.audit.persistence.test.ts
pnpm --filter backend exec vitest run src/modules/projects/__tests__/project-contributions.performance.test.ts
pnpm --filter backend exec vitest run src/modules/projects/__tests__/project-contributions.audit.persistence.test.ts src/modules/projects/__tests__/project-contributions.performance.test.ts
pnpm --filter backend exec vitest run src/modules/projects/__tests__/project-contributions.audit.persistence.test.ts -t 'deduplicates research decision'
```

Selected runs progressed from the documented expected failures to the final passing suites. The actual full command output, not this summary, is authoritative for counts and diagnostics.

### Performance measurements

Executed command:

```powershell
Get-Content -LiteralPath artifacts/contributions-audit/heatmap-plan.sql -Raw | docker exec -i lumigap-contributions-audit-db-20261014 psql -U lumigap_test -d lumigap_project_slice_test | Tee-Object -FilePath artifacts/contributions-audit/heatmap-plan.log
```

The SQL uses `ON_ERROR_STOP`, seeds 20,000 synthetic events inside a transaction, runs `EXPLAIN (ANALYZE,BUFFERS)` and rolls back. These events did not fill screenshots or establish ingestion provenance. Full-range grouping took **25.766 ms**, using a project bitmap index scan; one-day LIMIT 20 timeline took **0.133 ms**, using the project/created_at index backward with incremental sort. These are local query timings, not HTTP latency or production SLA results. PERF measures Prisma model/raw operations in the actual transaction path, excluding pool setup/transaction-control statements: 20 work rows **72 → 15** operations; 12 historical revisions **13** after batching (no measured historical baseline).

Overview does not call allocation eligibility or the heatmap aggregate. Period listing still recomputes eligibility per period, including historical JSON attribution; it is bounded at 100 but can be costly. Work is paginated (maximum 50); history/period lists cap at 100 without a continuation contract. Evidence summaries cap at 500 without a truncation flag. Fan-out is sequential and durable; large-team/mail-queue saturation was not benchmarked.

### Disposable-service cleanup

The audit Vite session (94824) was stopped with Ctrl-C; its exit code 1 reflects the requested interruption. Express and Chromium had already closed when their tests completed. The following commands then executed successfully:

```powershell
docker rm --force lumigap-contributions-audit-db-20261014 lumigap-contributions-audit-redis-20261014
docker ps --format '{{.Names}}\t{{.Ports}}'
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(13000,14039,15439,16389) } | Select-Object LocalAddress,LocalPort,OwningProcess
```

Docker removal returned both audit container names and exit code 0. The subsequent container list contained only the existing LumiGap services; backend 4000, web 8080, PostgreSQL 5433, Redis 6379 and the existing workers remained running. The listener query returned no rows for any of the four audit ports. Test logs, SQL fixtures, screenshots and this report were retained.

## K. Remaining issues and limits

| Priority | Remaining issue | Evidence / consequence |
|---|---|---|
| P2 | Incomplete historical membership before interval migration | Legacy retained rows are labelled; erased old members cannot be inferred. No silent reconstruction or policy change was made |
| P2 | Creation idempotency requires stable keys; some older operations lack receipts | New decision UI is fixed; callers omitting optional decision clientKey and unkeyed section creation are not guaranteed safe after lost responses |
| P2 | Historical/summary caps and period eligibility fan-out | 100 periods/revisions and 500 summaries; no continuation/truncation flag. Large projects need measured pagination and eligibility optimization |
| P2 | Generic contribution notifications can outlive access | Audience helper does not recheck these two types; deep link denies access, but obsolete generic email/push may still be delivered |
| P2 | Email uncertainty has no end-user resolution workflow | Safe mocked refusal retries; ambiguous delivery becomes UNCERTAIN. Actual SMTP/push and worker crash recovery not exercised here |
| P2 | Cross-user changes refresh on focus/reload, not immediately | Browser tests explicitly reload other clients. In-flight auth switching/refresh and failed invalidation are NOT_TESTED |
| P2 | Evidence and manuscript provenance have limited semantics | Some events lack pinned versions; contribution link IDs do not archive remote bytes; manuscript section revisions lack universal SQL append-only guards. Application history retention was tested, not arbitrary privileged source-row mutation |
| P2 / unsupported capability | No proven real-time CRDT/Yjs author/reconnect provenance or snapshot attribution | The actual editor records revision savers. Adding text authorship measurement would require a separately approved product/technical design; no effort algorithm was added |
| P3 | UI verification gaps | 100-member keyboard/screen-reader/contrast/320px testing, full Vietnamese error coverage and month/weekday heatmap labels remain incomplete |

No P0/P1 application authorization or consensus defect remains reproduced in the tested paths after the fixes. This is not a claim that every endpoint, privileged database writer, deployment topology or external service has been penetration-tested.

## L. Readiness

**FUNCTIONALLY_COMPLETE_WITH_RISKS.** The supported V1 provides real private work records, scoped former-member rights, exact shares, immutable proposal revisions, explicit unanimous consent, dispute history, final export and durable notification intent. These claims have fresh service/SQL/HTTP/component/Chromium evidence rather than build-only evidence.

It is not declared PRODUCTION_READY. The remaining delivery, historical-data, pagination/load, collaboration-provenance and fault-injection limits above remain relevant. Deploying requires applying the additive migration through the normal release process and operating the existing notification worker. No deployment or normal-database migration was authorized or performed by this audit.

Disposable-service cleanup completed and is recorded in J. The user workspace's existing changes and earlier implementation report were preserved.
