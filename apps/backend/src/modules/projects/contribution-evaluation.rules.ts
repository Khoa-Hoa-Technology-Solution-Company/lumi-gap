import type { EvaluationObjection } from "@trend/shared-types";

type Revision = { id: string; version: number };
type Decision = { evaluationId: string; userId: string; kind: string; decision: string; note: string };

/** Only the original objector can resolve an objection, on a later revision. */
export function unresolvedEvaluationObjections(revisions: Revision[], decisions: Decision[]): EvaluationObjection[] {
  const byRevision = new Map<string, Decision[]>();
  for (const decision of decisions) {
    const group = byRevision.get(decision.evaluationId) ?? [];
    group.push(decision); byRevision.set(decision.evaluationId, group);
  }
  const open = new Map<string, EvaluationObjection>();
  for (const revision of [...revisions].sort((a, b) => a.version - b.version)) {
    const responses = byRevision.get(revision.id) ?? [];
    for (const response of responses) {
      if (response.kind === "RESOLUTION" && response.decision === "APPROVE" && (open.get(response.userId)?.version ?? Infinity) < revision.version) open.delete(response.userId);
    }
    // A new dispute always wins over a resolution recorded on the same revision.
    for (const response of responses) {
      if (response.decision === "DISPUTE") open.set(response.userId, { userId: response.userId, evaluationId: revision.id, version: revision.version, note: response.note });
    }
  }
  return [...open.values()].sort((a, b) => a.userId.localeCompare(b.userId));
}
