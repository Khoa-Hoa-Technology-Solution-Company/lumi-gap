# Lecturer onboarding and expertise matching

Implemented 7 November 2026. This extends the existing three-step onboarding, shared Academic Profile and Mentor Discovery. Earlier lecturer-applicant matching and Research Integrity Center edits remain intact.

## Data model and onboarding

| Product concept | Persisted source |
| --- | --- |
| Institution and academic position | Existing institution/affiliation, academic role and position workflow. |
| Research fields | Existing `AcademicProfile.expertiseAreas`, populated from onboarding `researchAreas`. |
| Specializations | New `AcademicProfile.researchSpecializations`, the one missing structured distinction. |
| Research topics and interests | Existing `User.researchInterests`, reused for both presentations rather than duplicated. |
| Technologies and skills | Existing `AcademicProfile.skills`. |
| Research keywords | Existing `AcademicProfile.researchKeywords`. |
| Biography and selected publications | Existing biography and featured-work editors. |
| ORCID | Existing `AcademicIdentityLink`, with the separate OAuth integration. |
| Mentoring intent and preferred topics | Existing `supportAvailability` JSON, with `requestedEnabled` intent distinct from actual `enabled` availability. |

The additive migration `20261107101000_lecturer_research_specializations` introduces only an empty-default text array. No historical expertise is reclassified or deleted. It creates no second taxonomy or profile model.

Selecting Lecturer preserves the familiar role → institution/position → research setup sequence. The required setup stays short. Existing searchable field/topic/skill selectors remain; an optional disclosure adds searchable specialization tags, keywords, short biography, mentoring intent and preferred mentoring topics. ORCID and publication curation are offered after setup through the established profile editors, avoiding an OAuth interruption or publication-upload step during onboarding.

Taxonomy suggestions reuse active `ResearchTopic` subfield/topic nodes and existing field suggestions. At most 200 subfields and 300 topics are returned, ordered by local paper count/name. Custom specialization/topic/technology tags stay profile declarations; entering one does not create a taxonomy node or verification evidence. Tag limits, API validation and draft recovery are retained. Older clients can omit the new fields without erasing them on retry.

Profile research sections show fields, specializations, topics/interests, technologies/skills and keywords with an explicit self-declaration explanation. Existing selected works, biography and mentoring controls remain. Expertise visibility also governs specializations, skills and keywords. Editing availability now projects only writable fields, so server `updatedAt` values are not sent to the strict update schema. Unverified lecturers can edit preferred topics/intent while the formal enable control remains unavailable.

## Verification and availability

Onboarding saves mentoring interest, not an active mentor listing. New self-declared lecturers have `enabled: false`; changing role/position does not transfer prior verified authority. A verified lecturer must explicitly enable actual mentoring availability through the existing workflow. Neither self-declared keywords nor ORCID ownership grants lecturer/affiliation/position verification or review capability.

Formal discovery retains the current eligibility rules: active email-verified account, lecturer role and position verified, visible/discoverable profile, availability enabled, no active project membership, no conflicting active relationship/pending request, and the existing cooldown. Existing affiliation verification policies, invitation limits, PRIMARY/SECONDARY slots, planned shortlist and six-day consent requests are unchanged.

## Matching and evidence

The existing deterministic SQL matcher now compares visible fields, specializations, topics/interests, skills and keywords. Explicit project mentoring fields/expertise/methodologies take precedence; original project field/research areas are fallback when no mentoring requirements have been configured. Requested technologies/keywords reuse `mentorshipExpertise`; no duplicate project technology field was added. Project owners can refine these in existing mentor preferences. New projects therefore receive recommendations from their saved research field/areas without automatically sending invitations.

Search remains server-paginated. It supports full text, institution, position, field, topic, specialization and technology. Every expertise-related search/filter/ranking expression first applies profile visibility; hidden data cannot become a matching side channel. Shared terms are labeled declared relevance, not proof of qualification. No LLM, embedding, artificial suitability percentage or publication metric is introduced.

The additional team-only endpoint `GET /api/v1/projects/:id/available-mentors/:mentorId/evidence` checks project membership/open state and current visible/available verified lecturer eligibility. It calls the existing `lecturerMatchEvidence` service. It returns profile/application declaration provenance, relevant available publication titles, public/provider-linked identity evidence and explicit missing evidence. A private/unlisted lecturer profile is not exposed through this endpoint.

The UI loads evidence only after **View matching evidence**, reusing `ApplicantEvidence` instead of querying publications for every search card. It retains **View profile**, the existing candidate shortlist/plan, invitation composer, safe project preview, and separate lecturer accept/decline. Opening evidence never creates a request or grants project access.

Publication attribution remains conservative. Featured work is a self-declared attribution. Canonical local publication links require the existing visible, provider-connected production identity and exact stored author identity; no name matching is used. Sandbox ORCID identities cannot establish production publication authorship. Missing publications or methods are reported as unavailable evidence, not as proof that a lecturer lacks expertise.

## Integration inventory

Backend changes: `prisma/identity.prisma` and the specialization migration; auth onboarding DTO/service and regression fixture; academic-profile DTO/service; mentorship discovery, mentorship controller/routes/service and existing lecturer evidence aggregation. Shared contracts: `user.ts`, `academic-profile.ts`, `project.ts`.

Frontend changes: `academic-profile-onboarding.tsx`, reusable `research-focus-fields.tsx`, profile view/editor, Academic Support search, API client and new `mentor-match-evidence-dialog.tsx`. Existing onboarding/profile/discovery tests were extended. `academic-connections.ts` supplies EN/VI copy for both this feature and ORCID.

New persistence coverage is `lecturer-expertise.persistence.test.ts`. The shared runner is `apps/backend/scripts/test-academic-identity-matching.mjs`. Earlier applicant and integrity migrations/code are separate existing work and have not been overwritten or committed.

## Verification

Previously completed focused suites passed: **101/101 backend integration tests in five files** (19 ORCID, 8 lecturer expertise, 9 onboarding, 57 mentorship workflow, 8 existing evidence tests); **39/39 backend unit/regression tests in five files** (identity CRUD, onboarding schema, Google OAuth, OAuth exchange, PostgreSQL boundary); **103/103 web tests in six files** (identity manager, ORCID callback, shared profile, onboarding, Academic Support, applicant evidence).

Coverage includes self-declared role preservation, deferred availability, retained advanced data on retry, later editing, field privacy, specialization/technology filtering, visible-only explanations, disabled/private/unverified exclusion, outsider rejection, no invitation side effects, and existing mentorship consent/permissions. An old onboarding test fixture needed an approved project summary and retention-aware cleanup, matching current consent and historical-access constraints. Production rules were not weakened to satisfy the test.

The final combined web run passed **244/244 cases in 13 files**, including **104 academic profile/onboarding/ORCID/discovery/i18n cases** and 140 screening regressions. Shared types and backend/web TypeScript checks and production builds passed. Scoped ESLint passed. Browser QA confirmed real onboarding submission and persisted self-declared expertise on desktop/mobile using synthetic local accounts; discovery and provider behavior are covered by automated integration/component tests. Real ORCID credentials were not used. Only the dedicated local test database received migrations. No production secrets, application database, localhost:8080 deployment, commit or push were changed.

## Limits and rollout

This is explicit-term relevance using existing taxonomy/profile declarations and bounded local publication evidence, not semantic understanding or a qualification assessment. Research topics/interests share the existing field. Technology/keyword requirements are entered in existing mentoring expertise preferences; there is no automatic extraction of requirements from private project prose. Suggestions are bounded, with custom tags available for more specific work.

Advanced ORCID linking and selected-publication editing occur after initial setup. Real ORCID consent still needs credentials and registered callback testing; see [ORCID setup](orcid-account-linking.md). Mentoring interest never automatically enables a lecturer after verification.

Rollout requires reviewed additive migrations, Prisma generation, shared-type build, then backend/web deployment together. Keep existing verification and consent policies. Rollback can retain the new column and OAuth uniqueness constraints; do not drop prior identity, mentoring or evidence history. This task has not deployed the feature.
