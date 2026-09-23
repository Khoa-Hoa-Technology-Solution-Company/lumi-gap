import mongoose from "mongoose";
import type { UserRole } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { auditService } from "../audit/audit.service.js";
import { CommunityMembershipModel, CommunityModel } from "./community.model.js";

type CommunityInput = {
  name: string;
  description?: string;
  visibility?: "public" | "private";
  rules?: string[];
  researchTopics?: string[];
};

type MembershipSummary = {
  role: "owner" | "moderator" | "member";
  status: "pending" | "active" | "declined" | "banned";
};

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export async function getActiveCommunityMembership(communityId: string, userId: string) {
  return CommunityMembershipModel.findOne({ communityId, userId, status: "active" }).lean();
}

export async function isCommunityModerator(communityId: string, userId: string): Promise<boolean> {
  const membership = await CommunityMembershipModel.findOne({
    communityId,
    userId,
    status: "active",
    role: { $in: ["owner", "moderator"] },
  }).lean();
  return Boolean(membership);
}

async function moderatorMembership(communityId: string, userId: string, role?: UserRole): Promise<MembershipSummary | null> {
  if (role === "admin") return { role: "owner", status: "active" };
  return CommunityMembershipModel.findOne({
    communityId,
    userId,
    status: "active",
    role: { $in: ["owner", "moderator"] },
  }).select("role status").lean() as Promise<MembershipSummary | null>;
}

async function assertCommunityModerator(communityId: string, userId: string, role?: UserRole): Promise<MembershipSummary> {
  const membership = await moderatorMembership(communityId, userId, role);
  if (!membership) {
    throw AppError.forbidden("Community moderator access is required");
  }
  return membership;
}

function presentCommunity(community: Record<string, any>, membership?: MembershipSummary | null, actorRole?: UserRole) {
  const id = String(community._id);
  const activeMembership = membership?.status === "active";
  return {
    id,
    name: community.name,
    slug: community.slug,
    description: community.description ?? "",
    researchTopics: community.researchTopics ?? [],
    visibility: community.visibility,
    rules: community.rules ?? [],
    memberCount: community.memberCount ?? 0,
    viewerMembership: membership ? { role: membership.role, status: membership.status } : undefined,
    canManage: actorRole === "admin" || (activeMembership && ["owner", "moderator"].includes(membership!.role)),
    contentRestricted: community.visibility === "private" && actorRole !== "admin" && !activeMembership,
    createdAt: community.createdAt,
    updatedAt: community.updatedAt,
  };
}

export const communityService = {
  async create(input: CommunityInput, actorId: string) {
    const slugBase = slugify(input.name);
    if (!slugBase) throw AppError.badRequest("Community name must contain letters or numbers");
    const slug = `${slugBase}-${new mongoose.Types.ObjectId().toString().slice(-6)}`;
    const community = await CommunityModel.create({ ...input, slug, ownerId: actorId, memberCount: 1 });
    try {
      await CommunityMembershipModel.create({
        communityId: community._id,
        userId: actorId,
        role: "owner",
        status: "active",
      });
    } catch (error) {
      await CommunityModel.deleteOne({ _id: community._id });
      throw error;
    }
    await auditService.log("community.created", {
      userId: actorId,
      targetTableName: "communities",
      targetRecordId: community.id,
    });
    return presentCommunity(
      community.toObject() as unknown as Record<string, any>,
      { role: "owner", status: "active" },
    );
  },

  async list(userId: string | undefined, page: number, pageSize: number, role?: UserRole) {
    const [communities, total] = await Promise.all([
      CommunityModel.find({}).sort({ updatedAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      CommunityModel.countDocuments({}),
    ]);
    const memberships = userId && communities.length > 0
      ? await CommunityMembershipModel.find({ userId, communityId: { $in: communities.map((item) => item._id) } })
        .select("communityId role status").lean()
      : [];
    const membershipByCommunity = new Map(memberships.map((item) => [String(item.communityId), item as MembershipSummary]));
    return {
      data: communities.map((community) => presentCommunity(community, membershipByCommunity.get(String(community._id)), role)),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  },

  async get(idOrSlug: string, userId?: string, role?: UserRole) {
    const community = mongoose.isValidObjectId(idOrSlug)
      ? await CommunityModel.findById(idOrSlug).lean()
      : await CommunityModel.findOne({ slug: idOrSlug }).lean();
    if (!community) throw AppError.notFound("Community not found");
    const membership = userId
      ? await CommunityMembershipModel.findOne({ communityId: community._id, userId }).select("role status").lean() as MembershipSummary | null
      : null;
    return presentCommunity(community, membership, role);
  },

  async update(communityId: string, input: Partial<CommunityInput>, actorId: string, actorRole?: UserRole) {
    const actorMembership = await assertCommunityModerator(communityId, actorId, actorRole);
    const community = await CommunityModel.findByIdAndUpdate(
      communityId,
      { $set: input },
      { new: true, runValidators: true },
    );
    if (!community) throw AppError.notFound("Community not found");
    await auditService.log("community.updated", {
      userId: actorId,
      targetTableName: "communities",
      targetRecordId: communityId,
      details: { fields: Object.keys(input) },
    });
    return presentCommunity(
      community.toObject() as unknown as Record<string, any>,
      actorMembership,
      actorRole,
    );
  },

  async join(communityId: string, userId: string) {
    const community = await CommunityModel.findById(communityId).select("visibility").lean();
    if (!community) throw AppError.notFound("Community not found");
    const existing = await CommunityMembershipModel.findOne({ communityId, userId }).select("status role").lean();
    if (existing?.status === "banned") throw AppError.forbidden("You are banned from this community");
    const status = community.visibility === "public" ? "active" : "pending";
    const membership = await CommunityMembershipModel.findOneAndUpdate(
      { communityId, userId },
      { $setOnInsert: { role: "member", joinedAt: new Date() }, $set: { status } },
      { new: true, upsert: true, runValidators: true },
    );
    if (status === "active" && existing?.status !== "active") {
      await CommunityModel.updateOne({ _id: communityId }, { $inc: { memberCount: 1 } });
    }
    await auditService.log("community.joined", {
      userId,
      targetTableName: "community_memberships",
      targetRecordId: membership.id,
      details: { communityId, status },
    });
    return { role: membership.role, status: membership.status };
  },

  async leave(communityId: string, userId: string) {
    const membership = await CommunityMembershipModel.findOne({ communityId, userId });
    if (!membership) return;
    if (membership.role === "owner") throw AppError.badRequest("Transfer ownership before leaving the community");
    const wasActive = membership.status === "active";
    await membership.deleteOne();
    if (wasActive) {
      await CommunityModel.updateOne(
        { _id: communityId, memberCount: { $gt: 0 } },
        { $inc: { memberCount: -1 } },
      );
    }
    await auditService.log("community.left", {
      userId,
      targetTableName: "community_memberships",
      targetRecordId: membership.id,
      details: { communityId },
    });
  },

  async listMembers(communityId: string, actorId: string, actorRole?: UserRole) {
    await assertCommunityModerator(communityId, actorId, actorRole);
    return CommunityMembershipModel.find({ communityId })
      .sort({ role: 1, createdAt: 1 })
      .populate("userId", "fullName email avatarUrl role institution")
      .lean();
  },

  async updateMember(
    communityId: string,
    targetUserId: string,
    input: { role?: "moderator" | "member"; status?: "pending" | "active" | "declined" | "banned" },
    actorId: string,
    actorRole?: UserRole,
  ) {
    const actorMembership = await assertCommunityModerator(communityId, actorId, actorRole);
    const target = await CommunityMembershipModel.findOne({ communityId, userId: targetUserId });
    if (!target) throw AppError.notFound("Community membership not found");
    if (target.role === "owner") throw AppError.badRequest("The owner membership cannot be changed here");
    if (input.role !== undefined && actorRole !== "admin" && actorMembership.role !== "owner") {
      throw AppError.forbidden("Only the community owner can assign or remove moderators");
    }
    if (actorRole !== "admin" && actorMembership.role === "moderator" && target.role !== "member") {
      throw AppError.forbidden("Community moderators can only manage regular members");
    }
    const wasActive = target.status === "active";
    if (input.role !== undefined) target.role = input.role;
    if (input.status !== undefined) target.status = input.status;
    await target.save();
    const isActive = target.status === "active";
    if (wasActive !== isActive) {
      await CommunityModel.updateOne(
        { _id: communityId, ...(isActive ? {} : { memberCount: { $gt: 0 } }) },
        { $inc: { memberCount: isActive ? 1 : -1 } },
      );
    }
    await auditService.log("community.member.updated", {
      userId: actorId,
      targetTableName: "community_memberships",
      targetRecordId: target.id,
      details: input,
    });
    return target;
  },
};
