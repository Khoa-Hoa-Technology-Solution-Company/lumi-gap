# Lecturer verification, mentorship and academic review

> Phần mentorship và email trong tài liệu này mô tả phiên bản trước migration `20261007000600`. Workflow hiện tại, model consent tách riêng, scoped research context và email delivery được ghi trong [Academic Mentorship](academic-mentorship.md).

## Repository architecture and reuse

LumiGap uses React/Vite, Express, Prisma and PostgreSQL. This implementation reuses AcademicProfile, VerificationEvidence, MentorRelationship, ProjectActivity, ReviewRequest, ReviewerAssignment, versioned submissions, Notification and AuditLog. No parallel identity, chat or review system is introduced.

System role, academic role, institutional affiliation, position verification, mentor relationships and reviewer assignments remain separate. All three academic roles retain the core research workflow after email verification and onboarding.

## Lecturer verification

Selecting LECTURER is self-declared. POSITION requests go through NOT_SUBMITTED → PENDING → VERIFIED / NEEDS_MORE_INFORMATION / REJECTED. Resubmission creates a new request and supersedes an earlier more-info request. Admin review rechecks the current account, academic role, institution and position under transaction locks and uses conditional status updates. Forum moderation does not confer Admin verification authority.

Institution and current position are required. Lecturer evidence is a private PDF (validated MIME, signature and 10 MB maximum) or institutional staff profile URL. Optional staff ID and note are private request metadata. ORCID and email confirmation alone cannot establish employment. Non-FPT Lecturers use this same workflow; FPT affiliation does not verify Lecturer position.

Public profiles exclude verification requests, staff ID, evidence and review notes. Evidence downloads use the existing authenticated Admin endpoint and private storage adapter. Finalized raw documents are queued for removal after ACADEMIC_VERIFICATION_EVIDENCE_RETENTION_DAYS (default 30); safe result/provenance survives. Pending evidence stays available for review; superseded more-info documents are eligible for cleanup. The existing retention worker processes the deletion queue.

## Academic relationship authority

V1 canManageAcademicRelationships grants management to the current Project Owner only. Ordinary members may participate in guidance but cannot create, accept, cancel or end academic relationships on behalf of a project. Inactive/unverified-email accounts cannot manage relationships. Admin is not the normal relationship assigner.

## Mentorship

The existing MentorRelationship row also represents the consent request. PROJECT_TO_LECTURER requires the verified Lecturer's supportAvailability.enabled. LECTURER_TO_PROJECT requires project opt-in. Requests are PENDING until the receiving party accepts. Existing ACCEPTED means an active mentorship, preserving database compatibility. Only the sender cancels; either owner or mentor can end active mentorship. DECLINED, CANCELLED, EXPIRED and ENDED remain historical records. acceptedAt, respondedAt, endedAt, endedById and responseNote retain provenance.

User locks in sorted order and a Project lock serialize pair creation and state transitions. One pending/active pair across both directions is permitted. User-keyed HTTP rate limiting, persisted hourly counts, configurable cooldown and expiry prevent repeated invitations. Expiration is enforced on reads and transitions, without a new scheduler.

An active, currently verified Lecturer gets a dedicated Academic Support workspace: explicitly shared summary and mentor guidance. They do not become Project members and do not receive access to private papers, evidence, files, draft gaps or general project content. Guidance uses existing ProjectActivity records and creates no formal review result. Ending mentorship or losing live Lecturer eligibility blocks mentor access while preserving guidance/history.

## Discovery

Project mentorshipDiscovery CLOSED / SEEKING_MENTOR is independent of existing PRIVATE / PUBLIC_SUMMARY visibility. Only verified Lecturers can discover opted-in nonarchived projects. The dedicated DTO contains id, title, owner-written mentorshipSummary, researchField, stage, requested expertise and discovery state; it never includes the general private description. Owners must supply a safe summary when enabling discovery. Lecturer discovery reuses existing institution/expertise/interests and availability filters without quality rankings.

## Formal academic review

Project Owner requests a published review template for an exact submission/artifact revision. The existing ReviewerAssignment is created as assigned (pending invitation), grants no artifact access, and activates as accepted only after the verified Lecturer accepts. No new direct Admin assignment or opportunity self-assignment is allowed. Legacy assignments remain stored.

Review admission checks active account, verified email, live LECTURER role, both verification statuses, author/contributor conflicts, workload, project/archive state and artifact reviewability. Review writes additionally match assigned reviewer, assignment state, revision and review round under transaction locks. Pending/cancelled requests cannot read artifact bodies or download revisions. Request expiry cancels the pending assignment and updates aggregate submission state. Due date and request expiry are different fields.

Mentorship alone grants no reviewer authority. If a requested reviewer also mentors the project, the request detail discloses that relationship. There is no invented blanket prohibition; existing author/member conflicts continue to apply. Completed reviews retain scores, rubric versions, reviewer attribution and exact artifact versions after role/verification changes. Future privileged actions re-evaluate live eligibility.

## UI, notifications and audit

Academic Support is available at /academic-support and in Project tabs. Lecturers see status, incoming/active mentorship, opted-in opportunities and a Review Center link; unverified Lecturers receive no accept/start authority. Owners have compact discovery and verified mentor request controls. Private verification forms disclose one evidence method at a time and bound dialog height. Added UI strings include Vietnamese translations.

Existing notification/push infrastructure handles verification submission/decision, mentorship request/offer/response/end and formal request/response/cancel/completion. Destinations route to private Settings, Academic Support or Review Center. Existing notification policy uses in-app/push delivery; no new sensitive-content email channel is added. Audit records actors, IDs and state changes, never documents, staff IDs or guidance text.

## APIs

- Existing academic profile verification and Admin verification endpoints accept POSITION staffId/additionalNote and more_info decisions.
- GET /projects/academic-support/mine
- GET /projects/academic-support/opportunities?q=...
- GET /projects/:id/academic-support
- POST /projects/:id/academic-support/guidance
- GET/PUT /projects/:id/mentorship-discovery
- POST /projects/:id/mentorships and /mentorship-offers
- POST /projects/:id/mentorships/:relationshipId/accept, /decline, /cancel, /end
- Existing /reviews/requests, invitation and assignment endpoints remain the formal review API.

Routes above are relative to /api/v1. Backend authorization is authoritative.

## Migration and policy boundaries

20261007000400_academic_relationship_consent is additive, adds consent/discovery/expiry fields and expands existing status constraints. Old relationship/request timestamps are backfilled without deleting duplicates or assignments; legacy pending requests keep nullable expiry. New writes enforce pair uniqueness transactionally.

The existing Admin system has no dedicated Lecturer verification revocation action. It is not invented as an automatic destructive transition. Live INVALIDATED/REJECTED statuses or academic-role/position/institution changes block future privileges immediately. Existing active relationships stay recorded and can be ended by their parties; no academic records are deleted. A governance UI for explicit revocation, policy for suspended mentorship resumption, and mentor/reviewer independence remain future policy decisions.

Production evidence retention and invitation limits are configurable; legal retention, approved evidence standards and the mentor/reviewer conflict policy need product decisions. Delegated member relationship management is outside this V1 owner-only policy.

## Verification

The isolated PostgreSQL suite exercises both consent directions, owner authority, no automatic membership, safe private previews, duplicate/concurrent writes, availability, cooldown, expiry, ending, role/verification changes, private request metadata, more-info/resubmission and concurrent Admin decisions. The existing formal-review suite additionally checks pending access, exact revision permissions, conflicts, race handling and retained history. UI tests cover all Lecturer statuses, progressive evidence fields and hidden unverified accept controls; notification tests cover destination routing.

Validated locally on 2026-10-07: 72 PostgreSQL integration tests, 46 focused backend tests and 55 focused web tests passed (173 total). Backend/web typechecks, lint of changed files and production Docker builds passed. Migration deployed successfully; backend health and web returned HTTP 200, unauthenticated support endpoints returned 401. Browser QA checked unverified and verified Lecturer states, evidence-method disclosure, Vietnamese rendering and mobile width without horizontal overflow. Synthetic local QA account/project were removed after checking; existing accounts/projects were preserved.
