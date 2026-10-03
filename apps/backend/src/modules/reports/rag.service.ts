import { env } from "../../config/env.js";
import { logger } from "../../infrastructure/logger.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { gapsService } from "../gaps/gaps.service.js";
import { getEmbeddingProvider } from "../embeddings/embedding.factory.js";
import {
  generateJSON,
  generateWithTools,
  LlmTruncationError,
  LlmContentError,
} from "../llm/gemini.client.js";
import { buildLlmCacheKey, cachedGenerate } from "../llm/llm.run.js";
import { assertCitationsInRange as assertGroundedCitationsInRange } from "../llm/grounding.js";
import { MCP_TOOL_DEFS } from "../mcp/mcp.tools.js";
import { executeMcpTool } from "../mcp/mcp.executor.js";
import { notificationService } from "../notifications/notification.service.js";
import { collectReportEvidence } from "./report.evidence.js";
import { assertGapReferences, assertSourceLocators } from "../knowledge/knowledge.grounding.js";
import {
  buildReportPrompt,
  PROMPT_VERSION,
  REPORT_SYSTEM_PROMPT,
  resolveReportLanguage,
  type EvidencePaper,
  type ReportLanguage,
  type ReportLlmOutput,
} from "./report.prompt.js";

const DEEP_ANALYSIS_SYSTEM_PROMPT = [
  REPORT_SYSTEM_PROMPT,
  "",
  "ADDITIONAL RULES FOR TOOL-ASSISTED MODE:",
  "- You MAY call tools (search_papers, get_trends, count_papers) to gather ADDITIONAL context.",
  "- BUT [n] citations ALWAYS refer to the numbered EVIDENCE PAPERS provided in the user message.",
  "  Never cite or invent papers discovered via tools — use tool results only to inform analysis.",
  '- Return the SAME JSON format: { "markdown": "...", "gaps": [...] }.',
  "- Return ONLY valid JSON. No markdown fences, no commentary.",
].join("\n");

export interface ReportJob {
  reportId: string;
}

/**
 * The full RAG pipeline for one report. Runs inside report.worker (NEVER in a
 * request handler). Throws on transient failures so BullMQ retries; marks the
 * report `failed` only when the job has exhausted its attempts (worker decides).
 */
export async function runRagPipeline(job: ReportJob): Promise<void> {
  const parsedId = parseDatabaseId(job.reportId);
  const report = parsedId ? await getPrisma().report.findUnique({ where: parsedId.kind === "uuid" ? { id: parsedId.value } : { legacyMongoId: parsedId.value } }) : null;
  if (!report) {
    logger.warn({ reportId: job.reportId }, "report vanished before processing");
    return;
  }
  if (report.status === "ready") return; // replayed job — already done

  await getPrisma().report.update({ where: { id: report.id }, data: { status: "generating" } });

  // Embed the question for passage ranking even with a fixed paper set.
  // Failure degrades to text retrieval without expanding the user's scope.
  const t0 = Date.now();
  const selectedLinks = await getPrisma().reportPaper.findMany({ where: { reportId: report.id, kind: "selected" }, orderBy: { position: "asc" } });
  const selectedRows = await getPrisma().paper.findMany({ where: { id: { in: selectedLinks.map((link) => link.paperId) } }, select: { id: true, legacyMongoId: true } });
  const selectedById = new Map(selectedRows.map((row) => [row.id, publicDatabaseId(row)]));
  const selectedPaperIds = selectedLinks.map((link) => selectedById.get(link.paperId) ?? link.paperId);
  let queryVector: number[] | undefined;
  {
    try {
      queryVector = await getEmbeddingProvider().embed(report.query);
    } catch (err) {
      logger.warn({ err, reportId: publicDatabaseId(report) }, "report embedding failed; using text fallback retrieval");
    }
  }
  const embeddingMs = Date.now() - t0;

  // ② Build the fixed evidence pack: user-selected papers first, retrieval fills the rest.
  const t1 = Date.now();
  const evidence = await collectReportEvidence({
    queryText: report.query,
    queryVector,
    selectedPaperIds,
    yearFrom: report.yearFrom ?? undefined,
    yearTo: report.yearTo ?? undefined,
    scopeFilters: normalizeReportScopeFilters(report.scopeFilters),
    fillWithRetrieved: selectedPaperIds.length === 0,
  });
  const papers = evidence.papers;
  await getPrisma().report.update({ where: { id: report.id }, data: { evidenceSnapshot: papers as never } });
  const searchMs = Date.now() - t1;

  // ③ No evidence → permanent failure (retrying won't grow the corpus).
  if (papers.length === 0) {
    await markReportFailed(job.reportId, "Not enough corpus data for this query — try a broader question.");
    await auditRagRun(report, { embeddingMs, searchMs, llmMs: 0, cacheHit: false, papers: [] });
    return;
  }

  // ④ Cache lookup (§6 formula). Hit → skip Gemini entirely.
  // Model tier: deepAnalysis → Pro + tools (slowest); fast → Flash (fastest);
  // otherwise Pro classic (default). Cache key includes `model`, so fast (Flash)
  // and standard (Pro) outputs never collide.
  const model =
    !report.deepAnalysis && report.fast ? env.GEMINI_MODEL_FAST : env.GEMINI_MODEL_DEEP;
  const language = (report.language ?? "auto") as ReportLanguage;
  const resolvedLanguage = resolveReportLanguage(language, report.query, report.topic ?? undefined);
  const prompt = buildReportPrompt(report.query, papers, {
    topic: report.topic ?? undefined,
    language,
  });
  logger.info(
    {
      reportId: publicDatabaseId(report),
      promptVersion: PROMPT_VERSION,
      language,
      resolvedLanguage,
    },
    "report prompt prepared",
  );
  const keyParts = {
    query: report.query,
    topic: report.topic ?? null,
    language,
    resolvedLanguage,
    yearFrom: report.yearFrom ?? null,
    yearTo: report.yearTo ?? null,
    scopeFilters: normalizeReportScopeFilters(report.scopeFilters),
    deepAnalysis: Boolean(report.deepAnalysis),
    selectedPaperIds: evidence.selectedPaperIds,
    retrievedPaperIds: papers.map((p) => p.id),
  };
  const inputHash = report.deepAnalysis ? `${DEEP_ANALYSIS_SYSTEM_PROMPT}\n${prompt}` : `${REPORT_SYSTEM_PROMPT}\n${prompt}`;
  const effectiveCacheKey = buildLlmCacheKey({
    task: "report",
    promptVersion: PROMPT_VERSION,
    model,
    keyParts,
    inputHash,
  });
  let cacheHit = false;

  // ⑤ Generate (only on cache miss).
  const t2 = Date.now();
  const output = await cachedGenerate<ReportLlmOutput>({
    task: "report",
    promptVersion: PROMPT_VERSION,
    keyParts,
    model,
    inputHash,
    onCacheHit: () => {
      cacheHit = true;
    },
    validate: (candidate) => {
      if (!candidate || typeof candidate.markdown !== "string") throw new LlmContentError("Report is missing markdown");
      assertCitationsInRange(candidate.markdown, papers.length);
      assertSourceLocators(candidate.markdown, papers);
      assertGapReferences(candidate.gaps ?? [], papers);
      return candidate;
    },
    generate: async (routedModel) => {
      if (report.deepAnalysis) {
      // D2: Gemini may call tools to gather extra context, but it cites from the
      // SAME pre-fetched `papers[]` evidence list as classic mode — so citations,
      // groundingPaperIds, and gap supportingEvidence all map to one paper set.
      // On truncation OR malformed content, fall back to classic RAG so the report
      // still completes rather than failing after 5 retries.
      try {
        const rawJson = await generateWithTools(
          prompt +
            "\n\n---\n\nYou MAY call tools to gather additional context before writing, " +
            "but cite ONLY from the numbered EVIDENCE PAPERS listed above.",
          MCP_TOOL_DEFS,
          (call) =>
            executeMcpTool(call, {
              reportId: publicDatabaseId(report),
              userId: String(report.userId),
            }),
          {
            model: routedModel,
            system: DEEP_ANALYSIS_SYSTEM_PROMPT,
            temperature: 0.3,
            maxOutputTokens: env.DEEP_ANALYSIS_MAX_OUTPUT_TOKENS,
            maxTurns: env.DEEP_ANALYSIS_MAX_TURNS,
          },
        );
        const fenceMatch = rawJson.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        const stripped = (fenceMatch?.[1] != null ? fenceMatch[1] : rawJson).trim();
        let parsed: ReportLlmOutput;
        try {
          parsed = JSON.parse(stripped) as ReportLlmOutput;
        } catch {
          throw new LlmContentError("Deep analysis returned non-JSON output");
        }
        if (!parsed || typeof parsed.markdown !== "string" || parsed.markdown.length < 50) {
          throw new LlmContentError("Deep analysis LLM returned malformed report JSON");
        }
        assertCitationsInRange(parsed.markdown, papers.length);
        return parsed;
      } catch (err) {
        // Only truncation / malformed content fall back; real errors propagate.
        if (!(err instanceof LlmTruncationError || err instanceof LlmContentError)) throw err;
        logger.warn(
          { reportId: publicDatabaseId(report), reason: err.name },
          "deepAnalysis failed — falling back to classic RAG",
        );
        const fallback = await generateJSON<ReportLlmOutput>(
          prompt,
          { model: routedModel, system: REPORT_SYSTEM_PROMPT, temperature: 0.3, maxOutputTokens: env.REPORT_MAX_OUTPUT_TOKENS },
        );
        if (!fallback || typeof fallback.markdown !== "string" || fallback.markdown.length < 50) {
          throw new LlmContentError("Fallback classic RAG also returned malformed report JSON");
        }
        assertCitationsInRange(fallback.markdown, papers.length);
        return fallback;
      }
    }
      // Classic path — existing generateJSON call:
      const output = await generateJSON<ReportLlmOutput>(prompt, {
        model: routedModel,
        system: REPORT_SYSTEM_PROMPT,
        temperature: 0.3,
        maxOutputTokens: env.REPORT_MAX_OUTPUT_TOKENS,
      });
      if (!output || typeof output.markdown !== "string" || output.markdown.length < 50) {
        // Malformed JSON won't self-heal on retry → fail fast (LlmContentError).
        throw new LlmContentError("LLM returned malformed report JSON");
      }
      assertCitationsInRange(output.markdown, papers.length);
      return output;
    },
  });
  const llmMs = Date.now() - t2;

  // ⑥ Persist the finished report.
  const researchGaps = (output.gaps ?? []).slice(0, 6).map((g) => ({
      title: String(g.title ?? "").slice(0, 200),
      description: String(g.description ?? ""),
      rationale: String(g.rationale ?? ""),
      // Map 1-based evidence numbers back to real paper ids; drop out-of-range.
      supportingPaperIds: (g.supportingEvidence ?? [])
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= papers.length)
        .map((n) => papers[n - 1]!.id),
      confidence: clamp01(g.confidence),
      probe: normalizeProbe(g.probe),
    }));
  await getPrisma().$transaction(async (tx) => {
    await tx.report.update({ where: { id: report.id }, data: { markdown: output.markdown, researchGapSnapshots: researchGaps as never, modelVersion: model, promptVersion: PROMPT_VERSION, cacheKey: effectiveCacheKey, status: "ready", completedAt: new Date(), errorMessage: null } });
    await tx.reportPaper.deleteMany({ where: { reportId: report.id, kind: "grounding" } });
    const resolved = await Promise.all(papers.map(async (paper) => { const parsed = parseDatabaseId(paper.id); if (!parsed) return null; return getPrisma().paper.findUnique({ where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value }, select: { id: true } }); }));
    await tx.reportPaper.createMany({ data: resolved.flatMap((paper, position) => paper ? [{ reportId: report.id, paperId: paper.id, kind: "grounding", position }] : []), skipDuplicates: true });
  });

  // If it was a cache hit, refund the credits charged during create()
  if (cacheHit && report.creditTransactionId) {
    const { creditService } = await import("../credits/credit.service.js");
    await creditService.refundCreditsOnce({
      transactionId: report.creditTransactionId.toString(),
      reason: "Report cache hit",
    });
    await getPrisma().report.update({ where: { id: report.id }, data: { creditRefundedAt: new Date() } });
  }

  // ⑦ Audit trail.
  await auditRagRun(report, { embeddingMs, searchMs, llmMs, cacheHit, papers });

  await notificationService
    .create({
      userId: report.userId,
      title: "Report ready",
      message: `Your AI report "${report.topic || report.query}" is ready to read.`,
      type: "report_ready",
      targetKind: "report",
      targetId: publicDatabaseId(report),
    })
    .catch((err) =>
      logger.warn({ err, reportId: publicDatabaseId(report) }, "report-ready notification failed (non-fatal)"),
    );

  // ⑧ Fan-out gaps into research_gaps collection (non-fatal).
  await gapsService
    .fanOutGapsFromReport({
      _id: publicDatabaseId(report),
      userId: report.userId,
      projectId: report.projectId,
      projectPaperIds: selectedPaperIds,
      evidencePaperIds: papers.map((paper) => paper.id),
      query: report.query,
      researchGaps: researchGaps.map((raw) => {
        const g = raw as {
          title?: string;
          description?: string;
          rationale?: string;
          supportingPaperIds?: unknown[];
          confidence?: unknown;
          probe?: unknown;
        };
        return {
          title: String(g.title ?? ""),
          description: String(g.description ?? ""),
          rationale: String(g.rationale ?? ""),
          supportingPaperIds: g.supportingPaperIds ?? [],
          confidence: Number(g.confidence ?? 0.5),
          probe: normalizeProbe(g.probe),
        };
      }),
    })
    .catch((err) =>
      logger.warn({ err, reportId: publicDatabaseId(report) }, "gap fan-out failed (non-fatal)"),
    );

  logger.info(
    { reportId: publicDatabaseId(report), papers: papers.length, embeddingMs, searchMs, llmMs, cacheHit },
    "report ready",
  );
}

function normalizeReportScopeFilters(scopeFilters: unknown) {
  if (!scopeFilters || typeof scopeFilters !== "object") return undefined;
  const source = scopeFilters as Record<string, unknown>;
  const normalized: Record<string, string[]> = {};
  for (const key of [
    "paperKinds",
    "openAccessStatuses",
    "providers",
    "sources",
    "languages",
    "citationBands",
    "domains",
    "fields",
    "subfields",
    "topics",
    "domainIds",
    "fieldIds",
    "subfieldIds",
    "topicIds",
  ]) {
    const values = source[key];
    if (!Array.isArray(values)) continue;
    const cleaned = Array.from(new Set(values.map(String).map((value) => value.trim()).filter(Boolean)));
    if (cleaned.length > 0) normalized[key] = cleaned;
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

/** Mark a report failed — called by the worker when retries are exhausted. */
export async function markReportFailed(reportId: string, message: string): Promise<void> {
  const parsed = parseDatabaseId(reportId);
  if (!parsed) return;
  const current = await getPrisma().report.findUnique({ where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value } });
  if (!current || current.status === "ready") return;
  const claimed = await getPrisma().report.updateMany({ where: { id: current.id, status: { not: "ready" }, creditRefundedAt: null }, data: { status: "failed", errorMessage: message.slice(0, 500), creditRefundedAt: new Date() } });

  if (claimed.count && current.creditTransactionId) {
    const { creditService } = await import("../credits/credit.service.js");
    await creditService.refundCreditsOnce({
      transactionId: current.creditTransactionId,
      reason: `Report generation failed: ${message.slice(0, 100)}`,
    });
  } else if (!claimed.count) {
    await getPrisma().report.updateMany({ where: { id: current.id, status: { not: "ready" } }, data: { status: "failed", errorMessage: message.slice(0, 500) } });
  }
}

async function auditRagRun(
  report: { id: string; userId: string; query: string; yearFrom?: number | null; yearTo?: number | null },
  run: {
    embeddingMs: number;
    searchMs: number;
    llmMs: number;
    cacheHit: boolean;
    papers: EvidencePaper[];
  },
): Promise<void> {
  try {
    const query = await getPrisma().ragQuery.create({ data: {
      reportId: report.id,
      userId: report.userId,
      queryText: report.query,
      topK: env.REPORT_TOP_K,
      yearFrom: report.yearFrom,
      yearTo: report.yearTo,
      embeddingMs: run.embeddingMs,
      searchMs: run.searchMs,
      llmMs: run.llmMs,
      cacheHit: run.cacheHit,
    } });
    const resolved = await Promise.all(run.papers.map(async (paper) => { const parsed = parseDatabaseId(paper.id); if (!parsed) return null; return getPrisma().paper.findUnique({ where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value }, select: { id: true } }); }));
    await getPrisma().ragQueryResult.createMany({ data: resolved.flatMap((paper, index) => paper ? [{ queryId: query.id, paperId: paper.id, score: run.papers[index]!.score, rank: index + 1 }] : []), skipDuplicates: true });
  } catch (err) {
    logger.warn({ err }, "rag audit write failed (non-fatal)");
  }
}

function clamp01(x: unknown): number {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function normalizeProbe(raw: unknown):
  | { topicA: string; topicB: string; yearFrom?: number; yearTo?: number }
  | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const candidate = raw as {
    topicA?: unknown;
    topicB?: unknown;
    yearFrom?: unknown;
    yearTo?: unknown;
  };
  const topicA = typeof candidate.topicA === "string" ? candidate.topicA.trim() : "";
  const topicB = typeof candidate.topicB === "string" ? candidate.topicB.trim() : "";
  if (!topicA || !topicB) return undefined;

  const yearFrom = Number(candidate.yearFrom);
  const yearTo = Number(candidate.yearTo);
  return {
    topicA,
    topicB,
    ...(Number.isInteger(yearFrom) ? { yearFrom } : {}),
    ...(Number.isInteger(yearTo) ? { yearTo } : {}),
  };
}

/**
 * Grounding guard: every [n] cited in the markdown must point at a real evidence
 * paper. An out-of-range citation (hallucinated, or injected via a malicious
 * abstract) fails the report rather than shipping fake grounding. Applied to BOTH
 * classic and deepAnalysis output so deep mode is not the weaker path.
 */
function assertCitationsInRange(markdown: string, papersLength: number): void {
  assertGroundedCitationsInRange(markdown, papersLength, (message) => new LlmContentError(message));
}
