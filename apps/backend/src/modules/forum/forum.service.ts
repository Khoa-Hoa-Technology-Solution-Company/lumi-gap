import type { UserRole } from "@trend/shared-types";
import mongoose from "mongoose";
import { AppError } from "../../common/exceptions/app-error.js";
import { auditService } from "../audit/audit.service.js";
import { AcademicProfileModel } from "../academic-profiles/academic-profile.model.js";
import { getActiveCommunityMembership, isCommunityModerator } from "../communities/community.service.js";
import { CommunityMembershipModel, CommunityModel } from "../communities/community.model.js";
import { ResearchGapModel } from "../gaps/models/research-gap.model.js";
import { notificationService } from "../notifications/notification.service.js";
import { PaperModel } from "../papers/models/paper.model.js";
import { ProjectModel } from "../projects/models/project.model.js";
import { ContentReportModel, ForumCommentModel, ForumPostModel, ForumVoteModel } from "./forum.model.js";

type ReferenceInput = { paperId?: string; doi?: string; url?: string; title?: string };
type PostInput = {
  type?: "discussion" | "question";
  title: string;
  content: string;
  communityId?: string;
  tags?: string[];
  linkedPaperId?: string;
  linkedResearchGapId?: string;
  linkedProjectId?: string;
  references?: ReferenceInput[];
};

async function assertCanPostToCommunity(communityId: string | undefined, userId: string): Promise<void> {
  if (!communityId) return;
  const community = await CommunityModel.findById(communityId).select("visibility").lean();
  if (!community) throw AppError.notFound("Community not found");
  if (!(await getActiveCommunityMembership(communityId, userId))) {
    throw AppError.forbidden("Active community membership is required to post");
  }
}

async function assertCanViewCommunity(communityId: string | undefined, userId?: string, role?: UserRole): Promise<void> {
  if (!communityId) return;
  const community = await CommunityModel.findById(communityId).select("visibility").lean();
  if (!community) throw AppError.notFound("Community not found");
  if (community.visibility === "private" && role !== "admin") {
    if (!userId || !(await getActiveCommunityMembership(communityId, userId))) {
      throw AppError.forbidden("This community is private");
    }
  }
}

async function visibleCommunityIds(userId?: string, role?: UserRole) {
  if (role === "admin") return CommunityModel.distinct("_id", {});
  const publicIds = await CommunityModel.distinct("_id", { visibility: "public" });
  if (!userId) return publicIds;
  const memberIds = await CommunityMembershipModel.distinct("communityId", { userId, status: "active" });
  return [...new Set([...publicIds, ...memberIds].map(String))];
}

async function canModerate(communityId: unknown, actorId: string, role: UserRole): Promise<boolean> {
  if (role === "admin") return true;
  return Boolean(communityId && await isCommunityModerator(String(communityId), actorId));
}

async function validateLinks(input: Partial<PostInput>): Promise<void> {
  const checks: Array<Promise<unknown>> = [];
  if (input.linkedPaperId) checks.push(PaperModel.exists({ _id: input.linkedPaperId }));
  if (input.linkedResearchGapId) checks.push(ResearchGapModel.exists({ _id: input.linkedResearchGapId }));
  if (input.linkedProjectId) checks.push(ProjectModel.exists({ _id: input.linkedProjectId }));
  const results = await Promise.all(checks);
  if (results.some((result) => !result)) throw AppError.badRequest("A linked academic entity does not exist");
}

async function prepareReferences(references: ReferenceInput[] = []) {
  const paperIds = references.flatMap((reference) => reference.paperId ? [reference.paperId] : []);
  const papers = paperIds.length
    ? await PaperModel.find({ _id: { $in: paperIds } }).select("title publicationYear externalIds.doi").lean()
    : [];
  const paperMap = new Map(papers.map((paper) => [String(paper._id), paper]));
  if (paperIds.some((id) => !paperMap.has(id))) throw AppError.badRequest("A referenced paper does not exist");
  return references.map((reference) => {
    const paper = reference.paperId ? paperMap.get(reference.paperId) : undefined;
    return {
      ...reference,
      title: paper?.title ?? reference.title,
      doi: paper?.externalIds?.doi ?? reference.doi,
      verified: Boolean(paper),
    };
  });
}

async function attachAcademicVerification<T extends Record<string, any>>(items: T[]): Promise<T[]> {
  const userIds = items.flatMap((item) => item.authorId ? [String(item.authorId._id ?? item.authorId)] : []);
  if (userIds.length === 0) return items;
  const profiles = await AcademicProfileModel.find({ userId: { $in: userIds } })
    .select("userId verificationStatus academicTitle")
    .lean();
  const byUser = new Map(profiles.map((profile) => [String(profile.userId), profile]));
  for (const item of items) {
    if (item.authorId && typeof item.authorId === "object") {
      const profile = byUser.get(String(item.authorId._id));
      item.authorId.academicVerificationStatus = profile?.verificationStatus ?? "SELF_DECLARED";
      item.authorId.academicTitle = profile?.academicTitle;
    }
  }
  return items;
}

async function recalculateScore(subjectKind: "post" | "comment", subjectId: string): Promise<number> {
  const [result] = await ForumVoteModel.aggregate<{ score: number }>([
    { $match: { subjectKind, subjectId: new mongoose.Types.ObjectId(subjectId) } },
    { $group: { _id: null, score: { $sum: "$value" } } },
  ]);
  const score = result?.score ?? 0;
  if (subjectKind === "post") {
    await ForumPostModel.updateOne({ _id: subjectId }, { $set: { score, voteScore: score } });
  } else {
    await ForumCommentModel.updateOne({ _id: subjectId }, { $set: { score, voteScore: score } });
  }
  return score;
}

export const forumService = {
  async createPost(input: PostInput, userId: string) {
    await Promise.all([assertCanPostToCommunity(input.communityId, userId), validateLinks(input)]);
    const post = await ForumPostModel.create({
      ...input,
      type: input.type ?? "discussion",
      body: input.content,
      researchGapId: input.linkedResearchGapId,
      paperIds: input.linkedPaperId ? [input.linkedPaperId] : [],
      references: await prepareReferences(input.references),
      authorId: userId,
    });
    await auditService.log("forum.post.created", { userId, targetTableName: "forum_posts", targetRecordId: post.id });
    return post;
  },

  async listPosts(
    filter: { communityId?: string; linkedResearchGapId?: string; type?: string; tag?: string },
    page: number,
    pageSize: number,
    actorId?: string,
    actorRole?: UserRole,
  ) {
    const query: Record<string, unknown> = { status: { $in: ["active", "locked"] } };
    if (filter.linkedResearchGapId) query.linkedResearchGapId = filter.linkedResearchGapId;
    if (filter.type) query.type = filter.type;
    if (filter.tag) query.tags = filter.tag;
    if (filter.communityId) {
      await assertCanViewCommunity(filter.communityId, actorId, actorRole);
      query.communityId = filter.communityId;
    } else {
      query.$or = [
        { communityId: { $exists: false } },
        { communityId: null },
        { communityId: { $in: await visibleCommunityIds(actorId, actorRole) } },
      ];
    }
    const [data, total] = await Promise.all([
      ForumPostModel.find(query).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize)
        .populate("authorId", "fullName avatarUrl academicProfileType institution role")
        .populate("communityId", "name slug").lean(),
      ForumPostModel.countDocuments(query),
    ]);
    return { data: await attachAcademicVerification(data as Array<Record<string, any>>), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  },

  async getPost(postId: string, actorId?: string, actorRole?: UserRole) {
    const post = await ForumPostModel.findOne({ _id: postId, status: { $ne: "deleted" } })
      .populate("authorId", "fullName avatarUrl academicProfileType institution role")
      .populate("communityId", "name slug").lean();
    if (!post) throw AppError.notFound("Forum post not found");
    const communityId = post.communityId && typeof post.communityId === "object" && "_id" in post.communityId
      ? String(post.communityId._id) : post.communityId ? String(post.communityId) : undefined;
    await assertCanViewCommunity(communityId, actorId, actorRole);
    if (post.status === "hidden") {
      const authorId = post.authorId && typeof post.authorId === "object" && "_id" in post.authorId
        ? String(post.authorId._id) : String(post.authorId);
      if (!actorId || (authorId !== actorId && !(await canModerate(communityId, actorId, actorRole!)))) {
        throw AppError.notFound("Forum post not found");
      }
    }
    return (await attachAcademicVerification([post as Record<string, any>]))[0];
  },

  async updatePost(postId: string, input: Partial<PostInput>, userId: string) {
    const post = await ForumPostModel.findById(postId);
    if (!post || post.status === "deleted") throw AppError.notFound("Forum post not found");
    if (post.authorId.toString() !== userId) throw AppError.forbidden("Only the author can edit this post");
    await validateLinks(input);
    const update: Record<string, unknown> = { ...input };
    if (input.content !== undefined) update.body = input.content;
    if (input.references !== undefined) update.references = await prepareReferences(input.references);
    return ForumPostModel.findByIdAndUpdate(postId, { $set: update }, { new: true, runValidators: true });
  },

  async deletePost(postId: string, userId: string, role: UserRole) {
    const post = await ForumPostModel.findById(postId);
    if (!post || post.status === "deleted") throw AppError.notFound("Forum post not found");
    if (post.authorId.toString() !== userId && role !== "admin") throw AppError.forbidden();
    post.status = "deleted";
    await post.save();
  },

  async moderatePost(postId: string, status: "active" | "hidden" | "locked" | "deleted", actorId: string, actorRole: UserRole) {
    const existing = await ForumPostModel.findById(postId).select("communityId").lean();
    if (!existing) throw AppError.notFound("Forum post not found");
    if (!(await canModerate(existing.communityId, actorId, actorRole))) {
      throw AppError.forbidden("Forum moderator access is required in this community");
    }
    const post = await ForumPostModel.findByIdAndUpdate(postId, { $set: { status } }, { new: true });
    await auditService.log("forum.post.moderated", {
      userId: actorId, targetTableName: "forum_posts", targetRecordId: postId,
      details: { status, communityId: existing.communityId },
    });
    return post;
  },

  async addComment(postId: string, input: { content: string; parentCommentId?: string; references?: ReferenceInput[] }, userId: string) {
    const post = await ForumPostModel.findById(postId).select("status communityId authorId title").lean();
    if (!post || post.status === "deleted" || post.status === "hidden") throw AppError.notFound("Forum post not found");
    if (post.status === "locked") throw AppError.conflict("This post is locked");
    await assertCanPostToCommunity(post.communityId?.toString(), userId);
    if (input.parentCommentId) {
      const parent = await ForumCommentModel.exists({ _id: input.parentCommentId, postId, status: "active" });
      if (!parent) throw AppError.badRequest("Parent comment does not belong to this post");
    }
    const comment = await ForumCommentModel.create({
      ...input, body: input.content, references: await prepareReferences(input.references), postId, authorId: userId,
    });
    await ForumPostModel.updateOne({ _id: postId }, { $inc: { commentCount: 1 } });
    if (String(post.authorId) !== userId) {
      await notificationService.create({
        userId: String(post.authorId), title: "New comment on your forum post",
        message: `Someone commented on “${post.title}”.`, type: "forum_comment_created",
        targetKind: "forum_post", targetId: String(post._id),
      });
    }
    return comment;
  },

  async listComments(postId: string, page: number, pageSize: number, actorId?: string, actorRole?: UserRole) {
    const post = await ForumPostModel.findOne({ _id: postId, status: { $in: ["active", "locked"] } }).select("communityId").lean();
    if (!post) throw AppError.notFound("Forum post not found");
    await assertCanViewCommunity(post.communityId?.toString(), actorId, actorRole);
    const query = { postId, status: "active" };
    const [data, total] = await Promise.all([
      ForumCommentModel.find(query).sort({ createdAt: 1 }).skip((page - 1) * pageSize).limit(pageSize)
        .populate("authorId", "fullName avatarUrl academicProfileType institution role").lean(),
      ForumCommentModel.countDocuments(query),
    ]);
    return { data: await attachAcademicVerification(data as Array<Record<string, any>>), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  },

  async updateComment(commentId: string, input: { content: string; references?: ReferenceInput[] }, userId: string) {
    const comment = await ForumCommentModel.findById(commentId);
    if (!comment || comment.status === "deleted") throw AppError.notFound("Comment not found");
    if (comment.authorId.toString() !== userId) throw AppError.forbidden("Only the author can edit this comment");
    comment.content = input.content;
    comment.body = input.content;
    if (input.references) comment.set("references", await prepareReferences(input.references));
    await comment.save();
    return comment;
  },

  async deleteComment(commentId: string, userId: string, role: UserRole) {
    const comment = await ForumCommentModel.findById(commentId);
    if (!comment || comment.status === "deleted") throw AppError.notFound("Comment not found");
    if (comment.authorId.toString() !== userId && role !== "admin") throw AppError.forbidden();
    comment.status = "deleted";
    await comment.save();
    await ForumPostModel.updateOne({ _id: comment.postId, commentCount: { $gt: 0 } }, { $inc: { commentCount: -1 } });
  },

  async moderateComment(commentId: string, status: "active" | "hidden", actorId: string, actorRole: UserRole) {
    const comment = await ForumCommentModel.findById(commentId).select("postId").lean();
    if (!comment) throw AppError.notFound("Comment not found");
    const post = await ForumPostModel.findById(comment.postId).select("communityId").lean();
    if (!post || !(await canModerate(post.communityId, actorId, actorRole))) throw AppError.forbidden();
    const updated = await ForumCommentModel.findByIdAndUpdate(commentId, { $set: { status } }, { new: true });
    await auditService.log("forum.comment.moderated", {
      userId: actorId, targetTableName: "forum_comments", targetRecordId: commentId,
      details: { status, communityId: post.communityId },
    });
    return updated;
  },

  async acceptAnswer(postId: string, commentId: string, userId: string) {
    const post = await ForumPostModel.findById(postId);
    if (!post || post.status === "deleted") throw AppError.notFound("Forum post not found");
    if (post.type !== "question") throw AppError.badRequest("Only question posts can accept an answer");
    if (post.authorId.toString() !== userId) throw AppError.forbidden("Only the question author can accept an answer");
    const comment = await ForumCommentModel.findOne({ _id: commentId, postId, status: "active" }).lean();
    if (!comment) throw AppError.badRequest("The answer does not belong to this question");
    post.acceptedCommentId = new mongoose.Types.ObjectId(commentId);
    await post.save();
    if (String(comment.authorId) !== userId) {
      await notificationService.create({
        userId: String(comment.authorId), title: "Your answer was accepted",
        message: `Your answer to “${post.title}” was accepted.`, type: "forum_answer_accepted",
        targetKind: "forum_post", targetId: postId,
      });
    }
    return post;
  },

  async vote(subjectKind: "post" | "comment", subjectId: string, value: -1 | 0 | 1, userId: string, actorRole: UserRole) {
    const post = subjectKind === "post"
      ? await ForumPostModel.findOne({ _id: subjectId, status: { $in: ["active", "locked"] } }).select("communityId").lean()
      : await ForumCommentModel.findOne({ _id: subjectId, status: "active" }).select("postId").lean()
        .then((comment) => comment
          ? ForumPostModel.findOne({ _id: comment.postId, status: { $in: ["active", "locked"] } }).select("communityId").lean()
          : null);
    if (!post) throw AppError.notFound(`${subjectKind === "post" ? "Post" : "Comment"} not found`);
    await assertCanViewCommunity(post.communityId?.toString(), userId, actorRole);
    if (value === 0) await ForumVoteModel.deleteOne({ subjectKind, subjectId, userId });
    else await ForumVoteModel.findOneAndUpdate(
      { subjectKind, subjectId, userId },
      { $set: { value }, $setOnInsert: { subjectKind, subjectId, userId } },
      { upsert: true, new: true, runValidators: true },
    );
    return { subjectKind, subjectId, value, score: await recalculateScore(subjectKind, subjectId) };
  },

  async report(targetType: "post" | "comment", targetId: string, input: { reason: string; description?: string }, userId: string) {
    const post = targetType === "post"
      ? await ForumPostModel.findById(targetId).select("communityId status").lean()
      : await ForumCommentModel.findById(targetId).select("postId status").lean()
        .then((comment) => comment ? ForumPostModel.findById(comment.postId).select("communityId status").lean() : null);
    if (!post || post.status === "deleted") throw AppError.notFound("Report target not found");
    try {
      return await ContentReportModel.create({ reporterId: userId, targetType, targetId, communityId: post.communityId, ...input });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) throw AppError.conflict("You already have an open report for this content");
      throw error;
    }
  },

  async listReports(communityId: string, actorId: string, actorRole: UserRole) {
    if (!(await canModerate(communityId, actorId, actorRole))) throw AppError.forbidden();
    return ContentReportModel.find({ communityId, status: "open" }).sort({ createdAt: 1 }).lean();
  },

  async reviewReport(reportId: string, input: { status: "reviewed" | "resolved" | "dismissed"; moderationNote?: string }, actorId: string, actorRole: UserRole) {
    const report = await ContentReportModel.findById(reportId);
    if (!report) throw AppError.notFound("Content report not found");
    if (!(await canModerate(report.communityId, actorId, actorRole))) throw AppError.forbidden();
    report.status = input.status;
    report.moderationNote = input.moderationNote;
    report.reviewedBy = new mongoose.Types.ObjectId(actorId);
    report.reviewedAt = new Date();
    await report.save();
    await auditService.log("forum.report.reviewed", {
      userId: actorId, targetTableName: "forum_content_reports", targetRecordId: reportId, details: input,
    });
    return report;
  },
};
