import { getPrisma } from "../../infrastructure/database/prisma.js";
import { structuredEvidenceItems } from "./structured-evidence.js";

/**
 * The corpus paper holding structured evidence for `paperId` within a gap's scope. A gap created by
 * hand points at its corpus; an AI-generated gap only knows its project, so every literature corpus
 * of that project is searched (most recently updated first, preferring rows with extracted evidence).
 */
export async function findGapCorpusPaper(gap: { corpusId: string | null; projectId: string | null }, paperId: string) {
  const prisma = getPrisma();
  if (gap.corpusId) return prisma.corpusPaper.findUnique({ where: { corpusId_paperId: { corpusId: gap.corpusId, paperId } } });
  if (!gap.projectId) return null;
  const corpora = await prisma.literatureCorpus.findMany({ where: { projectId: gap.projectId }, select: { id: true }, orderBy: { updatedAt: "desc" } });
  if (!corpora.length) return null;
  const rows = await prisma.corpusPaper.findMany({ where: { corpusId: { in: corpora.map((corpus) => corpus.id) }, paperId, included: true } });
  const rank = new Map(corpora.map((corpus, index) => [corpus.id, index]));
  rows.sort((a, b) => Number(structuredEvidenceItems(b.evidence).length > 0) - Number(structuredEvidenceItems(a.evidence).length > 0) || (rank.get(a.corpusId) ?? 0) - (rank.get(b.corpusId) ?? 0));
  return rows[0] ?? null;
}
