import mongoose, { type InferSchemaType, Schema } from "mongoose";

const projectTeamMessageSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    content: { type: String, required: true, trim: true, maxlength: 4000 },
    readBy: { type: [{ type: Schema.Types.ObjectId, ref: "User" }], default: [] },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User" },
    deleteReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

projectTeamMessageSchema.index({ projectId: 1, createdAt: -1 });
projectTeamMessageSchema.index({ projectId: 1, isDeleted: 1, createdAt: -1 });

export type ProjectTeamMessageDoc = InferSchemaType<typeof projectTeamMessageSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const ProjectTeamMessageModel = mongoose.model(
  "ProjectTeamMessage",
  projectTeamMessageSchema,
  "project_team_messages",
);
