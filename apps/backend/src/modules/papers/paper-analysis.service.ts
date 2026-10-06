import { env } from "../../config/env.js";
import { publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { indexPaper } from "../knowledge/knowledge.ingest.js";
import { RAG_INDEX_VERSION } from "../knowledge/knowledge.text.js";
import { LlmQuotaError } from "../llm/gemini.client.js";

export interface RunPaperAnalysisJob {
  userId?: string;
  paperIds?: string[];
  batchSize?: number;
  maxPapers?: number;
  force?: boolean;
}

export interface RunPaperAnalysisResult {
  analyzed: number;
  failed: number;
  skipped: number;
  promptVersion: string;
}

export async function runPaperAnalysis(job: RunPaperAnalysisJob = {}): Promise<RunPaperAnalysisResult> {
  const batchSize = Math.min(job.batchSize ?? env.PAPER_ANALYSIS_BATCH_SIZE, env.PAPER_ANALYSIS_BATCH_SIZE);
  const maxPapers = Math.min(job.maxPapers ?? env.PAPER_ANALYSIS_MAX_PAPERS_PER_RUN, env.PAPER_ANALYSIS_MAX_PAPERS_PER_RUN);
  let analyzed = 0;
  let failed = 0;
  let skipped = 0;
  const seenIds = new Set<string>();

  while (analyzed + failed + skipped < maxPapers) {
    const remaining = maxPapers - analyzed - failed - skipped;
    const papers = await findAnalysisCandidates(Math.min(batchSize, remaining), Boolean(job.force), seenIds, job.paperIds);
    if (papers.length === 0) break;

    for (const paper of papers) {
      seenIds.add(paper.id);
      try {
        if (!paper.title.trim() || (!paper.abstractText?.trim() && !paper.pdfPath && !paper.openAccessUrl)) {
          skipped++;
          continue;
        }
        const aiAnalysis = await indexPaper(paper.id, Boolean(job.force)) as { keyTerms?: string[] };
        const mergedKeywords = mergeAiKeyTerms(
          paper.keywords.map((keyword) => ({
            keywordName: keyword.keywordName,
            detectedBy: keyword.detectedBy,
            confidence: keyword.confidence ?? undefined,
          })),
          aiAnalysis.keyTerms ?? [],
        );
        await getPrisma().$transaction(async (tx) => {
          const existingCount = paper.keywords.length;
          const additions = mergedKeywords.slice(existingCount);
          if (additions.length) {
            await tx.paperKeyword.createMany({
              data: additions.map((keyword, index) => ({
                paperId: paper.id,
                keywordName: keyword.keywordName ?? "",
                detectedBy: keyword.detectedBy ?? "ai",
                confidence: keyword.confidence,
                position: existingCount + index,
              })),
              skipDuplicates: true,
            });
          }
        });
        analyzed++;
      } catch (err) {
        failed++;
        logger.warn({ err, paperId: publicDatabaseId(paper) }, "paper ai analysis failed");
        if (err instanceof LlmQuotaError) throw err; // Stop the batch when the shared project quota is exhausted.
        if (job.paperIds?.length) throw err; // Targeted jobs must fail so BullMQ retries them.
      }
    }
  }

  logger.info({ analyzed, failed, skipped }, "paper ai analysis run completed");
  return { analyzed, failed, skipped, promptVersion: RAG_INDEX_VERSION };
}

async function findAnalysisCandidates(limit: number, force: boolean, seenIds: Set<string>, paperIds?: string[]) {
  const prisma = getPrisma();
  const candidates = await prisma.paper.findMany({
    where: {
      dataStatus: "active",
      id: { ...(paperIds?.length ? { in: paperIds } : {}), ...(seenIds.size ? { notIn: [...seenIds] } : {}) },
      ...(force ? {} : { OR: [
        { document: { is: null } },
        { document: { is: { indexVersion: { not: RAG_INDEX_VERSION } } } },
        { document: { is: { status: "queued" } } },
        { document: { is: { status: { in: ["failed", "processing"] }, updatedAt: { lt: new Date(Date.now() - 30 * 60 * 1000) } } } },
      ] }),
    },
    orderBy: [{ citationCount: "desc" }, { publicationYear: "desc" }],
    take: Math.max(limit * 8, limit),
  });
  const selected = candidates.filter((paper) => {
    return Boolean(paper.abstractText?.trim() || paper.pdfPath || paper.openAccessUrl);
  }).slice(0, limit);
  const keywords = await prisma.paperKeyword.findMany({
    where: { paperId: { in: selected.map((paper) => paper.id) } },
    orderBy: { position: "asc" },
  });
  return selected.map((paper) => ({
    ...paper,
    keywords: keywords.filter((keyword) => keyword.paperId === paper.id),
  }));
}

function mergeAiKeyTerms(
  existing: Array<{ keywordName?: string; detectedBy?: string; confidence?: number }>,
  keyTerms: string[],
) {
  const seen = new Set(existing.map((k) => String(k.keywordName ?? "").trim().toLowerCase()).filter(Boolean));
  const additions = keyTerms
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length > 0 && !seen.has(term))
    .slice(0, 8)
    .map((keywordName) => ({ keywordName, detectedBy: "ai" as const, confidence: 0.7 }));
  return [...existing, ...additions];
}
