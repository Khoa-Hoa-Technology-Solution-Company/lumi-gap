import { env } from "../../config/env.js";
import mongoose from "mongoose";
import { logger } from "../../infrastructure/logger.js";
import { AppError } from "../../common/exceptions/app-error.js";
import type {
  GapProbe,
  GapDirections,
  PreviewGapEvidenceResponse,
  GapEvidenceMode,
} from "@trend/shared-types";
import { creditService } from "../credits/credit.service.js";
import { getEmbeddingProvider } from "../embeddings/embedding.factory.js";
import { LlmContentError } from "../llm/gemini.client.js";
import { cachedGenerateJSON } from "../llm/llm.run.js";
import { retrieve } from "../retrieval/retriever.js";
import { PaperModel } from "../papers/models/paper.model.js";
import { computeGapEvidence } from "./gap-evidence.js";
import {
  fillMissingYears,
  truncateToCompleteYears,
  yoyGrowthPct,
} from "../trends/trend.formulas.js";
import { ResearchGapModel } from "./models/research-gap.model.js";
import {
  GapDirectionsModel,
  type GapDirectionsDoc,
} from "./models/gap-directions.model.js";
import {
  buildDirectionsPrompt,
  buildDirectionsEvidenceHash,
  sanitizeDirections,
  DIRECTIONS_PROMPT_VERSION,
  DIRECTIONS_SYSTEM_PROMPT,
  type DirectionsRaw,
} from "./gaps-directions.js";
import { GapAnalysisModel } from "./models/gap-analysis.model.js";
import { gapsQueue } from "../../infrastructure/queue.js";
import {
  buildGapsCacheKey,
  buildGapsPrompt,
  GAP_PROMPT_VERSION,
  GAPS_SYSTEM_PROMPT,
  type GapEvidencePaper,
  type GapsLlmOutput,
} from "./gaps.prompt.js";
import type {
  AnalyzeGapDto,
  ListGapsQuery,
  PatchGapDto,
  PreviewGapEvidenceDto,
} from "./dto/gaps.schema.js";
import {
  canAccessGap,
  toGapListItem,
  type GapListDoc,
} from "./gap-presenter.js";
import { projectService } from "../projects/project.service.js";

export interface GapJob {
  analysisId: string;
}

function normalizeTopicStr(t: string): string {
  return t.trim().toLowerCase();
}

function clamp01(x: unknown): number {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

const GAP_WINDOW_YEARS = 5;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Filter: active papers whose title OR abstract contains EVERY phrase (concept AND).
 *  The probe is LLM-generated free text, so it is escaped before becoming a regex. */
function conceptFilter(
  phrases: string[],
  years: { yearFrom?: number; yearTo?: number; paperIds?: string[] },
): Record<string, unknown> {
  const filter: Record<string, unknown> = { dataStatus: "active" };
  if (years.paperIds && years.paperIds.length > 0) {
    filter._id = {
      $in: years.paperIds.map((id) => new mongoose.Types.ObjectId(id)),
    };
  }
  if (years.yearFrom !== undefined || years.yearTo !== undefined) {
    filter.publicationYear = {
      ...(years.yearFrom !== undefined ? { $gte: years.yearFrom } : {}),
      ...(years.yearTo !== undefined ? { $lte: years.yearTo } : {}),
    };
  }
  filter.$and = phrases.map((p) => {
    const rx = new RegExp(escapeRegex(p.trim()), "i");
    return { $or: [{ title: rx }, { abstractText: rx }] };
  });
  return filter;
}

/** YoY growth % of a free-text concept over the analysis window (0 if too sparse). */
async function conceptGrowthPct(
  phrase: string,
  years: { yearFrom?: number; yearTo?: number; paperIds?: string[] },
): Promise<number> {
  const now = new Date().getFullYear();
  const yearTo = years.yearTo ?? now;
  const yearFrom = years.yearFrom ?? yearTo - GAP_WINDOW_YEARS;
  const rows = await PaperModel.aggregate<{ _id: number; count: number }>([
    {
      $match: conceptFilter([phrase], {
        yearFrom,
        yearTo,
        paperIds: years.paperIds,
      }),
    },
    { $group: { _id: "$publicationYear", count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  const series = fillMissingYears(
    rows.map((r) => ({ year: r._id, count: r.count })),
    yearFrom,
    yearTo,
  );
  return yoyGrowthPct(
    truncateToCompleteYears(series, Math.min(yearTo, now - 1)),
  );
}

/**
 * Verify an LLM-proposed gap against the corpus (intersection count + parent
 * volumes + parent growth) → deterministic evidence. Concepts are matched by
 * escaped-regex on title+abstract (the probe is free text, not a canonical topic
 * name). Returns null when the probe is missing so the gap degrades gracefully.
 */
async function scoreGapEvidence(
  probe: GapProbe | undefined,
  paperIds?: string[],
) {
  if (!probe?.topicA || !probe?.topicB) return null;
  const years = { yearFrom: probe.yearFrom, yearTo: probe.yearTo, paperIds };
  const [intersectionCount, aCount, bCount, growthA, growthB] =
    await Promise.all([
      PaperModel.countDocuments(
        conceptFilter([probe.topicA, probe.topicB], years),
      ),
      PaperModel.countDocuments(conceptFilter([probe.topicA], years)),
      PaperModel.countDocuments(conceptFilter([probe.topicB], years)),
      conceptGrowthPct(probe.topicA, years),
      conceptGrowthPct(probe.topicB, years),
    ]);
  const parentTrend =
    growthA >= growthB
      ? { topic: probe.topicA, growthRatePct: growthA }
      : { topic: probe.topicB, growthRatePct: growthB };
  const ev = computeGapEvidence(
    {
      intersectionCount,
      parentCounts: { a: aCount, b: bCount },
      parentRisingGrowthPct: parentTrend.growthRatePct,
    },
    {
      scarceAbs: env.GAP_SCARCE_ABS,
      scarcePct: env.GAP_SCARCE_PCT,
      parentRisingMin: env.GAP_PARENT_RISING_MIN,
    },
  );
  return { ...ev, probe, parentTrend };
}

function toDirectionsDto(d: GapDirectionsDoc): GapDirections {
  return {
    gapId: String(d.gapId),
    directions: (d.directions ?? []).map((x) => ({
      title: x.title,
      rationale: x.rationale ?? "",
      suggestedApproach: x.suggestedApproach ?? "",
      relatedPaperIds: (x.relatedPaperIds ?? []).map(String),
    })),
    model: d.model ?? "",
    updatedAt: (d as unknown as { updatedAt: Date }).updatedAt.toISOString(),
  };
}

async function loadProjectForGap(gap: { projectId?: unknown }) {
  if (!gap.projectId) return null;
  const { ProjectModel } = await import("../projects/models/project.model.js");
  return ProjectModel.findById(gap.projectId).lean();
}

async function assertCanReadGap(
  userId: string,
  gap: { userId?: unknown; projectId?: unknown },
): Promise<void> {
  if (canAccessGap(userId, gap as any)) return;
  const project = await loadProjectForGap(gap);
  if (canAccessGap(userId, gap as any, project as any)) return;
  throw AppError.notFound("Research gap not found");
}

export const gapsService = {
  /** Preview evidence without charging credits or calling the LLM. */
  async previewEvidence(
    userId: string,
    dto: PreviewGapEvidenceDto,
  ): Promise<PreviewGapEvidenceResponse> {
    const projectPaperIds = dto.projectId
      ? await projectService.getProjectPaperIdsForUser(dto.projectId, userId, "gap analysis")
      : undefined;
    const mode = dto.evidenceMode ?? "hybrid";
    let queryVector: number[] | undefined;
    let usedTextFallback = false;

    if (mode !== "selected") {
      try {
        queryVector = await getEmbeddingProvider().embed(dto.topic);
      } catch (err) {
        usedTextFallback = true;
        logger.warn({ err }, "gap evidence preview embedding failed; using text fallback");
      }
    }

    const evidence = await collectGapEvidence({
      topic: dto.topic,
      queryVector,
      selectedPaperIds: dto.selectedPaperIds,
      evidenceMode: mode,
      yearFrom: dto.yearFrom,
      yearTo: dto.yearTo,
      projectPaperIds,
    });
    const warnings = evidence.missingSelectedPaperIds.map(
      (id) => `Selected paper ${id} is unavailable in this evidence scope and was skipped.`,
    );
    if (usedTextFallback) {
      warnings.push("Semantic retrieval was unavailable, so keyword fallback was used.");
    }
    if (evidence.papers.length < 3) {
      warnings.push("Fewer than 3 evidence papers were found. Broaden the topic or year range.");
    }

    return {
      papers: evidence.papers.map(toPreviewGapPaper),
      selectedPaperIds: evidence.selectedPaperIds,
      retrievedPaperIds: evidence.retrievedPaperIds,
      maxEvidencePapers: env.GAPS_TOP_K,
      warnings,
    };
  },

  /** Create a queued analysis row, enqueue the BullMQ job, and return the id. */
  async enqueue(userId: string, dto: AnalyzeGapDto): Promise<string> {
    const analysisId = new mongoose.Types.ObjectId();
    if ((dto.selectedPaperIds?.length ?? 0) > env.GAPS_TOP_K) {
      throw AppError.badRequest(`Gap evidence cannot exceed ${env.GAPS_TOP_K} papers.`);
    }
    let projectPaperIds: string[] | undefined;
    if (dto.projectId) {
      projectPaperIds = await projectService.getProjectPaperIdsForUser(
        dto.projectId,
        userId,
        "gap analysis",
      );
    }
    if (dto.evidenceMode === "selected") {
      const evidence = await collectGapEvidence({
        topic: dto.topic,
        selectedPaperIds: dto.selectedPaperIds,
        evidenceMode: "selected",
        yearFrom: dto.yearFrom,
        yearTo: dto.yearTo,
        projectPaperIds,
      });
      if (evidence.papers.length < 3 || evidence.missingSelectedPaperIds.length > 0) {
        throw AppError.badRequest(
          "The reviewed evidence pack must contain at least 3 active papers in this scope.",
          { missingPaperIds: evidence.missingSelectedPaperIds },
        );
      }
    }

    const tx = await creditService.chargeCreditsChecked({
      userId,
      action: "generate_gaps",
      amount: 30,
      targetKind: "gap_analysis",
      targetId: analysisId.toString(),
      idempotencyKey: `gap_analysis:${analysisId}`,
    });

    const txId = tx?._id;

    try {
      const analysis = await GapAnalysisModel.create({
        _id: analysisId,
        userId,
        projectId: dto.projectId,
        topic: dto.topic,
        yearFrom: dto.yearFrom,
        yearTo: dto.yearTo,
        selectedPaperIds: dto.selectedPaperIds ?? [],
        evidenceMode: dto.evidenceMode ?? "auto",
        status: "queued",
        creditTransactionId: txId,
        creditCost: 30,
        creditAction: "generate_gaps",
      });
      await gapsQueue.add("gap-analysis", { analysisId: String(analysis._id) });
      return String(analysis._id);
    } catch (err) {
      if (txId) {
        await creditService.refundCreditsOnce({
          transactionId: txId.toString(),
          reason: "Failed to create gap analysis or enqueue job",
        });
      }
      throw err;
    }
  },

  /** Fetch one analysis the caller owns (poll target for the FE). */
  async getAnalysis(userId: string, analysisId: string) {
    const doc = await GapAnalysisModel.findOne({
      _id: analysisId,
      userId,
    }).lean();
    if (!doc) throw AppError.notFound("Gap analysis not found");
    return {
      id: String(doc._id),
      topic: doc.topic,
      status: doc.status,
      gapIds: doc.gapIds.map(String),
      errorMessage: doc.errorMessage,
      yearFrom: doc.yearFrom,
      yearTo: doc.yearTo,
      selectedPaperIds: doc.selectedPaperIds.map(String),
      evidenceMode: doc.evidenceMode,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  },

  /** Resume helper for FE reloads — returns the user's latest queued/analyzing run, if any. */
  async getActiveAnalysis(userId: string) {
    const doc = await GapAnalysisModel.findOne({
      userId,
      status: { $in: ["queued", "analyzing"] },
    })
      .sort({ createdAt: -1 })
      .lean();

    if (!doc) return null;
    return {
      id: String(doc._id),
      topic: doc.topic,
      status: doc.status,
      gapIds: doc.gapIds.map(String),
      errorMessage: doc.errorMessage,
      yearFrom: doc.yearFrom,
      yearTo: doc.yearTo,
      selectedPaperIds: doc.selectedPaperIds.map(String),
      evidenceMode: doc.evidenceMode,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  },

  /** Retry a failed analysis with the exact same reviewed evidence and scope. */
  async retryAnalysis(userId: string, analysisId: string): Promise<string> {
    const failed = await GapAnalysisModel.findOne({
      _id: analysisId,
      userId,
      status: "failed",
    }).lean();
    if (!failed) {
      throw AppError.conflict("Only a failed gap analysis can be retried");
    }

    return this.enqueue(userId, {
      topic: failed.topic,
      projectId: failed.projectId?.toString(),
      yearFrom: failed.yearFrom ?? undefined,
      yearTo: failed.yearTo ?? undefined,
      selectedPaperIds: failed.selectedPaperIds.map(String),
      evidenceMode: failed.evidenceMode,
    });
  },

  /**
   * The full gap-analysis pipeline for one request. Runs inside gaps.worker
   * (NEVER in a request handler). Throws on transient failures so BullMQ
   * retries; marks the analysis `failed` itself only for permanent conditions.
   */
  async runGapPipeline(job: GapJob): Promise<void> {
    const analysis = await GapAnalysisModel.findById(job.analysisId);
    if (!analysis) {
      logger.warn(
        { analysisId: job.analysisId },
        "gap analysis vanished before processing",
      );
      return;
    }
    if (analysis.status === "ready") return; // replayed job — already done

    analysis.status = "analyzing";
    await analysis.save();

    const evidenceMode = (analysis.evidenceMode ?? "auto") as GapEvidenceMode;
    // ① Embed only when retrieval is required. A reviewed selected pack is fixed.
    const queryVector = evidenceMode === "selected"
      ? undefined
      : await getEmbeddingProvider().embed(analysis.topic);
    const projectPaperIds = analysis.projectId
      ? await projectService.getProjectPaperIdsForUser(
          String(analysis.projectId),
          String(analysis.userId),
          "gap analysis",
        )
      : undefined;

    // ② Collect the final ordered evidence pack before cache lookup.
    const evidence = await collectGapEvidence({
      topic: analysis.topic,
      queryVector,
      selectedPaperIds: (analysis.selectedPaperIds ?? []).map(String),
      evidenceMode,
      yearFrom: analysis.yearFrom ?? undefined,
      yearTo: analysis.yearTo ?? undefined,
      projectPaperIds,
    });
    const papers = evidence.papers;

    if (papers.length === 0 || (evidenceMode === "selected" && papers.length < 3)) {
      await this.markAnalysisFailed(
        job.analysisId,
        evidenceMode === "selected"
          ? "The reviewed evidence pack no longer contains at least 3 active papers."
          : "Not enough corpus data for this topic — try a broader question.",
      );
      return;
    }

    // ③ Cache lookup (AFTER ②)
    const normalizedTopic = normalizeTopicStr(analysis.topic);
    const model = env.GEMINI_MODEL_DEEP;
    const cacheKey = buildGapsCacheKey({
      normalizedTopic,
      yearFrom: analysis.yearFrom ?? undefined,
      yearTo: analysis.yearTo ?? undefined,
      model,
      retrievedPaperIds: papers.map((p) => p.id),
    });

    let cacheHit = false;
    const output = await cachedGenerateJSON<GapsLlmOutput>({
      task: "gap",
      promptVersion: GAP_PROMPT_VERSION,
      keyParts: {
        legacyCacheKey: cacheKey,
        normalizedTopic,
        yearFrom: analysis.yearFrom ?? null,
        yearTo: analysis.yearTo ?? null,
        retrievedPaperIds: papers.map((p) => p.id),
      },
      model,
      prompt: buildGapsPrompt(analysis.topic, papers),
      onCacheHit: () => {
        cacheHit = true;
      },
      validate: (candidate) => {
        if (
          !candidate ||
          !Array.isArray(candidate.gaps) ||
          candidate.gaps.length === 0
        ) {
          throw new LlmContentError("LLM returned empty gaps output");
        }
        return candidate;
      },
      options: {
        system: GAPS_SYSTEM_PROMPT,
        temperature: 0.2,
        maxOutputTokens: env.GAPS_MAX_OUTPUT_TOKENS,
      },
    });

    // ⑤ Persist gaps (map 1-based evidence numbers back to real paper ids).
    //    IDEMPOTENT: clear this analysis's prior gaps first, so a retried job (after a
    //    partial earlier run that created some gaps then threw) can't leave duplicates
    //    or orphans — the list() query is by userId+status, not gapIds, so orphans would
    //    otherwise show on the FE forever.
    await ResearchGapModel.deleteMany({ analysisId: analysis._id });
    const evidenceScopePaperIds = evidenceMode === "auto"
      ? projectPaperIds
      : papers.map((paper) => paper.id);
    const gapDocs = await Promise.all(
      output.gaps.slice(0, 5).map(async (g) => {
        const evidence = await scoreGapEvidence(g.probe, evidenceScopePaperIds);
        return ResearchGapModel.create({
          topic: analysis.topic,
          normalizedTopic,
          analysisId: analysis._id,
          title: String(g.title ?? "").slice(0, 200),
          description: String(g.description ?? ""),
          rationale: String(g.rationale ?? ""),
          evidencePaperIds: papers.map((paper) => paper.id),
          supportingPaperIds: (g.supportingEvidence ?? [])
            .filter((n) => Number.isInteger(n) && n >= 1 && n <= papers.length)
            .map((n) => papers[n - 1]!.id),
          confidence: clamp01(g.confidence),
          probe: evidence?.probe,
          intersectionCount: evidence?.intersectionCount,
          parentCounts: evidence?.parentCounts,
          parentTrend: evidence?.parentTrend ?? null,
          // No probe → no quantitative evidence; fall back to the LLM confidence so a
          // probe-less gap still sorts sanely instead of sinking below evidence-scored ones
          // (Mongo sorts a missing field last under -1).
          evidenceConfidence:
            evidence?.evidenceConfidence ?? clamp01(g.confidence),
          source: "standalone",
          userId: analysis.userId,
          projectId: analysis.projectId,
        });
      }),
    );

    // ⑥ Update analysis
    analysis.status = "ready";
    analysis.gapIds = gapDocs.map((d) => d._id);
    analysis.promptVersion = GAP_PROMPT_VERSION;
    analysis.modelVersion = model;
    await analysis.save();

    if (cacheHit && analysis.creditTransactionId) {
      await creditService.refundCreditsOnce({
        transactionId: analysis.creditTransactionId.toString(),
        reason: "Gap analysis cache hit",
      });
      analysis.creditRefundedAt = new Date();
      await analysis.save();
    }

    logger.info(
      { analysisId: job.analysisId, gaps: gapDocs.length, cacheHit },
      "gap analysis ready",
    );
  },

  /**
   * Fan-out gaps from a finished RAG report into the research_gaps collection.
   * Fire-and-forget from rag.service (non-fatal — a report stays valid even if
   * this write fails). The supportingPaperIds here are already real ObjectIds.
   */
  async fanOutGapsFromReport(report: {
    _id: unknown;
    userId: unknown;
    projectId?: unknown;
    projectPaperIds?: unknown[];
    evidencePaperIds?: unknown[];
    query: string;
    researchGaps: Array<{
      title: string;
      description: string;
      rationale: string;
      supportingPaperIds: unknown[];
      confidence: number;
      probe?: GapProbe;
    }>;
  }): Promise<void> {
    if (!report.researchGaps || report.researchGaps.length === 0) return;
    const normalizedTopic = normalizeTopicStr(report.query);
    const scopedPaperIds = report.projectId
      ? (report.projectPaperIds ?? []).map(String)
      : undefined;
    await Promise.all(
      report.researchGaps.map(async (g) => {
        const evidence = await scoreGapEvidence(g.probe, scopedPaperIds);
        return ResearchGapModel.create({
          topic: report.query,
          normalizedTopic,
          title: g.title,
          description: g.description,
          rationale: g.rationale,
          evidencePaperIds: report.evidencePaperIds ?? g.supportingPaperIds,
          supportingPaperIds: g.supportingPaperIds,
          confidence: g.confidence,
          probe: evidence?.probe,
          intersectionCount: evidence?.intersectionCount,
          parentCounts: evidence?.parentCounts,
          parentTrend: evidence?.parentTrend ?? null,
          evidenceConfidence:
            evidence?.evidenceConfidence ?? clamp01(g.confidence),
          source: "report",
          sourceReportId: report._id,
          userId: report.userId,
          projectId: report.projectId,
        });
      }),
    );
  },

  /** Paginated, filterable list of gaps (the FE gaps page). */
  async list(userId: string, query: ListGapsQuery) {
    let filter: Record<string, unknown> = {
      userId: new mongoose.Types.ObjectId(userId),
      status: query.status,
    };

    if (query.projectId) {
      const { ProjectModel } =
        await import("../projects/models/project.model.js");
      const project = await ProjectModel.findById(query.projectId).lean();
      if (!project) throw AppError.notFound("Project not found");
      const hasAccess =
        project.ownerId.toString() === userId ||
        project.members.some((m) => m.targetId.toString() === userId);
      if (!hasAccess) throw AppError.notFound("Project not found");
      filter = {
        projectId: new mongoose.Types.ObjectId(query.projectId),
        status: query.status,
      }; // Show all gaps for this project
    }

    if (query.topic) {
      filter.normalizedTopic = {
        $regex: normalizeTopicStr(query.topic),
        $options: "i",
      };
    }
    if (query.source) filter.source = query.source;
    if (query.minConfidence !== undefined)
      filter.confidence = { $gte: query.minConfidence };
    if (query.search) {
      const search = new RegExp(escapeRegex(query.search), "i");
      filter.$or = [
        { title: search },
        { description: search },
        { topic: search },
        { "probe.topicA": search },
        { "probe.topicB": search },
      ];
    }

    const { page, pageSize } = query;
    const sortBy = query.sortBy;
    const sortStage: Record<string, 1 | -1> =
      sortBy === "papers"
        ? { _sortPaperCount: -1, _sortConfidence: -1, createdAt: -1 }
        : sortBy === "newest"
          ? { createdAt: -1 }
          : sortBy === "confidence"
            ? { _sortConfidence: -1, createdAt: -1 }
            : sortBy === "ai_only_last"
              ? { _sortEvidenceRank: 1, _sortConfidence: -1, createdAt: -1 }
              : { _sortEvidenceRank: 1, _sortConfidence: -1, createdAt: -1 };

    const [docs, total] = await Promise.all([
      ResearchGapModel.aggregate([
        { $match: filter },
        {
          $addFields: {
            _sortConfidence: { $ifNull: ["$evidenceConfidence", "$confidence"] },
            _sortPaperCount: { $size: { $ifNull: ["$supportingPaperIds", []] } },
            _sortEvidenceRank: {
              $switch: {
                branches: [
                  {
                    case: {
                      $and: [
                        { $ne: [{ $ifNull: ["$probe.topicA", null] }, null] },
                        { $gte: [{ $ifNull: ["$evidenceConfidence", 0] }, 0.5] },
                      ],
                    },
                    then: 0,
                  },
                  {
                    case: { $ne: [{ $ifNull: ["$probe.topicA", null] }, null] },
                    then: 1,
                  },
                  { case: { $ne: ["$source", "report"] }, then: 1 },
                ],
                default: 2,
              },
            },
          },
        },
        { $sort: sortStage },
        { $skip: (page - 1) * pageSize },
        { $limit: pageSize },
        { $unset: ["_sortConfidence", "_sortPaperCount", "_sortEvidenceRank"] },
      ]),
      ResearchGapModel.countDocuments(filter),
    ]);

    const legacyAnalysisIds = [
      ...new Set(
        docs
          .filter((doc) => !(doc.evidencePaperIds?.length) && doc.analysisId)
          .map((doc) => String(doc.analysisId)),
      ),
    ];
    const legacyAnalyses = legacyAnalysisIds.length
      ? await GapAnalysisModel.find({ _id: { $in: legacyAnalysisIds } })
          .select("selectedPaperIds")
          .lean()
      : [];
    const legacyEvidenceByAnalysisId = new Map(
      legacyAnalyses.map((analysis) => [
        String(analysis._id),
        (analysis.selectedPaperIds ?? []).map(String),
      ]),
    );
    for (const doc of docs) {
      if (!(doc.evidencePaperIds?.length) && doc.analysisId) {
        doc.evidencePaperIds =
          legacyEvidenceByAnalysisId.get(String(doc.analysisId)) ?? doc.supportingPaperIds ?? [];
      }
    }

    const paperIds = [
      ...new Set(
        docs.flatMap((doc) => [
          ...(doc.supportingPaperIds ?? []).map(String),
          ...(doc.evidencePaperIds ?? []).map(String),
        ]),
      ),
    ];
    const supportingPapers = paperIds.length
      ? await PaperModel.find({ _id: { $in: paperIds } })
          .select("title publicationYear journalName citationCount")
          .lean()
      : [];
    const supportingPapersById = new Map(
      supportingPapers.map((p) => [
        String(p._id),
        {
          id: String(p._id),
          title: String(p.title ?? ""),
          publicationYear: p.publicationYear,
          journalName: p.journalName ?? undefined,
          citationCount: p.citationCount,
        },
      ]),
    );

    return {
      gaps: docs.map((d) =>
        toGapListItem(d as unknown as GapListDoc, supportingPapersById),
      ),
      total,
    };
  },

  /** Resolve / dismiss a gap — owner only. */
  async patchStatus(userId: string, gapId: string, dto: PatchGapDto) {
    const gap = await ResearchGapModel.findById(gapId);
    if (!gap) throw AppError.notFound("Research gap not found");
    if (String(gap.userId) !== userId) {
      throw AppError.forbidden("Only the creator can update gap status");
    }
    gap.status = dto.status;
    await gap.save();
    return { id: String(gap._id), status: gap.status };
  },

  /**
   * On-demand AI research-direction suggestions for ONE gap. Advisory — never
   * touches points/credit/tier. Cached as one doc per gap; `force` re-generates.
   * Synchronous (no vector search): the gap doc already carries full context.
   */
  async generateDirections(
    userId: string,
    gapId: string,
    force?: boolean,
  ): Promise<GapDirections> {
    const gap = await ResearchGapModel.findById(gapId).lean();
    if (!gap) throw AppError.notFound("Research gap not found");
    await assertCanReadGap(userId, gap);

    const allowedPaperIds = (gap.supportingPaperIds ?? []).map(String);
    const papers = await PaperModel.find({
      _id: { $in: gap.supportingPaperIds ?? [] },
    })
      .select("title abstractText aiAnalysis")
      .lean();
    const directionPapers = papers.map((p) => ({
      id: String(p._id),
      title: String(p.title),
      abstractText: p.abstractText ? String(p.abstractText) : undefined,
      aiAnalysis: p.aiAnalysis ?? null,
    }));
    const evidenceHash = buildDirectionsEvidenceHash(directionPapers);

    const existing = await GapDirectionsModel.findOne({ gapId });
    if (
      existing &&
      !force &&
      existing.promptVersion === DIRECTIONS_PROMPT_VERSION &&
      existing.evidenceHash === evidenceHash
    ) {
      return toDirectionsDto(existing as GapDirectionsDoc);
    }

    // Charge credits first since we are about to trigger LLM generation
    const tx = await creditService.chargeCreditsChecked({
      userId,
      action: "generate_directions",
      amount: 15,
      targetKind: "gap_direction",
      targetId: gapId,
      idempotencyKey: `directions:${gapId}:${Date.now()}`,
    });

    let txId = tx?._id;
    let cacheHit = false;

    let raw: DirectionsRaw;
    const prompt = buildDirectionsPrompt(
      {
        topic: gap.topic,
        title: gap.title,
        description: gap.description,
        rationale: gap.rationale,
        intersectionCount: gap.intersectionCount ?? undefined,
        parentTrend: gap.parentTrend as
          | { topic: string; growthRatePct: number }
          | undefined,
      },
      directionPapers,
    );
    try {
      raw = await cachedGenerateJSON<DirectionsRaw>({
        task: "directions",
        promptVersion: DIRECTIONS_PROMPT_VERSION,
        keyParts: { gapId, allowedPaperIds },
        model: env.GEMINI_MODEL_FAST,
        bypassCache: force,
        prompt,
        onCacheHit: () => {
          cacheHit = true;
        },
        validate: (candidate) => {
          const directions = sanitizeDirections(candidate, allowedPaperIds);
          if (directions.length === 0) {
            throw new LlmContentError(
              "LLM returned no valid research directions",
            );
          }
          return candidate;
        },
        options: {
          system: DIRECTIONS_SYSTEM_PROMPT,
          temperature: 0.4,
          maxOutputTokens: 1024,
        },
      });
    } catch (err) {
      if (txId) {
        await creditService.refundCreditsOnce({
          transactionId: txId.toString(),
          reason: "Directions generation failed",
        });
      }
      logger.warn({ err, gapId }, "gap directions generation failed");
      throw AppError.serviceUnavailable(
        "AI gợi ý tạm thời không khả dụng. Vui lòng thử lại.",
      );
    }

    if (cacheHit && txId) {
      await creditService.refundCreditsOnce({
        transactionId: txId.toString(),
        reason: "Directions cache hit",
      });
      txId = undefined;
    }

    const directions = sanitizeDirections(raw, allowedPaperIds);
    if (directions.length === 0) {
      throw AppError.serviceUnavailable(
        "AI không trả về gợi ý hợp lệ. Vui lòng thử lại.",
      );
    }

    const doc = await GapDirectionsModel.findOneAndUpdate(
      { gapId },
      {
        $set: {
          directions,
          model: env.GEMINI_MODEL_FAST,
          promptVersion: DIRECTIONS_PROMPT_VERSION,
          evidenceHash,
          creditTransactionId: txId,
          creditCost: txId ? 15 : 0,
        },
      },
      { upsert: true, new: true },
    );
    return toDirectionsDto(doc as GapDirectionsDoc);
  },

  /** Cached directions for a gap (or null if never generated). */
  async getDirections(
    userId: string,
    gapId: string,
  ): Promise<GapDirections | null> {
    const gap = await ResearchGapModel.findById(gapId).lean();
    if (!gap) throw AppError.notFound("Research gap not found");
    await assertCanReadGap(userId, gap);
    const doc = await GapDirectionsModel.findOne({ gapId });
    return doc ? toDirectionsDto(doc as GapDirectionsDoc) : null;
  },

  /** Mark an analysis failed — called by the worker when retries are exhausted. */
  async markAnalysisFailed(analysisId: string, message: string): Promise<void> {
    const analysis = await GapAnalysisModel.findOneAndUpdate(
      {
        _id: analysisId,
        status: { $ne: "ready" },
        creditRefundedAt: { $exists: false },
      },
      {
        $set: {
          status: "failed",
          errorMessage: message.slice(0, 500),
          creditRefundedAt: new Date(),
        },
      },
      { new: true },
    ).lean();

    if (analysis && analysis.creditTransactionId) {
      await creditService.refundCreditsOnce({
        transactionId: analysis.creditTransactionId.toString(),
        reason: `Gap analysis failed: ${message.slice(0, 100)}`,
      });
    } else if (!analysis) {
      await GapAnalysisModel.updateOne(
        { _id: analysisId, status: { $ne: "ready" } },
        { $set: { status: "failed", errorMessage: message.slice(0, 500) } },
      );
    }
  },
};

type GapEvidenceCandidate = GapEvidencePaper & {
  journalName?: string;
  citationCount?: number;
  authorNames: string[];
  score: number;
  source: "selected" | "retrieved";
};

interface CollectGapEvidenceInput {
  topic: string;
  queryVector?: number[];
  selectedPaperIds?: string[];
  evidenceMode: GapEvidenceMode;
  yearFrom?: number;
  yearTo?: number;
  projectPaperIds?: string[];
}

interface CollectGapEvidenceResult {
  papers: GapEvidenceCandidate[];
  selectedPaperIds: string[];
  retrievedPaperIds: string[];
  missingSelectedPaperIds: string[];
}

async function collectGapEvidence(
  input: CollectGapEvidenceInput,
): Promise<CollectGapEvidenceResult> {
  const selectedPaperIds = Array.from(new Set(input.selectedPaperIds ?? []));
  const selected = input.evidenceMode === "auto"
    ? { papers: [] as GapEvidenceCandidate[], missingIds: [] as string[] }
    : await fetchSelectedGapEvidence(selectedPaperIds, input);
  let retrieved: GapEvidenceCandidate[] = [];

  if (input.evidenceMode !== "selected") {
    const filters = {
      yearFrom: input.yearFrom,
      yearTo: input.yearTo,
      paperIds: input.projectPaperIds,
    };
    const candidates = input.queryVector?.length
      ? await retrieveGapEvidence(input.queryVector, filters)
      : await retrieveGapTextEvidence(input.topic, filters);
    retrieved = candidates.map((paper) => ({
      ...paper,
      authorNames: paper.authorNames,
      score: Number(paper.score ?? 0.5),
      source: "retrieved" as const,
    }));
  }

  const seen = new Set<string>();
  const papers: GapEvidenceCandidate[] = [];
  for (const paper of [...selected.papers, ...retrieved]) {
    if (papers.length >= env.GAPS_TOP_K) break;
    if (seen.has(paper.id)) continue;
    seen.add(paper.id);
    papers.push(paper);
  }

  return {
    papers,
    selectedPaperIds,
    retrievedPaperIds: retrieved.map((paper) => paper.id),
    missingSelectedPaperIds: selected.missingIds,
  };
}

async function fetchSelectedGapEvidence(
  ids: string[],
  input: Pick<CollectGapEvidenceInput, "yearFrom" | "yearTo" | "projectPaperIds">,
): Promise<{ papers: GapEvidenceCandidate[]; missingIds: string[] }> {
  if (ids.length === 0) return { papers: [], missingIds: [] };
  const allowedProjectIds = input.projectPaperIds ? new Set(input.projectPaperIds) : null;
  const eligibleIds = allowedProjectIds ? ids.filter((id) => allowedProjectIds.has(id)) : ids;
  const match: Record<string, unknown> = {
    _id: { $in: eligibleIds.map((id) => new mongoose.Types.ObjectId(id)) },
    dataStatus: "active",
  };
  if (input.yearFrom !== undefined || input.yearTo !== undefined) {
    match.publicationYear = {
      ...(input.yearFrom !== undefined ? { $gte: input.yearFrom } : {}),
      ...(input.yearTo !== undefined ? { $lte: input.yearTo } : {}),
    };
  }
  const docs = await PaperModel.find(match)
    .select("title abstractText aiAnalysis publicationYear journalName citationCount authors")
    .lean();
  const byId = new Map(docs.map((doc) => [String(doc._id), doc]));
  const papers: GapEvidenceCandidate[] = [];
  const missingIds: string[] = [];

  for (const id of ids) {
    const doc = byId.get(id);
    if (!doc) {
      missingIds.push(id);
      continue;
    }
    papers.push({
      id,
      title: String(doc.title ?? ""),
      abstractText: doc.abstractText ? String(doc.abstractText) : undefined,
      aiAnalysis: doc.aiAnalysis ?? null,
      publicationYear: doc.publicationYear,
      journalName: doc.journalName ? String(doc.journalName) : undefined,
      citationCount: doc.citationCount,
      authorNames: (doc.authors ?? []).map((author) => author.displayName).filter(Boolean),
      score: 1,
      source: "selected",
    });
  }
  return { papers, missingIds };
}

async function retrieveGapTextEvidence(
  topic: string,
  filters: { yearFrom?: number; yearTo?: number; paperIds?: string[] },
): Promise<GapEvidenceCandidate[]> {
  const match: Record<string, unknown> = { dataStatus: "active", $text: { $search: topic } };
  if (filters.paperIds) {
    match._id = { $in: filters.paperIds.map((id) => new mongoose.Types.ObjectId(id)) };
  }
  if (filters.yearFrom !== undefined || filters.yearTo !== undefined) {
    match.publicationYear = {
      ...(filters.yearFrom !== undefined ? { $gte: filters.yearFrom } : {}),
      ...(filters.yearTo !== undefined ? { $lte: filters.yearTo } : {}),
    };
  }
  const docs = await PaperModel.find(match, {
    title: 1,
    abstractText: 1,
    aiAnalysis: 1,
    publicationYear: 1,
    journalName: 1,
    citationCount: 1,
    authors: 1,
    score: { $meta: "textScore" },
  })
    .sort({ score: { $meta: "textScore" } })
    .limit(env.GAPS_TOP_K)
    .lean();

  return docs.map((doc) => ({
    id: String(doc._id),
    title: String(doc.title ?? ""),
    abstractText: doc.abstractText ? String(doc.abstractText) : undefined,
    aiAnalysis: doc.aiAnalysis ?? null,
    publicationYear: doc.publicationYear,
    journalName: doc.journalName ? String(doc.journalName) : undefined,
    citationCount: doc.citationCount,
    authorNames: (doc.authors ?? []).map((author) => author.displayName).filter(Boolean),
    score: Number((doc as { score?: number }).score ?? 0.5),
    source: "retrieved",
  }));
}

function toPreviewGapPaper(paper: GapEvidenceCandidate) {
  return {
    id: paper.id,
    title: paper.title,
    abstractText: paper.abstractText,
    publicationYear: paper.publicationYear,
    journalName: paper.journalName,
    citationCount: paper.citationCount,
    authorNames: paper.authorNames,
    score: paper.score,
    source: paper.source,
  };
}

async function retrieveGapEvidence(
  queryVector: number[],
  filters: { yearFrom?: number; yearTo?: number; paperIds?: string[] },
): Promise<GapEvidenceCandidate[]> {
  if (filters.paperIds && filters.paperIds.length > 0) {
    return retrieveProjectGapEvidence(queryVector, {
      ...filters,
      paperIds: filters.paperIds,
    });
  }
  const papers = await retrieve({
    queryVector,
    topK: env.GAPS_TOP_K,
    poolSize: env.GAPS_TOP_K,
    numCandidates: 80,
    filters,
    projection: "gap",
  });
  return papers.map((paper) => ({
    ...paper,
    authorNames: paper.authorNames,
    score: Number(paper.score ?? 0.5),
    source: "retrieved" as const,
  }));
}

async function retrieveProjectGapEvidence(
  queryVector: number[],
  filters: { yearFrom?: number; yearTo?: number; paperIds: string[] },
): Promise<GapEvidenceCandidate[]> {
  const match: Record<string, unknown> = {
    _id: { $in: filters.paperIds.map((id) => new mongoose.Types.ObjectId(id)) },
    dataStatus: "active",
  };
  if (filters.yearFrom !== undefined || filters.yearTo !== undefined) {
    match.publicationYear = {
      ...(filters.yearFrom !== undefined ? { $gte: filters.yearFrom } : {}),
      ...(filters.yearTo !== undefined ? { $lte: filters.yearTo } : {}),
    };
  }

  const docs = await PaperModel.find(match)
    .select("title abstractText aiAnalysis publicationYear journalName citationCount authors +embedding")
    .lean();
  const order = new Map(filters.paperIds.map((id, index) => [id, index]));

  return docs
    .map((doc) => {
      const embedding = Array.isArray(doc.embedding)
        ? doc.embedding
        : undefined;
      return {
        id: String(doc._id),
        title: String(doc.title ?? ""),
        abstractText: doc.abstractText ? String(doc.abstractText) : undefined,
        aiAnalysis: doc.aiAnalysis ?? null,
        publicationYear: doc.publicationYear,
        journalName: doc.journalName ? String(doc.journalName) : undefined,
        citationCount: doc.citationCount,
        authorNames: (doc.authors ?? []).map((author) => author.displayName).filter(Boolean),
        source: "retrieved" as const,
        score: embedding
          ? cosineSimilarity(queryVector, embedding)
          : Number.NEGATIVE_INFINITY,
      };
    })
    .sort((a, b) => {
      const scoreA = Number.isFinite(a.score)
        ? a.score
        : Number.NEGATIVE_INFINITY;
      const scoreB = Number.isFinite(b.score)
        ? b.score
        : Number.NEGATIVE_INFINITY;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return (
        (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.id) ?? Number.MAX_SAFE_INTEGER)
      );
    })
    .slice(0, env.GAPS_TOP_K);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return Number.NEGATIVE_INFINITY;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return Number.NEGATIVE_INFINITY;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
