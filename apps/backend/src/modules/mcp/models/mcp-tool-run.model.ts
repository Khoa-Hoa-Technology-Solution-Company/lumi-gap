// apps/backend/src/modules/mcp/models/mcp-tool-run.model.ts
import mongoose, { type InferSchemaType, Schema } from "mongoose";

const mcpToolRunSchema = new Schema(
  {
    reportId: { type: Schema.Types.ObjectId, ref: "Report", index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    toolName: { type: String, required: true },
    input: { type: Schema.Types.Mixed },
    output: { type: Schema.Types.Mixed },
    durationMs: { type: Number },
  },
  { timestamps: true },
);

// TTL: auto-delete after 90 days
mcpToolRunSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

export type McpToolRunDoc = InferSchemaType<typeof mcpToolRunSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const McpToolRunModel = mongoose.model("McpToolRun", mcpToolRunSchema, "mcp_tool_runs");
