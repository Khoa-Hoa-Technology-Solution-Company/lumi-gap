import { env } from "../../config/env.js";
import { hashKey } from "../../infrastructure/cache.js";
import { logger } from "../../infrastructure/logger.js";
import { cachedGenerateJSON } from "../llm/llm.run.js";
import { PaperModel } from "./models/paper.model.js";
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
      seenIds.add(String(paper._id));
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
            paperId: String(paper._id),
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
        await PaperModel.updateOne(
          { _id: paper._id },
          {
            $set: {
              aiAnalysis,
              keywords: mergeAiKeyTerms(
                (paper.keywords ?? []).map((k) => ({
                  keywordName: k.keywordName,
                  detectedBy: k.detectedBy,
                  confidence: k.confidence ?? undefined,
                })),
                aiAnalysis.keyTerms,
              ),
            },
          },
        );
        analyzed++;
      } catch (err) {
        failed++;
        logger.warn({ err, paperId: String(paper._id) }, "paper ai analysis failed");
      }
    }
  }

  logger.info({ analyzed, failed, skipped }, "paper ai analysis run completed");
  return { analyzed, failed, skipped, promptVersion: PAPER_AI_ANALYSIS_PROMPT_VERSION };
}

async function findAnalysisCandidates(limit: number, force: boolean, seenIds: Set<string>) {
  const filter: Record<string, unknown> = {
    dataStatus: "active",
    isAiAnalyzable: true,
    abstractText: { $type: "string", $ne: "" },
  };
  if (seenIds.size > 0) filter._id = { $nin: [...seenIds] };
  if (!force) {
    filter.$or = [
      { aiAnalysis: { $exists: false } },
      { "aiAnalysis.analysisPromptVersion": { $ne: PAPER_AI_ANALYSIS_PROMPT_VERSION } },
    ];
  }
  return PaperModel.find(filter)
    .sort({ citationCount: -1, publicationYear: -1 })
    .limit(limit)
    .select("title abstractText keywords citationCount publicationYear")
    .lean();
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
