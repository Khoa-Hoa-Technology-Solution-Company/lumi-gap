import type { z } from "zod";
import type { ScreeningAdjudicationPacket } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { withWorkspace } from "./workspace-access.js";
import { screeningRound } from "./screening-context.js";
import { reconcileScreeningObligations, screeningObligationDtos } from "./screening-obligations.js";
import { adjudicationPacket, sharedAdjudicationPacket, adjudicationSourceUrl } from "./screening-adjudication-context.js";
import { caseView, ensureAssignment, latestCase } from "./screening-case-context.js";
import * as s from "./dto/screening.schema.js";

const scope = { mentor: true, mentorScope: "SHARED_RESOURCES" as const };
export const screeningCaseService = {
  async request(project: string, actor: string, roundId: string, raw: z.input<typeof s.screeningRequestAdjudicationSchema>) {
    s.screeningRequestAdjudicationSchema.parse(raw);
    return withWorkspace(project, actor, { write: true }, async c => {
      await screeningRound(c, roundId);
      throw AppError.conflict("Phân xử đã ngừng sử dụng. Hai reviewer thảo luận và xác nhận kết luận của chính mình");
    });
  },
  async act(project: string, actor: string, roundId: string, raw: z.input<typeof s.screeningCaseActionSchema>) {
    s.screeningCaseActionSchema.parse(raw);
    return withWorkspace(project, actor, scope, async c => {
      await screeningRound(c, roundId);
      throw AppError.conflict("Hồ sơ phân xử cũ chỉ được xem lại, không nhận thao tác mới");
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
        return { case: null, packet, version: round.version, status: round.status, canResolve: false, thread: [], finalDecision: null, resolution: null };
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
