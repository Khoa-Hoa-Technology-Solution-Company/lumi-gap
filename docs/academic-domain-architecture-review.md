# Academic domain architecture and business logic review

Reviewed on 2026-10-07 against the connected registration, shared academic profile, Lecturer verification, mentorship and formal review specifications. Scope: current working tree on `codex/forum-citations-onboarding-sync`; earlier uncommitted implementation was preserved. This is a targeted code and regression-test review, not a claim that every repository endpoint has been exhaustively security tested.

## Audit findings presented before changes

| ID | Severity | Evidence and failure | Resolution |
| --- | --- | --- | --- |
| F1 | CRITICAL, privacy | `academic-profile.service.ts:toPublicProfile` returned legacy scholarly rows even when the backfilled canonical identity link was PRIVATE. Removing the new link could expose its old copy. | Public scholarly links now use only `academicIdentityLinks`; legacy public output retains GitHub only. No stored historical rows deleted. |
| F2 | CRITICAL, privacy | `review.service.ts:listContributions` trusted PUBLIC on the contribution, spread the whole row, and hydrated titles of private projects/submissions. | Reuse viewer-aware featured-work access checks, omit entries with inaccessible source objects, and allowlist DTO fields. Public output excludes description, evidence and internal assignment identifiers. |
| F3 | HIGH | `affiliation.service.ts:verifyFromEmail` changed the current institution without invalidating verified Lecturer position/role. | Lock the user, recheck active account/email ownership, compare institution IDs and invalidate current Lecturer verification if the institution changed. Historical evidence rows and reviews remain stored. Same-institution email verification preserves position verification. |
| F4 | HIGH | `review.service.ts:getReview/saveReview` did not prove the pinned revision belonged to the assignment's submission. Save did not recheck archived Project status. | Validate assignment/request/submission/revision consistency; check Project status under a transaction lock before saving. Request detail also rejects mismatched pins. |
| F5 | MEDIUM | `academic-profile.service.ts:updateMine` committed User/Profile before a separate affiliation declaration transaction; same-name institutions were compared by name. | Resolve the selected institution, compare IDs, and write User/Profile/old and new Affiliation/program in one user-locked transaction. |
| F6 | MEDIUM | Public Profile/Compact ownership compared a public Mongo ID to the authenticated UUID; Lecturer directory included inactive accounts that the detail resolver rejected. | Normalize ownership separately from public IDs; filter inactive accounts before directory hydration. |
| F7 | MEDIUM | Institutional OTP verification could race a profile email update or consume a replacement challenge based on an earlier hash. | Serialize challenge creation/consumption with profile edits on the same user lock; conditional updates include the challenge hash and attempt bounds. Invalidation happens inside the profile transaction. Affiliation promotion requires the same currently verified profile email. |
| F8 | LOW / technical debt | `common/authorization/permissions.ts` still contains academic personas, reviewer and moderator in a legacy permission table. | No live HTTP escalation demonstrated: auth hydrates USER/ADMIN and derives legacy `role` as user/admin. Keep compatibility and document remaining cleanup. |

Follow-up findings were reported before their fixes: viewer-dependent avatar/cover responses used public cache headers; cover ownership had the same legacy-ID mismatch; review admission read Project archive state without locking it. Media now uses `private, no-store`, validates active accounts and recognizes the canonical owner; review admission locks Project after reviewer/submission locks.

## 1. Overall architecture

The implementation uses one Express/Prisma/PostgreSQL backend and React frontend. The relevant domain boundaries already exist. No second identity/profile/verification/review system was added by this review. Most governance is enforced by backend services, not button visibility.

## 2. Role architecture

Canonical system identity is `User.systemRole` (USER/ADMIN). Canonical academic persona is `AcademicProfile.academicRole` (STUDENT/RESEARCHER/LECTURER). Role verification and position verification are separate fields. Auth checks active account, current DB system role and an active refresh-token session family on requests. Legacy `User.role` is compatibility data, not the current source for HTTP authorization.

Project ownership/membership lives in `Project.ownerId` and `ProjectMember`. Mentor authority lives in accepted `MentorRelationship`. Formal review authority lives in a specific `ReviewerAssignment` linked to `ReviewRequest`, submission and revision. Forum moderation is contextual, through category/community assignments and moderation services, rather than academic persona.

## 3. Registration and onboarding

`RegisterSchema` accepts a valid email, password and name; it does not require an FPT domain or FEID. Email verification, Google provider identity and academic onboarding are distinct flows. Personal email and non-FPT institutions are covered by PostgreSQL tests.

`authService.completeAcademicProfile` writes the shared profile and affiliation. Students supply Program/Major; Researchers/Lecturers supply Current Position. Research Areas are required; CV, ORCID, publications and verification documents are optional later additions. Frontend `ProtectedRoute` redirects incomplete onboarding. **Remaining implementation gap:** `assertResearchWorkflowAccess` checks active account and verified email, but does not enforce completed onboarding on direct core API calls. No institution restriction is imposed by that service.

## 4. Shared academic profile

One AcademicProfile exists per user. Students have educational context and Featured Works & Contributions, not mandatory scholarly metrics. Other personas use Current Position. Canonical featured objects resolve titles and access from their existing domain records; public project summaries do not publish private artifacts. Owner/media/public IDs now work with migrated IDs, and institution updates are atomic.

## 5. Affiliation verification

Institution/domain eligibility is centralized in `institution-domain.service.ts`; selecting an institution does not verify it. `UserEmail.verifiedAt` proves ownership. Affiliation has its own verification state and institution. Manual evidence is separate from email ownership. Switching institution through a verified email now invalidates current Lecturer authority as well as replacing the affiliation. Re-verifying the same institution does not revoke independently verified employment.

## 6. Lecturer verification

Self-selected Lecturer is not verified Lecturer. Current eligibility requires Lecturer persona, verified role, verified position, active account and verified email. Admin decides private evidence; self-approval and normal users are rejected. FPT affiliation alone and ORCID alone do not prove employment. Pending/more-information/resubmission/approval/rejection flows use existing VerificationEvidence rows, audit logs and safe notifications.

Evidence files use owner-scoped validated keys, private local/R2/authenticated Cloudinary storage, Admin-authorized access, PDF magic/size checks, and durable deletion intents/retention. Public profile DTOs exclude evidence, institutional email, staff/student IDs and Admin notes. Media cache fixes concern profile images; verification-file responses already use private no-store handling.

## 7. Mentorship

Both directions require the other party's acceptance. Owner-only relationship management is the documented V1 policy. Verified Lecturer eligibility is checked live. PENDING is not active access; accepted mentors get the scoped summary/guidance workspace without insertion of a normal ProjectMember row. PRIVATE and SEEKING_MENTOR are independent; discovery returns the explicitly supplied mentorship summary rather than internal papers/gaps/notes/files. Requests are bounded, expire and have duplicate/cooldown checks under locks.

## 8. Formal academic review

Review is independent of mentoring and needs explicit owner request plus Lecturer acceptance. Self-assignment and new direct Admin assignment are disabled. Assignments pin a submission revision and template version; structured rounds retain provenance. Writes recheck current Lecturer authority and accepted assignment inside a transaction, now also validating exact revision ownership and Project archive state. Submitted rounds remain immutable. Role changes do not delete completed reviews; request detail/submission history preserve historical records while current work access is reevaluated.

## 9. Authorization fixes

Fixed institution-change authority carryover, cross-submission review pins, writes to archived Projects, acceptance/archive serialization, legacy-ID owner access and inactive profile media/directory handling. Existing explicit Admin verification, mutual mentorship consent, object-scoped access and assignment gates remain in use.

## 10. Privacy fixes

Removed the legacy scholarly-link visibility bypass. Filtered public contributions by current source access and restricted their DTO. Prevented shared caching of viewer-dependent profile media. OTP/profile-edit concurrency no longer reinstates an old email's verification. No real user/project data was used for destructive testing.

## 11. Duplicate models / sources

- Canonical academic persona: AcademicProfile.academicRole. User.academicProfileType and primaryPosition are compatibility mirrors; no independent StudentProfile/ResearcherProfile/LecturerProfile.
- Canonical current institution/program: current primary Affiliation. User.institution and profile affiliation/status scalars remain mirrored for compatibility. The edited institution path updates them atomically.
- Canonical scholarly link visibility/connection: AcademicIdentityLink. AcademicExternalIdentity persists for migration/legacy APIs and GitHub. Scholarly copies are excluded from public legacy output.
- User/Profile both retain onboarding completion timestamps. Their existing onboarding writer updates both; API gating cleanup remains outstanding.
- MentorRelationship and ReviewerAssignment are distinct records. No generic mentor/reviewer system role was added.

## 12. Migration / database changes

No migration or schema change was required for these review fixes. Existing applied migrations were not edited. All 53 migrations were deployed into isolated scratch PostgreSQL databases during integration runs. Existing profile uniqueness, verification pending constraints, identity uniqueness, revision/template foreign keys, and relationship lookup indexes were inspected. Mentorship's older duplicate rows remain preserved; current service writes are serialized instead of retroactively deleting data to force uniqueness.

## 13. Regression tests added

Ten added PostgreSQL tests cover hidden/deleted legacy scholarly copies; canonical-owner access with migrated IDs; same-name institution IDs and competing edits; inactive Lecturer directory results; OTP vs profile email edits; media authorization/cache headers; institutional-email institution changes vs Lecturer authority; mismatched revision read/detail/write; archive vs save; public contribution source privacy. One added unit test explicitly rejects a legacy Forum Moderator at the Admin academic verification boundary. Existing integration coverage checks mutual consent, accept/cancel/submit concurrency, scoped mentor access, role revocation, review rounds, private evidence, registration and all personas.

Tests live in `shared-academic-profile.persistence.test.ts`, `open-academic-onboarding.persistence.test.ts`, and `peer-review.persistence.test.ts`. Integration fixtures use scratch PostgreSQL and temporary Redis; they do not reset the real local database or Docker volumes.

## 14. Verification results

Verified results:

- 82 PostgreSQL integration tests across eight suites passed; all 53 migrations deployed into the scratch database, which was cleaned afterwards.
- 87 distinct backend unit tests passed (80 initially, plus one new Moderator test and six storage tests; the repeated authorization tests are not double-counted).
- 84 frontend profile/onboarding/notification tests passed.
- Backend and frontend typechecks passed. Changed-file lint and `git diff --check` passed.
- Backend and frontend production builds passed; the backend PostgreSQL-only runtime audit passed all four checks.
- Docker backend and web images built successfully. Local backend/web and nine workers were updated. Backend/PostgreSQL/Redis are healthy, API health and web return 200, and the unauthenticated private profile endpoint returns 401. The local database reports no pending migrations.

The first expanded integration run hit the request throttle because fixtures shared one requester; fixture timestamps were separated and the rerun passed. Frontend tests emit existing React act warnings; those are not assertion failures. These results are for the relevant domain suites, not a claim of a full repository test run.

## 15. Remaining issues and decisions

### Implementation issues

- Direct core API calls enforce email ownership but not onboarding completion. UI onboarding is enforced; adding an API completion gate requires updating/backfilling legacy profiles and adjusting existing service fixtures together.
- Legacy submission reviewer endpoints still use the old `submission:review` role permission. Current authenticated USER Lecturers use the new review APIs, but those compatibility endpoints may reject an otherwise valid reviewer. Migrate to live assignment/capability checks rather than broadening USER permissions.

### Technical debt

- Retire mixed legacy role tables, admission scope fields and legacy scholarly writes once consumers are migrated. Keep canonical/mirror writers explicit until then.
- `affiliationService.declare` has no current production caller after this fix; it remains a legacy declaration helper. Route future institution edits through the atomic profile writer.
- Persisted capability evaluation can race profile changes, although current `list` and privileged workflow checks revalidate live Lecturer state. Consolidate evaluation transactions if additional capability consumers are introduced.
- Existing duplicate mentor rows lack a partial active-pair uniqueness constraint; service locks prevent new duplicates through supported APIs. A future cleanup migration must explicitly preserve/resolve historical duplicates first.
- Existing frontend React act warnings and large bundle warnings should be addressed independently from domain authorization.

### Product-policy questions

- `APPROVE_ACADEMIC_CONTRIBUTION` remains host-affiliation-only and can override the usual owner/contributor counterparty within an existing project membership. This is distinct from formal review and does not give arbitrary project access, but its institution distinction/confirmation semantics need product confirmation.
- Decide how ownership transfer affects the original requester's ability to see/manage historical review requests. Current review detail is requester/reviewer-scoped while some management actions use the current Project owner.
- Define historical reviewer content access after verification revocation. Completed records remain in request detail/history; live reviewer workspace requires current verified Lecturer status. No historical record was deleted to settle this policy.
- ORCID provider connection remains unavailable until a real OAuth backend flow exists; manual links stay UNVERIFIED.

## Changed API behavior

- `GET /academic-profiles/:userId`, `/summary`, `/by-handle/:handle`: canonical owner handling and no scholarly legacy privacy fallback.
- `PATCH /academic-profiles/me`: atomic institution changes and OTP invalidation.
- `GET /academic-profiles/lecturers`: inactive accounts excluded.
- `GET /academic-profiles/:userId/avatar` and `/cover`: active-account checks and private no-store caching.
- Institutional-email challenge/verify APIs: serialized profile identity and conditional challenge updates.
- Existing review workspace draft/submit/detail APIs: exact artifact and archive validation; review acceptance serializes Project status checks.
- `GET /contributions/users/:userId`: current source permissions plus restricted public DTO; endpoint prefix is mounted in the existing app router.

No new endpoint, UI framework, role enum, backend or parallel scholarly citation/profile system was introduced.
