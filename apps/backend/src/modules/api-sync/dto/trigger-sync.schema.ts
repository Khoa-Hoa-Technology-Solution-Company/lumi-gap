import { z } from "zod";
import { databaseIdSchema } from "../../../common/validation/database-id.js";

/** Body for POST /api/v1/admin/sync. */
export const TriggerSyncSchema = z.object({
  searchText: z.string().min(1, "searchText is required"),
  yearFrom: z.coerce.number().int().min(1900).max(2100).default(2022),
  maxPages: z.coerce.number().int().min(1).max(50).default(1),
});

export type TriggerSyncInput = z.infer<typeof TriggerSyncSchema>;

export const IngestCampaignParamsSchema = z.object({
  campaignId: databaseIdSchema,
});

export const CorpusValidationParamsSchema = z.object({
  validationRunId: databaseIdSchema,
});

export const TriggerCorpusValidationSchema = z.object({
  force: z.boolean().optional().default(false),
}).default({});

export type TriggerCorpusValidationInput = z.infer<typeof TriggerCorpusValidationSchema>;

export const PlanOpenAlexCampaignSchema = z.object({
  campaignKey: z.string().trim().min(3).max(120).regex(/^[a-z0-9][a-z0-9._-]*$/i, "campaignKey must be URL-safe"),
  targetUniqueWorks: z.coerce.number().int().min(1_000).max(5_000_000).default(1_000_000),
  priorityRatio: z.coerce.number().min(0).max(0.5).default(0.2),
});

export type PlanOpenAlexCampaignInput = z.infer<typeof PlanOpenAlexCampaignSchema>;
