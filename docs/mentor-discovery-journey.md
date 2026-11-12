# Lecturer expertise and mentor discovery journey

Implementation audit and delivery, 11 November 2026.

## Audit before changes

| Requirement | Existing behavior | Change |
| --- | --- | --- |
| Academic identity, institutions/ROR, position verification | Implemented in shared Academic Profile and onboarding | Reused. No new identity or verification system. |
| Lecturer expertise | Fields, specializations, skills and keywords stored as text; topics and interests shared one array | Added validated references to the existing research catalogue for expertise. Kept current interests and supervision preferences separate. |
| OpenAlex taxonomy | Existing synchronized `ResearchTopic` tree, aliases and admin catalogue | Exposed a bounded authenticated search for normal users. Reused the tree, without generating example OpenAlex IDs. |
| Technical skills | Suggested text tags | Added a versioned controlled vocabulary, separate from the academic hierarchy, with exact curated synonyms. Custom strings remain valid. |
| Project creation | Private by default, stable creation key, optional research direction | Added the same classification selector and persisted references. Mentor preferences inherit these selections. |
| Discovery | Verified/available lecturer filtering; flat text overlap and institution tie-break | Added topic-first, explainable ranking and canonical filters; removed institution from automatic ranking. |
| Invitations | Owner-only, Primary/Secondary roles, six-day expiry, role locks, idempotency, cooldown, immutable sent preview | Reused. Included only an owner-approved classification snapshot and structured support needs. |
| Acceptance and access | Transactional consent, effective policies, resource sharing, scoped workspace, revocation | Reused and regression-tested. Acceptance does not create project membership. |
| Topic suggestions | Missing in this journey | Added consent-gated OpenAlex classification on the existing AI worker, with local catalogue fallback. |

Historical compatibility risks were text-only profiles, older clients omitting new
fields, sent invitation snapshots, and research data becoming public accidentally.
No historical text, invitation, relationship or access event is rewritten. Omitted
classification fields preserve existing values. Legacy terms still display and match.

## Canonical model

The existing `ResearchTopic` tree remains the single academic catalogue:
Domain → Field → Subfield → Topic. Its UUID is the local reference; `openalexId`
is the provider identifier within a level. A reference snapshot contains the label,
parent UUID, aliases, source, optional Vietnamese label, optional source version,
and synchronization timestamp. Ancestors are resolved by the server. Clients submit
only bounded ID arrays, never authoritative labels, provider IDs or verification flags.

`AcademicProfile.researchClassification` and `Project.researchClassification` store
selected node IDs, local keyword IDs and controlled skill IDs with authoritative
metadata. Keywords use the existing `Keyword` model, extended with optional OpenAlex
identity and synchronization provenance. Older keywords remain explicitly local.
Skills use `TECHNICAL_SKILLS` and `RESEARCH_VOCABULARY_VERSION` in shared types.
Normalization accepts exact curated equivalents such as CV/Computer Vision and
PyTorch/pytorch. It does not fuzzy-merge unrelated names or infer technologies from
short ambiguous fragments.

The project stores `mentorshipClassification` as an **approved sharing snapshot**,
not a second taxonomy or independent editable expertise source. Creating or privately
editing project classification does not publish that data. Saving mentor preferences
explicitly approves the shared snapshot. Each sent invitation continues retaining
its own existing immutable brief snapshot. `mentorshipSupportTypes` reuses existing
academic support types rather than a new lifecycle or role enum.

## Forms and profile

| Lecturer setup | Source / behavior |
| --- | --- |
| Role, institution, program/position, department and verification | Existing onboarding and Academic Profile; existing institution/ROR suggestions remain. |
| Research fields/subfields/topics | Shared searchable catalogue with hierarchical context. Explicitly self-declared. |
| Technologies/methods | Separate controlled skill selector. Existing custom skill tags remain available. |
| Keywords | Existing keyword catalogue and legacy/custom keyword tags. |
| Current interests | Existing `User.researchInterests`; no longer presented as canonical expertise topics. |
| Willingness to supervise | Existing support availability, independent preferred topics, canonical preferred topic IDs, and support types. |
| Formal availability | Existing verified-lecturer opt-in. Onboarding records intent and cannot grant verification or enable a new lecturer automatically. |
| Biography, publications, ORCID | Existing optional editors and linking workflows, available after initial setup. |

The familiar three-step onboarding stays concise. Advanced expertise and mentoring
preferences are optional disclosures. Catalogue results load when opened or searched;
selected tags remain visible. Searches debounce and return bounded results, with
retry and offline-safe draft behavior. The same components are used in later profile
editing, project creation and mentor preferences. Custom requirements are grouped
under an optional disclosure rather than requiring repeated canonical entry.

Project creation preserves the current minimum validation (title), private default
and idempotency behavior; it does not suddenly require a full abstract or break older
clients. Optional classification can be added there or completed in mentor preferences.
The existing research plan remains authoritative for problem, research questions and
approach. Private plan text is never automatically copied to an invitation. Sending
a formal invitation retains the existing approved-summary requirement: at least
30 characters and five words.

Profile expertise privacy also redacts the entire canonical classification. Hidden
expertise cannot participate in candidate search, filters, ranking or explanations.
Selecting Lecturer, declaring expertise, or linking ORCID never proves lecturer
authority, affiliation or expertise. Current verification and role-change invalidation
continue to apply.

## Matching and invitation rules

Hard filters retain active accounts, verified email, verified lecturer role/position,
visible/discoverable profile and explicit mentoring availability. Collaboration-disabled
profiles are excluded and cannot receive a new direct invitation. Project owner,
active members, active mentors, pending requests and cooldown pairs are excluded as
appropriate. Invitation role capacity is still enforced transactionally by the existing
recruitment plan and position service.

The deterministic SQL ordering is lexicographic, not a suitability percentage:

1. Shared canonical topics.
2. Shared subfields and exact legacy specializations.
3. Shared fields and exact legacy field terms.
4. Shared controlled technical skills and curated legacy synonyms.
5. Relevant declared interests/keywords and canonical keyword IDs.
6. Topics the lecturer is currently willing to supervise.
7. Shared structured support needs.
8. Stable name and ID tie-breaks.

Institution is informational, not an automatic advantage. Explanations name actual
shared topics, subfields, fields, skills, interests and support types, plus missing
topic/technology evidence. Labels are Highly Relevant, Relevant or Potential Match.
They describe declared relevance, not a certification or assessment of teaching quality.
The existing optional evidence dialog now includes canonical declarations while keeping
publication authorship and verified identities distinct. No semantic score or citation
ranking was introduced.

Existing transitions are unchanged:

`PENDING → ACCEPTED / DECLINED / CANCELED_BY_PROJECT / EXPIRED`.

Acceptance creates exactly one `ACTIVE` relationship and links the agreed access
policy; ending it changes the relationship to `ENDED`. Position states and candidate
states remain separate. Maximum two active mentors, one pending invitation per role,
six-day expiry, existing cooldown and request limits remain. Turning off availability
blocks new invitations/recommendations but, under the existing policy, does not cancel
already pending consent or active relationships.

Recipients see the sent approved introduction, classification, support needs, role,
message, attachments and proposed scope. Before acceptance there is no general
project access. Acceptance preserves the existing access-version checks, locks,
audit events and notifications. The accepted lecturer opens the scoped Academic Support
Workspace; papers, internal chat, datasets and LaTeX sources are not automatically shared.

## Optional topic suggestions

OpenAlex documentation was checked before implementation:
[hierarchy](https://help.openalex.org/data/topics/) and
[text classification contract](https://help.openalex.org/api/tag-aboutness/).

The user must save the approved title/abstract and explicitly authorize transmission.
The UI discloses OpenAlex and possible provider costs. Only that approved text is sent,
using POST to the fixed `/text` endpoint with classifier version 2. Title and abstract
together are limited to 2,000 characters. No private project description is substituted.

The existing `aiJobsQueue` and `worker:ai-jobs` process the request. Owner authorization
and the approved text hash are checked again before network use. A distributed gate
limits this classifier integration to one request/second. Results are cached for one
hour with project/user/input scope. Queue records are retained for one hour with bounded
counts. Status reads authorize the owner and never return queue payloads. Provider
bodies, text and credentials are not logged. Network/provider/schema failures produce
local catalogue suggestions, clearly labeled Local catalogue. A busy rate gate retries
through BullMQ rather than making another billable call immediately.

Provider IDs and hierarchy are validated before import into the existing catalogue.
Hidden nodes remain hidden and admin aliases/status are not overwritten. Suggestions
only become project selections when the user chooses them and saves. Curated technologies
found explicitly in the approved text can be suggested independently of OpenAlex topics.
No new LLM client, worker service or profile platform was introduced.

New routes:

- `GET /api/v1/research-catalog?level=field|subfield|topic|keyword|skill&q=...`
- `POST /api/v1/projects/:id/mentorship-topic-suggestions`
- `GET /api/v1/projects/:id/mentorship-topic-suggestions/:jobId`

Existing auth, profile, project, discovery, invitation and resource-sharing routes carry
the additive fields. Existing API envelope, rate limiter and permission checks are reused.

## Migrations and rollout

Three handwritten additive migrations:

- `20261111090000_shared_research_classification`
- `20261111091000_mentorship_support_preferences`
- `20261111092000_keyword_classification_provenance`

They add default-empty data and catalogue provenance, with no destructive backfill.
Apply reviewed migrations, generate Prisma, build shared types, then backend/web and
the existing AI worker together. Existing `OPENALEX_API_KEY` and `OPENALEX_MAILTO`
configuration is reused; no new environment variable or production secret is required.
The AI worker must run for queued suggestions. Search and manual classification do
not require that worker or an external provider.

All migrations and test mutations for this task use the local isolated
`lumigap_mentor_journey_test` database. No application/production migration, deployment,
commit or push is part of this task. No live private text was sent to OpenAlex.

## Verification

Phase 1: 89 backend regression cases and 57 frontend cases passed. Phase 2: 97 backend
regression cases, 40 unit cases and 98 frontend cases passed. The backend runner includes
real PostgreSQL scenarios plus the existing eight pure evidence regressions.

Final access/browser/build results and file inventory are recorded in the accompanying
[verification report](mentor-discovery-journey-verification.md). Provider responses are
mocked for automated checks; live OpenAlex billing/credentials have not been exercised.

Reproduce:

```powershell
node apps/backend/scripts/test-mentor-journey.mjs --env-file D:\lumi-gap\.env
node apps/backend/scripts/test-mentor-journey.mjs --env-file D:\lumi-gap\.env --access-only
```
