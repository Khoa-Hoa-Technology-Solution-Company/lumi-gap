import mongoose, { type InferSchemaType, Schema } from "mongoose";

/** api_providers — academic data sources (openalex, semanticscholar, ...). */
const apiProviderSchema = new Schema(
  {
    providerName: { type: String, required: true, unique: true, index: true },
    baseUrl: { type: String, required: true },
    providerKind: { type: String, enum: ["academic-api"], default: "academic-api" },
    providerStatus: { type: String, enum: ["active", "disabled"], default: "disabled" },
    rateLimitPerMin: { type: Number, default: 60 },
  },
  { timestamps: true },
);

export type ApiProviderDoc = InferSchemaType<typeof apiProviderSchema> & {
  _id: mongoose.Types.ObjectId;
};
export const ApiProviderModel = mongoose.model("ApiProvider", apiProviderSchema, "api_providers");
