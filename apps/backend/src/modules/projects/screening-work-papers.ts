import type { ScreeningChoice, ScreeningPhase, ScreeningResolutionType, ScreeningState, ScreeningWorkPaper } from "@trend/shared-types";
import type { WorkspaceContext } from "./workspace-access.js";
import { roundSettings, screeningReviewsVisible } from "./screening-context.js";
import { automaticFullTextStage } from "./screening.calculator.js";
import { screeningPeople } from "./screening-assignments.js";
import { occupiedScreeningSlot } from "./screening-slots.js";

/** Batch the rounds already authorized by workspaceSummary; never expand task or project access. */
export async function screeningWorkPapers(c: WorkspaceContext, roundIds: string[]): Promise<ScreeningWorkPaper[]> {
  if (!roundIds.length) return [];
  const rounds = await c.tx.screeningRound.findMany({ where: { projectId: c.project.id, id: { in: [...new Set(roundIds)] } } });
  const paperIds = [...new Set(rounds.map(r => r.paperId))];
  const [papers, authors, assignments, people, decisions] = await Promise.all([
    c.tx.paper.findMany({ where: { id: { in: paperIds } }, select: { id: true, title: true, publicationYear: true, journalName: true } }),
    c.tx.paperAuthor.findMany({ where: { paperId: { in: paperIds } }, orderBy: { position: "asc" }, select: { paperId: true, displayName: true } }),
    c.tx.screeningAssignment.findMany({ where: { projectId: c.project.id, roundId: { in: rounds.map(r => r.id) }, active: true }, orderBy: { reviewerId: "asc" } }),
    screeningPeople(c),
    c.tx.screeningFinalDecision.findMany({ where: { projectId: c.project.id, roundId: { in: rounds.map(r => r.id) } }, orderBy: { roundVersion: "desc" }, select: { roundId: true, decision: true, reason: true, resolutionType: true } }),
  ]);
  const activePeople = new Set(people.map(p => p.id)), now = new Date();
  // Match effectiveAssignments: submitted ballots survive membership changes, unfinished claims do not.
  const effective = assignments.filter(a => occupiedScreeningSlot(a, now) && (a.submittedAt || activePeople.has(a.reviewerId)));
  const visible = new Set(rounds.filter(r => screeningReviewsVisible(r, roundSettings(r.settings), effective.filter(a => a.roundId === r.id))).map(r => r.id));
  const disclosed = effective.filter(a => a.submittedAt && visible.has(a.roundId));
  const [reviews, names] = await Promise.all([
    disclosed.length ? c.tx.screeningReview.findMany({ where: { projectId: c.project.id, OR: disclosed.map(a => ({ assignmentId: a.id, revision: a.revision })) }, select: { assignmentId: true, decision: true } }) : [],
    disclosed.length ? c.tx.user.findMany({ where: { id: { in: disclosed.map(a => a.reviewerId) } }, select: { id: true, fullName: true } }) : [],
  ]);
  const invalidations = await c.tx.screeningAudit.findMany({ where: { projectId: c.project.id, roundId: { in: roundIds }, type: "DEPENDENCY_INVALIDATED" }, select: { roundId: true } });
  const invalidated = new Set(invalidations.map(a => a.roundId));
  const paperMap = new Map(papers.map(p => [p.id, p]));
  return rounds.map(r => {
    const paper = paperMap.get(r.paperId), settings = roundSettings(r.settings);
    const slots = effective.filter(a => a.roundId === r.id);
    const final = decisions.find(d => d.roundId === r.id);
    const matchingFinal = visible.has(r.id) && final?.decision === r.status ? final : null;
    return {
      invalidated: !r.active && invalidated.has(r.id), roundId: r.id, paperId: r.paperId, title: paper?.title || "Bài báo",
      authors: authors.filter(a => a.paperId === r.paperId).map(a => a.displayName),
      publicationYear: paper?.publicationYear || null, journalName: paper?.journalName || null,
      roundNumber: r.number, phase: r.phase as ScreeningPhase, status: r.status as ScreeningState,
      completed: slots.filter(a => a.submittedAt).length, required: settings.requiredReviewers,
      hiddenReviews: !visible.has(r.id),
      reviews: visible.has(r.id) ? slots.flatMap(a => {
        const review = reviews.find(review => review.assignmentId === a.id);
        return review ? [{ reviewerId: a.reviewerId, name: names.find(n => n.id === a.reviewerId)?.fullName || "Reviewer", decision: review.decision as ScreeningChoice }] : [];
      }) : [],
      acceptedForAnalysis: r.active && r.status === "INCLUDED" && !(r.phase !== "FULL_TEXT" && automaticFullTextStage(settings)),
      resolutionType: matchingFinal?.resolutionType as ScreeningResolutionType | null ?? null,
      groupReason: matchingFinal?.reason ?? null,
    };
  });
}
