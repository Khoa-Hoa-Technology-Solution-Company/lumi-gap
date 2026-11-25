# Supervisor Discovery and Invitation: audit and implementation

> Historical report. The later [invitation simplification report](MENTOR_INVITATION_SIMPLIFICATION_20261117.md) documents the current two-input form, optional post-acceptance roles and invitations without automatic expiry. Screenshots in the shared audit directory reflect that later implementation.

Verified on 17 November 2026 in `D:\lumi-gap`. Scope: Project Support (`/projects/:id?tab=support`), its existing mentorship service, invitation preview, Create Project Step 2, and integration with the mentor workspace. No commit, push or deployment was performed.

## Audit: previous behavior and verified gaps

The existing system already had verified lecturer eligibility, separate `MentorRelationship` records, immutable invitation snapshots, access policies, a notification outbox, six-day expiry and primary/secondary reservations. Manuscript review already had version-scoped grants. These mechanisms were reused.

The gaps were in the paths into those mechanisms:

- Discovery promoted adding candidates to a recruitment plan. The backend also prepared a candidate for every owner invitation, making plan capacity and ordering affect direct invitations.
- The owner composer changed the shared discovery abstract while preparing an individual invitation. This mixed public discovery configuration with the content of one private request.
- Create Project Step 2 automatically posted a generic invitation rather than letting the owner review a complete, consented introduction.
- Search did not include visible profile keywords, technologies or preferred supervision topics. Active and pending invitees disappeared from search results.
- Support exposed three primary tabs, including access configuration, rather than focusing on discovery and invitations.
- Regression testing exposed a dossier projection that could include the private project's original research field while its approved discovery field was different. It now uses the explicitly supplied invitation field or the approved discovery field; private project research areas are not silently included.
- The common mentor eligibility/access helper could still return true for a trashed project. It now also checks that the project is not deleted. Existing history is preserved.
- Visual inspection found the new mobile sheet could extend left of the viewport because `100vw` included the stable scrollbar gutter. Its width now uses the available percentage width, with browser assertions for both sheet edges.

## Implemented workflow

1. The owner searches by name, exact verified account email, institution, research field, interests, visible keywords, skills or preferred supervision topics. Email lookup does not return the lecturer's email in discovery results.
2. Only active, verified lecturers with discovery enabled and mentoring availability enabled appear as available candidates. Matching uses visible term overlap, with no AI competence score. Explicitly saved mentor preferences retain their existing priority; otherwise project field, research areas and the keywords stored by project creation in the research plan inform suggestions.
3. Cards offer **View profile** and **Invite supervisor** directly. Pending and active invitees remain visible with their actual relationship state. Demo profiles have an explicit Demo label; availability is described as self-declared. Interests remain distinct from the terms used internally for keyword/technology search.
4. The owner opens one invitation drawer, reviews the project introduction and sends. The optional recruitment plan remains available but is not required and a direct invitation does not secretly add a candidate.
5. The existing POST saves one pending request, its frozen snapshot and a durable notification. Retrying the same request does not create a second invitation or notification.
6. The lecturer sees the invitation in the existing Mentor Workspace and reviews its approved introduction before accepting or declining.
7. Acceptance creates/activates one `MentorRelationship` and its existing scoped access policy in the transaction. It does **not** insert a `ProjectMember`, create a review request, create a task or award authorship. Team & settings displays the accepted mentor separately from research-team membership.
8. The existing mentor collaboration and manuscript delivery workflow remains responsible for later chat, resource sharing and version-specific review.

The two main Support tabs are **Find Mentors** and **Invitations & mentors**. Permissions and resource sharing are secondary expandable content under invitations. Existing access/permissions links remain supported.

## Invitation form and contract

The drawer shows the selected lecturer, profile link, choose-again action, project title/field/topics/keywords, representative and team size. Owner-only defaults supply the summary and goal. An invitation-specific summary never overwrites the project's description or discovery configuration.

| Input | Rule |
| --- | --- |
| Research summary | Required, 80–2,000 trimmed characters; UI recommends 300–1,000 |
| Invitation reason | Required, 20–1,000 trimmed characters |
| Expected support | At least one existing support type; four common choices initially, four additional choices available |
| Additional message | Optional, maximum 1,000 characters |
| Expected start | Optional proposed date, not a confirmed supervision schedule |
| Mentor role | Existing primary/secondary vacancy and campaign rules |
| Sharing confirmation | Explicitly required; reset when the shared request changes |

The owner can expand the shared introduction before confirming. Private libraries, live manuscript sources, evidence matrices and internal team chat are not opened by sending the invitation.

The form retains per-account/project/recipient drafts in session storage. Drafts reset across account/recipient changes; consent is never restored automatically. A synchronous submission lock prevents double clicks. The request receipt persists across a lost response and remount; the same payload can be retried even when its first successful write has reserved the role. Errors leave the form and its content open.

Create Project Step 2 still creates the private project and sends the selected team invitations. Choosing a lecturer now prepares this same invitation form and navigates to Support with `inviteMentor`. It does not announce a pending mentor invitation before the owner explicitly sends it.

Existing policy is preserved: two active mentors, one primary and one secondary, one pending request per role, six-day expiry, explicit parallel-role configuration, rejection/cancellation cooldowns and explicit recruitment reopening. No automatic resend or silent cancellation was added.

## Models, API and authorization

Reused models: `AcademicProfile`, `Project`, `ResearchPlan`, `MentorshipRequest.invitationSnapshot`, `MentorRelationship`, `MentorAccess`, its history/resource shares, existing notifications, mentor plans and version-scoped review records. No new table, column or migration was needed.

Existing endpoints were extended rather than duplicated:

- `GET /api/v1/projects/:id/available-mentors`: expanded privacy-filtered search and pending/active state.
- `GET /api/v1/projects/:id/mentorship-discovery`: owner-only invitation defaults; these defaults are not part of public opportunity previews.
- `POST /api/v1/projects/:id/mentorships`: requires the official summary/reason/support/sharing-consent DTO for new HTTP invitations. Optional invitation-specific field/additional message are saved inside the existing JSON snapshot.
- Existing request detail, accept, decline, cancel, relationship end, mentor-access and manuscript-review endpoints remain the sources of truth.

The owner permission, verified lecturer identity, availability, duplicate person/role, active relationship, cooldown, project state and recipient identity checks remain server-side. Idempotent owner retries also recheck the sender's management permission. Pending recipients can read their own frozen invitation, not the private project workspace. Cross-project IDs are rejected.

After acceptance the existing ADVISOR policy starts with no resource shares. Permission names do not expose the private library or live manuscript. Actual resources still require explicit sharing; delivered v1/v2 manuscripts use the existing review access mechanism. No lecturer role, affiliation, expertise or scientific competence is verified merely by accepting an invitation.

## Tests actually executed

All persistence runs used a newly created local PostgreSQL `_test` database, replayed the existing migrations, and dropped only that disposable database after the run. Application data was not reset or migrated.

| Command / check | Result |
| --- | --- |
| `node scripts/test-mentor-workspace.mjs --supervisor-only --supervisor-browser` | **27 passed, 1 skipped**, including the new real-browser flow |
| `node scripts/test-mentor-workspace.mjs --supervisor-regression` | **87 passed, 1 skipped** across mentorship workflow, authenticated HTTP, frozen dossier and optional recruitment-plan suites |
| Targeted web Vitest run, nine suites | **70 passed** |
| Shared-types `pnpm exec tsc -p tsconfig.json` | Passed |
| Backend `pnpm exec tsc --noEmit`, including tests | Passed |
| Backend `pnpm build` | Passed; includes four passing PostgreSQL runtime-boundary tests and Prisma client generation |
| Web `pnpm build`, including TypeScript build | Passed |
| Targeted ESLint on the related backend/web/shared files, `--max-warnings=0` | Passed |
| Local web `/`, backend `/health`, backend `/ready` | HTTP 200 at ports 8080 and 4000 |

The 114 passing backend cases above belong to separate suites. The two skipped cases are older optional browser harnesses; their success is **not** claimed. The new supervisor browser test was enabled and passed. No repository-wide test pass is claimed.

Coverage includes summary/reason/support/consent validation, owner-only defaults, exact email lookup without email disclosure, private profile-field exclusion, availability and Demo labels, direct invitations despite a full shortlist, six-day expiry, cancellation/rejection, archived/trash restrictions, duplicate and concurrent sends/Accept, immutable previews, one durable notification, actual owner-versus-pending API authorization, cross-project IDs and preserved role/campaign history. The private API tests first establish an owner HTTP 200 on the same route before asserting pending denial; a missing route is not counted as authorization coverage.

The existing manuscript suite reverified PDF/LaTeX version-specific access, v1 feedback, private v2 drafts, explicit v2 delivery, independent mentors/projects, queue updates, revoked access and denied edit/delete.

Frontend coverage includes autofill, profile links, separate per-account/recipient drafts, all required validation, content retention, double submit, renewed consent, retry using the original idempotency key after remount, Step 2's no-auto-send behavior, offers, Accept/Decline and existing recruitment/dossier components.

Browser QA used two isolated sessions against the real API and disposable database: name/technology search, opening the actual academic profile in a new tab, direct invitation, validation, response-loss retry, notification count, incoming mentor preview, Accept, Mentor Workspace projects and accepted mentor display under Team & settings. Desktop 1440px, tablet 768px and mobile 390px were checked. Both mobile sheet edges and horizontal overflow were asserted; light/dark screenshots were visually inspected. No uncaught browser errors occurred in the passing run.

Screenshots: [discovery](audits/2026-11-17-supervisor-discovery/discovery-desktop.png), [invitation desktop](audits/2026-11-17-supervisor-discovery/invitation-desktop.png), [mobile](audits/2026-11-17-supervisor-discovery/invitation-mobile.png), [mobile dark](audits/2026-11-17-supervisor-discovery/invitation-mobile-dark.png), [mentor incoming](audits/2026-11-17-supervisor-discovery/mentor-pending.png), [mentor accepted](audits/2026-11-17-supervisor-discovery/mentor-accepted.png), [owner accepted](audits/2026-11-17-supervisor-discovery/owner-accepted.png), [Team & settings](audits/2026-11-17-supervisor-discovery/team-accepted-mentor.png).

## Database state and remaining limits

Read-only application database inventory: 156 applied migration records versus 146 checkout migration directories; 3 local migrations not recorded as applied, 13 applied migrations absent from this checkout, 8 checksum differences beyond line endings, 40 line-ending-only differences and no unfinished migration. These are pre-existing environment discrepancies. No history was rewritten, migration marked resolved, database reset or application data deleted. See the earlier [contribution audit](RESEARCH_CONTRIBUTION_AUDIT_20261117.md) for environment context. Clean test migration replay succeeding does not repair this divergence.

- **P1 environment/release prerequisite:** reconcile the existing migration divergence with the team before deployment or applying pending migrations to the application database. No automatic repair was attempted.
- **P2 client compatibility:** the new HTTP invitation DTO is deliberately stricter. Legacy internal service callers remain compatible; any other client posting old invitation bodies must adopt summary, reason, support needs and explicit consent. Flutter's interface was not redesigned or tested in this task.
- **P2 data semantics:** Demo detection follows existing Demo naming/institution conventions because there is no persisted Demo flag. It is a display distinction, not a new verification level.
- Real SMTP delivery was not exercised; durable in-app notifications and failure/retry behavior were verified. Search is evidence-limited visible term overlap, not semantic AI ranking or proof of competence.
- No new upload, reminder, negotiation, chat or review subsystem was introduced. Existing explicitly attached invitation files and invitation history remain readable through their existing authorized paths.

No unresolved P0/P1 defect was found in the final tested discovery/invitation scope. The scoped change is ready for code review; environment-wide release readiness remains conditional on the migration issue and broader team review.

## Changed-file map for this task

- Contract: `packages/shared-types/src/project.ts`.
- Backend: `academic-relationship-access.ts`, `mentorship-discovery.service.ts`, `mentorship-dossier.ts`, `project-mentorship.controller.ts`, `project-mentorship.service.ts` under `apps/backend/src/modules/projects/`.
- Web: `pages/academics/academic-support.tsx`; project components `supervisor-invitation-form.tsx`, `create-project-form.tsx`, `mentor-suggestions-panel.tsx`, `invitation-dossier-composer.tsx`, `invitation-dossier-view.tsx`; `supervisor-invitation.css`; `i18n/locales/supervisor-invitation.ts` and its composition in `project-contributions.ts`.
- Tests: new `supervisor-discovery.persistence.test.ts`, `supervisor-discovery.browser.ts`, `supervisor-invitation-form.test.tsx`; updated `mentorship-http.persistence.test.ts`, `mentorship-workflow.persistence.test.ts`, `mentor-plan.persistence.test.ts`, `academic-support.test.tsx`, `create-project-form.test.tsx`; existing isolated runner `apps/backend/scripts/test-mentor-workspace.mjs`.
- Documentation and browser evidence: this report and `docs/audits/2026-11-17-supervisor-discovery/`.

Substantial unrelated changes already present in the working directory were preserved. This file map identifies this task's scope, not the entire dirty repository.
