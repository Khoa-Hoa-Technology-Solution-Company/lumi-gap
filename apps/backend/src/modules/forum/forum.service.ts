import type { ForumPostType, ForumSort, UserRole } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { auditService } from "../audit/audit.service.js";
import { getActiveCommunityMembership, isCommunityModerator } from "../communities/community.service.js";
import { notificationService } from "../notifications/notification.service.js";
import {
  canExposeForumGap,
  canExposeForumProject,
  canShowAcademicIdentity,
  cleanForumText,
  flattenedReplyParent,
  normalizeForumPostType,
  normalizeForumTags,
} from "./forum.rules.js";

type ReferenceInput = { paperId?: string; doi?: string; url?: string; title?: string; authors?: string[]; year?: number };
type PostInput = {
  type?: ForumPostType; title: string; content: string; communityId?: string; tags?: string[];
  linkedPaperId?: string; linkedResearchGapId?: string; linkedProjectId?: string; references?: ReferenceInput[];
};
type ReferenceRecord = { paperId: string | null; doi: string | null; url: string | null; title: string | null; authors: string[]; year: number | null; verified: boolean; position: number };
type ReportRecord = {
  id: string; legacyMongoId: string | null; reporterId: string; postId: string | null; commentId: string | null;
  communityId: string | null; reason: string; description: string | null; status: string; reviewedById: string | null;
  reviewedAt: Date | null; moderationNote: string | null; createdAt: Date; updatedAt: Date;
};

const isUniqueViolation = (error: unknown) => (error as { code?: string }).code === "P2002";

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
  const row = await getPrisma().community.findUnique({ where: idWhere(value), select: { id: true, legacyMongoId: true, name: true, slug: true, visibility: true, status: true } });
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
  const row = await getPrisma().paper.findUnique({ where: idWhere(value), select: { id: true, dataStatus: true } });
  if (!row) throw AppError.badRequest("A linked academic entity does not exist");
  if (row.dataStatus !== "active") throw AppError.forbidden("Only active paper metadata can be linked publicly");
  return row.id;
}
async function resolveGap(value?: string, requireShareable = false): Promise<string | undefined> {
  if (!value) return undefined;
  const row = await getPrisma().researchGap.findUnique({ where: idWhere(value), select: { id: true, forumShareable: true } });
  if (!row) throw AppError.badRequest("A linked academic entity does not exist");
  if (requireShareable && !canExposeForumGap(row.forumShareable)) throw AppError.forbidden("This research gap is not shareable in the public forum");
  return row.id;
}
async function resolveProject(value?: string): Promise<string | undefined> {
  if (!value) return undefined;
  const row = await getPrisma().project.findUnique({ where: idWhere(value), select: { id: true, visibility: true } });
  if (!row) throw AppError.badRequest("A linked academic entity does not exist");
  if (!canExposeForumProject(row.visibility)) throw AppError.forbidden("Only a project with a public summary can be linked in the forum");
  return row.id;
}

async function assertCanPostToCommunity(communityId: string | undefined, userId: string): Promise<string | undefined> {
  if (!communityId) return undefined;
  const community = await resolveCommunity(communityId);
  if (community.status !== "ACTIVE") throw AppError.conflict("Archived communities are read-only");
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
    if (!reference.paperId) return {
      paperId: null, doi: reference.doi?.toLocaleLowerCase() ?? null, url: reference.url ?? null,
      title: reference.title ? cleanForumText(reference.title) : null,
      authors: (reference.authors ?? []).map(cleanForumText).filter(Boolean), year: reference.year ?? null,
      verified: false, position,
    };
    const paper = await getPrisma().paper.findUnique({ where: idWhere(reference.paperId), select: { id: true, title: true, doi: true, publicationYear: true, dataStatus: true } });
    if (!paper || paper.dataStatus !== "active") throw AppError.badRequest("A referenced paper is not publicly available");
    return { paperId: paper.id, doi: paper.doi ?? reference.doi?.toLocaleLowerCase() ?? null, url: reference.url ?? null, title: paper.title, authors: [], year: paper.publicationYear, verified: true, position };
  }));
}

async function academicAuthors(userIds: string[], viewerId?: string) {
  if (!userIds.length) return new Map<string, Record<string, unknown>>();
  const ids = [...new Set(userIds)];
  const prisma = getPrisma();
  const [users, profiles] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, legacyMongoId: true, fullName: true, avatarUrl: true, academicProfileType: true, institution: true, role: true } }),
    prisma.academicProfile.findMany({ where: { userId: { in: ids } }, select: { userId: true, affiliationStatus: true, academicTitle: true, profileVisibility: true } }),
  ]);
  const profileByUser = new Map(profiles.map((profile) => [profile.userId, profile]));
  return new Map(users.map((user) => {
    const id = publicDatabaseId(user); const profile = profileByUser.get(user.id);
    const showAcademicIdentity = canShowAcademicIdentity(profile?.profileVisibility, Boolean(viewerId), viewerId === user.id);
    return [user.id, {
      _id: id, id, fullName: user.fullName, avatarUrl: user.avatarUrl,
      academicProfileType: showAcademicIdentity ? user.academicProfileType : undefined,
      institution: showAcademicIdentity ? user.institution : undefined,
      role: user.role,
      affiliationVerified: showAcademicIdentity && profile?.affiliationStatus === "VERIFIED",
      academicTitle: showAcademicIdentity ? profile?.academicTitle : undefined,
    }];
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

async function forumResearchContexts(posts: Array<Awaited<ReturnType<typeof resolvePost>>>) {
  const prisma = getPrisma();
  const paperIds = [...new Set(posts.flatMap((post) => post.linkedPaperId ? [post.linkedPaperId] : []))];
  const gapIds = [...new Set(posts.flatMap((post) => [post.researchGapId, post.linkedResearchGapId].filter((id): id is string => Boolean(id))))];
  const projectIds = [...new Set(posts.flatMap((post) => post.linkedProjectId ? [post.linkedProjectId] : []))];
  const [papers, gaps, projects] = await Promise.all([
    paperIds.length ? prisma.paper.findMany({ where: { id: { in: paperIds }, dataStatus: "active" }, select: { id: true, legacyMongoId: true, title: true, doi: true, publicationYear: true } }) : [],
    gapIds.length ? prisma.researchGap.findMany({ where: { id: { in: gapIds }, forumShareable: true, status: "active" }, select: { id: true, legacyMongoId: true, title: true, topic: true } }) : [],
    projectIds.length ? prisma.project.findMany({ where: { id: { in: projectIds }, visibility: "PUBLIC_SUMMARY", archivedAt: null }, select: { id: true, legacyMongoId: true, title: true } }) : [],
  ]);
  return {
    papers: new Map(papers.map((paper) => [paper.id, { id: publicDatabaseId(paper), title: paper.title, doi: paper.doi ?? undefined, publicationYear: paper.publicationYear }])),
    gaps: new Map(gaps.map((gap) => [gap.id, { id: publicDatabaseId(gap), title: gap.title, topic: gap.topic }])),
    projects: new Map(projects.map((project) => [project.id, { id: publicDatabaseId(project), title: project.title }])),
  };
}

async function presentPosts(posts: Array<Awaited<ReturnType<typeof resolvePost>>>, viewerInput?: string, viewerRole?: UserRole) {
  if (!posts.length) return [];
  const prisma = getPrisma(); const postIds = posts.map((post) => post.id);
  const viewerId = viewerInput ? await resolveUserId(viewerInput) : undefined;
  const [authors, communities, references, postPapers, researchContexts, commentIds, viewerVotes, follows] = await Promise.all([
    academicAuthors(posts.map((post) => post.authorId), viewerId),
    prisma.community.findMany({ where: { id: { in: posts.flatMap((post) => post.communityId ? [post.communityId] : []) } }, select: { id: true, legacyMongoId: true, name: true, slug: true } }),
    prisma.forumReference.findMany({ where: { postId: { in: postIds } }, orderBy: { position: "asc" } }),
    prisma.forumPostPaper.findMany({ where: { postId: { in: postIds } }, orderBy: { position: "asc" } }),
    forumResearchContexts(posts), publicIdsFor("comment", posts.map((post) => post.acceptedCommentId)),
    viewerId ? prisma.forumVote.findMany({ where: { userId: viewerId, postId: { in: postIds } } }) : [],
    viewerId ? prisma.forumThreadFollow.findMany({ where: { userId: viewerId, postId: { in: postIds } } }) : [],
  ]);
  const communityById = new Map(communities.map((community) => { const id = publicDatabaseId(community); return [community.id, { _id: id, id, name: community.name, slug: community.slug }]; }));
  const referencesByPost = new Map<string, typeof references>();
  for (const reference of references) { const list = referencesByPost.get(reference.postId!) ?? []; list.push(reference); referencesByPost.set(reference.postId!, list); }
  const safePaperRows = await prisma.paper.findMany({
    where: { id: { in: [...new Set([...postPapers.map((row) => row.paperId), ...references.flatMap((reference) => reference.paperId ? [reference.paperId] : [])])] }, dataStatus: "active" },
    select: { id: true, legacyMongoId: true },
  });
  const safePaperIds = new Map(safePaperRows.map((paper) => [paper.id, publicDatabaseId(paper)]));
  const papersByPost = new Map<string, string[]>();
  for (const row of postPapers) { const safeId = safePaperIds.get(row.paperId); if (!safeId) continue; const list = papersByPost.get(row.postId) ?? []; list.push(safeId); papersByPost.set(row.postId, list); }
  const voteByPost = new Map(viewerVotes.flatMap((vote) => vote.postId ? [[vote.postId, vote.value]] : []));
  const followed = new Set(follows.map((follow) => follow.postId));
  const moderatedCommunityIds = viewerId && viewerRole !== "admin" ? new Set((await prisma.communityMembership.findMany({ where: { userId: viewerId, communityId: { in: posts.flatMap((post) => post.communityId ? [post.communityId] : []) }, status: "active", role: { in: ["owner", "moderator"] } }, select: { communityId: true } })).map((membership) => membership.communityId)) : new Set<string>();
  return posts.map((post) => {
    const id = publicDatabaseId(post); const linkedPaper = post.linkedPaperId ? researchContexts.papers.get(post.linkedPaperId) : undefined;
    const linkedGap = (post.linkedResearchGapId ? researchContexts.gaps.get(post.linkedResearchGapId) : undefined)
      ?? (post.researchGapId ? researchContexts.gaps.get(post.researchGapId) : undefined);
    const linkedProject = post.linkedProjectId ? researchContexts.projects.get(post.linkedProjectId) : undefined;
    return { ...post, _id: id, id, content: post.body, authorId: authors.get(post.authorId) ?? post.authorId,
      communityId: post.communityId ? communityById.get(post.communityId) ?? post.communityId : undefined,
      researchGapId: linkedGap?.id,
      paperIds: papersByPost.get(post.id) ?? (linkedPaper ? [linkedPaper.id] : []), linkedPaperId: linkedPaper?.id,
      linkedResearchGapId: linkedGap?.id, linkedProjectId: linkedProject?.id,
      linkedPaper, linkedResearchGap: linkedGap, linkedProject,
      acceptedCommentId: post.acceptedCommentId ? commentIds.get(post.acceptedCommentId) ?? post.acceptedCommentId : undefined,
      viewerVote: (voteByPost.get(post.id) ?? 0) as -1 | 0 | 1, isFollowing: followed.has(post.id),
      canModerate: viewerRole === "admin" || Boolean(post.communityId && moderatedCommunityIds.has(post.communityId)),
      references: (referencesByPost.get(post.id) ?? []).map(({ id: _id, postId: _postId, commentId: _commentId, position: _position, ...reference }) => ({ ...reference, paperId: reference.paperId ? safePaperIds.get(reference.paperId) : undefined })) };
  });
}

async function presentComments(comments: Array<Awaited<ReturnType<typeof resolveComment>>>, viewerInput?: string, acceptedCommentId?: string | null) {
  if (!comments.length) return [];
  const prisma = getPrisma();
  const viewerId = viewerInput ? await resolveUserId(viewerInput) : undefined;
  const [authors, references, parentIds, viewerVotes] = await Promise.all([
    academicAuthors(comments.map((comment) => comment.authorId), viewerId),
    prisma.forumReference.findMany({ where: { commentId: { in: comments.map((comment) => comment.id) } }, orderBy: { position: "asc" } }),
    publicIdsFor("comment", comments.map((comment) => comment.parentCommentId)),
    viewerId ? prisma.forumVote.findMany({ where: { userId: viewerId, commentId: { in: comments.map((comment) => comment.id) } } }) : [],
  ]);
  const refsByComment = new Map<string, typeof references>();
  for (const reference of references) { const list = refsByComment.get(reference.commentId!) ?? []; list.push(reference); refsByComment.set(reference.commentId!, list); }
  const voteByComment = new Map(viewerVotes.flatMap((vote) => vote.commentId ? [[vote.commentId, vote.value]] : []));
  return comments.map((comment) => { const id = publicDatabaseId(comment); return { ...comment, _id: id, id, content: comment.status === "deleted" ? "This response was removed by its author." : comment.body,
    authorId: authors.get(comment.authorId) ?? comment.authorId, parentCommentId: comment.parentCommentId ? parentIds.get(comment.parentCommentId) ?? comment.parentCommentId : undefined,
    viewerVote: (voteByComment.get(comment.id) ?? 0) as -1 | 0 | 1, isAccepted: acceptedCommentId === comment.id,
    references: (refsByComment.get(comment.id) ?? []).map(({ id: _id, postId: _postId, commentId: _commentId, position: _position, ...reference }) => reference) }; });
}

async function presentReports(reports: ReportRecord[]) {
  if (!reports.length) return [];
  const prisma = getPrisma();
  const comments = await prisma.forumComment.findMany({ where: { id: { in: reports.flatMap((report) => report.commentId ? [report.commentId] : []) } }, select: { id: true, legacyMongoId: true, postId: true, body: true, status: true } });
  const postIds = [...new Set([...reports.flatMap((report) => report.postId ? [report.postId] : []), ...comments.map((comment) => comment.postId)])];
  const [users, communities, posts] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...new Set(reports.map((report) => report.reporterId))] } }, select: { id: true, legacyMongoId: true, fullName: true } }),
    prisma.community.findMany({ where: { id: { in: reports.flatMap((report) => report.communityId ? [report.communityId] : []) } }, select: { id: true, legacyMongoId: true, name: true, slug: true } }),
    prisma.forumPost.findMany({ where: { id: { in: postIds } }, select: { id: true, legacyMongoId: true, title: true, body: true, status: true } }),
  ]);
  const userById = new Map(users.map((user) => [user.id, { id: publicDatabaseId(user), fullName: user.fullName }]));
  const communityById = new Map(communities.map((community) => [community.id, { id: publicDatabaseId(community), name: community.name, slug: community.slug }]));
  const postById = new Map(posts.map((post) => [post.id, post]));
  const commentById = new Map(comments.map((comment) => [comment.id, comment]));
  return reports.map((report) => {
    const comment = report.commentId ? commentById.get(report.commentId) : undefined;
    const post = report.postId ? postById.get(report.postId) : comment ? postById.get(comment.postId) : undefined;
    const target = report.postId ? post : comment;
    return {
      id: publicDatabaseId(report), targetType: report.postId ? "post" as const : "comment" as const,
      targetId: target ? publicDatabaseId(target) : "", postId: post ? publicDatabaseId(post) : "", reason: report.reason, description: report.description ?? undefined,
      status: report.status, reporter: userById.get(report.reporterId) ?? { id: "", fullName: "Unknown member" },
      community: report.communityId ? communityById.get(report.communityId) : undefined,
      target: { title: post?.title, excerpt: (report.postId ? post?.body : comment?.body)?.slice(0, 320) ?? "", status: target?.status ?? "deleted" },
      moderationNote: report.moderationNote ?? undefined, createdAt: report.createdAt, reviewedAt: report.reviewedAt ?? undefined,
    };
  });
}

async function presentModerationActions(actions: Array<{ id: string; actorId: string; communityId: string | null; postId: string | null; commentId: string | null; reportId: string | null; action: string; reason: string | null; createdAt: Date }>) {
  if (!actions.length) return [];
  const prisma = getPrisma();
  const [actors, communities, posts, comments, reports] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: [...new Set(actions.map((action) => action.actorId))] } }, select: { id: true, legacyMongoId: true, fullName: true } }),
    prisma.community.findMany({ where: { id: { in: actions.flatMap((action) => action.communityId ? [action.communityId] : []) } }, select: { id: true, legacyMongoId: true, name: true, slug: true } }),
    prisma.forumPost.findMany({ where: { id: { in: actions.flatMap((action) => action.postId ? [action.postId] : []) } }, select: { id: true, legacyMongoId: true } }),
    prisma.forumComment.findMany({ where: { id: { in: actions.flatMap((action) => action.commentId ? [action.commentId] : []) } }, select: { id: true, legacyMongoId: true } }),
    prisma.contentReport.findMany({ where: { id: { in: actions.flatMap((action) => action.reportId ? [action.reportId] : []) } }, select: { id: true, legacyMongoId: true } }),
  ]);
  const publicMap = (rows: Array<{ id: string; legacyMongoId: string | null }>) => new Map(rows.map((row) => [row.id, publicDatabaseId(row)]));
  const actorById = new Map(actors.map((actor) => [actor.id, { id: publicDatabaseId(actor), fullName: actor.fullName }]));
  const communityById = new Map(communities.map((community) => [community.id, { id: publicDatabaseId(community), name: community.name, slug: community.slug }]));
  const postIds = publicMap(posts); const commentIds = publicMap(comments); const reportIds = publicMap(reports);
  return actions.map((action) => ({
    id: action.id, action: action.action, reason: action.reason ?? undefined,
    actor: actorById.get(action.actorId) ?? { id: "", fullName: "Unknown administrator" },
    community: action.communityId ? communityById.get(action.communityId) : undefined,
    targetType: action.postId ? "post" as const : action.commentId ? "comment" as const : "report" as const,
    targetId: action.postId ? postIds.get(action.postId) ?? "" : action.commentId ? commentIds.get(action.commentId) ?? "" : action.reportId ? reportIds.get(action.reportId) ?? "" : "",
    createdAt: action.createdAt,
  }));
}

export const forumService = {
  async createPost(input: PostInput, userId: string) {
    const type = normalizeForumPostType(input.type);
    if (type === "PAPER_DISCUSSION" && !input.linkedPaperId) throw AppError.badRequest("Paper discussions require a linked LumiGap paper");
    if (type === "RESEARCH_GAP_DISCUSSION" && !input.linkedResearchGapId) throw AppError.badRequest("Research gap discussions require a shareable candidate gap");
    const [authorId, communityId, linkedPaperId, linkedResearchGapId, linkedProjectId, references] = await Promise.all([
      resolveUserId(userId), assertCanPostToCommunity(input.communityId, userId), resolvePaper(input.linkedPaperId), resolveGap(input.linkedResearchGapId, true), resolveProject(input.linkedProjectId), prepareReferences(input.references),
    ]);
    const tags = normalizeForumTags(input.tags ?? []);
    const post = await getPrisma().$transaction(async (tx) => {
      const created = await tx.forumPost.create({ data: { authorId, communityId, researchGapId: linkedResearchGapId, linkedPaperId, linkedResearchGapId, linkedProjectId, type, title: cleanForumText(input.title), body: cleanForumText(input.content), tags: tags.map((tag) => tag.name) } });
      if (linkedPaperId) await tx.forumPostPaper.create({ data: { postId: created.id, paperId: linkedPaperId, position: 0 } });
      if (linkedResearchGapId) await tx.forumPostGap.create({ data: { postId: created.id, gapId: linkedResearchGapId } });
      if (linkedProjectId) await tx.forumPostProject.create({ data: { postId: created.id, projectId: linkedProjectId } });
      for (const tag of tags) {
        const row = await tx.forumTag.upsert({ where: { slug: tag.slug }, create: tag, update: {} });
        await tx.forumPostTag.create({ data: { postId: created.id, tagId: row.id } });
      }
      if (references.length) await tx.forumReference.createMany({ data: references.map((reference) => ({ ...reference, postId: created.id, createdById: authorId })) });
      if (communityId) await tx.community.update({ where: { id: communityId }, data: { threadCount: { increment: 1 } } });
      return created;
    });
    await auditService.log("forum.post.created", { userId, targetTableName: "forum_posts", targetRecordId: post.id });
    return (await presentPosts([post], userId))[0];
  },

  async listPosts(filter: { communityId?: string; linkedResearchGapId?: string; linkedPaperId?: string; type?: string; tag?: string; query?: string; sort?: ForumSort; includeModerated?: boolean }, page: number, pageSize: number, actorId?: string, actorRole?: UserRole) {
    const prisma = getPrisma();
    const where: Record<string, unknown> = { status: { in: filter.includeModerated && actorRole === "admin" ? ["active", "locked", "hidden"] : ["active", "locked"] } };
    const conditions: Record<string, unknown>[] = [];
    if (filter.linkedResearchGapId) where.linkedResearchGapId = await resolveGap(filter.linkedResearchGapId);
    if (filter.linkedPaperId) where.linkedPaperId = await resolvePaper(filter.linkedPaperId);
    if (filter.type) where.type = normalizeForumPostType(filter.type);
    if (filter.tag) {
      const tag = normalizeForumTags([filter.tag])[0];
      const row = tag ? await prisma.forumTag.findUnique({ where: { slug: tag.slug } }) : null;
      const links = row ? await prisma.forumPostTag.findMany({ where: { tagId: row.id }, select: { postId: true } }) : [];
      where.id = { in: links.map((item) => item.postId) };
    }
    if (filter.communityId) {
      const community = await resolveCommunity(filter.communityId); await assertCanViewCommunity(community.id, actorId, actorRole); where.communityId = community.id;
    } else conditions.push({ OR: [{ communityId: null }, { communityId: { in: await visibleCommunityIds(actorId, actorRole) } }] });
    if (filter.sort === "unanswered") conditions.push({ commentCount: 0 });
    if (filter.sort === "following") {
      if (!actorId) conditions.push({ id: { in: [] } });
      else {
        const userId = await resolveUserId(actorId);
        const follows = await prisma.forumThreadFollow.findMany({ where: { userId }, select: { postId: true } });
        conditions.push({ id: { in: follows.map((follow) => follow.postId) } });
      }
    }
    const query = filter.query?.trim();
    if (query) {
      const [matchingCommunities, matchingPapers, matchingReferences, matchingTags] = await Promise.all([
        prisma.community.findMany({ where: { name: { contains: query, mode: "insensitive" } }, select: { id: true } }),
        prisma.paper.findMany({ where: { dataStatus: "active", OR: [{ title: { contains: query, mode: "insensitive" } }, { doi: { contains: query, mode: "insensitive" } }] }, select: { id: true } }),
        prisma.forumReference.findMany({ where: { OR: [{ title: { contains: query, mode: "insensitive" } }, { doi: { contains: query, mode: "insensitive" } }] }, select: { postId: true } }),
        prisma.forumTag.findMany({ where: { OR: [{ name: { contains: query, mode: "insensitive" } }, { slug: { contains: query.toLocaleLowerCase() } }] }, select: { id: true } }),
      ]);
      const tagLinks = matchingTags.length ? await prisma.forumPostTag.findMany({ where: { tagId: { in: matchingTags.map((tag) => tag.id) } }, select: { postId: true } }) : [];
      conditions.push({ OR: [
        { title: { contains: query, mode: "insensitive" } }, { body: { contains: query, mode: "insensitive" } },
        { communityId: { in: matchingCommunities.map((item) => item.id) } }, { linkedPaperId: { in: matchingPapers.map((item) => item.id) } },
        { id: { in: [...matchingReferences.flatMap((item) => item.postId ? [item.postId] : []), ...tagLinks.map((item) => item.postId)] } },
      ] });
    }
    if (conditions.length) where.AND = conditions;
    const orderBy = filter.sort === "popular"
      ? [{ isPinned: "desc" as const }, { voteScore: "desc" as const }, { commentCount: "desc" as const }, { updatedAt: "desc" as const }]
      : [{ isPinned: "desc" as const }, { updatedAt: "desc" as const }];
    const [data, total] = await Promise.all([
      prisma.forumPost.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.forumPost.count({ where }),
    ]);
    return { data: await presentPosts(data, actorId, actorRole), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  },

  async getPost(postId: string, actorId?: string, actorRole?: UserRole) {
    const post = await resolvePost(postId); if (post.status === "deleted" && post.commentCount === 0) throw AppError.notFound("Forum post not found");
    await assertCanViewCommunity(post.communityId ?? undefined, actorId, actorRole);
    if (post.status === "hidden" && (!actorId || (await resolveUserId(actorId)) !== post.authorId && !(await canModerate(post.communityId, actorId, actorRole!)))) throw AppError.notFound("Forum post not found");
    const presented = (await presentPosts([post], actorId, actorRole))[0];
    return post.status === "deleted" ? { ...presented, title: "This discussion was removed by its author.", content: "", tags: [], references: [] } : presented;
  },

  async updatePost(postId: string, input: Partial<PostInput>, userId: string) {
    const post = await resolvePost(postId); if (post.status === "deleted") throw AppError.notFound("Forum post not found");
    if (post.authorId !== await resolveUserId(userId)) throw AppError.forbidden("Only the author can edit this post");
    if (post.status === "locked") throw AppError.conflict("A locked discussion cannot be edited");
    const nextType = input.type ? normalizeForumPostType(input.type) : normalizeForumPostType(post.type);
    const nextPaperInput = input.linkedPaperId !== undefined ? input.linkedPaperId : post.linkedPaperId ?? undefined;
    const nextGapInput = input.linkedResearchGapId !== undefined ? input.linkedResearchGapId : post.linkedResearchGapId ?? undefined;
    if (nextType === "PAPER_DISCUSSION" && !nextPaperInput) throw AppError.badRequest("Paper discussions require a linked LumiGap paper");
    if (nextType === "RESEARCH_GAP_DISCUSSION" && !nextGapInput) throw AppError.badRequest("Research gap discussions require a shareable candidate gap");
    const [linkedPaperId, linkedResearchGapId, linkedProjectId, references] = await Promise.all([
      input.linkedPaperId !== undefined ? resolvePaper(input.linkedPaperId) : undefined,
      input.linkedResearchGapId !== undefined ? resolveGap(input.linkedResearchGapId, true) : undefined,
      input.linkedProjectId !== undefined ? resolveProject(input.linkedProjectId) : undefined,
      input.references !== undefined ? prepareReferences(input.references) : undefined,
    ]);
    const tags = input.tags !== undefined ? normalizeForumTags(input.tags) : undefined;
    const updated = await getPrisma().$transaction(async (tx) => {
      const result = await tx.forumPost.update({ where: { id: post.id }, data: {
        ...(input.type !== undefined ? { type: nextType } : {}), ...(input.title !== undefined ? { title: cleanForumText(input.title) } : {}), ...(input.content !== undefined ? { body: cleanForumText(input.content) } : {}),
        ...(tags !== undefined ? { tags: tags.map((tag) => tag.name) } : {}), ...(input.linkedPaperId !== undefined ? { linkedPaperId } : {}),
        ...(input.linkedResearchGapId !== undefined ? { linkedResearchGapId, researchGapId: linkedResearchGapId } : {}), ...(input.linkedProjectId !== undefined ? { linkedProjectId } : {}),
        editedAt: new Date(),
      } });
      if (input.linkedPaperId !== undefined) { await tx.forumPostPaper.deleteMany({ where: { postId: post.id } }); if (linkedPaperId) await tx.forumPostPaper.create({ data: { postId: post.id, paperId: linkedPaperId, position: 0 } }); }
      if (input.linkedResearchGapId !== undefined) { await tx.forumPostGap.deleteMany({ where: { postId: post.id } }); if (linkedResearchGapId) await tx.forumPostGap.create({ data: { postId: post.id, gapId: linkedResearchGapId } }); }
      if (input.linkedProjectId !== undefined) { await tx.forumPostProject.deleteMany({ where: { postId: post.id } }); if (linkedProjectId) await tx.forumPostProject.create({ data: { postId: post.id, projectId: linkedProjectId } }); }
      if (tags !== undefined) {
        await tx.forumPostTag.deleteMany({ where: { postId: post.id } });
        for (const tag of tags) { const row = await tx.forumTag.upsert({ where: { slug: tag.slug }, create: tag, update: {} }); await tx.forumPostTag.create({ data: { postId: post.id, tagId: row.id } }); }
      }
      if (references !== undefined) { await tx.forumReference.deleteMany({ where: { postId: post.id } }); if (references.length) await tx.forumReference.createMany({ data: references.map((reference) => ({ ...reference, postId: post.id, createdById: post.authorId })) }); }
      return result;
    });
    return (await presentPosts([updated], userId))[0];
  },

  async deletePost(postId: string, userId: string, role: UserRole) {
    const post = await resolvePost(postId); if (post.status === "deleted") throw AppError.notFound("Forum post not found");
    if (post.authorId !== await resolveUserId(userId) && role !== "admin") throw AppError.forbidden();
    await getPrisma().$transaction(async (tx) => {
      await tx.forumPost.update({ where: { id: post.id }, data: { status: "deleted", isPinned: false, pinnedAt: null } });
      if (post.communityId) await tx.community.updateMany({ where: { id: post.communityId, threadCount: { gt: 0 } }, data: { threadCount: { decrement: 1 } } });
    });
  },
  async moderatePost(postId: string, action: "THREAD_PINNED" | "THREAD_UNPINNED" | "THREAD_LOCKED" | "THREAD_UNLOCKED" | "THREAD_HIDDEN" | "THREAD_RESTORED", reason: string | undefined, actorId: string, actorRole: UserRole) {
    const post = await resolvePost(postId); if (!(await canModerate(post.communityId, actorId, actorRole))) throw AppError.forbidden("Forum moderator access is required in this community");
    if (post.status === "deleted") throw AppError.conflict("Removed discussions cannot be moderated");
    if (action === "THREAD_LOCKED" && post.status !== "active") throw AppError.conflict("Only an active discussion can be locked");
    if (action === "THREAD_UNLOCKED" && post.status !== "locked") throw AppError.conflict("This discussion is not locked");
    if (action === "THREAD_HIDDEN" && !["active", "locked"].includes(post.status)) throw AppError.conflict("This discussion is already hidden");
    if (action === "THREAD_RESTORED" && post.status !== "hidden") throw AppError.conflict("Only a hidden discussion can be restored");
    if (["THREAD_PINNED", "THREAD_UNPINNED"].includes(action) && !["active", "locked"].includes(post.status)) throw AppError.conflict("Hidden discussions cannot be pinned");
    const data = action === "THREAD_PINNED" ? { isPinned: true, pinnedAt: new Date() }
      : action === "THREAD_UNPINNED" ? { isPinned: false, pinnedAt: null }
        : action === "THREAD_LOCKED" ? { status: "locked" }
          : action === "THREAD_HIDDEN" ? { status: "hidden", isPinned: false, pinnedAt: null }
            : { status: "active" };
    const actor = await resolveUserId(actorId);
    const updated = await getPrisma().$transaction(async (tx) => {
      const row = await tx.forumPost.update({ where: { id: post.id }, data });
      if (post.communityId && action === "THREAD_HIDDEN") {
        await tx.community.updateMany({ where: { id: post.communityId, threadCount: { gt: 0 } }, data: { threadCount: { decrement: 1 } } });
      } else if (post.communityId && action === "THREAD_RESTORED") {
        await tx.community.update({ where: { id: post.communityId }, data: { threadCount: { increment: 1 } } });
      }
      await tx.forumModerationAction.create({ data: { actorId: actor, communityId: post.communityId, postId: post.id, action, reason: reason ? cleanForumText(reason) : undefined } });
      return row;
    });
    await auditService.log(action, { userId: actorId, targetTableName: "forum_posts", targetRecordId: post.id, details: { reason, communityId: post.communityId } });
    if (post.authorId !== actor) await notificationService.create({ userId: post.authorId, title: "Forum moderation update", message: `A moderator updated “${post.title}”.`, type: "FORUM_MODERATION", targetKind: "forum_post", targetId: post.id });
    return (await presentPosts([updated], actorId, actorRole))[0];
  },

  async addComment(postId: string, input: { content: string; parentCommentId?: string; references?: ReferenceInput[] }, userId: string) {
    const post = await resolvePost(postId); if (["deleted", "hidden"].includes(post.status)) throw AppError.notFound("Forum post not found"); if (post.status === "locked") throw AppError.conflict("This post is locked");
    await assertCanPostToCommunity(post.communityId ?? undefined, userId); const authorId = await resolveUserId(userId);
    const parent = input.parentCommentId ? await resolveComment(input.parentCommentId) : undefined; if (parent && (parent.postId !== post.id || parent.status !== "active")) throw AppError.badRequest("Parent comment does not belong to this post");
    const references = await prepareReferences(input.references);
    const parentCommentId = parent ? flattenedReplyParent(parent) : undefined;
    const comment = await getPrisma().$transaction(async (tx) => { const created = await tx.forumComment.create({ data: { postId: post.id, authorId, parentCommentId, body: cleanForumText(input.content) } });
      if (references.length) await tx.forumReference.createMany({ data: references.map((reference) => ({ ...reference, commentId: created.id, createdById: authorId })) });
      await tx.forumPost.update({ where: { id: post.id }, data: { commentCount: { increment: 1 } } }); return created; });
    const followers = await getPrisma().forumThreadFollow.findMany({ where: { postId: post.id, userId: { not: authorId } }, select: { userId: true } });
    const recipients = new Set(followers.map((follow) => follow.userId));
    if (post.authorId !== authorId) recipients.add(post.authorId);
    if (parent && parent.authorId !== authorId) recipients.add(parent.authorId);
    await Promise.all([...recipients].map((recipientId) => notificationService.create({ userId: recipientId, title: parent && recipientId === parent.authorId ? "New reply to your forum response" : "New activity in a forum discussion", message: `A new response was added to “${post.title}”.`, type: parent && recipientId === parent.authorId ? "FORUM_REPLY_CREATED" : "FORUM_RESPONSE_CREATED", targetKind: "forum_post", targetId: post.id })));
    return (await presentComments([comment], userId, post.acceptedCommentId))[0];
  },

  async listComments(postId: string, page: number, pageSize: number, actorId?: string, actorRole?: UserRole) {
    const post = await resolvePost(postId); if (!["active", "locked", "deleted"].includes(post.status) || (post.status === "deleted" && post.commentCount === 0)) throw AppError.notFound("Forum post not found"); await assertCanViewCommunity(post.communityId ?? undefined, actorId, actorRole);
    const where = { postId: post.id, status: { in: ["active", "deleted"] } }; const [data, total] = await Promise.all([
      getPrisma().forumComment.findMany({ where, orderBy: { createdAt: "asc" }, skip: (page - 1) * pageSize, take: pageSize }), getPrisma().forumComment.count({ where }),
    ]);
    return { data: await presentComments(data, actorId, post.acceptedCommentId), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  },
  async updateComment(commentId: string, input: { content: string; references?: ReferenceInput[] }, userId: string) {
    const comment = await resolveComment(commentId); if (comment.status === "deleted") throw AppError.notFound("Comment not found"); if (comment.authorId !== await resolveUserId(userId)) throw AppError.forbidden("Only the author can edit this comment");
    const post = await getPrisma().forumPost.findUniqueOrThrow({ where: { id: comment.postId } });
    if (post.status === "locked") throw AppError.conflict("Responses in a locked discussion cannot be edited");
    const references = input.references !== undefined ? await prepareReferences(input.references) : undefined;
    const updated = await getPrisma().$transaction(async (tx) => { const result = await tx.forumComment.update({ where: { id: comment.id }, data: { body: cleanForumText(input.content), editedAt: new Date() } });
      if (references !== undefined) { await tx.forumReference.deleteMany({ where: { commentId: comment.id } }); if (references.length) await tx.forumReference.createMany({ data: references.map((reference) => ({ ...reference, commentId: comment.id, createdById: comment.authorId })) }); } return result; });
    return (await presentComments([updated], userId, post.acceptedCommentId))[0];
  },
  async deleteComment(commentId: string, userId: string, role: UserRole) {
    const comment = await resolveComment(commentId); if (comment.status === "deleted") throw AppError.notFound("Comment not found"); if (comment.authorId !== await resolveUserId(userId) && role !== "admin") throw AppError.forbidden();
    await getPrisma().$transaction(async (tx) => {
      await tx.forumComment.update({ where: { id: comment.id }, data: { status: "deleted" } });
      await tx.forumPost.updateMany({ where: { id: comment.postId, acceptedCommentId: comment.id }, data: { acceptedCommentId: null } });
    });
  },
  async moderateComment(commentId: string, action: "RESPONSE_HIDDEN" | "RESPONSE_RESTORED", reason: string | undefined, actorId: string, actorRole: UserRole) {
    const comment = await resolveComment(commentId); const post = await getPrisma().forumPost.findUnique({ where: { id: comment.postId } }); if (!post || !(await canModerate(post.communityId, actorId, actorRole))) throw AppError.forbidden();
    if (comment.status === "deleted") throw AppError.conflict("Removed responses cannot be moderated");
    if (action === "RESPONSE_HIDDEN" && comment.status !== "active") throw AppError.conflict("This response is already hidden");
    if (action === "RESPONSE_RESTORED" && comment.status !== "hidden") throw AppError.conflict("Only a hidden response can be restored");
    const actor = await resolveUserId(actorId);
    const updated = await getPrisma().$transaction(async (tx) => {
      const row = await tx.forumComment.update({ where: { id: comment.id }, data: { status: action === "RESPONSE_HIDDEN" ? "hidden" : "active" } });
      if (action === "RESPONSE_HIDDEN") await tx.forumPost.updateMany({ where: { id: post.id, commentCount: { gt: 0 } }, data: { commentCount: { decrement: 1 } } });
      else await tx.forumPost.update({ where: { id: post.id }, data: { commentCount: { increment: 1 } } });
      await tx.forumModerationAction.create({ data: { actorId: actor, communityId: post.communityId, commentId: comment.id, action, reason: reason ? cleanForumText(reason) : undefined } });
      return row;
    });
    await auditService.log(action, { userId: actorId, targetTableName: "forum_comments", targetRecordId: comment.id, details: { reason, communityId: post.communityId } });
    return (await presentComments([updated], actorId, post.acceptedCommentId))[0];
  },
  async acceptAnswer(postId: string, commentId: string | undefined, userId: string) {
    const post = await resolvePost(postId); const comment = commentId ? await resolveComment(commentId) : undefined;
    if (post.status === "deleted") throw AppError.notFound("Forum post not found"); if (normalizeForumPostType(post.type) !== "QUESTION") throw AppError.badRequest("Only question threads can accept a response"); if (post.authorId !== await resolveUserId(userId)) throw AppError.forbidden("Only the question author can accept a response"); if (comment && (comment.postId !== post.id || comment.status !== "active")) throw AppError.badRequest("The response does not belong to this question");
    const updated = await getPrisma().forumPost.update({ where: { id: post.id }, data: { acceptedCommentId: comment?.id ?? null } }); if (comment && comment.authorId !== post.authorId) await notificationService.create({ userId: comment.authorId, title: "Your response was accepted", message: `The question author accepted your response to “${post.title}”.`, type: "FORUM_RESPONSE_ACCEPTED", targetKind: "forum_post", targetId: post.id }); return (await presentPosts([updated], userId))[0];
  },

  async vote(subjectKind: "post" | "comment", subjectId: string, value: -1 | 0 | 1, userId: string, actorRole: UserRole) {
    const prisma = getPrisma(); const resolvedUserId = await resolveUserId(userId); const subject = subjectKind === "post" ? await resolvePost(subjectId) : await resolveComment(subjectId);
    const post = subjectKind === "post" ? subject as Awaited<ReturnType<typeof resolvePost>> : await prisma.forumPost.findUnique({ where: { id: (subject as Awaited<ReturnType<typeof resolveComment>>).postId } });
    if (!post || !["active", "locked"].includes(post.status) || (subjectKind === "comment" && subject.status !== "active")) throw AppError.notFound(`${subjectKind === "post" ? "Post" : "Response"} not found`); await assertCanViewCommunity(post.communityId ?? undefined, userId, actorRole);
    const target = subjectKind === "post" ? { postId: subject.id, commentId: null } : { postId: null, commentId: subject.id };
    let score: number;
    try {
      score = await prisma.$transaction(async (tx) => { const existing = await tx.forumVote.findFirst({ where: { userId: resolvedUserId, ...target } }); if (value === 0) { if (existing) await tx.forumVote.delete({ where: { id: existing.id } }); } else if (existing) await tx.forumVote.update({ where: { id: existing.id }, data: { value } }); else await tx.forumVote.create({ data: { userId: resolvedUserId, value, ...target } });
        const aggregate = await tx.forumVote.aggregate({ where: target, _sum: { value: true } }); const nextScore = aggregate._sum.value ?? 0; if (subjectKind === "post") await tx.forumPost.update({ where: { id: subject.id }, data: { score: nextScore, voteScore: nextScore } }); else await tx.forumComment.update({ where: { id: subject.id }, data: { score: nextScore, voteScore: nextScore } }); return nextScore; });
    } catch (error) {
      if (isUniqueViolation(error)) throw AppError.conflict("Your vote was updated by another request. Please try again");
      throw error;
    }
    return { subjectKind, subjectId: publicDatabaseId(subject), value, score };
  },

  async follow(postInput: string, userInput: string, following: boolean) {
    const [post, userId] = await Promise.all([resolvePost(postInput), resolveUserId(userInput)]);
    if (!["active", "locked"].includes(post.status)) throw AppError.notFound("Forum discussion not found");
    await assertCanViewCommunity(post.communityId ?? undefined, userInput, "user");
    if (following) await getPrisma().forumThreadFollow.upsert({ where: { postId_userId: { postId: post.id, userId } }, create: { postId: post.id, userId }, update: {} });
    else await getPrisma().forumThreadFollow.deleteMany({ where: { postId: post.id, userId } });
    return { following };
  },

  async contextOptions(userInput: string, query?: string) {
    const userId = await resolveUserId(userInput); const prisma = getPrisma();
    const memberships = await prisma.projectMember.findMany({ where: { userId, status: "ACTIVE" }, select: { projectId: true } });
    const accessibleProjectIds = memberships.map((membership) => membership.projectId);
    const search = query?.trim();
    const [papers, projects, gaps] = await Promise.all([
      prisma.paper.findMany({ where: { dataStatus: "active", ...(search ? { OR: [{ title: { contains: search, mode: "insensitive" } }, { doi: { contains: search, mode: "insensitive" } }] } : {}) }, select: { id: true, legacyMongoId: true, title: true, doi: true, publicationYear: true }, orderBy: { citationCount: "desc" }, take: 20 }),
      prisma.project.findMany({ where: { visibility: "PUBLIC_SUMMARY", OR: [{ ownerId: userId }, { id: { in: accessibleProjectIds } }], ...(search ? { title: { contains: search, mode: "insensitive" } } : {}) }, select: { id: true, legacyMongoId: true, title: true, visibility: true }, orderBy: { updatedAt: "desc" }, take: 20 }),
      prisma.researchGap.findMany({ where: { AND: [
        { OR: [{ userId }, { projectId: { in: accessibleProjectIds } }] },
        ...(search ? [{ OR: [{ title: { contains: search, mode: "insensitive" as const } }, { topic: { contains: search, mode: "insensitive" as const } }] }] : []),
      ] }, select: { id: true, legacyMongoId: true, title: true, topic: true, forumShareable: true }, orderBy: { updatedAt: "desc" }, take: 20 }),
    ]);
    return {
      papers: papers.map((paper) => ({ id: publicDatabaseId(paper), title: paper.title, doi: paper.doi ?? undefined, publicationYear: paper.publicationYear })),
      projects: projects.map((project) => ({ id: publicDatabaseId(project), title: project.title, visibility: project.visibility })),
      gaps: gaps.map((gap) => ({ id: publicDatabaseId(gap), title: gap.title, topic: gap.topic, forumShareable: gap.forumShareable })),
    };
  },

  async makeGapShareable(gapInput: string, userInput: string) {
    const userId = await resolveUserId(userInput);
    const gap = await getPrisma().researchGap.findUnique({ where: idWhere(gapInput) });
    if (!gap) throw AppError.notFound("Research gap not found");
    if (gap.userId !== userId) {
      const project = gap.projectId ? await getPrisma().project.findUnique({ where: { id: gap.projectId } }) : null;
      if (!project || project.ownerId !== userId) throw AppError.forbidden("Only the gap creator or project owner can share this gap in the forum");
    }
    await getPrisma().researchGap.update({ where: { id: gap.id }, data: { forumShareable: true } });
    await auditService.log("FORUM_GAP_SHARED", { userId, targetTableName: "research_gaps", targetRecordId: gap.id });
    return { forumShareable: true };
  },

  async report(targetType: "post" | "comment", targetId: string, input: { reason: string; description?: string }, userId: string) {
    const prisma = getPrisma(); const reporterId = await resolveUserId(userId); const target = targetType === "post" ? await resolvePost(targetId) : await resolveComment(targetId);
    const post = targetType === "post" ? target as Awaited<ReturnType<typeof resolvePost>> : await prisma.forumPost.findUnique({ where: { id: (target as Awaited<ReturnType<typeof resolveComment>>).postId } });
    if (!post || post.status === "deleted") throw AppError.notFound("Report target not found"); await assertCanViewCommunity(post.communityId ?? undefined, userId, "user"); const targetWhere = targetType === "post" ? { postId: target.id } : { commentId: target.id };
    if (await prisma.contentReport.findFirst({ where: { reporterId, status: "open", ...targetWhere } })) throw AppError.conflict("You already have an open report for this content");
    let report;
    try {
      report = await prisma.contentReport.create({ data: { reporterId, communityId: post.communityId, reason: input.reason, description: input.description ? cleanForumText(input.description) : undefined, ...targetWhere } });
    } catch (error) {
      if (isUniqueViolation(error)) throw AppError.conflict("You already have an open report for this content");
      throw error;
    }
    return { ...report, id: publicDatabaseId(report), _id: publicDatabaseId(report), targetType, targetId: publicDatabaseId(target) };
  },
  async listReports(communityId: string | undefined, status: "open" | "reviewed" | "resolved" | "dismissed" | "all", actorId: string, actorRole: UserRole) {
    let resolvedCommunityId: string | undefined;
    if (communityId) {
      const community = await resolveCommunity(communityId); resolvedCommunityId = community.id;
      if (!(await canModerate(community.id, actorId, actorRole))) throw AppError.forbidden();
    } else if (actorRole !== "admin") throw AppError.forbidden("Administrator access is required for the global moderation queue");
    const reports = await getPrisma().contentReport.findMany({
      where: { ...(resolvedCommunityId ? { communityId: resolvedCommunityId } : {}), ...(status === "all" ? {} : { status }) },
      orderBy: { createdAt: status === "open" ? "asc" : "desc" }, take: 200,
    });
    return presentReports(reports as ReportRecord[]);
  },
  async listModerationActions(communityId: string | undefined, actorId: string, actorRole: UserRole) {
    let resolvedCommunityId: string | undefined;
    if (communityId) {
      const community = await resolveCommunity(communityId); resolvedCommunityId = community.id;
      if (!(await canModerate(community.id, actorId, actorRole))) throw AppError.forbidden();
    } else if (actorRole !== "admin") throw AppError.forbidden("Administrator access is required for the global moderation history");
    const actions = await getPrisma().forumModerationAction.findMany({ where: resolvedCommunityId ? { communityId: resolvedCommunityId } : {}, orderBy: { createdAt: "desc" }, take: 200 });
    return presentModerationActions(actions);
  },
  async reviewReport(reportId: string, input: { status: "reviewed" | "resolved" | "dismissed"; moderationNote?: string }, actorId: string, actorRole: UserRole) {
    const report = await getPrisma().contentReport.findUnique({ where: idWhere(reportId) }); if (!report) throw AppError.notFound("Content report not found"); if (!(await canModerate(report.communityId, actorId, actorRole))) throw AppError.forbidden();
    const actor = await resolveUserId(actorId); const action = input.status === "dismissed" ? "REPORT_DISMISSED" : "REPORT_RESOLVED";
    const updated = await getPrisma().$transaction(async (tx) => {
      const row = await tx.contentReport.update({ where: { id: report.id }, data: { ...input, reviewedById: actor, reviewedAt: new Date() } });
      await tx.forumModerationAction.create({ data: { actorId: actor, communityId: report.communityId, reportId: report.id, action, reason: input.moderationNote } });
      return row;
    });
    await auditService.log(action, { userId: actorId, targetTableName: "forum_content_reports", targetRecordId: report.id, details: input }); return (await presentReports([updated as ReportRecord]))[0];
  },
};
