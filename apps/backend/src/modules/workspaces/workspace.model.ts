import mongoose, { Schema } from "mongoose";

const workspaceSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 160 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    memberIds: { type: [Schema.Types.ObjectId], ref: "User", default: [] },
  },
  { timestamps: true },
);

const workspaceSectionSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "DraftWorkspace", required: true, index: true },
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 240 },
    content: { type: String, default: "", maxlength: 200000 },
    order: { type: Number, required: true, min: 0, max: 10000 },
    version: { type: Number, required: true, min: 1, default: 1 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);
workspaceSectionSchema.index({ workspaceId: 1, order: 1, createdAt: 1 });

const sectionRevisionSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "DraftWorkspace", required: true, index: true, immutable: true },
    sectionId: { type: Schema.Types.ObjectId, ref: "WorkspaceSection", required: true, index: true, immutable: true },
    version: { type: Number, required: true, min: 1, immutable: true },
    title: { type: String, required: true, maxlength: 240, immutable: true },
    content: { type: String, required: true, maxlength: 200000, immutable: true },
    order: { type: Number, required: true, immutable: true },
    changedBy: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    changeSummary: { type: String, trim: true, maxlength: 1000, immutable: true },
  },
  { timestamps: true, versionKey: false },
);
sectionRevisionSchema.index({ sectionId: 1, version: 1 }, { unique: true });

const workspaceCommentSchema = new Schema(
  {
    workspaceId: { type: Schema.Types.ObjectId, ref: "DraftWorkspace", required: true, index: true },
    sectionId: { type: Schema.Types.ObjectId, ref: "WorkspaceSection", required: true, index: true },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true, trim: true, minlength: 1, maxlength: 5000 },
    sectionVersion: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ["open", "resolved"], default: "open", index: true },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    resolvedAt: { type: Date },
  },
  { timestamps: true },
);
workspaceCommentSchema.index({ workspaceId: 1, sectionId: 1, createdAt: 1 });

export const DraftWorkspaceModel = mongoose.model("DraftWorkspace", workspaceSchema, "draft_workspaces");
export const WorkspaceSectionModel = mongoose.model("WorkspaceSection", workspaceSectionSchema, "workspace_sections");
export const SectionRevisionModel = mongoose.model("SectionRevision", sectionRevisionSchema, "section_revisions");
export const WorkspaceCommentModel = mongoose.model("WorkspaceComment", workspaceCommentSchema, "workspace_comments");
