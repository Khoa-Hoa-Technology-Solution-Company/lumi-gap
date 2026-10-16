# Project creation and team management

Implementation report, 2026-10-14. Baseline: `db20cc6627afc71ec91a6338b76e2bb76802f2ce`.

The earlier [workspace architecture audit](research-workspace-architecture-audit.md) describes the pre-implementation checkout. This report records the bounded creation/team slice implemented after that audit. Existing unrelated working-tree changes were preserved.

## Delivered behavior

- A compact localized creation form requires a title, defaults to PRIVATE, and progressively reveals up to three searchable research areas and a research approach. Objective, areas and approach remain optional. Mentor, members, papers and methodology are not prerequisites.
- Creation checks the active account, verified email and completed academic onboarding without an FPT-domain restriction. The project, OWNER membership, initial ResearchPlan and activity event commit in one PostgreSQL transaction. Mentor discovery starts CLOSED.
- The web persists a per-account session draft and stable UUID idempotency key, prevents repeated clicks, and retries uncertain responses with the original payload. Successful creation opens the actual workspace with optional, dismissible next steps.
- Team & settings reuses the existing members destination. People and Project settings have keyboard-operable tabs, loading/error/retry states, pagination, localized copy and responsive controls.
- Owners can invite an existing account or email address, resend after cooldown, cancel an invitation, remove a member, transfer ownership, edit project settings, archive and restore. Members can leave. Destructive actions require confirmation and secondary actions live in menus.
- Invitations create membership only after the intended verified identity accepts. Pending invitations, expired/revoked links, duplicate submissions, late registration, rejoining, token rotation and concurrent acceptance are handled server-side.
- PRIVATE/PUBLIC visibility and CLOSED/SEEKING_MENTOR discovery are separate. Public reads expose an allowlisted summary; mentor discovery exposes its separately approved preview. Neither grants project membership or publishes papers, notes, manuscripts, files or internal discussions.
- Archives retain records and member reads while blocking project collaboration writes. Archiving cancels pending membership invitations and closes discovery. Restore does not resurrect those invitations or opt back into discovery.
- Hard deletion is restricted to an empty project without research or collaboration history, including the owner's own drafts. A global audit entry is preserved for successful deletion.

## Integrity and authorization

`Project` and `ProjectMember` remain canonical. There is no parallel project, account, role or membership API. `ResearchPlan` stores the initial approach rather than introducing another project aggregate.

Mutation transactions lock sorted account rows before the project row, then recheck current authority. The database enforces one active OWNER and agreement between that membership and `Project.ownerId`. Ownership transfer validates the current owner and active recipient transactionally. Settings carry an expected version to reject lost updates.

Current project membership now takes precedence over historical creator/author attribution in the changed report, corpus, gap, draft-workspace and submission paths. SSE streams recheck membership. Existing mentor relationships and assignment-based review access remain distinct from membership; merely being a lecturer never adds a member or grants owner controls.

Invitation email delivery uses the existing notification outbox and worker. The delivery intent commits with the invitation, the bearer token is hashed in the invitation and encrypted in the private outbox payload, and external recipients can be delivered without an account. Email is outside the creation/invitation response path. Cancelled, expired, archived and rotated invitations are checked before delivery. Notification payloads returned to clients do not expose the encrypted delivery data.

## Changed implementation files

Paths below are relative to the repository root; supporting earlier UI changes in this checkout are not all attributed to this slice.

| Area | Files |
| --- | --- |
| Persistence | `apps/backend/prisma/collaboration.prisma`; the two migrations below |
| Core project operations | `apps/backend/src/modules/projects/project.service.ts`, `project-transaction.ts`, `project-workspace.rules.ts`, `project.controller.ts`, `project.routes.ts` |
| Invitation delivery | `apps/backend/src/modules/projects/project-invitation-delivery.ts`; `apps/backend/src/workers/notification.worker.ts` |
| Shared authorization | `apps/backend/src/modules/authorization/project-membership.ts`; services in `modules/reports`, `modules/literature`, `modules/gaps`, `modules/workspaces`, `modules/submissions`; the two project chat SSE controllers |
| Shared DTOs | `packages/shared-types/src/project.ts` |
| Creation/onboarding UI | `apps/web/src/features/projects/components/create-project-form.tsx`, `project-research-fields.tsx`, `project-next-steps.tsx`; creation entry points in `project-directory.tsx` and `pages/projects/projects-list.tsx` |
| Team/settings UI | `apps/web/src/features/projects/components/project-team-settings.tsx`, `project-members-tab.tsx`; `pages/projects/project-detail.tsx`; `project-section-nav.tsx`; `project-workspace.css` |
| Shared dialog and creation styles | `apps/web/src/components/ui/dialog.tsx` adds an optional localized close label; `apps/web/src/features/projects/project-directory.css` excludes radios and checkboxes from text-input dimensions |
| Client integration | `apps/web/src/features/projects/api/projects.api.ts`, `hooks/use-projects.ts`; `apps/web/src/pages/projects/project-invitation.tsx`; `apps/web/src/i18n/locales/project-team.ts`, `project-workspace.ts` |
| New regression suites | Backend `project-creation-team.persistence.test.ts`; web `create-project-form.test.tsx`, `project-team-settings.test.tsx` |
| Existing regression fixtures | Project workspace/schema/member/directory tests; `apps/backend/src/test-utils/project-fixture.ts`; affected forum, home, gaps, profiles, peer-review, submissions and mentorship persistence fixtures; open-academic-onboarding verification data |

No feature dependency was added. The existing lockfile dependency content was preserved. No commit or push was performed.

## Migrations

1. `20261014000100_project_creation_team`: additive project areas, approved public summary, creator/idempotency/version fields, invitation resend timestamp, ResearchPlan and backfill, owner membership repair, unique active-owner index and deferred consistency triggers. Historical creator identity and public summary text are not invented from existing data.
2. `20261014000200_project_owner_reassignment_guard`: checks both the old and new projects if maintenance SQL reassigns an owner membership.

Both were rehearsed against an isolated PostgreSQL 16/pgvector database. Fresh replay of all 64 migrations, migration status and a repeated no-op deploy passed. A populated upgrade rehearsal verified existing project/plan/area backfill, owner repair, safe summary behavior and rejection of cross-project owner reassignment.

Local Compose PostgreSQL was backed up inside its container before `migrate deploy`. Deployment also applied three already-pending repository migrations: `20261003000100_community_embeddings`, `20261009120000_submissions_project_restrict`, `20261010120000_research_gap_evidence_scope`. The migration command completed successfully. `prisma migrate dev` was never used.

## Verification

Database tests used a disposable PostgreSQL/Redis pair, not the user's project database. Email delivery was disabled/mocked; no real invitation was sent. The label-verified disposable test containers were removed after the final runs.

| Gate | Result |
| --- | --- |
| Full backend Vitest with project, mentorship and student-affiliation integration flags | **935 passed, 40 skipped**, 135 files passed and one skipped |
| Full web Vitest, bounded to three workers | **573 passed**, 80 files |
| Creation/team persistence suite | 17 cases covering atomic ownership, concurrent idempotent retries, non-FPT eligibility, consent and identity, late signup, decline/cancel/expiry/resend, acceptance races, archive/restore, transfer/removal, public/discovery isolation, pagination, optimistic conflicts, revoked creator access, delivery suppression and deletion safeguards |
| Creation form / Team & settings component suites | 5 + 4 cases: click mutex, retry/remount key, malformed stored drafts, area limit, stale settings, member/archive state, keyboard navigation and load recovery |
| Additional mentorship/profile integration run | 61 passed; included again where enabled in the final backend run |
| Typecheck | Shared types, backend, web and Expo mobile passed |
| ESLint | Backend and web passed with existing warnings; targeted final edited files passed with `--max-warnings=0` |
| Prisma | Schema validation, fresh deployment/status, repeated deployment and populated upgrade passed |
| Runtime boundary | PostgreSQL-only runtime audit passed during backend build |
| Production build / live responsive UI | Final backend/web Docker builds and local restarts passed; live desktop (1440 px) and mobile (390 px) checks passed, as detailed below |

Logs and rehearsal scripts: `artifacts/project-creation-team/`.

### Failures found and resolved

- Strict owner integrity exposed older tests inserting a bare Project. A shared test-only fixture now creates the Project, OWNER and plan transactionally. Tests no longer remove an OWNER separately during cleanup.
- An old mentorship deletion assertion contradicted history preservation; it now verifies refusal and archiving while retaining records.
- A missing `Updating…` translation was added. An overloaded parallel web test run timed out; the full rerun with three workers passed.
- Live browser review found an older directory input rule enlarging the creation form's privacy radios. Text-input rules now exclude radios and checkboxes; privacy radios render at 16 × 16 px within clickable labels. Long matching-user names and emails also wrap within the invitation layout.
- Missing Vietnamese lifecycle, invitation-action and success labels were added. Shared dialogs accept a localized close label, and the affected project dialogs now announce `Đóng`.
- The broader integration run exposed stale lecturer approval data and a missing mentorship explanation. Fixtures now satisfy existing identity-binding and request policies. A fixed legacy project ID was replaced by a unique 24-character value so repeated integration runs do not collide. Authorization was not relaxed.
- Expo's `lint` command attempted an automatic ESLint configuration/dependency bootstrap. It was stopped, the lockfile was restored and frozen offline installation was checked. Mobile lint remains unverified because it requires that separate toolchain setup; mobile typecheck passed.
- An initial Compose restart attempted another build and failed against the transient lockfile. The explicit final Docker build uses the restored dependency set, followed by a restart with builds disabled.

## Remaining boundaries

- Live SMTP/provider delivery was not exercised. Delivery is at least once with claim/recovery behavior; exactly-once external email is not promised.
- Legacy clients may omit the optional creation idempotency key for compatibility. Duplicate prevention across lost responses is guaranteed for keyed requests, including the new web flow; keyless legacy callers must adopt a stable key to gain that guarantee.
- This slice does not implement tasks, manuscript CRDT/LaTeX editing, compiler isolation or the audit's entire future workspace architecture. It does not claim universal serialization of every legacy async job, admin access path or in-flight resource read against revocation. The targeted current-membership fixes and negative tests are the verified boundary.
- Production rollout, cloud backup/restore and external mail delivery need their normal operational checks. The deployment performed here is local Compose only.

## Final verification note

Final backend and web Docker images built successfully. The backend and existing relevant workers were restarted with the current backend image; the backend reported healthy. The latest web image was rebuilt after the final style and translation fixes and restarted with builds disabled. The updated application is available at [localhost:8080](http://localhost:8080/projects).

Live checks used the existing signed-in session at desktop 1440 × 1000 and mobile 390 × 844. They covered creation defaults, optional research fields, internal dialog scrolling, People/Settings navigation, invitation layout with a long synthetic email, and lifecycle confirmations. The creation dialog background was `rgb(255, 255, 255)` and its desktop `clientWidth` and `scrollWidth` were both 548 px; no horizontal overflow was observed in the tested mobile form or invitation dialog. The final deployed UI showed the Vietnamese archive action and accessible close label.

Browser checks opened and cancelled forms and confirmations. They did not create a project, send an invitation or mutate the user's existing project. Persistent mutations, authorization failures and concurrency behavior were exercised against the isolated test database.

Screenshots:

- [Creation form, desktop](../artifacts/project-creation-team/create-desktop.jpg)
- [Creation form, mobile](../artifacts/project-creation-team/create-mobile.jpg)
- [Team settings, desktop](../artifacts/project-creation-team/team-settings-desktop.jpg) (captured before the final label-only localization changes)

Final logs: `docker-build-final.log`, `docker-build-ui-final.log`, `local-restart-final.log`, `local-web-final.log`, `final-web-lint.log` and `diff-check.log` under `artifacts/project-creation-team/`.
