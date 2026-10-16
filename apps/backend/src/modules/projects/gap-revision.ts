import { jsonSnapshot, type WorkspaceDb } from "./workspace-access.js";

/** Freeze the exact evidence manifest used by an assessment or derived question. */
export async function recordGapPacket(tx: WorkspaceDb, gapId: string, actorId: string) {
  const gap = await tx.researchGap.findUniqueOrThrow({ where: { id: gapId } });
  if (!gap.projectId) return null;
  const existing = await tx.projectWorkspaceRevision.findFirst({ where: { projectId: gap.projectId, entityKind: "GAP", entityId: gap.id, version: gap.version } });
  if (existing) return existing;
  const evidence = await tx.gapEvidenceRecord.findMany({ where: { gapId }, orderBy: { id: "asc" } });
  return tx.projectWorkspaceRevision.create({ data: { projectId: gap.projectId, entityKind: "GAP", entityId: gapId, version: gap.version, actorId, snapshot: jsonSnapshot({ ...gap, evidenceManifest: evidence }) } });
}

/** Call under the project lock before changing an extraction or inclusion decision. */
export async function invalidateSourceAssessments(tx: WorkspaceDb, projectId: string, actorId: string, source: { paperId?: string; evidenceItemId?: string }) {
  const links = await tx.gapEvidenceRecord.findMany({ where: source, select: { gapId: true } });
  const gaps = await tx.researchGap.findMany({ where: { projectId, id: { in: links.map(link => link.gapId) } }, orderBy: { id: "asc" } });
  for (const gap of gaps) {
    await tx.$queryRaw`SELECT id FROM research_gaps WHERE id=${gap.id}::uuid FOR UPDATE`;
    await recordGapPacket(tx, gap.id, actorId);
    await tx.researchGap.update({ where: { id: gap.id }, data: { version: { increment: 1 }, assessmentStatus: "NEEDS_MORE_EVIDENCE", assessmentRationale: "A linked source or extraction changed; review the current evidence revisions.", validationStatus: "CANDIDATE" } });
    await recordGapPacket(tx, gap.id, actorId);
    await tx.projectActivity.create({ data: { projectId, actorId, type: "GAP_EVIDENCE_CHANGED", entityKind: "GAP", entityId: gap.id, metadata: source } });
  }
}
