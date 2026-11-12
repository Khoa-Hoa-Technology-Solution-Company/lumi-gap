# Lecturer applicant pool and evidence matching

## Workflow

The project Owner saves an approved mentorship preview, research areas, requested expertise, methodologies and mentoring needs, then enables `SEEKING_MENTOR`. This does not change project visibility or publish internal descriptions, papers, manuscripts or discussions.

A verified, available lecturer may submit an application. Multiple applications may coexist even while another candidate has a pending formal invitation. Applications never create `MentorshipRequest`, `MentorRelationship`, `MentorAccess` or project membership.

The Owner opens **Find Mentors → Mentor applicants**, reads individual evidence or compares two to three applicants. The Owner may shortlist or decline; each applicant may withdraw. A bounded private clarification thread is available only to the current Owner and that applicant. It is separate from all project chats and grants no resource access. Lecturers track applications through **Academic Support → My mentoring applications**.

**Prepare official invitation** opens the existing consent composer. The Owner chooses the formal role and proposed access policy, reviews the shared introduction, and explicitly sends it. Existing plan order, maximum four planned invitees, one pending request per role, PRIMARY/SECONDARY rules, cooldown, account locks and six-day expiration still apply. Applications do not consume those four plan entries until selected for a formal invitation. Selecting the next applicant never sends automatically.

The invitation transaction validates the applicant, expected application version, lecturer eligibility, Owner and capacity, then creates the normal request and links it to the application. The application becomes `INVITED`; this is not acceptance. Only the invited lecturer's acceptance activates the existing relationship and access policy.

## States and retry behavior

`APPLIED → SHORTLISTED → INVITED → ACCEPTED`.

An Owner may decline an APPLIED/SHORTLISTED application. The applicant may withdraw before invitation. Invitation decline maps to `DECLINED`; cancellation/expiration maps to `CLOSED`. No alternative applicant is activated automatically. Existing requests without an application link retain their existing lifecycle, including historical lecturer-origin requests.

One row per project/lecturer prevents duplicate active applications and keeps a stable history. After withdrawal/closure a lecturer may explicitly reapply if recruitment is open; a decline also enforces the existing pair cooldown. Prior submitted text remains in the private application event history. Submission keys/hashes are retained in events, so delayed retries cannot resurrect an old submission after a later withdrawal/reapplication. Action commands use the application version. Notes use per-author idempotency keys.

Expired request metadata is presented as expired immediately; the existing expiry sweeper persists the request/application terminal transition. An Owner can restart a closed invitation campaign through the existing plan controls; reapplication does not bypass that queue or reopen a role.

## Evidence and provenance

The MVP performs deterministic, normalized whole-term comparisons. It does not call Gemini, request embeddings, fetch external author profiles, use citation counts or generate a suitability percentage. It therefore works without external academic API credentials and does not make application submission depend on external services.

- Project comparison uses only approved mentoring fields, not hidden project data.
- Academic profile data comes from `academicProfileService.getPublic`, preserving field-level privacy and profile visibility.
- Topic terms identify their origin: profile declaration, application declaration or publication title. Neither profile nor application expertise is independently certified.
- Methodology relevance compares the project's explicit methodology requirements against the applicant's explicit declarations; it is labeled as declared rather than independently verified.
- Needs compatibility identifies offered terms present in the approved mentoring-needs text. Availability remains a separate declaration, never a proxy for research expertise.
- Featured public PAPER works reuse existing canonical metadata resolution. Featuring a work does **not** prove authorship, so these are always labeled self-declared attribution. Private/restricted artifacts are excluded.
- Local OpenAlex publications may be associated through a public, provider-connected ORCID identity and exact stored author ORCID, then the existing `PaperAuthor` relation. No name matching is performed. Current database constraints allow provider ownership verification only for ORCID OAuth; manually linked OpenAlex/Scholar profiles remain unverified. No constraint is loosened to manufacture a verified identity.
- Candidate local authorships are bounded to 500; at most 20 relevant-title records are queried and 8 relevant works displayed. This is a local evidence sample, not a complete publication search.
- Missing profiles, publications, authorship and methodology evidence are stated explicitly. A missing term does not establish a lack of expertise. Relevance is not a lecturer-quality assessment.
- Evidence links allow only HTTP(S) without embedded credentials; metadata renders as text. No arbitrary external URL is fetched.

## API

All routes use existing authentication/research-workflow guards and success/error envelopes; responses are `private, no-store`.

| Method | Route under `/api/v1/projects` | Authorization |
| --- | --- | --- |
| GET | `/academic-support/applications?page=1` | Own submitted applications |
| POST | `/:id/mentorship-applications` | Verified, available lecturer; eligible project |
| GET | `/:id/mentorship-applications?page=1` | Current Owner only |
| GET | `/:id/mentorship-applications/:applicationId` | Current Owner or that applicant |
| POST | `/:id/mentorship-applications/:applicationId/action` | Owner SHORTLIST/DECLINE; applicant WITHDRAW |
| POST | `/:id/mentorship-applications/:applicationId/notes` | Owner/applicant while application is open |
| POST | `/:id/mentorships` | Existing Owner invitation, optionally `applicationId` and `expectedApplicationVersion` |

The former new-offer endpoint `POST /:id/mentorship-offers` now creates a pool application, never a consent request. Updated web clients use the richer application endpoint. Legacy clients must use the new form to send attachments/capabilities; attachment sharing and lecturer-supplied access policies are rejected before selection. Existing outgoing requests and their accept/decline/cancel endpoints are unchanged.

Submission requires a meaningful message, declared availability and a UUID idempotency key. Lists are paginated. Clarification is capped at 100 messages of 2,000 characters. The router uses `createRateLimiter`; application submission also enforces the existing hourly relationship limit against immutable APPLIED events. Global audit/activity/notifications contain status metadata, not application text or clarification bodies. Full submission snapshots live only in scoped application events and are not returned through generic activity feeds.

## Persistence, deployment and rollback

Handwritten migrations:

- `20261106180000_mentorship_applicant_pool`: applications, scoped notes/events, approved methodology field and nullable request-to-application link.
- `20261106181000_mentorship_application_submission_keys`: durable submission idempotency and actor/type/time index.

Database uniqueness protects the project/lecturer pair, submission keys and note retries. A composite request foreign key prevents linking another project's or lecturer's application. Service mutations share the existing sorted account locks followed by the project lock. New application data is additive; old request/relationship/access history is not rewritten.

Before starting updated backend code, generate the Prisma client and run `prisma migrate deploy` using the normal deployment process. Never use `migrate dev`. Keep application tables and nullable columns if rolling back code; do not drop recruitment history. A rollback to code that treats new lecturer offers as immediate requests would restore the old product behavior, so disable new offer submission until the forward fix is available.

## Verification commands

```powershell
# Local PostgreSQL only; derives lumigap_mentor_applications_test, never migrates the application DB.
node apps/backend/scripts/test-mentor-applications.mjs
# A separate ignored local env file can be selected with --env-file <absolute-path>.

# From apps/web
node ../../node_modules/vitest/vitest.mjs run src/pages/academics/__tests__/academic-support.test.tsx src/features/projects/__tests__/mentorship-applicants.test.tsx src/features/projects/__tests__/mentor-discovery-settings.test.tsx src/features/notifications/utils/notification-destination.test.ts --maxWorkers=1 --minWorkers=1
node ../../node_modules/typescript/bin/tsc -b
node scripts/build.mjs
```

The PostgreSQL runner includes pool authorization, HTTP validation/envelopes, concurrency, private evidence, exact identity attribution, invitation acceptance/decline/cancel/expiration, plan and mentor-access regressions. It leaves fixtures in its dedicated test database because existing mentorship histories are immutable.

## Limits

Matching intentionally provides term/title evidence rather than an academic-quality judgment or complete semantic search. External refresh, automatic author linking, LLM explanations, real-time chat, publication-count ranking and automatic selection are not implemented. Clarifications support text only; private project documents are still shared exclusively through the existing approved invitation/access workflow. Owners should resolve expectations and use source links before deciding.

## Implementation inventory

All paths below are relative to the repository root.

| Area | Added | Integrated with existing code |
| --- | --- | --- |
| Persistence | `apps/backend/prisma/mentorship-application.prisma`, the two migrations listed above | `apps/backend/prisma/collaboration.prisma` |
| Backend | `apps/backend/src/modules/projects/mentorship-applications.service.ts`, `mentorship-applications.routes.ts`, `mentorship-application-context.ts`, `lecturer-match-evidence.ts`, `dto/mentorship-application.schema.ts` | Project routes/controller, `project-mentorship.service.ts`, `mentor-access.service.ts`, `mentorship-discovery.service.ts` |
| Shared contracts | `packages/shared-types/src/mentorship-application.ts` | Shared index and project preview types |
| Web | `apps/web/src/features/projects/api/mentorship-applications.api.ts`, `components/mentorship-applicants.tsx`, `apps/web/src/i18n/locales/mentor-applicants.ts` | Academic Support, discovery settings/API, notification destinations, English/Vietnamese dictionaries |
| Verification | Backend application persistence/evidence tests, historical-request fixture, isolated PostgreSQL runner; web applicant component and locale tests | Existing mentorship workflow/access tests and Academic Support tests |
| Documentation | This document | `docs/mentor-recruitment-plan.md`, `docs/mentor-invitation-access-control.md` |

## Verification record and rollout status

Executed locally on 2026-11-06 against this implementation:

| Check | Result |
| --- | --- |
| PostgreSQL applicant pool, evidence, invitation plan, existing mentorship lifecycle and access suites | 137/137 passed across five files after the follow-up review |
| Additional backend identity, authorization, mentorship-rule and PostgreSQL-runtime regressions | 21/21 passed across four files |
| Web Academic Support, applicant pool, discovery settings, notification destinations and applicant locales | 88/88 passed across five files after the follow-up review |
| Existing web mentor conversation, invitation content, mentor entry, recruitment plan and approved preview regressions | 59/59 passed across five files |
| Global locale suite | 12 passed, 1 failed: static UI-string coverage has 390 missing dictionary entries already present at HEAD |
| Baseline locale comparison and new applicant locale coverage | Both passed; baseline 390, current 390, no newly missing strings |
| Shared types, backend production TypeScript, web TypeScript and web production build | Passed |
| Scoped ESLint on changed backend/web TypeScript and `git diff --check` | Passed |

The isolated database runner migrated only `lumigap_mentor_applications_test`. Application/production databases have not received these migrations, and the running localhost application has not been deployed with this feature. No browser screenshot review or full browser end-to-end run was performed. No commit, push or production deployment is included in this task.

Follow-up review reproduced and fixed two edge cases. The application form now initializes and restricts the preferred role to the roles actually recruiting, including a project seeking only a secondary mentor. Revoking either a pending invitation's access or an accepted mentor's access now closes the linked application and records its event in the same transaction; it no longer leaves the application INVITED/ACCEPTED until a later read. Regression tests failed against the previous implementation and passed after these fixes.

Recommended follow-up is a staging migration and browser acceptance pass with real Owner/lecturer accounts, including mobile comparison layout, notification navigation, formal consent and access revocation. Broader evidence coverage can later reuse synchronized records without weakening identity attribution or privacy controls.
