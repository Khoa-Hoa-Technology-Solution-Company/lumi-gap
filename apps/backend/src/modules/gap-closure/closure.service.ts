import { randomUUID } from "node:crypto";
import type { GapClosureCheckView, GapClosureDocumentView, GapClosureDossier } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { env } from "../../config/env.js";
import { Prisma } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { gapsQueue } from "../../infrastructure/queue.js";
import { logger } from "../../infrastructure/logger.js";
import { auditService } from "../audit/audit.service.js";
import { creditService } from "../credits/credit.service.js";
import { getAiActionCost } from "../credits/credit-policy.js";
import {
  GAP_CLOSURE_JOB,
  GAP_CLOSURE_PROTOCOL_VERSION,
  decideClosure,
  judgeKindOf,
  type GapClosureJob,
} from "./closure.rules.js";
import {
  isDecidableStatus,
  isReviewableStatus,
  loadCheckForUser,
  loadGapForUser,
  projectIdsOfUser,
  reopensDecision,
  resolveUserId,
  reviewQuoteError,
  secondReviewerError,
} from "./closure.access.js";
import {
  buildDossier,
  dossierFilename,
  dossierMarkdown,
  parseQueryLog,
  toCalibrationView,
  toCheckView,
  toCoverageView,
  toDocumentView,
} from "./dossier.js";
import type { DecideGapClosureDto, ReviewClosureDocumentDto, StartGapClosureCheckDto } from "./dto/closure.schema.js";

/** A QUEUED/SEARCHING check younger than this blocks a second one for the same gap (no double charge). */
const ACTIVE_CHECK_WINDOW_MS = 30 * 60 * 1000;
export const WITNESS_EVIDENCE_TYPE = "CLOSURE_WITNESS";

const documentOrder = [{ queryIndex: "asc" as const }, { rank: "asc" as const }];

async function loadDocuments(checkId: string) {
  return getPrisma().gapClosureDocument.findMany({ where: { checkId }, orderBy: documentOrder });
}

async function checkView(checkId: string): Promise<GapClosureCheckView> {
  const [check, documents] = await Promise.all([getPrisma().gapClosureCheck.findUniqueOrThrow({ where: { id: checkId } }), loadDocuments(checkId)]);
  return toCheckView(check, documents);
}

export const closureService = {
  /** POST /gaps/:gapId/checks — create the row, charge credits, enqueue; refund when anything fails. */
  async startCheck(sub: string, gapParam: string, body: StartGapClosureCheckDto): Promise<GapClosureCheckView> {
    const userId = await resolveUserId(sub);
    const { gap, level } = await loadGapForUser(gapParam, userId);
    const question = (body.question ?? gap.suggestedResearchQuestion ?? "").trim();
    if (!question) throw AppError.badRequest("This gap has no research question: provide `question` in the request");
    if ((body.queries?.length ?? 0) > env.GAP_CLOSURE_MAX_QUERIES) throw AppError.badRequest(`At most ${env.GAP_CLOSURE_MAX_QUERIES} queries are allowed per check`);

    const prisma = getPrisma();
    const running = await prisma.gapClosureCheck.findFirst({
      where: { targetKind: "GAP", targetId: gap.id, status: { in: ["QUEUED", "SEARCHING"] }, createdAt: { gt: new Date(Date.now() - ACTIVE_CHECK_WINDOW_MS) } },
      select: { id: true },
    });
    if (running) throw AppError.conflict("A closure check is already running for this gap", { checkId: running.id });

    const facets = body.facets ?? (gap.questionFacets as Record<string, string> | null) ?? {};
    const checkId = randomUUID();
    const cost = getAiActionCost("gap_closure_check");
    const transaction = await creditService.chargeCreditsChecked({ userId, action: "gap_closure_check", amount: cost, targetKind: "gap_closure_check", targetId: checkId, idempotencyKey: `gap_closure_check:${checkId}` });
    try {
      await prisma.$transaction(async (tx) => {
        await tx.gapClosureCheck.create({
          data: {
            id: checkId,
            targetKind: "GAP",
            targetId: gap.id,
            protocolVersion: GAP_CLOSURE_PROTOCOL_VERSION,
            status: "QUEUED",
            question,
            facets: facets as Prisma.InputJsonObject,
            queries: [],
            yearFrom: body.yearFrom,
            yearTo: body.yearTo,
            createdById: userId,
            creditTransactionId: transaction?.id,
            creditCost: transaction ? cost : null,
          },
        });
        // Only the gap's creator or its project owner edits the gap; a member's facets apply to this check only.
        if (body.facets && level === "manager") await tx.researchGap.update({ where: { id: gap.id }, data: { questionFacets: body.facets as Prisma.InputJsonObject } });
      });
      try {
        await gapsQueue.add(GAP_CLOSURE_JOB, { checkId, queries: body.queries } satisfies GapClosureJob, { jobId: checkId });
      } catch (error) {
        await prisma.gapClosureCheck.updateMany({ where: { id: checkId, status: "QUEUED" }, data: { status: "FAILED", errorMessage: "Could not queue the closure check" } });
        throw error;
      }
    } catch (error) {
      if (transaction?.id) await creditService.refundCreditsOnce({ transactionId: transaction.id, reason: "Failed to create gap closure check or enqueue job" });
      logger.error({ err: error, gapId: gap.id, checkId }, "gap closure check could not be started");
      throw error;
    }
    await auditService.log("gap_closure.check.started", { userId: sub, targetTableName: "gap_closure_checks", targetRecordId: checkId, details: { gapId: gap.id } });
    return checkView(checkId);
  },

  /** GET /gaps/:gapId/checks — newest first, without documents. */
  async listGapChecks(sub: string, gapParam: string): Promise<GapClosureCheckView[]> {
    const userId = await resolveUserId(sub);
    const { gap } = await loadGapForUser(gapParam, userId);
    const rows = await getPrisma().gapClosureCheck.findMany({ where: { targetKind: "GAP", targetId: gap.id }, orderBy: { createdAt: "desc" }, take: 50 });
    return rows.map((row) => toCheckView(row));
  },

  /** GET /checks/:checkId */
  async getCheck(sub: string, checkId: string): Promise<GapClosureCheckView> {
    const userId = await resolveUserId(sub);
    const { check } = await loadCheckForUser(checkId, userId);
    return toCheckView(check, await loadDocuments(check.id));
  },

  /** PATCH /checks/:checkId/documents/:docId */
  async reviewDocument(sub: string, checkId: string, docId: string, body: ReviewClosureDocumentDto): Promise<GapClosureDocumentView> {
    const userId = await resolveUserId(sub);
    const { check } = await loadCheckForUser(checkId, userId);
    if (!isReviewableStatus(check.status)) throw AppError.conflict(`The check is ${check.status}: documents can be reviewed once screening has finished`);
    const prisma = getPrisma();
    const doc = await prisma.gapClosureDocument.findFirst({ where: { id: docId, checkId: check.id } });
    if (!doc) throw AppError.notFound("Document not found");

    const quoteError = reviewQuoteError({ label: body.label, quote: body.quote, title: doc.title, abstractText: doc.abstractText, asSecondReviewer: body.asSecondReviewer });
    if (quoteError) throw AppError.badRequest(quoteError);

    if (body.asSecondReviewer) {
      const conflict = secondReviewerError({ firstReviewerId: doc.reviewerId, firstLabel: doc.humanLabel, reviewerId: userId });
      if (conflict) throw AppError.conflict(conflict);
      const updated = await prisma.gapClosureDocument.update({ where: { id: doc.id }, data: { secondLabel: body.label, secondReviewerId: userId, secondReviewedAt: new Date() } });
      return toDocumentView(updated);
    }
    if (doc.secondReviewerId === userId) throw AppError.conflict("You are the second reviewer of this document and cannot also give its deciding label");

    const reopen = reopensDecision(check.status, body.asSecondReviewer);
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.gapClosureDocument.update({
        where: { id: doc.id },
        data: {
          humanLabel: body.label,
          humanQuote: body.quote?.trim() || null,
          humanFacets: body.facets ?? Prisma.DbNull,
          reviewerId: userId,
          reviewedAt: new Date(),
          limitationStatement: body.label === "PARTIAL" ? (body.limitationStatement ?? doc.limitationStatement) : false,
        },
      });
      if (reopen) await reopenCheck(tx, check);
      return row;
    });
    await auditService.log("gap_closure.document.reviewed", { userId: sub, targetTableName: "gap_closure_documents", targetRecordId: doc.id, details: { checkId: check.id, label: body.label, reopened: reopen } });
    return toDocumentView(updated);
  },

  /** POST /checks/:checkId/decide — GAP checks only; the gap's creator or its project owner. */
  async decide(sub: string, checkId: string, body: DecideGapClosureDto): Promise<GapClosureCheckView> {
    const userId = await resolveUserId(sub);
    const { check, gap, level } = await loadCheckForUser(checkId, userId);
    if (!gap) throw AppError.badRequest("Only closure checks of a gap can be decided");
    if (level !== "manager") throw AppError.forbidden("Only the gap creator or the project owner can decide a closure check");
    if (!isDecidableStatus(check.status)) throw AppError.conflict(`The check is ${check.status}: it can be decided once screening has finished`);

    const prisma = getPrisma();
    const documents = await loadDocuments(check.id);
    const searchErrors = parseQueryLog(check.queries).filter((query) => query.error).length;
    const judgeKind = judgeKindOf(documents);
    const visibleProjectIds = await projectIdsOfUser(userId);
    const visibleCoverage = { OR: [{ createdById: userId }, ...(gap.projectId ? [{ projectId: gap.projectId }] : []), ...(visibleProjectIds.length ? [{ projectId: { in: visibleProjectIds } }] : [])] };

    const coverage = body.coverageCheckId
      ? await prisma.coverageCheck.findFirst({ where: { id: body.coverageCheckId, ...visibleCoverage } })
      : await prisma.coverageCheck.findFirst({ where: { normalizedTopic: gap.normalizedTopic, ...visibleCoverage }, orderBy: { createdAt: "desc" } });
    if (body.coverageCheckId && !coverage) throw AppError.notFound("Coverage check not found");

    const calibration = body.calibrationId
      ? await prisma.closureCalibration.findUnique({ where: { id: body.calibrationId } })
      : await prisma.closureCalibration.findFirst({ where: { status: "COMPUTED", judgeKind, protocolVersion: check.protocolVersion }, orderBy: { computedAt: "desc" } });
    if (body.calibrationId && !calibration) throw AppError.notFound("Calibration not found");
    if (calibration && calibration.status !== "COMPUTED") throw AppError.conflict("The selected calibration has not been computed yet");
    // epsHat measures one version of the procedure; it says nothing about a check run under another version.
    if (calibration && calibration.protocolVersion !== check.protocolVersion) throw AppError.conflict(`The selected calibration measured protocol ${calibration.protocolVersion}, but this check ran under ${check.protocolVersion}`);

    // Automatically found possible counter-evidence is not what the gap was derived from, so it may still corroborate it.
    const paperLinks = await prisma.researchGapPaper.findMany({ where: { gapId: gap.id, kind: { not: "possible_counter" } }, select: { paperId: true } });
    const result = decideClosure({
      documents,
      searchErrors,
      coverage: coverage ? { pHat: coverage.pHat } : null,
      calibration: calibration ? { epsHat: calibration.epsHat, judgeKind: calibration.judgeKind } : null,
      maxFalseNovelty: env.GAP_MAX_FALSE_NOVELTY,
      excludeCorroborationPaperIds: paperLinks.map((link) => link.paperId),
    });
    const witness = result.witnessDocumentId ? documents.find((doc) => doc.id === result.witnessDocumentId) : undefined;
    const decidedAt = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.gapClosureCheck.update({
        where: { id: check.id },
        data: {
          status: "DECIDED",
          judgeKind: result.judgeKind,
          coverageCheckId: coverage?.id ?? null,
          calibrationId: calibration?.id ?? null,
          delta: coverage?.delta ?? calibration?.delta ?? env.GAP_CLOSURE_DELTA,
          epsHat: calibration?.epsHat ?? null,
          pHat: coverage?.pHat ?? null,
          bound: result.bound ?? null,
          maxFalseNovelty: env.GAP_MAX_FALSE_NOVELTY,
          decision: result.decision,
          decisionReasons: result.reasons,
          witnessDocumentId: result.witnessDocumentId ?? null,
          corroborated: result.corroborated,
          errorMessage: null,
          decidedById: userId,
          decidedAt,
        },
      });
      await tx.researchGap.update({ where: { id: gap.id }, data: { closureStatus: result.decision, latestClosureCheckId: check.id } });
      // The corpus witness is the counter-evidence that closes the question. Evidence of an earlier decision is replaced.
      const witnessPaperId = result.decision === "CLOSED" ? witness?.paperId ?? null : null;
      await tx.gapEvidenceRecord.deleteMany({ where: { gapId: gap.id, evidenceKind: "COUNTER", evidenceType: WITNESS_EVIDENCE_TYPE, ...(witnessPaperId ? { NOT: { paperId: witnessPaperId } } : {}) } });
      if (witness && witnessPaperId) {
        const excerpt = (witness.humanLabel === "ANSWERS" ? witness.humanQuote : witness.aiQuote) ?? witness.humanQuote ?? witness.aiQuote ?? witness.title;
        const explanation = `A closure check (${check.protocolVersion}) found that this paper answers the research question: "${check.question.slice(0, 300)}". The question is closed.`;
        await tx.gapEvidenceRecord.upsert({
          where: { gapId_paperId_evidenceKind_evidenceType: { gapId: gap.id, paperId: witnessPaperId, evidenceKind: "COUNTER", evidenceType: WITNESS_EVIDENCE_TYPE } },
          create: { gapId: gap.id, paperId: witnessPaperId, evidenceKind: "COUNTER", evidenceType: WITNESS_EVIDENCE_TYPE, excerpt, explanation, addedById: userId },
          update: { excerpt, explanation, addedById: userId },
        });
      }
    });
    await auditService.log("gap_closure.check.decided", { userId: sub, targetTableName: "gap_closure_checks", targetRecordId: check.id, details: { gapId: gap.id, decision: result.decision, reasons: result.reasons, bound: result.bound } });
    return checkView(check.id);
  },

  /** GET /checks/:checkId/dossier */
  async getDossier(sub: string, checkId: string): Promise<GapClosureDossier> {
    const userId = await resolveUserId(sub);
    const { check, gap } = await loadCheckForUser(checkId, userId);
    const prisma = getPrisma();
    const [documents, coverage, coverageItems, calibration, questions] = await Promise.all([
      loadDocuments(check.id),
      check.coverageCheckId ? prisma.coverageCheck.findUnique({ where: { id: check.coverageCheckId } }) : null,
      check.coverageCheckId ? prisma.coverageCheckItem.findMany({ where: { coverageCheckId: check.coverageCheckId } }) : [],
      check.calibrationId ? prisma.closureCalibration.findUnique({ where: { id: check.calibrationId } }) : null,
      check.calibrationId ? prisma.calibrationQuestion.findMany({ where: { calibrationId: check.calibrationId } }) : [],
    ]);
    return buildDossier({
      generatedAt: new Date(),
      gap: gap ? { id: gap.id, title: gap.title, topic: gap.topic } : undefined,
      check: toCheckView(check, documents),
      coverage: coverage ? toCoverageView(coverage, coverageItems) : undefined,
      calibration: calibration ? toCalibrationView(calibration, questions) : undefined,
      defaults: { delta: env.GAP_CLOSURE_DELTA, maxFalseNovelty: env.GAP_MAX_FALSE_NOVELTY },
    });
  },

  async getDossierMarkdown(sub: string, checkId: string): Promise<{ filename: string; markdown: string }> {
    const dossier = await this.getDossier(sub, checkId);
    return { filename: dossierFilename(dossier.check), markdown: dossierMarkdown(dossier) };
  },
};

/**
 * A deciding label changed after the decision: the decision no longer reflects the labels. Back to SCREENING with the
 * decision cleared; when this was the gap's latest check the gap is NOT_CHECKED again and its witness evidence is removed.
 */
async function reopenCheck(tx: Prisma.TransactionClient, check: { id: string; targetKind: string; targetId: string }) {
  await tx.gapClosureCheck.update({
    where: { id: check.id },
    data: {
      status: "SCREENING",
      decision: null,
      decisionReasons: [],
      witnessDocumentId: null,
      judgeKind: null,
      coverageCheckId: null,
      calibrationId: null,
      delta: null,
      epsHat: null,
      pHat: null,
      bound: null,
      maxFalseNovelty: null,
      corroborated: false,
      decidedById: null,
      decidedAt: null,
    },
  });
  if (check.targetKind !== "GAP") return;
  const gap = await tx.researchGap.findUnique({ where: { id: check.targetId }, select: { latestClosureCheckId: true } });
  if (gap?.latestClosureCheckId !== check.id) return;
  await tx.researchGap.update({ where: { id: check.targetId }, data: { closureStatus: "NOT_CHECKED" } });
  await tx.gapEvidenceRecord.deleteMany({ where: { gapId: check.targetId, evidenceKind: "COUNTER", evidenceType: WITNESS_EVIDENCE_TYPE } });
}
