import type { ScreeningWorkspaceSummary, ScreeningPhase } from "@trend/shared-types";
import type { WorkspaceContext } from "./workspace-access.js";
import { evidenceEligibility } from "./evidence-eligibility.js";

/** Project-scoped current acceptance, independent of who submitted a personal ballot. */
export async function acceptedScreeningPapers(c: WorkspaceContext): Promise<NonNullable<ScreeningWorkspaceSummary["acceptedPapers"]>> {
  const rounds = await c.tx.screeningRound.findMany({
    where: { projectId: c.project.id, active: true, status: "INCLUDED", legacyNeedsAudit: false },
    select: { id: true, paperId: true, phase: true },
  });
  if (!rounds.length) return [];
  const eligible = await evidenceEligibility(c.tx, c.project.id, rounds.map(r => r.paperId));
  const accepted = rounds.filter(r => eligible.get(r.paperId)?.eligible);
  const [papers, decisions] = await Promise.all([
    c.tx.paper.findMany({ where: { id: { in: accepted.map(r => r.paperId) } }, select: { id: true, title: true, publicationYear: true, journalName: true } }),
    c.tx.screeningFinalDecision.findMany({ where: { projectId: c.project.id, roundId: { in: accepted.map(r => r.id) } }, orderBy: { roundVersion: "desc" }, select: { roundId: true, decision: true, createdAt: true, resolutionType: true, resolverId: true } }),
  ]);
  const resolvers = await c.tx.user.findMany({ where: { id: { in: decisions.flatMap(d => d.resolverId ? [d.resolverId] : []) } }, select: { id: true, fullName: true } });
  const paperMap = new Map(papers.map(p => [p.id, p]));
  const resolverMap = new Map(resolvers.map(p => [p.id, p.fullName]));
  return accepted.flatMap(r => {
    const paper = paperMap.get(r.paperId);
    const decision = decisions.find(d => d.roundId === r.id);
    if (!paper || decision?.decision !== "INCLUDED") return [];
    return [{ paperId: r.paperId, roundId: r.id, title: paper.title, publicationYear: paper.publicationYear, journalName: paper.journalName, phase: r.phase as ScreeningPhase, acceptedAt: decision.createdAt.toISOString(), isAdjudicated: decision.resolutionType === "ADJUDICATION", resolverName: decision.resolverId ? resolverMap.get(decision.resolverId) ?? null : null }];
  }).sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt));
}
