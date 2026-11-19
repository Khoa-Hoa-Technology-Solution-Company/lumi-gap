import { Prisma } from "../../generated/prisma/client.js";
import type { CreditRole, ResearchContributionRecord, ResearchContributionResult, ContributionStatement } from "@trend/shared-types";
import type { z } from "zod";
import { creditRoles } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { withWorkspace, type WorkspaceContext } from "./workspace-access.js";
import { effectiveMentorAccess } from "./mentor-access.service.js";
import type { researchContributionsQuerySchema } from "./dto/project-contributions.schema.js";
import { activityCategory, meaningfulActivity, suggestedCreditRoles } from "./research-contribution.rules.js";
import { visibleMentorReviewAssignments } from "../reviews/mentor-review-access.js";

type Query = z.infer<typeof researchContributionsQuerySchema>;
type ResearchContext = WorkspaceContext & { readableAssignmentIds?: string[] };
export type ResearchProjectionRow = {
  id: string; actorId: string; name: string; participantKind: "MEMBER" | "MENTOR";
  type: string; sourceType: string; sourceId: string; description: string; createdAt: Date;
  scopeKeys: string[]; versionId: string | null; version: number | null;
  linkKind: string | null;
  linkId: string | null; provenance: ResearchContributionRecord["provenance"]; status: string; roles: string[]; evidence: string;
};

/** One projection over existing immutable source records; no parallel contribution ledger. */
export function researchContributionSql(c: ResearchContext) {
  const mentorOnly = !c.role;
  return Prisma.sql`WITH scopes AS (
    SELECT 'DRAFT:'||d.id AS key,d.name AS title,'DRAFT'::text AS kind,d.id AS resource_id
    FROM draft_workspaces d WHERE d.project_id=${c.project.id}::uuid AND d.deleted_at IS NULL AND ${!mentorOnly}
    UNION ALL
    SELECT 'SUBMISSION:'||s.id,s.title,'SUBMISSION',s.id FROM submissions s WHERE s.project_id=${c.project.id}::uuid
      AND (${!mentorOnly} OR EXISTS (
        SELECT 1 FROM reviewer_assignments assigned WHERE assigned.submission_id=s.id AND assigned.id=ANY(${c.readableAssignmentIds ?? []}::uuid[])
      ) OR EXISTS (
        SELECT 1 FROM mentor_access a JOIN mentor_resource_shares share ON share.access_id=a.id
        JOIN mentor_relationships rel ON rel.id=a.relationship_id AND rel.status='ACTIVE'
        WHERE a.project_id=s.project_id AND a.mentor_user_id=${c.actorId}::uuid AND a.revoked_at IS NULL
          AND (a.expires_at IS NULL OR a.expires_at>NOW()) AND 'SUBMISSIONS_VIEW'=ANY(a.permissions)
          AND share.project_id=s.project_id AND share.kind='SUBMISSION' AND share.resource_id=s.id AND share.revoked_at IS NULL
      )) AND (${mentorOnly} OR NOT EXISTS (
        SELECT 1 FROM submission_revisions rev JOIN manuscript_snapshots snap ON snap.id=rev.manuscript_snapshot_id
        JOIN draft_workspaces d ON d.id=snap.workspace_id AND d.project_id=s.project_id AND d.deleted_at IS NULL
        WHERE rev.submission_id=s.id
      ))
  ), raw_records AS (
    SELECT 'ACTIVITY:'||a.id AS id,a.actor_id AS actor_id,a.type,a.entity_kind::text AS source_type,a.entity_id::text AS source_id,
      ''::text AS description,a.created_at,
      ARRAY(SELECT scope.key FROM scopes scope WHERE
        (scope.kind='DRAFT' AND (a.entity_id=scope.resource_id::text AND a.entity_kind='MANUSCRIPT'
          OR EXISTS (SELECT 1 FROM manuscript_snapshots snap WHERE snap.workspace_id=scope.resource_id AND snap.project_id=a.project_id
            AND (snap.id::text=a.entity_id OR snap.id::text=a.metadata->>'snapshotId'))))
        OR EXISTS (SELECT 1 FROM project_workspace_revisions task_revision
          WHERE a.entity_kind='TASK' AND task_revision.project_id=a.project_id AND task_revision.entity_kind='TASK'
            AND task_revision.entity_id::text=a.entity_id AND task_revision.version=a.artifact_version
            AND (task_revision.snapshot->>'targetKind'='MANUSCRIPT' AND scope.kind='DRAFT' AND task_revision.snapshot->>'targetId'=scope.resource_id::text
              OR task_revision.snapshot->>'targetKind'='SUBMISSION' AND scope.kind='SUBMISSION' AND task_revision.snapshot->>'targetId'=scope.resource_id::text))) AS scope_keys,
      COALESCE(a.metadata->>'snapshotId',a.metadata->>'revisionId') AS version_id,a.artifact_version AS version,
      CASE WHEN a.entity_kind='EXTRACTION' THEN 'EVIDENCE' WHEN a.entity_kind='DECISION' THEN 'RESEARCH_DECISION' ELSE a.entity_kind END::text AS link_kind,a.entity_id::text AS link_id,
      'SYSTEM_RECORDED'::text AS provenance,'RECORDED'::text AS status,ARRAY[]::text[] AS roles,''::text AS evidence
    FROM project_activities a WHERE a.project_id=${c.project.id}::uuid AND a.actor_id IS NOT NULL AND ${!mentorOnly}
      AND a.type=ANY(${Object.values(meaningfulActivity).flat().filter(type => !["MENTOR_REVIEW_SUBMITTED", "MENTOR_FEEDBACK_RECORDED"].includes(type))}::text[])
      AND NOT (a.type='PAPER_IMPORTED' AND COALESCE(a.metadata->>'duplicate','false')='true')
      AND NOT (a.entity_kind='TASK' AND EXISTS (
        SELECT 1 FROM project_tasks t WHERE t.id::text=a.entity_id AND t.project_id=a.project_id
          AND lower(t.target_kind)='submission' AND t.title LIKE 'Cần góp ý bản thảo%'
      ))
    UNION ALL
    SELECT 'SYNTHESIS:'||revision.id,revision.actor_id,
      CASE WHEN revision.snapshot->>'status'='ACCEPTED' THEN 'SYNTHESIS_REVIEWED' ELSE 'SYNTHESIS_WRITTEN' END,'SYNTHESIS',revision.id::text,
      COALESCE(NULLIF(revision.snapshot->>'rationale',''),revision.snapshot->>'commonFindings',''),revision.created_at,ARRAY[]::text[],NULL::text,revision.version,
      'SYNTHESIS',revision.id::text,'SYSTEM_RECORDED',revision.snapshot->>'status',ARRAY[]::text[],''
    FROM project_workspace_revisions revision WHERE revision.project_id=${c.project.id}::uuid AND revision.entity_kind='SYNTHESIS' AND ${!mentorOnly}
      AND (revision.snapshot->>'status'='ACCEPTED' OR revision.snapshot->>'status'='DRAFT' AND revision.snapshot->>'origin'='HUMAN')
      AND length(trim(COALESCE(revision.snapshot->>'commonFindings','')||COALESCE(revision.snapshot->>'contradictions','')||COALESCE(revision.snapshot->>'openQuestions','')))>=20
    UNION ALL
    SELECT 'REVIEW:'||review.id,review.reviewer_id,'MENTOR_REVIEW_SUBMITTED','HUMAN_REVIEW',review.id::text,
      COALESCE(review.overall_comment,review.key_concerns,'')::text,COALESCE(review.submitted_at,review.created_at),
      ARRAY(SELECT scope.key FROM scopes scope WHERE
        scope.kind='SUBMISSION' AND scope.resource_id=s.id OR scope.kind='DRAFT' AND scope.resource_id=snap.workspace_id),
      rev.id::text,rev.revision_number,'HUMAN_REVIEW',review.id::text,'SYSTEM_RECORDED','RECORDED',ARRAY[]::text[],''
    FROM human_reviews review JOIN submissions s ON s.id=review.submission_id
      JOIN submission_revisions rev ON rev.id=review.revision_id AND rev.submission_id=s.id
      JOIN reviewer_assignments assignment ON assignment.id=review.assignment_id
      JOIN review_requests request ON request.id=assignment.review_request_id AND request.origin='MENTOR_GUIDANCE'
      LEFT JOIN manuscript_snapshots snap ON snap.id=rev.manuscript_snapshot_id AND snap.project_id=s.project_id
    WHERE s.project_id=${c.project.id}::uuid AND review.status='SUBMITTED'
      AND (length(trim(COALESCE(review.overall_comment,'')))>=5 OR EXISTS (SELECT 1 FROM review_responses response WHERE response.review_id=review.id AND (length(trim(response.comment))>=5 OR response.assessment IS NOT NULL)))
      AND (${!mentorOnly} OR review.reviewer_id=${c.actorId}::uuid AND assignment.id=ANY(${c.readableAssignmentIds ?? []}::uuid[]) AND EXISTS (SELECT 1 FROM scopes scope WHERE scope.key='SUBMISSION:'||s.id))
    UNION ALL
    SELECT 'FEEDBACK:'||f.id,f.author_id,'MENTOR_FEEDBACK_RECORDED','MENTOR_FEEDBACK',f.id::text,
      f.body,f.created_at,ARRAY(SELECT scope.key FROM scopes scope JOIN mentor_resource_shares share ON share.id=f.share_id
        WHERE share.project_id=f.project_id AND (share.kind='MANUSCRIPT' AND scope.kind='DRAFT' OR share.kind='SUBMISSION' AND scope.kind='SUBMISSION') AND share.resource_id=scope.resource_id),
      NULL::text,f.version,NULL::text,NULL::text,'SYSTEM_RECORDED',f.status,f.credit_roles,''
    FROM mentor_feedback f WHERE f.project_id=${c.project.id}::uuid AND f.kind IN ('COMMENT','SUGGESTION','REVIEW') AND length(trim(f.body))>=20
      AND (${!mentorOnly} OR f.author_id=${c.actorId}::uuid)
    UNION ALL
    SELECT 'DECLARED:'||p.id||':'||participant.user_id,participant.user_id,'CONTRIBUTION_DECLARED','CONTRIBUTION',p.id::text,
      p.description,p.work_date,ARRAY(SELECT scope.key FROM scopes scope WHERE EXISTS (
        SELECT 1 FROM jsonb_array_elements(p.evidence_refs) ref WHERE ref->>'id'=scope.resource_id::text AND
          (ref->>'kind'='MANUSCRIPT' AND scope.kind='DRAFT' OR ref->>'kind'='SUBMISSION' AND scope.kind='SUBMISSION')
        OR EXISTS (SELECT 1 FROM manuscript_snapshots snap WHERE ref->>'kind'='MANUSCRIPT_SNAPSHOT' AND snap.id::text=ref->>'id'
          AND snap.workspace_id=scope.resource_id AND snap.project_id=p.project_id AND scope.kind='DRAFT')
        OR EXISTS (SELECT 1 FROM submission_revisions revision JOIN submissions submission ON submission.id=revision.submission_id AND submission.project_id=p.project_id
          LEFT JOIN manuscript_snapshots snap ON snap.id=revision.manuscript_snapshot_id AND snap.project_id=p.project_id
          WHERE (ref->>'kind'='SUBMISSION_REVISION' AND ref->>'id'=revision.id::text
            OR ref->>'kind'='SUBMISSION' AND ref->>'id'=submission.id::text
            OR ref->>'kind'='HUMAN_REVIEW' AND EXISTS (SELECT 1 FROM human_reviews review WHERE review.revision_id=revision.id AND review.id::text=ref->>'id'))
            AND (scope.kind='DRAFT' AND scope.resource_id=snap.workspace_id OR scope.kind='SUBMISSION' AND scope.resource_id=submission.id))
      )),NULL::text,p.version,'CONTRIBUTION',p.id::text,
      CASE WHEN p.source='LEGACY' THEN 'IMPORTED' ELSE 'USER_DECLARED' END,p.status,participant.roles,COALESCE(p.evidence,'')
    FROM project_contribution_proposals p JOIN contribution_participants participant ON participant.proposal_id=p.id
    WHERE p.project_id=${c.project.id}::uuid AND (p.status<>'DRAFT' OR p.proposed_by_id=${c.actorId}::uuid)
      AND (${!mentorOnly} OR participant.user_id=${c.actorId}::uuid AND p.proposed_by_id=${c.actorId}::uuid)
  ), records AS (
    SELECT r.*,u.full_name AS name,CASE WHEN EXISTS(SELECT 1 FROM mentor_relationships relation WHERE relation.project_id=${c.project.id}::uuid
      AND relation.mentor_user_id=r.actor_id AND r.created_at>=relation.started_at AND (relation.ended_at IS NULL OR r.created_at<=relation.ended_at)) THEN 'MENTOR' ELSE 'MEMBER' END AS participant_kind
    FROM raw_records r JOIN users u ON u.id=r.actor_id
  )`;
}

export function presentResearchRecord(row: ResearchProjectionRow, projectId: string): ResearchContributionRecord {
  const allowed = ["TASK", "PAPER", "GAP", "EVIDENCE", "MANUSCRIPT", "MANUSCRIPT_SNAPSHOT", "PLAN_REVISION", "SUBMISSION", "SUBMISSION_REVISION", "HUMAN_REVIEW", "SYNTHESIS", "RESEARCH_DECISION"];
  const link = row.linkKind && row.linkId && /^[0-9a-f-]{36}$/i.test(row.linkId) && allowed.includes(row.linkKind)
    ? { kind: row.linkKind, id: row.linkId } as ResearchContributionRecord["link"] : null;
  return { id: row.id, projectId, actor: { id: row.actorId, name: row.name }, participantKind: row.participantKind,
    type: row.type, category: activityCategory(row.type), description: row.description, createdAt: row.createdAt.toISOString(),
    provenance: row.provenance, sourceType: row.sourceType ?? "PROJECT_ACTIVITY", sourceId: row.sourceId ?? row.id,
    manuscriptKeys: row.scopeKeys, manuscriptVersionId: row.versionId, artifactVersion: row.version, link,
    suggestedRoles: row.type === "CONTRIBUTION_DECLARED" ? [] : suggestedCreditRoles(row.type), declaredRoles: row.roles.filter(role => (creditRoles as readonly string[]).includes(role)) as CreditRole[], status: row.status, evidence: row.evidence };
}
export const researchRecordSelect = Prisma.sql`id,actor_id AS "actorId",name,participant_kind AS "participantKind",type,source_type AS "sourceType",source_id AS "sourceId",description,created_at AS "createdAt",scope_keys AS "scopeKeys",version_id AS "versionId",version,link_kind AS "linkKind",link_id AS "linkId",provenance,status,roles,evidence`;

export async function researchContributionArtifact(projectId: string, actorId: string, kind: string, id: string) {
  return withResearchContributions(projectId, actorId, async c => {
    const base = researchContributionSql(c);
    if (kind === "SYNTHESIS" || kind === "RESEARCH_DECISION") {
      if (!c.role || !(await c.tx.$queryRaw<{id:string}[]>`${base} SELECT id FROM records WHERE link_kind=${kind} AND link_id=${id}`).length) throw AppError.notFound("Research evidence unavailable");
      if (kind === "SYNTHESIS") return { href: `/projects/${c.project.id}?tab=gaps&research=synthesis` };
      const decision=await c.tx.projectDecision.findFirstOrThrow({where:{id,projectId:c.project.id}});
      const revisions=await c.tx.projectWorkspaceRevision.findMany({where:{projectId:c.project.id,entityKind:"DECISION",entityId:id},orderBy:{version:"asc"},select:{version:true,snapshot:true}});
      return {title:decision.decision,content:revisions.map(revision=>{
        const value=revision.snapshot as {decision?:string;context?:string;alternatives?:string;rationale?:string};
        return [`v${revision.version}`,value.decision,value.context,value.alternatives,value.rationale].filter(Boolean).join("\n");
      }).join("\n\n") || [decision.context,decision.alternatives,decision.rationale].filter(Boolean).join("\n")};
    }
    if (kind === "HUMAN_REVIEW") {
      if (!(await c.tx.$queryRaw<{ id: string }[]>`${base} SELECT id FROM records WHERE source_type='HUMAN_REVIEW' AND source_id=${id}`).length) throw AppError.notFound("Review evidence unavailable");
      const review = await c.tx.humanReview.findUniqueOrThrow({ where: { id } });
      const assignment = await c.tx.reviewerAssignment.findUniqueOrThrow({ where: { id: review.assignmentId } });
      return { href: c.role && assignment.reviewRequestId ? `/review-requests/${assignment.reviewRequestId}` : `/reviews/${assignment.id}` };
    }
    let submissionId = id;
    if (kind === "SUBMISSION_REVISION") {
      const rev = await c.tx.submissionRevision.findUnique({ where: { id } });
      if (!rev) throw AppError.notFound("Revision evidence unavailable");
      submissionId = rev.submissionId;
    }
    if (!(await c.tx.$queryRaw<{ id: string }[]>`${base} SELECT key AS id FROM scopes WHERE key=${`SUBMISSION:${submissionId}`}`).length) {
      if (!c.role || !await c.tx.submission.count({ where: { id: submissionId, projectId: c.project.id } })) throw AppError.notFound("Submission evidence unavailable");
    }
    return { href: `/submissions/${submissionId}` };
  });
}

export async function withResearchContributions<T>(projectId: string, actorId: string, run: (c: ResearchContext) => Promise<T>, write = false) {
  return withWorkspace(projectId, actorId, { write, mentor: true, mentorScope: "SHARED_RESOURCES" }, async c => {
    if (!c.role) {
      const policies = await c.tx.mentorAccess.findMany({ where: { projectId: c.project.id, mentorUserId: c.actorId, permissions: { has: "CONTRIBUTIONS_VIEW" } } });
      if (!(await Promise.all(policies.map(policy => effectiveMentorAccess(c.tx, policy)))).some(Boolean)) throw AppError.notFound("Contribution access is unavailable");
    }
    let readableAssignmentIds: string[] = [];
    if (!c.role) {
      const submissions = await c.tx.submission.findMany({ where: { projectId: c.project.id }, select: { id: true } });
      const assignments = await c.tx.reviewerAssignment.findMany({ where: { reviewerId: c.actorId, submissionId: { in: submissions.map(s=>s.id) }, status: { in: ["accepted","completed"] } } });
      readableAssignmentIds = (await visibleMentorReviewAssignments(c.tx,assignments)).map(a=>a.id);
    }
    return run({ ...c,readableAssignmentIds });
  });
}

export async function researchContributions(projectId: string, actorId: string, query: Query): Promise<ResearchContributionResult> {
  return withResearchContributions(projectId, actorId, async c => {
    const base = researchContributionSql(c);
    const scopes = await c.tx.$queryRaw<ResearchContributionResult["manuscripts"]>`${base} SELECT key,title,kind FROM scopes ORDER BY lower(title),key`;
    if (query.scopeKey && !scopes.some(scope => scope.key === query.scopeKey)) throw AppError.notFound("Manuscript contribution scope unavailable");
    const conditions = [Prisma.sql`true`];
    if (query.memberId) conditions.push(Prisma.sql`actor_id=${query.memberId}::uuid`);
    if (query.participantKind) conditions.push(Prisma.sql`participant_kind=${query.participantKind}`);
    if (query.scopeKey) conditions.push(Prisma.sql`${query.scopeKey}=ANY(scope_keys)`);
    if (query.category) conditions.push(Prisma.sql`type=ANY(${meaningfulActivity[query.category]}::text[])`);
    const where = Prisma.join(conditions, " AND ");
    const scopeWhere = query.scopeKey ? Prisma.sql`${query.scopeKey}=ANY(scope_keys)` : Prisma.sql`true`;
    const [rows, total, profiles] = await Promise.all([
      c.tx.$queryRaw<ResearchProjectionRow[]>`${base} SELECT ${researchRecordSelect} FROM records WHERE ${where} ORDER BY created_at DESC,id LIMIT ${query.pageSize} OFFSET ${(query.page-1)*query.pageSize}`,
      c.tx.$queryRaw<{ count: bigint }[]>`${base} SELECT count(*) AS count FROM records WHERE ${where}`,
      c.tx.$queryRaw<{ id: string; name: string; participantKind: "MENTOR" | "MEMBER"; recordCount: bigint; types: string[] }[]>`${base} SELECT actor_id AS id,name,participant_kind AS "participantKind",count(*) AS "recordCount",array_agg(DISTINCT type) AS types FROM records WHERE ${scopeWhere} GROUP BY actor_id,name,participant_kind ORDER BY lower(name),actor_id`,
    ]);
    if (!query.scopeKey) {
      const roster = await c.tx.$queryRaw<{ id: string; name: string; participantKind: "MEMBER" | "MENTOR" }[]>`
        SELECT u.id,u.full_name AS name,'MEMBER'::text AS "participantKind" FROM users u WHERE ${Boolean(c.role)} AND
          (u.id=${c.project.ownerId}::uuid OR EXISTS(SELECT 1 FROM project_members m WHERE m.project_id=${c.project.id}::uuid AND m.user_id=u.id AND m.status='ACTIVE'))
        UNION SELECT u.id,u.full_name,'MENTOR' FROM users u JOIN mentor_relationships r ON r.mentor_user_id=u.id
          WHERE r.project_id=${c.project.id}::uuid AND r.status='ACTIVE' AND (${Boolean(c.role)} OR u.id=${c.actorId}::uuid)`;
      for (const person of roster) if (!profiles.some(profile => profile.id===person.id && profile.participantKind===person.participantKind)) profiles.push({ ...person,recordCount:0n,types:[] });
      profiles.sort((a,b)=>a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    }
    return { items: rows.map(row => presentResearchRecord(row, c.project.id)), page: query.page, pageSize: query.pageSize, total: Number(total[0]?.count ?? 0), hasNext: query.page*query.pageSize<Number(total[0]?.count ?? 0),
      profiles: profiles.map(profile => ({ id: profile.id, name: profile.name, participantKind: profile.participantKind, recordCount: Number(profile.recordCount), suggestedRoles: [...new Set(profile.types.flatMap(suggestedCreditRoles))] })),
      manuscripts: scopes, currentActorId: c.actorId, mentorScoped: !c.role };
  });
}

/** Export only agreed, explicitly manuscript-linked CRediT declarations. Never an author list. */
export async function manuscriptContributionStatement(projectId: string, actorId: string, scopeKey: string): Promise<ContributionStatement> {
  return withResearchContributions(projectId, actorId, async c => {
    if (!c.role) throw AppError.notFound("Only the research team can export the shared statement");
    const base = researchContributionSql(c);
    if (!(await c.tx.$queryRaw<{ key: string }[]>`${base} SELECT key FROM scopes WHERE key=${scopeKey}`).length) throw AppError.notFound("Manuscript scope unavailable");
    const rows = await c.tx.$queryRaw<ResearchProjectionRow[]>`${base} SELECT ${researchRecordSelect} FROM records WHERE source_type='CONTRIBUTION' AND ${scopeKey}=ANY(scope_keys)`;
    const pending = rows.filter(row => !["ACCEPTED", "SELF_RECORDED", "REJECTED"].includes(row.status));
    const grouped = new Map<string, ContributionStatement["contributors"][number]>();
    for (const row of rows.filter(row => ["ACCEPTED", "SELF_RECORDED"].includes(row.status))) {
      const person = grouped.get(row.actorId) ?? { userId: row.actorId, name: row.name, roles: [] };
      person.roles = [...new Set([...person.roles, ...row.roles.filter(role => (creditRoles as readonly string[]).includes(role)) as CreditRole[]])];
      grouped.set(row.actorId, person);
    }
    const contributors = [...grouped.values()].sort((a,b) => a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId));
    const ready = pending.length === 0 && contributors.length > 0 && contributors.every(person => person.roles.length>0);
    return { scopeKey, ready, pendingCount: new Set(pending.map(row => row.sourceId)).size, contributors,
      statement: ready ? contributors.map(person => `${person.name}: ${person.roles.join(", ")}.`).join("\n") : null, determinesAuthorship: false };
  });
}
