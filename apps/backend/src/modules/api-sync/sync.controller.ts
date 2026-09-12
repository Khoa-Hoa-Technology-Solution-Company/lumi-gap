import type { Request, Response } from "express";
import { apiSyncQueue, corpusValidationQueue, openAlexIngestQueue } from "../../infrastructure/queue.js";
import { env } from "../../config/env.js";
import { ApiSyncRunModel } from "./models/api-sync-run.model.js";
import type { TriggerSyncInput } from "./dto/trigger-sync.schema.js";
import type { PlanOpenAlexCampaignInput } from "./dto/trigger-sync.schema.js";
import type { TriggerCorpusValidationInput } from "./dto/trigger-sync.schema.js";
import { ingestCampaignAdminService } from "./scale/ingest-campaign-admin.service.js";
import { ingestCampaignService } from "./scale/ingest-campaign.service.js";
import { openAlexPreflightService } from "./scale/openalex-preflight.service.js";
import { openAlexCampaignPlannerService } from "./scale/openalex-campaign-planner.service.js";
import { CORPUS_VALIDATOR_VERSION, corpusValidationService } from "./scale/corpus-validation.service.js";

/**
 * Thin HTTP layer. Triggering a sync only ENQUEUES a BullMQ job and returns
 * immediately — the standalone worker (pnpm worker:sync) does the actual work.
 */
export const syncController = {
  async trigger(req: Request<unknown, unknown, TriggerSyncInput>, res: Response) {
    const { searchText, yearFrom, maxPages } = req.body;
    const job = await apiSyncQueue.add("manual-sync", { searchText, yearFrom, maxPages });
    res.status(202).json({
      success: true,
      data: { jobId: job.id, status: "queued", searchText, yearFrom, maxPages },
    });
  },

  async listRuns(_req: Request, res: Response) {
    const runs = await ApiSyncRunModel.find().sort({ startedAt: -1 }).limit(20).lean();
    res.json({ success: true, data: runs, meta: { total: runs.length } });
  },

  async listIngestCampaigns(_req: Request, res: Response) {
    const campaigns = await ingestCampaignAdminService.listRecent();
    res.json({ success: true, data: campaigns, meta: { total: campaigns.length } });
  },

  async preflightOpenAlexIngest(_req: Request, res: Response) {
    const data = await openAlexPreflightService.run();
    res.json({ success: true, data });
  },

  async planOpenAlexIngestCampaign(req: Request<unknown, unknown, PlanOpenAlexCampaignInput>, res: Response) {
    if (!env.OPENALEX_API_KEY) {
      res.status(409).json({
        success: false,
        error: {
          code: "OPENALEX_API_KEY_REQUIRED",
          message: "Million-scale OpenAlex campaigns require OPENALEX_API_KEY before planning can run.",
        },
      });
      return;
    }
    const campaign = await openAlexCampaignPlannerService.planBackfill(req.body);
    res.status(201).json({
      success: true,
      data: {
        campaignId: campaign._id.toString(),
        campaignKey: campaign.campaignKey,
        state: campaign.state,
        targetUniqueWorks: campaign.targetUniqueWorks,
        plannedPartitions: campaign.progress?.plannedPartitions ?? 0,
      },
    });
  },

  async getIngestCampaign(req: Request<{ campaignId: string }>, res: Response) {
    const data = await ingestCampaignAdminService.getDetail(req.params.campaignId);
    res.json({ success: true, data });
  },

  async triggerCorpusValidation(req: Request<{ campaignId: string }, unknown, TriggerCorpusValidationInput>, res: Response) {
    const result = await corpusValidationService.createRun(req.params.campaignId, { force: req.body.force });
    if (result.created) {
      try {
        await corpusValidationQueue.add(
          "validate-campaign-corpus",
          { validationRunId: result.runId },
          { jobId: `corpus-validation-${result.runId}-${Date.now()}` },
        );
      } catch (error) {
        await corpusValidationService.markQueueFailure(result.runId, error);
        throw error;
      }
    }
    res.status(result.created ? 202 : 200).json({
      success: true,
      data: {
        validationRunId: result.runId,
        state: result.state,
        reused: !result.created,
        validatorVersion: CORPUS_VALIDATOR_VERSION,
      },
    });
  },

  async getLatestCorpusValidation(req: Request<{ campaignId: string }>, res: Response) {
    const data = await corpusValidationService.getLatest(req.params.campaignId);
    res.json({ success: true, data });
  },

  async getCorpusValidation(req: Request<{ validationRunId: string }>, res: Response) {
    const data = await corpusValidationService.getRun(req.params.validationRunId);
    res.json({ success: true, data });
  },

  async startIngestCampaign(req: Request<{ campaignId: string }>, res: Response) {
    if (!env.OPENALEX_API_KEY) {
      res.status(409).json({
        success: false,
        error: {
          code: "OPENALEX_API_KEY_REQUIRED",
          message: "Million-scale OpenAlex campaigns require OPENALEX_API_KEY before they can start.",
        },
      });
      return;
    }

    const campaign = await ingestCampaignService.start(req.params.campaignId);
    try {
      const job = await openAlexIngestQueue.add("campaign-page", {
        campaignId: campaign._id.toString(),
      });
      res.status(202).json({
        success: true,
        data: { campaignId: campaign._id.toString(), state: campaign.state, jobId: job.id, status: "queued" },
      });
    } catch (error) {
      await ingestCampaignService.pause(campaign._id.toString());
      throw error;
    }
  },

  async pauseIngestCampaign(req: Request<{ campaignId: string }>, res: Response) {
    const campaign = await ingestCampaignService.pause(req.params.campaignId);
    res.json({ success: true, data: { campaignId: campaign._id.toString(), state: campaign.state } });
  },

  async cancelIngestCampaign(req: Request<{ campaignId: string }>, res: Response) {
    const campaign = await ingestCampaignService.cancel(req.params.campaignId);
    res.json({ success: true, data: { campaignId: campaign._id.toString(), state: campaign.state } });
  },
};
