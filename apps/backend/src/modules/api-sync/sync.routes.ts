import { Router, type RequestHandler } from "express";
import { env } from "../../config/env.js";
import { requireAuth, requireRole } from "../../common/middleware/auth.js";
import { validate } from "../../common/middleware/validate.js";
import { logger } from "../../infrastructure/logger.js";
import { syncController } from "./sync.controller.js";
import { CorpusValidationParamsSchema, IngestCampaignParamsSchema, PlanOpenAlexCampaignSchema, TriggerCorpusValidationSchema, TriggerSyncSchema } from "./dto/trigger-sync.schema.js";

/**
 * Admin sync routes. Gated by requireAuth + requireRole("admin").
 * SYNC_ADMIN_BYPASS=true (dev only) drops the gate so the team can demo before
 * an admin user is seeded.
 */
const adminGuard: RequestHandler[] = env.SYNC_ADMIN_BYPASS
  ? []
  : [requireAuth, requireRole("admin")];

if (env.SYNC_ADMIN_BYPASS) {
  logger.warn("SYNC_ADMIN_BYPASS=true — /api/v1/admin/sync is UNPROTECTED (dev only)");
}

export const syncRouter: Router = Router();

syncRouter.post("/sync", ...adminGuard, validate(TriggerSyncSchema), syncController.trigger);
syncRouter.get("/sync/runs", ...adminGuard, syncController.listRuns);
// Campaigns are created only by the durable planner. These endpoints expose
// lifecycle controls for an already-planned campaign; they never synthesize a
// biased "download pages until N" campaign inside an HTTP request.
syncRouter.get("/openalex-ingest/campaigns", ...adminGuard, syncController.listIngestCampaigns);
syncRouter.post("/openalex-ingest/preflight", ...adminGuard, syncController.preflightOpenAlexIngest);
syncRouter.post("/openalex-ingest/campaigns/plan", ...adminGuard, validate(PlanOpenAlexCampaignSchema), syncController.planOpenAlexIngestCampaign);
syncRouter.get("/openalex-ingest/campaigns/:campaignId", ...adminGuard, validate(IngestCampaignParamsSchema, "params"), syncController.getIngestCampaign);
syncRouter.post(
  "/openalex-ingest/campaigns/:campaignId/validations",
  ...adminGuard,
  validate(IngestCampaignParamsSchema, "params"),
  validate(TriggerCorpusValidationSchema),
  syncController.triggerCorpusValidation,
);
syncRouter.get("/openalex-ingest/campaigns/:campaignId/validations/latest", ...adminGuard, validate(IngestCampaignParamsSchema, "params"), syncController.getLatestCorpusValidation);
syncRouter.get("/openalex-ingest/validations/:validationRunId", ...adminGuard, validate(CorpusValidationParamsSchema, "params"), syncController.getCorpusValidation);
syncRouter.post("/openalex-ingest/campaigns/:campaignId/start", ...adminGuard, validate(IngestCampaignParamsSchema, "params"), syncController.startIngestCampaign);
syncRouter.post("/openalex-ingest/campaigns/:campaignId/pause", ...adminGuard, validate(IngestCampaignParamsSchema, "params"), syncController.pauseIngestCampaign);
syncRouter.post("/openalex-ingest/campaigns/:campaignId/cancel", ...adminGuard, validate(IngestCampaignParamsSchema, "params"), syncController.cancelIngestCampaign);
