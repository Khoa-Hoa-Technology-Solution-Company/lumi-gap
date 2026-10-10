# Open academic identity and optional FPT verification

## Registration and routing

Registration accepts valid personal, FPT and other institutional emails. Password and existing Google ownership verification remain supported. Email ownership is independent of academic role, institutional affiliation and position verification.

Member routing: login/register → email ownership verification → academic onboarding → `/home`. Administrators retain their existing system workspace. FPT verification never gates core research tools. Core APIs check active account and verified primary email; existing object membership, visibility and assignment rules still apply.

## Three-step onboarding

1. Search active `Institution` records and select an institution, or use the controlled Other institution input. Choose Student, Researcher or Lecturer.
2. Student selects an existing `AcademicProgram` or enters a program/major, stored through the same model. Researcher and Lecturer provide current position. All declarations remain self-declared.
3. Select required Research Areas from existing paper field taxonomy and default academic fields. Research Interests are optional tags.

Drafts are stored in session storage per account, preserved on save failure and removed on completion. The API validates all required fields and institution/program membership. Retrying upserts the same profile and current affiliation. Existing biography, skills, identities and featured works are preserved. There are no onboarding document uploads, Campus requirement, Student ID requirement, or Internal/External choices.

API: `GET /api/v1/auth/academic-onboarding/options?q=&institutionId=`; `PATCH /api/v1/auth/me/academic-profile`.

## Separate identity dimensions

- `systemRole`: USER or ADMIN, never selected through academic onboarding.
- `academicRole`: STUDENT, RESEARCHER or LECTURER; editable in Profile/Settings.
- `Affiliation`: institution, current/primary state and independently reviewed verification.
- Position verification: independently reviewed; selecting Lecturer does not verify employment.
- `ReviewerAssignment` and `MentorRelationship`: explicit relationships to individual artifacts/projects.
- Legacy participant scope is retained for compatibility and institution-specific contribution approval. It does not restrict core workflows or appear as an External User badge.

Core capabilities are recalculated from live ownership/account state, including old users without persisted project grants. Stale review/mentor grants are filtered against current Lecturer and position verification. Identity edits invalidate the relevant privileged verification; identical onboarding retries preserve valid verification.

## Optional FPT affiliation

Approved institutional domains are centralized in `InstitutionDomain`. Successfully verified email ownership may establish affiliation using `INSTITUTIONAL_EMAIL`; an unverified domain string never establishes affiliation.

Personal-email FPT members may optionally request manual review through one existing affiliation service. Student requires Student ID and student/enrollment evidence; Researcher/Lecturer supply institutional staff or appointment evidence. One private PDF, maximum 10 MB. These are the same request, admin review, storage, audit and retention mechanisms for all roles.

API: `POST /api/v1/academic-profiles/me/verification-request` (multipart); owner status via `/me`; admin queue/details/evidence/decision via `/api/v1/admin/academic-verifications`.

States: NOT_SUBMITTED/UNVERIFIED → PENDING → VERIFIED, NEEDS_MORE_INFORMATION or REJECTED. Resubmission preserves review history. Public profiles have no request documents, Student ID or private notes. Only verified current host affiliation receives the precise “FPT Education affiliation verified” badge. Non-FPT profiles show normal Role · Institution.

## Private evidence and retention

Storage supports authenticated Cloudinary raw objects, private R2 or private local storage. Admin evidence downloads are authorized, audited, uncached and proxied; temporary URLs are not returned to public DTOs. MIME, size, PDF signature and owner key checks remain enforced. Self-review is blocked, conflicting decisions are serialized, and privilege fields cannot be submitted by the client.

`AFFILIATION_EVIDENCE_RETENTION_DAYS` defaults to 30 and is configurable. Final decisions and superseded requests expire; active requests remain available. Evidence cleanup runs at startup/hourly. Durable deletion intents cover interrupted uploads, account disable and raw SQL account deletion cascades. Private Student ID/note metadata is removed when its evidence retention expires. Review history and verification outcomes remain.

## Formal review and mentoring

All three academic roles use normal research, Forum, citation and collaboration workflows. Formal Academic Review requires active, email-verified Lecturer + independently verified Lecturer position + valid ReviewerAssignment + artifact access. Researcher and Student can give ordinary feedback but cannot perform formal Lecturer review, even with stale grants. Verified non-FPT Lecturers follow the same assignment rules. Mentorship acceptance requires the same Lecturer verification and an explicit requested relationship; account/role changes and relationship updates are rechecked transactionally.

One existing Home prioritizes role-relevant research tasks, assigned reviews, revisions and mentorship relationships; no role-specific applications are introduced.

## Migration and verification

`20261007000200_open_academic_onboarding` backfills only missing valid academic roles, synchronizes ownership already verified by existing primary UserEmail records and revokes invalid old formal authority. It preserves profiles, affiliations, identities, programs, completion timestamps and review history. No existing columns are dropped and no email is inferred verified from its domain.

Tests use an isolated scratch PostgreSQL database and Redis. They cover open registration, non-FPT onboarding/projects, generic FPT requests, evidence privacy, retention/deletion, role transitions, stale capability denial, assignment-bound review, migration preservation, progressive UI, refresh/error recovery, language preference and routing.

Policy to confirm before production: retention duration, accepted staff/appointment evidence and administrator verification criteria. FEID and ORCID OAuth are not implemented by this change.
