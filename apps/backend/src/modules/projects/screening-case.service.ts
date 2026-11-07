import type { z } from "zod";
import type { ScreeningAdjudicationPacket } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { withWorkspace, jsonSnapshot, expectWorkspaceVersion } from "./workspace-access.js";
import { screeningCommand, screeningRound } from "./screening-context.js";
import { reconcileScreeningObligations, screeningObligationDtos } from "./screening-obligations.js";
import { adjudicationPacket, sharedAdjudicationPacket, screeningAdjudicators, adjudicationSourceUrl } from "./screening-adjudication-context.js";
import { screeningClassification } from "./screening-resolution-context.js";
import { effectiveAssignments } from "./screening-assignments.js";
import { caseAudit, caseNotify, casePacket, caseView, ensureAssignment, assignCandidate, latestCase, rankedCandidates, notifyCaseCoordinators } from "./screening-case-context.js";
import * as s from "./dto/screening.schema.js";

const scope = { mentor: true, mentorScope: "SHARED_RESOURCES" as const };
export const screeningCaseService = {
  async request(project: string, actor: string, roundId: string, raw: z.input<typeof s.screeningRequestAdjudicationSchema>) {
    const input = s.screeningRequestAdjudicationSchema.parse(raw);
    return screeningCommand(project, actor, "ADJUDICATION_REQUESTED", { ...input, roundId }, {}, async c => {
      const round = await screeningRound(c, roundId);
      if (c.project.status === "COMPLETED") throw AppError.conflict("Dự án đã hoàn tất, không thể mở hồ sơ mới");
      const assignments = await effectiveAssignments(c, roundId);
      if (!assignments.some(a => a.reviewerId === c.actorId && a.submittedAt)) throw AppError.forbidden("Chỉ reviewer đã gửi phiếu mới được mở hồ sơ");
      const classification = await screeningClassification(c, round);
      if (!round.active || round.legacyNeedsAudit || !["NEEDS_RESOLUTION", "NEEDS_MORE_INFO", "ADJUDICATING"].includes(round.status) || !classification || classification.startsWith("AGREEMENT") || assignments.length !== 2 || assignments.some(a => !a.submittedAt)) throw AppError.conflict("Vòng không còn bất đồng đủ điều kiện phân xử");
      const prior = await latestCase(c, roundId);
      if (prior?.active) {
        const packetRoundVersion = (prior.packet as unknown as ScreeningAdjudicationPacket).roundVersion;
        if (input.expectedVersion !== round.version && input.expectedVersion !== packetRoundVersion) throw AppError.conflict("Phiếu hoặc hồ sơ đã thay đổi. Tải lại trước khi tham gia yêu cầu");
        // A simultaneous second request joins the same case even though opening it changed round.version.
        const row = prior.requestedByIds.includes(c.actorId) ? prior : await c.tx.screeningAdjudicationCase.update({ where: { id: prior.id }, data: { requestedByIds: { push: c.actorId } } });
        return { roundId, result: { roundId, caseId: row.id, version: round.version }, details: { caseId: row.id, joined: true } };
      }
      expectWorkspaceVersion(round.version, input.expectedVersion);
      if (await c.tx.screeningFinalDecision.findFirst({ where: { roundId, roundVersion: round.version } })) throw AppError.conflict("Đã có kết quả. Mở lại vòng có lý do trước khi yêu cầu mới");
      await c.tx.mentorResourceShare.updateMany({ where: { projectId: c.project.id, sectionKey: `screening:${roundId}`, revokedAt: null }, data: { revokedAt: new Date() } });
      const packet = await casePacket(c, round);
      const settings = round.settings as { statementWindowHours?: number };
      const requestReason = input.reason || input.disputePoint;
      let row = await c.tx.screeningAdjudicationCase.create({ data: { projectId: c.project.id, roundId, packet: jsonSnapshot({ ...packet, ...(requestReason ? { requestReason } : {}) }), reviewerIds: assignments.map(a => a.reviewerId).sort(), requestedByIds: [c.actorId], deadline: new Date(Date.now() + (settings.statementWindowHours ?? 48) * 3600000) } });
      // The opener's optional old disputePoint is not a statement on behalf of either reviewer.
      await c.tx.screeningRound.update({ where: { id: roundId }, data: { finalizerId: null, status: "ADJUDICATING", version: { increment: 1 } } });
      row = await ensureAssignment(c, round, row);
      await caseNotify(c, row, row.reviewerIds, "OPENED", "Hồ sơ đã mở: bổ sung ý kiến riêng hoặc sử dụng phiếu đã ghi");
      const next = await screeningRound(c, roundId);
      return { roundId, result: { roundId, caseId: row.id, version: next.version }, details: { caseId: row.id, status: row.status } };
    });
  },
  async act(project: string, actor: string, roundId: string, raw: z.input<typeof s.screeningCaseActionSchema>) {
    const input = s.screeningCaseActionSchema.parse(raw);
    return screeningCommand(project, actor, `ADJUDICATION_${input.action}`, { ...input, roundId }, scope, async c => {
      const round = await screeningRound(c, roundId);
      let row = await latestCase(c, roundId);
      if (!row || row.id !== input.caseId || !row.active || !round.active) throw AppError.conflict("Hồ sơ đã đóng hoặc đã được thay thế");
      row = await ensureAssignment(c, round, row);
      const view = await caseView(c, round, row);
      if (input.action === "STATEMENT") {
        if (!view.canStatement) throw AppError.forbidden("Chỉ reviewer được bổ sung ý kiến riêng trong thời hạn chung");
        expectWorkspaceVersion(row.packetVersion, input.expectedPacketVersion);
        const own = view.statements.find(s => s.reviewerId === c.actorId)!;
        expectWorkspaceVersion(own.revision, input.expectedStatementRevision);
        await c.tx.screeningAdjudicationStatement.create({ data: { projectId: c.project.id, caseId: row.id, reviewerId: c.actorId, packetVersion: row.packetVersion, revision: own.revision + 1, useExisting: input.useExisting, text: input.useExisting ? "" : input.text } });
        row = await c.tx.screeningAdjudicationCase.update({ where: { id: row.id }, data: { version: { increment: 1 } } });
        row = await ensureAssignment(c, round, row);
      } else {
        expectWorkspaceVersion(row.version, input.expectedCaseVersion);
        const invitation = view.invitation;
        if (input.action === "ACCEPT" || input.action === "DECLINE") {
          throw AppError.conflict("Nhiệm vụ được phân công trực tiếp sau khi khóa hồ sơ, không cần nhận hoặc từ chối lời mời");
        } else if (input.action === "START") {
          if (!view.canStart) throw AppError.forbidden("Chỉ người được phân công được bắt đầu phân xử");
          row = await c.tx.screeningAdjudicationCase.update({ where: { id: row.id }, data: { status: "IN_PROGRESS", version: { increment: 1 } } });
        } else if (input.action === "REASSIGN") {
          if (!view.canReassign || !invitation) throw AppError.forbidden("Cần người điều phối độc lập phân công lại");
          await c.tx.screeningAdjudicationInvitation.update({ where: { id: invitation.id }, data: { status: "REVOKED", respondedAt: new Date(), responseReason: input.reason } });
          row = await c.tx.screeningAdjudicationCase.update({ where: { id: row.id }, data: { status: "WAITING_ASSIGNMENT", version: { increment: 1 } } });
          await c.tx.screeningRound.update({ where: { id: roundId }, data: { finalizerId: null, version: { increment: 1 } } });
          await caseAudit(c, row, "ADJUDICATION_REASSIGNED", { previousUserId: invitation.userId, reason: input.reason });
          await caseNotify(c, row, [invitation.userId, ...row.reviewerIds], "REASSIGNED", "Hồ sơ đang được phân công lại");
          row = await ensureAssignment(c, round, row);
        } else if (input.action === "SELECT" || input.action === "RETRY") {
          if (!row.lockedAt || !view.canCoordinate || invitation) throw AppError.forbidden("Cần người điều phối độc lập chọn trong nhóm ứng viên hợp lệ");
          const candidates = await rankedCandidates(c, round, row);
          if (input.action === "SELECT") {
            const candidate = candidates.find(p => p.id === input.candidateId);
            if (!candidate) throw AppError.conflict("Ứng viên không thuộc mức ưu tiên hiện tại");
            row = await assignCandidate(c, round, row, candidate);
          } else row = await ensureAssignment(c, round, row);
        } else if (input.action === "REPORT_CONFLICT") {
          if (!view.canReport || !invitation || invitation.id !== input.invitationId) throw AppError.forbidden("Chỉ reviewer được báo cáo xung đột của lời mời hiện tại");
          if (await c.tx.screeningAdjudicationConflict.findFirst({ where: { invitationId: invitation.id, reportedById: c.actorId, resolvedAt: null } })) throw AppError.conflict("Báo cáo của bạn đang được xem xét");
          await c.tx.screeningAdjudicationConflict.create({ data: { projectId: c.project.id, caseId: row.id, invitationId: invitation.id, reportedById: c.actorId, reason: input.reason } });
          row = await c.tx.screeningAdjudicationCase.update({ where: { id: row.id }, data: { status: "COI_REVIEW", version: { increment: 1 } } });
          await notifyCaseCoordinators(c, round, row, "COI_REVIEW", "Cần người điều phối độc lập xem xét báo cáo xung đột", [invitation.userId]);
        } else if (input.action === "REVIEW_CONFLICT") {
          if (!view.canCoordinate || !invitation) throw AppError.forbidden("Cần người điều phối độc lập xem xét báo cáo");
          const report = await c.tx.screeningAdjudicationConflict.findFirst({ where: { id: input.reportId, caseId: row.id, invitationId: invitation.id, resolvedAt: null } });
          if (!report) throw AppError.conflict("Báo cáo đã thay đổi");
          await c.tx.screeningAdjudicationConflict.update({ where: { id: report.id }, data: { resolvedById: c.actorId, resolution: input.reason, upheld: input.upheld, resolvedAt: new Date() } });
          if (input.upheld) {
            await c.tx.screeningAdjudicationInvitation.update({ where: { id: invitation.id }, data: { status: "REVOKED", respondedAt: new Date() } });
            await c.tx.screeningAdjudicationConflict.updateMany({ where: { invitationId: invitation.id, resolvedAt: null }, data: { resolvedById: c.actorId, resolution: input.reason, upheld: true, resolvedAt: new Date() } });
            await c.tx.screeningRound.update({ where: { id: roundId }, data: { finalizerId: null, version: { increment: 1 } } });
          }
          const pending = await c.tx.screeningAdjudicationConflict.count({ where: { caseId: row.id, resolvedAt: null } });
          row = await c.tx.screeningAdjudicationCase.update({ where: { id: row.id }, data: { status: input.upheld ? "WAITING_ASSIGNMENT" : pending ? "COI_REVIEW" : "ASSIGNED", version: { increment: 1 } } });
          if (input.upheld) row = await ensureAssignment(c, round, row);
        }
      }
      // Do not put sealed supplement text in generic history endpoints.
      return { roundId, result: { roundId, caseId: row.id, version: row.version }, details: { caseId: row.id, action: input.action, packetVersion: row.packetVersion, ...(input.action === "STATEMENT" ? {} : { input }) } };
    });
  },
  async view(project: string, actor: string, roundId: string, caseId?: string) {
    return withWorkspace(project, actor, scope, async c => {
      let round = await screeningRound(c, roundId);
      let row = caseId ? await c.tx.screeningAdjudicationCase.findFirst({ where: { id: caseId, roundId, projectId: c.project.id } }) : await latestCase(c, roundId);
      if (caseId && !row) throw AppError.notFound("Không tìm thấy hồ sơ trong vòng này");
      if (!row) {
        if (((round.settings as { workflowVersion?: number }).workflowVersion ?? 0) >= 8) throw AppError.notFound("Chưa có hồ sơ phân xử. Reviewer cần mở hồ sơ sau thảo luận");
        const scopedPacket = c.role ? await adjudicationPacket(c, round) : await sharedAdjudicationPacket(c, round);
        const packet = scopedPacket.sourceUrl === undefined ? { ...scopedPacket, sourceUrl: await adjudicationSourceUrl(c, round) } : scopedPacket;
        return { case: null, packet, version: round.version, status: round.status, canResolve: ((round.settings as { workflowVersion?: number }).workflowVersion ?? 0) < 5 && round.active && round.status === "ADJUDICATING" && round.finalizerId === c.actorId && (await screeningAdjudicators(c, round)).some(p => p.id === c.actorId), thread: [], finalDecision: null, resolution: null };
      }
      // Reconcile access on a scoped read so revoked mentors cannot retain an invitation.
      // Only an existing participant/coordinator may trigger the reconciliation.
      await caseView(c, round, row);
      if (row.active) row = await ensureAssignment(c, round, row);
      round = await screeningRound(c, roundId);
      const view = await caseView(c, round, row);
      const snapshot = row.packet as unknown as ScreeningAdjudicationPacket;
      // Older sealed packets predate sourceUrl. Enrich the response after access checks; never rewrite their history.
      const fullPacket = snapshot.sourceUrl === undefined ? { ...snapshot, sourceUrl: await adjudicationSourceUrl(c, round) } : snapshot;
      const invitationOnly = view.invitation?.userId === c.actorId && view.invitation.status === "SENT";
      const packet = invitationOnly ? { ...fullPacket, paper: { ...fullPacket.paper, abstractText: null }, reviews: [], allReviews: [], discussion: [], sources: [], consensusAttempts: [] } : fullPacket;
      const final = ["COMPLETED", "NEEDS_MORE_INFO"].includes(row.status) && row.finalDecisionId ? await c.tx.screeningFinalDecision.findFirst({ where: { id: row.finalDecisionId, projectId: c.project.id, roundId } }) : null;
      const resolver = final?.resolverId ? await c.tx.user.findUnique({ where: { id: final.resolverId }, select: { fullName: true } }) : null;
      const rows = await c.tx.screeningAdjudicationCase.findMany({ where: { projectId: c.project.id, roundId }, orderBy: { createdAt: "desc" } });
      const history = [];
      for (const historical of rows) {
        try {
          await caseView(c, round, historical);
          history.push({ id: historical.id, status: historical.status, createdAt: historical.createdAt });
        } catch (error) { if (!(error instanceof AppError && error.statusCode === 404)) throw error; }
      }
      return { case: view, caseHistory: history.map(h => ({ ...h, createdAt: h.createdAt.toISOString() })), packet, version: round.version, status: round.status, canResolve: view.canResolve, thread: [], resolution: final?.decision === "NEEDS_MORE_INFO" ? { decision: "NEEDS_MORE_INFO", reason: final.reason, resolverName: resolver?.fullName ?? "Người phân xử", resolverRole: view.invitation?.role, sourceMaterial: final.sourceMaterial, createdAt: final.createdAt.toISOString() } : null,
        finalDecision: final && final.decision !== "NEEDS_MORE_INFO" ? { decision: final.decision, reason: final.reason, exclusionReason: final.exclusionReason, sourceMaterial: final.sourceMaterial, resolverName: resolver?.fullName ?? "Người phân xử", resolverRole: view.invitation?.role, createdAt: final.createdAt.toISOString() } : null };
    });
  },
  async tasks(project: string, actor: string) {
    return withWorkspace(project, actor, scope, async c => {
      if (["ARCHIVED", "COMPLETED"].includes(c.project.status)) return [];
      await reconcileScreeningObligations(c);
      const obligations = await screeningObligationDtos(c);
      const invitations = await c.tx.screeningAdjudicationInvitation.findMany({ where: { projectId: c.project.id, userId: c.actorId, status: { in: ["ASSIGNED"] } } });
      const cases = await c.tx.screeningAdjudicationCase.findMany({ where: { projectId: c.project.id, active: true, id: { in: invitations.map(i => i.caseId) } } });
      const tasks = [];
      for (const row of cases) {
        const round = await screeningRound(c, row.roundId);
        if (!round.active) continue;
        try {
          const view = await caseView(c, round, row);
          const obligation = obligations.find(t => t.roundId === round.id && t.actionType === "ADJUDICATION" && !t.endedAt);
          if (obligation) tasks.push({ automaticTaskId: obligation.id, taskStatus: obligation.status, roundId: round.id, paperId: round.paperId, phase: round.phase, title: (row.packet as unknown as ScreeningAdjudicationPacket).paper.title, caseStatus: view.status });
        } catch (error) { if (error instanceof AppError && error.statusCode === 404) continue; throw error; }
      }
      return tasks;
    });
  },
  async source(project: string, actor: string, roundId: string, fileId: string, caseId?: string) {
    return withWorkspace(project, actor, scope, async c => {
      const round = await screeningRound(c, roundId), row = caseId ? await c.tx.screeningAdjudicationCase.findFirst({ where: { id: caseId, roundId, projectId: c.project.id } }) : await latestCase(c, roundId);
      if (!row) throw AppError.notFound("Không tìm thấy hồ sơ");
      const view = await caseView(c, round, row);
      if (view.invitation?.userId === c.actorId && view.invitation.status === "SENT") throw AppError.forbidden("Hồ sơ chưa được phân công");
      const packet = row.packet as unknown as ScreeningAdjudicationPacket;
      const source = packet.sources?.find(f => f.id === fileId);
      if (!source) throw AppError.notFound("Tài liệu không thuộc hồ sơ");
      const file = await c.tx.projectPaperFile.findFirst({ where: { id: fileId, projectId: c.project.id, paperId: round.paperId } });
      if (!file) throw AppError.notFound("Không tìm thấy tài liệu được cấp quyền");
      if (file.sha256 !== source.sha256 || file.byteSize !== source.byteSize) throw AppError.conflict("Tài liệu nguồn đã thay đổi. Cần cập nhật và đọc lại hồ sơ trước khi dùng nguồn này");
      return file.content;
    });
  },
};
