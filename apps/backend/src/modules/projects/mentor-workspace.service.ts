import { Prisma } from "../../generated/prisma/client.js";
import type { MentorWorkItem, MentorProjectSummary, MentorWorkspaceData } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { assertVerifiedLecturer } from "./academic-relationship-access.js";
import type { MentorWorkspaceQuery } from "./dto/mentor-workspace.schema.js";

type WorkRow = Omit<MentorWorkItem, "href" | "action" | "dueAt" | "updatedAt" | "overdue" | "accessIssue"> & {
  accessIssue?: MentorWorkItem["accessIssue"] | null;
  dueAt: Date | null; updatedAt: Date; revisionId: string | null; assignmentId: string | null; resourceId: string | null;
};

/** Read projection over existing entities. An invitation or a notification is not a task. */
function workspaceSql(actorId: string) {
  return Prisma.sql`WITH scope AS (
    SELECT DISTINCT ON (p.id) p.id, p.title, p.research_field, p.research_stage, p.status, p.updated_at,
      p.legacy_mongo_id, p.owner_id, a.id AS access_id, a.permissions, r.id AS relationship_id
    FROM mentor_relationships r
    JOIN mentor_access a ON a.relationship_id=r.id AND a.project_id=r.project_id AND a.mentor_user_id=r.mentor_user_id
    JOIN mentorship_requests invitation ON invitation.id=r.source_request_id AND invitation.id=a.request_id AND invitation.status='ACCEPTED'
    JOIN projects p ON p.id=r.project_id
    WHERE r.mentor_user_id=${actorId}::uuid AND r.status='ACTIVE' AND a.revoked_at IS NULL
      AND (a.expires_at IS NULL OR a.expires_at>NOW()) AND p.deleted_at IS NULL
    ORDER BY p.id, a.created_at DESC
  ), reviews AS (
    SELECT request.*, assignment.id AS assignment_id, assignment.reviewer_id,
      revision.revision_number, submission.title AS artifact_title, submission.submission_type
    FROM review_requests request
    JOIN reviewer_assignments assignment ON assignment.review_request_id=request.id AND assignment.reviewer_id=${actorId}::uuid
      AND assignment.artifact_revision_id=request.artifact_revision_id
    JOIN submission_revisions revision ON revision.id=request.artifact_revision_id AND revision.submission_id=request.submission_id
    JOIN submissions submission ON submission.id=request.submission_id AND submission.project_id=request.project_id
    JOIN scope s ON s.id=request.project_id
    WHERE request.origin='MENTOR_GUIDANCE' AND request.status IN ('REQUESTED','ACCEPTED','IN_REVIEW','RESUBMITTED','REVISION_REQUESTED','COMPLETED')
      AND assignment.status NOT IN ('declined','cancelled','expired','revoked')
      AND (request.status<>'REQUESTED' OR request.expires_at IS NULL OR request.expires_at>NOW())
      AND (assignment.mentor_access_id=s.access_id OR (assignment.mentor_access_id IS NULL AND 'SUBMISSIONS_VIEW'=ANY(s.permissions)
        AND EXISTS (SELECT 1 FROM mentor_resource_shares share WHERE share.access_id=s.access_id
          AND share.project_id=s.id AND share.kind='SUBMISSION' AND share.resource_id=request.submission_id AND share.revoked_at IS NULL)))
  ), work AS (
    SELECT 'TASK:'||t.id::text AS id, t.id::text AS "sourceId",
      CASE WHEN legacy.id IS NOT NULL THEN 'MANUSCRIPT_REVIEW' ELSE 'TASK' END AS kind,
      t.title, t.description, s.id::text AS "projectId", s.title AS "projectTitle", sender.full_name AS sender,
      CASE WHEN access.requires_sharing AND t.status<>'DONE' THEN 'BLOCKED' ELSE t.status END AS status,
      t.priority::text AS priority, t.due_at AS "dueAt", t.updated_at AS "updatedAt",
      (t.status IN ('TODO','IN_PROGRESS','BLOCKED') AND s.status NOT IN ('ARCHIVED','COMPLETED')) AS "needsAction",
      (t.status='BLOCKED' OR access.requires_sharing AND t.status<>'DONE') AS blocked,
      legacy.revision_number AS version, NULL::text AS "revisionId", legacy.id::text AS "assignmentId",
      CASE WHEN resource.can_open THEN t.target_id::text ELSE NULL END AS "resourceId",
      CASE WHEN access.requires_sharing THEN 'MANUSCRIPT_NOT_SHARED' ELSE NULL::text END AS "accessIssue",
      ('MENTOR_CHAT'=ANY(s.permissions)) AS "canContactTeam"
    FROM project_tasks t JOIN scope s ON s.id=t.project_id JOIN users sender ON sender.id=t.created_by_id
    LEFT JOIN LATERAL (SELECT assignment.id,revision.revision_number FROM reviewer_assignments assignment
      JOIN submissions submission ON submission.id=assignment.submission_id AND submission.project_id=s.id
      JOIN submission_revisions revision ON revision.id=assignment.artifact_revision_id AND revision.submission_id=submission.id
      WHERE assignment.submission_id=t.target_id AND lower(t.target_kind)='submission' AND t.title LIKE 'Cần góp ý bản thảo%'
        AND assignment.reviewer_id=${actorId}::uuid AND assignment.assigned_by_id=t.created_by_id
        AND assignment.review_request_id IS NULL AND assignment.anonymous_code LIKE 'mentor-%'
        AND assignment.status IN ('assigned','accepted') AND sender.is_active AND sender.account_status='ACTIVE' AND sender.email_verified_at IS NOT NULL
        AND (sender.id=s.owner_id OR (EXISTS (SELECT 1 FROM project_members member WHERE member.project_id=s.id AND member.user_id=sender.id AND member.status='ACTIVE')
          AND EXISTS (SELECT 1 FROM submission_authors author WHERE author.submission_id=submission.id AND author.user_id=sender.id)))
      ORDER BY assignment.created_at DESC LIMIT 1) legacy ON true
    CROSS JOIN LATERAL (SELECT legacy.id IS NOT NULL OR COALESCE(lower(t.target_kind)='submission' AND 'SUBMISSIONS_VIEW'=ANY(s.permissions) AND EXISTS (
      SELECT 1 FROM mentor_resource_shares share WHERE share.access_id=s.access_id AND share.project_id=s.id
        AND share.kind='SUBMISSION' AND share.resource_id=t.target_id AND share.revoked_at IS NULL),false) AS can_open) resource
    CROSS JOIN LATERAL (SELECT COALESCE(lower(t.target_kind)='submission' AND t.title LIKE 'Cần góp ý bản thảo%' AND NOT resource.can_open,false) AS requires_sharing) access
    WHERE t.assignee_id=${actorId}::uuid AND t.deleted_at IS NULL AND t.status IN ('TODO','IN_PROGRESS','BLOCKED','DONE')
      AND NOT (t.title LIKE 'Cần góp ý bản thảo%' AND EXISTS (
        SELECT 1 FROM reviews r WHERE lower(t.target_kind)='submission' AND t.target_id=r.submission_id))
    UNION ALL
    SELECT 'REVIEW:'||r.id::text, r.id::text,
      CASE WHEN r.submission_type='RESEARCH_PROPOSAL' THEN 'PROPOSAL_REVIEW' ELSE 'MANUSCRIPT_REVIEW' END,
      r.artifact_title, COALESCE(r.message,''), s.id::text, s.title, sender.full_name,
      CASE WHEN r.status='COMPLETED' THEN 'DONE' WHEN r.status='REVISION_REQUESTED' THEN 'WAITING'
        WHEN r.status='IN_REVIEW' THEN 'IN_PROGRESS' ELSE 'TODO' END,
      'HIGH', r.due_at, r.updated_at,
      (r.status IN ('REQUESTED','ACCEPTED','IN_REVIEW','RESUBMITTED') AND s.status NOT IN ('ARCHIVED','COMPLETED')),
      false, r.revision_number, r.artifact_revision_id::text, r.assignment_id::text, NULL::text, NULL::text, false
    FROM reviews r JOIN scope s ON s.id=r.project_id JOIN users sender ON sender.id=r.requester_id
    UNION ALL
    SELECT 'QUESTION:'||d.id::text, d.id::text, 'MENTOR_QUESTION', d.title, d.body,
      s.id::text, s.title, sender.full_name,
      CASE WHEN d.status='RESOLVED' THEN 'DONE' WHEN reply.sender_id=${actorId}::uuid THEN 'WAITING' ELSE 'TODO' END,
      'MEDIUM', NULL::timestamptz, d.updated_at,
      (d.status='OPEN' AND COALESCE(reply.sender_id,d.author_id)<>${actorId}::uuid AND s.status NOT IN ('ARCHIVED','COMPLETED')),
      false, revision.version, d.target_id::text, NULL::text, NULL::text, NULL::text, false
    FROM project_discussions d JOIN scope s ON s.id=d.project_id AND s.relationship_id=d.mentor_relationship_id
    JOIN users sender ON sender.id=d.author_id
    JOIN plan_revisions revision ON revision.id=d.target_id AND revision.project_id=s.id
    LEFT JOIN LATERAL (SELECT m.sender_id FROM project_team_messages m
      WHERE m.project_id=d.project_id AND m.thread_id=d.id AND NOT m.is_deleted
      ORDER BY m.created_at DESC,m.id DESC LIMIT 1) reply ON true
    WHERE d.category='MENTOR_QUESTION' AND d.target_kind='PLAN_REVISION'
      AND EXISTS (SELECT 1 FROM plan_shares share WHERE share.project_id=s.id AND share.relationship_id=s.relationship_id
        AND share.revision_id=d.target_id AND share.revoked_at IS NULL)
  )`;
}

export function mentorWorkHref(row: Pick<WorkRow, "kind" | "sourceId" | "projectId" | "status" | "assignmentId"> & { resourceId?: string | null; accessIssue?: MentorWorkItem["accessIssue"] | null; canContactTeam?: boolean }) {
  if (row.accessIssue && row.canContactTeam) return `/projects/${row.projectId}?tab=chat&channel=mentors`;
  if (row.kind === "MANUSCRIPT_REVIEW" && row.resourceId) return `/reviews/mentor-entry/${row.resourceId}`;
  if (row.kind === "MENTOR_QUESTION") return `/projects/${row.projectId}?tab=tasks&discussion=${row.sourceId}`;
  if (row.kind !== "TASK") return row.assignmentId && row.status === "IN_PROGRESS"
    ? `/reviews/${row.assignmentId}` : `/review-requests/${row.sourceId}`;
  return row.resourceId ? `/submissions/${row.resourceId}` : `/projects/${row.projectId}?tab=tasks&workItem=TASK:${row.sourceId}`;
}

export const mentorWorkspaceService = {
  async read(actorInput: string, query: MentorWorkspaceQuery): Promise<MentorWorkspaceData> {
    const id = parseDatabaseId(actorInput);
    if (!id) throw AppError.unauthorized();
    return getPrisma().$transaction(async tx => {
      const actor = await tx.user.findUnique({ where: id.kind === "uuid" ? { id: id.value } : { legacyMongoId: id.value }, select: { id: true } });
      if (!actor) throw AppError.unauthorized();
      await assertVerifiedLecturer(tx, actor.id);
      const base = workspaceSql(actor.id);
      const projectOptions = await tx.$queryRaw<{ id: string; title: string; legacyId: string | null }[]>`${base}
        SELECT id::text AS id,title,legacy_mongo_id AS "legacyId" FROM scope ORDER BY lower(title),id`;
      const selectedProject = query.projectId ? projectOptions.find(p => p.id === query.projectId || p.legacyId === query.projectId) : undefined;
      if (query.projectId && !selectedProject) throw AppError.notFound("This mentorship is unavailable or access has ended");
      const projectFilter = selectedProject ? Prisma.sql`AND "projectId"=${selectedProject.id}` : Prisma.empty;
      const filters = [Prisma.sql`true`];
      if (selectedProject) filters.push(Prisma.sql`"projectId"=${selectedProject.id}`);
      if (query.q) filters.push(Prisma.sql`(title ILIKE ${`%${query.q.replace(/[\\%_]/g, "\\$&")}%`} OR "projectTitle" ILIKE ${`%${query.q.replace(/[\\%_]/g, "\\$&")}%`} OR sender ILIKE ${`%${query.q.replace(/[\\%_]/g, "\\$&")}%`})`);
      if (query.kind === "REVIEW") filters.push(Prisma.sql`kind IN ('MANUSCRIPT_REVIEW','PROPOSAL_REVIEW')`);
      else if (query.kind) filters.push(Prisma.sql`kind=${query.kind}`);
      if (query.status === "ACTIONABLE") filters.push(Prisma.sql`"needsAction"`);
      else if (query.status !== "ALL") filters.push(Prisma.sql`status=${query.status}`);
      if (query.item) filters.push(Prisma.sql`id=${query.item}`);
      const where = Prisma.join(filters, " AND ");
      const rank = Prisma.sql`CASE WHEN "needsAction" AND "dueAt"<NOW() THEN 0 WHEN "needsAction" AND blocked THEN 1
        WHEN "needsAction" AND "dueAt"<=NOW()+INTERVAL '48 hours' THEN 2
        WHEN "needsAction" AND kind IN ('MANUSCRIPT_REVIEW','PROPOSAL_REVIEW') THEN 3 ELSE 4 END`;
      const priority = Prisma.sql`CASE priority WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END`;
      const order = query.sort === "deadline" ? Prisma.sql`"dueAt" ASC NULLS LAST, ${rank}, ${priority}` : Prisma.sql`${rank}, ${priority}, "dueAt" ASC NULLS LAST`;
      const rows = await tx.$queryRaw<WorkRow[]>`${base} SELECT * FROM work WHERE ${where}
        ORDER BY ${order}, "updatedAt" DESC,id LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`;
      const totals = await tx.$queryRaw<{ count: bigint }[]>`${base} SELECT COUNT(*) AS count FROM work WHERE ${where}`;
      const metrics = await tx.$queryRaw<{ needsResponse: bigint; overdue: bigint; blocked: bigint; manuscripts: bigint }[]>`${base}
        SELECT COUNT(*) FILTER (WHERE "needsAction") AS "needsResponse",
          COUNT(*) FILTER (WHERE "needsAction" AND "dueAt"<NOW()) AS overdue,
          COUNT(*) FILTER (WHERE "needsAction" AND blocked) AS blocked,
          COUNT(*) FILTER (WHERE "needsAction" AND kind IN ('MANUSCRIPT_REVIEW','PROPOSAL_REVIEW')) AS manuscripts
        FROM work WHERE true ${projectFilter}`;
      const invitationCounts = await tx.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) AS count FROM mentorship_requests invitation
        JOIN projects p ON p.id=invitation.project_id AND p.deleted_at IS NULL
        WHERE invitation.mentor_user_id=${actor.id}::uuid AND invitation.direction='PROJECT_TO_LECTURER' AND invitation.status='PENDING'
          AND (invitation.expires_at IS NULL OR invitation.expires_at>NOW())`;
      const projectWhere = query.projectSearch ? Prisma.sql`AND (s.title ILIKE ${`%${query.projectSearch.replace(/[\\%_]/g, "\\$&")}%`} OR s.research_field ILIKE ${`%${query.projectSearch.replace(/[\\%_]/g, "\\$&")}%`})` : Prisma.empty;
      const projects = await tx.$queryRaw<(Omit<MentorProjectSummary, "updatedAt" | "pendingCount" | "teamSize"> & { updatedAt: Date; pendingCount: bigint; teamSize: bigint })[]>`${base}
        SELECT s.id::text AS id,s.title,s.research_field AS "researchField",s.research_stage AS "researchStage",s.status,owner.full_name AS "teamLead",s.updated_at AS "updatedAt",
          (SELECT COUNT(*) FROM users member WHERE member.is_active AND member.account_status='ACTIVE' AND
            (member.id=s.owner_id OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id=s.id AND pm.user_id=member.id AND pm.status='ACTIVE'))) AS "teamSize",
          (SELECT COUNT(*) FROM work w WHERE w."projectId"=s.id::text AND w."needsAction") AS "pendingCount"
        FROM scope s JOIN users owner ON owner.id=s.owner_id WHERE true ${projectWhere}
        ORDER BY s.updated_at DESC,s.id LIMIT 20 OFFSET ${(query.projectPage - 1) * 20}`;
      const projectTotals = await tx.$queryRaw<{ count: bigint }[]>`${base} SELECT COUNT(*) AS count FROM scope s WHERE true ${projectWhere}`;
      const activeProjects = await tx.$queryRaw<{ count: bigint }[]>`${base} SELECT COUNT(*) AS count FROM scope WHERE status NOT IN ('ARCHIVED','COMPLETED')`;
      const total = Number(totals[0]?.count ?? 0), projectTotal = Number(projectTotals[0]?.count ?? 0);
      const now = new Date();
      return {
        items: rows.map(row => ({ id: row.id, sourceId: row.sourceId, kind: row.kind, title: row.title, description: row.description,
          projectId: row.projectId, projectTitle: row.projectTitle, sender: row.sender, status: row.status, priority: row.priority,
          dueAt: row.dueAt?.toISOString() ?? null, updatedAt: row.updatedAt.toISOString(), needsAction: row.needsAction,
          overdue: row.needsAction && Boolean(row.dueAt && row.dueAt < now), blocked: row.blocked, version: row.version,
          ...(row.accessIssue ? { accessIssue: row.accessIssue, canContactTeam: row.canContactTeam } : {}),
          href: mentorWorkHref(row), action: row.accessIssue && row.canContactTeam ? "RESPOND" : !row.needsAction || row.kind === "TASK" ? "VIEW" : row.kind === "MENTOR_QUESTION" ? "RESPOND" : "REVIEW" })),
        meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) },
        projects: projects.map(p => ({ ...p, teamSize: Number(p.teamSize), pendingCount: Number(p.pendingCount), updatedAt: p.updatedAt.toISOString() })),
        projectMeta: { page: query.projectPage, pageSize: 20, total: projectTotal, totalPages: Math.ceil(projectTotal / 20) },
        projectOptions: projectOptions.map(p => ({ id: p.id, title: p.title })),
        summary: { projects: Number(activeProjects[0]?.count ?? 0), needsResponse: Number(metrics[0]?.needsResponse ?? 0),
          overdue: Number(metrics[0]?.overdue ?? 0), blocked: Number(metrics[0]?.blocked ?? 0), manuscripts: Number(metrics[0]?.manuscripts ?? 0), invitations: Number(invitationCounts[0]?.count ?? 0) },
        generatedAt: now.toISOString(),
      };
    }, { isolationLevel: "RepeatableRead", timeout: 20000 });
  },
};
