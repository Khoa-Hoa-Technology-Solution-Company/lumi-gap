import { aiModel } from "../user-ai/user-ai.runtime.js";
import type { AgreementBucket, AgreementStats, QualityAssessment, QualityEvaluation, QualityLanguage, QualityTargetKind, QualityView, RatingSummary } from "@trend/shared-types";
import type { Prisma, QualityEvaluation as EvaluationRow } from "../../generated/prisma/client.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { syncUserPoints } from "../auth/points.service.js";
import { cachedGenerateJSON } from "../llm/llm.run.js";
import { LlmQuotaError } from "../llm/gemini.client.js";
import type { EvaluateInput, RateInput } from "./dto/quality.schema.js";
import { QUALITY_JUDGE_SYSTEM_PROMPT, QUALITY_PROMPT_VERSION, QUALITY_MAX_EVIDENCE, buildQualityJudgeInput, type JudgeEvidence, type QualityJudgeInput } from "./quality.prompt.js";
import { qualityScores, validateQualityAssessment } from "./quality.assessment.js";
import { requireCurrentProjectMembership } from "../authorization/project-membership.js";

function whereId(value: string) { const parsed = parseDatabaseId(value); if (!parsed) throw AppError.badRequest("Invalid identifier"); return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value }; }
async function user(value: string) { const row = await getPrisma().user.findUnique({ where: whereId(value) }); if (!row) throw AppError.notFound("User not found"); return row; }
async function target(kind: QualityTargetKind, value: string) { const where = whereId(value); if (kind === "paper") return getPrisma().paper.findUnique({ where }); if (kind === "report") return getPrisma().report.findUnique({ where }); return getPrisma().researchGap.findUnique({ where }); }
function targetWhere(kind: QualityTargetKind, id: string) { return kind === "paper" ? { paperId: id } : kind === "report" ? { reportId: id } : { gapId: id }; }
function targetData(kind: QualityTargetKind, id: string) { return targetWhere(kind, id); }
function targetKindOf(row: { paperId: string | null; reportId: string | null; gapId: string | null }): QualityTargetKind { return row.paperId ? "paper" : row.reportId ? "report" : "gap"; }
function targetIdOf(row: { paperId: string | null; reportId: string | null; gapId: string | null }) { return row.paperId ?? row.reportId ?? row.gapId!; }
function toEvaluationDto(row: EvaluationRow, input?: QualityJudgeInput): QualityEvaluation {
  const stored = row.assessment as unknown as QualityAssessment | null;
  const details = stored?.rubric?.version && Array.isArray(stored.criteria) ? stored : undefined;
  return {
    targetKind: targetKindOf(row), targetId: targetIdOf(row), relevance: row.relevance,
    groundedness: row.groundedness, completeness: row.completeness, overall: row.overall,
    rationale: row.rationale, model: row.model, createdAt: row.createdAt.toISOString(),
    evaluatedAt: row.updatedAt.toISOString(), details,
    freshness: !details ? "legacy" : row.promptVersion === QUALITY_PROMPT_VERSION && row.inputFingerprint === input?.inputFingerprint ? "current" : "outdated",
  };
}
async function loadEvidence(ids: string[]): Promise<JudgeEvidence[]> {
  const rows = await getPrisma().paper.findMany({ where: { id: { in: ids }, dataStatus: "active" }, orderBy: { id: "asc" }, select: { id: true, legacyMongoId: true, title: true, abstractText: true } });
  return rows.map((row) => ({ id: publicDatabaseId(row), title: row.title, abstractText: row.abstractText ?? undefined }));
}
export async function resolveQualityTarget(userIdInput: string, kind: QualityTargetKind, id: string) {
  const [owner, row] = await Promise.all([user(userIdInput), target(kind, id)]);
  const notFound = () => AppError.notFound(kind === "gap" ? "Research gap not found" : `${kind[0]!.toUpperCase()}${kind.slice(1)} not found`);
  if (!row || (kind === "paper" && "dataStatus" in row && row.dataStatus !== "active")) throw notFound();
  if (kind !== "paper" && "userId" in row) {
    if (row.projectId) await requireCurrentProjectMembership(row.projectId, owner.id);
    else if (row.userId !== owner.id) throw notFound();
  }
  return { owner, row };
}
const assertCanAccess = resolveQualityTarget;

async function inputForTarget(kind: QualityTargetKind, row: Awaited<ReturnType<typeof target>> & {}, language: QualityLanguage): Promise<QualityJudgeInput> {
  if (kind === "paper" && "abstractText" in row) return buildQualityJudgeInput({ kind, title: row.title, content: row.abstractText ?? "", language });
  if (kind === "report" && "markdown" in row) {
    const where = { reportId: row.id, kind: "grounding" };
    const [links, evidenceTotal] = await Promise.all([getPrisma().reportPaper.findMany({ where, orderBy: { paperId: "asc" }, take: QUALITY_MAX_EVIDENCE, select: { paperId: true } }), getPrisma().reportPaper.count({ where })]);
    return buildQualityJudgeInput({ kind, title: row.title ?? row.query, context: row.query, content: row.markdown ?? "", evidence: await loadEvidence(links.map((link) => link.paperId)), evidenceTotal, language });
  }
  if ("description" in row && "rationale" in row && "topic" in row) {
    const where = { gapId: row.id, kind: "supporting" };
    const [links, evidenceTotal] = await Promise.all([getPrisma().researchGapPaper.findMany({ where, orderBy: { paperId: "asc" }, take: QUALITY_MAX_EVIDENCE, select: { paperId: true } }), getPrisma().researchGapPaper.count({ where })]);
    const content = [
      ["Description", row.description], ["Rationale", row.rationale], ["Scope", row.scope],
      ["Established knowledge", row.establishedKnowledge], ["Observed limitation", row.observedLimitation],
      ["Missing evidence", row.missingEvidence], ["Significance", row.significanceExplanation],
      ["Suggested research question", row.suggestedResearchQuestion], ["Assumptions", row.assumptions],
    ].filter(([, value]) => value?.trim()).map(([label, value]) => `${label}: ${value}`).join("\n\n");
    return buildQualityJudgeInput({ kind, title: row.title, context: row.topic, content, evidence: await loadEvidence(links.map((link) => link.paperId)), evidenceTotal, language });
  }
  throw AppError.badRequest("Unsupported quality target");
}

async function prepareEvaluation(userId: string, request: EvaluateInput) {
  // Authorization must precede cache inspection, including legacy evaluations.
  const { owner, row } = await resolveQualityTarget(userId, request.targetKind, request.targetId);
  if (request.targetKind === "paper" && "abstractText" in row && !row.abstractText?.trim()) throw AppError.badRequest("Bài không đủ dữ liệu để AI đánh giá (thiếu tóm tắt).");
  if (request.targetKind === "report" && "markdown" in row && (row.status !== "ready" || !row.markdown?.trim())) throw AppError.badRequest("Report is not ready to evaluate yet");
  const current = await getPrisma().qualityEvaluation.findFirst({ where: targetWhere(request.targetKind, row.id) });
  const input = await inputForTarget(request.targetKind, row, request.language ?? "en");
  return { ownerId: owner.id, targetId: row.id, input, current: current ? toEvaluationDto(current, input) : undefined };
}
async function summarize(kind: QualityTargetKind, id: string): Promise<RatingSummary> { const rows = await getPrisma().userRating.groupBy({ by: ["userId"], where: targetWhere(kind, id), _avg: { stars: true } }); if (!rows.length) return { avg: 0, count: 0 }; return { avg: Math.round((rows.reduce((sum, row) => sum + (row._avg.stars ?? 0), 0) / rows.length) * 10) / 10, count: rows.length }; }

export const qualityService = {
  prepareEvaluation,
  /** Invoked by the ai-jobs worker; HTTP handlers only enqueue this operation. */
  async evaluate(userId: string, request: EvaluateInput): Promise<QualityEvaluation> {
    const prepared = await prepareEvaluation(userId, request);
    if (!request.force && prepared.current?.freshness === "current") return prepared.current;
    const { input, targetId } = prepared;
    let details: QualityAssessment;
    try {
      const raw = await cachedGenerateJSON<unknown>({
        task: "judge", promptVersion: QUALITY_PROMPT_VERSION,
        keyParts: { targetKind: request.targetKind, targetId, language: input.rubric.language },
        inputHash: input.inputFingerprint, model: aiModel(), bypassCache: request.force,
        prompt: input.prompt, validate: (candidate) => { validateQualityAssessment(candidate, input); return candidate; },
        options: { system: QUALITY_JUDGE_SYSTEM_PROMPT, temperature: 0.2, maxOutputTokens: 8192 },
      });
      // Revalidate even when the generation adapter is replaced (e.g. a provider integration).
      details = validateQualityAssessment(raw, input);
    } catch (error) {
      if (error instanceof LlmQuotaError) throw error;
      throw AppError.serviceUnavailable("AI evaluation is temporarily unavailable. Please try again.");
    }
    const data = { ...qualityScores(details), rationale: details.summary, model: aiModel(), promptVersion: QUALITY_PROMPT_VERSION, assessment: details as unknown as Prisma.InputJsonValue, inputFingerprint: input.inputFingerprint };
    const saved = await getPrisma().$transaction(async (tx) => {
      // A per-target lock avoids races against the SQL-only partial unique indexes.
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`quality:${request.targetKind}:${targetId}`}))`;
      const existing = await tx.qualityEvaluation.findFirst({ where: targetWhere(request.targetKind, targetId) });
      return existing ? tx.qualityEvaluation.update({ where: { id: existing.id }, data }) : tx.qualityEvaluation.create({ data: { ...targetData(request.targetKind, targetId), ...data } });
    });
    return toEvaluationDto(saved, input);
  },
  async rate(userIdInput: string, input: RateInput) { const { owner, row } = await assertCanAccess(userIdInput, input.targetKind, input.targetId); if (owner.role === "admin") throw AppError.forbidden("Administrators are not allowed to rate papers/reports/gaps"); if (input.targetKind === "paper" && "uploadedById" in row && (row.uploadedById === owner.id || row.requestedById === owner.id)) throw AppError.forbidden("You cannot review a paper that you uploaded or requested"); const existing = await getPrisma().userRating.findFirst({ where: { userId: owner.id, ...targetWhere(input.targetKind, row.id) } }); if (existing) await getPrisma().userRating.update({ where: { id: existing.id }, data: { stars: input.stars, comment: input.comment } }); else await getPrisma().userRating.create({ data: { userId: owner.id, ...targetData(input.targetKind, row.id), stars: input.stars, comment: input.comment } }); const ratingSummary = await summarize(input.targetKind, row.id); await syncUserPoints(owner.id); return { ratingSummary, myRating: { stars: input.stars, comment: input.comment } }; },
  async deleteRate(userIdInput: string, ratingId: string) { const owner = await user(userIdInput); const rating = await getPrisma().userRating.findUnique({ where: whereId(ratingId) }); if (!rating) throw AppError.notFound("Rating not found"); if (rating.userId !== owner.id) throw AppError.forbidden("You are only allowed to delete your own rating"); await getPrisma().userRating.delete({ where: { id: rating.id } }); const ratingSummary = await summarize(targetKindOf(rating), targetIdOf(rating)); await syncUserPoints(owner.id); return { ratingSummary }; },
  async view(userIdInput: string, kind: QualityTargetKind, id: string): Promise<QualityView> { const { owner, row } = await assertCanAccess(userIdInput, kind, id); const where = targetWhere(kind, row.id); const [evaluation, ratingSummary, mine, ratings] = await Promise.all([getPrisma().qualityEvaluation.findFirst({ where }), summarize(kind, row.id), getPrisma().userRating.findFirst({ where: { userId: owner.id, ...where } }), getPrisma().userRating.findMany({ where, orderBy: { updatedAt: "desc" } })]); const users = await getPrisma().user.findMany({ where: { id: { in: ratings.map((rating) => rating.userId) } }, select: { id: true, legacyMongoId: true, fullName: true, avatarUrl: true } }); const byId = new Map(users.map((item) => [item.id, item])); const stored = evaluation?.assessment as unknown as QualityAssessment | null; const input = stored?.rubric ? await inputForTarget(kind, row, stored.rubric.language) : undefined; return { evaluation: evaluation ? toEvaluationDto(evaluation, input) : undefined, ratingSummary, myRating: mine ? { stars: mine.stars, comment: mine.comment ?? undefined } : undefined, allRatings: ratings.map((rating) => { const author = byId.get(rating.userId); return { id: publicDatabaseId(rating), user: author ? { id: publicDatabaseId(author), fullName: author.fullName, avatarUrl: author.avatarUrl ?? undefined } : null, stars: rating.stars, comment: rating.comment ?? undefined, updatedAt: rating.updatedAt.toISOString() }; }) }; },
  async agreement(): Promise<AgreementStats> {
    const evaluations = await getPrisma().qualityEvaluation.findMany();
    if (!evaluations.length) return emptyAgreement();
    const ratings = await getPrisma().userRating.findMany();
    const grouped = new Map<string, number[]>();
    for (const rating of ratings) {
      const key = `${targetKindOf(rating)}:${targetIdOf(rating)}`;
      grouped.set(key, [...(grouped.get(key) ?? []), rating.stars]);
    }
    const pairs = evaluations.flatMap((evaluation) => {
      if (evaluation.overall === null) return [];
      const kind = targetKindOf(evaluation), values = grouped.get(`${kind}:${targetIdOf(evaluation)}`);
      return values?.length ? [{ kind, llm: evaluation.overall, user: values.reduce((a, b) => a + b, 0) / values.length }] : [];
    });
    const all = bucketize(pairs);
    return { ...all, byKind: { report: bucketize(pairs.filter((pair) => pair.kind === "report")), gap: bucketize(pairs.filter((pair) => pair.kind === "gap")), paper: bucketize(pairs.filter((pair) => pair.kind === "paper")) } };
  },
};
function bucketize(pairs: { llm: number; user: number }[]): AgreementBucket { const n = pairs.length; if (!n) return { sampleSize: 0, mae: 0, withinOnePct: 0, correlation: null }; const mae = pairs.reduce((sum, pair) => sum + Math.abs(pair.llm - pair.user), 0) / n; return { sampleSize: n, mae: Math.round(mae * 100) / 100, withinOnePct: Math.round((pairs.filter((pair) => Math.abs(pair.llm - pair.user) <= 1).length / n) * 100), correlation: n >= 3 ? pearson(pairs.map((pair) => pair.llm), pairs.map((pair) => pair.user)) : null }; }
function pearson(xs: number[], ys: number[]) { const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n; let numerator = 0, dx = 0, dy = 0; for (let index = 0; index < n; index++) { const a = xs[index]! - mx, b = ys[index]! - my; numerator += a * b; dx += a * a; dy += b * b; } const denominator = Math.sqrt(dx * dy); return denominator ? Math.round((numerator / denominator) * 100) / 100 : null; }
function emptyAgreement(): AgreementStats { const zero: AgreementBucket = { sampleSize: 0, mae: 0, withinOnePct: 0, correlation: null }; return { sampleSize: 0, mae: 0, withinOnePct: 0, correlation: null, byKind: { report: zero, gap: zero, paper: zero } }; }
