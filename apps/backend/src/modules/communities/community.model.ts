import mongoose, { type InferSchemaType, Schema } from "mongoose";

const communitySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    description: { type: String, trim: true, maxlength: 2000, default: "" },
    researchTopics: { type: [String], default: [] },
    visibility: { type: String, enum: ["public", "private"], default: "public", index: true },
    rules: { type: [String], default: [] },
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    memberCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

communitySchema.index({ name: "text", description: "text", researchTopics: "text" });

const communityMembershipSchema = new Schema(
  {
    communityId: { type: Schema.Types.ObjectId, ref: "Community", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    role: { type: String, enum: ["owner", "moderator", "member"], default: "member" },
    status: { type: String, enum: ["pending", "active", "declined", "banned"], default: "active", index: true },
    joinedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

communityMembershipSchema.index({ communityId: 1, userId: 1 }, { unique: true });
communityMembershipSchema.index({ communityId: 1, status: 1, role: 1 });

export type CommunityDoc = InferSchemaType<typeof communitySchema> & { _id: mongoose.Types.ObjectId };
export type CommunityMembershipDoc = InferSchemaType<typeof communityMembershipSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const CommunityModel = mongoose.model("Community", communitySchema, "communities");
export const CommunityMembershipModel = mongoose.model("CommunityMembership", communityMembershipSchema, "community_memberships");
