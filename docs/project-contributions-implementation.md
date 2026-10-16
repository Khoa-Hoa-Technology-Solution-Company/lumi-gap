# Project contributions: audit and implementation

## Audit before implementation (14 October 2026)

| Area | Finding | Reuse / gap |
| --- | --- | --- |
| React 18, Vite, React Router, TanStack Query | EXISTING | Project section navigation, workspace primitives, Vietnamese localization |
| Express, Zod, Prisma 7, PostgreSQL | EXISTING | Thin controllers, authenticated identity, project transaction locks |
| ProjectActivity | EXISTING | Canonical stream already records plan, papers, screening, evidence, gaps, tasks and decisions |
| Activity heatmap | MISSING | Bounded filtered queries, timezone aggregation, persisted event timeline |
| ProjectContributionProposal / History | PARTIAL | Extend canonical records; previous workflow supports one contributor and academic-profile publication |
| ResearchContribution | EXISTING | Separate academic profile claims; private work records must not auto-publish into this table |
| Membership history | PARTIAL | Current rows retain joinedAt and inactive status; add intervals for future departures/rejoins, mark legacy uncertainty |
| Research workflow | EXISTING | PlanRevision, ProjectWorkspaceRevision, ProjectEvidenceItem, ProjectScreeningDecision, ProjectTask, ProjectDecision |
| Manuscript / LaTeX | PARTIAL | WorkspaceSection optimistic versions and SectionRevision; no Yjs/CRDT runtime found. Revision actor is a saver, not full-text author |
| GitHub integration | MISSING | No verified repository attribution integration; do not fabricate one |
| Allocation / consensus | MISSING | Periods, frozen roster, exact basis points, immutable submissions, unanimous decisions |
| Notifications / email | EXISTING | Transactional notification outbox and recovery worker, branded SMTP sender |
| Mentorship / academic review | EXISTING | Contextual relationships remain separate from team membership |
| Legacy owner self-contribution | BROKEN | Requires a nonexistent second owner; new record workflow supports self-recording |
| Duplicate activity stores | No duplication | Extend ProjectActivity and reuse contribution history |

## Implementation plan and migration

1. Extend ProjectActivity with version, source and optional idempotency identity. Use meaningful event allowlists; never expose blinded decision metadata through this module.
2. Extend ProjectContributionProposal with work title, source, work date, draft version and authorized artifact references. Add shared participants and revision-bound reviews. Reuse ProjectContributionHistory for immutable snapshots. Keep legacy rows visible, disable obsolete mutation paths.
3. Add ProjectMembershipPeriod captured transactionally by PostgreSQL triggers on membership changes. Seed retained rows with explicit LEGACY_RETAINED provenance. Unknown pre-migration membership history cannot be reconstructed as fact.
4. Add AllocationPeriod, AllocationRevision, AllocationShare and AllocationApproval. Policy CORE_TEAM_UNANIMOUS_V1 conservatively includes members overlapping the period and documented team work; no discretionary exclusion, mentors or reviewers. Store roster/evidence summaries in each revision.
5. Use existing account-then-project locks for mutations. Check owner authority inside transactions. Submission freezes payload; every participant, including owner and zero-percent participants, explicitly decides on that revision. Disputes require a new revision, no carried approvals. A unanimously finalized amendment supersedes an older finalization.
6. Restrict former participants to submitted allocation summaries and decisions. General project and evidence access stays governed by current membership.
7. Add three compact tabs to the existing Contributions section and a scoped allocation route. Add notification outbox events after durable transitions in the same transaction.
8. Run schema validation, deploy hand-written additive SQL migrations, focused persistence/HTTP/UI tests, typecheck, lint and build. No auto-commit.

## Authorization

| Action | Current team | Owner | Frozen former participant | Mentor / public / admin |
| --- | --- | --- | --- | --- |
| Activity and work records | Read; create own drafts; peer review | Same; cannot erase accepted records | No general access | No automatic access |
| Create/edit period or proposal | No | Yes, active project | No | No |
| Submitted proposal summaries | Read | Read | Own eligible periods only | No |
| Approve/dispute | Own frozen share only | Own frozen share only | Own frozen share only | No |
| Finalize | Backend transaction after unanimity | Same | Same | No override |
| Export finalized summary | Authorized period audience | Same | Same | No |

Allocation is an agreement about effort for one scope. Activity counts and CRediT roles never determine shares. It does not establish grades, legal rights, publication eligibility or author order. CRediT metadata follows https://credit.niso.org/contributor-roles/.

## Final implementation report (14 October 2026)

### 1. Architecture and existing entities: IMPLEMENTED

The module runs inside the existing React project workspace and Express projects router. `ProjectActivity` remains the canonical event stream. `ProjectContributionProposal` is the work record and `ProjectContributionHistory` holds its immutable snapshots; `ResearchContribution` remains the separately published academic-profile claim. New private work does not publish to academic profiles.

Reused research entities include `ResearchPlan`, `PlanRevision`, `ProjectPaper`, screening votes/decisions, `ProjectEvidenceItem`, gap evidence and assessments, `ProjectTask`, discussions/decisions, `DraftWorkspace`, `WorkspaceSection` and `SectionRevision`. Existing project locks, membership permissions, Zod validation, localization, notification outbox and SMTP infrastructure are reused.

Code: `apps/backend/src/modules/projects/{project.routes,project-contributions.routes,project-contributions.controller,workspace-access}.ts`; `apps/web/src/features/projects/components/project-contributions-workspace.tsx`; `packages/shared-types/src/project-contributions.ts`.

### 2. New and modified models: IMPLEMENTED

| Entity | Purpose |
| --- | --- |
| ProjectActivity, extended | Source module, artifact version and optional project-scoped idempotency identity |
| ProjectContributionProposal, extended | Title, work date, manual/workspace provenance, version, private evidence references, retry identity |
| ProjectContributionHistory, extended | Append-only versioned snapshots, actor, reason and timestamp |
| ContributionParticipant | Shared attribution and optional CRediT roles, unique per work record/user |
| ContributionReview | Immutable revision-bound acknowledgement, independent acceptance, changes request or dispute |
| ProjectMembershipPeriod | Recorded join/leave/rejoin intervals and explicit legacy provenance |
| AllocationPeriod | Immutable scope, dates, policy version and request identity |
| AllocationRevision | Frozen roster, evidence summary, rationale, revision, lifecycle and finalization evidence |
| AllocationShare | Exact integer basis points and individual rationale, unique per revision/user |
| AllocationApproval | Authenticated participant decision and timestamp, unique per revision/user |

Allocation audit events use `ProjectActivity`; no parallel generic audit store was added. SQL foreign keys, checks, unique/partial indexes and triggers complement Prisma's models. Code: `apps/backend/prisma/{collaboration,project-workspace,project-allocation}.prisma` and the two migrations below.

### 3. Activity event integration and heatmap: IMPLEMENTED

The activity API reads persisted events for plans, literature, human screening, evidence, gaps, completed tasks, documented decisions and manuscript revisions. The explicit allowlist excludes chat volume, page views, presence, allocation audit events and low-level administrative events. There is no client endpoint to create trusted activity or supply counts. Raw event metadata is omitted, including blinded screening details.

The heatmap and timeline share member, category, date-range and timezone filters. PostgreSQL groups dates in the chosen timezone. Selected-day queries use server-side filtering and bounded pagination, rather than filtering one previously loaded page. Keyboard-accessible cells have date/count labels and an accessible legend. The mobile heatmap scrolls within its container. Both UTC and UTC+7 are supported in the UI.

Task completion is recorded on transitions to DONE, with versioned source identities. Manuscript events record the revision saver and skip unchanged saves. Existing research transactions remain atomic with their canonical activity writes; an event failure rolls back the domain write rather than leaving partially recorded research. Contributions queries are isolated from other workspace tabs.

Code: `contribution-activity.service.ts`, `workspace-access.ts`, `project-tasks.service.ts`, `project-discussions.service.ts`, the existing research services under `apps/backend/src/modules/projects/`, and `apps/backend/src/modules/workspaces/workspace.service.ts`; UI: `contribution-activity.tsx` and `project-contributions.css`.

### 4. Work contribution workflow: IMPLEMENTED

Manual offline work needs no artificial activity. Records support shared participants, all 14 optional [CRediT roles](https://credit.niso.org/contributor-roles/), explanatory evidence and project-authorized artifact/task links. The creator can save drafts, submit and create visible corrections with version checks. Corrections retain prior attribution, reviews and reasons and notify affected former participants.

Named collaborators explicitly acknowledge or challenge their attribution. Independent accepting peers must be current team members outside the named contributors; creators cannot accept their own record. Peer acceptance requires all named collaborators' acknowledgement. A group with no independent peer can produce a clearly labeled SELF_RECORDED record after the applicable acknowledgements. Acceptance acknowledges reported work, not scientific quality or relative effort.

There are no work deletion endpoints. Historical named contributors keep narrowly scoped inspection/challenge access even if a correction removes their current attribution. Their responses and history omit project artifact references. The server returns permitted review actions, which drive the review controls.

Code: `apps/backend/src/modules/projects/work-contributions.service.ts`, `dto/project-contributions.schema.ts`; UI: `work-contributions.tsx`, `contribution-artifact-link.tsx`, `apps/web/src/pages/projects/project-contribution-review.tsx`.

### 5. Eligibility policy and historical membership: IMPLEMENTED; pre-migration reconstruction: PARTIAL

`CORE_TEAM_UNANIMOUS_V1` conservatively includes recorded membership overlapping the period and documented team work in that period. Historically submitted work remains an eligibility source after a correction changes its participants or date. Draft-only claims do not establish that historical source. Members with zero shares retain consent rights and require an explanatory rationale. Owners cannot supply an arbitrary reduced roster.

PostgreSQL membership triggers capture future joins, departures, removals and rejoins. Ownership transfers preserve the old owner's intervals. Existing retained rows are seeded as LEGACY_RETAINED; lost earlier membership intervals cannot be recovered as facts. The interface displays this uncertainty.

Submitted rosters are frozen. Decisions check material eligibility changes, and roster challenges make the proposal disputed. Any affected eligible participant can challenge the roster. Former frozen participants retain access to submitted summaries and their own decision actions, including through historical roster evidence. Unavailable accounts cannot be silently excluded or impersonated; missing consent leaves the agreement unresolved.

Mentors and formal reviewers are not automatically team allocation participants. V1 has one explicit policy; external-participant opt-in, institutional mediation and phase weighting are not implemented.

Code: `apps/backend/src/modules/projects/allocation.service.ts`, `project-transaction.ts`, `apps/backend/prisma/migrations/20261014000700_project_contribution_allocation/migration.sql`.

### 6. Proposals, consensus, disputes and final history: IMPLEMENTED

Only the current owner may create a period/draft, edit an unsubmitted draft or submit. Shares use integer basis points, with 10000 representing 100%. Every eligible participant appears exactly once. Submission validates shares, total, rationale and roster; the owner's submission does not count as an approval.

States are DRAFT, AWAITING_APPROVAL, DISPUTED, FINALIZED and SUPERSEDED. Each participant explicitly approves the exact submitted revision or requests changes with an explanation. All required approvals, including zero-share participants, are necessary. Disputes remain unresolved until a new proposal is reviewed. No timeout, admin override or owner-imposed allocation exists. Disputes and roster explanations are visible to the authorized audience; existing project discussions support team negotiation.

A new revision starts with no approvals. A unanimously approved amendment supersedes the current finalized revision, preserving the earlier shares, decisions and finalization timestamp. Submitted payloads, shares and decisions are immutable. Authorized audiences can export finalized and superseded agreements as JSON.

Code: `allocation.service.ts`; SQL integrity guards in both migrations; UI: `contribution-allocation.tsx`.

### 7. Permissions and privacy: IMPLEMENTED

The backend checks the authenticated actor, active account, live project role, project scope, revision, status and allowed action inside transactions. DTOs reject client-supplied status and reviewer identity. Public project visibility does not publish this module's private information. Mentors, academic roles and admins gain no automatic allocation authority.

Former members cannot use activity/work list endpoints or general documents. Allocation responses share frozen names, shares, rationale, decisions and deliberately limited contribution summaries, not private artifact URLs or full research text. Historical record access is checked separately from project access. Evidence references are validated against the same project and never act as access grants. Notification previews contain generic text.

Code: `work-contributions.service.ts`, `allocation.service.ts`, `workspace-access.ts`, `project-contributions.routes.ts`, `dto/project-contributions.schema.ts`, `apps/backend/src/modules/projects/project-contribution.controller.ts`. Old contribution mutation HTTP paths return a migration conflict, preventing obsolete confirmation/publication behavior from mutating new work records.

### 8. Notifications and email: IMPLEMENTED; live mailbox verification: PARTIAL

Work attribution, submission, corrections, review changes and disputes create durable notification intent. Allocation submissions, individual decisions, disputes, roster challenges/changes and finalization do likewise. Revision-specific event keys deduplicate retries. Notifications are inserted in the same transaction as the domain state; the existing worker recovers and dispatches committed outbox rows. Heatmap events do not generate these notifications.

In-app destinations and branded email links lead to the restricted allocation or record route. Email uses the configured SMTP service, verified active accounts, recipient language, claim protection and explicit ambiguous-delivery state. No live mailbox was tested and no mail worker was started for synthetic test recipients.

Code: `contributions-notification.ts`, `contributions-mail.service.ts`, `apps/backend/src/modules/notifications/notification.service.ts`, `apps/backend/src/workers/notification.worker.ts`, `apps/backend/src/modules/auth/auth-mail.service.ts`; UI destinations: `apps/web/src/features/notifications/utils/notification-destination.ts`.

### 9. UI, routes and screenshots: IMPLEMENTED

The existing Contributions navigation entry contains Activity, Work Contributions and Allocation. Work has team/my/pending/disputed filters, search, an inline editor, feedback and expandable history. Allocation has period/roster overview, draft editor, proposal detail, approval progress, history, amendments and export. Vietnamese translations reuse the existing localization system. Loading, empty and server-error states are real.

Routes:

- `/projects/:id?tab=contributions&contributionTab=activity`
- `/projects/:id?tab=contributions&contributionTab=work`
- `/projects/:id?tab=contributions&contributionTab=allocation`
- `/projects/:id/allocation?revision=:revisionId` (restricted review)
- `/projects/:id/contribution-review?record=:recordId` (restricted record review)

Screenshots captured in the passing Chromium workflow and visually inspected:

- [Work desktop](contributions-screenshots/work-desktop.png) / [Work mobile](contributions-screenshots/work-mobile.png)
- [Allocation desktop](contributions-screenshots/allocation-desktop.png) / [Allocation mobile](contributions-screenshots/allocation-mobile.png)
- [Activity desktop](contributions-screenshots/activity-desktop.png) / [Activity mobile](contributions-screenshots/activity-mobile.png)

Browser assertions confirm no document-level horizontal overflow at 390px for all three surfaces. Long participant names wrap. Work dates, default activity ranges and allocation scope labels use UTC+7 consistently with entry, including around midnight. The server returns management/review/challenge permissions so restricted or archived views omit unavailable mutation controls.

### 10. Migrations and deployment: IMPLEMENTED; normal database deployment: NOT_IMPLEMENTED

Hand-written additive migrations:

1. `apps/backend/prisma/migrations/20261014000700_project_contribution_allocation/migration.sql`: model extensions, participants/reviews, membership intervals and triggers, allocation tables, constraints and immutability guards.
2. `apps/backend/prisma/migrations/20261014000800_allocation_integrity_guards/migration.sql`: preserve acknowledgement plus later challenges, guard both source/destination share revisions, enforce complete exact-total submission and unanimous finalization, and reject decisions outside awaiting revisions.

All 70 repository migrations deployed successfully to a clean disposable PostgreSQL 16/pgvector database. Final Prisma validation passed, client generation passed, and `db:migrate:status` confirmed that test database is current. The user's normal database was not migrated.

Before running this version against another environment, configure that environment's DATABASE_URL and deploy with `pnpm --filter backend db:migrate:deploy`. Build `@trend/shared-types` before compiling its consumers. Run the existing notification worker with that environment's Redis/SMTP configuration for outbox delivery. No secrets, commits, pushes or deployments were created by this task.

### 11. Tests, typecheck, lint and build: IMPLEMENTED

Final affected verification:

| Check | Result |
| --- | --- |
| Backend contribution domain rules | 7 passed |
| Real PostgreSQL contribution/allocation persistence and HTTP tests | 17 passed |
| Real Chromium against Express, PostgreSQL and Redis | 1 passed |
| Frontend contribution governance and notification regression tests | 51 passed across 3 files |
| PostgreSQL-only runtime audit during backend build | 4 passed |
| Shared types build | Passed |
| Backend typecheck and production build | Passed |
| Web typecheck and production build | Passed |
| Full backend lint | Passed, 0 errors and 7 existing warnings |
| Full web lint | Passed, 0 errors and 101 existing warnings |
| Prisma validation, generation, migration status | Passed |
| Scoped Git whitespace check | Passed |

Earlier regression runs also passed: 60 backend domain/persistence/workspace/research tests, and 128 frontend project/notification tests. Those runs overlap the final affected suites; these counts must not be added into a claimed unique test total. The whole repository test suite was not run.

After verification, the task's disposable PostgreSQL and Redis containers and its Vite test server were removed/stopped. The implementation and screenshots remain in the workspace.

The browser test performs offline contribution creation, real task linking, submission, peer acknowledgement, period/draft creation, owner approval, participant dispute, new revision, proof of zero carried decisions, fresh unanimous approval, persisted finalization, export, date-label verification and desktop/mobile captures. No backend confirmation is mocked.

Test code: `apps/backend/src/modules/projects/__tests__/{contributions-domain,project-contributions.persistence,project-contributions.e2e}.test.ts`, `apps/web/src/features/projects/__tests__/project-contributions.test.tsx`, `apps/web/src/features/notifications/`.

### 12. Security and concurrency findings: IMPLEMENTED

- Project mutations share sorted-account-then-project locks. Live permissions are rechecked after locking. Concurrent final approvals and duplicate approvals produce one finalization event and one decision per participant.
- Draft/work writes use optimistic versions. Creation request identities compare original persisted input and reject a changed retry payload.
- Database guards reject direct changes to submitted shares/payloads, immutable reviews/decisions/history, and finalization without exact-total unanimous consent. Composite foreign keys bind periods to projects and decisions to revision participants. Partial indexes permit one open revision and one current finalization per period.
- Tests cover forged identity/status, anonymous access, private data on public projects, cross-project work/evidence/task references, former-member restrictions, historical attribution removal, ownership transfer, archived projects, unavailable accounts, superseded exports and manuscript saver provenance.
- Review caught and fixed historical access being lost after attribution removal, eligibility being lost after a date/participant correction, unauthorized independent acceptance controls for former contributors, and UTC scope labels showing the previous calendar day.
- Queries use Prisma APIs or tagged parameterized SQL. React renders user text as text; email uses the existing escaping/branded template. No new LLM, shell execution or external evidence fetching endpoint was introduced.

### 13. Known limitations and explicit boundaries

| Area | Status | Limit |
| --- | --- | --- |
| Pre-migration membership completeness | PARTIAL | LEGACY_RETAINED rows are evidence of retained membership only; missing past intervals remain unknown |
| Collaborative editor attribution | PARTIAL | Optimistic section revisions identify the saver; the repository has no CRDT editing-session provenance |
| Yjs/CRDT analytics | NOT_IMPLEMENTED | No existing CRDT runtime to integrate; no per-keystroke or character effort claims |
| Verified GitHub integration | NOT_IMPLEMENTED | No verified integration exists; commits never determine allocations |
| Live SMTP verification | PARTIAL | Persisted delivery intent and existing worker/sender integration tested structurally; real inbox delivery unverified |
| Institutional mediator, external participant policy, phase weighting | NOT_IMPLEMENTED | Outside CORE_TEAM_UNANIMOUS_V1; no authority or weights fabricated |
| Other locales and native mobile client | NOT_IMPLEMENTED | New strings are translated into Vietnamese, with English fallback; responsive web is implemented |
| Large history browsing | PARTIAL | Period/revision lists are capped at 100 and frozen evidence summaries at 500; work and activity use bounded pagination |
| Scientific quality, misconduct detection, effort estimation | NOT_IMPLEMENTED | Work acknowledgement and explicit allocation agreement do not certify these properties |
| Normal database rollout | NOT_IMPLEMENTED | Checked-in migrations must be deployed before this feature runs there |

No external dependency currently blocks V1 development. Explicitly unsupported capabilities remain unsupported; incomplete historical facts are disclosed.

### 14. Requirement status index

This index maps every numbered requirement in the supplied request to persisted implementation or an explicit limit.

| Request section | Status | Evidence / qualification |
| --- | --- | --- |
| 1. Product context | IMPLEMENTED | Existing project workspace and project roles; no institution-specific privileges |
| 2. Three distinct layers | IMPLEMENTED | Activity, work and governed allocation APIs/UI; no activity-to-percentage formula |
| 3. Repository audit | IMPLEMENTED | Gap matrix and plan above; canonical entities reused |
| 4. Main navigation | IMPLEMENTED | Single Contributions entry and three tabs |
| 5. Activity tracking | IMPLEMENTED | Trusted domain events, allowlist, actor derivation and source identities |
| 6. Heatmap | IMPLEMENTED | Persisted timezone aggregation, filters, selected-day server query and timeline |
| 7. Supported sources | IMPLEMENTED | Existing research, task, decision and manuscript streams; absent external integrations disclosed |
| 8. Collaborative LaTeX attribution | PARTIAL | Saver-only revision provenance; CRDT/session authorship unavailable |
| 9. Work records | IMPLEMENTED | Private canonical records, manual work, shared roles, artifact/task references and corrections |
| 10. CRediT | IMPLEMENTED | All 14 optional metadata roles and collaborator confirmation |
| 11. Acknowledgement | IMPLEMENTED | Revision-bound peer/collaborator responses, challenges and self-recorded labeling |
| 12. Allocation principles | IMPLEMENTED | Explicit scoped agreement and integrity explanation in UI/export |
| 13. Allocation periods | IMPLEMENTED | Immutable scope/date/policy; each period has its own 100% |
| 14. Eligibility and fairness | IMPLEMENTED | Conservative membership/work-history policy, frozen roster, challenge access, zero-share consent |
| 15. Mentor handling | IMPLEMENTED | Mentors/reviewers omitted unless actual team members; no imposed percentages |
| 16. Proposals | IMPLEMENTED | Owner-only writes, exact basis points, full roster and rationale |
| 17. State machine | IMPLEMENTED | Explicit revision-controlled states; immutable submitted contents |
| 18. Approval and consensus | IMPLEMENTED | Explicit owner decision plus unanimous frozen participant consent |
| 19. Disputes and revision | IMPLEMENTED | Recorded explanations, notifications, new revisions and fresh consent |
| 20. Finalization/history | IMPLEMENTED | Transactional consensus, immutable history, amendments and JSON export |
| 21. Activity UI | IMPLEMENTED | Heatmap, filters, timeline, authorized links and required explanatory copy |
| 22. Work UI | IMPLEMENTED | Team/my/pending/disputed lists, search, create/detail/review/history |
| 23. Allocation UI | IMPLEMENTED | Overview, proposal detail/editor, progress, history, actions and export |
| 24. Responsive UX | IMPLEMENTED | Inspected desktop/mobile captures and 390px overflow checks |
| 25. Notifications | PARTIAL | Durable in-app/outbox/email integration complete; live SMTP delivery unverified |
| 26. Privacy | IMPLEMENTED | Backend scope checks, private-by-default module, narrow former-member routes |
| 27. Models | IMPLEMENTED | Existing entities plus minimal new tables, constraints/indexes/SQL guards |
| 28. APIs | IMPLEMENTED | All required read/create/edit/submit/review/decision/challenge/history/export capabilities |
| 29. Research integrity | IMPLEMENTED | Provenance, deduplication, challenges and revisions; no automated effort/scientific-quality scoring |
| 30. Historical membership | PARTIAL | Future intervals and historical consent preserved; pre-migration loss cannot be reconstructed |
| 31. Single-member projects | IMPLEMENTED | 100% still requires explicit approval, labeled self-acknowledged |
| 32. Tests | IMPLEMENTED | Actual domain, persisted HTTP, frontend, browser, build/lint and migration checks above |
| 33. Integrations | IMPLEMENTED | Research workspace, membership, artifacts, tasks, decisions, manuscripts and notifications |
| 34. Safe implementation stages | IMPLEMENTED | Audit/plan, additive migrations, domain, UI and persisted verification |
| 35. Definition of Done | IMPLEMENTED | Passing persisted browser workflow; normal database rollout remains required |
| 36. Final report | IMPLEMENTED | This report, code references, statuses, screenshots and verification limits |
