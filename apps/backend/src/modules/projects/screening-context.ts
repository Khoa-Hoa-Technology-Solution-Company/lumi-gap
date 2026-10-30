import { createHash } from "node:crypto";
import type { ScreeningRoundView, ScreeningReview, ScreeningSettings as Settings } from "@trend/shared-types";
import type { ScreeningRound } from "../../generated/prisma/client.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { jsonSnapshot, withWorkspace, type WorkspaceContext, type WorkspaceDb } from "./workspace-access.js";
import { invalidateSourceAssessments } from "./gap-revision.js";
import { screeningConsensus } from "./screening.calculator.js";
import { projectQuestionOptions } from "./screening-review-context.js";

export const screeningHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
/** Old immutable snapshots keep their original policy and receive explicit compatibility defaults. */
export function roundSettings(value: unknown): Settings {
  const settings = value as Settings;
  return { ...settings, reviewMode: settings.reviewMode ?? "INDEPENDENT", blindReview: settings.blindReview ?? true, resolutionPolicy: settings.resolutionPolicy ?? "ADJUDICATION" };
}
export async function screeningSettings(c: WorkspaceContext): Promise<Settings> {
  const questionOptions = await projectQuestionOptions(c);
  const row = await c.tx.screeningSettings.findUnique({ where: { projectId: c.project.id } });
  if (row) return { reviewMode: row.reviewMode as Settings["reviewMode"], blindReview: row.blindReview, resolutionPolicy: row.resolutionPolicy as Settings["resolutionPolicy"], version: row.version, requiredReviewers: row.requiredReviewers, consensusPolicy: row.consensusPolicy as Settings["consensusPolicy"], aiAssisted: row.aiAssisted, inclusionCriteria: row.inclusionCriteria, exclusionCriteria: row.exclusionCriteria, researchQuestions: row.researchQuestions, stages: row.stages as Settings["stages"], questionOptions };
  const plan = await c.tx.researchPlan.findUnique({ where: { projectId: c.project.id }, select: { questions: true } });
  const questions = Array.isArray(plan?.questions) ? plan.questions.flatMap(q => q && typeof q === "object" && !Array.isArray(q) && typeof q.text === "string" ? [q.text] : []) : [];
  return { reviewMode: "COLLABORATIVE", blindReview: false, resolutionPolicy: "ADJUDICATION", version: 0, requiredReviewers: 1, consensusPolicy: "UNANIMOUS", aiAssisted: false, inclusionCriteria: c.project.inclusionCriteria, exclusionCriteria: c.project.exclusionCriteria, researchQuestions: questions, stages: [], questionOptions };
}
export async function screeningPeople(c: WorkspaceContext) {
  const members = await c.tx.projectMember.findMany({ where: { projectId: c.project.id, status: "ACTIVE" }, select: { userId: true } });
  const rows = await c.tx.user.findMany({ where: { id: { in: [c.project.ownerId, ...members.map(m => m.userId)] }, isActive: true, accountStatus: "ACTIVE", emailVerifiedAt: { not: null } }, select: { id: true, fullName: true } });
  return rows.map(p => ({ id: p.id, name: p.fullName || "Thành viên" }));
}
export async function screeningRound(c: WorkspaceContext, id: string) {
  const row = await c.tx.screeningRound.findFirst({ where: { id, projectId: c.project.id } });
  if (!row) throw AppError.notFound("Không tìm thấy vòng sàng lọc trong dự án"); return row;
}
export async function effectiveAssignments(c: WorkspaceContext, roundId: string) {
  const [rows, people] = await Promise.all([c.tx.screeningAssignment.findMany({ where: { roundId, projectId: c.project.id, active: true }, orderBy: { reviewerId: "asc" } }), screeningPeople(c)]);
  const active = new Set(people.map(p => p.id));
  // Submitted independent work survives membership changes; unfinished assignments do not count.
  return rows.filter(a => a.submittedAt || active.has(a.reviewerId));
}
export async function roundView(c: WorkspaceContext, row: ScreeningRound): Promise<ScreeningRoundView> {
  const settings = roundSettings(row.settings), assignments = await effectiveAssignments(c, row.id);
  const visible = !settings.blindReview || Boolean(row.unblindedAt);
  const finalizerId = row.finalizerId ?? c.project.ownerId;
  const finalizer = await c.tx.user.findUnique({ where: { id: finalizerId }, select: { fullName: true } });
  const names = await c.tx.user.findMany({ where: { id: { in: assignments.map(a => a.reviewerId) } }, select: { id: true, fullName: true } });
  const submitted = assignments.filter(a => a.submittedAt);
  const reviews = await c.tx.screeningReview.findMany({ where: { projectId: c.project.id, OR: assignments.filter(a => visible || a.reviewerId === c.actorId).map(a => ({ assignmentId: a.id, revision: a.revision })) } });
  const shown = reviews.map(r => ({ id: r.id, assignmentId: r.assignmentId, reviewerId: assignments.find(a => a.id === r.assignmentId)!.reviewerId, revision: r.revision, decision: r.decision as "INCLUDE" | "EXCLUDE" | "UNSURE", exclusionReason: r.exclusionReason, comment: r.comment, scope: r.scope as ScreeningReview["scope"], fullTextReference: r.fullTextReference, researchQuestions: r.researchQuestions as unknown as ScreeningReview["researchQuestions"], submittedAt: r.submittedAt.toISOString() }));
  const own = assignments.find(a => a.reviewerId === c.actorId);
  const final = row.unblindedAt && ["INCLUDED", "EXCLUDED", "BACKGROUND"].includes(row.status) ? await c.tx.screeningFinalDecision.findFirst({ where: { roundId: row.id }, orderBy: { roundVersion: "desc" } }) : null;
  const writable = c.project.status !== "ARCHIVED" && row.active;
  return { id: row.id, paperId: row.paperId, number: row.number, phase: row.phase as ScreeningRoundView["phase"], version: row.version, active: row.active, status: row.status as ScreeningRoundView["status"], settings: { ...settings, questionOptions: await projectQuestionOptions(c) }, extractionReady: row.status === "INCLUDED" && !(settings.reviewMode !== "COLLABORATIVE" && settings.stages?.includes("FULL_TEXT") && row.phase !== "FULL_TEXT"),
    unblindedAt: row.unblindedAt?.toISOString() ?? null, independenceCompromised: row.independenceCompromised, assigned: assignments.length, completed: submitted.length,
    assignments: assignments.map(a => ({ id: a.id, reviewerId: a.reviewerId, name: names.find(n => n.id === a.reviewerId)?.fullName || "Thành viên", revision: a.revision, completed: Boolean(a.submittedAt), active: a.active, dueAt: a.dueAt?.toISOString() ?? null, overdue: !a.submittedAt && Boolean(a.dueAt && a.dueAt < new Date()) })),
    canDefer: writable && settings.reviewMode === "COLLABORATIVE" && (c.actorId === finalizerId || c.role === "OWNER"),
    finalizer: { id: finalizerId, name: finalizer?.fullName || "Người chốt" }, canFinalize: writable && c.actorId === finalizerId && ["AWAITING_FINALIZATION", "NEEDS_RESOLUTION"].includes(row.status),
    myAssignmentId: own?.id ?? null, reviews: shown, myReview: shown.find(r => r.reviewerId === c.actorId) ?? null, hiddenReviews: !visible,
    finalDecision: final ? { id: final.id, version: final.roundVersion, decision: final.decision as "INCLUDED" | "EXCLUDED" | "BACKGROUND", source: final.source as "CONSENSUS" | "MANUAL", reason: final.reason, resolverId: final.resolverId, createdAt: final.createdAt.toISOString() } : null,
    canReview: Boolean(writable && ((settings.reviewMode === "COLLABORATIVE") || (own && !own.submittedAt)) && !["INCLUDED", "EXCLUDED", "BACKGROUND"].includes(row.status)), canManage: writable && c.role === "OWNER", aiVisible: Boolean(row.unblindedAt || settings.aiAssisted) };
}
export async function projectScreeningStatus(c: WorkspaceContext, row: ScreeningRound, status: string, reason = "", resolverId: string | null = null) {
  const link = await c.tx.projectPaper.findUniqueOrThrow({ where: { projectId_paperId: { projectId: c.project.id, paperId: row.paperId } } });
  const settings = roundSettings(row.settings);
  const awaitingFullText = status === "INCLUDED" && settings.reviewMode !== "COLLABORATIVE" && settings.stages?.includes("FULL_TEXT") && row.phase !== "FULL_TEXT";
  const legacyStatus = status === "NOT_REVIEWED" ? "UNDECIDED" : !awaitingFullText && ["INCLUDED", "EXCLUDED"].includes(status) ? status : "MAYBE";
  if (link.screeningStatus !== legacyStatus) await invalidateSourceAssessments(c.tx, c.project.id, c.actorId, { paperId: row.paperId });
  await c.tx.projectPaper.update({ where: { id: link.id }, data: { screeningStatus: legacyStatus, screenedById: resolverId, screenedAt: ["INCLUDED", "EXCLUDED"].includes(status) ? new Date() : null,
    inclusionReason: status === "INCLUDED" ? reason : null, exclusionReason: status === "EXCLUDED" ? "OTHER" : null, exclusionNote: status === "EXCLUDED" ? reason : null,
    updatedAt: new Date(Math.max(Date.now(), link.updatedAt.getTime()+1)) } });
}
export async function recomputeScreening(c: WorkspaceContext, row: ScreeningRound) {
  const assignments = await effectiveAssignments(c, row.id), settings = roundSettings(row.settings);
  const reviews = await c.tx.screeningReview.findMany({ where: { projectId: c.project.id, OR: assignments.filter(a => a.submittedAt).map(a => ({ assignmentId: a.id, revision: a.revision })) } });
  // Assessments determine readiness. Only an authorized explicit command creates a final decision.
  const result = screeningConsensus(reviews.map(r => r.decision as "INCLUDE" | "EXCLUDE" | "UNSURE"), assignments.length, settings.requiredReviewers, "UNANIMOUS");
  const status = ["INCLUDED", "EXCLUDED"].includes(result) ? "AWAITING_FINALIZATION" : result;
  const complete = assignments.length >= settings.requiredReviewers && assignments.every(a => a.submittedAt);
  const updated = await c.tx.screeningRound.update({ where: { id: row.id }, data: { status, unblindedAt: row.unblindedAt ?? (complete ? new Date() : null), version: { increment: 1 } } });
  if (complete) await c.tx.screeningAudit.create({ data: { projectId: c.project.id, roundId: row.id, actorId: c.actorId, type: "REVIEWS_COMPLETED", details: { status, reviewMode: settings.reviewMode, resolutionPolicy: settings.resolutionPolicy, completionRule: "ALL_ASSIGNED", ruleVersion: settings.version, reviewIds: reviews.map(r => r.id) } } });
  await projectScreeningStatus(c, row, status, "");
  return updated;
}
export function screeningCommand<T extends { clientKey: string }>(projectId: string, actorId: string, type: string, input: T, options: { owner?: boolean; accounts?: string[] }, run: (c: WorkspaceContext) => Promise<{ result: { roundId?: string; version?: number; roundIds?: string[]; id?: string; updatedAt?: string }; details?: unknown; roundId?: string; roundAudits?: { roundId: string; details: unknown }[] }>) {
  return withWorkspace(projectId, actorId, { write: true, ...options }, async c => {
    const hash = screeningHash({ type, input });
    const prior = await c.tx.screeningAudit.findUnique({ where: { projectId_actorId_clientKey: { projectId: c.project.id, actorId: c.actorId, clientKey: input.clientKey } } });
    if (prior) { if (prior.requestHash !== hash) throw AppError.conflict("Mã yêu cầu đã được dùng cho nội dung khác"); return prior.result as { roundId?: string; version?: number; roundIds?: string[]; id?: string; updatedAt?: string }; }
    const value = await run(c);
    await c.tx.screeningAudit.create({ data: { projectId: c.project.id, roundId: value.roundId, actorId: c.actorId, type, clientKey: input.clientKey, requestHash: hash, details: jsonSnapshot(value.details ?? input), result: jsonSnapshot(value.result) } });
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
