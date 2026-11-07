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

Modern scholarly links retain `verificationStatus` (`UNVERIFIED`, `PROVIDER_CONNECTED`) separately from `visibility` (`PUBLIC`, `REGISTERED_USERS`, `PRIVATE`). Client PATCH cannot assign provider connection or verification. Existing progressive disclosure is retained.

## ORCID OAuth 2.0 Integration

ORCID account linking uses the official ORCID OAuth 2.0 Authorization Code flow (`/authenticate` scope) and supports both Sandbox (`https://sandbox.orcid.org`) and Production (`https://orcid.org`) via `ORCID_BASE_URL`.

- **Environment variables**:
  - `ORCID_CLIENT_ID`: ORCID Public or Member API client ID (`APP-...`).
  - `ORCID_CLIENT_SECRET`: ORCID client secret (server-only, never exposed to clients or logs).
  - `ORCID_BASE_URL`: `https://sandbox.orcid.org` (default for local/testing) or `https://orcid.org` (production). Strictly allowlisted.
  - `ORCID_REDIRECT_URI`: Registered callback URL, e.g. `http://localhost:4000/api/v1/academic-profiles/orcid/callback` locally or `https://api.lumigap.uk/api/v1/academic-profiles/orcid/callback` in production.
- **Unconfigured mode**: When `ORCID_CLIENT_ID`, `ORCID_CLIENT_SECRET`, or `ORCID_REDIRECT_URI` is unset, the backend starts normally, `GET /api/v1/academic-profiles/me/orcid` reports `configured: false`, connect/callback endpoints return `503 Service Unavailable`, and the frontend disables the **Connect ORCID** button with a clear notice.
- **Endpoints**:
  - `GET /api/v1/academic-profiles/me/orcid`: Returns `{ configured, environment, connected, link }`.
  - `POST /api/v1/academic-profiles/me/orcid/connect` (and `GET`): Generates a 32-byte random CSRF `state` bound to `userId` and `sessionId` in Redis (10-minute TTL) and returns the ORCID authorization URL.
  - `GET /api/v1/academic-profiles/orcid/callback` and `POST /api/v1/academic-profiles/me/orcid/callback`: Atomically consumes the single-use Redis `state` via Lua compare-and-delete, exchanges the authorization code for an authenticated ORCID iD at `${ORCID_BASE_URL}/oauth/token`, validates the ISO 7064 checksum, and persists `AcademicIdentityLink` with `provider = "ORCID"`, `connectionMethod = "OAUTH"`, `status = "CONNECTED"`, `verificationStatus = "PROVIDER_CONNECTED"`.
  - `DELETE /api/v1/academic-profiles/me/orcid`: Disconnects the user's ORCID link and records an audit log entry.
- **Security and verification boundaries**:
  - A partial unique index (`academic_identity_links_verified_orcid_unique`) ensures one `PROVIDER_CONNECTED` ORCID iD cannot be linked to multiple LumiGap accounts simultaneously, while unverified manual entries on other accounts cannot block the legitimate ORCID owner.
  - Connecting ORCID verifies control of the ORCID iD only. It never sets `academicRole = "LECTURER"`, never verifies lecturer position or institutional affiliation, and never creates `ORCID_AFFILIATION_MATCH` evidence automatically.

## Validation

Coverage includes the shared role view/editors, Student program editing, exact FPT badge, ownership, field/link visibility, internal source validation, canonical metadata, public-summary boundaries, revoked membership, and Student → Lecturer authority invalidation. PostgreSQL integration tests run against an isolated scratch database, not the local application database.
