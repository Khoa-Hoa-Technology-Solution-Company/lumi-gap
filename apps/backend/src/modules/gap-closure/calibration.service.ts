import type { CalibrationQuestionView, ClosureCalibrationView } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { env } from "../../config/env.js";
import { Prisma } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { gapsQueue } from "../../infrastructure/queue.js";
import { logger } from "../../infrastructure/logger.js";
import { auditService } from "../audit/audit.service.js";
import {
  GAP_CLOSURE_JOB,
  GAP_CLOSURE_PROTOCOL_VERSION,
  calibrationOutcome,
  clopperPearsonUpper,
  type GapClosureJob,
  type ScreenedDocument,
} from "./closure.rules.js";
import { assertCanManageCalibrations, resolveUserId } from "./closure.access.js";
import { parseQueryLog, toCalibrationQuestionView, toCalibrationView } from "./dossier.js";
import type { CreateCalibrationQuestionDto, CreateClosureCalibrationDto } from "./dto/closure.schema.js";

/** Check states in which the AI screening is over, so the documents can be judged. */
const SETTLED_CHECK_STATUSES = ["SCREENING", "DECIDED"];

export type QuestionOutcome = "FOUND" | "MISSED" | "PENDING";

/**
 * Outcome of one calibration question from its check. A check that is not settled (queued, running, failed or
 * missing) is PENDING: it must never count as a miss. In a HUMAN calibration every found document needs a person's
 * label first, otherwise the question was judged by the AI and does not belong in a HUMAN rate.
 */
export function questionOutcome(input: {
  checkStatus?: string | null;
  documents: Array<ScreenedDocument & { humanLabel?: string | null }>;
  searchErrors: number;
  judgeKind: string;
}): QuestionOutcome {
  if (!input.checkStatus || !SETTLED_CHECK_STATUSES.includes(input.checkStatus)) return "PENDING";
  if (input.judgeKind === "HUMAN" && input.documents.some((doc) => !doc.humanLabel)) return "PENDING";
  return calibrationOutcome(input.documents, input.searchErrors);
}

async function loadCalibration(id: string) {
  const row = await getPrisma().closureCalibration.findUnique({ where: { id } });
  if (!row) throw AppError.notFound("Calibration not found");
  return row;
}

/** Calibrations are changed only by their creator (who also needed GAP_VALIDATION or admin to create it). */
async function loadOwnedCalibration(id: string, userId: string) {
  const row = await loadCalibration(id);
  if (row.createdById !== userId) throw AppError.forbidden("Only the calibration creator can change it");
  return row;
}

async function viewOf(id: string): Promise<ClosureCalibrationView> {
  const [row, questions] = await Promise.all([loadCalibration(id), getPrisma().calibrationQuestion.findMany({ where: { calibrationId: id } })]);
  return toCalibrationView(row, questions);
}

export const calibrationService = {
  /** POST /calibrations */
  async create(sub: string, body: CreateClosureCalibrationDto): Promise<ClosureCalibrationView> {
    const userId = await resolveUserId(sub);
    await assertCanManageCalibrations(userId);
    const row = await getPrisma().closureCalibration.create({
      data: { name: body.name, domain: body.domain, judgeKind: body.judgeKind, protocolVersion: GAP_CLOSURE_PROTOCOL_VERSION, status: "DRAFT", delta: env.GAP_CLOSURE_DELTA, createdById: userId },
    });
    await auditService.log("gap_closure.calibration.created", { userId: sub, targetTableName: "closure_calibrations", targetRecordId: row.id, details: { domain: body.domain, judgeKind: body.judgeKind } });
    return toCalibrationView(row);
  },

  /** GET /calibrations */
  async list(): Promise<ClosureCalibrationView[]> {
    const rows = await getPrisma().closureCalibration.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    return rows.map((row) => toCalibrationView(row));
  },

  /** GET /calibrations/:id */
  async get(id: string): Promise<ClosureCalibrationView> {
    return viewOf(id);
  },

  /** POST /calibrations/:id/questions */
  async addQuestion(sub: string, id: string, body: CreateCalibrationQuestionDto): Promise<CalibrationQuestionView> {
    const userId = await resolveUserId(sub);
    const calibration = await loadOwnedCalibration(id, userId);
    if (calibration.status === "COMPUTED") throw AppError.conflict("A computed calibration is final: create a new calibration to add questions");
    const row = await getPrisma().calibrationQuestion.create({
      data: {
        calibrationId: calibration.id,
        question: body.question,
        facets: (body.facets ?? {}) as Prisma.InputJsonObject,
        witnessDoi: body.witnessDoi,
        witnessQuote: body.witnessQuote || null,
        labelSource: body.labelSource,
        labelSourceRef: body.labelSourceRef || null,
        createdById: userId,
      },
    });
    return toCalibrationQuestionView(row);
  },

  /** DELETE /calibrations/:id/questions/:questionId */
  async deleteQuestion(sub: string, id: string, questionId: string): Promise<void> {
    const userId = await resolveUserId(sub);
    const calibration = await loadOwnedCalibration(id, userId);
    const question = await getPrisma().calibrationQuestion.findFirst({ where: { id: questionId, calibrationId: calibration.id } });
    if (!question) throw AppError.notFound("Calibration question not found");
    if (question.result !== "PENDING" || calibration.status === "COMPUTED") throw AppError.conflict("Only a pending question of an uncomputed calibration can be removed");
    await getPrisma().calibrationQuestion.delete({ where: { id: question.id } });
  },

  /**
   * POST /calibrations/:id/run — one check per PENDING question that has no check yet (or whose check FAILED).
   * Calibration checks are platform work: no credits are charged.
   */
  async run(sub: string, id: string): Promise<ClosureCalibrationView> {
    const userId = await resolveUserId(sub);
    const calibration = await loadOwnedCalibration(id, userId);
    if (calibration.status === "COMPUTED") throw AppError.conflict("This calibration is already computed");
    const prisma = getPrisma();
    const questions = await prisma.calibrationQuestion.findMany({ where: { calibrationId: calibration.id, result: "PENDING" } });
    if (!questions.length) throw AppError.badRequest("Add at least one question before running the calibration");
    const existing = await prisma.gapClosureCheck.findMany({ where: { id: { in: questions.flatMap((question) => (question.closureCheckId ? [question.closureCheckId] : [])) } }, select: { id: true, status: true } });
    const statusById = new Map(existing.map((check) => [check.id, check.status]));
    const toStart = questions.filter((question) => !question.closureCheckId || !statusById.has(question.closureCheckId) || statusById.get(question.closureCheckId) === "FAILED");

    const created = await prisma.$transaction(async (tx) => {
      const checkIds: string[] = [];
      for (const question of toStart) {
        const check = await tx.gapClosureCheck.create({
          data: { targetKind: "CALIBRATION_QUESTION", targetId: question.id, protocolVersion: GAP_CLOSURE_PROTOCOL_VERSION, status: "QUEUED", question: question.question, facets: (question.facets ?? {}) as Prisma.InputJsonObject, queries: [], createdById: userId },
        });
        await tx.calibrationQuestion.update({ where: { id: question.id }, data: { closureCheckId: check.id } });
        checkIds.push(check.id);
      }
      await tx.closureCalibration.update({ where: { id: calibration.id }, data: { status: "RUNNING" } });
      return checkIds;
    });

    const failed: string[] = [];
    for (const checkId of created) {
      try {
        await gapsQueue.add(GAP_CLOSURE_JOB, { checkId } satisfies GapClosureJob, { jobId: checkId });
      } catch (error) {
        logger.error({ err: error, checkId, calibrationId: calibration.id }, "calibration check could not be queued");
        failed.push(checkId);
      }
    }
    if (failed.length) {
      await prisma.gapClosureCheck.updateMany({ where: { id: { in: failed }, status: "QUEUED" }, data: { status: "FAILED", errorMessage: "Could not queue the closure check" } });
      throw AppError.serviceUnavailable(`${failed.length} calibration check(s) could not be queued: run the calibration again`);
    }
    await auditService.log("gap_closure.calibration.run", { userId: sub, targetTableName: "closure_calibrations", targetRecordId: calibration.id, details: { started: created.length } });
    return viewOf(calibration.id);
  },

  /** POST /calibrations/:id/compute — n, misses and epsHat from the settled checks; 409 while any question is pending. */
  async compute(sub: string, id: string): Promise<ClosureCalibrationView> {
    const userId = await resolveUserId(sub);
    const calibration = await loadOwnedCalibration(id, userId);
    const prisma = getPrisma();
    const questions = await prisma.calibrationQuestion.findMany({ where: { calibrationId: calibration.id } });
    if (!questions.length) throw AppError.badRequest("The calibration has no questions");

    const checkIds = questions.flatMap((question) => (question.closureCheckId ? [question.closureCheckId] : []));
    const [checks, documents] = await Promise.all([
      prisma.gapClosureCheck.findMany({ where: { id: { in: checkIds } } }),
      prisma.gapClosureDocument.findMany({ where: { checkId: { in: checkIds } } }),
    ]);
    const outcomes = questions.map((question) => {
      const check = checks.find((row) => row.id === question.closureCheckId);
      return {
        question,
        outcome: questionOutcome({
          checkStatus: check?.status,
          documents: documents.filter((doc) => doc.checkId === question.closureCheckId),
          searchErrors: check ? parseQueryLog(check.queries).filter((query) => query.error).length : 0,
          judgeKind: calibration.judgeKind,
        }),
      };
    });
    const pending = outcomes.filter((entry) => entry.outcome === "PENDING").length;
    if (pending) throw AppError.conflict(`${pending} calibration question(s) are still pending`, { pending });

    const misses = outcomes.filter((entry) => entry.outcome === "MISSED").length;
    const n = outcomes.length;
    const epsHat = clopperPearsonUpper(misses, n, calibration.delta);
    await prisma.$transaction(async (tx) => {
      for (const { question, outcome } of outcomes) await tx.calibrationQuestion.update({ where: { id: question.id }, data: { result: outcome } });
      await tx.closureCalibration.update({ where: { id: calibration.id }, data: { n, misses, epsHat, status: "COMPUTED", computedAt: new Date() } });
    });
    await auditService.log("gap_closure.calibration.computed", { userId: sub, targetTableName: "closure_calibrations", targetRecordId: calibration.id, details: { n, misses, epsHat } });
    return viewOf(calibration.id);
  },
};
