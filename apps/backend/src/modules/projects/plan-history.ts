import type { ResearchPlanContent, ResearchApproach, PlanQuestion } from "@trend/shared-types";
import type { ResearchPlan } from "../../generated/prisma/client.js";
import type { WorkspaceDb } from "./workspace-access.js";
import { jsonSnapshot } from "./workspace-access.js";

export function planContent(plan: ResearchPlan, project: { inclusionCriteria: string[]; exclusionCriteria: string[] }): ResearchPlanContent {
  return { approach: plan.approach as ResearchApproach, problem: plan.problem, objectives: plan.objectives, questions: (Array.isArray(plan.questions) ? plan.questions : []) as unknown as PlanQuestion[], scope: plan.scope, methodology: plan.methodology, searchStrategy: plan.searchStrategy, deliverables: plan.deliverables, inclusionCriteria: project.inclusionCriteria, exclusionCriteria: project.exclusionCriteria };
}
export async function recordPlanSnapshot(tx: WorkspaceDb, projectId: string, changedById: string | null, changeSummary: string | null) {
  const [plan, project] = await Promise.all([tx.researchPlan.findUniqueOrThrow({ where: { projectId } }), tx.project.findUniqueOrThrow({ where: { id: projectId } })]);
  const existing = await tx.planRevision.findUnique({ where: { planId_version: { planId: plan.id, version: plan.version } } });
  if (existing) return existing;
  return tx.planRevision.create({ data: { projectId, planId: plan.id, version: plan.version, snapshot: jsonSnapshot(planContent(plan, project)), changedById, changeSummary } });
}
