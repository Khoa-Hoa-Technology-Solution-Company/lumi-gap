# Mentor invitation simplification

Update 18 November 2026: the short form, sharing disclosure and frozen brief now follow [Mentor proposal, invitation and acceptance](MENTOR_PROPOSAL_INVITATION_ACCEPTANCE_20261118.md). This later implementation removes the extra checkbox and shares one immutable brief across composing and recipient views. Historical invitations and the policies described below remain compatible.

Implemented and verified in `D:\lumi-gap` on 17 November 2026. This report supersedes the invitation-policy sections of [the earlier discovery audit](SUPERVISOR_DISCOVERY_AUDIT_20261117.md). No commit, push or production deployment was performed.

## 1. Verified problems

The preceding implementation already supported direct invitations, immutable previews, duplicate protection, a scoped mentor workspace and version-specific manuscript review. The remaining friction came from:

- An 80-character summary minimum and a 20-character invitation reason minimum, regardless of whether a shorter introduction was useful.
- Separate reason, required support checklist, additional message, start date and role selector.
- PRIMARY/SECONDARY defaults, exclusive pending role reservations and a primary-first condition in both discovery and send paths.
- A six-day deadline assigned to every new invitation.
- No supported post-acceptance proposal/consent mechanism for changing supervision roles.
- Role labels and screening candidate ranking that inferred duties from the original invitation instead of the current accepted relationship.

The existing Academic Profile invitation entry, Create Project Step 2, mentorship API, mentor access system, notification store and manuscript review workflow were reused. There is no second invitation or review system.

## 2. Form now has two required inputs

1. **Research summary:** defaults from the owner-only Project introduction and can be edited for this invitation alone. Editing it does not change the Project description or its discovery summary.
2. **Invitation message:** combines the invitation reason, desired guidance and extra message into one textarea.

A single compact context card shows the lecturer, institution, expertise, Project field/title, representative and team size. The form has no role selector, start date, attachment requirement or separate additional-message input.

The collapsed **Guidance needs (optional)** section offers exactly four choices: research direction, literature review, methodology/experiments and scientific writing/review. Selecting none is valid.

There is no 80/300-character minimum. A shared backend/frontend validator rejects empty values, punctuation/numbers-only input, URL-only content and obvious placeholders/repetition. It accepts concise introductions such as “Study clinical AI.” and Vietnamese or Han-script text. This is a basic content check, not a judgment of scientific quality. Upper bounds of 2,000 and 1,000 characters remain for summary and message.

Privacy is explained once, with expandable shared details and the existing single explicit sharing confirmation. There is no additional confirmation screen. Validation focuses the first invalid input, including the consent checkbox if it is below the visible portion of the drawer. Send remains protected by a synchronous lock and a persisted idempotency receipt.

Failed sends retain content and the form stays open. Drafts remain isolated by account, Project and lecturer. Older unpublished drafts merge their reason/additional message into the new message input. Sent historical invitations are not rewritten.

## 3. Current workflow and policy

**Find lecturer → open Academic Profile → invite → Pending → Accept/Decline → start supervision.**

The same drawer is used from Project Support, Academic Profile and Create Project Step 2. Selecting a lecturer in Step 2 prepares this form after Project creation; it does not automatically send an invitation. Support retains its two main areas: **Find Mentors** and **Invitations & mentors**.

New invitations from these interfaces carry `mentorRole=UNASSIGNED`. Accepting makes the lecturer an accepted mentor; acceptance order does not decide who is primary. No primary-first or parallel-mode switch is required.

The MVP limit remains **two ACTIVE mentors**, centrally enforced by the service and database under the Project row lock. This is a product capacity limit, not an institutional qualification rule. Pending invitations do not consume those active slots. Multiple distinct lecturers can have pending requests; the existing configurable hourly request limit and per-pair duplicate/cooldown rules still prevent spam. A concurrent third Accept fails without deleting the request or treating it as a rejection. No other invitation is silently cancelled when someone accepts.

The optional saved candidate list remains separate. Its capacity and historical ordering do not govern direct invitations. Its obsolete parallel-mode/primary-first UI and new-candidate role selection were removed. Existing named campaign data and sent candidate history remain available.

Accepted mentors are represented by the existing `MentorRelationship` plus scoped access policy, separately from student `ProjectMember` records. Acceptance does not grant administrative access, create review work/tasks, assign authorship or verify any new academic credentials.

## 4. Optional roles after acceptance

Under Invitations & mentors, the owner can propose primary/co-supervisor roles for the accepted supervision team. Accepted mentors see a pending proposal in their existing Project mentor overview.

- Only the owner can propose a change; the proposal includes current and proposed roles.
- Every mentor whose role would change must explicitly confirm. The owner's action cannot substitute for a mentor's consent.
- Until the last required confirmation, actual relationship roles stay unchanged.
- Decline or owner cancellation closes the proposal without changing duties.
- Departed mentors, changed ownership or a changed baseline make an outstanding proposal no longer applicable. Revoked/unverified actors cannot confirm through the API.
- Named roles remain unique. Fully consented swaps clear the named slots and apply the new allocation atomically inside the transaction.
- Repeated/concurrent confirmations do not duplicate the applied change or history.
- Read-only/archived Projects do not offer role-change actions.

Proposal, response and application records reuse append-only `ProjectActivity` entries; no additional role-proposal table was created. Notifications reuse the existing Notification store. The original invitation role/snapshot stays unchanged even after the accepted relationship's role changes. Screening candidate ranking now reads the current active relationship and labels unassigned mentors without assuming a secondary role.

## 5. New and historical deadlines

New requests and offers store `expiresAt=null` and remain Pending until explicitly answered or withdrawn. The existing expiry worker ignores these null deadlines.

After fourteen days the UI adds **No response yet** while leaving Pending and the appropriate actions intact. A seven-day reminder automation was not introduced; it is optional for this MVP.

Existing requests retain their original roles, snapshots, content, creation/responded timestamps and explicit `expiresAt`. Historical deadlines continue to be enforced. Historical PRIMARY/SECONDARY request bodies remain supported for compatibility and are displayed as such; the current invitation interfaces always start unassigned. No batch extension, reclassification or rejection of old invitations occurred.

## 6. API, schema and permissions

The existing invitation DTO now accepts meaningful short summaries/messages and an empty/omitted support selection. Existing strict validation, sender authorization, verified lecturer eligibility, recipient identity, private snapshot, duplicate, consent and idempotency checks remain enforced at the backend.

Three endpoints were added specifically for the previously missing post-acceptance role consent; they do not create another invitation mechanism:

- `GET /api/v1/projects/:id/mentorship-roles`
- `POST /api/v1/projects/:id/mentorship-roles` with a request key and relationship/role choices
- `POST /api/v1/projects/:id/mentorship-roles/:proposalId/respond` with ACCEPT, DECLINE or CANCEL

Role notifications open the existing Project workspace. Unauthorized callers, foreign relationship IDs and stale/revoked relationships are refused. Before accepting supervision, a lecturer still sees only their approved invitation preview. After acceptance, existing scoped access applies; no library, evidence matrix, live manuscript or private draft is automatically shared. Manuscript v1/v2 access continues to use the existing delivery/review grants. Roles are academic responsibilities, not additional administrative permissions.

Migration `20261117170000_simple_mentor_invitations` extends the role vocabulary/defaults, permits multiple unassigned pending/active records, retains named-role uniqueness and enforces the two-active-mentor cap. It replaces only related role constraints/indexes/functions. It does not update historical rows or remove a table, invitation or relationship.

## 7. Actual verification

| Check | Result |
| --- | --- |
| Supervisor workflow, real browser, content validation, role-consent and screening-role suites | **46 passed, 1 skipped** |
| Existing invitation/offer, authenticated HTTP, dossier and optional plan persistence suites | **87 passed, 1 skipped** |
| Targeted frontend run: 13 suites | **149 passed** |
| Final form accessibility/content regression after focus adjustment | **14 passed**, already included among the 149 cases |
| Shared-types compilation and backend/web type checks | Passed |
| Backend build | Passed, including four PostgreSQL-only boundary tests and Prisma generation |
| Web production build | Passed |
| Targeted ESLint, `--max-warnings=0` | Passed |
| Web 8080, API health/readiness 4000 | HTTP 200 |

The 133 backend and 149 frontend passing cases are separate cases, not a sum of repeated runs. The two skipped tests are older optional browser harnesses; their pass is not claimed. The new browser scenario was enabled and passed. This is not a repository-wide test-pass claim.

New verification includes two required inputs, short meaningful content, optional four-choice support, no date/role input, explicit consent and invalid-field focus, account-separated drafts, old draft recovery, lost-response retry and double-submit prevention. Backend cases cover three pending invitations with concurrent Accept, exactly two active/unassigned relationships, no team membership insertion, no automatic expiry after twenty days, historical expiry/snapshot preservation, role change only after all affected mentors confirm, duplicate confirmation, decline/cancel, stale/departed relationships and foreign IDs.

Browser QA used an owner and two verified lecturers against the real API and disposable PostgreSQL database. It exercised name/technology search, opening Academic Profile, inviting directly from that profile, the shared two-input drawer, validation, response-loss retry, notifications, two independent Accepts, Project/Mentor Workspace/Team display, owner role proposal, both mentor confirmations and the agreed role history. Invitation snapshots remained unassigned after the accepted roles changed. Desktop, tablet and 390px mobile were checked, including dark mode and viewport bounds. Passing runs had no uncaught page errors.

The existing scientific review suite also reverified PDF and LaTeX snapshot access, original v1 feedback, private v2 drafts, explicit v2 delivery, multiple Projects/Mentors, queue state, denied edit/delete and grant revocation.

Screenshots: [desktop invitation](audits/2026-11-17-supervisor-discovery/invitation-desktop.png), [mobile](audits/2026-11-17-supervisor-discovery/invitation-mobile.png), [dark mobile](audits/2026-11-17-supervisor-discovery/invitation-mobile-dark.png), [from Academic Profile](audits/2026-11-17-supervisor-discovery/invitation-from-profile.png), [role proposal](audits/2026-11-17-supervisor-discovery/role-proposal.png), [mentor confirmation](audits/2026-11-17-supervisor-discovery/mentor-role-confirmation-first.png), [agreed roles](audits/2026-11-17-supervisor-discovery/roles-confirmed.png).

## 8. Local migration and remaining limits

The local database already had divergent migration history. The normal “deploy every pending migration” command was not used against it. A loopback-only scoped runner uses Prisma to apply **only** the new migration and records that migration normally, without editing older migration entries.

That process was first verified on a disposable database: replay the previous 146 migrations, create four historical invitation/relationship/draft records, apply only the new migration, then compare row and prior migration-history fingerprints. Both comparisons passed. The same guarded operation was then applied to the local `lumigap_db`: **13 historical records checked, all unchanged; prior migration history unchanged**.

Current inventory: 157 applied records, 147 migration directories, the same three older pending migrations, thirteen applied names absent from this checkout, eight non-line-ending checksum differences, forty line-ending differences and no unfinished migration. The earlier divergence was not repaired or marked resolved. It remains a **P1 environment/release prerequisite** for a team-wide rollout. Local schema compatibility for this change has been applied and tested; no database reset or data deletion occurred.

`node apps/backend/scripts/apply-simple-mentor-migration.mjs` performs a read-only preflight or reports the migration already applied. `--apply` is restricted to a loopback application/test database and refuses unexpected constraints, unfinished migrations or a different applied checksum. It is not a general migration repair tool or production deployment command.

Other limits: no real SMTP delivery, institution-specific mandatory role policy, reminder automation or Flutter UI redesign was added/tested. Matching remains visible term overlap; the text validator does not prove proposal quality. Existing Demo naming conventions are unchanged. No unresolved P0/P1 code defect was found in the final tested scope.

## Changed files

- Shared contract/utilities: `packages/shared-types/src/project.ts`, `research-introduction.ts`, `index.ts`.
- Schema: `apps/backend/prisma/collaboration.prisma`, `mentorship-content.prisma`, and the new `20261117170000_simple_mentor_invitations/migration.sql`.
- Backend Project module: `mentor-roles.service.ts`, `mentorship-positions.ts`, `project-mentorship.service.ts`, `project-mentorship.controller.ts`, `project.routes.ts`, `mentor-plan.service.ts`, `mentorship-discovery.service.ts`, `mentorship-dossier.ts`, `mentorship-content.service.ts`, `mentorship-content.routes.ts`, `dto/mentor-plan.schema.ts`, `screening-case-context.ts`.
- Web Project components: `supervisor-invitation-form.tsx`, `supervisor-invitation.css`, `mentor-role-assignments.tsx`, `mentor-project-workspace.tsx`, `mentor-recruitment-plan.tsx`, `mentor-suggestions-panel.tsx`, `mentorship-invitation-content.tsx`, `invitation-dossier-view.tsx`, `screening-case-labels.ts`.
- Web integration: `pages/academics/academic-support.tsx`, `features/projects/api/academic-support.api.ts`, `features/notifications/utils/notification-destination.ts`, `i18n/locales/supervisor-invitation.ts`.
- Backend tests: `supervisor-discovery.persistence.test.ts`, `supervisor-discovery.browser.ts`, `research-introduction.test.ts`, `screening-mentor-roles.test.ts`, updates to the existing mentorship workflow and plan suites.
- Frontend tests: `supervisor-invitation-form.test.tsx`, `mentor-role-assignments.test.tsx`, `mentor-recruitment-plan.test.tsx`, `academic-support.test.tsx`, `mentor-suggestions-workflow.test.tsx`.
- Tooling: `test-mentor-workspace.mjs`, `apply-simple-mentor-migration.mjs`, `seed-simple-mentor-legacy.ts` under `apps/backend/scripts/`.

Unrelated working-directory changes were preserved. No automatic commit, push or production deployment was performed.
