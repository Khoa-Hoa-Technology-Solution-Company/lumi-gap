# Shared Academic Profile

Student, Researcher and Lecturer use the existing `AcademicProfile`, profile endpoints and shared React view/editors. Onboarding writes the same role, affiliation, program/position and research fields that Profile reads; Settings reuses that view.

## Identity and sections

- Student: Institution, Academic Role and structured Program/Major (`Affiliation.programId` → `AcademicProgram`). No position or publications required.
- Researcher/Lecturer: Institution and Current Position. Lecturer authority requires verification and the existing assignment checks.
- Content order: Research Focus & Expertise, Academic Biography, Featured Works & Contributions, Scholarly Profiles / Links. Empty optional sections are omitted for other viewers; owners receive compact editing actions.
- Research areas use the onboarding taxonomy; interests, skills and keywords use tags.
- Forum identity uses the same role/affiliation source and shared identity summary. Forum, project members and review attribution link to `/academics/:userId` or `/u/:handle`.

## Featured Works

The existing `AcademicFeaturedWork` collection now accepts a `kind` and one of `paperId`, `projectId`, `submissionId`, `reportId`, `gapId`. The additive migration `20261007000300_shared_academic_profile_works` preserves previous Paper references and enforces one internal target at most.

`GET /api/v1/academic-profiles/me/featured-work-options?kind=PROJECT&q=...` provides authenticated, bounded selection. Profile PATCH validates targets and rejects inaccessible or unavailable records. Linked metadata is resolved from the source; supplied titles/DOIs are not persisted for internal objects.

Reads resolve sources and permissions in batches with the actual viewer, before serialization. Private project content needs owner/active membership access; a public project summary does not make submissions, reports or candidate gaps public. Blind review assignment does not expose author attribution. Deleted/unavailable references are omitted on read. Removed membership takes effect on the next read.

Dataset, Contribution and Other currently support manual title/DOI/year metadata. They are explicitly self declared and do not constitute a separate dataset repository or provider verification system.

## Privacy and verification

Profile visibility, field privacy and individual scholarly-link visibility are enforced independently on the server. Public DTOs exclude email, verification evidence/documents, affiliation history, audit history and internal authorization data. Private works are excluded even when the profile is public.

The FPT badge means only a verified, current affiliation with a host institution. Lecturer position status remains separate and requires both role and position verification. Academic role/position/institution changes invalidate the relevant position authority; choosing Lecturer alone never grants review or mentoring privileges.

Modern scholarly links retain `verificationStatus` (`UNVERIFIED`, `PROVIDER_CONNECTED`) separately from `visibility` (`PUBLIC`, `REGISTERED_USERS`, `PRIVATE`). Client PATCH cannot assign provider connection or verification. Existing progressive disclosure is retained. ORCID OAuth is not configured in this repository; manual links remain unverified.

## Validation

Coverage includes the shared role view/editors, Student program editing, exact FPT badge, ownership, field/link visibility, internal source validation, canonical metadata, public-summary boundaries, revoked membership, and Student → Lecturer authority invalidation. PostgreSQL integration tests run against an isolated scratch database, not the local application database.
