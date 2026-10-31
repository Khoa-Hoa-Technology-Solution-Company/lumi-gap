# OpenAlex Million-Scale Ingest Runbook

This runbook operates the metadata-only OpenAlex campaign. It does not enqueue
embeddings; embedding begins only after metadata volume and vector capacity are
approved.

## Preconditions

1. `DATABASE_URL` points at the PostgreSQL database that has all Prisma migrations applied
   (`pnpm --filter backend db:migrate:deploy`; Docker does this in the `migrate` service).
2. `OPENALEX_API_KEY` and `OPENALEX_MAILTO` are present in the runtime secret
   store. Do not commit either value.
3. Redis is reachable and below its request quota. A campaign start enqueues a
   BullMQ job; a quota error pauses the campaign rather than allowing it to run
   without a worker.
4. An ingest worker is running (see Worker Runtime). In Docker it is the opt-in
   `worker-openalex-ingest` service (`docker compose --profile ingest up -d --build`).

The raw OpenAlex `language` value is preserved for the UI; ingested papers use a
neutral `textSearchLanguage` (`"none"`) for full-text search
(`modules/api-sync/providers/openalex.normalizer.ts`).

## Canary First

Create a 1,000-work planned campaign through the admin endpoint, review its
partition count and cohort split, then start it. A campaign may be cancelled
while `planned`, or paused while `running`.

```http
POST /api/v1/admin/openalex-ingest/campaigns/plan
{
  "campaignKey": "canary-YYYYMMDD-v1",
  "targetUniqueWorks": 1000,
  "priorityRatio": 0.2
}

POST /api/v1/admin/openalex-ingest/campaigns/:campaignId/start
GET /api/v1/admin/openalex-ingest/campaigns/:campaignId
```

Each sampled partition is exactly one OpenAlex list page, capped at 100 works.
The campaign is at-least-once and idempotent: DOI/OpenAlex IDs deduplicate
writes, committed attempts repair checkpoints on retry, and cohort membership
records campaign provenance. `progress.uniqueWorks`, not raw accepted count,
is the success number for a campaign.

## One Million Backfill

After the canary is clean, plan the initial target. Planning only writes the
campaign manifest and partitions; it does not download papers until an admin
starts the campaign and an ingest worker is running. The planner creates:

- `analytics-baseline`: domain-proportional sample with a bounded domain floor;
- `retrieval-priority`: CS/AI enrichment for search and RAG;
- deterministic filters, seeds, provider snapshot counts, and request
  fingerprints in the campaign manifest.

```http
POST /api/v1/admin/openalex-ingest/campaigns/plan
{
  "campaignKey": "openalex-1m-v1",
  "targetUniqueWorks": 1000000,
  "priorityRatio": 0.2
}
```

The target is a desired unique-work threshold. Random samples can overlap, so a
run below the threshold ends in the campaign state `completed_with_shortfall`, never as a false
success. Plan a refill campaign for the reported shortfall. Trends should use the
`analytics-baseline` cohort by default; CS/AI enrichment must not be presented
as an unbiased all-domain population.

## Worker Runtime

Production runs `worker:openalex-ingest` as a separate process/service with
the same PostgreSQL and Redis configuration as the API:

```powershell
pnpm --filter backend worker:openalex-ingest
```

For local development, `dev:all+ingest` runs the API, the default workers and the ingest worker:

```powershell
pnpm --filter backend dev:all+ingest
```

`dev:all` does not start `worker:sync` or `worker:openalex-ingest`. Do not start a campaign
until Redis is healthy. A deployed API does not process this queue by itself;
run `worker:openalex-ingest` as a persistent process on an always-on host using
the same `DATABASE_URL` and `REDIS_URL` as the API.

## Operational Checks

- Inspect campaign state and partitions from the admin API. `dead_letter` or
  `retry_wait` partitions require investigation before declaring a run healthy.
- Check `progress.uniqueWorks`, rejected/conflict counts, queue depth, worker
  heartbeat, API error rate, and PostgreSQL disk growth.
- Run a daily refresh campaign separately, using an OpenAlex update watermark;
  do not reuse the backfill campaign as a refresh job.
