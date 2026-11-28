import {
  mentorResourceCategories,
  type MentorPaperMetadata,
  type MentorResourceCategory,
  type MentorResourceInbox,
  type MentorResourceInboxItem,
  type MentorResourceInboxQuery,
  type MentorResourceKind,
  type MentorResourcePermissionLabel,
  type MentorResourceReviewLink,
  type MentorResourceSort,
  type MentorResourceSourceKind,
  type MentorResourceVersionEntry,
} from "@trend/shared-types";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { workspaceId } from "./workspace-access.js";
import { isVerifiedLecturer } from "./academic-relationship-access.js";
import { visibleMentorReviewAssignments } from "../reviews/mentor-review-access.js";

const DEFAULT_INBOX_SHARE_KINDS: readonly MentorResourceKind[] = ["PAPER", "SUBMISSION", "MANUSCRIPT", "GAP"];
const READABLE_REVIEW_STATUSES = new Set(["ACCEPTED", "IN_REVIEW", "RESUBMITTED", "REVISION_REQUESTED", "COMPLETED"]);

const DOC_TYPE_SEARCH_LABELS: Record<string, string> = {
  RESEARCH_PAPER: "bản thảo nghiên cứu bài báo khoa học research paper manuscript",
  LITERATURE_REVIEW: "tổng quan tài liệu literature review",
  RESEARCH_PROPOSAL: "đề cương nghiên cứu research proposal",
  METHODOLOGY: "phương pháp nghiên cứu methodology",
  SOFTWARE_RESEARCH_PROJECT: "dự án phần mềm nghiên cứu software research project",
  MANUSCRIPT: "bản thảo manuscript",
  THESIS_CHAPTER: "chương luận văn thesis chapter",
  THESIS_DRAFT: "bản thảo luận văn thesis draft",
  GAP_ANALYSIS: "phân tích khoảng trống gap analysis",
  EVIDENCE_SYNTHESIS: "tổng hợp bằng chứng evidence synthesis",
  RESEARCH_PLAN: "kế hoạch nghiên cứu research plan",
  GENERAL_REPORT: "báo cáo nghiên cứu báo cáo chung general report",
};

export interface InboxExplicitShareRow {
  id: string;
  projectId: string;
  accessId: string;
  sharedById: string;
  kind: MentorResourceKind;
  resourceId: string;
  sectionKey: string;
  title: string;
  message: string | null;
  accessMode: "VIEW" | "COMMENT" | null;
  hasPdf: boolean;
  createdAt: Date;
  revokedAt: Date | null;
  canComment: boolean;
}

export interface InboxReviewGrantRow {
  assignmentId: string;
  requestId: string | null;
  projectId: string;
  accessId: string;
  submissionId: string;
  submissionTitle: string;
  submissionType: string | null;
  requestStatus: string;
  requestMessage: string | null;
  requesterName?: string;
  createdAt: Date;
  revisions: MentorResourceVersionEntry[];
}

export interface InboxAggregationInput {
  projects: Map<string, { id: string; title: string; status: string }>;
  explicitShares: InboxExplicitShareRow[];
  paperMetadata: Map<string, MentorPaperMetadata>;
  submissionMeta: Map<string, { id: string; projectId: string; title: string; submissionType: string | null }>;
  peopleNames: Map<string, string>;
  reviewGrants: InboxReviewGrantRow[];
}

export function classifyResourceCategory(
  kind: MentorResourceKind,
  documentType?: string | null,
): Exclude<MentorResourceCategory, "ALL"> {
  if (kind === "PAPER") return "REFERENCE_PAPER";
  if (kind === "GAP") return "RESEARCH_GAP";
  if (kind === "SUBMISSION" && documentType === "RESEARCH_PLAN") return "RESEARCH_PLAN";
  return "MANUSCRIPT_REPORT";
}

export function canonicalResourceKey(
  kind: MentorResourceKind,
  projectId: string,
  resourceId: string,
  sectionKey = "",
): string {
  if (kind === "PAPER") return `paper:${projectId}:${resourceId}:${sectionKey}`;
  if (kind === "SUBMISSION") return `submission:${projectId}:${resourceId}`;
  if (kind === "MANUSCRIPT") return `manuscript:${projectId}:${resourceId}:${sectionKey}`;
  if (kind === "GAP") return `gap:${projectId}:${resourceId}`;
  return `${kind.toLowerCase()}:${projectId}:${resourceId}:${sectionKey}`;
}

function mergeVersions(
  existing: MentorResourceVersionEntry[],
  incoming: MentorResourceVersionEntry[],
): MentorResourceVersionEntry[] {
  const byRev = new Map<string, MentorResourceVersionEntry>();
  for (const entry of [...existing, ...incoming]) {
    const prev = byRev.get(entry.revisionId);
    if (!prev) {
      byRev.set(entry.revisionId, { ...entry });
      continue;
    }
    byRev.set(entry.revisionId, {
      ...prev,
      originalFileName: prev.originalFileName ?? entry.originalFileName ?? null,
      contentType: prev.contentType ?? entry.contentType ?? null,
      reviewRequestId: prev.reviewRequestId ?? entry.reviewRequestId ?? null,
      reviewId: prev.reviewId ?? entry.reviewId ?? null,
      reviewStatus: prev.reviewStatus ?? entry.reviewStatus ?? null,
    });
  }
  return [...byRev.values()].sort(
    (a, b) =>
      b.revisionNumber - a.revisionNumber ||
      Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
      a.revisionId.localeCompare(b.revisionId),
  );
}

function mergeReviewLinks(
  existing: MentorResourceReviewLink[],
  incoming: MentorResourceReviewLink[],
): MentorResourceReviewLink[] {
  const byRequest = new Map<string, MentorResourceReviewLink>();
  for (const link of [...existing, ...incoming]) {
    const prev = byRequest.get(link.requestId);
    if (!prev || link.revisionNumber > prev.revisionNumber) {
      byRequest.set(link.requestId, link);
    }
  }
  return [...byRequest.values()].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.requestId.localeCompare(b.requestId),
  );
}

function resolvePermissionMode(
  sourceKinds: readonly MentorResourceSourceKind[],
  canComment: boolean,
): MentorResourcePermissionLabel {
  if (sourceKinds.includes("REVIEW_REQUEST")) return "REVIEW_ASSIGNED";
  return canComment ? "COMMENT" : "VIEW_ONLY";
}

/**
 * Pure aggregation & canonical deduplication across authorized explicit shares
 * and authorized review-shared manuscripts. Never deduplicates by title or
 * filename and never merges items across different projects.
 */
export function aggregateAndDeduplicateResources(input: InboxAggregationInput): MentorResourceInboxItem[] {
  const byKey = new Map<string, MentorResourceInboxItem>();

  // 1. Explicit resource shares (Source A)
  for (const share of input.explicitShares) {
    if (!DEFAULT_INBOX_SHARE_KINDS.includes(share.kind)) continue;
    if (share.kind === "PAPER" && share.sectionKey.startsWith("screening:")) continue;
    const project = input.projects.get(share.projectId);
    if (!project) continue;

    const key = canonicalResourceKey(share.kind, share.projectId, share.resourceId, share.sectionKey);
    const subMeta = share.kind === "SUBMISSION" ? input.submissionMeta.get(share.resourceId) : undefined;
    const documentType = subMeta?.submissionType ?? null;
    const category = classifyResourceCategory(share.kind, documentType);
    const sharedAtIso = share.createdAt.toISOString();
    const sourceKinds: MentorResourceSourceKind[] = ["EXPLICIT_SHARE"];

    const candidate: MentorResourceInboxItem = {
      id: share.id,
      canonicalKey: key,
      projectId: share.projectId,
      projectTitle: project.title,
      sharedByName: input.peopleNames.get(share.sharedById),
      accessId: share.accessId,
      category,
      sourceKinds,
      permissionMode: resolvePermissionMode(sourceKinds, share.canComment),
      documentType,
      originalFileName: null,
      latestRevisionNumber: null,
      latestRevisionId: null,
      sharedVersionCount: 0,
      versions: [],
      reviewRequests: [],
      sharedAt: sharedAtIso,
      resource: {
        id: share.id,
        kind: share.kind,
        resourceId: share.resourceId,
        sectionKey: share.sectionKey,
        title: share.title || subMeta?.title || "Tài liệu được chia sẻ",
        message: share.message,
        paper: share.kind === "PAPER" ? (input.paperMetadata.get(share.resourceId) ?? null) : null,
        hasPdf: share.hasPdf,
        accessMode: share.accessMode,
        createdAt: sharedAtIso,
        revokedAt: share.revokedAt?.toISOString() ?? null,
        canComment: share.canComment,
      },
    };

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, candidate);
    } else {
      const existingTime = Date.parse(existing.sharedAt ?? existing.resource.createdAt);
      const nextTime = Date.parse(sharedAtIso);
      const mergedCanComment = Boolean(existing.resource.canComment || candidate.resource.canComment);
      const mergedSources = [...new Set<MentorResourceSourceKind>([...(existing.sourceKinds ?? []), "EXPLICIT_SHARE"])];
      const latest = nextTime > existingTime ? candidate : existing;
      byKey.set(key, {
        ...latest,
        sourceKinds: mergedSources,
        permissionMode: resolvePermissionMode(mergedSources, mergedCanComment),
        sharedAt: nextTime > existingTime ? sharedAtIso : existing.sharedAt,
        resource: {
          ...latest.resource,
          hasPdf: Boolean(existing.resource.hasPdf || candidate.resource.hasPdf),
          canComment: mergedCanComment,
          message: latest.resource.message ?? existing.resource.message ?? null,
        },
      });
    }
  }

  // 2. Review-shared manuscripts / reports / plans (Source B)
  for (const grant of input.reviewGrants) {
    const project = input.projects.get(grant.projectId);
    if (!project || !grant.revisions.length) continue;

    const key = canonicalResourceKey("SUBMISSION", grant.projectId, grant.submissionId);
    const sortedRevs = mergeVersions([], grant.revisions);
    const latestRev = sortedRevs[0]!;
    const sharedAtIso = grant.createdAt.toISOString();
    const category = classifyResourceCategory("SUBMISSION", grant.submissionType);
    const reviewLink: MentorResourceReviewLink[] = grant.requestId
      ? [{
          requestId: grant.requestId,
          assignmentId: grant.assignmentId,
          revisionId: latestRev.revisionId,
          revisionNumber: latestRev.revisionNumber,
          status: grant.requestStatus,
          createdAt: sharedAtIso,
        }]
      : [];

    const existing = byKey.get(key);
    if (!existing) {
      const sourceKinds: MentorResourceSourceKind[] = ["REVIEW_REQUEST"];
      byKey.set(key, {
        id: `review-submission:${grant.projectId}:${grant.submissionId}`,
        canonicalKey: key,
        projectId: grant.projectId,
        projectTitle: project.title,
        sharedByName: grant.requesterName,
        accessId: grant.accessId,
        category,
        sourceKinds,
        permissionMode: "REVIEW_ASSIGNED",
        documentType: grant.submissionType,
        originalFileName: latestRev.originalFileName ?? null,
        latestRevisionNumber: latestRev.revisionNumber,
        latestRevisionId: latestRev.revisionId,
        sharedVersionCount: sortedRevs.length,
        versions: sortedRevs,
        reviewRequests: reviewLink,
        sharedAt: sharedAtIso,
        resource: {
          id: latestRev.revisionId,
          kind: "SUBMISSION",
          resourceId: grant.submissionId,
          sectionKey: "",
          title: grant.submissionTitle,
          message: grant.requestMessage,
          paper: null,
          hasPdf: latestRev.contentType === "PDF",
          accessMode: "VIEW",
          createdAt: sharedAtIso,
          revokedAt: null,
          canComment: false,
        },
      });
      continue;
    }

    // Merge into existing canonical submission entry (either explicit SUBMISSION share or another review grant)
    const mergedVersions = mergeVersions(existing.versions ?? [], sortedRevs);
    const topRev = mergedVersions[0] ?? latestRev;
    const mergedRequests = mergeReviewLinks(existing.reviewRequests ?? [], reviewLink);
    const mergedSources = [...new Set<MentorResourceSourceKind>([...(existing.sourceKinds ?? []), "REVIEW_REQUEST"])];
    const existingTs = Date.parse(existing.sharedAt ?? existing.resource.createdAt);
    const grantTs = Date.parse(sharedAtIso);
    const newestAt = grantTs > existingTs ? sharedAtIso : (existing.sharedAt ?? existing.resource.createdAt);

    byKey.set(key, {
      ...existing,
      sharedByName: grantTs > existingTs ? (grant.requesterName ?? existing.sharedByName) : (existing.sharedByName ?? grant.requesterName),
      category,
      sourceKinds: mergedSources,
      permissionMode: resolvePermissionMode(mergedSources, Boolean(existing.resource.canComment)),
      documentType: grant.submissionType ?? existing.documentType ?? null,
      originalFileName: topRev.originalFileName ?? existing.originalFileName ?? null,
      latestRevisionNumber: topRev.revisionNumber,
      latestRevisionId: topRev.revisionId,
      sharedVersionCount: mergedVersions.length,
      versions: mergedVersions,
      reviewRequests: mergedRequests,
      sharedAt: newestAt,
      resource: {
        ...existing.resource,
        title: grant.submissionTitle || existing.resource.title,
        message: existing.resource.message ?? grant.requestMessage ?? null,
        hasPdf: Boolean(existing.resource.hasPdf || mergedVersions.some(v => v.contentType === "PDF")),
        createdAt: newestAt,
      },
    });
  }

  return [...byKey.values()];
}

function itemMatchesQuery(item: MentorResourceInboxItem, needle: string): boolean {
  const haystacks: string[] = [
    item.resource.title,
    item.projectTitle,
    item.sharedByName ?? "",
    item.originalFileName ?? "",
    item.documentType ?? "",
    item.documentType ? (DOC_TYPE_SEARCH_LABELS[item.documentType] ?? "") : "",
    item.resource.paper?.doi ?? "",
    item.resource.paper?.source ?? "",
    ...(item.resource.paper?.authors ?? []),
    ...(item.versions?.map(v => v.originalFileName ?? "") ?? []),
  ];
  if (item.category === "REFERENCE_PAPER") haystacks.push("bài báo tham khảo reference paper");
  if (item.category === "RESEARCH_GAP") haystacks.push("cơ hội nghiên cứu research gap");
  if (item.category === "RESEARCH_PLAN") haystacks.push("kế hoạch nghiên cứu research plan");
  if (item.category === "MANUSCRIPT_REPORT") haystacks.push("bản thảo báo cáo đề cương manuscript report proposal");
  return haystacks.some(text => text.toLowerCase().includes(needle));
}

function sortItems(items: MentorResourceInboxItem[], sort: MentorResourceSort): MentorResourceInboxItem[] {
  const copy = [...items];
  if (sort === "oldest") {
    copy.sort(
      (a, b) =>
        Date.parse(a.sharedAt ?? a.resource.createdAt) - Date.parse(b.sharedAt ?? b.resource.createdAt) ||
        a.resource.title.localeCompare(b.resource.title, "vi", { sensitivity: "base" }) ||
        a.id.localeCompare(b.id),
    );
    return copy;
  }
  if (sort === "title") {
    copy.sort(
      (a, b) =>
        a.resource.title.localeCompare(b.resource.title, "vi", { sensitivity: "base" }) ||
        Date.parse(b.sharedAt ?? b.resource.createdAt) - Date.parse(a.sharedAt ?? a.resource.createdAt) ||
        a.id.localeCompare(b.id),
    );
    return copy;
  }
  // Default: newest shared first, deterministic tie-breakers
  copy.sort(
    (a, b) =>
      Date.parse(b.sharedAt ?? b.resource.createdAt) - Date.parse(a.sharedAt ?? a.resource.createdAt) ||
      a.resource.title.localeCompare(b.resource.title, "vi", { sensitivity: "base" }) ||
      a.id.localeCompare(b.id),
  );
  return copy;
}

export function filterSortAndPaginateResources(
  authorizedItems: MentorResourceInboxItem[],
  page = 1,
  query: MentorResourceInboxQuery = {},
): MentorResourceInbox {
  const pageSize = Math.max(1, Math.min(50, query.pageSize ?? 20));
  const safePage = Math.max(1, Math.min(10000, page));
  const q = query.q?.trim().toLowerCase() ?? "";
  const category: MentorResourceCategory = query.category ?? "ALL";
  const sort: MentorResourceSort = query.sort ?? "newest";

  // Available projects computed strictly from the authorized deduplicated set
  const projectMap = new Map<string, string>();
  for (const item of authorizedItems) {
    if (!projectMap.has(item.projectId)) projectMap.set(item.projectId, item.projectTitle);
  }
  const projects = [...projectMap.entries()]
    .map(([id, title]) => ({ id, title }))
    .sort((a, b) => a.title.localeCompare(b.title, "vi", { sensitivity: "base" }) || a.id.localeCompare(b.id));

  // Pre-category filtering (projectId, paperId, search query)
  const preCategory = authorizedItems.filter(item => {
    if (query.projectId && item.projectId !== query.projectId) return false;
    if (query.paperId && !(item.resource.kind === "PAPER" && item.resource.resourceId === query.paperId)) return false;
    if (q && !itemMatchesQuery(item, q)) return false;
    return true;
  });

  // Category facet counts computed strictly AFTER authorization & deduplication and BEFORE pagination
  const categoryCounts = Object.fromEntries(
    mentorResourceCategories.map(c => [c, 0]),
  ) as Record<MentorResourceCategory, number>;
  categoryCounts.ALL = preCategory.length;
  for (const item of preCategory) {
    const cat = item.category ?? classifyResourceCategory(item.resource.kind, item.documentType);
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
  }

  const filtered = category === "ALL"
    ? preCategory
    : preCategory.filter(item => (item.category ?? classifyResourceCategory(item.resource.kind, item.documentType)) === category);

  const sorted = sortItems(filtered, sort);
  const total = sorted.length;
  const start = (safePage - 1) * pageSize;
  const items = sorted.slice(start, start + pageSize);

  return {
    items,
    total,
    page: safePage,
    pageSize,
    hasNext: safePage * pageSize < total,
    unfilteredTotal: authorizedItems.length,
    projects,
    categoryCounts,
  };
}

export async function loadMentorSharedResourcesInbox(
  actor: string,
  page = 1,
  query: MentorResourceInboxQuery = {},
  helpers: {
    canReadMentorShare: (policy: { permissions: string[] }, share: { kind: string; accessMode?: string | null }) => boolean;
    canCommentMentorShare: (policy: { permissions: string[] }, share: { kind: string; accessMode?: string | null }) => boolean;
    paperMetadata: (tx: ReturnType<typeof getPrisma>, ids: string[]) => Promise<Map<string, MentorPaperMetadata>>;
  },
): Promise<MentorResourceInbox> {
  const db = getPrisma();
  const person = await db.user.findUnique({
    where: workspaceId(actor),
    select: { id: true, isActive: true, accountStatus: true, emailVerifiedAt: true },
  });
  const profile = person
    ? await db.academicProfile.findUnique({
        where: { userId: person.id },
        select: { academicRole: true, roleVerificationStatus: true, positionStatus: true },
      })
    : null;
  if (!person || !isVerifiedLecturer(person, profile)) {
    throw AppError.forbidden("Cần tài khoản giảng viên đã xác minh");
  }

  const relations = await db.mentorRelationship.findMany({
    where: { mentorUserId: person.id, status: "ACTIVE" },
    select: { id: true, projectId: true, sourceRequestId: true },
  });
  if (!relations.length) {
    return filterSortAndPaginateResources([], page, query);
  }

  const projects = await db.project.findMany({
    where: { id: { in: [...new Set(relations.map(r => r.projectId))] }, deletedAt: null },
    select: { id: true, title: true, status: true },
  });
  if (!projects.length) {
    return filterSortAndPaginateResources([], page, query);
  }

  const activeProjectIds = projects.map(p => p.id);
  const projectMap = new Map(projects.map(p => [p.id, p]));
  const accepted = await db.mentorshipRequest.findMany({
    where: { projectId: { in: activeProjectIds }, mentorUserId: person.id, status: "ACCEPTED" },
    select: { id: true },
  });
  const policies = await db.mentorAccess.findMany({
    where: {
      requestId: { in: accepted.map(r => r.id) },
      mentorUserId: person.id,
      projectId: { in: activeProjectIds },
      relationshipId: { in: relations.map(r => r.id) },
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
  if (!policies.length) {
    return filterSortAndPaginateResources([], page, query);
  }

  const policyById = new Map(policies.map(p => [p.id, p]));
  const policyByProjectId = new Map<string, (typeof policies)[number]>();
  for (const policy of policies) {
    const prev = policyByProjectId.get(policy.projectId);
    if (!prev || policy.createdAt > prev.createdAt) policyByProjectId.set(policy.projectId, policy);
  }

  // Batched queries for Source A (explicit shares) and Source B (review-shared manuscripts)
  const [rawShares, rawAssignments] = await Promise.all([
    db.mentorResourceShare.findMany({
      where: {
        accessId: { in: policies.map(p => p.id) },
        projectId: { in: activeProjectIds },
        revokedAt: null,
        kind: { in: [...DEFAULT_INBOX_SHARE_KINDS] },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        projectId: true,
        accessId: true,
        sharedById: true,
        kind: true,
        resourceId: true,
        sectionKey: true,
        title: true,
        message: true,
        accessMode: true,
        sourceFileId: true,
        createdAt: true,
        revokedAt: true,
      },
    }),
    db.reviewerAssignment.findMany({
      where: {
        reviewerId: person.id,
        status: { in: ["assigned", "accepted", "completed"] },
      },
    }),
  ]);

  // Enforce explicit share read authorization
  const explicitShares: InboxExplicitShareRow[] = [];
  for (const share of rawShares) {
    const policy = policyById.get(share.accessId);
    const project = projectMap.get(share.projectId);
    if (!policy || !project) continue;
    if (share.kind === "PAPER" && share.sectionKey.startsWith("screening:")) continue;
    if (!helpers.canReadMentorShare(policy, share)) continue;
    const isReadOnlyProject = ["ARCHIVED", "COMPLETED"].includes(project.status);
    explicitShares.push({
      id: share.id,
      projectId: share.projectId,
      accessId: share.accessId,
      sharedById: share.sharedById,
      kind: share.kind as MentorResourceKind,
      resourceId: share.resourceId,
      sectionKey: share.sectionKey,
      title: share.title,
      message: share.message,
      accessMode: share.accessMode as "VIEW" | "COMMENT" | null,
      hasPdf: Boolean(share.sourceFileId),
      createdAt: share.createdAt,
      revokedAt: share.revokedAt,
      canComment: !isReadOnlyProject && helpers.canCommentMentorShare(policy, share),
    });
  }

  // Enforce review assignment authorization via single source of truth visibleMentorReviewAssignments
  const visibleAssignments = await visibleMentorReviewAssignments(db, rawAssignments);
  const requestIds = visibleAssignments.flatMap(a => (a.reviewRequestId ? [a.reviewRequestId] : []));
  const [reviewRequests, submittedReviews] = await Promise.all([
    requestIds.length
      ? db.reviewRequest.findMany({
          where: { id: { in: requestIds }, projectId: { in: activeProjectIds }, origin: "MENTOR_GUIDANCE" },
          select: {
            id: true,
            projectId: true,
            submissionId: true,
            requesterId: true,
            artifactRevisionId: true,
            status: true,
            message: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    visibleAssignments.length
      ? db.humanReview.findMany({
          where: { assignmentId: { in: visibleAssignments.map(a => a.id) }, status: "SUBMITTED" },
          select: { id: true, assignmentId: true, submissionId: true, revisionId: true, roundNumber: true },
        })
      : Promise.resolve([]),
  ]);

  const requestById = new Map(reviewRequests.map(r => [r.id, r]));
  const readableAssignments = visibleAssignments.filter(assignment => {
    if (assignment.reviewRequestId) {
      const req = requestById.get(assignment.reviewRequestId);
      if (!req) return false;
      if (!["accepted", "completed"].includes(assignment.status)) return false;
      if (!READABLE_REVIEW_STATUSES.has(req.status)) return false;
      if (req.submissionId !== assignment.submissionId || req.artifactRevisionId !== assignment.artifactRevisionId) return false;
      return projectMap.has(req.projectId);
    }
    return assignment.anonymousCode.startsWith("mentor-");
  });

  // Collect all submission IDs, paper IDs, revision IDs, and user IDs for batched metadata reads (zero N+1!)
  const submissionIds = new Set<string>();
  const paperIds = new Set<string>();
  const authorizedRevisionIds = new Set<string>();
  const userIds = new Set<string>();

  for (const share of explicitShares) {
    userIds.add(share.sharedById);
    if (share.kind === "PAPER") paperIds.add(share.resourceId);
    if (share.kind === "SUBMISSION") submissionIds.add(share.resourceId);
  }
  for (const assignment of readableAssignments) {
    submissionIds.add(assignment.submissionId);
    if (assignment.artifactRevisionId) authorizedRevisionIds.add(assignment.artifactRevisionId);
    userIds.add(assignment.assignedById);
    const req = assignment.reviewRequestId ? requestById.get(assignment.reviewRequestId) : undefined;
    if (req) {
      authorizedRevisionIds.add(req.artifactRevisionId);
      userIds.add(req.requesterId);
    }
  }
  for (const review of submittedReviews) {
    if (readableAssignments.some(a => a.id === review.assignmentId && a.submissionId === review.submissionId)) {
      authorizedRevisionIds.add(review.revisionId);
    }
  }

  const [paperMetaMap, submissions, revisions, people] = await Promise.all([
    paperIds.size ? helpers.paperMetadata(db, [...paperIds]) : Promise.resolve(new Map<string, MentorPaperMetadata>()),
    submissionIds.size
      ? db.submission.findMany({
          where: { id: { in: [...submissionIds] }, projectId: { in: activeProjectIds } },
          select: { id: true, projectId: true, title: true, submissionType: true },
        })
      : Promise.resolve([]),
    authorizedRevisionIds.size
      ? db.submissionRevision.findMany({
          where: { id: { in: [...authorizedRevisionIds] } },
          select: { id: true, submissionId: true, revisionNumber: true, originalFileName: true, contentType: true, createdAt: true },
        })
      : Promise.resolve([]),
    userIds.size
      ? db.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, fullName: true } })
      : Promise.resolve([]),
  ]);

  const submissionMetaMap = new Map(submissions.map(s => [s.id, s]));
  const revisionById = new Map(revisions.map(r => [r.id, r]));
  const peopleNames = new Map(people.map(u => [u.id, u.fullName]));

  const reviewGrants: InboxReviewGrantRow[] = [];
  for (const assignment of readableAssignments) {
    const sub = submissionMetaMap.get(assignment.submissionId);
    if (!sub || !projectMap.has(sub.projectId)) continue;
    const req = assignment.reviewRequestId ? requestById.get(assignment.reviewRequestId) : undefined;
    const policy = (assignment.mentorAccessId ? policyById.get(assignment.mentorAccessId) : undefined) ?? policyByProjectId.get(sub.projectId);
    if (!policy) continue;

    const revIdsForAssignment = new Map<string, { reviewId: string | null }>();
    const currentRevId = req?.artifactRevisionId ?? assignment.artifactRevisionId;
    if (currentRevId) revIdsForAssignment.set(currentRevId, { reviewId: null });
    for (const review of submittedReviews) {
      if (review.assignmentId === assignment.id && review.submissionId === sub.id) {
        revIdsForAssignment.set(review.revisionId, { reviewId: review.id });
      }
    }

    const revEntries: MentorResourceVersionEntry[] = [];
    for (const [revId, extra] of revIdsForAssignment.entries()) {
      const rev = revisionById.get(revId);
      if (!rev || rev.submissionId !== sub.id) continue;
      revEntries.push({
        revisionId: rev.id,
        revisionNumber: rev.revisionNumber,
        originalFileName: rev.originalFileName,
        contentType: rev.contentType,
        createdAt: rev.createdAt.toISOString(),
        reviewRequestId: req?.id ?? null,
        reviewId: extra.reviewId,
        reviewStatus: req?.status ?? null,
      });
    }
    if (!revEntries.length) continue;

    reviewGrants.push({
      assignmentId: assignment.id,
      requestId: req?.id ?? null,
      projectId: sub.projectId,
      accessId: policy.id,
      submissionId: sub.id,
      submissionTitle: sub.title,
      submissionType: sub.submissionType,
      requestStatus: req?.status ?? (assignment.status === "completed" ? "COMPLETED" : "IN_REVIEW"),
      requestMessage: req?.message ?? null,
      requesterName: peopleNames.get(req?.requesterId ?? assignment.assignedById),
      createdAt: req?.createdAt ?? assignment.createdAt,
      revisions: revEntries,
    });
  }

  const aggregated = aggregateAndDeduplicateResources({
    projects: projectMap,
    explicitShares,
    paperMetadata: paperMetaMap,
    submissionMeta: submissionMetaMap,
    peopleNames,
    reviewGrants,
  });

  return filterSortAndPaginateResources(aggregated, page, query);
}
