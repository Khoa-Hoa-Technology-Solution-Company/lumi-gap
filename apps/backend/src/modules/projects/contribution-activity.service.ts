import type { ActivityCategory, ActivityResult, ContributionActivity, ContributionArtifactLink } from "@trend/shared-types";
import type { z } from "zod";
import { activitySchema } from "./dto/project-contributions.schema.js";
import { withWorkspace, workspacePeople, workspacePerson } from "./workspace-access.js";

// Explicitly omit chat, presence, autosaves, administrative audits and allocation decisions.
export const meaningfulActivity: Record<ActivityCategory, string[]> = {
  PLAN: ["PLAN_UPDATED", "PLAN_SNAPSHOT_CREATED"],
  LITERATURE: ["PAPER_ADDED", "PAPER_IMPORTED", "PAPER_ORGANIZED", "PRIVATE_SOURCE_UPLOADED"],
  SCREENING: ["PAPER_SCREENED", "SCREENING_DECIDED", "SCREENING_RESOLVED", "SCREENING_VOTE_RECORDED", "SCREENING_CONFLICT_RESOLVED"],
  EVIDENCE: ["EVIDENCE_EXTRACTED", "EVIDENCE_REVISED", "EVIDENCE_REVIEWED"],
  GAP: ["GAP_CREATED", "GAP_REVISED", "GAP_EVIDENCE_CHANGED", "EVIDENCE_ADDED", "EVIDENCE_LINKED", "GAP_ASSESSED", "QUESTION_DERIVED"],
  TASK: ["TASK_COMPLETED"], DECISION: ["DECISION_RECORDED", "DECISION_REVISED"],
  MANUSCRIPT: ["MANUSCRIPT_REVISION_SAVED", "MANUSCRIPT_CREATED", "MANUSCRIPT_WRITING_SESSION", "MANUSCRIPT_SNAPSHOT_CREATED", "MANUSCRIPT_FEEDBACK_PROVIDED", "MANUSCRIPT_VERSION_SUBMITTED"],
};
export function activityDay(timestamp: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(timestamp);
}
const categoryOf = (type: string) => (Object.keys(meaningfulActivity) as ActivityCategory[]).find(category => meaningfulActivity[category].includes(type));
export const contributionActivityService = {
  async list(projectId: string, actorId: string, query: z.infer<typeof activitySchema>): Promise<ActivityResult> {
    return withWorkspace(projectId, actorId, {}, async ({ tx, project }) => {
      const where = { projectId: project.id, actorId: query.memberId ?? { not: null }, type: { in: query.category ? meaningfulActivity[query.category] : Object.values(meaningfulActivity).flat() }, createdAt: { gte: new Date(query.from), lte: new Date(query.to) } };
      const [identities, counts, actors] = await Promise.all([
        tx.$queryRaw<{ id: string }[]>`SELECT id FROM project_activities WHERE project_id=${project.id}::uuid AND actor_id IS NOT NULL AND (${query.memberId ?? null}::uuid IS NULL OR actor_id=${query.memberId ?? null}::uuid) AND type=ANY(${where.type.in}::text[]) AND created_at>=${new Date(query.from)} AND created_at<=${new Date(query.to)} AND (${query.eventDay ?? null}::text IS NULL OR to_char(created_at AT TIME ZONE ${query.timeZone}, 'YYYY-MM-DD')=${query.eventDay ?? null}) ORDER BY created_at DESC,id DESC LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`,
        tx.$queryRaw<{ day: string; count: bigint }[]>`SELECT to_char(created_at AT TIME ZONE ${query.timeZone}, 'YYYY-MM-DD') AS day, count(*) AS count FROM project_activities WHERE project_id=${project.id}::uuid AND actor_id IS NOT NULL AND (${query.memberId ?? null}::uuid IS NULL OR actor_id=${query.memberId ?? null}::uuid) AND type=ANY(${where.type.in}::text[]) AND created_at>=${new Date(query.from)} AND created_at<=${new Date(query.to)} GROUP BY day ORDER BY day`,
        tx.$queryRaw<{ actorId: string }[]>`SELECT DISTINCT actor_id AS "actorId" FROM project_activities WHERE project_id=${project.id}::uuid AND actor_id IS NOT NULL AND type=ANY(${Object.values(meaningfulActivity).flat()}::text[])`,
      ]);
      const rows = await tx.projectActivity.findMany({ where: { projectId: project.id, id: { in: identities.map(row => row.id) } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      const total = counts.filter(row => !query.eventDay || row.day === query.eventDay).reduce((sum, row) => sum + Number(row.count), 0);
      const people = await workspacePeople(tx, actors.flatMap(row => row.actorId ? [row.actorId] : []));
      const items: ContributionActivity[] = rows.map(row => {
        // Never return raw metadata: independent blinded screening votes must remain private.
        const allowed = ["PAPER", "GAP", "EVIDENCE", "MANUSCRIPT", "PLAN_REVISION", "TASK"];
        const kind = row.entityKind === "EXTRACTION" ? "EVIDENCE" : row.entityKind;
        const link = kind && row.entityId && allowed.includes(kind) && /^[0-9a-f-]{36}$/i.test(row.entityId) ? { kind, id: row.entityId } as ContributionArtifactLink : null;
        return { id: row.id, type: row.type, category: categoryOf(row.type)!, actor: workspacePerson(people, row.actorId!), createdAt: row.createdAt.toISOString(), artifactVersion: row.artifactVersion, link };
      });
      return { items, total, hasNext: query.page * query.pageSize < total, days: counts.map(row => ({ day: row.day, count: Number(row.count) })), members: [...people.values()], timeZone: query.timeZone };
    });
  },
};
