import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { PlanDraftResult, ResearchPlanContent } from "@trend/shared-types";
import type { z } from "zod";
import { AppError } from "../../common/exceptions/app-error.js";
import { planContent, recordPlanSnapshot } from "./plan-history.js";
import { authorizedPlanRevision, validatePlanQuestions } from "./project-plan.service.js";
import { planDraftSchema, planRestoreSchema, planSnapshotSchema, savePlanSchema } from "./dto/project-workspace.schema.js";
import { expectWorkspaceVersion, jsonSnapshot, withWorkspace, workspaceEvent, type WorkspaceContext } from "./workspace-access.js";

type Field = keyof ResearchPlanContent;
function fingerprint(input: unknown) { return createHash("sha256").update(JSON.stringify(input)).digest("hex"); }
function requestKey(context: WorkspaceContext, operation: string, key: string) { return `plan-${operation}:${context.actorId}:${key}`; }
async function receipt(context: WorkspaceContext, operation: string, key: string, hash: string) {
  const row = await context.tx.projectActivity.findUnique({ where: { projectId_idempotencyKey: { projectId: context.project.id, idempotencyKey: requestKey(context, operation, key) } } });
  if (!row) return null;
  const metadata = row.metadata as { inputHash: string; version: number; revisionId?: string };
  if (metadata.inputHash !== hash) throw AppError.conflict("This request key was already used with different plan changes");
  return metadata;
}
async function rememberDraft(context: WorkspaceContext, planId: string, result: PlanDraftResult, hash: string, key: string, operation = "draft", sourceRevisionId?: string) {
  await context.tx.projectWorkspaceRevision.createMany({ data: [{ projectId: context.project.id, entityKind: "PLAN_DRAFT", entityId: planId, version: result.version, actorId: context.actorId, snapshot: jsonSnapshot(result.content) }], skipDuplicates: true });
  await workspaceEvent(context, operation === "restore" ? "PLAN_RESTORED" : "PLAN_DRAFT_SAVED", "PLAN_DRAFT", planId, { version: result.version, inputHash: hash, ...(sourceRevisionId ? { sourceRevisionId } : {}) }, requestKey(context, operation, key));
}
async function priorDraft(context: WorkspaceContext, planId: string, version: number): Promise<PlanDraftResult> {
  const revision = await context.tx.projectWorkspaceRevision.findUniqueOrThrow({ where: { entityKind_entityId_version: { entityKind: "PLAN_DRAFT", entityId: planId, version } } });
  return { version, content: revision.snapshot as unknown as ResearchPlanContent };
}
async function persist(context: WorkspaceContext, content: ResearchPlanContent): Promise<PlanDraftResult> {
  const { inclusionCriteria, exclusionCriteria, ...fields } = content;
  const plan = await context.tx.researchPlan.update({ where: { projectId: context.project.id }, data: { ...fields, questions: jsonSnapshot(fields.questions), updatedById: context.actorId, version: { increment: 1 } } });
  await context.tx.project.update({ where: { id: context.project.id }, data: { inclusionCriteria, exclusionCriteria, version: { increment: 1 } } });
  return { version: plan.version, content };
}

/** Working revision audit is separate from the explicitly created, shareable PlanRevision snapshots. */
export const projectPlanDraftService = {
  async update(projectId: string, actorId: string, raw: z.infer<typeof planDraftSchema>): Promise<PlanDraftResult> {
    const input = planDraftSchema.parse(raw);
    return withWorkspace(projectId, actorId, { write: true }, async context => {
      const plan = await context.tx.researchPlan.findUniqueOrThrow({ where: { projectId: context.project.id } });
      const keys = Object.keys(input.changes).sort() as Field[];
      const hash = fingerprint([input.expectedVersion, keys.map(key => [key, input.base[key], input.changes[key]])]);
      const previous = await receipt(context, "draft", input.clientKey, hash);
      if (previous) return priorDraft(context, plan.id, previous.version);
      if (input.expectedVersion > plan.version) throw AppError.conflict("Plan revision is ahead of the current draft");
      const current = planContent(plan, context.project);
      // Even a matching revision requires genuine original values. A stale client can merge only untouched fields.
      const conflicts = keys.filter(key => !isDeepStrictEqual(current[key], input.base[key]) && !isDeepStrictEqual(current[key], input.changes[key]));
      if (conflicts.length) throw AppError.conflict("Research plan changed in the same sections", { fields: conflicts, version: plan.version });
      const next = { ...current, ...input.changes } as ResearchPlanContent;
      if (input.changes.questions) await validatePlanQuestions(context, current, next.questions);
      const result = isDeepStrictEqual(current, next) ? { version: plan.version, content: current } : await persist(context, next);
      await rememberDraft(context, plan.id, result, hash, input.clientKey);
      return result;
    });
  },
  async snapshot(projectId: string, actorId: string, raw: z.infer<typeof planSnapshotSchema>) {
    const input = planSnapshotSchema.parse(raw);
    return withWorkspace(projectId, actorId, { write: true }, async context => {
      const hash = fingerprint([input.expectedVersion, input.changeSummary]);
      const previous = await receipt(context, "snapshot", input.clientKey, hash);
      if (previous) return { version: previous.version, revisionId: previous.revisionId! };
      const plan = await context.tx.researchPlan.findUniqueOrThrow({ where: { projectId: context.project.id } });
      expectWorkspaceVersion(plan.version, input.expectedVersion);
      const revision = await recordPlanSnapshot(context.tx, context.project.id, context.actorId, input.changeSummary || null);
      await workspaceEvent(context, "PLAN_SNAPSHOT_CREATED", "PLAN_REVISION", revision.id, { version: revision.version, revisionId: revision.id, inputHash: hash }, requestKey(context, "snapshot", input.clientKey));
      return { version: revision.version, revisionId: revision.id };
    });
  },
  async restore(projectId: string, actorId: string, revisionId: string, raw: z.infer<typeof planRestoreSchema>): Promise<PlanDraftResult> {
    const input = planRestoreSchema.parse(raw);
    return withWorkspace(projectId, actorId, { write: true }, async context => {
      const hash = fingerprint([revisionId, input.expectedVersion]);
      const plan = await context.tx.researchPlan.findUniqueOrThrow({ where: { projectId: context.project.id } });
      const previous = await receipt(context, "restore", input.clientKey, hash);
      if (previous) return priorDraft(context, plan.id, previous.version);
      expectWorkspaceVersion(plan.version, input.expectedVersion);
      const revision = await authorizedPlanRevision(context, revisionId);
      // Validate historical content, never accept client-supplied creator or snapshot bytes.
      const { expectedVersion: _version, changeSummary: _note, ...content } = savePlanSchema.parse({ ...(revision.snapshot as object), expectedVersion: plan.version, changeSummary: "" });
      await validatePlanQuestions(context, planContent(plan, context.project), content.questions);
      const result = await persist(context, content);
      await rememberDraft(context, plan.id, result, hash, input.clientKey, "restore", revisionId);
      return result;
    });
  },
};
