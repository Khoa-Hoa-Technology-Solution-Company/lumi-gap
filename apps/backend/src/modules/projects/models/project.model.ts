import mongoose, { type InferSchemaType, Schema } from "mongoose";

const projectMemberSchema = new Schema(
  {
    targetKind: { type: String, enum: ["User"], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true, refPath: "members.targetKind" },
    role: { type: String, enum: ["owner", "member"], default: "member" },
  },
  { _id: false },
);

const projectPaperSchema = new Schema(
  {
    targetKind: { type: String, enum: ["Paper"], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true, ref: "Paper" },
  },
  { _id: false },
);

const projectSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 1000 },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    members: { type: [projectMemberSchema], default: [] },
    papers: { type: [projectPaperSchema], default: [] },
  },
  { timestamps: true },
);

export type ProjectDoc = InferSchemaType<typeof projectSchema> & { _id: mongoose.Types.ObjectId };
export type ProjectHydrated = mongoose.HydratedDocument<InferSchemaType<typeof projectSchema>>;

export const ProjectModel = mongoose.model("Project", projectSchema, "research_projects");
