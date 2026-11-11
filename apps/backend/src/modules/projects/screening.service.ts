import { invalidateDependentStages } from "./screening-reopen.js";
import { screeningFullTextAvailable } from "./screening-fulltext.js";
import { screeningCaseService } from "./screening-case.service.js";
import { reconcileScreeningObligations, screeningObligationDtos } from "./screening-obligations.js";
import { acceptedScreeningPapers } from "./screening-accepted.js";
import { screeningWorkPapers } from "./screening-work-papers.js";
import { latestCase, caseReady, caseView, closeCase, refreshCasePacket, ensureAssignment } from "./screening-case-context.js";
import { screeningClassification, validateResolutionEvidence, notifyScreeningParticipants } from "./screening-resolution-context.js";
import { assertScreeningCapacity, occupiedScreeningSlot, claimScreeningSlot, screeningQueue } from "./screening-slots.js";
import { initializePaperScreening } from "./screening-bootstrap.js";
import { randomUUID } from "node:crypto";
import { screeningAgreement } from "./screening-agreement-context.js";
import type { ScreeningBoard, ScreeningMetrics, ScreeningChoice } from "@trend/shared-types";
import type { z } from "zod";
import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { withWorkspace, workspaceId, jsonSnapshot, expectWorkspaceVersion, assertWorkspaceAssignee } from "./workspace-access.js";
import { researchPaper } from "./project-evidence.service.js";
import { balancedReviewers, cohenKappa, screeningConsensus, independentWorkflow, automaticFullTextStage } from "./screening.calculator.js";
import { advanceScreeningStage, effectiveAssignments, projectScreeningStatus, recomputeScreening, roundView, roundSettings, screeningCommand, screeningPeople, screeningRound, screeningSettings, settingsForNewScreening, screeningReviewsVisible, getDiscussionTiming, getClosureDetails } from "./screening-context.js";
import { screeningConfigSchema, screeningFinalizerSchema, screeningResolveSchema, screeningClaimSchema, screeningReleaseSchema, screeningExtendSchema, screeningDiscoveryGoalUpdateSchema, screeningProposerExceptionSchema, screeningAgreementSchema } from "./dto/screening.schema.js";
import type { ScreeningWorkspaceSummary, ScreeningPhase, ScreeningState } from "@trend/shared-types";
import { adjudicationPacket, adjudicationSection, screeningAdjudicatorPool, screeningAdjudicators, screeningDiscussionReady, screeningEscalationReady, sharedAdjudicationPacket } from "./screening-adjudication-context.js";
import { effectiveMentorAccess, publishMentorShare } from "./mentor-access.service.js";
import { notificationService } from "../notifications/notification.service.js";
import * as s from "./dto/screening.schema.js";
import { assessmentContext, meaningfulLegacyScreening } from "./screening-review-context.js";
import { reviewedProposalPapers } from "./screening-proposal.js";

type Page = Omit<z.infer<typeof s.screeningPageSchema>, "sort" | "slots"> & { slots?: "ALL" | "UNCLAIMED" | "LAST_SLOT"; sort?: "newest" | "oldest" | "title" | "year" };
export const screeningService = {
  async config(project: string, actor: string) { return withWorkspace(project, actor, {}, async c => ({ settings: await screeningSettings(c), canManage: c.role === "OWNER" && !["ARCHIVED", "COMPLETED"].includes(c.project.status), people: await screeningPeople(c), ...(c.role === "OWNER" ? { adjudicatorOptions: await screeningAdjudicatorPool(c) } : {}) })); },
  async configure(project: string, actor: string, raw: z.input<typeof s.screeningConfigSchema>) {
    const parsed = screeningConfigSchema.parse(raw);
    const input = { ...parsed, ...(parsed.screeningMode ? { stages: parsed.screeningMode === "TWO_STAGE" ? ["TITLE_ABSTRACT", "FULL_TEXT"] : [parsed.stages?.[0] ?? "TITLE_ABSTRACT"] } : {}), blindReview: parsed.reviewMode === "INDEPENDENT" || parsed.blindReview };
    return screeningCommand(project, actor, "CONFIGURED", input, { owner: true }, async c => {
      const previous = await screeningSettings(c);
      if (previous.screeningMode && !input.screeningMode && previous.version > 0) throw AppError.badRequest("Chọn rõ chế độ sàng lọc cho phiên bản quy trình mới");
      if (input.reviewMode === "COLLABORATIVE" && previous.reviewMode !== "COLLABORATIVE") throw AppError.badRequest("Chọn hai reviewer độc lập hoặc cấu hình rõ ngoại lệ một reviewer");
      expectWorkspaceVersion(previous.version, input.expectedVersion);
      if (input.authorizedAdjudicatorIds.length || input.preferredAdjudicatorId || input.adjudicationCoordinatorIds.length) {
        if (input.preferredAdjudicatorId && input.authorizedAdjudicatorIds.length && !input.authorizedAdjudicatorIds.includes(input.preferredAdjudicatorId)) throw AppError.badRequest("Người chỉ định trước phải thuộc danh sách người phân xử được phép");
        const eligible = new Set((await screeningPeople(c)).map(p => p.id));
        const policies = await c.tx.mentorAccess.findMany({ where: { projectId: c.project.id, revokedAt: null, permissions: { hasEvery: ["PAPERS_VIEW", "PAPERS_COMMENT"] } } });
        for (const policy of policies) if (await effectiveMentorAccess(c.tx, policy)) eligible.add(policy.mentorUserId);
        if ([...input.authorizedAdjudicatorIds, ...input.preferredAdjudicatorId ? [input.preferredAdjudicatorId] : [], ...input.adjudicationCoordinatorIds].some(id => !eligible.has(id))) throw AppError.badRequest("Chỉ chọn thành viên hiện tại hoặc giảng viên đã nhận lời và có quyền phù hợp");
      }
      const { clientKey: _key, expectedVersion: _version, ...data } = input;
      const row = await c.tx.screeningSettings.upsert({ where: { projectId: c.project.id }, create: { projectId: c.project.id, ...data }, update: { ...data, version: { increment: 1 } } });
      // Legacy votes have no round snapshot. Never unblind them by changing future-round settings.
      await c.tx.project.update({ where: { id: c.project.id }, data: { screeningMode: "INDEPENDENT", screeningBlinded: true, inclusionCriteria: data.inclusionCriteria, exclusionCriteria: data.exclusionCriteria, version: { increment: 1 } } });
      return { result: { version: row.version }, details: { ...data, version: row.version, appliesTo: "FUTURE_ROUNDS" } };
    });
  },
  async start(project: string, actor: string, input: z.infer<typeof s.screeningStartSchema>) {
    return screeningCommand(project, actor, "ROUND_STARTED", input, { owner: true }, async c => {
      const settings = await settingsForNewScreening(c), roundIds: string[] = [];
      if (settings.reviewMode !== "COLLABORATIVE" && settings.stages?.length && !settings.stages.includes(input.phase)) throw AppError.badRequest("Giai đoạn này không nằm trong quy trình đã chọn");
      for (const paperId of [...input.paperIds].sort()) {
        const link = await researchPaper(c, paperId);
        const previous = await c.tx.screeningRound.findFirst({ where: { projectId: c.project.id, paperId }, orderBy: { number: "desc" } });
        if (previous && !previous.legacyNeedsAudit && !["INCLUDED", "EXCLUDED", "BACKGROUND"].includes(previous.status)) throw AppError.conflict("Hoàn thành vòng hiện tại trước khi mở vòng mới");
        if (input.phase === "FULL_TEXT" && settings.screeningMode && !await screeningFullTextAvailable(c, paperId)) throw AppError.conflict("Bổ sung nguồn toàn văn trước khi mở vòng đánh giá toàn văn");
        if (!previous?.legacyNeedsAudit && settings.reviewMode !== "COLLABORATIVE" && input.phase === "FULL_TEXT" && settings.stages?.includes("TITLE_ABSTRACT") && !(previous?.phase === "TITLE_ABSTRACT" && previous.status === "INCLUDED") && previous?.phase !== "FULL_TEXT") throw AppError.conflict("Hoàn thành lựa chọn ở giai đoạn tiêu đề / tóm tắt trước khi đánh giá toàn văn");
        if ((previous || ["INCLUDED", "EXCLUDED"].includes(link.screeningStatus)) && !input.confirmRescreen) throw AppError.conflict("Cần xác nhận đánh giá lại; kết quả cũ vẫn được giữ trong lịch sử");
        if (!previous && meaningfulLegacyScreening({ ...link, status: link.screeningStatus })) await c.tx.screeningLegacyRecord.upsert({ where: { projectId_paperId: { projectId: c.project.id, paperId } }, create: { projectId: c.project.id, paperId, snapshot: jsonSnapshot({ provenance: "PRE_PROTOCOL_STATUS", status: link.screeningStatus, screenedById: link.screenedById, screenedAt: link.screenedAt, inclusionReason: link.inclusionReason, exclusionReason: link.exclusionReason, exclusionNote: link.exclusionNote }) }, update: {} });
        if (previous) await c.tx.screeningRound.update({ where: { id: previous.id }, data: { active: false, version: { increment: 1 } } });
        const row = await c.tx.screeningRound.create({ data: { projectId: c.project.id, paperId, phase: input.phase, number: (previous?.number ?? 0)+1, settings: jsonSnapshot(input.phase === "FULL_TEXT" && previous?.phase === "TITLE_ABSTRACT" && roundSettings(previous.settings).screeningMode ? previous.settings : settings), createdById: c.actorId } });
        await projectScreeningStatus(c, row, "NOT_REVIEWED"); roundIds.push(row.id);
      }
      await c.tx.project.update({ where: { id: c.project.id }, data: { screeningMode: "INDEPENDENT", screeningBlinded: true, version: { increment: 1 } } });
      return { result: { roundIds } };
    });
  },
  async begin(project: string, actor: string, paperId: string, input: z.infer<typeof s.screeningBeginSchema>) {
    return screeningCommand(project, actor, "ROUND_INITIALIZED", { ...input, paperId }, {}, async c => {
      await researchPaper(c, paperId);
      const row = await initializePaperScreening(c, paperId, input.confirmRescreen);
      if (!row) throw AppError.conflict("Dự án đang dùng đánh giá cộng tác; giữ quy trình đã cấu hình");
      return { roundId: row.id, result: { roundId: row.id, version: row.version } };
    });
  },
  async resumeFullText(project: string, actor: string, roundId: string, input: z.infer<typeof s.screeningActionSchema>) {
    return screeningCommand(project, actor, "FULLTEXT_READY", { ...input, roundId }, {}, async c => {
      const row = await screeningRound(c, roundId);
      expectWorkspaceVersion(row.version, input.expectedVersion);
      if (!(await roundView(c, row)).canResumeFullText) throw AppError.forbidden("Chỉ chủ dự án hoặc người đề xuất được xác nhận nguồn toàn văn cho vòng đang chờ");
      if (!await screeningFullTextAvailable(c, row.paperId)) throw AppError.conflict("Chưa có toàn văn. Đính kèm PDF hoặc bổ sung liên kết toàn văn trước khi tiếp tục");
      await advanceScreeningStage(c, row, await effectiveAssignments(c, row.id));
      const next = await c.tx.screeningRound.findFirstOrThrow({ where: { projectId: c.project.id, paperId: row.paperId, active: true } });
      return { roundId, result: { roundId: next.id, version: next.version }, details: { previousRoundId: row.id, reason: input.reason } };
    });
  },
  async advanceConservatively(project: string, actor: string, roundId: string, input: z.infer<typeof s.screeningActionSchema>) {
    return screeningCommand(project, actor, "PROVISIONAL_FULL_TEXT", { ...input, roundId }, {}, async c => {
      const row = await screeningRound(c, roundId); expectWorkspaceVersion(row.version, input.expectedVersion);
      const view = await roundView(c, row);
      if (!view.canAdvanceConservatively) throw AppError.forbidden("Cần đề xuất kết quả chung và reviewer còn lại xác nhận trước khi chuyển đọc toàn văn");
      const next = await c.tx.screeningRound.update({ where: { id: roundId }, data: { status: "NEEDS_MORE_INFO", version: { increment: 1 } } });
      await advanceScreeningStage(c, next, await effectiveAssignments(c, row.id), true);
      return { roundId, result: { roundId, version: next.version }, details: { reason: input.reason, provisional: true, unresolvedAbstractConflict: true, reviewIds: view.reviews.map(r => r.id), ruleVersion: view.settings.version } };
    });
  },
  async declineAgreement(project: string, actor: string, roundId: string, input: z.infer<typeof s.screeningAgreementDeclineSchema>) {
    return screeningCommand(project, actor, "AGREEMENT_DECLINED", { ...input, roundId }, {}, async c => {
      const row = await screeningRound(c, roundId); expectWorkspaceVersion(row.version, input.expectedVersion);
      const agreement = await screeningAgreement(c, row);
      if (!agreement?.canDecline || agreement.id !== input.proposalId) throw AppError.conflict("Đề xuất đã thay đổi hoặc bạn không có quyền phản hồi");
      const next = await c.tx.screeningRound.update({ where: { id: roundId }, data: { version: { increment: 1 } } });
      await notifyScreeningParticipants(c, row, "CONSENSUS_REJECTED", "Đề xuất kết quả chung cần thảo luận tiếp", next.version, [agreement.proposedById]);
      return { roundId, result: { roundId, version: next.version }, details: { proposalId: agreement.id, reason: input.reason } };
    });
  },
  requestAdjudication: screeningCaseService.request,
  async reassess(project: string, actor: string, roundId: string, input: z.infer<typeof s.screeningReassessSchema>) {
    return screeningCommand(project, actor, "REVIEW_REASSESSED", { ...input, roundId }, {}, async c => {
      const row = await screeningRound(c, roundId);
      if (input.expectedRevision) expectWorkspaceVersion(row.version, input.expectedRevision);
      if (!row.active || ["INCLUDED", "EXCLUDED", "BACKGROUND", "WAITING_FULLTEXT"].includes(row.status)) {
        throw AppError.conflict("Vòng sàng lọc đã hoàn thành hoặc không còn hiệu lực");
      }
      if (row.legacyNeedsAudit) {
        throw AppError.conflict("Cần rà soát dữ liệu cũ");
      }
      const dispute = await latestCase(c, roundId);
      if (dispute && (dispute.active && await caseReady(c, dispute) || row.status === "NEEDS_MORE_INFO" && !dispute.active)) throw AppError.conflict("Hồ sơ đã khóa. Cần mở lại có lý do trước khi sửa phiếu");
      const assignment = await c.tx.screeningAssignment.findFirst({
        where: { roundId, projectId: c.project.id, reviewerId: c.actorId, active: true }
      });
      if (!assignment || !assignment.submittedAt) {
        throw AppError.forbidden("Bạn chưa hoàn thành đánh giá ban đầu cho bài này");
      }

      const assignments = await effectiveAssignments(c, row.id);
      if (!roundSettings(row.settings).screeningMode && assignments.some(a => a.id !== assignment.id && a.submittedAt)) {
        const current = await c.tx.screeningReview.findUniqueOrThrow({
          where: { assignmentId_revision: { assignmentId: assignment.id, revision: assignment.revision } },
        });
        if (input.decision === current.decision) throw AppError.conflict("Hai reviewer đã gửi phiếu. Chỉ có thể đổi sang kết luận khác với phiếu hiện tại");
      }

      const nextRevision = assignment.revision + 1;
      await c.tx.screeningAssignment.update({
        where: { id: assignment.id },
        data: { revision: nextRevision }
      });

      const fullComment = input.comment ? `${input.reason}\n\n${input.comment}` : input.reason;
      const context = await assessmentContext(c, input, row.phase as "TITLE_ABSTRACT" | "FULL_TEXT", false);

      const review = await c.tx.screeningReview.create({
        data: {
          projectId: c.project.id,
          assignmentId: assignment.id,
          revision: nextRevision,
          decision: input.decision,
          exclusionReason: input.decision === "EXCLUDE" ? (input.exclusionReason ?? "") : "",
          comment: fullComment,
          ...context
        }
      });

      const next = await recomputeScreening(c, row);

      if (!["INCLUDED", "EXCLUDED"].includes(next.status)) await refreshCasePacket(c, next);
      // Check if effective decisions now agree (auto-resolve!)
      if (["INCLUDED", "EXCLUDED"].includes(next.status)) {
        if (row.finalizerId) {
          await c.tx.screeningRound.update({
            where: { id: row.id },
            data: { finalizerId: null }
          });
          await c.tx.mentorResourceShare.updateMany({
            where: { projectId: c.project.id, sectionKey: adjudicationSection(row.id), revokedAt: null },
            data: { revokedAt: new Date() }
          });
        }
        await c.tx.screeningAudit.create({
          data: {
            projectId: c.project.id,
            roundId: row.id,
            actorId: c.actorId,
            type: "ADJUDICATION_CANCELLED",
            details: { reason: "CANCELLED_AS_RESOLVED", revisedBy: c.actorId }
          }
        });
        await notifyScreeningParticipants(c, row, "RESOLVED_BY_REVISION", "Hai reviewer đã thống nhất sau khi xem xét lại", next.version);
      } else if (row.finalizerId) {
        await c.tx.screeningAudit.create({
          data: {
            projectId: c.project.id,
            roundId: row.id,
            actorId: c.actorId,
            type: "ADJUDICATION_EVIDENCE_UPDATED",
            details: { roundId: row.id, revision: nextRevision, reviewerId: c.actorId, version: next.version }
          }
        });
        await notificationService.create({
          userId: row.finalizerId,
          type: "SCREENING_ACTION_REQUIRED",
          paperId: row.paperId,
          title: "Hồ sơ phân xử có cập nhật đánh giá mới",
          message: "Một reviewer đã xem xét lại đánh giá của mình. Hãy kiểm tra hồ sơ mới nhất.",
          targetKind: "project",
          targetId: c.project.id,
          eventKey: `SCREENING:${row.id}:EVIDENCE_UPDATE:${next.version}`,
          emailStatus: "SKIPPED"
        }, c.tx);
      }

      return {
        roundId,
        result: { roundId, version: next.version },
        details: {
          assignmentId: assignment.id,
          reviewId: review.id,
          reviewerId: c.actorId,
          revision: nextRevision,
          newDecision: input.decision,
          reason: input.reason
        }
      };
    });
  },
  async assign(project: string, actor: string, input: z.infer<typeof s.screeningAssignSchema>) {
    // Discover then lock candidate accounts before the project lock, matching membership lock order.
    const candidates = input.mode === "AUTO" ? await withWorkspace(project, actor, {}, screeningPeople) : input.reviewerIds.map(id => ({ id, name: "" }));
    return screeningCommand(project, actor, "ASSIGNED", input, { owner: true, accounts: candidates.map(p => p.id) }, async c => {
      const livePeople = new Set((await screeningPeople(c)).map(p => p.id)), eligible = candidates.map(p => p.id).filter(id => livePeople.has(id));
      if (input.mode === "MANUAL" && eligible.length !== input.reviewerIds.length) throw AppError.badRequest("Chỉ phân công thành viên đang hoạt động");
      const activeRounds = await c.tx.screeningRound.findMany({ where: { projectId: c.project.id, active: true }, select: { id: true } });
      const assignments = await c.tx.screeningAssignment.findMany({ where: { projectId: c.project.id, roundId: { in: activeRounds.map(r => r.id) }, active: true } });
      const loads = new Map<string, { pending: number; total: number }>();
      const roundAudits: { roundId: string; details: unknown }[] = [];
      for (const a of assignments) { const load = loads.get(a.reviewerId) ?? { pending: 0, total: 0 }; load.total++; if (!a.submittedAt) load.pending++; loads.set(a.reviewerId, load); }
      for (const roundId of [...input.roundIds].sort()) {
        const round = await screeningRound(c, roundId), settings = roundSettings(round.settings);
        assertScreeningCapacity(round);
        if (independentWorkflow(settings) && round.unblindedAt) throw AppError.conflict("Vòng đã đủ phiếu; danh sách reviewer thường đã khóa, kể cả khi mở lại phiếu");
        if (!round.active || (round.unblindedAt && !["NOT_REVIEWED", "IN_REVIEW"].includes(round.status))) throw AppError.conflict("Không thay phân công sau khi vòng đã công bố phiếu");
        const existing = await effectiveAssignments(c, roundId), submitted = existing.filter(a => a.submittedAt);
        const proposer = await c.tx.projectPaper.findUniqueOrThrow({ where: { projectId_paperId: { projectId: c.project.id, paperId: round.paperId } }, select: { addedById: true } });
        const selected = input.mode === "AUTO" ? balancedReviewers(eligible, existing.map(a => a.reviewerId), settings.requiredReviewers, loads, proposer.addedById) : [...new Set([...input.reviewerIds, ...submitted.map(a => a.reviewerId)])];
        if (selected.length !== settings.requiredReviewers) throw AppError.badRequest(`Cần đúng ${settings.requiredReviewers} người đánh giá khác nhau`);
        if (independentWorkflow(settings) && (settings.workflowVersion ?? 0) >= 4 && selected.length !== settings.requiredReviewers) throw AppError.badRequest(`Quy trình yêu cầu đúng ${settings.requiredReviewers} reviewer; hãy đổi cấu hình cho vòng mới nếu cần thêm người`);
        if (settings.reviewMode === "SIMPLE" && selected.length !== 1) throw AppError.badRequest("Simple Review chỉ phân công một reviewer");
        if (submitted.some(a => !selected.includes(a.reviewerId))) throw AppError.conflict("Không được hủy phân công đã có phiếu gửi");
        const all = await c.tx.screeningAssignment.findMany({ where: { roundId, projectId: c.project.id } });
        roundAudits.push({ roundId, details: { mode: input.mode, previousAssignments: all.filter(a => a.active), reviewerIds: selected, dueAtForUnfinished: input.dueAt, ruleVersion: settings.version } });
        for (const a of all.filter(a => a.active && !selected.includes(a.reviewerId))) await c.tx.screeningAssignment.update({ where: { id: a.id }, data: { active: false } });
        for (const reviewerId of selected) {
          const old = all.find(a => a.reviewerId === reviewerId);
          if (old?.submittedAt) continue;
          await assertWorkspaceAssignee(c, reviewerId);
          await c.tx.screeningAssignment.upsert({ where: { roundId_reviewerId: { roundId, reviewerId } }, create: { projectId: c.project.id, roundId, reviewerId, dueAt: input.dueAt ? new Date(input.dueAt) : null }, update: { active: true, dueAt: input.dueAt ? new Date(input.dueAt) : null } });
        }
        await recomputeScreening(c, round);
      }
      return { result: { roundIds: input.roundIds }, roundAudits };
    });
  },
  async submit(project: string, actor: string, roundId: string, input: z.infer<typeof s.screeningSubmitSchema>) {
    input = s.screeningSubmitSchema.parse(input);
    return screeningCommand(project, actor, "REVIEW_SUBMITTED", { ...input, roundId }, {}, async c => {
      const row = await screeningRound(c, roundId);
      assertScreeningCapacity(row);
      if (!row.active || ["INCLUDED", "EXCLUDED", "BACKGROUND", "WAITING_FULLTEXT"].includes(row.status)) throw AppError.conflict("Vòng sàng lọc đã kết thúc");
      const assignment = await c.tx.screeningAssignment.findFirst({ where: { id: input.assignmentId, roundId, projectId: c.project.id, reviewerId: c.actorId, active: true } });
      if (!assignment || !occupiedScreeningSlot(assignment)) throw AppError.forbidden("Suất đánh giá đã hết hạn hoặc bạn chưa nhận bài. Nhận lại suất hợp lệ trước khi gửi");
      const occupied = await effectiveAssignments(c, row.id);
      if (occupied.length > roundSettings(row.settings).requiredReviewers) throw AppError.conflict("Cần rà soát phân công cũ trước khi gửi phiếu");
      expectWorkspaceVersion(assignment.revision, input.expectedRevision);
      if (assignment.submittedAt) {
        if (row.unblindedAt || occupied.some(a => a.id !== assignment.id && a.submittedAt) || ["INCLUDED", "EXCLUDED", "BACKGROUND", "WAITING_FULLTEXT"].includes(row.status)) {
          throw AppError.conflict("Phiếu đã công bố hoặc vòng đã kết thúc. Mở lại phiếu để gửi phiên bản mới");
        }
        const nextRevision = assignment.revision + 1;
        await c.tx.screeningAssignment.update({ where: { id: assignment.id }, data: { revision: nextRevision } });
        assignment.revision = nextRevision;
      }
      const context = await assessmentContext(c, input, row.phase as "TITLE_ABSTRACT" | "FULL_TEXT", false);
      const review = await c.tx.screeningReview.create({ data: { projectId: c.project.id, assignmentId: assignment.id, revision: assignment.revision, decision: input.decision, exclusionReason: input.decision === "EXCLUDE" ? input.exclusionReason : "", comment: input.comment, ...context } });
      await c.tx.screeningAssignment.update({ where: { id: assignment.id }, data: { submittedAt: review.submittedAt } });
      const next = await recomputeScreening(c, row);
      return { roundId, result: { roundId, version: next.version }, details: { assignmentId: assignment.id, reviewId: review.id, reviewerId: c.actorId, revision: review.revision } };
    });
  },
  async resolve(project: string, actor: string, roundId: string, input: z.infer<typeof s.screeningResolveSchema>) {
    input = screeningResolveSchema.parse(input);
    return screeningCommand(project, actor, "FINALIZED", { ...input, roundId }, { mentor: true, mentorScope: "SHARED_RESOURCES" }, async c => {
      const row = await screeningRound(c, roundId);
      if (c.project.status === "COMPLETED") throw AppError.conflict("Dự án đã hoàn tất, không thể ghi kết luận mới");
      if (c.actorId !== (row.finalizerId ?? (independentWorkflow(roundSettings(row.settings)) ? null : c.project.ownerId))) throw AppError.forbidden("Chỉ người được phân công chốt mới có quyền ghi quyết định cuối");
      if (independentWorkflow(roundSettings(row.settings)) && !(await screeningAdjudicators(c, row)).some(p => p.id === c.actorId)) throw AppError.forbidden("Bạn không còn đủ điều kiện phân xử độc lập");
      const disputeCase = await latestCase(c, roundId);
      if (disputeCase) {
        const cv = await caseView(c, row, disputeCase);
        if (!cv.canResolve || input.expectedCaseVersion === undefined) throw AppError.forbidden("Chỉ người được phân công được kết luận sau khi hồ sơ đã khóa");
        expectWorkspaceVersion(disputeCase.version, input.expectedCaseVersion);
        if (input.reason.trim().length < 10) throw AppError.badRequest("Cần ghi lý do phân xử ít nhất 10 ký tự");
        const packet = disputeCase.packet as unknown as import("@trend/shared-types").ScreeningAdjudicationPacket;
        const sufficientSource = row.phase === "FULL_TEXT" ? Boolean(packet.sources?.length || packet.reviews.some(r => r.fullTextReference?.trim())) : Boolean(packet.paper.abstractText?.trim() || packet.sources?.length);
        if (input.decision === "EXCLUDED" && !sufficientSource) throw AppError.badRequest("Nguồn chưa đủ để chốt loại. Cần bổ sung tài liệu nguồn trước khi kết luận");
        const criteria = (row.settings as { exclusionCriteria?: string[] }).exclusionCriteria ?? [];
        if (input.decision === "EXCLUDED" && input.exclusionReason && !criteria.includes(input.exclusionReason)) throw AppError.badRequest("Lý do loại phải thuộc tiêu chí đã lưu của vòng");
      } else if (independentWorkflow(roundSettings(row.settings))) {
        if ((roundSettings(row.settings).workflowVersion ?? 0) >= 5) throw AppError.conflict("Cần hồ sơ đã khóa và người phân xử được phân công");
        if (!(await screeningPeople(c)).some(p => p.id === c.actorId)) await sharedAdjudicationPacket(c, row);
      }
      if ((disputeCase || independentWorkflow(roundSettings(row.settings)) || row.status === "ADJUDICATING") && !["INCLUDED", "EXCLUDED"].includes(input.decision)) throw AppError.badRequest("Phân xử chỉ có hai kết quả: Qua vòng hoặc Loại theo tiêu chí");
      expectWorkspaceVersion(row.version, input.expectedVersion);
      if (!row.active || !["AWAITING_FINALIZATION", "NEEDS_RESOLUTION", "NEEDS_MORE_INFO", "ADJUDICATING"].includes(row.status) || !row.unblindedAt) throw AppError.conflict("Chỉ chốt sau khi hoàn thành tất cả phiếu");
      const view = await roundView(c, row);
      if (view.resolution) throw AppError.conflict("Đã ghi kết quả cần thêm thông tin. Mở lại có lý do trước khi ghi quyết định mới");
      if (view.assigned < view.settings.requiredReviewers || view.completed !== view.assigned) throw AppError.conflict("Chờ tất cả người được phân công gửi phiếu");
      if ((view.settings.workflowVersion ?? 0) < 5 && view.settings.reviewMode !== "COLLABORATIVE" && view.reviews.some(r => r.decision === "UNSURE")) throw AppError.conflict("Còn phiếu chưa đủ thông tin. Bổ sung minh chứng và mở lại phiếu trước khi chốt");
      const unanimous = view.reviews.every(r => r.decision === (input.decision === "INCLUDED" ? "INCLUDE" : "EXCLUDE"));
      if (view.settings.reviewMode !== "COLLABORATIVE" && !unanimous && view.settings.resolutionPolicy !== "ADJUDICATION") throw AppError.conflict("Quy tắc yêu cầu reviewer thống nhất quyết định. Thảo luận rồi mở lại phiếu cần cập nhật");
      if (input.decision === "NEEDS_MORE_INFO" && !independentWorkflow(view.settings)) throw AppError.badRequest("Kết quả này chỉ dành cho quy trình độc lập mới");
      validateResolutionEvidence(row, input, true);
      if (independentWorkflow(view.settings) && input.decision === "BACKGROUND") throw AppError.badRequest("Chọn kết quả của giai đoạn sàng lọc, không đổi sang tài liệu nền khi phân xử");
      const next = await c.tx.screeningRound.update({ where: { id: roundId }, data: { status: input.decision, version: { increment: 1 } } });
      const final = await c.tx.screeningFinalDecision.create({ data: { projectId: c.project.id, roundId, roundVersion: next.version, decision: input.decision, source: "MANUAL", resolutionType: disputeCase || independentWorkflow(view.settings) ? "ADJUDICATION" : null, exclusionReason: input.exclusionReason, sourceMaterial: input.sourceMaterial, reason: input.reason, resolverId: c.actorId, reviewIds: view.reviews.map(r => r.id) } });
      await closeCase(c, roundId, input.decision === "NEEDS_MORE_INFO" ? "NEEDS_MORE_INFO" : "COMPLETED", final.id);
      await projectScreeningStatus(c, row, input.decision, input.reason, c.actorId);
      const link = await c.tx.projectPaper.findUniqueOrThrow({ where: { projectId_paperId: { projectId: c.project.id, paperId: row.paperId } } });
      await notifyScreeningParticipants(c, row, "ADJUDICATION_COMPLETED", "Đã có quyết định phân xử", next.version, link.addedById ? [link.addedById] : []);
      if (input.decision === "NEEDS_MORE_INFO" && link.addedById) await notifyScreeningParticipants(c, row, "INFORMATION_REQUESTED", "Cần thêm thông tin cho bài bạn đề xuất", next.version, [link.addedById]);
      if (input.decision === "INCLUDED" || input.retrieveFullText) await advanceScreeningStage(c, next, await effectiveAssignments(c, row.id), Boolean(input.retrieveFullText));
      return { roundId, result: { roundId, version: next.version }, details: { ...input, version: next.version, ruleVersion: view.settings.version, reviewIds: view.reviews.map(r => r.id) } };
    });
  },
  adjudication: screeningCaseService.view,
  adjudicationTasks: screeningCaseService.tasks,
  async finalizer(project: string, actor: string, roundId: string, raw: z.input<typeof s.screeningFinalizerSchema>) {
    const input = screeningFinalizerSchema.parse(raw);
    return screeningCommand(project, actor, "FINALIZER_ASSIGNED", { ...input, roundId }, { owner: true, accounts: [input.finalizerId] }, async c => {
      const row = await screeningRound(c, roundId); expectWorkspaceVersion(row.version, input.expectedVersion);
      const settings = roundSettings(row.settings);
      if (settings.workflowKind === "TEAM_SCREENING" || settings.resolutionPolicy === "CONSENSUS") {
        throw AppError.forbidden("Quy trình Đánh giá nhóm (TEAM_SCREENING) giải quyết bất đồng bằng đồng thuận giữa 2 reviewer, không chỉ định người chốt.");
      }
      if (!row.active || ["INCLUDED", "EXCLUDED", "BACKGROUND", "WAITING_FULLTEXT"].includes(row.status)) throw AppError.conflict("Chỉ giao người chốt khi vòng chưa có kết quả cuối");
      if ((await roundView(c, row)).resolution) throw AppError.conflict("Đã ghi kết quả cần thêm thông tin. Mở lại có lý do trước khi giao phân xử mới");
      const protocol = independentWorkflow(roundSettings(row.settings));
      if (protocol && (roundSettings(row.settings).workflowVersion ?? 0) >= 5 || await latestCase(c, roundId)) throw AppError.conflict("Dùng phân công trong hồ sơ đã khóa theo chính sách Project");
      let packet;
      let shareId: string | undefined;
      if (protocol) {
        if (roundSettings(row.settings).resolutionPolicy !== "ADJUDICATION" || !["NEEDS_RESOLUTION", "NEEDS_MORE_INFO", "ADJUDICATING"].includes(row.status)) throw AppError.conflict("Chỉ giao phân xử khi có bất đồng theo quy trình");
        if (!await screeningEscalationReady(c, row)) throw AppError.conflict("Hai reviewer cần trao đổi sau khi hoàn tất phiếu trước khi giao phân xử");
        const candidate = (await screeningAdjudicators(c, row)).find(p => p.id === input.finalizerId);
        if (!candidate) throw AppError.badRequest("Chọn người phân xử đang hoạt động, không phải reviewer của vòng");
        if (candidate.proposer && (await screeningAdjudicators(c, row)).some(p => !p.proposer)) throw AppError.badRequest("Đang có người phân xử độc lập. Ưu tiên người không đề xuất bài");
        if (candidate.proposer && !input.acknowledgeProposer) throw AppError.badRequest("Người được chọn đã đề xuất bài. Cần xác nhận và ghi lý do chọn người phân xử này");
        if (candidate.mentor) {
          if (!input.shareWithMentor) throw AppError.badRequest("Chủ dự án cần duyệt gói bài, tiêu chí và các phiếu trước khi chia sẻ cho giảng viên");
          packet = await adjudicationPacket(c, row, input.discussionIds);
          const policies = await c.tx.mentorAccess.findMany({ where: { projectId: c.project.id, mentorUserId: input.finalizerId, revokedAt: null, permissions: { hasEvery: ["PAPERS_VIEW", "PAPERS_COMMENT"] } } });
          let policy;
          for (const p of policies) if (await effectiveMentorAccess(c.tx, p)) { policy = p; break; }
          if (!policy) throw AppError.conflict("Quyền cố vấn đã thay đổi. Kiểm tra lại trước khi giao");
          const share = await publishMentorShare(c.tx, policy, c.actorId, { kind: "PAPER", resourceId: row.paperId, sectionKey: adjudicationSection(row.id), title: `Phân xử: ${packet.paper.title}`.slice(0,240), content: JSON.stringify(packet) });
          shareId = share.id;
        }
        await c.tx.mentorResourceShare.updateMany({ where: { projectId: c.project.id, sectionKey: adjudicationSection(row.id), revokedAt: null, ...(shareId ? { id: { not: shareId } } : {}) }, data: { revokedAt: new Date() } });
      } else await assertWorkspaceAssignee(c, input.finalizerId);
      const next = await c.tx.screeningRound.update({ where: { id: roundId }, data: { finalizerId: input.finalizerId, ...(protocol ? { status: "ADJUDICATING" } : {}), version: { increment: 1 } } });
      if (protocol && input.finalizerId !== c.actorId) await notificationService.create({ userId: input.finalizerId, type: "SCREENING_ADJUDICATION_ASSIGNED", title: "Được giao phân xử bài báo", message: "Xem gói sàng lọc được chia sẻ và ghi kết luận theo tiêu chí.", targetKind: "project", targetId: c.project.id, eventKey: `SCREENING:${row.id}:${next.version}:${input.finalizerId}`, emailPayload: { screeningRoundId: row.id }, emailStatus: "SKIPPED" }, c.tx);
      return { roundId, result: { roundId, version: next.version }, details: { ...input, shareId: shareId ?? null, previousFinalizerId: row.finalizerId, workflowVersion: roundSettings(row.settings).workflowVersion ?? 1 } };
    });
  },
  async proposeAgreement(project: string, actor: string, roundId: string, input: z.infer<typeof s.screeningAgreementSchema>) {
    input = screeningAgreementSchema.parse(input);
    return screeningCommand(project, actor, "AGREEMENT_PROPOSED", { ...input, roundId }, {}, async c => {
      const row = await screeningRound(c, roundId);
      const s = roundSettings(row.settings);
      const isTeamScreening = s.workflowKind === "TEAM_SCREENING" || s.resolutionPolicy === "CONSENSUS";
      if (isTeamScreening && input.decision === "NEEDS_MORE_INFO") {
        throw AppError.badRequest("Trong quy trình Đánh giá nhóm, quyết định chung phải là Phù hợp (INCLUDED) hoặc Loại bỏ (EXCLUDED). Nếu cần làm rõ tài liệu, hãy sử dụng hành động 'Cần thêm thông tin'.");
      }
      if (input.decision === "EXCLUDED" && s.exclusionCriteria.length > 0) {
        if (!input.exclusionReason?.trim() || !s.exclusionCriteria.includes(input.exclusionReason.trim())) {
          throw AppError.badRequest("Cần chọn tiêu chí loại hợp lệ từ danh sách tiêu chí của đề tài.");
        }
      }
      if (!isTeamScreening && (s.workflowVersion ?? 0) >= 8) throw AppError.conflict("Mỗi reviewer tự sửa phiếu hoặc mở hồ sơ phân xử, không xác nhận thay người còn lại");
      expectWorkspaceVersion(row.version, input.expectedVersion);
      const view = await roundView(c, row);
      if (!isTeamScreening && ((view.settings.workflowVersion ?? 0) >= 5 || await latestCase(c, roundId))) throw AppError.conflict("Reviewer tự sửa phiếu của mình để ghi nhận thống nhất sau thảo luận");
      if (!view.canProposeAgreement || view.completed !== view.assigned || view.hiddenReviews) throw AppError.forbidden("Chỉ reviewer đã hoàn tất phiếu trong vòng bất đồng được đề xuất quyết định chung");
      if (!isTeamScreening && (view.settings.workflowVersion ?? 0) >= 5 && !await screeningDiscussionReady(c, row)) throw AppError.conflict("Hai reviewer cần trao đổi trước khi đề xuất quyết định chung");
      validateResolutionEvidence(row, input);
      if (!(await screeningPeople(c)).some(p => p.id === c.actorId)) throw AppError.forbidden("Bạn không còn là reviewer đang hoạt động");
      const live = new Set((await screeningPeople(c)).map(p => p.id));
      if (view.assignments.some(a => !live.has(a.reviewerId))) throw AppError.conflict("Reviewer không còn tham gia. Cần phân xử độc lập, không thể ghi đồng thuận thay họ");
      const proposalId = randomUUID();
      if ((view.settings.workflowVersion ?? 0) >= 5 || isTeamScreening) await c.tx.screeningAudit.create({ data: { projectId: c.project.id, roundId, actorId: c.actorId, type: "AGREEMENT_CONFIRMED", details: { proposalId, authorConsent: true } } });
      const next = await c.tx.screeningRound.update({ where: { id: row.id }, data: { version: { increment: 1 } } });
      for (const reviewerId of view.assignments.map(a => a.reviewerId).filter(id => id !== c.actorId)) await notificationService.create({ userId: reviewerId, type: "SCREENING_ACTION_REQUIRED", paperId: row.paperId, title: "Có đề xuất quyết định chung cần phản hồi", message: "Đọc kết luận và lý do trong thư viện dự án, rồi xác nhận hoặc tiếp tục thảo luận.", targetKind: "project", targetId: c.project.id, eventKey: `SCREENING:${proposalId}:${reviewerId}`, emailStatus: "SKIPPED" }, c.tx);
      return { roundId, result: { id: proposalId, roundId, version: next.version }, details: { ...input, proposalId, reviewIds: view.reviews.map(r => r.id).sort(), reviewerIds: view.assignments.map(a => a.reviewerId).sort(), ruleVersion: view.settings.version } };
    });
  },
  async confirmAgreement(project: string, actor: string, roundId: string, input: z.infer<typeof s.screeningAgreementConfirmSchema>) {
    return screeningCommand(project, actor, "AGREEMENT_CONFIRMED", { ...input, roundId }, {}, async c => {
      const row = await screeningRound(c, roundId);
      const s = roundSettings(row.settings);
      const isTeamScreening = s.workflowKind === "TEAM_SCREENING" || s.resolutionPolicy === "CONSENSUS";
      if (!isTeamScreening && (s.workflowVersion ?? 0) >= 8) throw AppError.conflict("Mỗi reviewer tự sửa phiếu hoặc mở hồ sơ phân xử, không xác nhận thay người còn lại");
      expectWorkspaceVersion(row.version, input.expectedVersion);
      if (!isTeamScreening && ((s.workflowVersion ?? 0) >= 5 || await latestCase(c, roundId))) throw AppError.conflict("Reviewer tự sửa phiếu của mình sau thảo luận");
      const agreement = await screeningAgreement(c, row);
      if (!independentWorkflow(roundSettings(row.settings)) || !agreement?.canConfirm || agreement.id !== input.proposalId) throw AppError.conflict("Đề xuất đã thay đổi hoặc bạn không có quyền xác nhận. Hãy kiểm tra lại các phiếu");
      validateResolutionEvidence(row, agreement);
      const complete = new Set([...agreement.confirmedByIds, c.actorId]).size === agreement.requiredReviewerIds.length;
      const next = await c.tx.screeningRound.update({ where: { id: row.id }, data: { ...(complete ? { status: agreement.decision } : {}), version: { increment: 1 } } });
      if (complete) {
        await c.tx.screeningFinalDecision.create({ data: { projectId: c.project.id, roundId, roundVersion: next.version, decision: agreement.decision, source: "CONSENSUS", resolutionType: "CONSENSUS_AFTER_DISCUSSION", exclusionReason: agreement.exclusionReason, sourceMaterial: agreement.sourceMaterial, reason: agreement.reason, resolverId: null, reviewIds: agreement.reviewIds } });
        await c.tx.screeningAudit.create({ data: { projectId: c.project.id, roundId, actorId: c.actorId, type: "GROUP_AGREEMENT", details: { proposalId: agreement.id, decision: agreement.decision, reason: agreement.reason, reviewIds: agreement.reviewIds, confirmedByIds: [...agreement.confirmedByIds, c.actorId], ruleVersion: roundSettings(row.settings).version } } });
        await projectScreeningStatus(c, row, agreement.decision, agreement.reason);
        await notifyScreeningParticipants(c, row, "CONSENSUS_CONFIRMED", "Đã xác nhận kết quả chung", next.version);
        if (agreement.decision === "INCLUDED" || agreement.retrieveFullText) await advanceScreeningStage(c, next, await effectiveAssignments(c, row.id), Boolean(agreement.retrieveFullText));
      }
      return { roundId, result: { roundId, version: next.version }, details: { proposalId: agreement.id, reviewIds: agreement.reviewIds } };
    });
  },
  async proposal(project: string, actor: string, paperId: string, input: z.infer<typeof s.screeningProposalSchema>) {
    return screeningCommand(project, actor, "PROPOSAL_REASON_UPDATED", { ...input, paperId }, {}, async c => {
      const link = await researchPaper(c, paperId);
      if (link.addedById !== c.actorId) throw AppError.forbidden("Chỉ người đề xuất được sửa lý do đề xuất của mình");
      // screeningCommand holds the same project lock as ballot submission.
      if ((await reviewedProposalPapers(c, [paperId])).has(paperId)) throw AppError.conflict("Bài đã có phiếu đánh giá. Lý do đề xuất đã khóa.");
      if (link.updatedAt.toISOString() !== input.expectedUpdatedAt) throw AppError.conflict("Thông tin bài đã thay đổi, tải lại trước khi lưu");
      const updated = await c.tx.projectPaper.update({ where: { id: link.id }, data: { proposalReason: input.reason, updatedAt: new Date(Math.max(Date.now(), link.updatedAt.getTime()+1)) } });
      return { result: { id: link.id, updatedAt: updated.updatedAt.toISOString() }, details: { paperId, before: link.proposalReason, reason: input.reason } };
    });
  },
  async unblind(project: string, actor: string, roundId: string, input: z.infer<typeof s.screeningActionSchema>) {
    return screeningCommand(project, actor, "EARLY_UNBLIND", { ...input, roundId }, { owner: true }, async c => {
      const row = await screeningRound(c, roundId);
      if ((roundSettings(row.settings).workflowVersion ?? 0) >= 8) throw AppError.conflict("Mỗi reviewer tự sửa phiếu hoặc mở hồ sơ phân xử, không xác nhận thay người còn lại"); expectWorkspaceVersion(row.version, input.expectedVersion);
      if (roundSettings(row.settings).blindReview) throw AppError.conflict("Cần hoàn thành tất cả phiếu trước khi công bố theo quy tắc đã lưu");
      if (!row.active || row.unblindedAt) throw AppError.conflict("Vòng đã công bố phiếu hoặc không còn hoạt động");
      const next = await c.tx.screeningRound.update({ where: { id: roundId }, data: { unblindedAt: new Date(), independenceCompromised: true, version: { increment: 1 } } });
      return { roundId, result: { roundId, version: next.version } };
    });
  },
  async reopen(project: string, actor: string, roundId: string, input: z.infer<typeof s.screeningReopenSchema>) {
    const assignee = await getPrisma().screeningAssignment.findUnique({ where: { id: input.assignmentId }, select: { reviewerId: true } });
    return screeningCommand(project, actor, "REVIEW_REOPENED", { ...input, roundId }, { accounts: assignee ? [assignee.reviewerId] : [] }, async c => {
      const row = await screeningRound(c, roundId); expectWorkspaceVersion(row.version, input.expectedVersion);
      assertScreeningCapacity(row);
      const assignment = await c.tx.screeningAssignment.findFirst({ where: { id: input.assignmentId, roundId, projectId: c.project.id, active: true } });
      if (!assignment?.submittedAt) throw AppError.conflict("Chỉ mở lại phiếu đã gửi trong vòng hiện tại");
      if (!row.active && c.role !== "OWNER") throw AppError.forbidden("Chỉ chủ dự án được mở lại vòng trước");
      await invalidateDependentStages(c, row, input.reason);
      const protocol = independentWorkflow(roundSettings(row.settings));
      if (["INCLUDED", "EXCLUDED", "BACKGROUND", "WAITING_FULLTEXT"].includes(row.status) && c.role !== "OWNER") throw AppError.forbidden("Kết quả đã chốt. Cần chủ dự án mở lại có lý do và lưu lịch sử");
      const dispute = await latestCase(c, roundId);
      if (dispute && (Boolean(dispute.finalDecisionId) || dispute.active && await caseReady(c, dispute)) && c.role !== "OWNER") throw AppError.forbidden("Hồ sơ đã khóa hoặc có kết luận. Cần chủ dự án mở lại có lý do và lưu lịch sử");
      if (c.role !== "OWNER" && !(protocol && assignment.reviewerId === c.actorId)) throw AppError.forbidden("Chỉ chủ dự án hoặc reviewer tự mở lại phiếu của mình");
      await closeCase(c, roundId, "CANCELLED_REOPENED");
      await assertWorkspaceAssignee(c, assignment.reviewerId);
      if (protocol) await c.tx.mentorResourceShare.updateMany({ where: { projectId: c.project.id, sectionKey: adjudicationSection(row.id), revokedAt: null }, data: { revokedAt: new Date() } });
      await c.tx.screeningAssignment.update({ where: { id: assignment.id }, data: { submittedAt: null, dueAt: null, revision: { increment: 1 } } });
      const next = await c.tx.screeningRound.update({ where: { id: roundId }, data: { active: true, status: "IN_REVIEW", ...(protocol ? { finalizerId: null } : {}), independenceCompromised: row.independenceCompromised || Boolean(row.unblindedAt), version: { increment: 1 } } });
      await projectScreeningStatus(c, row, "IN_REVIEW");
      await notifyScreeningParticipants(c, row, "REOPENED", "Một phiếu đánh giá đã được mở lại", next.version, [assignment.reviewerId]);
      return { roundId, result: { roundId, version: next.version }, details: { ...input, reviewerId: assignment.reviewerId, previousRevision: assignment.revision } };
    });
  },
  async comment(project: string, actor: string, roundId: string, input: z.infer<typeof s.screeningCommentSchema>) {
    return screeningCommand(project, actor, "DISCUSSION", { ...input, roundId }, { mentor: true, mentorScope: "SHARED_RESOURCES" }, async c => {
      const row = await screeningRound(c, roundId);
      if (input.shareWithAdjudicator || !c.role) throw AppError.forbidden("Không có kênh trao đổi với người phân xử");
      const ownAssignment = await c.tx.screeningAssignment.findFirst({ where: { roundId, reviewerId: c.actorId, active: true, submittedAt: { not: null } } });
      const activeCase = await latestCase(c, roundId);
      if (["INCLUDED", "EXCLUDED", "BACKGROUND", "WAITING_FULLTEXT"].includes(row.status)) throw AppError.conflict("Vòng đã có kết quả, thảo luận chỉ được xem lại");
      if (activeCase?.active) throw AppError.conflict("Hồ sơ đã mở. Bổ sung ý kiến riêng trong thời hạn chung");
      const assignments = await effectiveAssignments(c, row.id);
      if (!row.active || !screeningReviewsVisible(row, roundSettings(row.settings), assignments)) throw AppError.conflict("Thảo luận chỉ mở sau khi công bố đánh giá độc lập");
      if (independentWorkflow(roundSettings(row.settings)) && !ownAssignment) throw AppError.forbidden("Thảo luận riêng dành cho hai reviewer");
      const reviews = await c.tx.screeningReview.findMany({ where: { projectId: c.project.id, OR: assignments.filter(a => a.submittedAt).map(a => ({ assignmentId: a.id, revision: a.revision })) }, select: { id: true } });
      return { roundId, result: { roundId }, details: { comment: input.comment, reviewIds: reviews.map(r => r.id).sort() } };
    });
  },
  async detail(project: string, actor: string, roundId: string) { return withWorkspace(project, actor, {}, async c => roundView(c, await screeningRound(c, roundId))); },
  async board(project: string, actor: string, query: Page): Promise<ScreeningBoard> {
    return withWorkspace(project, actor, {}, async c => {
      const rounds = await c.tx.screeningRound.findMany({ where: { projectId: c.project.id, active: true }, });
      const allLinks = await c.tx.projectPaper.findMany({ where: { projectId: c.project.id }, select: { paperId: true, screeningStatus: true, addedById: true, tags: true, notes: true } });
      const isSpecialFilter = ["ALL", "CONFLICT", "PROPOSED_BY_ME", "QUEUE"].includes(query.filter);
      const mine = !isSpecialFilter ? await c.tx.screeningAssignment.findMany({ where: { projectId: c.project.id, reviewerId: c.actorId, active: true, ...(query.filter === "COMPLETED" ? { submittedAt: { not: null } } : ["PENDING", "OVERDUE"].includes(query.filter) ? { submittedAt: null } : {}), ...(query.filter === "OVERDUE" ? { dueAt: { lt: new Date() } } : {}) }, select: { roundId: true } }) : null;
      const roundIds = mine ? new Set(mine.map(a => a.roundId)) : null;
      let paperIds: string[] | null = null;
      if (query.filter === "CONFLICT") {
        paperIds = rounds.filter(r => ["NEEDS_RESOLUTION", "ADJUDICATING"].includes(r.status)).map(r => r.paperId);
      } else if (query.filter === "PROPOSED_BY_ME") {
        paperIds = allLinks.filter(l => l.addedById === c.actorId).map(l => l.paperId);
      } else if (query.filter === "QUEUE") {
        const queue = await screeningQueue(c);
        paperIds = queue.filter(r => !query.slots || query.slots === "ALL" || (query.slots === "UNCLAIMED" ? r.occupiedCount === 0 : r.occupiedCount === 1)).map(r => r.paperId);
      } else if (roundIds) {
        paperIds = rounds.filter(r => roundIds.has(r.id)).map(r => r.paperId);
      }
      const candidateAssignments = await c.tx.screeningAssignment.findMany({ where: { projectId: c.project.id, active: true, roundId: { in: rounds.map(r => r.id) } }, select: { roundId: true, reviewerId: true, submittedAt: true, active: true, dueAt: true } });
      const liveReviewers = new Set((await screeningPeople(c)).map(p => p.id));
      const allAssignments = candidateAssignments.filter(a => occupiedScreeningSlot(a) && (a.submittedAt || liveReviewers.has(a.reviewerId)));
      const source = query.source ? await c.tx.paper.findUnique({ where: workspaceId(query.source), select: { id: true } }) : null;
      const linkedIds = allLinks.map(l => l.paperId);
      const relatedMatches = query.q ? await Promise.all([
        c.tx.paperAuthor.findMany({ where: { paperId: { in: linkedIds }, displayName: { contains: query.q, mode: "insensitive" } }, select: { paperId: true } }),
        c.tx.paperKeyword.findMany({ where: { paperId: { in: linkedIds }, keywordName: { contains: query.q, mode: "insensitive" } }, select: { paperId: true } }),
      ]) : [];
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query.q);
      const isMongoId = /^[0-9a-f]{24}$/i.test(query.q);
      const matches = query.q ? await c.tx.paper.findMany({ where: { id: { in: linkedIds }, OR: [...(isUuid ? [{ id: query.q }] : []), ...(isMongoId ? [{ legacyMongoId: query.q }] : []), { title: { contains: query.q, mode: "insensitive" } }, { doi: { contains: query.q, mode: "insensitive" } }, { id: { in: relatedMatches.flat().map(match => match.paperId) } }] }, select: { id: true } }) : null;
      const roundByPaper = new Map(rounds.map(r => [r.paperId, r]));
      const reviewerRounds = new Set(allAssignments.filter(a => a.reviewerId === query.reviewerId).map(a => a.roundId));
      const classified = new Map<string, string | null>();
      if (query.status && ["CONFLICT", "NEEDS_CLARIFICATION", "NEEDS_MORE_INFORMATION", "EXCLUSION_REASON_MISMATCH", "RESOLVED"].includes(query.status)) {
        for (const r of rounds) classified.set(r.paperId, ["INCLUDED", "EXCLUDED", "BACKGROUND"].includes(r.status) && !r.legacyNeedsAudit ? "RESOLVED" : ["NEEDS_RESOLUTION", "NEEDS_MORE_INFO"].includes(r.status) ? await screeningClassification(c, r) : null);
      }
      // Shared legacy labels are evidence of a past classification, never of a completed protocol.
      const state = (l: typeof allLinks[number]) => roundByPaper.get(l.paperId)?.status ?? "NOT_REVIEWED";
      const matchIds = matches ? new Set(matches.map(p => p.id)) : null, filteredIds = paperIds ? new Set(paperIds) : null;
      const ids = allLinks.filter(l => (!filteredIds || filteredIds.has(l.paperId) || Boolean(query.source && query.filter !== "QUEUE")) && (!query.source || source?.id === l.paperId) && (!matchIds || matchIds.has(l.paperId) || l.tags.some(t => t.toLocaleLowerCase().includes(query.q.toLocaleLowerCase())) || l.notes?.toLocaleLowerCase().includes(query.q.toLocaleLowerCase())) && (!query.tag || l.tags.includes(query.tag)) && (!query.proposerId || l.addedById === query.proposerId) && (!query.status || (classified.size ? classified.get(l.paperId) === query.status : state(l) === query.status)) && (!query.reviewerId || reviewerRounds.has(roundByPaper.get(l.paperId)?.id ?? ""))).map(l => l.paperId);
      const reviewed = new Set(allAssignments.filter(a => a.submittedAt).map(a => a.roundId));
      const progress = { total: allLinks.length, reviewed: reviewed.size, finalized: allLinks.filter(l => !roundByPaper.get(l.paperId)?.legacyNeedsAudit && ["INCLUDED", "EXCLUDED", "BACKGROUND"].includes(state(l))).length, legacy: allLinks.filter(l => roundByPaper.get(l.paperId)?.legacyNeedsAudit || !roundByPaper.has(l.paperId) && l.screeningStatus !== "UNDECIDED").length };
      const queueOrder = query.filter === "QUEUE" ? new Map((paperIds ?? []).map((id, i) => [id, i])) : null;
      if (queueOrder) ids.sort((a, b) => queueOrder.get(a)! - queueOrder.get(b)!);
      const sortPapers = !queueOrder && (query.sort === "title" || query.sort === "year") ? await c.tx.paper.findMany({ where: { id: { in: ids } }, orderBy: query.sort === "title" ? [{ title: "asc" }, { id: "asc" }] : [{ publicationYear: "desc" }, { id: "asc" }], select: { id: true } }) : null;
      const sortedPage = queueOrder ? ids.slice((query.page - 1) * query.pageSize, query.page * query.pageSize) : sortPapers?.slice((query.page - 1) * query.pageSize, query.page * query.pageSize).map(p => p.id);
      const where = { projectId: c.project.id, paperId: { in: ids } };
      const [links, total, people, settings] = await Promise.all([c.tx.projectPaper.findMany({ where: sortedPage ? { projectId: c.project.id, paperId: { in: sortedPage } } : where, orderBy: [{ createdAt: query.sort === "oldest" ? "asc" : "desc" }, { id: "desc" }], ...(sortedPage ? {} : { skip: (query.page-1)*query.pageSize, take: query.pageSize }) }), c.tx.projectPaper.count({ where }), screeningPeople(c), screeningSettings(c)]);
      const [papers, legacy, authors, files, keywords] = await Promise.all([
        c.tx.paper.findMany({ where: { id: { in: links.map(l => l.paperId) } }, select: { id: true, title: true, abstractText: true, doi: true, publicationYear: true, journalName: true, paperKind: true, paperLink: true, openAccessUrl: true, pdfPath: true, citationCount: true, openAccessStatus: true } }),
        c.tx.screeningLegacyRecord.findMany({ where: { projectId: c.project.id, paperId: { in: links.map(l => l.paperId) } }, select: { paperId: true, snapshot: true } }),
        c.tx.paperAuthor.findMany({ where: { paperId: { in: links.map(l => l.paperId) } }, orderBy: { position: "asc" }, select: { paperId: true, displayName: true } }),
        c.tx.projectPaperFile.findMany({ where: { projectId: c.project.id, paperId: { in: links.map(l => l.paperId) } }, select: { paperId: true } }),
        c.tx.paperKeyword.findMany({ where: { paperId: { in: links.map(l => l.paperId) } }, orderBy: { position: "asc" }, select: { paperId: true, keywordName: true } }),
      ]);
      const pageRounds = await c.tx.screeningRound.findMany({ where: { projectId: c.project.id, active: true, paperId: { in: links.map(l => l.paperId) } } });
      const allMyAssignments = await c.tx.screeningAssignment.findMany({ where: { projectId: c.project.id, reviewerId: c.actorId, active: true, roundId: { in: rounds.map(r => r.id) } }, select: { submittedAt: true, dueAt: true, active: true } });
      const myAssignments = allMyAssignments.filter(a => occupiedScreeningSlot(a));
      const myProgress = { assigned: myAssignments.length, completed: myAssignments.filter(a => a.submittedAt).length, pending: myAssignments.filter(a => !a.submittedAt).length, overdue: myAssignments.filter(a => !a.submittedAt && a.dueAt && a.dueAt < new Date()).length };
      const proposerIds = new Set(allLinks.flatMap(l => l.addedById ? [l.addedById] : [])), reviewerIds = new Set(allAssignments.map(a => a.reviewerId));
      const proposers = await c.tx.user.findMany({ where: { id: { in: [...new Set([...proposerIds, ...reviewerIds])] } }, select: { id: true, fullName: true } });
      const filterPeople = proposers.map(p => ({ id: p.id, name: p.fullName || "Thành viên" }));
      const filters = { proposers: filterPeople.filter(p => proposerIds.has(p.id)), reviewers: filterPeople.filter(p => reviewerIds.has(p.id)) };
      if (sortedPage) links.sort((a, b) => sortedPage.indexOf(a.paperId) - sortedPage.indexOf(b.paperId));
      const reviewedProposals = await reviewedProposalPapers(c, links.map(l => l.paperId));
      const items = await Promise.all(links.map(async l => { const paper = papers.find(p => p.id === l.paperId)!, round = pageRounds.find(r => r.paperId === l.paperId); return { tags: l.tags, notes: l.notes, importSource: l.importSource, proposer: l.addedById ? { id: l.addedById, name: proposers.find(p => p.id === l.addedById)?.fullName || "Thành viên" } : null, proposedAt: l.createdAt.toISOString(), proposalReason: l.proposalReason, updatedAt: l.updatedAt.toISOString(), canEditProposal: l.addedById === c.actorId && !["ARCHIVED", "COMPLETED"].includes(c.project.status) && !reviewedProposals.has(l.paperId), paperId: l.paperId, title: paper.title, abstractText: paper.abstractText, doi: paper.doi, publicationYear: paper.publicationYear, journalName: paper.journalName, paperKind: paper.paperKind, authors: authors.filter(a => a.paperId === l.paperId).map(a => a.displayName), paperLink: paper.paperLink ?? paper.openAccessUrl, fullTextAvailable: Boolean(paper.openAccessUrl || paper.pdfPath || files.some(f => f.paperId === l.paperId)), citationCount: paper.citationCount, openAccessStatus: paper.openAccessStatus, keywords: keywords.filter(k => k.paperId === l.paperId).map(k => k.keywordName), legacyStatus: l.screeningStatus, legacyProvenance: !round && (legacy.some(r => r.paperId === l.paperId && meaningfulLegacyScreening(r.snapshot)) || ["INCLUDED", "EXCLUDED"].includes(l.screeningStatus)), round: round ? await roundView(c, round) : null }; }));
      return { ...(c.role === "OWNER" ? { adjudicatorOptions: await screeningAdjudicatorPool(c) } : {}), librarySummary: { selected: rounds.filter(r => r.status === "INCLUDED").length, attention: allLinks.length - progress.finalized, discussion: rounds.filter(r => ["NEEDS_RESOLUTION", "ADJUDICATING"].includes(r.status)).length }, tags: [...new Set(allLinks.flatMap(l => l.tags))].sort(), filters, progress, items, page: query.page, pageSize: query.pageSize, total, hasNext: query.page*query.pageSize<total, people, settings, myProgress, canManage: c.role === "OWNER" && !["ARCHIVED", "COMPLETED"].includes(c.project.status) };
    });
  },
  async history(project: string, actor: string, roundId: string, page = 1, kind: "ALL" | "DISCUSSION" | "HISTORY" = "ALL") {
    return withWorkspace(project, actor, {}, async c => {
      const round = await screeningRound(c, roundId), where = { projectId: c.project.id, ...(kind === "DISCUSSION" ? { type: "DISCUSSION" } : kind === "HISTORY" ? { type: { not: "DISCUSSION" } } : {}), OR: [{ roundId }, { type: "PROPOSAL_REASON_UPDATED", details: { path: ["paperId"], equals: round.paperId } }] };
      const [rows, total] = await Promise.all([c.tx.screeningAudit.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page-1)*20, take: 20 }), c.tx.screeningAudit.count({ where })]);
      const reviewsVisible = screeningReviewsVisible(round, roundSettings(round.settings), await effectiveAssignments(c, round.id));
      const items = await Promise.all(rows.map(async r => {
        const visible = r.type === "PROPOSAL_REASON_UPDATED" || reviewsVisible;
        let details = visible || r.actorId === c.actorId ? r.details as Record<string, unknown> : null;
        if (details && typeof details.reviewId === "string") {
          const review = await c.tx.screeningReview.findFirst({ where: { id: details.reviewId, projectId: c.project.id } });
          const assignment = review ? await c.tx.screeningAssignment.findFirst({ where: { id: review.assignmentId, roundId, projectId: c.project.id } }) : null;
          if (review && assignment && (visible || assignment.reviewerId === c.actorId)) details = { ...details, review: { decision: review.decision, exclusionReason: review.exclusionReason, comment: review.comment, revision: review.revision, scope: review.scope, fullTextReference: review.fullTextReference, researchQuestions: review.researchQuestions, submittedAt: review.submittedAt.toISOString() } };
        }
        const author = await c.tx.user.findUnique({ where: { id: r.actorId }, select: { fullName: true } });
        return { id: r.id, type: r.type, actorId: r.actorId, actorName: author?.fullName || "Thành viên", createdAt: r.createdAt.toISOString(), details };
      }));
      return { items, page, pageSize: 20, total, hasNext: page*20<total };
    });
  },
  async rounds(project: string, actor: string, paperId: string, page = 1) {
    return withWorkspace(project, actor, {}, async c => {
      await researchPaper(c, paperId);
      const where = { projectId: c.project.id, paperId };
      const [rows, total, legacy] = await Promise.all([c.tx.screeningRound.findMany({ where, orderBy: { number: "desc" }, skip: (page-1)*10, take: 10 }), c.tx.screeningRound.count({ where }), c.tx.screeningLegacyRecord.findUnique({ where: { projectId_paperId: { projectId: c.project.id, paperId } } })]);
      return { items: await Promise.all(rows.map(r => roundView(c, r))), page, pageSize: 10, total, hasNext: page*10<total, legacy: meaningfulLegacyScreening(legacy?.snapshot) ? legacy!.snapshot : null };
    });
  },
  async analytics(project: string, actor: string): Promise<ScreeningMetrics> {
    return withWorkspace(project, actor, {}, async c => {
      const rounds = await c.tx.screeningRound.findMany({ where: { projectId: c.project.id, active: true } });
      const metrics: ScreeningMetrics = { reviewedPapers: 0, finalizedPapers: 0, legacyPapers: 0, totalPapers: await c.tx.projectPaper.count({ where: { projectId: c.project.id } }), evaluatedPapers: rounds.length, fullyParticipated: 0, fullyReviewed: 0, agreements: 0, disagreements: 0, pendingReviews: 0, submittedReviews: 0, assignedReviews: 0, completionRate: null, agreementRate: null, conflictRate: null, unresolved: 0, resolved: 0, excludedFromAgreement: 0, distribution: { WAITING_FULLTEXT: 0, NOT_REVIEWED: 0, IN_REVIEW: 0, NEEDS_RESOLUTION: 0, NEEDS_MORE_INFO: 0, ADJUDICATING: 0, AWAITING_FINALIZATION: 0, INCLUDED: 0, EXCLUDED: 0, BACKGROUND: 0, CLOSED_UNRESOLVED: 0 }, exclusionReasons: [], workload: [], kappa: cohenKappa([]) };
      const pairs: { reviewers: string[]; decisions: ScreeningChoice[] }[] = [], workload = new Map<string, ScreeningMetrics["workload"][number]>(), reasons = new Map<string, number>(); let conflicts = 0;
      for (const row of rounds) {
        const view = await roundView(c, row);
        metrics.distribution[view.status]++; if (view.completed) metrics.reviewedPapers++; if (view.finalDecision) metrics.finalizedPapers++; metrics.assignedReviews+=view.assigned; metrics.submittedReviews+=view.completed;
        for (const a of view.assignments) { const load = workload.get(a.reviewerId) ?? { reviewerId: a.reviewerId, name: a.name, assigned: 0, completed: 0, overdue: 0 }; load.assigned++; if (a.completed) load.completed++; if (a.overdue) load.overdue++; workload.set(a.reviewerId, load); }
        if (["NEEDS_RESOLUTION", "NEEDS_MORE_INFO", "ADJUDICATING"].includes(view.status)) metrics.unresolved++;
        if (view.finalDecision?.source === "MANUAL" && new Set(view.reviews.map(r => r.decision)).size > 1) metrics.resolved++;
        // Never compute any decision-derived statistic on still-blinded/incomplete rounds.
        if (!view.unblindedAt || view.assigned < view.settings.requiredReviewers || view.completed !== view.assigned) continue;
        metrics.fullyParticipated++;
        if (view.independenceCompromised) { metrics.excludedFromAgreement++; continue; }
        if (view.settings.reviewMode === "SIMPLE" || !view.settings.blindReview) continue;
        metrics.fullyReviewed++;
        const decisions = view.reviews.map(r => r.decision);
        if (["AGREEMENT_INCLUDE", "AGREEMENT_EXCLUDE"].includes(view.classification ?? "")) metrics.agreements++;
        else if (["CONFLICT", "EXCLUSION_REASON_MISMATCH"].includes(view.classification ?? "")) metrics.disagreements++;
        if (view.classification === "CONFLICT") conflicts++;
        pairs.push({ reviewers: view.reviews.map(r => r.reviewerId), decisions });
        for (const r of view.reviews.filter(r => r.decision === "EXCLUDE")) reasons.set(r.exclusionReason, (reasons.get(r.exclusionReason) ?? 0)+1);
      }
      const started = new Set(rounds.map(r => r.paperId));
      for (const link of await c.tx.projectPaper.findMany({ where: { projectId: c.project.id }, select: { paperId: true, screeningStatus: true } })) {
        if (!started.has(link.paperId)) {
          metrics.distribution.NOT_REVIEWED++;
          if (link.screeningStatus !== "UNDECIDED") metrics.legacyPapers++;
        }
      }
      metrics.pendingReviews=metrics.assignedReviews-metrics.submittedReviews; metrics.completionRate=metrics.assignedReviews ? 100*metrics.submittedReviews/metrics.assignedReviews : null;
      metrics.agreementRate=metrics.fullyReviewed ? 100*metrics.agreements/metrics.fullyReviewed : null; metrics.conflictRate=metrics.fullyReviewed ? 100*conflicts/metrics.fullyReviewed : null;
      metrics.workload=[...workload.values()]; metrics.exclusionReasons=[...reasons].map(([reason, count]) => ({ reason, count })); metrics.kappa=cohenKappa(pairs); return metrics;
    });
  },

  async claim(project: string, actor: string, roundId: string, rawInput: z.infer<typeof screeningClaimSchema>) {
    const input = screeningClaimSchema.parse(rawInput);
    return screeningCommand(project, actor, "ROUND_CLAIMED", { ...input, roundId }, {}, async c => {
      const result = await claimScreeningSlot(c, await screeningRound(c, roundId));
      return { roundId, result, details: { reviewerId: c.actorId, dueAt: result.dueAt, leaseHours: 24 } };
    });
  },

  async release(project: string, actor: string, roundId: string, rawInput: z.infer<typeof screeningReleaseSchema>) {
    const input = screeningReleaseSchema.parse(rawInput);
    return screeningCommand(project, actor, "ROUND_RELEASED", { ...input, roundId }, {}, async c => {
      const round = await screeningRound(c, roundId);
      if (!round.active || round.unblindedAt) throw AppError.conflict("Không trả suất sau khi công bố phiếu; dùng quy trình sửa phiếu");
      const assignment = await c.tx.screeningAssignment.findUnique({
        where: { roundId_reviewerId: { roundId, reviewerId: c.actorId } }
      });
      if (!assignment || !occupiedScreeningSlot(assignment) || assignment.projectId !== c.project.id) {
        throw AppError.notFound("Bạn không giữ suất đánh giá nào cho bài này");
      }
      if (assignment.submittedAt) {
        throw AppError.conflict("Đánh giá đã được gửi hoàn tất, không thể trả lại hàng đợi");
      }
      await c.tx.screeningAssignment.update({
        where: { id: assignment.id },
        data: { active: false, dueAt: null }
      });
      return {
        roundId,
        result: { roundId, released: true },
        details: { reviewerId: c.actorId }
      };
    });
  },

  async extend(project: string, actor: string, roundId: string, rawInput: z.infer<typeof screeningExtendSchema>) {
    const input = screeningExtendSchema.parse(rawInput);
    return screeningCommand(project, actor, "LEASE_EXTENDED", { ...input, roundId }, {}, async c => {
      const round = await screeningRound(c, roundId);
      if (!round.active || round.unblindedAt) throw AppError.conflict("Vòng không còn giữ chỗ đánh giá");
      const assignment = await c.tx.screeningAssignment.findUnique({
        where: { roundId_reviewerId: { roundId, reviewerId: c.actorId } }
      });
      if (!assignment || !occupiedScreeningSlot(assignment) || assignment.projectId !== c.project.id) {
        throw AppError.notFound("Không tìm thấy phân công của bạn cho bài này");
      }
      if (assignment.submittedAt) {
        throw AppError.conflict("Phiếu đánh giá đã được gửi, không cần gia hạn giữ chỗ");
      }
      if (!assignment.dueAt) throw AppError.conflict("Phân công này không có thời hạn nên không cần gia hạn");
      const currentDue = assignment.dueAt.getTime();
      const newDue = new Date(currentDue + 24 * 60 * 60 * 1000);
      const updated = await c.tx.screeningAssignment.update({
        where: { id: assignment.id },
        data: { dueAt: newDue }
      });
      return {
        roundId,
        result: {
          roundId,
          assignmentId: updated.id,
          dueAt: updated.dueAt?.toISOString() ?? null,
        },
        details: {
          reviewerId: c.actorId,
          dueAt: updated.dueAt?.toISOString() ?? null,
        }
      };
    });
  },

  async grantProposerException(project: string, actor: string, roundId: string, rawInput: z.infer<typeof screeningProposerExceptionSchema>) {
    const input = screeningProposerExceptionSchema.parse(rawInput);
    return screeningCommand(project, actor, "PROPOSER_EXCEPTION_GRANTED", input, { owner: true }, async c => {
      const round = await screeningRound(c, roundId);
      const link = await c.tx.projectPaper.findUniqueOrThrow({
        where: { projectId_paperId: { projectId: c.project.id, paperId: round.paperId } },
        select: { addedById: true }
      });
      if (!link.addedById) throw AppError.badRequest("Bài báo không có thông tin người đề xuất");
      const authorizer = await c.tx.user.findUnique({ where: { id: c.actorId }, select: { fullName: true } });
      const details = {
        paperId: round.paperId,
        roundId: round.id,
        proposerId: link.addedById,
        reason: input.reason.trim(),
        authorizerId: c.actorId,
        authorizerName: authorizer?.fullName || "Chủ đề tài",
        grantedAt: new Date().toISOString(),
      };
      await c.tx.screeningAudit.create({
        data: {
          projectId: c.project.id,
          roundId: round.id,
          actorId: c.actorId,
          type: "PROPOSER_EXCEPTION_GRANTED",
          details: jsonSnapshot(details),
          clientKey: input.clientKey,
        }
      });
      const next = await c.tx.screeningRound.update({ where: { id: round.id }, data: { version: { increment: 1 } } });
      return { roundId, result: { roundId, version: next.version, granted: true }, details };
    });
  },

  async extendDiscussion(project: string, actor: string, roundId: string, rawInput: z.infer<typeof s.screeningDiscussionExtendSchema>) {
    const input = s.screeningDiscussionExtendSchema.parse(rawInput);
    return screeningCommand(project, actor, "DISCUSSION_EXTENDED", { ...input, roundId }, { owner: true }, async c => {
      const row = await screeningRound(c, roundId);
      expectWorkspaceVersion(row.version, input.expectedVersion);
      if (!row.active || !["NEEDS_RESOLUTION", "NEEDS_MORE_INFO"].includes(row.status)) {
        throw AppError.conflict("Chỉ gia hạn thảo luận cho vòng đang có bất đồng hoặc cần làm rõ.");
      }
      const timing = await getDiscussionTiming(c, row);
      if (!timing) {
        throw AppError.conflict("Vòng chưa bắt đầu giai đoạn thảo luận.");
      }
      if (timing.extensionCount >= timing.maxExtensions) {
        throw AppError.conflict(`Đã đạt giới hạn gia hạn tối đa (${timing.maxExtensions} lần).`);
      }
      const hardDeadline = new Date(timing.hardDeadlineAt);
      const currentEffective = new Date(timing.effectiveDeadlineAt);
      const newEffectiveDeadline = new Date(Math.min(currentEffective.getTime() + input.hours * 3600 * 1000, hardDeadline.getTime()));

      await c.tx.screeningAudit.create({
        data: {
          projectId: c.project.id,
          roundId,
          actorId: c.actorId,
          type: "DISCUSSION_EXTENDED",
          details: {
            hours: input.hours,
            reason: input.reason,
            extendedBy: c.actorId,
            newEffectiveDeadline: newEffectiveDeadline.toISOString(),
            extensionCount: timing.extensionCount + 1,
          },
          clientKey: input.clientKey,
        }
      });
      const next = await c.tx.screeningRound.update({ where: { id: roundId }, data: { version: { increment: 1 } } });
      await notifyScreeningParticipants(c, row, "DISCUSSION_EXTENDED", `Thời hạn thảo luận được gia hạn thêm ${input.hours} giờ`, next.version);
      return { roundId, result: { roundId, version: next.version, effectiveDeadlineAt: newEffectiveDeadline.toISOString() }, details: { hours: input.hours, reason: input.reason } };
    });
  },

  async closeUnresolved(project: string, actor: string, roundId: string, rawInput: z.infer<typeof s.screeningCloseUnresolvedSchema>) {
    const input = s.screeningCloseUnresolvedSchema.parse(rawInput);
    return screeningCommand(project, actor, "ROUND_CLOSED_UNRESOLVED", { ...input, roundId }, { owner: true }, async c => {
      const row = await screeningRound(c, roundId);
      expectWorkspaceVersion(row.version, input.expectedVersion);
      if (!row.active || !["NEEDS_RESOLUTION", "NEEDS_MORE_INFO"].includes(row.status)) {
        throw AppError.conflict("Vòng đã hoàn tất hoặc đã đóng.");
      }
      const timing = await getDiscussionTiming(c, row);
      const now = new Date();
      if (timing && input.reason !== "DEADLINE_EXPIRED" && now < new Date(timing.initialDeadlineAt)) {
        throw AppError.conflict("Thời gian thảo luận ban đầu (48 giờ) chưa kết thúc. Hãy để 2 reviewer thảo luận thêm.");
      }

      const next = await c.tx.screeningRound.update({
        where: { id: roundId },
        data: { status: "CLOSED_UNRESOLVED", version: { increment: 1 } }
      });

      const details = {
        actorType: "OWNER",
        actorId: c.actorId,
        reason: input.reason,
        note: input.note ?? "",
        closedAt: now.toISOString(),
      };
      await c.tx.screeningAudit.create({
        data: {
          projectId: c.project.id,
          roundId,
          actorId: c.actorId,
          type: "ROUND_CLOSED_UNRESOLVED",
          details: jsonSnapshot(details),
          clientKey: input.clientKey,
        }
      });

      await projectScreeningStatus(c, next, "CLOSED_UNRESOLVED", input.note || input.reason);
      await reconcileScreeningObligations(c);
      await notifyScreeningParticipants(c, row, "ROUND_CLOSED", "Quy trình đánh giá đã đóng do không đạt đồng thuận", next.version);
      return { roundId, result: { roundId, version: next.version, status: "CLOSED_UNRESOLVED" }, details };
    });
  },

  async reopenUnresolved(project: string, actor: string, roundId: string, rawInput: z.infer<typeof s.screeningReopenUnresolvedSchema>) {
    const input = s.screeningReopenUnresolvedSchema.parse(rawInput);
    return screeningCommand(project, actor, "SCREENING_REOPENED_NEW_ATTEMPT", { ...input, roundId }, { owner: true }, async c => {
      const row = await screeningRound(c, roundId);
      expectWorkspaceVersion(row.version, input.expectedVersion);
      if (row.status !== "CLOSED_UNRESOLVED") {
        throw AppError.conflict("Chỉ mở lại cho bài báo có vòng đánh giá đã đóng không đạt đồng thuận.");
      }

      // Deactivate previous round so the new round is the active one
      await c.tx.screeningRound.update({
        where: { id: row.id },
        data: { active: false, version: { increment: 1 } }
      });

      const settings = await settingsForNewScreening(c);
      const newRound = await c.tx.screeningRound.create({
        data: {
          projectId: c.project.id,
          paperId: row.paperId,
          number: row.number + 1,
          phase: row.phase,
          settings: jsonSnapshot(settings),
          createdById: c.actorId,
          status: "NOT_REVIEWED",
          active: true,
        }
      });

      const details = {
        previousRoundId: row.id,
        previousRoundNumber: row.number,
        newRoundId: newRound.id,
        newRoundNumber: newRound.number,
        reason: input.reason,
        reopenedBy: c.actorId,
        reopenedAt: new Date().toISOString(),
      };
      await c.tx.screeningAudit.create({
        data: {
          projectId: c.project.id,
          roundId: newRound.id,
          actorId: c.actorId,
          type: "SCREENING_REOPENED_NEW_ATTEMPT",
          details: jsonSnapshot(details),
          clientKey: input.clientKey,
        }
      });

      await projectScreeningStatus(c, newRound, "NOT_REVIEWED");
      await reconcileScreeningObligations(c);
      await notifyScreeningParticipants(c, row, "ROUND_REOPENED", "Chủ đề tài đã mở lại vòng đánh giá mới cho bài báo", newRound.version);
      return { roundId: newRound.id, result: { previousRoundId: row.id, newRoundId: newRound.id, version: newRound.version }, details };
    });
  },

  async requestMoreInfo(project: string, actor: string, roundId: string, rawInput: z.infer<typeof s.screeningRequestMoreInfoSchema>) {
    const input = s.screeningRequestMoreInfoSchema.parse(rawInput);
    return screeningCommand(project, actor, "MORE_INFO_REQUESTED", { ...input, roundId }, {}, async c => {
      const row = await screeningRound(c, roundId);
      expectWorkspaceVersion(row.version, input.expectedVersion);
      if (!row.active || !["NEEDS_RESOLUTION", "NEEDS_MORE_INFO"].includes(row.status)) {
        throw AppError.conflict("Chỉ có thể yêu cầu thêm thông tin cho vòng đang có bất đồng hoặc cần làm rõ.");
      }
      const ownAssignment = await c.tx.screeningAssignment.findFirst({
        where: { roundId, reviewerId: c.actorId, active: true, submittedAt: { not: null } }
      });
      if (!ownAssignment) {
        throw AppError.forbidden("Chỉ reviewer đã gửi phiếu trong vòng mới có thể yêu cầu làm rõ thêm thông tin.");
      }
      const next = await c.tx.screeningRound.update({
        where: { id: roundId },
        data: { status: "NEEDS_MORE_INFO", version: { increment: 1 } }
      });
      const now = new Date();
      const details = {
        reason: input.reason.trim(),
        requestedBy: c.actorId,
        requestedAt: now.toISOString(),
      };
      await c.tx.screeningAudit.create({
        data: {
          projectId: c.project.id,
          roundId,
          actorId: c.actorId,
          type: "MORE_INFO_REQUESTED",
          details: jsonSnapshot(details),
          clientKey: input.clientKey,
        }
      });
      await projectScreeningStatus(c, next, "NEEDS_MORE_INFO", input.reason);
      const otherReviewers = (await effectiveAssignments(c, row.id))
        .map(a => a.reviewerId)
        .filter(id => id !== c.actorId);
      for (const reviewerId of otherReviewers) {
        await notificationService.create({
          userId: reviewerId,
          type: "SCREENING_ACTION_REQUIRED",
          paperId: row.paperId,
          title: "Reviewer yêu cầu làm rõ thêm thông tin cho bài báo",
          message: input.reason.trim(),
          targetKind: "project",
          targetId: c.project.id,
          eventKey: `SCREENING:MORE_INFO:${roundId}:${now.getTime()}`,
          emailStatus: "SKIPPED",
        }, c.tx);
      }
      return { roundId, result: { roundId, version: next.version, status: "NEEDS_MORE_INFO" }, details };
    });
  },

  async claimNext(project: string, actor: string, rawInput: { clientKey?: string } = {}) {
    const input = screeningClaimSchema.parse(rawInput);
    return screeningCommand(project, actor, "NEXT_ROUND_CLAIMED", input, {}, async c => {
      const [chosen] = await screeningQueue(c);
      if (!chosen) return { result: { paperId: null, roundId: null, dueAt: null } };
      const result = await claimScreeningSlot(c, await screeningRound(c, chosen.roundId));
      return { roundId: chosen.roundId, result, details: { reviewerId: c.actorId, dueAt: result.dueAt, leaseHours: 24 } };
    });
  },

  async workspaceSummary(project: string, actor: string): Promise<ScreeningWorkspaceSummary> {
    return withWorkspace(project, actor, {}, async c => {
      const now = new Date();
      const liveReviewers = new Set((await screeningPeople(c)).map(p => p.id));
      const effectiveSlot = (a: { active: boolean; submittedAt: Date | null; dueAt: Date | null; reviewerId: string }) =>
        occupiedScreeningSlot(a, now) && Boolean(a.submittedAt || liveReviewers.has(a.reviewerId));

      // 1. My active claims (with countdown)
      const myActiveAssigns = await c.tx.screeningAssignment.findMany({
        where: {
          projectId: c.project.id,
          reviewerId: c.actorId,
          active: true,
          submittedAt: null,
          OR: [{ dueAt: null }, { dueAt: { gt: now } }],
        }
      });
      const claimRounds = await c.tx.screeningRound.findMany({
        where: {
          id: { in: myActiveAssigns.map(a => a.roundId) },
          projectId: c.project.id,
          active: true,
          status: { notIn: ["INCLUDED", "EXCLUDED", "BACKGROUND"] }
        }
      });
      const claimPapers = await c.tx.paper.findMany({
        where: { id: { in: claimRounds.map(r => r.paperId) } },
        select: { id: true, title: true, publicationYear: true, journalName: true }
      });
      const claimAuthors = await c.tx.paperAuthor.findMany({
        where: { paperId: { in: claimPapers.map(p => p.id) } },
        orderBy: { position: "asc" },
        select: { paperId: true, displayName: true }
      });

      const claimAssignments = await c.tx.screeningAssignment.findMany({ where: { projectId: c.project.id, roundId: { in: claimRounds.map(r => r.id) }, active: true } });
      const claimNames = await c.tx.user.findMany({ where: { id: { in: claimAssignments.map(a => a.reviewerId) } }, select: { id: true, fullName: true } });
      const myActiveClaims = claimRounds.filter(r => !r.legacyNeedsAudit).map(r => {
        const assign = myActiveAssigns.find(a => a.roundId === r.id)!;
        const paper = claimPapers.find(p => p.id === r.paperId);
        const authors = claimAuthors.filter(a => a.paperId === r.paperId).map(a => a.displayName);
        const dueAt = assign.dueAt;
        const expiresInSeconds = dueAt ? Math.max(0, Math.floor((dueAt.getTime() - now.getTime()) / 1000)) : null;
        return {
          paperId: r.paperId,
          roundId: r.id,
          assignmentId: assign.id,
          title: paper?.title || "Bài báo",
          authors,
          publicationYear: paper?.publicationYear || null,
          journalName: paper?.journalName || null,
          phase: r.phase as ScreeningPhase,
          dueAt: dueAt?.toISOString() ?? null,
          expiresInSeconds,
          canExtend: Boolean(dueAt && dueAt > now && !r.unblindedAt),
          canRelease: !r.unblindedAt,
          partner: (() => { const a = claimAssignments.find(a => a.roundId === r.id && a.reviewerId !== c.actorId && effectiveSlot(a)); return a ? { name: claimNames.find(p => p.id === a.reviewerId)?.fullName || "Thành viên", completed: Boolean(a.submittedAt) } : null; })(),
        };
      });

      // Sort claims so the one expiring soonest is at the very top
      myActiveClaims.sort((a, b) => {
        const aTime = a.expiresInSeconds ?? Infinity;
        const bTime = b.expiresInSeconds ?? Infinity;
        return aTime - bTime;
      });

      // 2. Pending consensus confirmations
      const mySubmittedAssigns = await c.tx.screeningAssignment.findMany({
        where: { projectId: c.project.id, reviewerId: c.actorId, active: true, submittedAt: { not: null } },
        select: { roundId: true }
      });
      const consensusRounds = await c.tx.screeningRound.findMany({
        where: {
          id: { in: mySubmittedAssigns.map(a => a.roundId) },
          projectId: c.project.id,
          active: true,
          status: { in: ["NEEDS_RESOLUTION", "NEEDS_MORE_INFO"] }
        }
      });
      const pendingConsensus: ScreeningWorkspaceSummary["pendingConsensus"] = [];
      for (const r of consensusRounds) {
        if ((roundSettings(r.settings).workflowVersion ?? 0) >= 5 || await latestCase(c, r.id)) continue;
        const agreement = await screeningAgreement(c, r);
        if (agreement && agreement.canConfirm) {
          const paper = await c.tx.paper.findUnique({ where: { id: r.paperId }, select: { title: true } });
          const proposer = await c.tx.user.findUnique({ where: { id: agreement.proposedById }, select: { fullName: true } });
          pendingConsensus.push({
            paperId: r.paperId,
            roundId: r.id,
            agreementId: agreement.id,
            title: paper?.title || "Bài báo",
            decision: agreement.decision,
            reason: agreement.reason,
            proposedByName: proposer?.fullName || "Thành viên",
          });
        }
      }

      // Reconcile the common deadline under the project lock. Tasks and Papers share this projection.
      const activeCases = await c.tx.screeningAdjudicationCase.findMany({ where: { projectId: c.project.id, active: true } });
      const pendingAdjudications: ScreeningWorkspaceSummary["pendingAdjudications"] = [];
      for (const initial of activeCases) {
        const r = await screeningRound(c, initial.roundId);
        const dispute = await ensureAssignment(c, r, initial);
        if (!r.active || dispute.reviewerIds.includes(c.actorId)) continue;
        try {
          const cv = await caseView(c, r, dispute);
          if (cv.canResolve || cv.canCoordinate && (cv.status === "WAITING_ASSIGNMENT" || cv.status === "COI_REVIEW")) {
            pendingAdjudications.push({ paperId: r.paperId, roundId: r.id, title: (dispute.packet as unknown as { paper: { title: string } }).paper.title, status: r.status as ScreeningState, caseStatus: cv.status });
          }
        } catch (error) { if (error instanceof AppError && error.statusCode === 404) continue; throw error; }
      }

      // 4. Proposals by me
      const myProposalsCount = await c.tx.projectPaper.count({
        where: { projectId: c.project.id, addedById: c.actorId }
      });
      const allMyProposals = await c.tx.projectPaper.findMany({
        where: { projectId: c.project.id, addedById: c.actorId },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
      const recentPaperIds = allMyProposals.map(p => p.paperId);
      const recentPapers = await c.tx.paper.findMany({
        where: { id: { in: recentPaperIds } },
        select: { id: true, title: true, publicationYear: true, journalName: true }
      });
      const recentRounds = await c.tx.screeningRound.findMany({
        where: { projectId: c.project.id, paperId: { in: recentPaperIds }, active: true }
      });
      const recentAssignments = await c.tx.screeningAssignment.findMany({
        where: { projectId: c.project.id, roundId: { in: recentRounds.map(r => r.id) }, active: true }
      });
      const recentDecisions = await c.tx.screeningFinalDecision.findMany({
        where: { projectId: c.project.id, roundId: { in: recentRounds.map(r => r.id) } },
        orderBy: { roundVersion: "desc" }
      });

      const recentClassifications = new Map();
      for (const r of recentRounds) recentClassifications.set(r.id, await screeningClassification(c, r));
      const recentCases = await c.tx.screeningAdjudicationCase.findMany({ where: { projectId: c.project.id, roundId: { in: recentRounds.map(r => r.id) } }, orderBy: { createdAt: "desc" }, select: { roundId: true, status: true } });
      const recentProposals = allMyProposals.map(p => {
        const paper = recentPapers.find(pp => pp.id === p.paperId);
        const round = recentRounds.find(r => r.paperId === p.paperId);
        const s = round ? roundSettings(round.settings) : null;
        const assigns = round ? recentAssignments.filter(a => a.roundId === round.id) : [];
        const completed = assigns.filter(a => a.submittedAt).length;
        const held = assigns.filter(a => !a.submittedAt && effectiveSlot(a)).length;
        const required = s?.requiredReviewers || 2;
        const decision = round?.unblindedAt && ["INCLUDED", "EXCLUDED", "BACKGROUND"].includes(round.status)
          ? recentDecisions.find(d => d.roundId === round.id)?.decision || null : null;

        return {
          paperId: p.paperId,
          title: paper?.title || "Bài báo",
          publicationYear: paper?.publicationYear,
          journalName: paper?.journalName,
          proposedAt: p.createdAt.toISOString(),
          screeningStatus: p.screeningStatus,
          classification: round ? recentClassifications.get(round.id) : null,
          roundStatus: round?.status as ScreeningState | undefined,
          caseStatus: recentCases.find(item => item.roundId === round?.id)?.status,
          finalDecision: decision,
          legacyProgress: s?.reviewMode === "COLLABORATIVE" || Boolean(round?.legacyNeedsAudit) ||
            (!round && meaningfulLegacyScreening({ ...p, status: p.screeningStatus })) ||
            Boolean(decision && (s?.workflowVersion ?? 0) < 6),
          legacyNeedsAudit: round?.legacyNeedsAudit ?? false,
          reviewProgress: { completed, required, held },
        };
      });

      // 5. Eligible queue count and next paper
      const eligibleRounds = await screeningQueue(c);

      const eligibleQueueCount = eligibleRounds.length;
      const nextEligiblePaperId = eligibleRounds[0]?.paperId ?? null;

      // 6. Discovery goal
      const settings = await screeningSettings(c);
      const startOfPeriod = new Date(now);
      if (settings.discoveryGoalPeriod === "MONTH") {
        startOfPeriod.setDate(1);
        startOfPeriod.setHours(0, 0, 0, 0);
      } else {
        const day = startOfPeriod.getDay();
        const diff = startOfPeriod.getDate() - day + (day === 0 ? -6 : 1);
        startOfPeriod.setDate(diff);
        startOfPeriod.setHours(0, 0, 0, 0);
      }

      const currentPeriodCount = await c.tx.projectPaper.count({
        where: {
          projectId: c.project.id,
          addedById: c.actorId,
          createdAt: { gte: startOfPeriod }
        }
      });

      const target = settings.discoveryGoalTarget || 2;
      const discoveryGoal = {
        enabled: settings.discoveryGoalEnabled || false,
        target,
        period: settings.discoveryGoalPeriod || "WEEK",
        paused: settings.discoveryGoalPaused || false,
        currentCount: currentPeriodCount,
        remaining: Math.max(0, target - currentPeriodCount)
      };

      // 7. Capacity advice
      const totalProjectPapers = await c.tx.projectPaper.count({ where: { projectId: c.project.id } });
      let queueStatus: "EMPTY_LIBRARY" | "EMPTY_QUEUE" | "NORMAL" | "HIGH_BACKLOG" = "NORMAL";
      let message = "Tiến độ sàng lọc đang duy trì đều đặn. Tiếp tục đánh giá các bài trong hàng đợi.";
      let suggestedAction: "DISCOVER_MORE" | "REVIEW_QUEUE" | "FOCUS_RQ" | undefined = undefined;

      if (totalProjectPapers === 0) {
        queueStatus = "EMPTY_LIBRARY";
        message = "Dự án chưa có bài báo nào trong thư viện. Hãy bắt đầu bằng cách tìm kiếm và đề xuất tài liệu.";
        suggestedAction = "DISCOVER_MORE";
      } else if (eligibleQueueCount === 0) {
        queueStatus = "EMPTY_QUEUE";
        message = "Hiện không có suất phù hợp để bạn nhận. Kiểm tra Việc của tôi hoặc Thư viện: bài có thể đã được nhận đủ người hay đang chờ giải quyết bất đồng.";
        suggestedAction = "DISCOVER_MORE";
      } else if (eligibleQueueCount > 10) {
        queueStatus = "HIGH_BACKLOG";
        message = "Đang có nhiều bài chờ đánh giá trong hàng đợi. Nhóm nên tập trung hoàn thành các vòng sàng lọc hiện có trước khi đề xuất thêm.";
        suggestedAction = "REVIEW_QUEUE";
      }

      const pendingDiscussions: NonNullable<ScreeningWorkspaceSummary["pendingDiscussions"]> = [];
      const liveReviewerIds = new Set((await screeningPeople(c)).map(p => p.id));
      for (const r of consensusRounds.filter(r => !pendingConsensus.some(p => p.roundId === r.id))) {
        const view = await roundView(c, r);
        const agreement = view.agreement;
        const activeDispute = activeCases.find(row => row.roundId === r.id);
        const departedReviewer = view.assignments.some(a => !liveReviewerIds.has(a.reviewerId));
        if (r.legacyNeedsAudit || activeDispute?.active || view.hiddenReviews || view.resolution || r.finalizerId || agreement && !agreement.canConfirm && !agreement.canDecline && !departedReviewer) continue;
        pendingDiscussions.push({ paperId: r.paperId, roundId: r.id, status: r.status as ScreeningState, classification: view.classification, phase: view.phase, title: (await c.tx.paper.findUnique({ where: { id: r.paperId }, select: { title: true } }))?.title || "Bài báo" });
      }
      const expired = await c.tx.screeningAssignment.findMany({ where: { projectId: c.project.id, reviewerId: c.actorId, submittedAt: null, dueAt: { lte: now } }, select: { roundId: true } });
      const expiredRounds = await c.tx.screeningRound.findMany({ where: { projectId: c.project.id, id: { in: expired.map(a => a.roundId) }, active: true }, select: { id: true, paperId: true } });
      const expiredClaims = await Promise.all(expiredRounds.map(async r => ({ paperId: r.paperId, roundId: r.id, title: (await c.tx.paper.findUnique({ where: { id: r.paperId }, select: { title: true } }))?.title || "Bài báo" })));
      const completedPersonalReviews = await c.tx.screeningAssignment.count({ where: { projectId: c.project.id, reviewerId: c.actorId, submittedAt: { not: null } } });
      // Tracked disputes and completed evaluations for the current reviewer
      const myTrackedDisputes: NonNullable<ScreeningWorkspaceSummary["myTrackedDisputes"]> = [];
      const myCompletedEvaluations: NonNullable<ScreeningWorkspaceSummary["myCompletedEvaluations"]> = [];
      const myEvaluations: NonNullable<ScreeningWorkspaceSummary["myEvaluations"]> = [];

      const myReviewAssignments = await c.tx.screeningAssignment.findMany({
        where: { projectId: c.project.id, reviewerId: c.actorId },
        orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
        select: { id: true, roundId: true, submittedAt: true, active: true }
      });

      if (myReviewAssignments.length > 0) {
        const submittedRoundIds = Array.from(new Set(myReviewAssignments.map(a => a.roundId)));
        const submittedRounds = await c.tx.screeningRound.findMany({
          where: { id: { in: submittedRoundIds }, projectId: c.project.id },
          select: { id: true, paperId: true, phase: true, status: true, active: true, settings: true, number: true }
        });

        const submittedPaperIds = Array.from(new Set(submittedRounds.map(r => r.paperId)));
        const papers = await c.tx.paper.findMany({
          where: { id: { in: submittedPaperIds } },
          select: { id: true, title: true, publicationYear: true, journalName: true }
        });
        const paperMap = new Map(papers.map(p => [p.id, p]));

        const myReviews = await c.tx.screeningReview.findMany({
          where: { projectId: c.project.id, assignmentId: { in: myReviewAssignments.map(a => a.id) } },
          orderBy: { revision: "desc" },
          select: { assignmentId: true, decision: true, submittedAt: true }
        });
        const myReviewMap = new Map<string, (typeof myReviews)[number]>();
        for (const rev of myReviews) {
          if (!myReviewMap.has(rev.assignmentId)) myReviewMap.set(rev.assignmentId, rev);
        }

        const invalidations = await c.tx.screeningAudit.findMany({ where: { projectId: c.project.id, roundId: { in: submittedRoundIds }, type: "DEPENDENCY_INVALIDATED" }, select: { roundId: true } });
        const invalidatedRounds = new Set(invalidations.map(a => a.roundId));
        const finalDecisions = await c.tx.screeningFinalDecision.findMany({
          where: { projectId: c.project.id, roundId: { in: submittedRoundIds } },
          orderBy: { roundVersion: "desc" },
          select: { roundId: true, decision: true, resolverId: true, createdAt: true, resolutionType: true, reason: true, sourceMaterial: true }
        });
        const finalDecisionMap = new Map<string, (typeof finalDecisions)[number]>();
        for (const fd of finalDecisions) {
          if (!finalDecisionMap.has(fd.roundId)) finalDecisionMap.set(fd.roundId, fd);
        }

        const allCases = await c.tx.screeningAdjudicationCase.findMany({
          where: { projectId: c.project.id, roundId: { in: submittedRoundIds } },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            roundId: true,
            status: true,
            deadline: true,
            active: true,
            lockedAt: true,
            packetVersion: true,
          }
        });
        const activeCases = allCases.filter(ac => ac.active);
        const adjudicatedRoundIds = new Set(allCases.filter(ac => ac.status === "COMPLETED").map(ac => ac.roundId));
        const caseIds = activeCases.map(ac => ac.id);
        // Only inspect the caller's submission metadata. Never return sealed text here.
        const ownStatements = caseIds.length ? await c.tx.screeningAdjudicationStatement.findMany({
          where: { caseId: { in: caseIds }, reviewerId: c.actorId },
          select: { caseId: true, packetVersion: true },
        }) : [];
        const invitations = caseIds.length
          ? await c.tx.screeningAdjudicationInvitation.findMany({
              where: { caseId: { in: caseIds }, status: "ASSIGNED" },
              orderBy: { createdAt: "desc" },
              select: { caseId: true, userId: true, role: true, status: true }
            })
          : [];
        const adjudicatorUserIds = invitations.map(inv => inv.userId);
        const adjudicatorUsers = adjudicatorUserIds.length
          ? await c.tx.user.findMany({ where: { id: { in: adjudicatorUserIds } }, select: { id: true, fullName: true } })
          : [];
        const userNameMap = new Map(adjudicatorUsers.map(u => [u.id, u.fullName]));
        const caseAdjudicatorMap = new Map<string, string>();
        for (const inv of invitations) {
          const name = userNameMap.get(inv.userId);
          if (name && !caseAdjudicatorMap.has(inv.caseId)) {
            caseAdjudicatorMap.set(inv.caseId, name);
          }
        }
        const adjudicationCaseMap = new Map<string, { id: string; roundId: string; status: string; deadline: Date; adjudicatorName: string | null; needsMyStatement: boolean }>();
        for (const ac of activeCases) {
          if (!adjudicationCaseMap.has(ac.roundId)) {
            adjudicationCaseMap.set(ac.roundId, {
              ...ac,
              needsMyStatement: !["ARCHIVED", "COMPLETED"].includes(c.project.status) && !ac.lockedAt && ac.deadline > now && ac.status === "COLLECTING" && !ownStatements.some(s => s.caseId === ac.id && s.packetVersion === ac.packetVersion),
              adjudicatorName: caseAdjudicatorMap.get(ac.id) || null
            });
          }
        }

        const resolverIds = Array.from(new Set(finalDecisions.map(fd => fd.resolverId).filter((id): id is string => Boolean(id))));
        const resolvers = resolverIds.length
          ? await c.tx.user.findMany({ where: { id: { in: resolverIds } }, select: { id: true, fullName: true } })
          : [];
        const resolverNameMap = new Map(resolvers.map(u => [u.id, u.fullName]));

        for (const assign of myReviewAssignments) {
          const r = submittedRounds.find(round => round.id === assign.roundId);
          if (!r) continue;
          const paper = paperMap.get(r.paperId);
          const title = paper?.title || "Bài báo";
          const review = myReviewMap.get(assign.id);
          if (!review) continue;
          const myDecision = review.decision as ScreeningChoice;
          const latestFinal = finalDecisionMap.get(r.id);
          const fd = latestFinal?.decision === r.status ? latestFinal : undefined;
          const ac = adjudicationCaseMap.get(r.id);
          const finalDecision = fd?.decision ?? (["INCLUDED", "EXCLUDED", "BACKGROUND"].includes(r.status) ? r.status : null);
          const isAdjudicated = fd?.resolutionType === "ADJUDICATION" || Boolean(fd?.resolverId && adjudicatedRoundIds.has(r.id));
          const classification = r.status === "NEEDS_RESOLUTION" ? await screeningClassification(c, await screeningRound(c, r.id)) : null;
          // Own ballot and team outcome are independent. Never infer a ballot from the final decision.
          if (!myEvaluations.some(item => item.roundId === r.id)) myEvaluations.push({
            invalidated: !r.active && invalidatedRounds.has(r.id), paperId: r.paperId, roundId: r.id, title,
            publicationYear: paper?.publicationYear ?? null, journalName: paper?.journalName ?? null,
            phase: r.phase as ScreeningPhase, myDecision,
            submittedAt: review.submittedAt.toISOString(),
            groupStatus: r.status === "WAITING_FULLTEXT" ? "WAITING_FULLTEXT"
              : finalDecision === "INCLUDED" && r.phase === "TITLE_ABSTRACT" && automaticFullTextStage(roundSettings(r.settings)) ? "ADVANCE_TO_FULLTEXT"
              : finalDecision === "INCLUDE" || finalDecision === "INCLUDED" ? "INCLUDED"
              : finalDecision === "EXCLUDE" || finalDecision === "EXCLUDED" ? "EXCLUDED"
              : finalDecision === "BACKGROUND" ? "BACKGROUND"
              : ac || r.status === "ADJUDICATING" ? "ADJUDICATING"
              : finalDecision === "NEEDS_MORE_INFO" || r.status === "NEEDS_MORE_INFO" ? "NEEDS_MORE_INFO"
              : r.status === "NEEDS_RESOLUTION" ? classification === "NEEDS_CLARIFICATION" || classification === "NEEDS_MORE_INFORMATION" ? "NEEDS_MORE_INFO" : "CONFLICT"
              : r.status === "AWAITING_FINALIZATION" ? "AWAITING_FINALIZATION" : "WAITING_REVIEWER",
            finalDecision, isAdjudicated,
            decidedAt: fd?.createdAt?.toISOString() ?? null,
            resolverName: fd?.resolverId ? resolverNameMap.get(fd.resolverId) ?? null : null,
            roundNumber: r.number,
            acceptedForAnalysis: r.active && r.status === "INCLUDED" && !(r.phase !== "FULL_TEXT" && automaticFullTextStage(roundSettings(r.settings))),
            caseStatus: ac?.status ?? null,
            groupReason: fd?.reason ?? null,
            groupSourceMaterial: fd?.sourceMaterial ?? null,
          });

          if (finalDecision && finalDecision !== "NEEDS_MORE_INFO") {
            myCompletedEvaluations.push({
              paperId: r.paperId,
              roundId: r.id,
              title,
              publicationYear: paper?.publicationYear ?? null,
              journalName: paper?.journalName ?? null,
              phase: r.phase as ScreeningPhase,
              finalDecision: fd?.decision || r.status,
              myDecision,
              decidedAt: fd?.createdAt ? fd.createdAt.toISOString() : null,
              resolverName: fd?.resolverId ? resolverNameMap.get(fd.resolverId) ?? null : null,
              isAdjudicated,
            });
          } else if (r.active && assign.active && (r.status === "ADJUDICATING" || adjudicationCaseMap.has(r.id) || ["NEEDS_RESOLUTION", "NEEDS_MORE_INFO"].includes(r.status))) {
            const ac = adjudicationCaseMap.get(r.id);
            myTrackedDisputes.push({
              paperId: r.paperId,
              roundId: r.id,
              title,
              publicationYear: paper?.publicationYear ?? null,
              journalName: paper?.journalName ?? null,
              phase: r.phase as ScreeningPhase,
              status: r.status as ScreeningState,
              caseStatus: ac?.status,
              needsMyStatement: Boolean(r.active && ac?.needsMyStatement),
              myDecision,
              deadline: ac?.deadline ? ac.deadline.toISOString() : null,
              adjudicatorName: ac?.adjudicatorName ?? null,
            });
          }
        }
      }
      const informationRounds = await c.tx.screeningRound.findMany({ where: { projectId: c.project.id, active: true, status: { in: ["WAITING_FULLTEXT", "NEEDS_MORE_INFO"] } } });
      const pendingInformation: NonNullable<ScreeningWorkspaceSummary["pendingInformation"]> = [];
      for (const r of informationRounds) {
        const view = await roundView(c, r);
        if (!(r.status === "WAITING_FULLTEXT" ? view.canResumeFullText : c.role === "OWNER" && view.resolution)) continue;
        const paper = await c.tx.paper.findUniqueOrThrow({ where: { id: r.paperId }, select: { title: true } });
        pendingInformation.push({ paperId: r.paperId, roundId: r.id, title: paper.title, kind: r.status === "WAITING_FULLTEXT" ? "FULLTEXT" : "INFORMATION", reason: view.resolution?.reason ?? "Bổ sung nguồn toàn văn rồi mở vòng đánh giá độc lập tiếp theo." });
      }
      const acceptedPapers = await acceptedScreeningPapers(c);
      await reconcileScreeningObligations(c);
      const automaticTasks = await screeningObligationDtos(c);
      const workPapers = await screeningWorkPapers(c, [...myActiveClaims, ...pendingConsensus, ...pendingDiscussions, ...pendingAdjudications, ...myEvaluations, ...acceptedPapers, ...pendingInformation].map(item => item.roundId));
      return {
        automaticTasks,
        readOnly: ["ARCHIVED", "COMPLETED"].includes(c.project.status),
        workPapers, pendingInformation,
        pendingDiscussions, expiredClaims, completedPersonalReviews,
        acceptedPapers,
        myTrackedDisputes, myCompletedEvaluations, myEvaluations,
        myActiveClaims,
        pendingConsensus,
        pendingAdjudications,
        myProposalsCount,
        recentProposals,
        eligibleQueueCount,
        nextEligiblePaperId,
        discoveryGoal,
        capacityAdvice: {
          queueStatus,
          message,
          suggestedAction
        }
      };
    });
  },

  async updateDiscoveryGoal(project: string, actor: string, rawInput: z.infer<typeof screeningDiscoveryGoalUpdateSchema>) {
    const input = screeningDiscoveryGoalUpdateSchema.parse(rawInput);
    return screeningCommand(project, actor, "DISCOVERY_GOAL_UPDATED", input, { owner: true }, async c => {
      const updated = await c.tx.screeningSettings.upsert({
        where: { projectId: c.project.id },
        create: {
          projectId: c.project.id,
          discoveryGoalEnabled: input.enabled,
          discoveryGoalTarget: input.target,
          discoveryGoalPeriod: input.period,
          discoveryGoalPaused: input.paused,
        },
        update: {
          discoveryGoalEnabled: input.enabled,
          discoveryGoalTarget: input.target,
          discoveryGoalPeriod: input.period,
          discoveryGoalPaused: input.paused,
          version: { increment: 1 },
        }
      });
      return {
        result: {
          id: c.project.id,
          version: updated.version,
        },
        details: {
          id: c.project.id,
          ...input,
        },
      };
    });
  },
};
