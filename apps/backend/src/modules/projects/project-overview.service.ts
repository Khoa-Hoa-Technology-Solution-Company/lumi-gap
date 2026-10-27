import type { ResearchStage, WorkspaceLink, WorkspaceOverview, WorkspacePage, WorkspacePerson } from "@trend/shared-types";
import { withWorkspace, workspacePeople, workspacePerson, workspaceEvent, expectWorkspaceVersion, assertWorkspaceLink } from "./workspace-access.js";
import { planContent } from "./plan-history.js";
import { taskDtos } from "./project-tasks.service.js";
import { isVerifiedLecturer } from "./academic-relationship-access.js";

export const projectOverviewService = {
  async get(projectId: string, actorId: string): Promise<WorkspaceOverview> {
    return withWorkspace(projectId, actorId, {}, async context => {
      const { tx, project } = context, now = new Date(new Date().toISOString().slice(0, 10));
      const [plan, members, mentorRows, paperCounts, evidence, gaps, overdueTasks, blockedTasks, mentorQuestions, reviewResponses, myTasks, reports, manuscripts, nextMilestone, events, feedback, memberCount, topContributorCounts] = await Promise.all([
        tx.researchPlan.findUniqueOrThrow({ where: { projectId: project.id } }),
        tx.projectMember.findMany({ where: { projectId: project.id, status: "ACTIVE" }, orderBy: { joinedAt: "asc" }, take: 100 }),
        tx.mentorRelationship.findMany({ where: { projectId: project.id, status: "ACTIVE" } }),
        tx.projectPaper.groupBy({ by: ["screeningStatus"], where: { projectId: project.id }, _count: true }),
        tx.$queryRaw<Array<{ n: bigint }>>`SELECT (SELECT count(*) FROM project_evidence_items WHERE project_id=${project.id}::uuid) + (SELECT count(*) FROM gap_evidence_records e JOIN research_gaps g ON g.id=e.gap_id WHERE g.project_id=${project.id}::uuid AND e.evidence_item_id IS NULL) AS n`,
        tx.researchGap.count({ where: { projectId: project.id } }),
        tx.projectTask.count({ where: { projectId: project.id, deletedAt: null, status: { not: "DONE" }, dueAt: { lt: now } } }),
        tx.projectTask.count({ where: { projectId: project.id, deletedAt: null, status: "BLOCKED" } }),
        tx.projectDiscussion.count({ where: { projectId: project.id, category: "MENTOR_QUESTION", status: "OPEN", mentorRelationshipId: { not: null } } }),
        tx.reviewRequest.count({ where: { projectId: project.id, status: "REVISION_REQUESTED" } }),
        tx.projectTask.findMany({ where: { projectId: project.id, deletedAt: null, assigneeId: context.actorId, status: { not: "DONE" } }, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }], take: 5 }),
        tx.report.findMany({ where: { projectId: project.id }, select: { id: true, topic: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 3 }),
        tx.draftWorkspace.findMany({ where: { projectId: project.id, writingMode: "LATEX", deletedAt: null }, select: { id: true, name: true, updatedAt: true }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 3 }),
        tx.projectMilestone.findFirst({ where: { projectId: project.id, status: "PLANNED" }, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }] }),
        tx.projectActivity.findMany({ where: { projectId: project.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 12 }),
        tx.$queryRaw<Array<{ n: bigint }>>`
          WITH latest_plan AS (
            SELECT DISTINCT ON (target_id) target_id,author_id FROM project_workspace_comments
            WHERE project_id=${project.id}::uuid AND target_kind='PLAN_REVISION' ORDER BY target_id,created_at DESC,id DESC
          ), latest_thread AS (
            SELECT DISTINCT ON (thread_id) thread_id,sender_id FROM project_team_messages
            WHERE project_id=${project.id}::uuid AND thread_id IS NOT NULL AND NOT is_deleted ORDER BY thread_id,created_at DESC,id DESC
          ), latest_section AS (
            SELECT d.id,d.target_id,COALESCE(x.sender_id,d.author_id) AS author_id
            FROM project_discussions d LEFT JOIN latest_thread x ON x.thread_id=d.id
            WHERE d.project_id=${project.id}::uuid AND d.target_kind='PLAN_REVISION'
              AND d.context ? 'planSection' AND d.status='OPEN'
          ), awaiting AS (
            SELECT 'plan:'||x.target_id::text AS key FROM latest_plan x
            JOIN plan_shares s ON s.revision_id=x.target_id AND s.revoked_at IS NULL
            JOIN mentor_relationships m ON m.id=s.relationship_id AND m.mentor_user_id=x.author_id AND m.status='ACTIVE'
            UNION
            SELECT 'thread:'||d.id::text AS key FROM latest_thread x
            JOIN project_discussions d ON d.id=x.thread_id AND d.status='OPEN'
            JOIN mentor_relationships m ON m.id=d.mentor_relationship_id AND m.mentor_user_id=x.sender_id AND m.status='ACTIVE'
            JOIN plan_shares s ON s.revision_id=d.target_id AND s.relationship_id=m.id AND s.revoked_at IS NULL
            UNION
            SELECT 'thread:'||x.id::text AS key FROM latest_section x
            JOIN mentor_relationships m ON m.project_id=${project.id}::uuid AND m.mentor_user_id=x.author_id AND m.status='ACTIVE'
            JOIN plan_shares s ON s.revision_id=x.target_id AND s.relationship_id=m.id AND s.revoked_at IS NULL
          ) SELECT count(DISTINCT key) AS n FROM awaiting`,
        tx.projectMember.count({ where: { projectId: project.id, status: "ACTIVE" } }),
        tx.$queryRaw<Array<{ actorId: string; count: bigint }>>`
          SELECT actor_id AS "actorId", count(*) AS count
          FROM project_activities
          WHERE project_id = ${project.id}::uuid AND actor_id IS NOT NULL
          GROUP BY actor_id
          ORDER BY count DESC
          LIMIT 5
        `,
      ]);
      const mentorIds = mentorRows.map(row => row.mentorUserId);
      const [mentorUsers, mentorProfiles] = await Promise.all([
        tx.user.findMany({ where: { id: { in: mentorIds } }, select: { id: true, isActive: true, accountStatus: true, emailVerifiedAt: true } }),
        tx.academicProfile.findMany({ where: { userId: { in: mentorIds } }, select: { userId: true, academicRole: true, roleVerificationStatus: true, positionStatus: true } }),
      ]);
      const mentors = mentorRows.filter(row => isVerifiedLecturer(mentorUsers.find(user => user.id === row.mentorUserId) ?? null, mentorProfiles.find(profile => profile.userId === row.mentorUserId) ?? null));
      const people = await workspacePeople(tx, [
        ...members.map(row => row.userId),
        ...mentors.map(row => row.mentorUserId),
        ...myTasks.map(row => row.createdById),
        ...events.flatMap(row => row.actorId ? [row.actorId] : []),
        ...topContributorCounts.map(row => row.actorId),
      ]);
      const totalTopActivities = topContributorCounts.reduce((sum, r) => sum + Number(r.count), 0);
      const topContributors = topContributorCounts.map((row, index) => {
        const count = Number(row.count);
        return {
          person: workspacePerson(people, row.actorId),
          count,
          percentage: totalTopActivities > 0 ? Math.round((count / totalTopActivities) * 100) : 0,
          rank: index + 1,
        };
      });
      const mutable = project.status !== "ARCHIVED";
      return {
        project: { id: project.id, title: project.title, status: project.status as WorkspaceOverview["project"]["status"], researchStage: project.researchStage as ResearchStage | null, version: project.version },
        capabilities: { editResearch: mutable, manageProject: context.role === "OWNER" && mutable, collaborate: mutable },
        members: members.map(row => workspacePerson(people, row.userId)), memberCount, mentors: mentors.map(row => ({ ...workspacePerson(people, row.mentorUserId), relationshipId: row.id })),
        plan: planContent(plan, project),
        progress: { papers: paperCounts.reduce((sum, row) => sum + row._count, 0), pendingScreening: paperCounts.filter(row => row.screeningStatus === "UNDECIDED" || row.screeningStatus === "MAYBE").reduce((sum, row) => sum + row._count, 0), included: paperCounts.find(row => row.screeningStatus === "INCLUDED")?._count ?? 0, evidence: Number(evidence[0]?.n ?? 0), gaps, questions: Array.isArray(plan.questions) ? plan.questions.length : 0 },
        attention: { overdueTasks, blockedTasks, mentorQuestions, mentorFeedback: Number(feedback[0]?.n ?? 0), reviewResponses },
        myTasks: await taskDtos(context, myTasks),
        recentArtifacts: [...reports.map(row => ({ id: row.id, title: row.topic ?? "Research report", kind: "REPORT" as const, updatedAt: row.updatedAt.toISOString() })), ...manuscripts.map(row => ({ id: row.id, title: row.name, kind: "MANUSCRIPT" as const, updatedAt: row.updatedAt.toISOString() }))].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3),
        nextMilestone: nextMilestone ? { id: nextMilestone.id, title: nextMilestone.title, description: nextMilestone.description, dueAt: nextMilestone.dueAt?.toISOString() ?? null, status: "PLANNED", version: nextMilestone.version } : null,
        activity: events.map(row => ({ id: row.id, type: row.type, actor: row.actorId ? workspacePerson(people, row.actorId) : null, createdAt: row.createdAt.toISOString(), entityKind: row.entityKind, entityId: row.entityId })),
        topContributors,
      };
    });
  },
  async stage(projectId: string, actorId: string, input: { expectedVersion: number; stage: ResearchStage | null }) {
    return withWorkspace(projectId, actorId, { write: true, owner: true }, async context => {
      expectWorkspaceVersion(context.project.version, input.expectedVersion);
      if (context.project.researchStage === input.stage) return { version: context.project.version };
      const project = await context.tx.project.update({ where: { id: context.project.id }, data: { researchStage: input.stage, version: { increment: 1 } } });
      await workspaceEvent(context, "RESEARCH_STAGE_CHANGED", "PROJECT", project.id, { previous: context.project.researchStage, stage: input.stage });
      return { version: project.version };
    });
  },
  async people(projectId: string, actorId: string, query: { q: string; page: number; pageSize: number }): Promise<WorkspacePage<WorkspacePerson>> {
    return withWorkspace(projectId, actorId, {}, async ({ tx, project }) => {
      const memberships = await tx.projectMember.findMany({ where: { projectId: project.id, status: "ACTIVE" }, select: { userId: true } });
      const where = { id: { in: [project.ownerId, ...memberships.map(row => row.userId)] }, isActive: true, accountStatus: "ACTIVE", emailVerifiedAt: { not: null }, ...(query.q ? { fullName: { contains: query.q, mode: "insensitive" as const } } : {}) };
      const [rows, total] = await Promise.all([tx.user.findMany({ where, select: { id: true, fullName: true }, take: query.pageSize, skip: (query.page - 1) * query.pageSize, orderBy: [{ fullName: "asc" }, { id: "asc" }] }), tx.user.count({ where })]);
      return { items: rows.map(row => ({ id: row.id, name: row.fullName || "Researcher" })), ...query, total, hasNext: query.page * query.pageSize < total };
    });
  },
  async artifacts(projectId: string, actorId: string, kind: WorkspaceLink["kind"], q: string): Promise<WorkspaceLink[]> {
    return withWorkspace(projectId, actorId, {}, async ({ tx, project }) => {
      const query = { contains: q, mode: "insensitive" as const };
      switch (kind) {
        case "PAPER": case "SCREENING": {
          const rows = await tx.$queryRaw<Array<{ id: string; paper_id: string; title: string }>>`SELECT pp.id,pp.paper_id,p.title FROM project_papers pp JOIN papers p ON p.id=pp.paper_id WHERE pp.project_id=${project.id}::uuid AND p.title ILIKE ${"%" + q + "%"} ORDER BY pp.created_at DESC,pp.id LIMIT 50`;
          return rows.map(row => ({ kind, id: kind === "PAPER" ? row.paper_id : row.id, label: row.title }));
        }
        case "EVIDENCE": {
          const rows = await tx.$queryRaw<Array<{ id: string; label: string }>>`SELECT id,label FROM (
            SELECT e.id,left(e.claim,160) AS label,e.created_at FROM project_evidence_items e WHERE e.project_id=${project.id}::uuid AND e.claim ILIKE ${"%" + q + "%"}
            UNION ALL
            SELECT e.id,left(e.explanation,160) AS label,e.created_at FROM gap_evidence_records e JOIN research_gaps g ON g.id=e.gap_id WHERE g.project_id=${project.id}::uuid AND e.evidence_item_id IS NULL AND e.explanation ILIKE ${"%" + q + "%"}
          ) items ORDER BY created_at DESC,id LIMIT 50`;
          return rows.map(row => ({ ...row, kind }));
        }
        case "GAP": return (await tx.researchGap.findMany({ where: { projectId: project.id, title: query }, take: 50, orderBy: { updatedAt: "desc" }, select: { id: true, title: true } })).map(row => ({ kind, id: row.id, label: row.title }));
        case "REPORT": return (await tx.report.findMany({ where: { projectId: project.id, topic: query }, take: 50, orderBy: { updatedAt: "desc" }, select: { id: true, topic: true } })).map(row => ({ kind, id: row.id, label: row.topic ?? "Research report" }));
        case "TREND": return (await tx.projectTrendSnapshot.findMany({ where: { projectId: project.id, topic: query }, take: 50, orderBy: { createdAt: "desc" }, select: { id: true, topic: true, yearFrom: true, yearTo: true, verdict: true } })).map(row => ({ kind, id: row.id, label: `${row.topic} (${row.verdict}, ${row.yearFrom}-${row.yearTo})` }));
        case "MANUSCRIPT": return (await tx.draftWorkspace.findMany({ where: { projectId: project.id, writingMode: "LATEX", deletedAt: null, name: query }, take: 50, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], select: { id: true, name: true } })).map(row => ({ kind, id: row.id, label: row.name }));
        case "MANUSCRIPT_SNAPSHOT": {
          const drafts = await tx.draftWorkspace.findMany({ where: { projectId: project.id, writingMode: "LATEX", deletedAt: null }, select: { id: true } });
          return (await tx.manuscriptSnapshot.findMany({ where: { projectId: project.id, workspaceId: { in: drafts.map(draft => draft.id) }, label: query }, take: 50, orderBy: { createdAt: "desc" }, select: { id: true, label: true } })).map(row => ({ ...row, kind }));
        }
        case "MENTOR_FEEDBACK": return (await tx.projectDiscussion.findMany({ where: { projectId: project.id, title: query, targetKind: { in: ["MANUSCRIPT_SNAPSHOT", "PLAN_REVISION"] }, mentorRelationshipId: { not: null } }, take: 50, orderBy: { createdAt: "desc" }, select: { id: true, title: true } })).map(row => ({ kind, id: row.id, label: row.title }));
        case "PLAN": { const plan = await tx.researchPlan.findUniqueOrThrow({ where: { projectId: project.id } }); return [{ kind, id: plan.id, label: project.title }]; }
        case "REVIEW_REQUEST": return (await tx.reviewRequest.findMany({ where: { projectId: project.id }, take: 50, orderBy: { createdAt: "desc" }, select: { id: true, status: true } })).map(row => ({ kind, id: row.id, label: row.status }));
        case "PLAN_REVISION": return (await tx.planRevision.findMany({ where: { projectId: project.id }, take: 50, orderBy: { version: "desc" }, select: { id: true, version: true } })).map(row => ({ kind, id: row.id, label: `v${row.version}` }));
        case "QUESTION": {
          const plan = await tx.researchPlan.findUniqueOrThrow({ where: { projectId: project.id } });
          const questions = plan.questions as unknown as Array<{ id: string; text: string }>;
          return questions.filter(question => question.text.toLocaleLowerCase().includes(q.toLocaleLowerCase())).map(question => ({ kind, id: question.id, label: question.text }));
        }
      }
    });
  },
  async artifactHref(projectId: string, actorId: string, link: WorkspaceLink) {
    return withWorkspace(projectId, actorId, {}, async context => {
      await assertWorkspaceLink(context, link);
      const base = `/projects/${context.project.id}`;
      if (link.kind === "MANUSCRIPT_SNAPSHOT") {
        const snapshot = await context.tx.manuscriptSnapshot.findUniqueOrThrow({ where: { id: link.id } });
        return { href: `${base}/manuscripts/${snapshot.workspaceId}?snapshot=${snapshot.id}` };
      }
      if (link.kind === "MENTOR_FEEDBACK") {
        const thread = await context.tx.projectDiscussion.findUniqueOrThrow({ where: { id: link.id } });
        if (thread.targetKind === "MANUSCRIPT_SNAPSHOT") {
          const snapshot = await context.tx.manuscriptSnapshot.findFirstOrThrow({ where: { id: thread.targetId!, projectId: context.project.id } });
          return { href: `${base}/manuscripts/${snapshot.workspaceId}?snapshot=${snapshot.id}` };
        }
        return { href: `${base}?tab=discussions&thread=${thread.id}` };
      }
      if (link.kind === "TREND") return { href: `${base}?tab=overview&trend=${link.id}` };
      return { href: link.kind === "MANUSCRIPT" ? `${base}/manuscripts/${link.id}` : `${base}?tab=plan` };
    });
  },
};
