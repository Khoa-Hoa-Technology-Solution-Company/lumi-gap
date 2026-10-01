import { randomUUID } from "node:crypto";
import type { ForumPostType, ForumSort, UserRole, GapStructuredEvidenceItem } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import type { Prisma } from "../../generated/prisma/client.js";
import { auditService } from "../audit/audit.service.js";
import { getActiveCommunityMembership, isCommunityModerator } from "../communities/community.service.js";
import { notificationService } from "../notifications/notification.service.js";
import {
  canExposeForumGap,
  canExposeForumProject,
  canShowAcademicIdentity,
  cleanForumText,
  isAllowedForumUrl,
  isValidForumDoi,
  normalizeForumPostType,
  normalizeForumTags,
} from "./forum.rules.js";
import { structuredEvidenceItems } from "../gaps/structured-evidence.js";

type ReferenceInput = { paperId?: string; doi?: string; url?: string; title?: string; authors?: string[]; year?: number };
type ReviewAsEvidenceInput = {
  referenceId: string;
  projectId?: string;
  screeningStatus?: "UNDECIDED" | "INCLUDED" | "EXCLUDED";
  exclusionReason?: string;
  exclusionNote?: string;
  relation?: "SUPPORTING" | "COUNTER" | "RELATED";
  evidenceType?: string;
  excerpt?: string;
  evidenceSelections?: Array<{ evidenceType: string; excerpt: string }>;
  explanation?: string;
  confirmRelation?: boolean;
};
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

export function forumPublicSlug(title: string, id: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 260) || "discussion";
  return `${base}-${id.replace(/-/g, "").slice(0, 12)}`;
}

async function resolveUserId(value: string): Promise<string> {
  const row = await getPrisma().user.findUnique({ where: idWhere(value), select: { id: true } });
  if (!row) throw AppError.notFound("User not found");
  return row.id;
}
async function resolveCommunity(value: string) {
  const parsed = parseDatabaseId(value);
  if (!parsed && (value.length > 120 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value))) throw AppError.badRequest("Invalid community identifier");
  const row = await getPrisma().community.findUnique({ where: parsed ? idWhere(value) : { slug: value }, select: { id: true, legacyMongoId: true, name: true, slug: true, visibility: true, status: true } });
  if (!row) throw AppError.notFound("Community not found");
  return row;
}
async function resolvePost(value: string) {
  const parsed = parseDatabaseId(value);
  const row = parsed
    ? await getPrisma().forumPost.findUnique({ where: idWhere(value) })
    : value.length <= 280 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(value)
      ? await getPrisma().forumPost.findUnique({ where: { publicSlug: value.toLowerCase() } })
      : null;
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
async function resolveGapRow(value: string) {
  const row = await getPrisma().researchGap.findUnique({ where: idWhere(value) });
  if (!row) throw AppError.notFound("Research gap candidate not found");
  return row;
}
async function resolveProject(value?: string): Promise<string | undefined> {
  if (!value) return undefined;
  const row = await getPrisma().project.findUnique({ where: idWhere(value), select: { id: true, visibility: true } });
  if (!row) throw AppError.badRequest("A linked academic entity does not exist");
  if (!canExposeForumProject(row.visibility)) throw AppError.forbidden("Only a project with a public summary can be linked in the forum");
  return row.id;
}
async function resolveProjectRow(value: string) {
  const row = await getPrisma().project.findUnique({ where: idWhere(value) });
  if (!row) throw AppError.notFound("Project not found");
  return row;
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
  if (role === "admin") return (await prisma.community.findMany({ where: { status: "ACTIVE" }, select: { id: true } })).map((row) => row.id);
  const publicIds = (await prisma.community.findMany({ where: { visibility: "public", status: "ACTIVE" }, select: { id: true } })).map((row) => row.id);
  if (!userId) return publicIds;
  const resolvedUserId = await resolveUserId(userId);
  const memberIds = (await prisma.communityMembership.findMany({ where: { userId: resolvedUserId, status: "active" }, select: { communityId: true } })).map((row) => row.communityId);
  const activeMemberIds = memberIds.length ? (await prisma.community.findMany({ where: { id: { in: memberIds }, status: "ACTIVE" }, select: { id: true } })).map((row) => row.id) : [];
  return [...new Set([...publicIds, ...activeMemberIds])];
}
async function canModerate(communityId: string | null | undefined, actorId: string, role: UserRole): Promise<boolean> {
  return role === "admin" || Boolean(communityId && await isCommunityModerator(communityId, actorId));
}

async function projectAccess(projectId: string, actorId: string) {
  const [project, member] = await Promise.all([
    getPrisma().project.findUnique({ where: { id: projectId } }),
    getPrisma().projectMember.findUnique({ where: { projectId_userId: { projectId, userId: actorId } } }),
  ]);
  if (!project || project.status === "ARCHIVED") throw AppError.notFound("Project not found");
  const isMember = project.ownerId === actorId || member?.status === "ACTIVE";
  if (!isMember) throw AppError.forbidden("Project membership is required");
  return project;
}

async function assertCanReadGapForForum(gapInput: string, actorInput: string) {
  const [gap, actor] = await Promise.all([resolveGapRow(gapInput), resolveUserId(actorInput)]);
  if (gap.userId === actor) return { gap, actor };
  if (gap.projectId) {
    const member = await getPrisma().projectMember.findUnique({ where: { projectId_userId: { projectId: gap.projectId, userId: actor } } });
    const project = await getPrisma().project.findUnique({ where: { id: gap.projectId }, select: { ownerId: true, status: true } });
    if (project?.status !== "ARCHIVED" && (project?.ownerId === actor || member?.status === "ACTIVE")) return { gap, actor };
  }
  throw AppError.notFound("Research gap candidate not found");
}

async function resolveForumCitationReviewContext(gapInput: string, referenceInput: string, projectInput: string | undefined, actorInput: string) {
  const { gap, actor } = await assertCanReadGapForForum(gapInput, actorInput);
  const referenceId = parseDatabaseId(referenceInput);
  if (!referenceId || referenceId.kind !== "uuid") throw AppError.badRequest("Invalid forum citation identifier");
  const prisma = getPrisma();
  const reference = await prisma.forumReference.findUnique({ where: { id: referenceId.value } });
  if (!reference) throw AppError.notFound("Forum citation not found");
  const comment = reference.commentId ? await prisma.forumComment.findUnique({ where: { id: reference.commentId } }) : null;
  const post = await prisma.forumPost.findUnique({ where: { id: reference.postId ?? comment?.postId ?? "" } });
  if (!post || !["active", "locked"].includes(post.status)) throw AppError.notFound("Forum citation not found");
  const link = await prisma.forumPostGap.findUnique({ where: { postId_gapId: { postId: post.id, gapId: gap.id } } });
  if (!link && post.linkedResearchGapId !== gap.id && post.researchGapId !== gap.id) throw AppError.badRequest("This citation is not part of a discussion linked to the selected candidate gap");
  if (!reference.paperId) throw AppError.badRequest("This forum citation must be matched to an existing LumiGap Paper before it can enter evidence review");
  const paper = await prisma.paper.findUnique({ where: { id: reference.paperId }, select: { id: true, legacyMongoId: true, title: true, dataStatus: true } });
  if (!paper || paper.dataStatus !== "active") throw AppError.badRequest("The cited paper is not available for evidence review");
  const requestedProject = projectInput ? await projectAccess((await resolveProjectRow(projectInput)).id, actor) : undefined;
  const projectId = gap.projectId ?? requestedProject?.id;
  if (!projectId) throw AppError.badRequest("Select a research project before reviewing this forum citation as evidence");
  if (gap.projectId && requestedProject && requestedProject.id !== gap.projectId) throw AppError.badRequest("Evidence for this candidate gap must use its owning project");
  await projectAccess(projectId, actor);
  const projectPaper = await prisma.projectPaper.findUnique({ where: { projectId_paperId: { projectId, paperId: paper.id } } });
  const corpusPaper = gap.corpusId
    ? await prisma.corpusPaper.findUnique({ where: { corpusId_paperId: { corpusId: gap.corpusId, paperId: paper.id } } })
    : null;
  const extractedEvidence = (corpusPaper?.included ? structuredEvidenceItems(corpusPaper.evidence) : []) as GapStructuredEvidenceItem[];
  return { actor, gap, reference, comment, post, paper, projectId, projectPaper, corpusPaper, extractedEvidence };
}

async function prepareReferences(references: ReferenceInput[] = []): Promise<ReferenceRecord[]> {
  if (references.length > 30) throw AppError.badRequest("Too many references");
  for (const reference of references) {
    if (reference.doi && !isValidForumDoi(reference.doi) || reference.url && !isAllowedForumUrl(reference.url)) throw AppError.badRequest("Invalid citation DOI or URL");
    if (!reference.paperId && (!reference.doi || !cleanForumText(reference.title ?? ""))) throw AppError.badRequest("A DOI citation requires confirmed title metadata");
  }
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

async function academicAuthors(userIds: string[], viewerId?: string, transaction?: Prisma.TransactionClient) {
  if (!userIds.length) return new Map<string, Record<string, unknown>>();
  const ids = [...new Set(userIds)];
  const prisma = transaction ?? getPrisma();
  const [users, profiles] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, legacyMongoId: true, fullName: true, avatarUrl: true, academicProfileType: true, institution: true, role: true } }),
    prisma.academicProfile.findMany({ where: { userId: { in: ids } }, select: { userId: true, affiliationStatus: true, academicTitle: true, profileVisibility: true, primaryPosition: true, positionTitle: true, positionStatus: true } }),
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
      primaryPosition: showAcademicIdentity ? profile?.primaryPosition : undefined,
      positionTitle: showAcademicIdentity ? profile?.positionTitle : undefined,
      positionVerified: showAcademicIdentity && profile?.positionStatus === "VERIFIED",
    }];
  }));
}

const FORUM_VIEW_COOLDOWN_MS = 30 * 60 * 1000;

async function recordForumView(postId: string, viewerKey: string) {
  const now = new Date();
  const before = new Date(now.getTime() - FORUM_VIEW_COOLDOWN_MS);
  const prisma = getPrisma();
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.forumPostView.updateMany({ where: { postId, viewerKey, viewedAt: { lte: before } }, data: { viewedAt: now } });
    if (result.count) await tx.forumPost.update({ where: { id: postId }, data: { viewCount: { increment: 1 } } });
    return result.count;
  });
  if (updated) return true;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.forumPostView.create({ data: { postId, viewerKey, viewedAt: now } });
      await tx.forumPost.update({ where: { id: postId }, data: { viewCount: { increment: 1 } } });
    });
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

type ForumPostMetric = {
  replyCount: number;
  helpfulCount: number;
  viewCount: number;
  lastActivityAt: Date;
  participants: string[];
};

async function forumPostMetrics(posts: Array<Awaited<ReturnType<typeof resolvePost>>>) {
  if (!posts.length) return new Map<string, ForumPostMetric>();
  const prisma = getPrisma();
  const postIds = posts.map((post) => post.id);
  const [replyStats, recentParticipants, helpfulVotes] = await Promise.all([
    prisma.forumComment.groupBy({ by: ["postId"], where: { postId: { in: postIds }, status: "active" }, _count: { _all: true }, _max: { createdAt: true, editedAt: true } }),
    prisma.$queryRaw<Array<{ postId: string; authorId: string }>>`
      SELECT "postId", "authorId" FROM (
        SELECT comment.post_id AS "postId", comment.author_id AS "authorId",
          ROW_NUMBER() OVER (PARTITION BY comment.post_id ORDER BY MAX(comment.created_at) DESC, comment.author_id) AS rank
        FROM forum_comments AS comment JOIN forum_posts AS post ON post.id = comment.post_id
        WHERE comment.post_id = ANY(${postIds}::uuid[]) AND comment.status = 'active'
          AND comment.author_id <> post.author_id
        GROUP BY comment.post_id, comment.author_id
      ) AS ranked WHERE rank <= 4 ORDER BY "postId", rank`,
    prisma.forumVote.groupBy({ by: ["postId"], where: { postId: { in: postIds }, value: 1 }, _count: { _all: true } }),
  ]);
  const participantsByPost = new Map<string, string[]>();
  for (const participant of recentParticipants) {
    const list = participantsByPost.get(participant.postId) ?? [];
    list.push(participant.authorId);
    participantsByPost.set(participant.postId, list);
  }
  const replyByPost = new Map(replyStats.map((stat) => [stat.postId, stat]));
  const helpfulByPost = new Map(helpfulVotes.flatMap((vote) => vote.postId ? [[vote.postId, vote._count._all]] : []));
  return new Map(posts.map((post) => {
    const reply = replyByPost.get(post.id);
    const participants = [...new Set([post.authorId, ...(participantsByPost.get(post.id) ?? [])])].slice(0, 5);
    const lastActivityAt = latestDate(post.createdAt, post.editedAt, reply?._max.createdAt, reply?._max.editedAt)!;
    return [post.id, {
      replyCount: reply?._count._all ?? 0,
      helpfulCount: helpfulByPost.get(post.id) ?? 0,
      viewCount: post.viewCount,
      lastActivityAt,
      participants,
    } satisfies ForumPostMetric];
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
    gapIds.length ? prisma.researchGap.findMany({ where: { id: { in: gapIds }, forumShareable: true, status: "active" }, select: { id: true, legacyMongoId: true, title: true, topic: true, validationStatus: true, status: true } }) : [],
    projectIds.length ? prisma.project.findMany({ where: { id: { in: projectIds }, visibility: "PUBLIC_SUMMARY", archivedAt: null }, select: { id: true, legacyMongoId: true, title: true } }) : [],
  ]);
  return {
    papers: new Map(papers.map((paper) => [paper.id, { id: publicDatabaseId(paper), title: paper.title, doi: paper.doi ?? undefined, publicationYear: paper.publicationYear }])),
    gaps: new Map(gaps.map((gap) => [gap.id, { id: publicDatabaseId(gap), title: gap.title, topic: gap.topic, validationStatus: gap.validationStatus, status: gap.status }])),
    projects: new Map(projects.map((project) => [project.id, { id: publicDatabaseId(project), title: project.title }])),
  };
}

async function presentPosts(posts: Array<Awaited<ReturnType<typeof resolvePost>>>, viewerInput?: string, viewerRole?: UserRole) {
  if (!posts.length) return [];
  const prisma = getPrisma(); const postIds = posts.map((post) => post.id);
  const viewerId = viewerInput ? await resolveUserId(viewerInput) : undefined;
  const [communities, references, postPapers, researchContexts, commentIds, viewerVotes, follows, metrics] = await Promise.all([
    prisma.community.findMany({ where: { id: { in: posts.flatMap((post) => post.communityId ? [post.communityId] : []) } }, select: { id: true, legacyMongoId: true, name: true, slug: true, status: true } }),
    prisma.forumReference.findMany({ where: { postId: { in: postIds } }, orderBy: { position: "asc" } }),
    prisma.forumPostPaper.findMany({ where: { postId: { in: postIds } }, orderBy: { position: "asc" } }),
    forumResearchContexts(posts), publicIdsFor("comment", posts.map((post) => post.acceptedCommentId)),
    viewerId ? prisma.forumVote.findMany({ where: { userId: viewerId, postId: { in: postIds } } }) : [],
    viewerId ? prisma.forumThreadFollow.findMany({ where: { userId: viewerId, postId: { in: postIds } } }) : [],
    forumPostMetrics(posts),
  ]);
  const participantIds = [...new Set(posts.flatMap((post) => metrics.get(post.id)?.participants ?? [post.authorId]))];
  const participantAuthors = await academicAuthors(participantIds, viewerId);
  const authors = participantAuthors;
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
  const activeMemberCommunities = new Set(viewerId ? (await prisma.communityMembership.findMany({ where: { userId: viewerId, communityId: { in: communities.map((community) => community.id) }, status: "active" }, select: { communityId: true } })).map((membership) => membership.communityId) : []);
  const activeCommunities = new Set(communities.filter((community) => community.status === "ACTIVE").map((community) => community.id));
  const moderatedCommunityIds = viewerId && viewerRole !== "admin" ? new Set((await prisma.communityMembership.findMany({ where: { userId: viewerId, communityId: { in: posts.flatMap((post) => post.communityId ? [post.communityId] : []) }, status: "active", role: { in: ["owner", "moderator"] } }, select: { communityId: true } })).map((membership) => membership.communityId)) : new Set<string>();
  return posts.map((post) => {
    const id = publicDatabaseId(post); const linkedPaper = post.linkedPaperId ? researchContexts.papers.get(post.linkedPaperId) : undefined;
    const linkedGap = (post.linkedResearchGapId ? researchContexts.gaps.get(post.linkedResearchGapId) : undefined)
      ?? (post.researchGapId ? researchContexts.gaps.get(post.researchGapId) : undefined);
    const linkedProject = post.linkedProjectId ? researchContexts.projects.get(post.linkedProjectId) : undefined;
    const metric = metrics.get(post.id)!;
    const participantSummaries = metric.participants.map((participantId) => {
      const author = participantAuthors.get(participantId);
      if (!author) return undefined;
      return { id: author.id, fullName: author.fullName, avatarUrl: author.avatarUrl, academicProfileType: author.academicProfileType };
    }).filter(Boolean);
    return { ...post, _id: id, id, content: post.body, authorId: authors.get(post.authorId) ?? post.authorId,
      communityId: post.communityId ? communityById.get(post.communityId) ?? post.communityId : undefined,
      researchGapId: linkedGap?.id,
      paperIds: papersByPost.get(post.id) ?? (linkedPaper ? [linkedPaper.id] : []), linkedPaperId: linkedPaper?.id,
      linkedResearchGapId: linkedGap?.id, linkedProjectId: linkedProject?.id,
      linkedPaper, linkedResearchGap: linkedGap, linkedProject,
      acceptedCommentId: post.acceptedCommentId ? commentIds.get(post.acceptedCommentId) ?? post.acceptedCommentId : undefined,
      viewerVote: (voteByPost.get(post.id) ?? 0) as -1 | 0 | 1, isFollowing: followed.has(post.id),
      commentCount: metric.replyCount, replyCount: metric.replyCount, helpfulCount: metric.helpfulCount, viewCount: metric.viewCount,
      lastActivityAt: metric.lastActivityAt, participants: participantSummaries,
      canModerate: viewerRole === "admin" || Boolean(post.communityId && moderatedCommunityIds.has(post.communityId)),
      canReply: Boolean(viewerId && post.status === "active" && (!post.communityId || activeCommunities.has(post.communityId) && activeMemberCommunities.has(post.communityId))),
      references: (referencesByPost.get(post.id) ?? []).map(({ postId: _postId, commentId: _commentId, position: _position, ...reference }) => ({ ...reference, id: publicDatabaseId(reference), paperId: reference.paperId ? safePaperIds.get(reference.paperId) : undefined })) };
  });
}

async function presentComments(comments: Array<Awaited<ReturnType<typeof resolveComment>>>, viewerInput?: string, acceptedCommentId?: string | null, transaction?: Prisma.TransactionClient) {
  if (!comments.length) return [];
  const prisma = transaction ?? getPrisma();
  const viewerId = viewerInput ? await resolveUserId(viewerInput) : undefined;
  const ids = comments.map((comment) => comment.id);
  const parents = await prisma.forumComment.findMany({ where: { id: { in: comments.flatMap((comment) => comment.parentCommentId ? [comment.parentCommentId] : []) }, postId: { in: [...new Set(comments.map((comment) => comment.postId))] } }, select: { id: true, legacyMongoId: true, postId: true, authorId: true, status: true } });
  const [authors, references, viewerVotes, helpful] = await Promise.all([
    academicAuthors([...comments.map((comment) => comment.authorId), ...parents.filter((parent) => parent.status === "active").map((parent) => parent.authorId)], viewerId, transaction),
    prisma.forumReference.findMany({ where: { commentId: { in: comments.filter((comment) => comment.status === "active").map((comment) => comment.id) } }, orderBy: { position: "asc" } }),
    viewerId ? prisma.forumVote.findMany({ where: { userId: viewerId, commentId: { in: ids } } }) : [],
    prisma.forumVote.groupBy({ by: ["commentId"], where: { commentId: { in: ids }, value: 1 }, _count: { _all: true } }),
  ]);
  const safePaperRows = await prisma.paper.findMany({
    where: { id: { in: [...new Set(references.flatMap((reference) => reference.paperId ? [reference.paperId] : []))] }, dataStatus: "active" },
    select: { id: true, legacyMongoId: true },
  });
  const safePaperIds = new Map(safePaperRows.map((paper) => [paper.id, publicDatabaseId(paper)]));
  const parentsById = new Map(parents.map((parent) => [parent.id, parent]));
  const refsByComment = new Map<string, typeof references>();
  for (const reference of references) { const list = refsByComment.get(reference.commentId!) ?? []; list.push(reference); refsByComment.set(reference.commentId!, list); }
  const voteByComment = new Map(viewerVotes.flatMap((vote) => vote.commentId ? [[vote.commentId, vote.value]] : []));
  const helpfulByComment = new Map(helpful.flatMap((vote) => vote.commentId ? [[vote.commentId, vote._count._all]] : []));
  return comments.map((comment) => {
    const id = publicDatabaseId(comment);
    const parent = comment.parentCommentId ? parentsById.get(comment.parentCommentId) : undefined;
    const body = comment.status === "active" ? comment.body : "This response was removed by its author.";
    return { ...comment, body, _id: id, id, content: body,
      authorId: authors.get(comment.authorId) ?? comment.authorId,
      parentCommentId: parent ? publicDatabaseId(parent) : undefined,
      parentComment: parent && parent.postId === comment.postId ? { id: publicDatabaseId(parent), status: parent.status, author: parent.status === "active" ? authors.get(parent.authorId) : undefined } : undefined,
      viewerVote: (voteByComment.get(comment.id) ?? 0) as -1 | 0 | 1,
      helpfulCount: helpfulByComment.get(comment.id) ?? 0,
      isAccepted: comment.status === "active" && acceptedCommentId === comment.id,
      references: (refsByComment.get(comment.id) ?? []).map(({ postId: _postId, commentId: _commentId, position: _position, ...reference }) => ({ ...reference, id: publicDatabaseId(reference), paperId: reference.paperId ? safePaperIds.get(reference.paperId) : undefined })),
    };
  });
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

function latestDate(...values: Array<Date | null | undefined>) {
  return values.filter((value): value is Date => Boolean(value)).sort((a, b) => b.getTime() - a.getTime())[0];
}

function discussionActivity(posts: Array<{ id: string; authorId: string; commentCount: number; voteScore: number; lastActivityAt: Date; createdAt: Date }>, comments: Array<{ id: string; postId: string; authorId: string; updatedAt: Date; editedAt: Date | null; createdAt: Date }>, references: Array<{ postId: string | null; commentId: string | null }>, commentPostById: Map<string, string>, follows: number) {
  const postIds = new Set(posts.map((post) => post.id));
  const participants = new Set<string>(posts.map((post) => post.authorId));
  for (const comment of comments) participants.add(comment.authorId);
  let citationCount = 0;
  for (const reference of references) {
    if (reference.postId && postIds.has(reference.postId)) citationCount += 1;
    else if (reference.commentId && commentPostById.has(reference.commentId)) citationCount += 1;
  }
  const lastActivityAt = latestDate(...posts.map((post) => post.lastActivityAt), ...comments.flatMap((comment) => [comment.createdAt, comment.editedAt]));
  return {
    threadCount: posts.length,
    responseCount: posts.reduce((sum, post) => sum + post.commentCount, 0),
    citationCount,
    participantCount: participants.size,
    helpfulCount: posts.reduce((sum, post) => sum + Math.max(0, post.voteScore), 0),
    followCount: follows,
    lastActivityAt: lastActivityAt?.toISOString(),
  };
}

async function notifyGapDiscussionCreated(post: { id: string; title: string; authorId: string; linkedResearchGapId: string | null }) {
  if (!post.linkedResearchGapId) return;
  const gap = await getPrisma().researchGap.findUnique({ where: { id: post.linkedResearchGapId }, select: { userId: true, title: true } });
  if (!gap || gap.userId === post.authorId) return;
  await notificationService.create({
    userId: gap.userId,
    title: "New community discussion linked to your candidate gap",
    message: `A forum discussion was started for “${gap.title}”.`,
    type: "GAP_DISCUSSION_CREATED",
    targetKind: "forum_post",
    targetId: post.id,
  });
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
    const cleanTitle = cleanForumText(input.title);
    const postId = randomUUID();
    const post = await getPrisma().$transaction(async (tx) => {
      const created = await tx.forumPost.create({ data: { id: postId, publicSlug: forumPublicSlug(cleanTitle, postId), authorId, communityId, researchGapId: linkedResearchGapId, linkedPaperId, linkedResearchGapId, linkedProjectId, type, title: cleanTitle, body: cleanForumText(input.content), tags: tags.map((tag) => tag.name) } });
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
    if (linkedResearchGapId) {
      await auditService.log("GAP_DISCUSSION_CREATED", { userId, targetTableName: "forum_posts", targetRecordId: post.id, details: { gapId: linkedResearchGapId } });
      await auditService.log("THREAD_LINKED_TO_GAP", { userId, targetTableName: "forum_post_gaps", targetRecordId: post.id, details: { postId: post.id, gapId: linkedResearchGapId } });
      await notifyGapDiscussionCreated(post);
    }
    return (await presentPosts([post], userId))[0];
  },

  async listPosts(filter: { communityId?: string; linkedResearchGapId?: string; linkedPaperId?: string; type?: string; tag?: string; query?: string; sort?: ForumSort; includeModerated?: boolean }, page: number, pageSize: number, actorId?: string, actorRole?: UserRole) {
    const prisma = getPrisma();
    const where: Record<string, unknown> = { status: { in: filter.includeModerated && actorRole === "admin" ? ["active", "locked", "hidden"] : ["active", "locked"] } };
    const conditions: Record<string, unknown>[] = [];
    if (filter.linkedResearchGapId) where.linkedResearchGapId = await resolveGap(filter.linkedResearchGapId, true);
    if (filter.linkedPaperId) where.linkedPaperId = await resolvePaper(filter.linkedPaperId);
    if (filter.type) where.type = normalizeForumPostType(filter.type);
    if (filter.tag) {
      const tag = normalizeForumTags([filter.tag])[0];
      const row = tag ? await prisma.forumTag.findUnique({ where: { slug: tag.slug } }) : null;
      const links = row ? await prisma.forumPostTag.findMany({ where: { tagId: row.id }, select: { postId: true } }) : [];
      where.id = { in: links.map((item) => item.postId) };
    }
    if (filter.communityId) {
      const community = await resolveCommunity(filter.communityId);
      if (community.status !== "ACTIVE") throw AppError.notFound("Community not found");
      await assertCanViewCommunity(community.id, actorId, actorRole); where.communityId = community.id;
    } else conditions.push({ OR: [{ communityId: null }, { communityId: { in: await visibleCommunityIds(actorId, actorRole) } }] });
    // Maintained transactionally from active replies only; the opening post is not a reply.
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
    // Existing discovery ranking: helpful votes, visible replies, activity, then unique ID.
    // No research confidence, evidence, validation or author credentials participate.
    const orderBy = filter.sort === "popular"
      ? [{ isPinned: "desc" as const }, { voteScore: "desc" as const }, { commentCount: "desc" as const }, { lastActivityAt: "desc" as const }, { id: "desc" as const }]
      : [{ isPinned: "desc" as const }, { lastActivityAt: "desc" as const }, { id: "desc" as const }];
    const [data, total] = await Promise.all([
      prisma.forumPost.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.forumPost.count({ where }),
    ]);
    return { data: await presentPosts(data, actorId, actorRole), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  },

  async gapDiscussionContext(gapInput: string, actorInput: string, actorRole: UserRole) {
    const { gap } = await assertCanReadGapForForum(gapInput, actorInput);
    const prisma = getPrisma();
    const visibleIds = await visibleCommunityIds(actorInput, actorRole);
    const gapLinks = await prisma.forumPostGap.findMany({ where: { gapId: gap.id }, select: { postId: true } });
    const gapPapers = await prisma.researchGapPaper.findMany({ where: { gapId: gap.id }, select: { paperId: true } });
    const gapPaperIds = [...new Set(gapPapers.map((item) => item.paperId))];
    const [postPaperLinks, referenceLinks] = gapPaperIds.length ? await Promise.all([
      prisma.forumPostPaper.findMany({ where: { paperId: { in: gapPaperIds } }, select: { postId: true } }),
      prisma.forumReference.findMany({ where: { paperId: { in: gapPaperIds } }, select: { postId: true, commentId: true } }),
    ]) : [[], []] as const;
    const referenceCommentIds = referenceLinks.flatMap((item) => item.commentId ? [item.commentId] : []);
    const referenceComments = referenceCommentIds.length ? await prisma.forumComment.findMany({ where: { id: { in: referenceCommentIds } }, select: { postId: true } }) : [];
    const sharedPostIds = [
      ...postPaperLinks.map((item) => item.postId),
      ...referenceLinks.flatMap((item) => item.postId ? [item.postId] : []),
      ...referenceComments.map((item) => item.postId),
    ];
    const terms = [...new Set(`${gap.title} ${gap.topic}`.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length >= 4).slice(0, 8))];
    const communityScope = { OR: [{ communityId: null }, { communityId: { in: visibleIds } }] };
    const posts = await prisma.forumPost.findMany({
      where: {
        status: { in: ["active", "locked"] },
        AND: [communityScope],
        OR: [
          { id: { in: gapLinks.map((item) => item.postId) } },
          { linkedResearchGapId: gap.id },
          { researchGapId: gap.id },
          ...(sharedPostIds.length ? [{ id: { in: sharedPostIds } }] : []),
          ...terms.flatMap((term) => [{ title: { contains: term, mode: "insensitive" as const } }, { body: { contains: term, mode: "insensitive" as const } }, { tags: { has: term } }]),
        ],
      },
      orderBy: [{ lastActivityAt: "desc" }],
      take: 30,
    });
    const explicitPostIds = new Set([...gapLinks.map((item) => item.postId), ...posts.flatMap((post) => post.linkedResearchGapId === gap.id || post.researchGapId === gap.id ? [post.id] : [])]);
    const sharedPaperPostIds = new Set(sharedPostIds);
    const ranked = posts.sort((a, b) => {
      const aExplicit = explicitPostIds.has(a.id) ? 1 : 0; const bExplicit = explicitPostIds.has(b.id) ? 1 : 0;
      if (aExplicit !== bExplicit) return bExplicit - aExplicit;
      const aShared = sharedPaperPostIds.has(a.id) ? 1 : 0; const bShared = sharedPaperPostIds.has(b.id) ? 1 : 0;
      if (aShared !== bShared) return bShared - aShared;
      const aScore = Math.max(0, a.voteScore) + a.commentCount;
      const bScore = Math.max(0, b.voteScore) + b.commentCount;
      if (aScore !== bScore) return bScore - aScore;
      return b.lastActivityAt.getTime() - a.lastActivityAt.getTime();
    }).slice(0, 12);
    const postIds = ranked.map((post) => post.id);
    const comments = postIds.length ? await prisma.forumComment.findMany({ where: { postId: { in: postIds }, status: "active" }, select: { id: true, postId: true, authorId: true, createdAt: true, updatedAt: true, editedAt: true } }) : [];
    const commentPostById = new Map(comments.map((comment) => [comment.id, comment.postId]));
    const references = postIds.length ? await prisma.forumReference.findMany({
      where: { OR: [{ postId: { in: postIds } }, { commentId: { in: comments.map((comment) => comment.id) } }] },
      orderBy: { createdAt: "desc" },
    }) : [];
    const follows = postIds.length ? await prisma.forumThreadFollow.count({ where: { postId: { in: postIds } } }) : 0;
    const paperRows = references.some((reference) => reference.paperId)
      ? await prisma.paper.findMany({ where: { id: { in: [...new Set(references.flatMap((reference) => reference.paperId ? [reference.paperId] : []))] }, dataStatus: "active" }, select: { id: true, legacyMongoId: true, title: true, doi: true, publicationYear: true } })
      : [];
    const paperById = new Map(paperRows.map((paper) => [paper.id, paper]));
    return {
      gap: { id: publicDatabaseId(gap), title: gap.title, topic: gap.topic, validationStatus: gap.validationStatus, status: gap.status },
      summary: discussionActivity(ranked, comments, references, commentPostById, follows),
      discussions: await presentPosts(ranked, actorInput, actorRole),
      citations: references.map((reference) => {
        const paper = reference.paperId ? paperById.get(reference.paperId) : undefined;
        return {
          id: publicDatabaseId(reference),
          postId: reference.postId ? publicDatabaseId(ranked.find((post) => post.id === reference.postId) ?? { id: reference.postId }) : undefined,
          commentId: reference.commentId ?? undefined,
          source: reference.postId ? "post" : "response",
          paperId: paper ? publicDatabaseId(paper) : undefined,
          title: paper?.title ?? reference.title ?? undefined,
          doi: paper?.doi ?? reference.doi ?? undefined,
          year: paper?.publicationYear ?? reference.year ?? undefined,
          verified: reference.verified,
        };
      }),
      boundary: "Forum activity is a discovery signal only. It never changes gap confidence, evidence confidence, validation status, or scholarly evidence records.",
    };
  },

  async forumCitationEvidenceOptions(gapInput: string, referenceInput: string, projectInput: string | undefined, actorInput: string) {
    const context = await resolveForumCitationReviewContext(gapInput, referenceInput, projectInput, actorInput);
    const { gap, paper, projectId, projectPaper, extractedEvidence } = context;
    if (!projectPaper) {
      return {
        status: "SCREENING_REQUIRED",
        projectId,
        paper: { id: publicDatabaseId(paper), title: paper.title },
        projectPaper: undefined,
        extractedEvidence: [],
        message: "Include the paper in project screening before extracting structured evidence.",
      };
    }
    if (projectPaper.screeningStatus !== "INCLUDED") {
      return {
        status: "SCREENING_REQUIRED",
        projectId,
        paper: { id: publicDatabaseId(paper), title: paper.title },
        projectPaper: { id: projectPaper.id, screeningStatus: projectPaper.screeningStatus },
        extractedEvidence: [],
        message: "Include the paper in project screening before extracting structured evidence.",
      };
    }
    if (!extractedEvidence.length) {
      return {
        status: "EVIDENCE_EXTRACTION_REQUIRED",
        projectId,
        corpusId: gap.corpusId ? publicDatabaseId({ id: gap.corpusId }) : undefined,
        paper: { id: publicDatabaseId(paper), title: paper.title },
        projectPaper: { id: projectPaper.id, screeningStatus: projectPaper.screeningStatus },
        extractedEvidence: [],
        message: "Extract evidence from this paper before linking it to the candidate gap.",
      };
    }
    return {
      status: "EVIDENCE_SELECTION_REQUIRED",
      projectId,
      corpusId: gap.corpusId ? publicDatabaseId({ id: gap.corpusId }) : undefined,
      paper: { id: publicDatabaseId(paper), title: paper.title },
      projectPaper: { id: projectPaper.id, screeningStatus: projectPaper.screeningStatus },
      extractedEvidence,
      message: "Select one or more structured extracted evidence items before linking them to the candidate gap.",
    };
  },

  async reviewCitationAsEvidence(gapInput: string, input: ReviewAsEvidenceInput, actorInput: string) {
    const prisma = getPrisma();
    const context = await resolveForumCitationReviewContext(gapInput, input.referenceId, input.projectId, actorInput);
    const { gap, actor, reference, comment, post, paper, projectId } = context;
    let { projectPaper } = context;
    if (gap.userId !== actor && !gap.projectId) throw AppError.forbidden("Only the candidate gap owner can review evidence for a standalone gap");
    if (input.screeningStatus === "EXCLUDED" && !input.exclusionReason?.trim()) throw AppError.badRequest("An exclusion reason is required when excluding a paper");
    let paperWasAdded = false;
    const screenedProjectPaper = await prisma.$transaction(async (tx) => {
      const existing = projectPaper ?? await tx.projectPaper.findUnique({ where: { projectId_paperId: { projectId, paperId: paper.id } } });
      const row = existing ?? await tx.projectPaper.create({ data: { projectId, paperId: paper.id, addedById: actor } });
      paperWasAdded = !existing;
      if (!existing) await tx.projectActivity.create({ data: { projectId, actorId: actor, type: "PAPER_ADDED_FROM_FORUM", entityKind: "PAPER", entityId: publicDatabaseId(paper), metadata: { title: paper.title, forumPostId: publicDatabaseId(post), gapId: publicDatabaseId(gap) } } });
      if (input.screeningStatus && input.screeningStatus !== row.screeningStatus) {
        return tx.projectPaper.update({ where: { id: row.id }, data: {
          screeningStatus: input.screeningStatus,
          screenedById: actor,
          screenedAt: new Date(),
          ...(input.screeningStatus === "EXCLUDED" ? { exclusionReason: input.exclusionReason, exclusionNote: input.exclusionNote ?? null, inclusionReason: null } : {}),
          ...(input.screeningStatus === "INCLUDED" || input.screeningStatus === "UNDECIDED" ? { exclusionReason: null, exclusionNote: null } : {}),
        } });
      }
      return row;
    });
    projectPaper = screenedProjectPaper;
    await auditService.log("FORUM_CITATION_REVIEW_STARTED", { userId: actorInput, targetTableName: "forum_references", targetRecordId: reference.id, details: { gapId: publicDatabaseId(gap), postId: publicDatabaseId(post), paperId: publicDatabaseId(paper), projectId } });
    if (paperWasAdded) await auditService.log("PAPER_ADDED_FROM_FORUM", { userId: actorInput, targetTableName: "project_papers", targetRecordId: projectPaper.id, details: { projectId, paperId: publicDatabaseId(paper), referenceId: publicDatabaseId(reference) } });
    if (projectPaper.screeningStatus !== "INCLUDED") {
      return {
        status: paperWasAdded ? "PAPER_ADDED_TO_PROJECT" : "SCREENING_REQUIRED",
        projectId,
        paper: { id: publicDatabaseId(paper), title: paper.title },
        projectPaper: { id: projectPaper.id, screeningStatus: projectPaper.screeningStatus },
        message: "The forum citation is available in project literature. Include the paper before extracting structured gap evidence.",
      };
    }
    const corpusPaper = gap.corpusId
      ? await prisma.corpusPaper.findUnique({ where: { corpusId_paperId: { corpusId: gap.corpusId, paperId: paper.id } } })
      : null;
    const extractedEvidence = (corpusPaper?.included ? structuredEvidenceItems(corpusPaper.evidence) : []) as GapStructuredEvidenceItem[];
    if (!extractedEvidence.length) {
      return {
        status: "EVIDENCE_EXTRACTION_REQUIRED",
        projectId,
        corpusId: gap.corpusId ? publicDatabaseId({ id: gap.corpusId }) : undefined,
        paper: { id: publicDatabaseId(paper), title: paper.title },
        projectPaper: { id: projectPaper.id, screeningStatus: projectPaper.screeningStatus },
        extractedEvidence: [],
        message: "Extract evidence from this paper before linking it to the candidate gap.",
      };
    }
    const selections = input.evidenceSelections ?? (input.evidenceType && input.excerpt ? [{ evidenceType: input.evidenceType, excerpt: input.excerpt }] : []);
    const selectedEvidence = selections.map((selection) => extractedEvidence.find((item) => item.evidenceType === selection.evidenceType && item.excerpt === selection.excerpt.trim())).filter((item): item is GapStructuredEvidenceItem => Boolean(item));
    if (!selectedEvidence.length || selectedEvidence.length !== selections.length) {
      return {
        status: "EVIDENCE_SELECTION_REQUIRED",
        projectId,
        corpusId: gap.corpusId ? publicDatabaseId({ id: gap.corpusId }) : undefined,
        paper: { id: publicDatabaseId(paper), title: paper.title },
        projectPaper: { id: projectPaper.id, screeningStatus: projectPaper.screeningStatus },
        extractedEvidence,
        message: "Select one or more structured extracted evidence items before linking them to the candidate gap.",
      };
    }
    if (!input.confirmRelation || !input.relation) {
      return {
        status: "RELATION_CONFIRMATION_REQUIRED",
        projectId,
        paper: { id: publicDatabaseId(paper), title: paper.title },
        projectPaper: { id: projectPaper.id, screeningStatus: projectPaper.screeningStatus },
        extractedEvidence,
        message: "A researcher must confirm whether the selected extracted evidence is supporting, counter-evidence, or related context.",
      };
    }
    if (input.relation === "RELATED") {
      await auditService.log("FORUM_CITATION_REVIEWED_AS_RELATED", { userId: actorInput, targetTableName: "forum_references", targetRecordId: reference.id, details: { gapId: publicDatabaseId(gap), paperId: publicDatabaseId(paper) } });
      return {
        status: "RELATED_ONLY",
        projectId,
        paper: { id: publicDatabaseId(paper), title: paper.title },
        projectPaper: { id: projectPaper.id, screeningStatus: projectPaper.screeningStatus },
        extractedEvidence: selectedEvidence,
        message: "The paper was recorded as related context only. No GapEvidence record was created.",
      };
    }
    if (!input.explanation || input.explanation.trim().length < 10) throw AppError.badRequest("Explain the structured evidence before linking it to the candidate gap");
    if (!corpusPaper) throw AppError.badRequest("The paper must have structured extracted evidence before it can be linked to the candidate gap");
    try {
      const evidence = await prisma.$transaction(async (tx) => {
        const created = await Promise.all(selectedEvidence.map((selected) => tx.gapEvidenceRecord.create({ data: {
          gapId: gap.id,
          paperId: paper.id,
          addedById: actor,
          evidenceKind: input.relation!,
          evidenceType: selected.evidenceType,
          excerpt: selected.excerpt,
          sourceLocation: selected.sourceLocation,
          projectPaperId: projectPaper.id,
          corpusPaperId: corpusPaper.id,
          forumReferenceId: reference.id,
          forumPostId: post.id,
          forumCommentId: comment?.id,
          explanation: cleanForumText(input.explanation!),
        } })));
        await tx.researchGapPaper.upsert({
          where: { gapId_paperId_kind: { gapId: gap.id, paperId: paper.id, kind: input.relation === "SUPPORTING" ? "supporting" : "evidence" } },
          create: { gapId: gap.id, paperId: paper.id, kind: input.relation === "SUPPORTING" ? "supporting" : "evidence", position: 0 },
          update: {},
        });
        await tx.projectActivity.create({ data: { projectId, actorId: actor, type: "EVIDENCE_EXTRACTED_FROM_FORUM_SOURCE", entityKind: "GAP", entityId: publicDatabaseId(gap), metadata: { title: gap.title, evidenceKind: input.relation, paperId: publicDatabaseId(paper), forumReferenceId: publicDatabaseId(reference) } } });
        return created;
      });
      for (const item of evidence) {
        await auditService.log("EVIDENCE_EXTRACTED_FROM_FORUM_SOURCE", { userId: actorInput, targetTableName: "gap_evidence_records", targetRecordId: item.id, details: { gapId: publicDatabaseId(gap), paperId: publicDatabaseId(paper), relation: input.relation, evidenceType: item.evidenceType, forumReferenceId: publicDatabaseId(reference) } });
        await auditService.log("EVIDENCE_LINKED_TO_GAP", { userId: actorInput, targetTableName: "gap_evidence_records", targetRecordId: item.id, details: { gapId: publicDatabaseId(gap), paperId: publicDatabaseId(paper), relation: input.relation, evidenceType: item.evidenceType } });
      }
      return {
        status: "EVIDENCE_LINKED",
        projectId,
        paper: { id: publicDatabaseId(paper), title: paper.title },
        projectPaper: { id: projectPaper.id, screeningStatus: projectPaper.screeningStatus },
        extractedEvidence: selectedEvidence,
        evidence: evidence.map((item) => ({ id: publicDatabaseId(item), evidenceKind: item.evidenceKind, evidenceType: item.evidenceType, excerpt: item.excerpt, sourceLocation: item.sourceLocation })),
        message: "Selected structured evidence was linked after project screening and researcher confirmation.",
      };
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw AppError.conflict("This paper is already linked to the candidate gap with the same evidence relation");
      throw error;
    }
  },

  async getPost(postId: string, actorId?: string, actorRole?: UserRole, viewerKey?: string) {
    const post = await resolvePost(postId);
    if (post.status === "deleted" && !(await getPrisma().forumComment.count({ where: { postId: post.id, status: { in: ["active", "deleted"] } } }))) throw AppError.notFound("Forum post not found");
    await assertCanViewCommunity(post.communityId ?? undefined, actorId, actorRole);
    if (post.status === "hidden" && (!actorId || (await resolveUserId(actorId)) !== post.authorId && !(await canModerate(post.communityId, actorId, actorRole!)))) throw AppError.notFound("Forum post not found");
    if (viewerKey) await recordForumView(post.id, actorId ? `user:${await resolveUserId(actorId)}` : viewerKey);
    const refreshedPost = viewerKey ? await resolvePost(postId) : post;
    const presented = (await presentPosts([refreshedPost], actorId, actorRole))[0];
    return post.status === "deleted" ? { ...presented, title: "This discussion was removed by its author.", body: "", content: "", tags: [], references: [] } : presented;
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
        editedAt: new Date(), lastActivityAt: new Date(),
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
    const post = await resolvePost(postId);
    const authorId = await resolveUserId(userId);
    const parent = input.parentCommentId ? await resolveComment(input.parentCommentId) : undefined;
    const body = cleanForumText(input.content);
    if (!body || body.length > 10000) throw AppError.badRequest("Response content must contain 1 to 10000 characters");
    const references = await prepareReferences(input.references);
    const prisma = getPrisma();
    const result = await prisma.$transaction(async (tx) => {
      // Match comment moderation's lock order (response, then root).
      if (parent) {
        await tx.$queryRaw`SELECT id FROM forum_comments WHERE id = ${parent.id}::uuid FOR UPDATE`;
        const target = await tx.forumComment.findUnique({ where: { id: parent.id } });
        if (!target || target.postId !== post.id || target.status !== "active") throw AppError.badRequest("Reply target is unavailable or belongs to another discussion");
      }
      if (post.communityId) {
        await tx.$queryRaw`SELECT id FROM communities WHERE id = ${post.communityId}::uuid FOR SHARE`;
        const community = await tx.community.findUnique({ where: { id: post.communityId } });
        if (!community || community.status !== "ACTIVE") throw AppError.conflict("Archived communities are read-only");
        await tx.$queryRaw`SELECT id FROM community_memberships WHERE community_id = ${post.communityId}::uuid AND user_id = ${authorId}::uuid FOR SHARE`;
        const membership = await tx.communityMembership.findUnique({ where: { communityId_userId: { communityId: post.communityId, userId: authorId } } });
        if (membership?.status !== "active") throw AppError.forbidden("Active community membership is required to reply");
      }
      await tx.$queryRaw`SELECT id FROM forum_posts WHERE id = ${post.id}::uuid FOR UPDATE`;
      const root = await tx.forumPost.findUnique({ where: { id: post.id } });
      if (!root || ["deleted", "hidden"].includes(root.status)) throw AppError.notFound("Forum post not found");
      if (root.status !== "active") throw AppError.conflict("This discussion is locked. Your reply was not posted");
      // Paper references expose metadata only, never private files/full text.
      const paperIds = [...new Set(references.flatMap((reference) => reference.paperId ? [reference.paperId] : []))].sort();
      if (paperIds.length) {
        await tx.$queryRaw`SELECT id FROM papers WHERE id = ANY(${paperIds}::uuid[]) ORDER BY id FOR SHARE`;
        if (await tx.paper.count({ where: { id: { in: paperIds }, dataStatus: "active" } }) !== paperIds.length) throw AppError.badRequest("A referenced paper is no longer publicly available");
      }
      // Preserve the actual clicked response. The UI, not the relationship, is flat.
      const created = await tx.forumComment.create({ data: { postId: root.id, authorId, parentCommentId: parent?.id, body } });
      if (references.length) await tx.forumReference.createMany({ data: references.map((reference) => ({ ...reference, commentId: created.id, createdById: authorId })) });
      await tx.forumPost.update({ where: { id: root.id }, data: { commentCount: { increment: 1 }, lastActivityAt: created.createdAt } });
      const followers = await tx.forumThreadFollow.findMany({ where: { postId: root.id }, select: { userId: true } });
      const recipients = new Map(followers.map((follow) => [follow.userId, "FORUM_RESPONSE_CREATED"]));
      recipients.set(root.authorId, "FORUM_RESPONSE_CREATED");
      if (parent) recipients.set(parent.authorId, "FORUM_REPLY_CREATED");
      if (references.length && root.linkedResearchGapId) {
        const gap = await tx.researchGap.findUnique({ where: { id: root.linkedResearchGapId }, select: { userId: true } });
        if (gap && !recipients.has(gap.userId)) recipients.set(gap.userId, "FORUM_CITATION_ADDED_TO_GAP_DISCUSSION");
      }
      recipients.delete(authorId);
      const notifications = await Promise.all([...recipients].map(([recipientId, type]) => notificationService.create({
        userId: recipientId,
        title: type === "FORUM_REPLY_CREATED" ? "New reply to your forum response" : type === "FORUM_CITATION_ADDED_TO_GAP_DISCUSSION" ? "New citation in a linked gap discussion" : "New activity in a forum discussion",
        message: `A new response was added to “${root.title}”.`,
        type, targetKind: "forum_post", targetId: root.id,
      }, tx)));
      // Build the response before commit so a presenter failure cannot be reported
      // as a failed submission after the reply was already persisted.
      const presented = (await presentComments([created], userId, root.acceptedCommentId, tx))[0];
      return { presented, notifications };
    }, { timeout: 15000 });
    // In-app notifications are committed atomically. Push delivery is best-effort,
    // uses the existing queue/job IDs, and cannot reject a successful submission.
    for (const notification of result.notifications) {
      void notificationService.dispatch(notification).catch((err: unknown) => logger.warn({ err, notificationId: notification.id }, "Forum push enqueue failed; in-app notification remains available"));
    }
    if (references.length) {
      void auditService.log("FORUM_CITATION_ADDED", {
        userId,
        targetTableName: "forum_posts",
        targetRecordId: post.id,
        details: { referenceCount: references.length, linkedResearchGapId: post.linkedResearchGapId },
      });
    }
    return result.presented;
  },

  async listComments(postId: string, page: number, pageSize: number, actorId?: string, actorRole?: UserRole) {
    const post = await resolvePost(postId); if (!["active", "locked", "deleted"].includes(post.status)) throw AppError.notFound("Forum post not found");
    if (post.status === "deleted" && !(await getPrisma().forumComment.count({ where: { postId: post.id, status: { in: ["active", "deleted"] } } }))) throw AppError.notFound("Forum post not found");
    await assertCanViewCommunity(post.communityId ?? undefined, actorId, actorRole);
    const where = { postId: post.id, status: { in: ["active", "deleted"] } }; const [data, total] = await Promise.all([
      getPrisma().forumComment.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize }), getPrisma().forumComment.count({ where }),
    ]);
    return { data: await presentComments(data, actorId, post.acceptedCommentId), meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  },
  async updateComment(commentId: string, input: { content: string; references?: ReferenceInput[] }, userId: string) {
    const comment = await resolveComment(commentId); if (comment.status === "deleted") throw AppError.notFound("Comment not found"); if (comment.authorId !== await resolveUserId(userId)) throw AppError.forbidden("Only the author can edit this comment");
    const post = await getPrisma().forumPost.findUniqueOrThrow({ where: { id: comment.postId } });
    if (post.status === "locked") throw AppError.conflict("Responses in a locked discussion cannot be edited");
    const references = input.references !== undefined ? await prepareReferences(input.references) : undefined;
    const updated = await getPrisma().$transaction(async (tx) => { const result = await tx.forumComment.update({ where: { id: comment.id }, data: { body: cleanForumText(input.content), editedAt: new Date() } });
      if (comment.status === "active") await tx.forumPost.update({ where: { id: post.id }, data: { lastActivityAt: result.editedAt! } });
      if (references !== undefined) { await tx.forumReference.deleteMany({ where: { commentId: comment.id } }); if (references.length) await tx.forumReference.createMany({ data: references.map((reference) => ({ ...reference, commentId: comment.id, createdById: comment.authorId })) }); } return result; });
    return (await presentComments([updated], userId, post.acceptedCommentId))[0];
  },
  async deleteComment(commentId: string, userId: string, role: UserRole) {
    const comment = await resolveComment(commentId); if (comment.status === "deleted") throw AppError.notFound("Comment not found"); if (comment.authorId !== await resolveUserId(userId) && role !== "admin") throw AppError.forbidden();
    await getPrisma().$transaction(async (tx) => {
      const changed = await tx.forumComment.updateMany({ where: { id: comment.id, status: comment.status }, data: { status: "deleted" } });
      if (!changed.count) throw AppError.conflict("This response changed. Please try again");
      if (comment.status === "active") await tx.forumPost.updateMany({ where: { id: comment.postId, commentCount: { gt: 0 } }, data: { commentCount: { decrement: 1 } } });
      await tx.forumPost.updateMany({ where: { id: comment.postId, acceptedCommentId: comment.id }, data: { acceptedCommentId: null } });
      const [root, latestReply] = await Promise.all([
        tx.forumPost.findUniqueOrThrow({ where: { id: comment.postId }, select: { createdAt: true, editedAt: true } }),
        tx.forumComment.aggregate({ where: { postId: comment.postId, status: "active" }, _max: { createdAt: true, editedAt: true } }),
      ]);
      await tx.forumPost.update({ where: { id: comment.postId }, data: { lastActivityAt: latestDate(root.editedAt, root.createdAt, latestReply._max.createdAt, latestReply._max.editedAt)! } });
    });
  },
  async moderateComment(commentId: string, action: "RESPONSE_HIDDEN" | "RESPONSE_RESTORED", reason: string | undefined, actorId: string, actorRole: UserRole) {
    const comment = await resolveComment(commentId); const post = await getPrisma().forumPost.findUnique({ where: { id: comment.postId } }); if (!post || !(await canModerate(post.communityId, actorId, actorRole))) throw AppError.forbidden();
    if (comment.status === "deleted") throw AppError.conflict("Removed responses cannot be moderated");
    if (action === "RESPONSE_HIDDEN" && comment.status !== "active") throw AppError.conflict("This response is already hidden");
    if (action === "RESPONSE_RESTORED" && comment.status !== "hidden") throw AppError.conflict("Only a hidden response can be restored");
    const actor = await resolveUserId(actorId);
    const updated = await getPrisma().$transaction(async (tx) => {
      const changed = await tx.forumComment.updateMany({ where: { id: comment.id, status: comment.status }, data: { status: action === "RESPONSE_HIDDEN" ? "hidden" : "active" } });
      if (!changed.count) throw AppError.conflict("This response changed. Please try again");
      const row = await tx.forumComment.findUniqueOrThrow({ where: { id: comment.id } });
      if (action === "RESPONSE_HIDDEN") await tx.forumPost.updateMany({ where: { id: post.id, commentCount: { gt: 0 } }, data: { commentCount: { decrement: 1 } } });
      else await tx.forumPost.update({ where: { id: post.id }, data: { commentCount: { increment: 1 } } });
      if (action === "RESPONSE_HIDDEN") await tx.forumPost.updateMany({ where: { id: post.id, acceptedCommentId: comment.id }, data: { acceptedCommentId: null } });
      const latestReply = await tx.forumComment.aggregate({ where: { postId: post.id, status: "active" }, _max: { createdAt: true, editedAt: true } });
      await tx.forumPost.update({ where: { id: post.id }, data: { lastActivityAt: latestDate(post.editedAt, post.createdAt, latestReply._max.createdAt, latestReply._max.editedAt)! } });
      await tx.forumModerationAction.create({ data: { actorId: actor, communityId: post.communityId, commentId: comment.id, action, reason: reason ? cleanForumText(reason) : undefined } });
      return row;
    });
    await auditService.log(action, { userId: actorId, targetTableName: "forum_comments", targetRecordId: comment.id, details: { reason, communityId: post.communityId } });
    return (await presentComments([updated], actorId, action === "RESPONSE_HIDDEN" && post.acceptedCommentId === comment.id ? undefined : post.acceptedCommentId))[0];
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

  async follow(postInput: string, userInput: string, following: boolean, actorRole: UserRole = "user") {
    const [post, userId] = await Promise.all([resolvePost(postInput), resolveUserId(userInput)]);
    if (!["active", "locked"].includes(post.status)) throw AppError.notFound("Forum discussion not found");
    await assertCanViewCommunity(post.communityId ?? undefined, userInput, actorRole);
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
