import type { AnalyticalReport, PreviewReportEvidenceResponse, ReportListItem } from "@trend/shared-types";
import mongoose from "mongoose";
import { AppError } from "../../common/exceptions/app-error.js";
import { env } from "../../config/env.js";
import { logger } from "../../infrastructure/logger.js";
import { reportQueue } from "../../infrastructure/queue.js";
import { BookmarkModel } from "../bookmarks/models/bookmark.model.js";
import { getEmbeddingProvider } from "../embeddings/embedding.factory.js";
import { paperService } from "../papers/paper.service.js";
import { ReportModel, type ReportDoc } from "./models/report.model.js";
import type {
  CreateReportInput,
  ListReportsQuery,
  PreviewReportEvidenceInput,
} from "./dto/report.schema.js";
import { creditService } from "../credits/credit.service.js";
import { resolveReportCreditCost } from "../credits/credit-policy.js";
import { collectReportEvidence } from "./report.evidence.js";
import { projectService } from "../projects/project.service.js";
import { resolveProjectEvidenceIds } from "../projects/project-scope.js";

/**
 * HTTP-facing report operations. The heavy RAG work lives in rag.service.ts
 * and runs in the report worker — this service only creates/reads documents
 * and enqueues jobs (CLAUDE.md: no long-running work in request handlers).
 */

/** "generating" docs older than this are dead-worker orphans — don't count
 *  them against the user's pending quota (the worker sweeps them on restart). */
const STALE_GENERATING_MS = 5 * 60_000;

export const reportService = {
  /** Create a queued report + enqueue its job. Guarded against quota abuse. */
  async create(userId: string, input: CreateReportInput): Promise<{ id: string; status: string }> {
    const selectedPaperIds = await resolveReportEvidenceScope(userId, input);

    // NOTE: check-then-insert is not atomic; a same-user burst can slightly
    // exceed the cap. Accepted — the per-user rate limiter on the route is the
    // real throughput throttle; this guard only bounds CONCURRENT work.
    const pending = await ReportModel.countDocuments({
      userId,
      $or: [
        { status: "queued" },
        { status: "generating", updatedAt: { $gte: new Date(Date.now() - STALE_GENERATING_MS) } },
      ],
    });
    if (pending >= env.REPORT_MAX_PENDING_PER_USER) {
      throw AppError.tooMany(
        `You already have ${pending} report(s) in progress — wait for them to finish first.`,
      );
    }

    const reportId = new mongoose.Types.ObjectId();
    const { action, cost } = resolveReportCreditCost({
      fast: input.fast,
      deepAnalysis: input.deepAnalysis,
    });

    let txId: mongoose.Types.ObjectId | undefined;
    if (cost > 0) {
      const tx = await creditService.chargeCreditsChecked({
        userId,
        action,
        amount: cost,
        targetKind: "report",
        targetId: reportId.toString(),
        idempotencyKey: `report:${reportId}`,
      });
      if (tx) {
        txId = tx._id;
      }
    }

    try {
      const report = await ReportModel.create({
        _id: reportId,
        userId,
        query: input.query,
        topic: input.topic,
        projectId: input.projectId,
        yearFrom: input.yearFrom,
        yearTo: input.yearTo,
        scopeFilters: input.scopeFilters,
        language: input.language ?? "auto",
        deepAnalysis: input.deepAnalysis ?? false,
        fast: input.fast ?? false,
        selectedPaperIds: selectedPaperIds ?? [],
        status: "queued",
        creditTransactionId: txId,
        creditCost: cost,
        creditAction: action,
      });

      // jobId = reportId → BullMQ dedups accidental double-submits of the same doc.
      await reportQueue.add(
        "generate-report",
        { reportId: String(report._id) },
        { jobId: String(report._id) },
      );

      return { id: String(report._id), status: "queued" };
    } catch (err) {
      if (txId) {
        await creditService.refundCreditsOnce({
          transactionId: txId.toString(),
          reason: "Failed to create report or enqueue job",
        });
      }
      throw err;
    }
  },

  /** Preview the exact evidence pack that report generation will use. No LLM generation here. */
  async previewEvidence(
    userId: string,
    input: PreviewReportEvidenceInput,
  ): Promise<PreviewReportEvidenceResponse> {
    const selectedPaperIds = await resolveReportEvidenceScope(userId, input);
    const fillWithRetrieved = input.projectId ? false : input.fillWithRetrieved;
    let queryVector: number[] | undefined;
    let usedTextFallback = false;

    if (fillWithRetrieved ?? true) {
      try {
        queryVector = await getEmbeddingProvider().embed(input.query);
      } catch (err) {
        usedTextFallback = true;
        logger.warn({ err }, "report evidence preview embedding failed; using text fallback");
      }
    }

    const evidence = await collectReportEvidence({
      queryText: input.query,
      queryVector,
      selectedPaperIds,
      yearFrom: input.yearFrom,
      yearTo: input.yearTo,
      scopeFilters: input.scopeFilters,
      fillWithRetrieved,
    });
    const warnings = evidence.missingSelectedPaperIds.map(
      (id) => `Selected paper ${id} was not found in the active corpus and was skipped.`,
    );
    if (usedTextFallback) {
      warnings.push("Semantic embedding was unavailable, so the evidence preview used keyword fallback.");
    }
    if (evidence.papers.length === 0) {
      warnings.push("No active evidence papers were found for this query.");
    }

    return {
      papers: evidence.papers,
      retrievedPaperIds: evidence.retrievedPaperIds,
      selectedPaperIds: evidence.selectedPaperIds,
      maxEvidencePapers: evidence.maxEvidencePapers,
      warnings,
    };
  },

  /** The user's own reports (or project reports), newest first — WITHOUT heavy fields. */
  async list(userId: string, { page, pageSize, projectId, paperId }: ListReportsQuery) {
    let filter: Record<string, any> = { userId };
    
    if (projectId) {
      const { ProjectModel } = await import("../projects/models/project.model.js");
      const project = await ProjectModel.findById(projectId).lean();
      if (!project) throw AppError.notFound("Project not found");
      const hasAccess = project.ownerId.toString() === userId || project.members.some((m) => m.targetId.toString() === userId);
      if (!hasAccess) throw AppError.notFound("Project not found");
      filter = { projectId }; // Show all reports for this project
    }
    if (paperId) filter.groundingPaperIds = paperId;

    const [docs, total] = await Promise.all([
      ReportModel.find(filter)
        .select("-markdown -researchGaps -groundingPaperIds")
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      ReportModel.countDocuments(filter),
    ]);
    return { reports: docs.map((d) => toReportDto(d) as ReportListItem), total };
  },

  /** Full report — owner or project member. */
  async getById(userId: string, id: string): Promise<AnalyticalReport> {
    const doc = await ReportModel.findOne({ _id: id }).lean().catch(() => null);
    if (!doc) throw AppError.notFound("Report not found");

    // Check access
    let hasAccess = doc.userId.toString() === userId;
    if (!hasAccess && doc.projectId) {
      // Lazy import to avoid circular dep just in case
      const { ProjectModel } = await import("../projects/models/project.model.js");
      const project = await ProjectModel.findById(doc.projectId).lean();
      if (project) {
        hasAccess = project.ownerId.toString() === userId || project.members.some((m) => m.targetId.toString() === userId);
      }
    }
    if (!hasAccess) throw AppError.notFound("Report not found"); // mask 403 as 404

    const report = toReportDto(doc);
    report.groundingPapers = await paperService.getSummariesByIds(report.groundingPaperIds ?? []);
    return report;
  },

  /** Delete a single report by ID. */
  async deleteById(userId: string, id: string): Promise<void> {
    const result = await ReportModel.deleteOne({ _id: id, userId });
    if (result.deletedCount === 0) {
      throw AppError.notFound("Report not found or not owned by you");
    }
    await BookmarkModel.deleteMany({ userId, targetKind: "report", targetId: id });
  },

  /** Delete multiple reports by IDs. */
  async deleteBatch(userId: string, ids: string[]): Promise<void> {
    await ReportModel.deleteMany({ _id: { $in: ids }, userId });
    await BookmarkModel.deleteMany({ userId, targetKind: "report", targetId: { $in: ids } });
  },

  /** Count completed reports that ground on a given paper. Public — no auth. */
  async countByPaper(paperId: string): Promise<number> {
    return ReportModel.countDocuments({
      groundingPaperIds: paperId,
      status: "ready",
    });
  },
};

/**
 * `_id` → `id`; strip internals (`__v`, `cacheKey`, `updatedAt`) — they are
 * not part of the wire contract. Dates serialize to ISO strings via res.json.
 */
function toReportDto(doc: Partial<ReportDoc> & { _id: unknown }): AnalyticalReport {
  const { _id, __v, cacheKey, updatedAt, ...rest } = doc as Record<string, unknown>;
  void __v;
  void cacheKey;
  void updatedAt;
  return { id: String(_id), ...rest } as unknown as AnalyticalReport;
}

// Code quality reviewed and formatted

async function resolveReportEvidenceScope(
  userId: string,
  input: Pick<CreateReportInput, "projectId" | "selectedPaperIds">,
): Promise<string[] | undefined> {
  if (!input.projectId) return input.selectedPaperIds;

  const projectPaperIds = await projectService.getProjectPaperIdsForUser(
    input.projectId,
    userId,
    "report",
  );
  const resolved = resolveProjectEvidenceIds(projectPaperIds, input.selectedPaperIds);
  if (resolved.invalidIds.length > 0) {
    throw AppError.badRequest("Selected evidence papers must belong to the project.", {
      invalidPaperIds: resolved.invalidIds,
    });
  }
  return resolved.ids;
}
