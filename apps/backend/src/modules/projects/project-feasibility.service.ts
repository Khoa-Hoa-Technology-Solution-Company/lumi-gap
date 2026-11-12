import type { FeasibilityAssessment, FeasibilityTargetKind, FeasibilityView } from "@trend/shared-types";
import type { z } from "zod";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import type { saveFeasibilitySchema } from "./dto/project-literature.schema.js";
import { feasibilitySummary, scoresOf } from "./feasibility-summary.js";
import { assertFeasibilityNotes, feasibilityMean, feasibilityVerdict } from "./literature.rules.js";
import { projectGap } from "./project-gap-research.service.js";
import { expectWorkspaceVersion, withWorkspace, workspaceEvent, workspacePeople, workspacePerson, workspaceRevision, type WorkspaceContext } from "./workspace-access.js";

/** Resolves a target of this project to its UUID and current version. */
export async function feasibilityTarget(context: WorkspaceContext, kind: FeasibilityTargetKind, targetId: string): Promise<{ id: string; version: number }> {
  if (kind === "GAP") {
    const gap = await projectGap(context, targetId);
    return { id: gap.id, version: gap.version };
  }
  const parsed = parseDatabaseId(targetId);
  const row = parsed?.kind === "uuid" ? await context.tx.projectLimitation.findFirst({ where: { id: parsed.value, projectId: context.project.id } }) : null;
  if (!row) throw AppError.notFound("Limitation not found");
  return { id: row.id, version: row.version };
}

type AssessmentRow = Awaited<ReturnType<WorkspaceContext["tx"]["projectFeasibilityAssessment"]["findFirstOrThrow"]>>;
function presentAssessment(row: AssessmentRow, assessorName: string): FeasibilityAssessment {
  const scores = scoresOf(row);
  return {
    id: row.id, targetKind: row.targetKind as FeasibilityTargetKind, targetId: row.targetId, targetVersion: row.targetVersion,
    assessorId: row.assessorId, assessorName, notes: row.notes, version: row.version, updatedAt: row.updatedAt.toISOString(),
    ...scores, mean: feasibilityMean(scores), verdict: feasibilityVerdict(scores),
  };
}

async function view(context: WorkspaceContext, kind: FeasibilityTargetKind, target: { id: string; version: number }): Promise<FeasibilityView> {
  const rows = await context.tx.projectFeasibilityAssessment.findMany({ where: { projectId: context.project.id, targetKind: kind, targetId: target.id }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }] });
  const people = await workspacePeople(context.tx, rows.map((row) => row.assessorId));
  return {
    summary: await feasibilitySummary(context.tx, context.project.id, kind, target.id),
    assessments: rows.map((row) => presentAssessment(row, workspacePerson(people, row.assessorId).name)),
    targetVersion: target.version,
    canAssess: Boolean(context.role) && context.project.status !== "ARCHIVED",
  };
}

export const projectFeasibilityService = {
  async get(projectId: string, actorId: string, kind: FeasibilityTargetKind, targetId: string): Promise<FeasibilityView> {
    return withWorkspace(projectId, actorId, { mentor: true, mentorScope: "SHARED_RESOURCES" }, async (context) => view(context, kind, await feasibilityTarget(context, kind, targetId)));
  },

  /** Creates or replaces the caller's own assessment. Other members' assessments are never changed. */
  async save(projectId: string, actorId: string, kind: FeasibilityTargetKind, targetId: string, input: z.infer<typeof saveFeasibilitySchema>): Promise<FeasibilityView> {
    const { expectedVersion, notes, ...scores } = input;
    assertFeasibilityNotes(scores, notes);
    return withWorkspace(projectId, actorId, { write: true }, async (context) => {
      const target = await feasibilityTarget(context, kind, targetId);
      const key = { projectId_targetKind_targetId_assessorId: { projectId: context.project.id, targetKind: kind, targetId: target.id, assessorId: context.actorId } };
      const prior = await context.tx.projectFeasibilityAssessment.findUnique({ where: key });
      if (prior) {
        if (expectedVersion === undefined) throw AppError.conflict("You already assessed this item. Reload to edit your assessment");
        expectWorkspaceVersion(prior.version, expectedVersion);
      }
      const row = prior
        ? await context.tx.projectFeasibilityAssessment.update({ where: { id: prior.id }, data: { ...scores, notes, targetVersion: target.version, version: { increment: 1 } } })
        : await context.tx.projectFeasibilityAssessment.create({ data: { ...scores, notes, projectId: context.project.id, targetKind: kind, targetId: target.id, targetVersion: target.version, assessorId: context.actorId } });
      await workspaceRevision(context, "FEASIBILITY", row);
      await workspaceEvent(context, "FEASIBILITY_ASSESSED", "FEASIBILITY", row.id, { version: row.version, targetKind: kind, targetId: target.id, verdict: feasibilityVerdict(scoresOf(row)) });
      return view(context, kind, target);
    });
  },
};
