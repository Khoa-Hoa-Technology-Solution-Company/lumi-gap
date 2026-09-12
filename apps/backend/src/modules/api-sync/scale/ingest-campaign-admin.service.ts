import mongoose from "mongoose";
import { AppError } from "../../../common/exceptions/app-error.js";
import { OpenAlexIngestCampaignModel } from "../models/openalex-ingest-campaign.model.js";
import { OpenAlexIngestPageAttemptModel } from "../models/openalex-ingest-page-attempt.model.js";
import { OpenAlexIngestPartitionModel } from "../models/openalex-ingest-partition.model.js";

function campaignObjectId(value: string): mongoose.Types.ObjectId {
  if (!mongoose.isObjectIdOrHexString(value)) throw AppError.badRequest("Invalid campaign id");
  return new mongoose.Types.ObjectId(value);
}

export const ingestCampaignAdminService = {
  async listRecent(limit = 20) {
    return OpenAlexIngestCampaignModel.find().sort({ createdAt: -1 }).limit(limit).lean();
  },

  async getDetail(campaignIdInput: string) {
    const campaignId = campaignObjectId(campaignIdInput);
    const [campaign, partitions, attempts] = await Promise.all([
      OpenAlexIngestCampaignModel.findById(campaignId).lean(),
      OpenAlexIngestPartitionModel.aggregate<{ state: string; count: number; targetCount: number; acceptedCount: number }>([
        { $match: { campaignId } },
        {
          $group: {
            _id: "$state",
            count: { $sum: 1 },
            targetCount: { $sum: "$targetCount" },
            acceptedCount: { $sum: "$checkpoint.acceptedCount" },
          },
        },
        { $project: { _id: 0, state: "$_id", count: 1, targetCount: 1, acceptedCount: 1 } },
      ]),
      OpenAlexIngestPageAttemptModel.aggregate<{ state: string; count: number }>([
        { $match: { campaignId } },
        { $group: { _id: "$state", count: { $sum: 1 } } },
        { $project: { _id: 0, state: "$_id", count: 1 } },
      ]),
    ]);
    if (!campaign) throw AppError.notFound("Ingest campaign not found");
    return { campaign, partitions, attempts };
  },
};
