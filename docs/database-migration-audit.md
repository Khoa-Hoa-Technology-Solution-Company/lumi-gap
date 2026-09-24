# LumiGap MongoDB to PostgreSQL audit

Status: Phase 1 design gate complete. No MongoDB collection has been modified and no data migration has been executed.

## Audit scope and evidence

The audit uses the repository at `codex/academic-profile-forum-mvp` as the source of truth. It inspected all backend model files, services, workers, scripts, DTOs, indexes, `populate` calls, aggregation pipelines, ObjectId construction, direct collection access, and runtime configuration.

Repository totals at the audit point:

- 75 Mongoose models declared in 57 model files.
- 114 TypeScript files with a Mongoose dependency.
- 52 `populate` calls.
- 43 aggregation call sites, dominated by Trends, semantic retrieval, ratings, gap summaries, forum votes, and corpus counts.
- 9 BullMQ workers: sync, OpenAlex ingest, corpus validation, embedding, paper analysis, report, gaps, notification, and AI jobs.
- 3 scheduled BullMQ jobs: scholarly sync, embedding, and structured paper analysis.
- No application-level Mongo session or transaction usage was found.

The existing `EXPECTED_RUNTIME_COLLECTIONS` list in `scripts/lib/mongo-migration.ts` contains only the older core collections and is incomplete for the current repository. It must not be used as the authoritative migration manifest until it is regenerated from the schema below.

## ID and compatibility decision

PostgreSQL rows will use a UUID primary key and an optional, unique `legacyMongoId` containing the original 24-character ObjectId. During the transition:

- repository lookups accept either UUID or ObjectId;
- migrated records are resolved through `legacyMongoId`;
- newly-created records use UUIDs;
- API mappers expose `legacyMongoId ?? id` as the public `id`;
- request validation accepts either a UUID or a 24-character ObjectId;
- JWT claims and existing response envelopes remain unchanged.

This preserves all existing links and clients while allowing native PostgreSQL identifiers for new data. No Mongo `_id` is discarded.

## Model inventory and relational strategy

| Mongo model | Used by | Main relationships | Embedded data | Mongo-specific features | PostgreSQL strategy |
| --- | --- | --- | --- | --- | --- |
| User | Auth, middleware, admin, credits, papers, profiles, projects, reviews | Parent of most user-owned data | interests array | sparse unique Google ID, atomic credit updates | `users`; UUID PK, unique email/Google ID, legacy ID; transactions for balances |
| RefreshToken | Auth, admin | User N:1 | none | TTL index | `refresh_tokens` FK; expiry index plus scheduled cleanup |
| AcademicProfile | Profile, forum, review matching | User 1:1, verifier/rejector users | affiliation, availability, evidence, works, identities | embedded arrays, sparse handle, multikey filters | `academic_profiles`; identities, works and evidence normalized; scalar expertise lists retained where no independent lifecycle exists |
| AcademicProfileHandle | Profile routing | User N:1 historical aliases | none | unique handle | `academic_profile_handles`; unique handle FK to user |
| AcademicEmailVerificationChallenge | Institutional verification | User N:1 | none | TTL and hashed hidden code | `academic_email_verification_challenges`; expiry cleanup and attempt constraints |
| TrustedInstitution | Lecturer verification | referenced by domain/ROR matching | verification policy, domains | multikey domain lookup | institution plus `trusted_institution_domains`; policy JSONB |
| Author | Scholarly catalog | Paper M:N | affiliations | nested external IDs, text index | `authors`, `author_affiliations`, `paper_authors`; external IDs as nullable unique/indexed columns |
| Journal | Scholarly catalog | Paper N:1 | ISSN list | text index, sparse external ID | `journals`; ISSNs in child table; full-text name index |
| Keyword | Scholarly catalog | Paper M:N | none | unique normalized name | `keywords`, `paper_keywords` with detection metadata |
| ResearchTopic | Scholarly taxonomy | self parent, Paper M:N | external IDs | self ObjectId reference | `research_topics` self FK and `paper_topics` |
| Paper | Search, trends, reports, gaps, projects, ingestion | Journal N:1; M:N authors/keywords/topics/projects | AI score/analysis, citation percentile | Atlas vector search, text index, arrays, sparse DOI | `papers` plus relation tables; JSONB only for AI snapshots; `vector(768)` for embedding; PostgreSQL FTS |
| PaperIdentity | Ingestion dedup | Paper N:1, campaign N:1 | none | compound unique provider/value | `paper_identities` with unique `(provider, normalized_value)` |
| PaperSourceRecord | Ingestion audit | Paper N:1, provider N:1 | raw provider response | Mixed raw metadata | `paper_source_records`; `raw_metadata JSONB` |
| PaperQualityCheck | Quality pipeline | Paper 1:1 | none | unique paper | `paper_quality_checks` FK unique |
| PaperDownload | Downloads and credits | User/Paper junction | none | unique user/paper | `paper_downloads` unique `(paper_id,user_id)` |
| PaperTranslation | Translation cache | Paper N:1 | none | five-column cache unique key | `paper_translations` with equivalent composite unique constraint |
| PaperReview | AI paper review | User N:1, optional Paper | scores/profile/review payload | Mixed objects | `paper_reviews`; structured snapshots in JSONB |
| PaperFormatCheck | Format checker | User N:1 | measurements/report | Mixed measurements | `paper_format_checks`; measurements JSONB |
| Bookmark | Bookmark APIs, reports, home | User plus polymorphic Paper/Report | none | polymorphic ObjectId and compound unique | split nullable `paper_id`/`report_id`, CHECK exactly one target, partial unique constraints |
| Report | RAG reports, workers, home, quality | User, Project, CreditTransaction; M:N papers | scope filters, research-gap snapshots | ObjectId arrays, status sweeps | `reports`, `report_grounding_papers`, `report_selected_papers`; scope filters JSONB; report gap snapshots JSONB |
| RagQuery | RAG audit | Report/User; M:N retrieved papers | bounded retrieved results, filters | embedded ranked results | `rag_queries` plus `rag_query_results` to preserve rank/score |
| GapAnalysis | Gap worker/pipeline | User, Project, CreditTransaction; M:N selected papers/gaps | none | ObjectId arrays, lease/status sweeps | `gap_analyses`, selected-paper junction; produced gaps via FK |
| ResearchGap | Gap APIs, forum, quality, validation | User, Project, Report/Analysis, Corpus; M:N evidence papers | probe/count/trend snapshot | ObjectId arrays, aggregation | `research_gaps`; evidence/support paper junctions; probe metrics as typed columns/JSONB where immutable |
| GapDirections | Gap AI suggestions | ResearchGap 1:1, CreditTransaction | direction list | embedded paper ID lists, upsert | `gap_directions` plus direction items and related-paper junction |
| GapEvidenceRecord | Gap validation | Gap, Paper, User | none | compound unique | `gap_evidence_records` unique `(gap_id,paper_id,evidence_kind)` |
| GapValidation | Gap validation audit | Gap/User | none | immutable document | append-only `gap_validations`; update/delete denied in repository |
| Project | Project APIs, chat, reports, reviews | Owner; M:N users and papers | members/papers arrays | `refPath`, `$push`/`$pull`, membership queries | `projects`, `project_members`, `project_papers` with unique junction keys |
| ProjectChatMessage | AI project chat | Project/User/CreditTransaction; M:N cited papers | cited IDs | ObjectId array | `project_chat_messages`, `project_chat_citations` |
| ProjectTeamMessage | Team chat | Project/Sender; M:N readers | readBy array | `$addToSet`, soft delete | `project_team_messages`, `project_team_message_reads`; soft-delete columns retained |
| ProjectContributionProposal | Contribution confirmation | Project, contributor, actors | history | partial unique for active proposals | proposal table plus history table; partial unique index via SQL migration |
| RecruitmentOpening | Recruitment | Project/User | requirements | counters updated with application | `recruitment_openings`; requirements scalar list; acceptance transaction |
| RecruitmentApplication | Recruitment | Opening/Project/Applicant/decider | skills | compound unique | `recruitment_applications` unique `(opening_id,applicant_id)` |
| DraftWorkspace | Collaborative drafting | Project 1:1, creator; M:N members | member IDs | ObjectId array | `draft_workspaces`, `draft_workspace_members` |
| WorkspaceSection | Drafting | Workspace/users | content | optimistic version updates | `workspace_sections`; `(id,version)` conditional update |
| SectionRevision | Draft audit | Workspace/Section/User | immutable content snapshot | immutable schema | append-only `section_revisions` unique `(section_id,version)` |
| WorkspaceComment | Drafting | Workspace/Section/User | none | populate author | `workspace_comments` with explicit FKs |
| Submission | Submission workflow | Project/User; M:N authors/conflicts | research questions/keywords | ObjectId arrays, status filters | `submissions`, `submission_authors`, `submission_declared_conflicts`; keywords/questions as scalar lists |
| SubmissionRevision | Submission workflow/storage | Submission/User | immutable file metadata | immutable fields, checksum unique by revision | append-only `submission_revisions` unique `(submission_id,revision_number)` |
| ReviewerAssignment | Review workflow | Submission/reviewer/assigner | conflict check snapshot | hidden anonymous code, compound unique | `reviewer_assignments`; unique assignment and anonymous code |
| AiPreReview | Submission AI support | Submission/User | structured AI results | Mixed/array result snapshots | `ai_pre_reviews`; output sections JSONB, lifecycle columns relational |
| ReviewConflict | Review assignment | Submission/Reviewer/resolver | none | compound unique | `review_conflicts` unique `(submission_id,reviewer_id)` |
| ReviewTemplate | Human review | criteria 1:N | none | version/status indexes | `review_templates` |
| ReviewCriterion | Human review | Template N:1 | none | unique template/key | `review_criteria` unique `(template_id,key)` |
| HumanReview | Human review | Assignment 1:1, reviewer, submission, revision, template | none | unique assignment | `human_reviews` unique assignment FK |
| ReviewResponse | Human review | Review N:1 | none | unique review/criterion key | `review_responses` unique `(review_id,criterion_key)` |
| Contribution | Public contribution archive | User, Project, Submission, source assignment/proposal | none | sparse/partial unique source constraints | `research_contributions`; partial unique indexes via SQL migration |
| LiteratureCorpus | Evidence workflow | User, Project | PICOC, keywords | embedded PICOC | `literature_corpora`; PICOC typed columns, keywords scalar list |
| CorpusPaper | Evidence workflow | Corpus/Paper/User | evidence extraction | compound unique, evidence object | `corpus_papers`; evidence snapshot JSONB or typed columns; unique corpus/paper |
| Community | Community APIs/forum | Owner; memberships/posts | topics/rules | Mongo text index | `communities`; arrays for display-only strings; generated FTS vector/index |
| CommunityMembership | Community permissions | Community/User junction | none | compound unique | `community_memberships` unique `(community_id,user_id)` |
| ForumPost | Forum | User, Community, Gap, Project; M:N papers | references/tags | duplicate compatibility fields, counters | `forum_posts`, paper junction and reference table; retain API aliases in mapper, not duplicate DB columns |
| ForumComment | Forum | Post/User/self parent | references | self reference, counters | `forum_comments`, comment references; self FK |
| ForumVote | Forum | User plus polymorphic post/comment | none | polymorphic target, aggregation, unique | nullable post/comment FKs with CHECK; partial unique constraints |
| ContentReport | Moderation | User, Community, reviewer; post/comment target | none | partial unique open reports | nullable post/comment FKs, CHECK, partial unique SQL index |
| CreditTransaction | Credit ledger | User, optional refund transaction, polymorphic target | metadata | atomic balance update/idempotency unique | append-only `credit_transactions`; idempotency unique; balance mutation and ledger row in one transaction |
| PaymentOrder | PayOS | User | none | unique numeric order code | `payment_orders` with unique order code |
| Notification | Notification APIs/worker | optional User/Role/Paper; polymorphic target | readBy array | role broadcast and per-user read semantics | `notifications`, `notification_reads`; keep target kind/public target ID for polymorphism |
| DeviceToken | Push notification worker | User N:1 | none | unique token | `device_tokens` unique token and active index |
| QualityEvaluation | Evaluation | polymorphic report/gap/paper | none | unique polymorphic target | nullable target FKs plus CHECK and partial unique indexes |
| UserRating | Ratings/points | User plus report/gap/paper | none | aggregation and polymorphic unique | nullable target FKs plus CHECK; unique per user/target |
| SearchLog | Analytics/home | optional User | filters | 90-day TTL | `search_logs`; filters JSONB; scheduled retention cleanup |
| AuditLog | Cross-cutting audit | optional User, polymorphic target | details | 90-day TTL | `audit_logs`; details JSONB; scheduled retention cleanup |
| McpToolRun | MCP report tooling | optional Report/User | input/output | Mixed payloads, 90-day TTL | `mcp_tool_runs`; input/output JSONB; scheduled retention cleanup |
| AiRun | BullMQ AI jobs | User, Project, Workspace | evidence ID list | queue/status conditional updates | `ai_runs`, `ai_run_evidence`; shared Prisma client per worker process |
| TrendExplanation | Trends | User | scope filters/explanation | Mixed payloads | `trend_explanations`; JSONB snapshots and query indexes |
| ApiProvider | Sync/ingestion | configs/runs/source records | none | unique provider name | `api_providers` |
| ApiSyncConfig | Legacy sync scheduling | Provider/User | none | currently no service reads | migrate because persisted/runtime model exists; mark for post-cutover dead-code review |
| ApiSyncRun | Sync/admin/pipeline/home | Provider/Config | counters | latest-run sort | `api_sync_runs` |
| OpenAlexIngestCampaign | Large ingest | partitions, attempts, memberships | manifest/progress | immutable keys, nested counters | `openalex_ingest_campaigns`; manifest JSONB, progress typed columns |
| OpenAlexIngestPartition | Large ingest | Campaign | checkpoint/lease | atomic leases and nested updates | `openalex_ingest_partitions`; typed lease/checkpoint columns and compare-and-swap update |
| OpenAlexIngestPageAttempt | Large ingest | Campaign/Partition | none | idempotency compound unique | `openalex_ingest_page_attempts` unique `(partition_id,idempotency_key)` |
| IngestDeadLetter | Large ingest | Campaign/Partition/Attempt | details | Mixed details | `ingest_dead_letters`; details JSONB |
| CorpusValidationRun | Validation worker | Campaign | metrics/checks | sparse unique active key, idempotency | `corpus_validation_runs`; metrics/checks JSONB; partial unique active key |
| OpenAlexRefreshWatermark | Refresh coordinator | optional Campaign | none | unique policy key | `openalex_refresh_watermarks` |
| PaperCohortMembership | Ingest provenance | Paper/Campaign | none | four-column analytics indexes | `paper_cohort_memberships`; equivalent composite unique/indexes |

## Embedded-document decisions

Normalize when the embedded object contains an ID, is independently filtered, participates in authorization, has a uniqueness rule, or is updated independently. This applies to paper authors/topics/keywords, project memberships/papers, report evidence papers, submission authors/conflicts, profile identities/works/evidence, chat reads/citations, and forum targets.

Keep JSONB for immutable or naturally document-shaped snapshots that are not joined relationally: raw provider responses, AI analysis output, AI review output, validation metrics/checks, audit details, trend explanation payloads, and flexible third-party metadata. Scalar display tags may remain PostgreSQL arrays; no relational IDs are stored in arrays.

## Mongo-specific dependency inventory

### Populate

`populate` is used by workspace comments, submissions and reviewer assignments, corpora, communities, forum posts/comments, quality ratings, gap evidence/validation, recruitment, paper request administration, contribution proposals, projects, and team chat. Prisma replacements must use explicit `select`/`include`, with batched relation queries for list endpoints to avoid N+1 behavior.

### Aggregations

- Semantic retrieval: Atlas `$vectorSearch` plus metadata filters and keyword fallback. Replace with parameterized pgvector cosine-distance SQL and PostgreSQL FTS fallback.
- Trends: unwind/group/facet operations over embedded paper topics/authors/keywords and citation bands. Replace with joins, CTEs, conditional aggregates, and window functions.
- Ratings/quality: average and count grouped by polymorphic target. Replace with aggregate queries over target-specific FKs.
- Forum votes: sum vote values. Replace with `SUM(value)` grouped by target.
- Literature: corpus paper counts. Replace with `GROUP BY corpus_id`.
- Research gaps: validation summaries. Replace with grouped joins.

All raw SQL must use Prisma tagged templates or parameter placeholders. User-controlled identifiers are never interpolated into SQL strings.

### TTL behavior

Mongo TTL indexes exist for refresh tokens, institutional-email challenges, search logs, audit logs, and MCP tool runs. PostgreSQL has no direct TTL index. A single idempotent BullMQ retention job should delete bounded batches using indexed timestamps. Authentication still checks `expires_at` synchronously, so cleanup timing cannot extend token validity.

### Atomicity and concurrency

No Mongo session transaction is currently used. PostgreSQL migration must add transactions for:

- credit balance mutation plus ledger creation/refund;
- recruitment acceptance plus project membership/capacity update;
- project membership and contribution confirmation;
- forum vote plus cached score update;
- submission revision plus current revision pointer/status;
- reviewer assignment/conflict checks/status transition;
- payment confirmation plus credit reward;
- ingestion page commit, checkpoint, identity upsert and campaign counters;
- notification read state when counters are updated.

Use unique constraints and conditional updates as the final race-condition boundary, not check-then-write logic.

## Search and pgvector decision

The repository explicitly configures Gemini embeddings at 768 dimensions (`GEMINI_EMBEDDING_DIMENSIONS`, default 768) and the paper model documents the same dimension. The PostgreSQL column is therefore `vector(768)`.

Migration validation must fail a paper embedding record when the stored array length is not 768; it must not silently truncate or pad vectors. The source paper can still migrate without an embedding only if the failure is recorded and the verification report is non-successful until the embedding is regenerated or corrected.

Initial semantic query strategy:

1. filter active/eligible papers using relational predicates;
2. order by cosine distance (`embedding <=> query::vector`);
3. preserve the current score and pagination response shape;
4. use PostgreSQL weighted FTS over title and abstract as keyword fallback;
5. retain application reranking behavior.

Create an HNSW index only after the migration rehearsal confirms pgvector version and representative corpus size. For small local/test corpora, exact search is preferable. The initial SQL migration enables `vector` and creates the column, but index creation is a separately documented, reversible migration.

## Index and constraint risks requiring preflight checks

- Duplicate non-null DOI, OpenAlex author ID, Google ID, handles, device tokens, order codes, and idempotency keys must be reported before unique constraints are applied.
- Mongo sparse unique indexes map to PostgreSQL nullable unique constraints, except partial business rules that require explicit partial SQL indexes.
- Polymorphic records must have exactly one target FK after resolution; unresolved targets are migration failures, not silently-null rows.
- Project embedded member/paper duplicates must be detected before populating junction tables.
- Cached counters (`memberCount`, votes, comments, ratings, acceptedCount, ingest progress) must be recomputed and compared after migration.
- Decimal monetary values are not currently present; VND order amount and credits are integers. AI cost uses a decimal column, not floating-point.
- `credits`, counters, sizes, and point totals require integer range checks before selecting PostgreSQL integer widths.

## Migration dependency order

1. Users, trusted institutions, providers, journals, authors, keywords, research topics.
2. Papers and paper relation tables; identities, source records, quality, translations.
3. Academic profiles and profile child records.
4. Projects, project members, project papers, communities and memberships.
5. Reports/RAG, gaps/literature, bookmarks and ratings.
6. Recruitment, workspaces, submissions/revisions, reviewer assignments/reviews.
7. Forum and moderation.
8. Credits, payment orders, downloads and review/format histories (ledger ordering preserved by timestamp and legacy ID).
9. Notifications, chats, contributions and AI runs.
10. Sync/ingestion campaigns, partitions, attempts, cohorts, watermarks, validation and dead letters.
11. Analytics, audit and MCP operational history.

Circular references such as `Submission.currentRevisionId`, report credit transaction links, and self-references are applied in a deferred relationship pass after both parent rows exist.

## Migration tool requirements

The migration tool will:

- require separate `MIGRATION_SOURCE_MONGODB_URI` and `DATABASE_URL` values;
- refuse to run when source and target safety markers are missing;
- read MongoDB without mutations;
- persist ObjectId-to-UUID mappings in PostgreSQL rather than process memory only;
- migrate in bounded batches with per-model checkpoints;
- use upsert keyed by `legacyMongoId` for resumability;
- record every failure with model, source ID, phase and sanitized error;
- preserve source timestamps and status values;
- never delete MongoDB data;
- produce counts, fingerprints where practical, orphan checks, counter reconciliation, and vector-dimension checks.

## Principal risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| API IDs change from ObjectId to UUID | Critical | dual-ID resolver and compatibility mapper |
| Invalid/orphan ObjectId references | Critical | preflight report, failure ledger, deferred FK pass |
| Credit/payment double application | Critical | serializable/row-lock transaction and idempotency constraints |
| Atlas vector behavior differs from pgvector | High | score-contract tests, metadata-filter tests, FTS fallback tests |
| Embedded project/profile/forum data loses order or metadata | High | explicit position/order columns and mapping verification |
| Partial unique constraints unsupported in Prisma schema syntax | High | reviewed raw SQL migrations plus schema comments/tests |
| Ingestion throughput regresses | High | bounded `createMany`/upsert batches and short transactions |
| TTL data grows indefinitely | Medium | scheduled bounded retention worker |
| Existing migration inventory misses new collections | High | generated authoritative manifest and verification coverage |
| Runtime creates a Prisma client per BullMQ job | High | singleton client per process and worker shutdown hook |

## Design gate result

The migration is feasible without changing REST contracts or removing Redis/BullMQ/FastAPI. The approved target is a normalized PostgreSQL schema with UUID primary keys, preserved legacy ObjectIds, Prisma for normal data access, parameterized SQL for pgvector/FTS/analytics, and JSONB limited to immutable or provider-defined snapshots.

MongoDB remains the source of record until PostgreSQL schema migration, data migration, verification, API regression tests, worker tests, and cutover rehearsal all pass. Cleanup/removal of Mongoose is explicitly deferred to the final phase.
