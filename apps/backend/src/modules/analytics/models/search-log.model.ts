import mongoose, { type InferSchemaType, Schema } from "mongoose";

const searchLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    query: { type: String, required: true },
    mode: { type: String, enum: ["semantic", "semantic+rerank"], required: true },
    resultCount: { type: Number, required: true },
    durationMs: { type: Number, required: true },
    filters: {
      yearFrom: { type: Number },
      yearTo: { type: Number },
    },
  },
  { timestamps: true },
);

// TTL: auto-delete after 90 days
searchLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });
searchLogSchema.index({ userId: 1, createdAt: -1 });

export type SearchLogDoc = InferSchemaType<typeof searchLogSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const SearchLogModel = mongoose.model("SearchLog", searchLogSchema, "search_logs");
