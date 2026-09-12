# OpenAlex Million-Scale Ingest Runbook

This runbook operates the metadata-only OpenAlex campaign. It does not enqueue
embeddings; embedding begins only after metadata volume and vector capacity are
approved.

## Preconditions

1. `MONGODB_URI` targets the new primary MongoDB database. For a self-managed
   replica-set member reached through a public host, use `directConnection=true`
   only when the member advertises an internal hostname.
2. `OPENALEX_API_KEY` and `OPENALEX_MAILTO` are present in the runtime secret
   store. Do not commit either value.
3. Redis is reachable and below its request quota. A campaign start enqueues a
   BullMQ job; a quota error pauses the campaign rather than allowing it to run
   without a worker.
4. Run the database checks and the text-index migration once after switching
   database or schema:

```powershell
pnpm --filter backend mongo:preflight
pnpm --filter backend mongo:ensure-paper-text-index
pnpm --filter backend mongo:ensure-paper-cohort-index
```

The text-index migration preserves raw OpenAlex `language` values for the UI
and uses a separate neutral `textSearchLanguage` override for MongoDB search.

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
run below the threshold closes as `completed_with_shortfall`, never as a false
success. Plan a refill campaign for the reported shortfall. Trends should use the
`analytics-baseline` cohort by default; CS/AI enrichment must not be presented
as an unbiased all-domain population.

## Worker Runtime

Production runs `worker:openalex-ingest` as a separate process/service with
the same MongoDB and Redis configuration as the API:

```powershell
pnpm --filter backend worker:openalex-ingest
```

For local development without the legacy topic sync:

```powershell
pnpm --filter backend dev:all+ingest
```

`dev:all` intentionally excludes both sync workers. Do not start a campaign
until Redis is healthy. A deployed API does not process this queue by itself;
run `worker:openalex-ingest` as a persistent process on an always-on host using
the same `MONGODB_URI` and `REDIS_URL` as the API.

## Operational Checks

- Inspect campaign state and partitions from the admin API. `dead_letter` or
  `retry_wait` partitions require investigation before declaring a run healthy.
- Check `progress.uniqueWorks`, rejected/conflict counts, queue depth, worker
  heartbeat, API error rate, and Mongo disk growth.
- Rejected individual provider works are recorded as `PAPER_INGEST_REJECTED`
  dead letters with a source identity and error message.
- Run a daily refresh campaign separately, using an OpenAlex update watermark;
  do not reuse the backfill campaign as a refresh job.
