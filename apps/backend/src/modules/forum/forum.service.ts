import type { UserRole } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { auditService } from "../audit/audit.service.js";
import { getActiveCommunityMembership, isCommunityModerator } from "../communities/community.service.js";
import { notificationService } from "../notifications/notification.service.js";

type ReferenceInput = { paperId?: string; doi?: string; url?: string; title?: string };
type PostInput = {
  type?: "discussion" | "question"; title: string; content: string; communityId?: string; tags?: string[];
  linkedPaperId?: string; linkedResearchGapId?: string; linkedProjectId?: string; references?: ReferenceInput[];
};
type ReferenceRecord = { paperId: string | null; doi: string | null; url: string | null; title: string | null; verified: boolean; position: number };

function idWhere(value: string): { id: string } | { legacyMongoId: string } {
  const parsed = parseDatabaseId(value);
  if (!parsed) throw AppError.badRequest("Invalid identifier");
  return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value };
}

async function resolveUserId(value: string): Promise<string> {
  const row = await getPrisma().user.findUnique({ where: idWhere(value), select: { id: true } });
  if (!row) throw AppError.notFound("User not found");
  return row.id;
}
async function resolveCommunity(value: string) {
  const row = await getPrisma().community.findUnique({ where: idWhere(value), select: { id: true, legacyMongoId: true, name: true, slug: true, visibility: true } });
  if (!row) throw AppError.notFound("Community not found");
  return row;
}
async function resolvePost(value: string) {
  const row = await getPrisma().forumPost.findUnique({ where: idWhere(value) });
  if (!row) throw AppError.notFound("Forum post not found");
  return row;
}
async function resolveComment(value: string) {
  const row = await getPrisma().forumComment.findUnique({ where: idWhere(value) });
  if (!row) throw AppError.notFound("Comment not found");
  return row;
}
async function resolvePaper(value?: string): Promise<string | undefined> {
  if (!value) return undefined;
  const row = await getPrisma().paper.findUnique({ where: idWhere(value), select: { id: true } });
  if (!row) throw AppError.badRequest("A linked academic entity does not exist");
  return row.id;
}
async function resolveGap(value?: string): Promise<string | undefined> {
  if (!value) return undefined;
  const row = await getPrisma().researchGap.findUnique({ where: idWhere(value), select: { id: true } });
  if (!row) throw AppError.badRequest("A linked academic entity does not exist");
  return row.id;
}
async function resolveProject(value?: string): Promise<string | undefined> {
  if (!value) return undefined;
  const row = await getPrisma().project.findUnique({ where: idWhere(value), select: { id: true } });
  if (!row) throw AppError.badRequest("A linked academic entity does not exist");
  return row.id;
}

async function assertCanPostToCommunity(communityId: string | undefined, userId: string): Promise<string | undefined> {
  if (!communityId) return undefined;
  const community = await resolveCommunity(communityId);
  if (!(await getActiveCommunityMembership(community.id, userId))) throw AppError.forbidden("Active community membership is required to post");
  return community.id;
}
async function assertCanViewCommunity(communityId: string | undefined, userId?: string, role?: UserRole): Promise<void> {
  if (!communityId) return;
  const community = await resolveCommunity(communityId);
  if (community.visibility === "private" && role !== "admin" && (!userId || !(await getActiveCommunityMembership(community.id, userId)))) {
    throw AppError.forbidden("This community is private");
  }
}
async function visibleCommunityIds(userId?: string, role?: UserRole): Promise<string[]> {
  const prisma = getPrisma();
  if (role === "admin") return (await prisma.community.findMany({ select: { id: true } })).map((row) => row.id);
  const publicIds = (await prisma.community.findMany({ where: { visibility: "public" }, select: { id: true } })).map((row) => row.id);
  if (!userId) return publicIds;
  const resolvedUserId = await resolveUserId(userId);
  const memberIds = (await prisma.communityMembership.findMany({ where: { userId: resolvedUserId, status: "active" }, select: { communityId: true } })).map((row) => row.communityId);
  return [...new Set([...publicIds, ...memberIds])];
}
async function canModerate(communityId: string | null | undefined, actorId: string, role: UserRole): Promise<boolean> {
  return role === "admin" || Boolean(communityId && await isCommunityModerator(communityId, actorId));
}

async function prepareReferences(references: ReferenceInput[] = []): Promise<ReferenceRecord[]> {
  return Promise.all(references.map(async (reference, position) => {
    if (!reference.paperId) return { paperId: null, doi: reference.doi ?? null, url: reference.url ?? null, title: reference.title ?? null, verified: false, position };
    const paper = await getPrisma().paper.findUnique({ where: idWhere(reference.paperId), select: { id: true, title: true, doi: true } });
    if (!paper) throw AppError.badRequest("A referenced paper does not exist");
    return { paperId: paper.id, doi: paper.doi ?? reference.doi ?? null, url: reference.url ?? null, title: paper.title, verified: true, position };
  }));
}

async function academicAuthors(userIds: string[]) {
  if (!userIds.length) return new Map<string, Record<string, unknown>>();
  const ids = [...new Set(userIds)];
  const prisma = getPrisma();
  const [users, profiles] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, legacyMongoId: true, fullName: true, avatarUrl: true, academicProfileType: true, institution: true, role: true } }),
    prisma.academicProfile.findMany({ where: { userId: { in: ids } }, select: { userId: true, verificationStatus: true, academicTitle: true } }),
  ]);
  const profileByUser = new Map(profiles.map((profile) => [profile.userId, profile]));
  return new Map(users.map((user) => {
    const id = publicDatabaseId(user); const profile = profileByUser.get(user.id);
    return [user.id, { _id: id, id, fullName: user.fullName, avatarUrl: user.avatarUrl, academicProfileType: user.academicProfileType, institution: user.institution, role: user.role, academicVerificationStatus: profile?.verificationStatus ?? "SELF_DECLARED", academicTitle: profile?.academicTitle }];
  }));
}

async function publicIdsFor(model: "paper" | "gap" | "project" | "comment", ids: Array<string | null | undefined>) {
  const uniqueIds = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!uniqueIds.length) return new Map<string, string>();
  const prisma = getPrisma();
  const rows = model === "paper" ? await prisma.paper.findMany({ where: { id: { in: uniqueIds } }, select: { id: true, legacyMongoId: true } })
    : model === "gap" ? await prisma.researchGap.findMany({ where: { id: { in: uniqueIds } }, select: { id: true, legacyMongoId: true } })
      : model === "project" ? await prisma.project.findMany({ where: { id: { in: uniqueIds } }, select: { id: true, legacyMongoId: true } })
        : await prisma.forumComment.findMany({ where: { id: { in: uniqueIds } }, select: { id: true, legacyMongoId: true } });
  return new Map(rows.map((row) => [row.id, publicDatabaseId(row)]));
}

async function presentPosts(posts: Array<Awaited<ReturnType<typeof resolvePost>>>) {
  if (!posts.length) return [];
  const prisma = getPrisma(); const postIds = posts.map((post) => post.id);
  const [authors, communities, references, postPapers, paperIds, gapIds, projectIds, commentIds] = await Promise.all([
    academicAuthors(posts.map((post) => post.authorId)),
    prisma.community.findMany({ where: { id: { in: posts.flatMap((post) => post.communityId ? [post.communityId] : []) } }, select: { id: true, legacyMongoId: true, name: true, slug: true } }),
    prisma.forumReference.findMany({ where: { postId: { in: postIds } }, orderBy: { position: "asc" } }),
    prisma.forumPostPaper.findMany({ where: { postId: { in: postIds } }, orderBy: { position: "asc" } }),
    publicIdsFor("paper", posts.map((post) => post.linkedPaperId)), publicIdsFor("gap", posts.flatMap((post) => [post.researchGapId, post.linkedResearchGapId])),
    publicIdsFor("project", posts.map((post) => post.linkedProjectId)), publicIdsFor("comment", posts.map((post) => post.acceptedCommentId)),
  ]);
  const communityById = new Map(communities.map((community) => { const id = publicDatabaseId(community); return [community.id, { _id: id, id, name: community.name, slug: community.slug }]; }));
  const referencesByPost = new Map<string, typeof references>();
  for (const reference of references) { const list = referencesByPost.get(reference.postId!) ?? []; list.push(reference); referencesByPost.set(reference.postId!, list); }
  const papersByPost = new Map<string, string[]>(); const allPaperIds = await publicIdsFor("paper", postPapers.map((row) => row.paperId));
  for (const row of postPapers) { const list = papersByPost.get(row.postId) ?? []; list.push(allPaperIds.get(row.paperId) ?? row.paperId); papersByPost.set(row.postId, list); }
  return posts.map((post) => {
    const id = publicDatabaseId(post); const linkedPaperId = post.linkedPaperId ? paperIds.get(post.linkedPaperId) ?? post.linkedPaperId : undefined;
    return { ...post, _id: id, id, content: post.body, authorId: authors.get(post.authorId) ?? post.authorId,
      communityId: post.communityId ? communityById.get(post.communityId) ?? post.communityId : undefined,
      researchGapId: post.researchGapId ? gapIds.get(post.researchGapId) ?? post.researchGapId : undefined,
      paperIds: papersByPost.get(post.id) ?? (linkedPaperId ? [linkedPaperId] : []), linkedPaperId,
      linkedResearchGapId: post.linkedResearchGapId ? gapIds.get(post.linkedResearchGapId) ?? post.linkedResearchGapId : undefined,
      linkedProjectId: post.linkedProjectId ? projectIds.get(post.linkedProjectId) ?? post.linkedProjectId : undefined,
      acceptedCommentId: post.acceptedCommentId ? commentIds.get(post.acceptedCommentId) ?? post.acceptedCommentId : undefined,
      references: (referencesByPost.get(post.id) ?? []).map(({ id: _id, postId: _postId, commentId: _commentId, position: _position, ...reference }) => reference) };
  });
}

async function presentComments(comments: Array<Awaited<ReturnType<typeof resolveComment>>>) {
  if (!comments.length) return [];
  const prisma = getPrisma();
  const [authors, references, parentIds] = await Promise.all([
    academicAuthors(comments.map((comment) => comment.authorId)),
    prisma.forumReference.findMany({ where: { commentId: { in: comments.map((comment) => comment.id) } }, orderBy: { position: "asc" } }),
    publicIdsFor("comment", comments.map((comment) => comment.parentCommentId)),
  ]);
  const refsByComment = new Map<string, typeof references>();
  for (const reference of references) { const list = refsByComment.get(reference.commentId!) ?? []; list.push(reference); refsByComment.set(reference.commentId!, list); }
  return comments.map((comment) => { const id = publicDatabaseId(comment); return { ...comment, _id: id, id, content: comment.body,
    authorId: authors.get(comment.authorId) ?? comment.authorId, parentCommentId: comment.parentCommentId ? parentIds.get(comment.parentCommentId) ?? comment.parentCommentId : undefined,
    references: (refsByComment.get(comment.id) ?? []).map(({ id: _id, postId: _postId, commentId: _commentId, position: _position, ...reference }) => reference) }; });
}

export const forumService = {
  async createPost(input: PostInput, userId: string) {
    const [authorId, communityId, linkedPaperId, linkedResearchGapId, linkedProjectId, references] = await Promise.all([
      resolveUserId(userId), assertCanPostToCommunity(input.communityId, userId), resolvePaper(input.linkedPaperId), resolveGap(input.linkedResearchGapId), resolveProject(input.linkedProjectId), prepareReferences(input.references),
    ]);
    const post = await getPrisma().$transaction(async (tx) => {
      const created = await tx.forumPost.create({ data: { authorId, communityId, researchGapId: linkedResearchGapId, linkedPaperId, linkedResearchGapId, linkedProjectId, type: input.type ?? "discussion", title: input.title, body: input.content, tags: input.tags ?? [] } });
      if (linkedPaperId) await tx.forumPostPaper.create({ data: { postId: created.id, paperId: linkedPaperId, position: 0 } });
      if (references.length) await tx.forumReference.createMany({ data: references.map((reference) => ({ ...reference, postId: created.id })) });
      return created;
    });
    await auditService.log("forum.post.created", { userId, targetTableName: "forum_posts", targetRecordId: post.id });
    return (await presentPosts([post]))[0];
  },

  async listPosts(filter: { communityId?: string; linkedResearchGapId?: string; type?: string; tag?: string }, page: number, pageSize: number, actorId?: string, actorRole?: UserRole) {
    const prisma = getPrisma(); const where: Record<string, unknown> = { status: { in: ["active", "locked"] } };
    if (filter.linkedResearchGapId) where.linkedResearchGapId = await resolveGap(filter.linkedResearchGapId);
    if (filter.type) where.type = filter.type; if (filter.tag) where.tags = { has: filter.tag };
    if (filter.communityId) { const community = await resolveCommunity(filter.communityId); await assertCanViewCommunity(community.id, actorId, actorRole); where.communityId = community.id; }
    else where.OR = [{ communityId: null }, { communityId: { in: await visibleCommunityIds(actorId, actorRole) } }];
    const [data, total] = await Promise.all([prisma.forumPost.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }), prisma.forumPost.count({ where })]);
    return { data: await presentPosts(data), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  },

  async getPost(postId: string, actorId?: string, actorRole?: UserRole) {
    const post = await resolvePost(postId); if (post.status === "deleted") throw AppError.notFound("Forum post not found");
    await assertCanViewCommunity(post.communityId ?? undefined, actorId, actorRole);
    if (post.status === "hidden" && (!actorId || (await resolveUserId(actorId)) !== post.authorId && !(await canModerate(post.communityId, actorId, actorRole!)))) throw AppError.notFound("Forum post not found");
    return (await presentPosts([post]))[0];
  },

  async updatePost(postId: string, input: Partial<PostInput>, userId: string) {
    const post = await resolvePost(postId); if (post.status === "deleted") throw AppError.notFound("Forum post not found");
    if (post.authorId !== await resolveUserId(userId)) throw AppError.forbidden("Only the author can edit this post");
    const [linkedPaperId, linkedResearchGapId, linkedProjectId, references] = await Promise.all([
      input.linkedPaperId !== undefined ? resolvePaper(input.linkedPaperId) : undefined,
      input.linkedResearchGapId !== undefined ? resolveGap(input.linkedResearchGapId) : undefined,
      input.linkedProjectId !== undefined ? resolveProject(input.linkedProjectId) : undefined,
      input.references !== undefined ? prepareReferences(input.references) : undefined,
    ]);
    const updated = await getPrisma().$transaction(async (tx) => {
      const result = await tx.forumPost.update({ where: { id: post.id }, data: {
        ...(input.type !== undefined ? { type: input.type } : {}), ...(input.title !== undefined ? { title: input.title } : {}), ...(input.content !== undefined ? { body: input.content } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}), ...(input.linkedPaperId !== undefined ? { linkedPaperId } : {}),
        ...(input.linkedResearchGapId !== undefined ? { linkedResearchGapId, researchGapId: linkedResearchGapId } : {}), ...(input.linkedProjectId !== undefined ? { linkedProjectId } : {}),
      } });
      if (input.linkedPaperId !== undefined) { await tx.forumPostPaper.deleteMany({ where: { postId: post.id } }); if (linkedPaperId) await tx.forumPostPaper.create({ data: { postId: post.id, paperId: linkedPaperId, position: 0 } }); }
      if (references !== undefined) { await tx.forumReference.deleteMany({ where: { postId: post.id } }); if (references.length) await tx.forumReference.createMany({ data: references.map((reference) => ({ ...reference, postId: post.id })) }); }
      return result;
    });
    return (await presentPosts([updated]))[0];
  },

  async deletePost(postId: string, userId: string, role: UserRole) {
    const post = await resolvePost(postId); if (post.status === "deleted") throw AppError.notFound("Forum post not found");
    if (post.authorId !== await resolveUserId(userId) && role !== "admin") throw AppError.forbidden();
    await getPrisma().forumPost.update({ where: { id: post.id }, data: { status: "deleted" } });
  },
  async moderatePost(postId: string, status: "active" | "hidden" | "locked" | "deleted", actorId: string, actorRole: UserRole) {
    const post = await resolvePost(postId); if (!(await canModerate(post.communityId, actorId, actorRole))) throw AppError.forbidden("Forum moderator access is required in this community");
    const updated = await getPrisma().forumPost.update({ where: { id: post.id }, data: { status } });
    await auditService.log("forum.post.moderated", { userId: actorId, targetTableName: "forum_posts", targetRecordId: post.id, details: { status, communityId: post.communityId } });
    return (await presentPosts([updated]))[0];
  },

  async addComment(postId: string, input: { content: string; parentCommentId?: string; references?: ReferenceInput[] }, userId: string) {
    const post = await resolvePost(postId); if (["deleted", "hidden"].includes(post.status)) throw AppError.notFound("Forum post not found"); if (post.status === "locked") throw AppError.conflict("This post is locked");
    await assertCanPostToCommunity(post.communityId ?? undefined, userId); const authorId = await resolveUserId(userId);
    const parent = input.parentCommentId ? await resolveComment(input.parentCommentId) : undefined; if (parent && (parent.postId !== post.id || parent.status !== "active")) throw AppError.badRequest("Parent comment does not belong to this post");
    const references = await prepareReferences(input.references);
    const comment = await getPrisma().$transaction(async (tx) => { const created = await tx.forumComment.create({ data: { postId: post.id, authorId, parentCommentId: parent?.id, body: input.content } });
      if (references.length) await tx.forumReference.createMany({ data: references.map((reference) => ({ ...reference, commentId: created.id })) });
      await tx.forumPost.update({ where: { id: post.id }, data: { commentCount: { increment: 1 } } }); return created; });
    if (post.authorId !== authorId) await notificationService.create({ userId: post.authorId, title: "New comment on your forum post", message: `Someone commented on “${post.title}”.`, type: "forum_comment_created", targetKind: "forum_post", targetId: post.id });
    return (await presentComments([comment]))[0];
  },

  async listComments(postId: string, page: number, pageSize: number, actorId?: string, actorRole?: UserRole) {
    const post = await resolvePost(postId); if (!["active", "locked"].includes(post.status)) throw AppError.notFound("Forum post not found"); await assertCanViewCommunity(post.communityId ?? undefined, actorId, actorRole);
    const where = { postId: post.id, status: "active" }; const [data, total] = await Promise.all([
      getPrisma().forumComment.findMany({ where, orderBy: { createdAt: "asc" }, skip: (page - 1) * pageSize, take: pageSize }), getPrisma().forumComment.count({ where }),
    ]);
    return { data: await presentComments(data), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  },
  async updateComment(commentId: string, input: { content: string; references?: ReferenceInput[] }, userId: string) {
    const comment = await resolveComment(commentId); if (comment.status === "deleted") throw AppError.notFound("Comment not found"); if (comment.authorId !== await resolveUserId(userId)) throw AppError.forbidden("Only the author can edit this comment");
    const references = input.references !== undefined ? await prepareReferences(input.references) : undefined;
    const updated = await getPrisma().$transaction(async (tx) => { const result = await tx.forumComment.update({ where: { id: comment.id }, data: { body: input.content } });
      if (references !== undefined) { await tx.forumReference.deleteMany({ where: { commentId: comment.id } }); if (references.length) await tx.forumReference.createMany({ data: references.map((reference) => ({ ...reference, commentId: comment.id })) }); } return result; });
    return (await presentComments([updated]))[0];
  },
  async deleteComment(commentId: string, userId: string, role: UserRole) {
    const comment = await resolveComment(commentId); if (comment.status === "deleted") throw AppError.notFound("Comment not found"); if (comment.authorId !== await resolveUserId(userId) && role !== "admin") throw AppError.forbidden();
    await getPrisma().$transaction(async (tx) => { await tx.forumComment.update({ where: { id: comment.id }, data: { status: "deleted" } }); const post = await tx.forumPost.findUniqueOrThrow({ where: { id: comment.postId }, select: { commentCount: true } }); if (post.commentCount > 0) await tx.forumPost.update({ where: { id: comment.postId }, data: { commentCount: { decrement: 1 } } }); });
  },
  async moderateComment(commentId: string, status: "active" | "hidden", actorId: string, actorRole: UserRole) {
    const comment = await resolveComment(commentId); const post = await getPrisma().forumPost.findUnique({ where: { id: comment.postId } }); if (!post || !(await canModerate(post.communityId, actorId, actorRole))) throw AppError.forbidden();
    const updated = await getPrisma().forumComment.update({ where: { id: comment.id }, data: { status } }); await auditService.log("forum.comment.moderated", { userId: actorId, targetTableName: "forum_comments", targetRecordId: comment.id, details: { status, communityId: post.communityId } }); return (await presentComments([updated]))[0];
  },
  async acceptAnswer(postId: string, commentId: string, userId: string) {
    const [post, comment] = await Promise.all([resolvePost(postId), resolveComment(commentId)]); if (post.status === "deleted") throw AppError.notFound("Forum post not found"); if (post.type !== "question") throw AppError.badRequest("Only question posts can accept an answer"); if (post.authorId !== await resolveUserId(userId)) throw AppError.forbidden("Only the question author can accept an answer"); if (comment.postId !== post.id || comment.status !== "active") throw AppError.badRequest("The answer does not belong to this question");
    const updated = await getPrisma().forumPost.update({ where: { id: post.id }, data: { acceptedCommentId: comment.id } }); if (comment.authorId !== post.authorId) await notificationService.create({ userId: comment.authorId, title: "Your answer was accepted", message: `Your answer to “${post.title}” was accepted.`, type: "forum_answer_accepted", targetKind: "forum_post", targetId: post.id }); return (await presentPosts([updated]))[0];
  },

  async vote(subjectKind: "post" | "comment", subjectId: string, value: -1 | 0 | 1, userId: string, actorRole: UserRole) {
    const prisma = getPrisma(); const resolvedUserId = await resolveUserId(userId); const subject = subjectKind === "post" ? await resolvePost(subjectId) : await resolveComment(subjectId);
    const post = subjectKind === "post" ? subject as Awaited<ReturnType<typeof resolvePost>> : await prisma.forumPost.findUnique({ where: { id: (subject as Awaited<ReturnType<typeof resolveComment>>).postId } });
    if (!post || !["active", "locked"].includes(post.status)) throw AppError.notFound(`${subjectKind === "post" ? "Post" : "Comment"} not found`); await assertCanViewCommunity(post.communityId ?? undefined, userId, actorRole);
    const target = subjectKind === "post" ? { postId: subject.id, commentId: null } : { postId: null, commentId: subject.id };
    const score = await prisma.$transaction(async (tx) => { const existing = await tx.forumVote.findFirst({ where: { userId: resolvedUserId, ...target } }); if (value === 0) { if (existing) await tx.forumVote.delete({ where: { id: existing.id } }); } else if (existing) await tx.forumVote.update({ where: { id: existing.id }, data: { value } }); else await tx.forumVote.create({ data: { userId: resolvedUserId, value, ...target } });
      const aggregate = await tx.forumVote.aggregate({ where: target, _sum: { value: true } }); const nextScore = aggregate._sum.value ?? 0; if (subjectKind === "post") await tx.forumPost.update({ where: { id: subject.id }, data: { score: nextScore, voteScore: nextScore } }); else await tx.forumComment.update({ where: { id: subject.id }, data: { score: nextScore, voteScore: nextScore } }); return nextScore; });
    return { subjectKind, subjectId: publicDatabaseId(subject), value, score };
  },

  async report(targetType: "post" | "comment", targetId: string, input: { reason: string; description?: string }, userId: string) {
    const prisma = getPrisma(); const reporterId = await resolveUserId(userId); const target = targetType === "post" ? await resolvePost(targetId) : await resolveComment(targetId);
    const post = targetType === "post" ? target as Awaited<ReturnType<typeof resolvePost>> : await prisma.forumPost.findUnique({ where: { id: (target as Awaited<ReturnType<typeof resolveComment>>).postId } });
    if (!post || post.status === "deleted") throw AppError.notFound("Report target not found"); const targetWhere = targetType === "post" ? { postId: target.id } : { commentId: target.id };
    if (await prisma.contentReport.findFirst({ where: { reporterId, status: "open", ...targetWhere } })) throw AppError.conflict("You already have an open report for this content");
    const report = await prisma.contentReport.create({ data: { reporterId, communityId: post.communityId, reason: input.reason, description: input.description, ...targetWhere } });
    return { ...report, id: publicDatabaseId(report), _id: publicDatabaseId(report), targetType, targetId: publicDatabaseId(target) };
  },
  async listReports(communityId: string, actorId: string, actorRole: UserRole) {
    const community = await resolveCommunity(communityId); if (!(await canModerate(community.id, actorId, actorRole))) throw AppError.forbidden();
    const reports = await getPrisma().contentReport.findMany({ where: { communityId: community.id, status: "open" }, orderBy: { createdAt: "asc" } }); return reports.map((report) => ({ ...report, id: publicDatabaseId(report), _id: publicDatabaseId(report), targetType: report.postId ? "post" : "comment", targetId: report.postId ?? report.commentId }));
  },
  async reviewReport(reportId: string, input: { status: "reviewed" | "resolved" | "dismissed"; moderationNote?: string }, actorId: string, actorRole: UserRole) {
    const report = await getPrisma().contentReport.findUnique({ where: idWhere(reportId) }); if (!report) throw AppError.notFound("Content report not found"); if (!(await canModerate(report.communityId, actorId, actorRole))) throw AppError.forbidden();
    const updated = await getPrisma().contentReport.update({ where: { id: report.id }, data: { ...input, reviewedById: await resolveUserId(actorId), reviewedAt: new Date() } }); await auditService.log("forum.report.reviewed", { userId: actorId, targetTableName: "forum_content_reports", targetRecordId: report.id, details: input }); return { ...updated, id: publicDatabaseId(updated), _id: publicDatabaseId(updated), targetType: updated.postId ? "post" : "comment", targetId: updated.postId ?? updated.commentId };
  },
};
