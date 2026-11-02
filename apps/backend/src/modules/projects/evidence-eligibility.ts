import type { WorkspaceDb } from "./workspace-access.js";

/** Reads the frozen screening protocol, never infers completion from reviewer counts. */
export async function evidenceEligibility(tx: WorkspaceDb, projectId: string, paperIds?: string[]) {
  const [links, rounds, settingsExist] = await Promise.all([
    tx.projectPaper.findMany({ where: { projectId, ...(paperIds ? { paperId: { in: paperIds } } : {}) }, select: { paperId: true, screeningStatus: true } }),
    tx.screeningRound.findMany({ where: { projectId, active: true, ...(paperIds ? { paperId: { in: paperIds } } : {}) }, select: { paperId: true, status: true, phase: true, settings: true, legacyNeedsAudit: true } }),
    tx.screeningSettings.count({ where: { projectId } }),
  ]);
  const byPaper = new Map(rounds.map(round => [round.paperId, round]));
  return new Map(links.map(link => {
    const round = byPaper.get(link.paperId);
    const settings = round?.settings as { reviewMode?: string; stages?: string[] } | undefined;
    const awaitingFullText = Boolean(round && settings?.reviewMode !== "COLLABORATIVE" && round.phase !== "FULL_TEXT" && settings?.stages?.includes("FULL_TEXT"));
    const eligible = link.screeningStatus === "INCLUDED" && (round ? round.status === "INCLUDED" && !round.legacyNeedsAudit && !awaitingFullText : !settingsExist);
    const reason = eligible ? null : round?.legacyNeedsAudit ? "Kết quả cũ cần được kiểm tra lại" : awaitingFullText ? "Chưa hoàn tất sàng lọc toàn văn" : "Nguồn chưa đủ điều kiện phân tích theo kết quả sàng lọc hiện tại";
    return [link.paperId, { eligible, screeningStatus: round?.status ?? link.screeningStatus, eligibilityReason: reason }] as const;
  }));
}
