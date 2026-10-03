import type { AcademicRole, HomeAttentionItem, HomeCommunityTopic, HomeRecommendedPaper, HomeResearchOverview, HomeResearchWorkspace } from "@trend/shared-types";
import { Prisma } from "../../generated/prisma/client.js";
import type { AuthClaims } from "../../common/middleware/auth.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { capabilityService } from "../authorization/capability.service.js";
import { forumService } from "../forum/forum.service.js";
import { logger } from "../../infrastructure/logger.js";

// Read models only: source workflow objects remain the single source of truth.
function projectScope(userId: string) {
  return Prisma.sql`WITH accessible_projects AS (
    SELECT p.* FROM projects p WHERE p.archived_at IS NULL AND p.status NOT IN ('ARCHIVED', 'COMPLETED')
      AND (p.owner_id = ${userId}::uuid OR EXISTS (
        SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = ${userId}::uuid AND m.status = 'ACTIVE'
      ))
  )`;
}

export async function researchWorkspace(userId: string, academicRole?: AcademicRole) {
  const prisma = getPrisma();
  const capabilities = await capabilityService.list(userId);
  const scope = projectScope(userId);
  type WorkspaceRow = Omit<HomeResearchWorkspace, "stage" | "href" | "updatedAt"> & { updatedAt: Date; revisionId: string | null };
  type AttentionRow = Omit<HomeAttentionItem, "occurredAt"> & { occurredAt: Date };
  const [projects, tasks] = await Promise.all([
    prisma.$queryRaw<WorkspaceRow[]>(Prisma.sql`${scope}, summaries AS (
      SELECT p.id::text, p.title, p.research_field AS "researchField", p.owner_id = ${userId}::uuid AS "isOwner",
        GREATEST(p.updated_at, COALESCE((SELECT MAX(a.created_at) FROM project_activities a WHERE a.project_id = p.id), p.updated_at),
          COALESCE((SELECT MAX(pp.updated_at) FROM project_papers pp WHERE pp.project_id = p.id), p.updated_at)) AS "updatedAt",
        (SELECT COUNT(*)::int FROM project_papers pp WHERE pp.project_id = p.id) AS "paperCount",
        (SELECT COUNT(*)::int FROM project_papers pp WHERE pp.project_id = p.id AND pp.screening_status <> 'UNDECIDED') AS "screenedCount",
        (SELECT COUNT(*)::int FROM project_papers pp WHERE pp.project_id = p.id AND pp.screening_status = 'UNDECIDED') AS "awaitingScreening",
        (SELECT COUNT(*)::int FROM project_papers pp WHERE pp.project_id = p.id AND pp.screening_status = 'INCLUDED') AS "includedCount",
        (SELECT COUNT(*)::int FROM gap_evidence_records e JOIN research_gaps g ON g.id = e.gap_id
          WHERE g.project_id = p.id AND g.status = 'active') AS "evidenceCount",
        (SELECT COUNT(DISTINCT pp.paper_id)::int FROM project_papers pp WHERE pp.project_id = p.id AND pp.screening_status = 'INCLUDED'
          AND EXISTS (SELECT 1 FROM gap_evidence_records e JOIN research_gaps g ON g.id = e.gap_id
            WHERE g.project_id = p.id AND g.status = 'active' AND e.paper_id = pp.paper_id)) AS "papersWithEvidence",
        (SELECT COUNT(*)::int FROM research_gaps g WHERE g.project_id = p.id AND g.status = 'active' AND g.validation_status = 'CANDIDATE') AS "candidateGapCount",
        (SELECT r.id::text FROM review_requests r WHERE r.project_id = p.id AND r.requester_id = ${userId}::uuid
          AND r.status = 'REVISION_REQUESTED' ORDER BY r.updated_at DESC LIMIT 1) AS "revisionId"
      FROM accessible_projects p
    ) SELECT * FROM summaries ORDER BY
      ("revisionId" IS NOT NULL OR "awaitingScreening" > 0 OR "includedCount" > "papersWithEvidence") DESC,
      "updatedAt" DESC, "isOwner" DESC, id LIMIT 3`),
    prisma.$queryRaw<AttentionRow[]>(Prisma.sql`${scope}, tasks AS (
      SELECT 'screening-' || p.id AS id, 'screening' AS type, p.title, NULL::text AS description,
        COUNT(pp.id)::int AS count, '/projects/' || COALESCE(p.legacy_mongo_id, p.id::text) || '?tab=papers&screening=UNDECIDED' AS href,
        MAX(pp.updated_at) AS "occurredAt", 40 AS priority, p.id::text AS "projectId", NULL::text AS "relationshipId"
      FROM accessible_projects p JOIN project_papers pp ON pp.project_id = p.id AND pp.screening_status = 'UNDECIDED'
      GROUP BY p.id, p.title, p.legacy_mongo_id
      UNION ALL
      SELECT 'evidence-' || p.id, 'evidence', p.title, NULL, COUNT(pp.id)::int,
        '/projects/' || COALESCE(p.legacy_mongo_id, p.id::text) || '?tab=papers&screening=INCLUDED', MAX(pp.updated_at), 35, p.id::text, NULL
      FROM accessible_projects p JOIN project_papers pp ON pp.project_id = p.id AND pp.screening_status = 'INCLUDED'
      WHERE NOT EXISTS (SELECT 1 FROM gap_evidence_records e JOIN research_gaps g ON g.id = e.gap_id
        WHERE g.project_id = p.id AND g.status = 'active' AND e.paper_id = pp.paper_id)
      GROUP BY p.id, p.title, p.legacy_mongo_id
      UNION ALL
      SELECT 'revision-' || r.id, 'revision', s.title, p.title, NULL,
        '/review-requests/' || r.id, r.updated_at, 90, p.id::text, NULL
      FROM review_requests r JOIN accessible_projects p ON p.id = r.project_id JOIN submissions s ON s.id = r.submission_id
      WHERE r.requester_id = ${userId}::uuid AND r.status = 'REVISION_REQUESTED'
      UNION ALL
      SELECT 'review-' || a.id, 'review', s.title, NULL, NULL,
        CASE WHEN a.review_request_id IS NULL THEN '/reviews/' || COALESCE(a.legacy_mongo_id, a.id::text)
          ELSE '/review-requests/' || a.review_request_id END, a.updated_at,
        CASE WHEN a.due_at < NOW() THEN 100 ELSE ${academicRole === "LECTURER" ? 85 : 65} END, p.id::text, NULL
      FROM reviewer_assignments a JOIN submissions s ON s.id = a.submission_id JOIN projects p ON p.id = s.project_id
      LEFT JOIN review_requests r ON r.id = a.review_request_id
      WHERE a.reviewer_id = ${userId}::uuid AND a.status IN ('assigned', 'accepted', 'in_progress')
        AND p.archived_at IS NULL AND p.status NOT IN ('ARCHIVED', 'COMPLETED')
        AND ${capabilities.includes("STRUCTURED_REVIEW")}
        AND (a.review_request_id IS NULL OR r.status IN ('REQUESTED', 'ACCEPTED', 'IN_REVIEW', 'RESUBMITTED'))
      UNION ALL
      SELECT 'invitation-' || i.id, 'invitation', p.title, i.message, NULL, '/projects#project-invitations-title', i.created_at, 60, p.id::text, NULL
      FROM project_invitations i JOIN projects p ON p.id = i.project_id
      WHERE i.status = 'PENDING' AND i.expires_at > NOW() AND p.archived_at IS NULL AND p.status NOT IN ('ARCHIVED', 'COMPLETED')
        AND i.email IN (SELECT normalized_email FROM user_emails WHERE user_id = ${userId}::uuid AND verified_at IS NOT NULL)
      UNION ALL
      SELECT 'mentor-' || m.id, 'mentorship', p.title, m.message, NULL, '/home#home-attention', m.created_at,
        ${academicRole === "LECTURER" ? 80 : 60}, p.id::text, m.id::text
      FROM mentor_relationships m JOIN projects p ON p.id = m.project_id
      WHERE m.mentor_user_id = ${userId}::uuid AND m.status = 'PENDING' AND ${capabilities.includes("MENTOR_PROJECT")}
        AND p.archived_at IS NULL AND p.status NOT IN ('ARCHIVED', 'COMPLETED')
      UNION ALL
      SELECT 'contribution-' || c.id, 'contribution', p.title, NULL, NULL,
        '/projects/' || COALESCE(p.legacy_mongo_id, p.id::text) || '?tab=contributions', c.created_at, 55, p.id::text, NULL
      FROM project_contribution_proposals c JOIN accessible_projects p ON p.id = c.project_id
      WHERE c.status = 'PENDING_CONFIRMATION' AND c.proposed_by_id <> ${userId}::uuid
        AND ((c.confirmation_required_from = 'OWNER' AND p.owner_id = ${userId}::uuid)
          OR (c.confirmation_required_from = 'CONTRIBUTOR' AND c.contributor_id = ${userId}::uuid))
    ) SELECT * FROM tasks ORDER BY priority DESC, "occurredAt" DESC, id LIMIT 8`),
  ]);
  return {
    continueResearch: projects.map(({ revisionId, ...row }): HomeResearchWorkspace => {
      const stage = revisionId ? "revision" : row.awaitingScreening ? "screening" : row.includedCount > row.papersWithEvidence ? "evidence" : row.candidateGapCount ? "gaps" : "collection";
      return { ...row, updatedAt: row.updatedAt.toISOString(), stage,
        href: revisionId ? `/review-requests/${revisionId}` : `/projects/${row.id}?tab=${stage === "gaps" ? "gaps" : "papers"}${stage === "screening" ? "&screening=UNDECIDED" : stage === "evidence" ? "&screening=INCLUDED" : ""}` };
    }),
    attention: tasks.map((row) => ({ ...row, occurredAt: row.occurredAt.toISOString() })),
  };
}

async function recommendedPapers(userId: string, interests: string[]): Promise<HomeRecommendedPaper[]> {
  const prisma = getPrisma();
  const fields = await prisma.$queryRaw<Array<{ field: string }>>(Prisma.sql`${projectScope(userId)}
    SELECT DISTINCT research_field AS field FROM accessible_projects WHERE research_field IS NOT NULL LIMIT 4`);
  const terms = [...new Set([...interests, ...fields.map((row) => row.field)].map((s) => s.trim()).filter((s) => s.length > 1))].slice(0, 12);
  // Existing scholarly metadata, literal matching, bounded results; no new AI engine.
  const termArray = terms.length ? Prisma.sql`ARRAY[${Prisma.join(terms)}]::text[]` : Prisma.sql`ARRAY[]::text[]`;
  const interestArray = interests.length ? Prisma.sql`ARRAY[${Prisma.join(interests.slice(0, 12))}]::text[]` : Prisma.sql`ARRAY[]::text[]`;
  type PaperRow = { id: string; title: string; year: number; venue: string | null; term: string | null; authors: string[] };
  const rows = await prisma.$queryRaw<PaperRow[]>(Prisma.sql`${projectScope(userId)}, candidates AS (
    SELECT p.id::text, p.title, p.publication_year AS year, p.journal_name AS venue,
      (SELECT term FROM UNNEST(${termArray}) term WHERE POSITION(LOWER(term) IN LOWER(p.title)) > 0
        OR EXISTS (SELECT 1 FROM paper_topics t WHERE t.paper_id = p.id AND POSITION(LOWER(term) IN LOWER(CONCAT_WS(' ', t.topic_name, t.field_name, t.subfield_name))) > 0)
        OR EXISTS (SELECT 1 FROM paper_keywords k WHERE k.paper_id = p.id AND POSITION(LOWER(term) IN LOWER(k.keyword_name)) > 0)
        ORDER BY (term = ANY(${interestArray})) DESC, (POSITION(LOWER(term) IN LOWER(p.title)) > 0) DESC, LENGTH(term) DESC, term LIMIT 1) AS term,
      ARRAY(SELECT a.display_name FROM paper_authors a WHERE a.paper_id = p.id ORDER BY a.position LIMIT 3) AS authors,
      p.citation_count, p.created_at
    FROM papers p WHERE p.data_status = 'active'
      AND NOT EXISTS (SELECT 1 FROM bookmarks b WHERE b.user_id = ${userId}::uuid AND b.paper_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM project_papers pp JOIN accessible_projects ap ON ap.id = pp.project_id WHERE pp.paper_id = p.id)
  ) SELECT id, title, year, venue, term, authors FROM candidates
    ORDER BY (COALESCE(term = ANY(${interestArray}), false)) DESC, (term IS NOT NULL) DESC, year DESC, citation_count DESC, created_at DESC, id LIMIT 3`);
  return rows.map(({ term, venue, ...row }) => ({ ...row, venue: venue ?? undefined,
    reason: term ? interests.some((interest) => interest.toLowerCase() === term.toLowerCase()) ? "interest" : "project" : "recent",
    reasonLabel: term ?? undefined,
  }));
}

async function communityPreview(userId: string, role: AuthClaims["role"], interests: string[]): Promise<HomeCommunityTopic[]> {
  const memberships = await getPrisma().communityMembership.findMany({ where: { userId, status: "active" }, select: { communityId: true } });
  const [following, joined, recent] = await Promise.all([
    forumService.listPosts({ sort: "following" }, 1, 4, userId, role),
    memberships.length ? forumService.listPosts({ communityIds: memberships.map((m) => m.communityId) }, 1, 4, userId, role) : Promise.resolve({ data: [] }),
    forumService.listPosts({ sort: "latest" }, 1, 16, userId, role),
  ]);
  const seen = new Set<string>();
  const items: HomeCommunityTopic[] = [];
  const communityName = (p: (typeof recent.data)[number]) => typeof p.communityId === "object" && p.communityId ? p.communityId.name : undefined;
  const pool = [...following.data.map((p) => ({ p, reason: "following" as const })), ...joined.data.map((p) => ({ p, reason: "joined" as const })),
    ...recent.data.map((p) => ({ p, reason: interests.some((i) => `${p.title} ${communityName(p) ?? ""}`.toLowerCase().includes(i.toLowerCase())) ? "interest" as const : "recent" as const })).sort((a, b) => Number(b.reason === "interest") - Number(a.reason === "interest"))];
  for (const { p, reason } of pool) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    items.push({ id: p.id, title: p.title, href: `/forum/${p.publicSlug || p.id}`, community: communityName(p),
      replyCount: p.replyCount, occurredAt: (p.lastActivityAt || p.createdAt).toISOString(), reason });
    if (items.length === 3) break;
  }
  return items;
}

export async function getResearchHome(claims: AuthClaims): Promise<HomeResearchOverview> {
  const parsed = parseDatabaseId(claims.sub);
  if (!parsed) throw AppError.unauthorized();
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value }, select: { id: true, fullName: true, researchInterests: true } });
  if (!user) throw AppError.unauthorized();
  const profile = await prisma.academicProfile.findUnique({ where: { userId: user.id }, select: { academicRole: true, researchKeywords: true, expertiseAreas: true } });
  const academicRole = ["STUDENT", "RESEARCHER", "LECTURER"].includes(profile?.academicRole ?? "") ? profile!.academicRole as AcademicRole : undefined;
  const interests = [...new Set([...user.researchInterests, ...(profile?.researchKeywords ?? []), ...(profile?.expertiseAreas ?? [])])];
  const [workspace, recommendations, communityActivity] = await Promise.allSettled([
    researchWorkspace(user.id, academicRole), recommendedPapers(user.id, interests), communityPreview(user.id, claims.role, interests),
  ]);
  function section<T>(result: PromiseSettledResult<T>, name: string) {
    if (result.status === "fulfilled") return { status: "ready" as const, data: result.value };
    logger.warn({ err: result.reason, section: name }, "Home section unavailable");
    return { status: "unavailable" as const, data: null };
  }
  return { currentUser: { id: user.id, name: user.fullName, academicRole }, workspace: section(workspace, "workspace"),
    recommendations: section(recommendations, "recommendations"), communityActivity: section(communityActivity, "community") };
}
