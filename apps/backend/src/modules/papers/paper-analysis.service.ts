import { env } from "../../config/env.js";
import { hashKey } from "../../infrastructure/cache.js";
import { publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { cachedGenerateJSON } from "../llm/llm.run.js";
import {
  buildPaperAnalysisPrompt,
  PAPER_AI_ANALYSIS_PROMPT_VERSION,
  PAPER_ANALYSIS_SYSTEM_PROMPT,
  sanitizePaperAnalysis,
  withAnalysisMetadata,
  type PaperAnalysisContent,
} from "./paper-ai-analysis.js";

export interface RunPaperAnalysisJob {
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
    const papers = await findAnalysisCandidates(Math.min(batchSize, remaining), Boolean(job.force), seenIds);
    if (papers.length === 0) break;

    for (const paper of papers) {
      seenIds.add(paper.id);
      try {
        const title = String(paper.title ?? "");
        const abstractText = String(paper.abstractText ?? "");
        if (!title.trim() || !abstractText.trim()) {
          skipped++;
          continue;
        }
        const prompt = buildPaperAnalysisPrompt({ title, abstractText });
        const raw = await cachedGenerateJSON<PaperAnalysisContent>({
          task: "extract",
          promptVersion: PAPER_AI_ANALYSIS_PROMPT_VERSION,
          keyParts: {
            paperId: publicDatabaseId(paper),
            abstractHash: hashKey({ title, abstractText }),
          },
          model: env.GEMINI_MODEL_FAST,
          bypassCache: Boolean(job.force),
          prompt,
          validate: (candidate) => {
            const sanitized = sanitizePaperAnalysis(candidate);
            const hasContent =
              sanitized.summary !== null ||
              sanitized.methods !== null ||
              sanitized.dataset !== null ||
              sanitized.findings.length > 0 ||
              sanitized.limitations.length > 0 ||
              sanitized.contributions.length > 0 ||
              sanitized.futureWork.length > 0 ||
              sanitized.keyTerms.length > 0;
            if (!hasContent) throw new Error("LLM returned empty paper analysis");
            return sanitized;
          },
          options: {
            system: PAPER_ANALYSIS_SYSTEM_PROMPT,
            temperature: 0,
            maxOutputTokens: env.PAPER_ANALYSIS_MAX_OUTPUT_TOKENS,
          },
        });
        const aiAnalysis = withAnalysisMetadata(raw);
        const mergedKeywords = mergeAiKeyTerms(
          paper.keywords.map((keyword) => ({
            keywordName: keyword.keywordName,
            detectedBy: keyword.detectedBy,
            confidence: keyword.confidence ?? undefined,
          })),
          aiAnalysis.keyTerms,
        );
        await getPrisma().$transaction(async (tx) => {
          await tx.paper.update({ where: { id: paper.id }, data: { aiAnalysis: aiAnalysis as never } });
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
      }
    }
  }

  logger.info({ analyzed, failed, skipped }, "paper ai analysis run completed");
  return { analyzed, failed, skipped, promptVersion: PAPER_AI_ANALYSIS_PROMPT_VERSION };
}

async function findAnalysisCandidates(limit: number, force: boolean, seenIds: Set<string>) {
  const prisma = getPrisma();
  const candidates = await prisma.paper.findMany({
    where: {
      dataStatus: "active",
      isAiAnalyzable: true,
      abstractText: { not: null },
      ...(seenIds.size ? { id: { notIn: [...seenIds] } } : {}),
    },
    orderBy: [{ citationCount: "desc" }, { publicationYear: "desc" }],
    take: Math.max(limit * 8, limit),
  });
  const selected = candidates.filter((paper) => {
    if (!paper.abstractText?.trim()) return false;
    if (force || !paper.aiAnalysis || typeof paper.aiAnalysis !== "object") return true;
    return (paper.aiAnalysis as Record<string, unknown>).analysisPromptVersion !== PAPER_AI_ANALYSIS_PROMPT_VERSION;
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
