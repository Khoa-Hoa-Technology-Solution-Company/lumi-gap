import type { ScreeningSettings } from "@trend/shared-types";
import { automaticFullTextStage } from "./screening.calculator.js";
import type { WorkspaceDb } from "./workspace-access.js";

export const terminalScreeningStates = ["INCLUDED", "EXCLUDED", "CLOSED_UNRESOLVED", "BACKGROUND"];
const selectionFinal = (r: { status: string; phase: string; settings: unknown }) => terminalScreeningStates.includes(r.status) &&
  !(r.status === "INCLUDED" && r.phase === "TITLE_ABSTRACT" && automaticFullTextStage(r.settings as ScreeningSettings));
export const publishedFallbackStates = [...terminalScreeningStates, "WAITING_FULLTEXT"];

/** One published result per paper. A pending re-screen never replaces its predecessor. */
export async function publishedScreeningRounds(tx: WorkspaceDb, projectId: string, paperIds?: string[]) {
  const rounds = await tx.screeningRound.findMany({ where: { projectId,
    ...(paperIds ? { paperId: { in: paperIds } } : {}) }, orderBy: { number: "desc" } });
  const active = rounds.filter(r => r.active);
  const attempts = active.filter(r => !selectionFinal(r));
  const markers = attempts.length ? await tx.screeningAudit.findMany({ where: { projectId,
    roundId: { in: attempts.map(r => r.id) }, type: "RESCREENING_STARTED" }, select: { roundId: true, details: true } }) : [];
  const markersByRound = new Map(markers.map(m => [m.roundId, m.details as { publishedRoundId?: string }]));
  return new Map(active.map(r => {
    const marker = markersByRound.get(r.id);
    const published = marker ? rounds.find(old => old.id === marker.publishedRoundId && old.paperId === r.paperId && old.number < r.number)
      ?? rounds.find(old => old.paperId === r.paperId && old.number < r.number && selectionFinal(old))
      ?? rounds.find(old => old.paperId === r.paperId && old.number < r.number && publishedFallbackStates.includes(old.status)) : null;
    return [r.paperId, published ?? r];
  }));
}
