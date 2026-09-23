import mongoose, { type InferSchemaType, Schema } from "mongoose";

const forumReferenceSchema = new Schema(
  {
    paperId: { type: Schema.Types.ObjectId, ref: "Paper" },
    doi: { type: String, trim: true, maxlength: 300 },
    url: { type: String, trim: true, maxlength: 1000 },
    title: { type: String, trim: true, maxlength: 500 },
    verified: { type: Boolean, default: false },
  },
  { _id: false },
);

const forumPostSchema = new Schema(
  {
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    communityId: { type: Schema.Types.ObjectId, ref: "Community", index: true },
    researchGapId: { type: Schema.Types.ObjectId, ref: "ResearchGap", index: true },
    paperIds: { type: [Schema.Types.ObjectId], ref: "Paper", default: [] },
    type: { type: String, enum: ["discussion", "question"], default: "discussion", index: true },
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 240 },
    body: { type: String, required: true, trim: true, minlength: 1, maxlength: 20000 },
    content: { type: String, trim: true, minlength: 1, maxlength: 20000 },
    tags: { type: [String], default: [] },
    linkedPaperId: { type: Schema.Types.ObjectId, ref: "Paper", index: true },
    linkedResearchGapId: { type: Schema.Types.ObjectId, ref: "ResearchGap", index: true },
    linkedProjectId: { type: Schema.Types.ObjectId, ref: "Project", index: true },
    references: { type: [forumReferenceSchema], default: [] },
    status: { type: String, enum: ["active", "hidden", "locked", "deleted"], default: "active", index: true },
    acceptedCommentId: { type: Schema.Types.ObjectId, ref: "ForumComment" },
    score: { type: Number, default: 0 },
    voteScore: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);
forumPostSchema.index({ communityId: 1, status: 1, createdAt: -1 });
forumPostSchema.index({ researchGapId: 1, status: 1, createdAt: -1 });
forumPostSchema.index({ type: 1, status: 1, createdAt: -1 });
forumPostSchema.index({ tags: 1, status: 1, createdAt: -1 });

const forumCommentSchema = new Schema(
  {
    postId: { type: Schema.Types.ObjectId, ref: "ForumPost", required: true, index: true },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    parentCommentId: { type: Schema.Types.ObjectId, ref: "ForumComment" },
    body: { type: String, required: true, trim: true, minlength: 1, maxlength: 10000 },
    content: { type: String, trim: true, minlength: 1, maxlength: 10000 },
    references: { type: [forumReferenceSchema], default: [] },
    status: { type: String, enum: ["active", "hidden", "deleted"], default: "active", index: true },
    score: { type: Number, default: 0 },
    voteScore: { type: Number, default: 0 },
  },
  { timestamps: true },
);
forumCommentSchema.index({ postId: 1, status: 1, createdAt: 1 });

const forumVoteSchema = new Schema(
  {
    subjectKind: { type: String, enum: ["post", "comment"], required: true },
    subjectId: { type: Schema.Types.ObjectId, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    value: { type: Number, enum: [-1, 1], required: true },
  },
  { timestamps: true },
);
forumVoteSchema.index({ subjectKind: 1, subjectId: 1, userId: 1 }, { unique: true });

const contentReportSchema = new Schema(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    targetType: { type: String, enum: ["post", "comment"], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true, index: true },
    communityId: { type: Schema.Types.ObjectId, ref: "Community", index: true },
    reason: {
      type: String,
      enum: ["spam", "harassment", "misinformation", "copyright", "off_topic", "other"],
      required: true,
    },
    description: { type: String, trim: true, maxlength: 2000 },
    status: { type: String, enum: ["open", "reviewed", "resolved", "dismissed"], default: "open", index: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    moderationNote: { type: String, trim: true, maxlength: 2000 },
  },
  { timestamps: true },
);
contentReportSchema.index({ communityId: 1, status: 1, createdAt: -1 });
contentReportSchema.index(
  { reporterId: 1, targetType: 1, targetId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "open" } },
);

export type ForumPostDoc = InferSchemaType<typeof forumPostSchema> & { _id: mongoose.Types.ObjectId };
export const ForumPostModel = mongoose.model("ForumPost", forumPostSchema, "forum_posts");
export const ForumCommentModel = mongoose.model("ForumComment", forumCommentSchema, "forum_comments");
export const ForumVoteModel = mongoose.model("ForumVote", forumVoteSchema, "forum_votes");
export const ContentReportModel = mongoose.model("ContentReport", contentReportSchema, "forum_content_reports");
