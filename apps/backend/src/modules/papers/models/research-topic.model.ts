import mongoose, { type InferSchemaType, Schema } from "mongoose";

/** research_topics — hierarchical taxonomy (parentTopicId is null for roots). */
const researchTopicSchema = new Schema(
  {
    parentTopicId: { type: Schema.Types.ObjectId, ref: "ResearchTopic", default: null },
    topicName: { type: String, required: true },
    description: { type: String },
    researchField: { type: String }, // broader umbrella, e.g. "Computer Science"
    externalIds: {
      openalexId: { type: String, index: true, sparse: true },
    },
  },
  { timestamps: true },
);

researchTopicSchema.index({ parentTopicId: 1, topicName: 1 });

export type ResearchTopicDoc = InferSchemaType<typeof researchTopicSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const ResearchTopicModel = mongoose.model(
  "ResearchTopic",
  researchTopicSchema,
  "research_topics",
);
