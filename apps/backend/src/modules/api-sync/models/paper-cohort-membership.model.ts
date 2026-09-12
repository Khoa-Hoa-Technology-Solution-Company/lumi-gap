import mongoose, { type InferSchemaType, Schema } from "mongoose";

const paperCohortMembershipSchema = new Schema(
  {
    paperId: { type: Schema.Types.ObjectId, ref: "Paper", required: true },
    cohortId: { type: String, required: true },
    campaignId: { type: Schema.Types.ObjectId, ref: "OpenAlexIngestCampaign", required: true, index: true },
    stratumKey: { type: String, required: true },
    samplingWeight: { type: Number, min: 0 },
    selectionMethod: { type: String, enum: ["seeded-sample", "cursor", "priority-policy", "user-contributed", "refresh"], required: true },
    policyVersion: { type: String, required: true },
    reason: { type: String, enum: ["analytics_baseline", "cs_ai_priority", "user_contributed", "high_value_refresh", "repair"], required: true },
    sourcePopulation: { type: Number, min: 0 },
    selectedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

// A paper can be sampled again by a later campaign. Keep provenance for every
// campaign rather than letting an old cohort row hide a new campaign's progress.
paperCohortMembershipSchema.index({ paperId: 1, cohortId: 1, campaignId: 1 }, { unique: true, name: "paper_cohort_campaign_unique" });
paperCohortMembershipSchema.index({ cohortId: 1, stratumKey: 1 });
paperCohortMembershipSchema.index({ campaignId: 1, paperId: 1 });
paperCohortMembershipSchema.index({ campaignId: 1, cohortId: 1, stratumKey: 1, paperId: 1 });

export type PaperCohortMembershipDoc = InferSchemaType<typeof paperCohortMembershipSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const PaperCohortMembershipModel = mongoose.model(
  "PaperCohortMembership",
  paperCohortMembershipSchema,
  "paper_cohort_memberships",
);
