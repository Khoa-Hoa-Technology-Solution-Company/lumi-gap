import type { FeasibilityScores, FeasibilitySummary, FeasibilityTargetKind } from "@trend/shared-types";
import { summarizeFeasibility } from "./literature.rules.js";
import type { WorkspaceDb } from "./workspace-access.js";

export function scoresOf(row: FeasibilityScores): FeasibilityScores {
  return { dataAvailability: row.dataAvailability, expertise: row.expertise, resources: row.resources, timeline: row.timeline, risk: row.risk };
}

/** Team feasibility of several targets of one kind, in one query. */
export async function feasibilitySummaries(tx: WorkspaceDb, projectId: string, targetKind: FeasibilityTargetKind, targetIds: string[]): Promise<Map<string, FeasibilitySummary>> {
  const rows = targetIds.length ? await tx.projectFeasibilityAssessment.findMany({ where: { projectId, targetKind, targetId: { in: targetIds } } }) : [];
  return new Map(targetIds.map((id) => [id, summarizeFeasibility(rows.filter((row) => row.targetId === id).map(scoresOf))]));
}

export async function feasibilitySummary(tx: WorkspaceDb, projectId: string, targetKind: FeasibilityTargetKind, targetId: string): Promise<FeasibilitySummary> {
  return (await feasibilitySummaries(tx, projectId, targetKind, [targetId])).get(targetId)!;
}
