import { createHash } from "node:crypto";
import type { ScreeningRoundView, ScreeningReview, ScreeningSettings as Settings } from "@trend/shared-types";
import type { ScreeningRound } from "../../generated/prisma/client.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { jsonSnapshot, withWorkspace, workspaceEvent, workspaceRevision, type WorkspaceContext, type WorkspaceDb } from "./workspace-access.js";
import { invalidateSourceAssessments } from "./gap-revision.js";
import { screeningConsensus, independentWorkflow } from "./screening.calculator.js";
import { screeningAdjudicators, screeningDiscussionReady } from "./screening-adjudication-context.js";
import { screeningAgreement } from "./screening-agreement-context.js";
import { projectQuestionOptions } from "./screening-review-context.js";
import { screeningPeople, effectiveAssignments } from "./screening-assignments.js";
export { screeningPeople, effectiveAssignments } from "./screening-assignments.js";

export const screeningHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
/** Old immutable snapshots keep their original policy and receive explicit compatibility defaults. */
export function roundSettings(value: unknown): Settings {
  const settings = value as Settings;
  return { ...settings, reviewMode: settings.reviewMode ?? "INDEPENDENT", blindReview: independentWorkflow(settings) ? true : settings.blindReview ?? true, resolutionPolicy: settings.resolutionPolicy ?? "ADJUDICATION" };
}
export async function screeningSettings(c: WorkspaceContext): Promise<Settings> {
  const questionOptions = await projectQuestionOptions(c);
  const row = await c.tx.screeningSettings.findUnique({ where: { projectId: c.project.id } });
  if (row) return { authorizedAdjudicatorIds: row.authorizedAdjudicatorIds, allowConservativeFullText: row.allowConservativeFullText, workflowVersion: 5, reviewMode: row.reviewMode as Settings["reviewMode"], blindReview: row.reviewMode === "INDEPENDENT" || row.blindReview, resolutionPolicy: row.resolutionPolicy as Settings["resolutionPolicy"], version: row.version, requiredReviewers: row.requiredReviewers, consensusPolicy: row.consensusPolicy as Settings["consensusPolicy"], aiAssisted: row.aiAssisted, inclusionCriteria: row.inclusionCriteria, exclusionCriteria: row.exclusionCriteria, researchQuestions: row.researchQuestions, stages: row.stages as Settings["stages"], questionOptions, discoveryGoalEnabled: row.discoveryGoalEnabled, discoveryGoalTarget: row.discoveryGoalTarget, discoveryGoalPeriod: (row.discoveryGoalPeriod as Settings["discoveryGoalPeriod"]) || "WEEK", discoveryGoalPaused: row.discoveryGoalPaused };
  const plan = await c.tx.researchPlan.findUnique({ where: { projectId: c.project.id }, select: { questions: true } });
  const questions = Array.isArray(plan?.questions) ? plan.questions.flatMap(q => q && typeof q === "object" && !Array.isArray(q) && typeof q.text === "string" ? [q.text] : []) : [];
  const single = (await screeningPeople(c)).length < 2;
  return { authorizedAdjudicatorIds: [], allowConservativeFullText: true, workflowVersion: 5, reviewMode: single ? "SIMPLE" : "INDEPENDENT", blindReview: true, resolutionPolicy: "ADJUDICATION", version: 0, requiredReviewers: single ? 1 : 2, consensusPolicy: "UNANIMOUS", aiAssisted: false, inclusionCriteria: c.project.inclusionCriteria, exclusionCriteria: c.project.exclusionCriteria, researchQuestions: questions, stages: ["TITLE_ABSTRACT", "FULL_TEXT"], questionOptions, discoveryGoalEnabled: false, discoveryGoalTarget: 2, discoveryGoalPeriod: "WEEK", discoveryGoalPaused: false };
}
export async function screeningRound(c: WorkspaceContext, id: string) {
  const row = await c.tx.screeningRound.findFirst({ where: { id, projectId: c.project.id } });
  if (!row) throw AppError.notFound("Không tìm thấy vòng sàng lọc trong dự án"); return row;
}
/** Freeze the initial team-size recommendation on the first write, never on a read. */
export async function settingsForNewScreening(c: WorkspaceContext): Promise<Settings> {
  const settings = await screeningSettings(c);
  if (settings.version > 0) return settings;
  const row = await c.tx.screeningSettings.create({ data: {
    projectId: c.project.id, reviewMode: settings.reviewMode, blindReview: settings.blindReview,
    resolutionPolicy: settings.resolutionPolicy, requiredReviewers: settings.requiredReviewers,
    consensusPolicy: settings.consensusPolicy, aiAssisted: settings.aiAssisted,
    inclusionCriteria: settings.inclusionCriteria, exclusionCriteria: settings.exclusionCriteria,
    researchQuestions: settings.researchQuestions, stages: settings.stages ?? [],
    authorizedAdjudicatorIds: settings.authorizedAdjudicatorIds ?? [], allowConservativeFullText: settings.allowConservativeFullText ?? false, discoveryGoalEnabled: settings.discoveryGoalEnabled ?? false, discoveryGoalTarget: settings.discoveryGoalTarget ?? 2, discoveryGoalPeriod: settings.discoveryGoalPeriod ?? "WEEK", discoveryGoalPaused: settings.discoveryGoalPaused ?? false,
  } });
  await c.tx.screeningAudit.create({ data: { projectId: c.project.id, actorId: c.actorId, type: "DEFAULT_RULES_SAVED", details: jsonSnapshot({ ...settings, version: row.version }) } });
  return { ...settings, version: row.version };
}
export async function roundView(c: WorkspaceContext, row: ScreeningRound): Promise<ScreeningRoundView> {
  const settings = roundSettings(row.settings), assignments = await effectiveAssignments(c, row.id);
  const visible = screeningReviewsVisible(row, settings, assignments);
  const protocol = independentWorkflow(settings);
  const finalizerId = row.finalizerId ?? (protocol ? "" : c.project.ownerId);
  const finalizer = finalizerId ? await c.tx.user.findUnique({ where: { id: finalizerId }, select: { fullName: true } }) : null;
  const names = await c.tx.user.findMany({ where: { id: { in: assignments.map(a => a.reviewerId) } }, select: { id: true, fullName: true } });
  const submitted = assignments.filter(a => a.submittedAt);
  const reviews = await c.tx.screeningReview.findMany({ where: { projectId: c.project.id, OR: assignments.filter(a => visible || a.reviewerId === c.actorId).map(a => ({ assignmentId: a.id, revision: a.revision })) } });
  const shown = reviews.map(r => ({ id: r.id, assignmentId: r.assignmentId, reviewerId: assignments.find(a => a.id === r.assignmentId)!.reviewerId, revision: r.revision, decision: r.decision as "INCLUDE" | "EXCLUDE" | "UNSURE", exclusionReason: r.exclusionReason, comment: r.comment, scope: r.scope as ScreeningReview["scope"], fullTextReference: r.fullTextReference, researchQuestions: r.researchQuestions as unknown as ScreeningReview["researchQuestions"], submittedAt: r.submittedAt.toISOString() }));
  const own = assignments.find(a => a.reviewerId === c.actorId);
  const final = row.unblindedAt && ["INCLUDED", "EXCLUDED", "BACKGROUND"].includes(row.status) ? await c.tx.screeningFinalDecision.findFirst({ where: { roundId: row.id }, orderBy: { roundVersion: "desc" } }) : null;
  const pendingResolution = visible && row.status === "NEEDS_MORE_INFO" ? await c.tx.screeningFinalDecision.findFirst({ where: { roundId: row.id, decision: "NEEDS_MORE_INFO", roundVersion: row.version }, orderBy: { roundVersion: "desc" } }) : null;
  const writable = !["ARCHIVED", "COMPLETED"].includes(c.project.status) && row.active;
  const needsAdjudication = protocol && ["NEEDS_RESOLUTION", "NEEDS_MORE_INFO", "ADJUDICATING"].includes(row.status);
  const discussionReady = needsAdjudication && await screeningDiscussionReady(c, row);
  const adjudicators = needsAdjudication ? await screeningAdjudicators(c, row) : [];
  const provisionalAdvance = Boolean(await c.tx.screeningAudit.findFirst({ where: { projectId: c.project.id, roundId: row.id, type: "STAGE_ADVANCED", details: { path: ["provisional"], equals: true } }, select: { id: true } }));
  return { provisionalAdvance, canAdvanceConservatively: writable && visible && !row.finalizerId && needsAdjudication && discussionReady && row.phase === "TITLE_ABSTRACT" && settings.allowConservativeFullText === true && Boolean(settings.stages?.includes("FULL_TEXT")) && Boolean(own?.submittedAt) && adjudicators.length === 0, resolution: pendingResolution ? { decision: "NEEDS_MORE_INFO" as const, reason: pendingResolution.reason, createdAt: pendingResolution.createdAt.toISOString() } : null, canRequestAdjudication: writable && protocol && needsAdjudication && !row.finalizerId && settings.resolutionPolicy === "ADJUDICATION" && Boolean(own?.submittedAt) && discussionReady, reviewerIntakeClosed: protocol && Boolean(row.unblindedAt), canProposeAgreement: writable && protocol && (row.status === "NEEDS_RESOLUTION" || (settings.workflowVersion ?? 0) >= 5 && row.status === "NEEDS_MORE_INFO") && !row.finalizerId && Boolean(own?.submittedAt), agreement: protocol && visible ? await screeningAgreement(c, row) : null, finalizerAssigned: Boolean(row.finalizerId), ...(protocol ? { discussionReady, canReopenOwn: writable && Boolean(own?.submittedAt), ...(c.role === "OWNER" ? { adjudicators } : {}) } : {}), id: row.id, paperId: row.paperId, number: row.number, phase: row.phase as ScreeningRoundView["phase"], version: row.version, active: row.active, status: row.status as ScreeningRoundView["status"], settings: { ...settings, questionOptions: await projectQuestionOptions(c) }, extractionReady: row.status === "INCLUDED" && !(settings.reviewMode !== "COLLABORATIVE" && row.phase !== "FULL_TEXT" && ((settings.workflowVersion ?? 0) >= 5 || settings.stages?.includes("FULL_TEXT"))),
    unblindedAt: row.unblindedAt?.toISOString() ?? null, independenceCompromised: row.independenceCompromised, assigned: assignments.length, completed: submitted.length,
    assignments: assignments.map(a => ({ id: a.id, reviewerId: a.reviewerId, name: names.find(n => n.id === a.reviewerId)?.fullName || "Thành viên", revision: a.revision, completed: Boolean(a.submittedAt), active: a.active, dueAt: a.dueAt?.toISOString() ?? null, overdue: !a.submittedAt && Boolean(a.dueAt && a.dueAt < new Date()) })),
    canDefer: writable && settings.reviewMode === "COLLABORATIVE" && (c.actorId === finalizerId || c.role === "OWNER"),
    finalizer: { id: finalizerId, name: finalizer?.fullName || (protocol ? "Chưa chỉ định" : "Người chốt") }, canFinalize: writable && c.actorId === finalizerId && ["AWAITING_FINALIZATION", "NEEDS_RESOLUTION", "NEEDS_MORE_INFO", "ADJUDICATING"].includes(row.status),
    myAssignmentId: own?.id ?? null, reviews: shown, myReview: shown.find(r => r.reviewerId === c.actorId) ?? null, hiddenReviews: !visible,
    finalDecision: final ? { id: final.id, version: final.roundVersion, decision: final.decision as "INCLUDED" | "EXCLUDED" | "BACKGROUND", source: final.source as "CONSENSUS" | "MANUAL", reason: final.reason, resolverId: final.resolverId, createdAt: final.createdAt.toISOString() } : null,
    canReview: Boolean(writable && ((settings.reviewMode === "COLLABORATIVE") || (own && !own.submittedAt)) && !["INCLUDED", "EXCLUDED", "BACKGROUND"].includes(row.status)), canManage: writable && c.role === "OWNER", aiVisible: Boolean(row.unblindedAt || settings.aiAssisted) };
}
export function screeningReviewsVisible(row: Pick<ScreeningRound, "unblindedAt">, settings: Settings, assignments: Array<{ submittedAt: Date | null }>) {
  if (independentWorkflow(settings)) return Boolean(row.unblindedAt) && assignments.length >= settings.requiredReviewers && assignments.every(a => a.submittedAt);
  return !settings.blindReview || Boolean(row.unblindedAt);
}
export async function projectScreeningStatus(c: WorkspaceContext, row: ScreeningRound, status: string, reason = "", resolverId: string | null = null) {
  const link = await c.tx.projectPaper.findUniqueOrThrow({ where: { projectId_paperId: { projectId: c.project.id, paperId: row.paperId } } });
  const settings = roundSettings(row.settings);
  const awaitingFullText = status === "INCLUDED" && settings.reviewMode !== "COLLABORATIVE" && row.phase !== "FULL_TEXT" && ((settings.workflowVersion ?? 0) >= 5 || settings.stages?.includes("FULL_TEXT"));
  const legacyStatus = status === "NOT_REVIEWED" ? "UNDECIDED" : !awaitingFullText && ["INCLUDED", "EXCLUDED"].includes(status) ? status : "MAYBE";
  if (link.screeningStatus !== legacyStatus) await invalidateSourceAssessments(c.tx, c.project.id, c.actorId, { paperId: row.paperId });
  if (link.screeningStatus === "INCLUDED" && legacyStatus !== "INCLUDED") {
    const accepted = await c.tx.projectEvidenceItem.findMany({ where: { projectId: c.project.id, paperId: row.paperId, reviewState: "ACCEPTED" } });
    for (const evidence of accepted) {
      const next = await c.tx.projectEvidenceItem.update({ where: { id: evidence.id }, data: { reviewState: "PENDING", reviewRationale: "Kết quả sàng lọc nguồn đã thay đổi. Cần xem xét lại minh chứng trước khi sử dụng.", reviewedById: null, reviewedAt: null, version: { increment: 1 } } });
      await workspaceRevision(c, "EXTRACTION", next);
      await workspaceEvent(c, "EVIDENCE_SOURCE_CHANGED", "EXTRACTION", next.id, { version: next.version, roundId: row.id });
    }
  }
  await c.tx.projectPaper.update({ where: { id: link.id }, data: { screeningStatus: legacyStatus, screenedById: resolverId, screenedAt: ["INCLUDED", "EXCLUDED"].includes(status) ? new Date() : null,
    inclusionReason: status === "INCLUDED" ? reason : null, exclusionReason: status === "EXCLUDED" ? "OTHER" : null, exclusionNote: status === "EXCLUDED" ? reason : null,
    updatedAt: new Date(Math.max(Date.now(), link.updatedAt.getTime()+1)) } });
}
export async function recomputeScreening(c: WorkspaceContext, row: ScreeningRound) {
  const assignments = await effectiveAssignments(c, row.id), settings = roundSettings(row.settings);
  const reviews = await c.tx.screeningReview.findMany({ where: { projectId: c.project.id, OR: assignments.filter(a => a.submittedAt).map(a => ({ assignmentId: a.id, revision: a.revision })) } });
  const protocol = independentWorkflow(settings);
  const result = screeningConsensus(reviews.map(r => r.decision as "INCLUDE" | "EXCLUDE" | "UNSURE"), assignments.length, settings.requiredReviewers, "UNANIMOUS");
  const complete = assignments.length >= settings.requiredReviewers && assignments.every(a => a.submittedAt);
  const automatic = protocol && complete && ["INCLUDED", "EXCLUDED"].includes(result);
  const status = protocol && complete && reviews.some(r => r.decision === "UNSURE") ? "NEEDS_MORE_INFO"
    : automatic ? result : result === "NEEDS_RESOLUTION" && protocol && row.finalizerId ? "ADJUDICATING"
    : ["INCLUDED", "EXCLUDED"].includes(result) ? "AWAITING_FINALIZATION" : result;
  const updated = await c.tx.screeningRound.update({ where: { id: row.id }, data: { status, unblindedAt: row.unblindedAt ?? (complete ? new Date() : null), version: { increment: 1 } } });
  if (complete) await c.tx.screeningAudit.create({ data: { projectId: c.project.id, roundId: row.id, actorId: c.actorId, type: "REVIEWS_COMPLETED", details: { status, reviewMode: settings.reviewMode, resolutionPolicy: settings.resolutionPolicy, completionRule: "ALL_ASSIGNED", ruleVersion: settings.version, reviewIds: reviews.map(r => r.id) } } });
  if (automatic) {
    const reason = result === "INCLUDED" ? "Tất cả reviewer xác nhận phù hợp theo tiêu chí của vòng" : reviews.map(r => r.exclusionReason).filter(Boolean).join("; ");
    await c.tx.screeningFinalDecision.create({ data: { projectId: c.project.id, roundId: row.id, roundVersion: updated.version, decision: result, source: "CONSENSUS", reason, resolverId: null, reviewIds: reviews.map(r => r.id) } });
    await c.tx.screeningAudit.create({ data: { projectId: c.project.id, roundId: row.id, actorId: c.actorId, type: "CONSENSUS", details: { decision: result, ruleVersion: settings.version, workflowVersion: settings.workflowVersion ?? 3, reviewIds: reviews.map(r => r.id), automated: true } } });
    await projectScreeningStatus(c, row, status, reason);
    if (result === "INCLUDED") await advanceScreeningStage(c, updated, assignments);
    return updated;
  }
  await projectScreeningStatus(c, row, status, "");
  return updated;
}
export async function advanceScreeningStage(c: WorkspaceContext, row: ScreeningRound, assignments: Awaited<ReturnType<typeof effectiveAssignments>>, provisional = false) {
  const settings = roundSettings(row.settings);
  if (!independentWorkflow(settings) || row.phase !== "TITLE_ABSTRACT" || !settings.stages?.includes("FULL_TEXT")) return;
  await c.tx.screeningRound.update({ where: { id: row.id }, data: { active: false } });
  const next = await c.tx.screeningRound.create({ data: { projectId: c.project.id, paperId: row.paperId, number: row.number + 1, phase: "FULL_TEXT", settings: jsonSnapshot(settings), createdById: c.actorId } });
  const activePeople = new Set((await screeningPeople(c)).map(p => p.id));
  await c.tx.screeningAssignment.createMany({ data: assignments.filter(a => activePeople.has(a.reviewerId)).map(a => ({ projectId: c.project.id, roundId: next.id, reviewerId: a.reviewerId })) });
  await c.tx.screeningAudit.create({ data: { projectId: c.project.id, roundId: next.id, actorId: c.actorId, type: "STAGE_ADVANCED", details: { previousRoundId: row.id, phase: "FULL_TEXT", workflowVersion: settings.workflowVersion ?? 3, automated: !provisional, provisional } } });
  await projectScreeningStatus(c, next, "NOT_REVIEWED");
}
export function screeningCommand<T extends { clientKey: string }>(projectId: string, actorId: string, type: string, input: T, options: { owner?: boolean; accounts?: string[]; mentor?: boolean; mentorScope?: "SHARED_RESOURCES" }, run: (c: WorkspaceContext) => Promise<{ result: { roundId?: string; version?: number; roundIds?: string[]; id?: string; updatedAt?: string }; details?: unknown; roundId?: string; roundAudits?: { roundId: string; details: unknown }[] }>) {
  return withWorkspace(projectId, actorId, { write: true, ...options }, async c => {
    if (c.project.status === "COMPLETED") throw AppError.conflict("Dự án đã hoàn tất, sàng lọc chỉ được xem");
    const hash = screeningHash({ type, input });
    const prior = await c.tx.screeningAudit.findUnique({ where: { projectId_actorId_clientKey: { projectId: c.project.id, actorId: c.actorId, clientKey: input.clientKey } } });
    if (prior) { if (prior.requestHash !== hash) throw AppError.conflict("Mã yêu cầu đã được dùng cho nội dung khác"); return prior.result as { roundId?: string; version?: number; roundIds?: string[]; id?: string; updatedAt?: string }; }
    const value = await run(c);
    await c.tx.screeningAudit.create({ data: { projectId: c.project.id, roundId: value.roundId, actorId: c.actorId, type, clientKey: input.clientKey, requestHash: hash, details: jsonSnapshot(value.details ?? input), result: jsonSnapshot(value.result) } });
    if (value.roundId && ["REVIEW_SUBMITTED", "DISCUSSION", "AGREEMENT_PROPOSED", "AGREEMENT_CONFIRMED", "AGREEMENT_DECLINED", "ADJUDICATION_REQUESTED", "FINALIZED", "REVIEW_REOPENED", "PROVISIONAL_FULL_TEXT"].includes(type)) {
      const round = await screeningRound(c, value.roundId);
      await workspaceEvent(c, "SCREENING_PARTICIPATION", "PAPER", round.paperId, { screeningEvent: type, roundId: round.id, version: value.result.version ?? round.version }, input.clientKey);
    }
    if (value.result.roundIds) for (const roundId of value.result.roundIds) {
      await c.tx.screeningAudit.create({ data: { projectId: c.project.id, roundId, actorId: c.actorId, type, details: jsonSnapshot(value.roundAudits?.find(a => a.roundId === roundId)?.details ?? value.details ?? input), result: jsonSnapshot(value.result) } });
    }
    return value.result;
  });
}
export async function revokeAdvancedScreeningAssignments(tx: WorkspaceDb, projectId: string, reviewerId: string, actorId: string) {
  const unfinished = await tx.screeningAssignment.findMany({ where: { projectId, reviewerId, active: true, submittedAt: null } });
  for (const a of unfinished) {
    await tx.screeningAssignment.update({ where: { id: a.id }, data: { active: false } });
    await tx.screeningAudit.create({ data: { projectId, roundId: a.roundId, actorId, type: "ASSIGNMENT_REVOKED", details: { assignmentId: a.id, reviewerId } } });
  }
  if (unfinished.length) {
    const project = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
    const context: WorkspaceContext = { tx, project, actorId, role: project.ownerId === actorId ? "OWNER" : "MEMBER" };
    for (const roundId of new Set(unfinished.map(a => a.roundId))) {
      const round = await tx.screeningRound.findUniqueOrThrow({ where: { id: roundId } });
      if (round.active && !["INCLUDED", "EXCLUDED", "BACKGROUND"].includes(round.status)) await recomputeScreening(context, round);
    }
  }
}
