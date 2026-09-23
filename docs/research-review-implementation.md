# LumiGap research-review implementation

## Architecture decision

The active repository uses MongoDB with Mongoose. This implementation preserves that production architecture instead of introducing a second PostgreSQL persistence layer. The domain boundaries and constraints requested by the product specification are represented with Mongoose schemas, compound indexes, validation, services and idempotent migration scripts.

## Implemented domain flow

`Academic profile → reviewer opt-in → structured submission → immutable revision → advisory AI pre-review → double-blind human review → verified LumiGap contribution`

Candidate research gaps additionally support:

`PICOC scope → literature corpus → structured per-study evidence → evidence map → candidate → supporting/counter evidence → validation request → append-only expert validation history`

Gap confidence and research priority are separate fields. AI-assisted candidates are not automatically marked validated.

## Backend endpoints

### Reviewer availability and opportunities

- `GET /api/v1/review-availability/me`
- `PUT /api/v1/review-availability/me`
- `GET /api/v1/review-opportunities`
- `POST /api/v1/review-opportunities/:submissionId/accept`
- `POST /api/v1/review-opportunities/:submissionId/conflicts`
- `GET /api/v1/reviews`
- `GET /api/v1/reviews/:assignmentId`
- `PUT /api/v1/reviews/:assignmentId`
- `POST /api/v1/reviews/:assignmentId/submit`

Only Lecturer and Researcher academic profiles can opt in. Opportunity acceptance checks explicit availability, temporary pauses, maximum active workload, authorship, declared conflicts, existing assignments and project contribution. Author information is not returned in opportunity DTOs.

### Structured submissions and revisions

- `GET /api/v1/submissions`
- `POST /api/v1/submissions`
- `GET /api/v1/submissions/:id`
- `POST /api/v1/submissions/:id/revisions`
- `GET /api/v1/submissions/:id/revisions`
- `GET /api/v1/submissions/:id/revisions/:revisionId/download`
- `GET /api/v1/submissions/:id/ai-pre-reviews`
- `POST /api/v1/submissions/:id/ai-pre-review`

Submission metadata now supports type, field, goal, research questions, claimed gap, claimed contribution, methodology, scope, keywords and expected workload. Existing PDF restrictions, SHA-256 checksums, storage abstraction and immutable revision fields are retained.

### Contributions

- `GET /api/v1/contributions/users/:userId`

A `VERIFIED_BY_LUMIGAP` review contribution is created only after the assigned reviewer submits every rubric criterion. `sourceReviewAssignmentId` is unique, so retrying cannot create duplicate verified claims.

Project-level contribution management adds:

- `GET /api/v1/projects/:id/contributions`
- `POST /api/v1/projects/:id/contributions/proposals`
- `POST /api/v1/projects/:id/contributions/:proposalId/confirm`
- `POST /api/v1/projects/:id/contributions/:proposalId/reject`

A self-proposed contribution requires project-owner confirmation. A role proposed by an owner for another member requires that contributor's confirmation. The proposer cannot confirm the same record. Each confirmed role creates one idempotent `PROJECT_CONFIRMATION` contribution; confirmation explicitly does not grant authorship.

### Literature corpus and evidence map

- `GET /api/v1/literature/corpora`
- `POST /api/v1/literature/corpora`
- `GET /api/v1/literature/corpora/:id`
- `POST /api/v1/literature/corpora/:id/papers`
- `DELETE /api/v1/literature/corpora/:id/papers/:paperId`
- `GET /api/v1/literature/corpora/:id/evidence-map`

Corpora store research goal, domain, keywords, PICOC scope and search strategy. Corpus records can reference only existing active LumiGap papers. Per-study fields cover problem, objectives, population, context, intervention, comparison, outcome, methodology, dataset, findings, limitations, future work, contribution type and research type. The evidence map is a deterministic aggregation of recorded fields by methodology, context, outcome, research type and publication year.

### Evidence-backed research gaps

- `POST /api/v1/gaps/candidates`
- `POST /api/v1/gaps/:id/request-validation`
- `POST /api/v1/gaps/:id/evidence`
- `GET /api/v1/gaps/:id/evidence`
- `POST /api/v1/gaps/:id/validations`
- `GET /api/v1/gaps/:id/validations`

Evidence must reference an existing LumiGap paper. Supporting and counter-evidence are stored separately. Expert validation is append-only, cannot be performed by the candidate owner, and is restricted to Lecturer/Researcher profiles.

## Frontend routes

- `/review-opportunities` — opt-in settings, capacity and matched double-blind opportunities.
- `/reviews` — active and completed reviewer dashboard.
- `/reviews/:assignmentId` — qualitative rubric workspace and immutable submission action.
- `/submissions` — current user's structured submissions.
- `/submissions/new` — structured academic claim plus PDF revision 1.
- `/submissions/:id` — claim details, AI advisory analysis and revision timeline.
- `/profile/:handle/contributions` — public chronological contribution archive with filters.
- `/research-gap/discover` — PICOC scope, literature corpus curation, per-study evidence map and human-authored candidate gap creation.
- `/projects/:id` Contributions tab — role proposal, counterparty confirmation/rejection, history and verified contribution creation.

The Workspace navigation group links to Submissions, My Reviews and Review Opportunities.

Academic profiles support `PUBLIC`, `MEMBERS_ONLY` and `PRIVATE` visibility. The backend enforces the same policy for full profiles, compact summaries and cover images. Public responses omit institutional email, verification evidence and private reviewer workload/preferences; hiding controls in the frontend is not treated as authorization.

## AI service contract

FastAPI exposes `POST /internal/pre-review`, protected by `X-Internal-Key`. It accepts structured submission fields and only server-resolved evidence records. Gemini output is constrained by a JSON schema, and the service rejects any evidence ID that was not present in the request.

The Node backend persists AI analysis separately from human reviews in `ai_pre_reviews`. If the AI service or Gemini key is unavailable, the request fails and the submission returns to its previous workflow status. No successful verification is faked.

Current limitation: the first integration sends structured submission claims but does not yet extract full manuscript text from remote object storage. The AI response must therefore disclose this limitation. Full PDF text extraction should be added through the storage service before treating manuscript-section coverage as available.

Required production configuration already used by the service:

- `AI_REVIEWER_URL`
- `INTERNAL_SERVICE_KEY`
- Gemini API key configured in the AI reviewer's encrypted settings store

## Migration and development data

Run after MongoDB is available:

```powershell
pnpm --filter backend research-review:migrate
```

This backfills only missing reviewer defaults and the backward-compatible `PUBLIC` profile visibility, seeds the versioned default rubric, and synchronizes review, contribution, corpus and evidence indexes. It does not overwrite existing workload preferences or an existing visibility choice.

Optional non-production demo data:

```powershell
$env:DEMO_PASSWORD = "choose-a-local-password"
pnpm --filter backend research-review:seed-demo
```

The demo seed is idempotent and explicitly labels its manuscript and gap as development data. It does not invent papers, DOI values or external verification. It is blocked when `NODE_ENV=production`.

## Deliberately unfinished

- Production ORCID OAuth remains credential-dependent and is not represented as verified without OAuth evidence.
- Full manuscript extraction and related-paper resolution for AI pre-review are not complete.
- Section-level manuscript suggestions/comments are not yet connected to the new review rubric; the existing Draft Workspace remains separate.
- Notification/deadline scheduling for assignments is not yet implemented.
- Evidence import remains manual from papers already in LumiGap; automatic database query execution and deduplication are not implemented.
- Evidence-map output is an MVP grouped table/card view, not a multidimensional visualization.
- Project contribution confirmation is application-level idempotent. Deployments requiring cross-document atomicity should enable MongoDB transactions on a replica set.

OpenAPI now documents the new literature, candidate-gap, reviewer availability/opportunity, AI pre-review and project-contribution groups at a concise contract level. It does not yet contain every response schema field.
