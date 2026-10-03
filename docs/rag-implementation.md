# Full-text RAG and paper knowledge graph

## Implementation checklist

- [x] PostgreSQL documents, page chunks, embeddings, entities and grounded relations.
- [x] Bounded PDF extraction through the existing Python service; local/object storage and public open-access PDF sources.
- [x] Queue ingestion and reindexing for approved papers; provenance, failure states and source invalidation.
- [x] Retrieve passage evidence within the approved paper/project scope for reports and gaps.
- [x] Expose indexing status, source excerpts and the knowledge graph in the paper UI.
- [x] Verify extraction, grounding, ingestion failure/replay, retrieval scope, prompts and typecheck.
- [ ] Apply migrations and run the live PostgreSQL/Redis/Gemini end-to-end smoke below.

## Contract

Only active papers enter the shared corpus. Draft submissions do not enter public retrieval. A stored PDF takes precedence over an open-access PDF URL; metadata-only papers use their abstract and disclose that scope. PDF extraction preserves page numbers and rejects scanned/encrypted/oversized documents rather than inventing text. Every graph relation includes an exact source quote and chunk reference. Graph nodes represent extracted methods, datasets, findings, limitations, future work and concepts; they are stored in PostgreSQL.

Indexing runs in the existing `paper-analysis` BullMQ worker. Document changes replace chunks and relations atomically; source fingerprints guard against obsolete jobs. Retrieval selects chunks only from the evidence paper set already authorized and filtered by report/gap services. Content hashes participate in generation caches. AI-suggested gaps remain candidates rather than proof that literature outside this corpus is absent.

The Python AI reviewer must be deployed with the new `/internal/extract-text` endpoint. Apply the Prisma migration before starting API/workers. Existing paper analysis cron backfills approved papers; users can explicitly request indexing from paper detail. OCR and publisher paywall bypass are outside this implementation.

## API and UI

- Authenticated `GET /api/v1/papers/:id/knowledge` returns indexing status, warnings, nodes, quote-backed edges and the first 12 passages.
- Authenticated `POST /api/v1/papers/:id/knowledge` with `{ "force": false }` queues indexing and returns HTTP 202 immediately. Requests are limited to 10 per hour per user; a recent queued/processing index is not duplicated. `force: true` refreshes a ready index, including retrying an open-access PDF previously unavailable.
- Active paper detail displays status, index/retry/refresh actions, page excerpts and graph relationships. Uploaded drafts must pass the existing approval flow first.
- Reports and gap analyses save the retrieved passages as `evidenceSnapshot` before generation. The report viewer shows those saved excerpts even after the source is reindexed. Generated passage references are validated against the retrieved chunk IDs.

## Limits and operations

Extraction accepts PDFs up to 25 MiB, 200 pages and 600,000 extracted characters. Encrypted PDFs and documents with insufficient selectable text fail explicitly. Pages without text are disclosed as warnings. Stored-upload extraction failure fails the job; an unavailable public open-access PDF can use the abstract with a scope warning. Public PDF downloads use HTTPS, bounded responses, public-address checks and validated redirects.

Backend defaults are `RAG_MAX_CHUNKS=300`, `RAG_CHUNK_CHARS=2400` and `RAG_PASSAGES_PER_PAPER=3`. Ingestion batches structured extraction, caches LLM results and produces 768-dimensional embeddings using the existing provider factory. A full-text index can require many embedding/LLM calls; account for provider quotas when backfilling a large corpus. Source edits invalidate the ready index; leases and source fingerprints prevent obsolete jobs from publishing.

## Activation

1. Start PostgreSQL with pgvector and Redis. Keep credentials in the existing untracked environment files.
2. Apply the checked-in migrations before the new API or workers start:

   ```sh
   pnpm --filter backend db:migrate:deploy
   ```

3. Rebuild/restart the Python reviewer with `/internal/extract-text`. Set the same non-empty `INTERNAL_SERVICE_KEY` on backend/workers and reviewer, and set `AI_REVIEWER_URL` to the reviewer address. PDF extraction itself does not call Gemini.
4. Configure the backend Gemini key/models and existing PDF storage credentials. Rebuild backend, shared types and web. Run the API plus `worker:paper-analysis`, `worker:report` and `worker:gaps`. For local file uploads, the analysis worker must see the same uploads directory as the API; Compose now mounts it read-only.
5. For Compose, use the existing `.env.compose`/`.env` configuration and the `workers` profile after migration. The analysis worker depends on healthy PostgreSQL, Redis and reviewer services.

The existing Jenkinsfile still contains legacy MongoDB vector commands and lacks a Prisma migration/reviewer deployment stage. Update that deployment pipeline before production rollout; it is not validated by this implementation.

## Verification

Verified locally:

- Prisma client generation and schema validation.
- Shared-types build, backend TypeScript production build, web TypeScript build, Vite production build and bundle budget.
- 76 backend tests across 12 files: extraction/source safety, exact quotes, indexing failure/replay, source changes/leases, scoped retrieval, reference grounding, empty-project filters, queue idempotence/failure, report/gap prompts and PostgreSQL-only runtime audit.
- 4 Python extraction tests, including the authenticated HTTP endpoint, plus route syntax compilation.

Live migration and end-to-end database/provider execution have **not** been verified: Docker Engine was unavailable in this workspace. Mock-based ingestion tests do not substitute for that smoke test.

### Live smoke checklist

- [ ] Approve at least three papers: one uploaded selectable-text PDF, one accessible open-access PDF and one metadata-only paper.
- [ ] Index from paper detail and wait for `ready`; verify full-text source kinds for PDFs and the disclosed abstract-only scope for metadata.
- [ ] Compare graph quotes, page numbers and passage text against the original PDF. Verify a scanned/encrypted PDF reports a failure instead of fabricated content.
- [ ] Select papers in a project and generate a report and gap analysis. Confirm evidence only comes from that selection and each cited chunk exists in the saved snapshot.
- [ ] Confirm an empty project does not retrieve unrelated papers.
- [ ] Edit/replace a source, verify invalidation, reindex and confirm old report evidence stays unchanged.
- [ ] Restart a worker during indexing and verify retry/recovery without duplicate chunks or stale publication.
