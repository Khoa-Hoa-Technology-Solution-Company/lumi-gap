import type { ScreeningAgreement } from "@trend/shared-types";
import type { ScreeningRound, ScreeningAudit } from "../../generated/prisma/client.js";
import { z } from "zod";
import type { WorkspaceContext } from "./workspace-access.js";
import { effectiveAssignments } from "./screening-assignments.js";

const proposalSchema = z.object({
  proposalId: z.string().uuid(), decision: z.enum(["INCLUDED", "EXCLUDED", "NEEDS_MORE_INFO"]), reason: z.string().min(10).max(2000),
  reviewIds: z.array(z.string().uuid()).min(2).max(10), reviewerIds: z.array(z.string().uuid()).min(2).max(10),
});

/** Proposals and each person's confirmation are append-only events under the project lock. */
export async function screeningAgreement(c: WorkspaceContext, row: ScreeningRound): Promise<ScreeningAgreement | null> {
  // Transaction start timestamps can precede project-lock acquisition. Round versions
  // provide the serialized order, including for concurrent proposal submissions.
  const [event] = await c.tx.$queryRaw<ScreeningAudit[]>`SELECT id, details, result, actor_id AS "actorId", created_at AS "createdAt"
    FROM screening_audit WHERE project_id = ${c.project.id}::uuid AND round_id = ${row.id}::uuid AND type = 'AGREEMENT_PROPOSED'
    ORDER BY (result->>'version')::int DESC NULLS LAST, id DESC LIMIT 1`;
  const parsed = proposalSchema.safeParse(event?.details);
  if (!event || !parsed.success) return null;
  const proposal = parsed.data, assignments = await effectiveAssignments(c, row.id);
  if (assignments.some(a => !a.submittedAt)) return null;
  const current = await c.tx.screeningReview.findMany({ where: { projectId: c.project.id, OR: assignments.map(a => ({ assignmentId: a.id, revision: a.revision })) }, select: { id: true } });
  const same = (a: string[], b: string[]) => {
    const left = [...a].sort(), right = [...b].sort();
    return left.length === right.length && left.every((id, i) => id === right[i]);
  };
  if (!same(current.map(r => r.id), proposal.reviewIds) || !same(assignments.map(a => a.reviewerId), proposal.reviewerIds)) return null;
  const eventVersion = (event.result as { version: number }).version;
  const invalidated = await c.tx.screeningAudit.findFirst({ where: { projectId: c.project.id, roundId: row.id, type: { in: ["REVIEW_REOPENED", "FINALIZER_ASSIGNED", "AGREEMENT_DECLINED"] }, result: { path: ["version"], gt: eventVersion } } });
  if (invalidated) return null;
  const confirmations = await c.tx.screeningAudit.findMany({ where: { projectId: c.project.id, roundId: row.id, type: "AGREEMENT_CONFIRMED", details: { path: ["proposalId"], equals: proposal.proposalId } }, select: { actorId: true, createdAt: true } });
  const confirmedByIds = [...new Set(confirmations.map(a => a.actorId))].filter(id => proposal.reviewerIds.includes(id));
  return { id: proposal.proposalId, decision: proposal.decision, reason: proposal.reason, proposedById: event.actorId, reviewIds: proposal.reviewIds,
    confirmations: confirmations.map(a => ({ reviewerId: a.actorId, confirmedAt: a.createdAt.toISOString() })), canDecline: row.active && ["NEEDS_RESOLUTION", "NEEDS_MORE_INFO"].includes(row.status) && !row.finalizerId && event.actorId !== c.actorId && proposal.reviewerIds.includes(c.actorId) && !["ARCHIVED", "COMPLETED"].includes(c.project.status), requiredReviewerIds: proposal.reviewerIds, confirmedByIds, createdAt: event.createdAt.toISOString(),
    canConfirm: row.active && ["NEEDS_RESOLUTION", "NEEDS_MORE_INFO"].includes(row.status) && !row.finalizerId && proposal.reviewerIds.includes(c.actorId) && !confirmedByIds.includes(c.actorId) && !["ARCHIVED", "COMPLETED"].includes(c.project.status) };
}
