import type { z } from "zod";
import { AppError } from "../../common/exceptions/app-error.js";
import { expectWorkspaceVersion, jsonSnapshot } from "./workspace-access.js";
import { researchPaper } from "./project-evidence.service.js";
import { projectScreeningStatus, recomputeScreening, roundSettings, screeningCommand, screeningSettings, screeningRound } from "./screening-context.js";
import { libraryAssessmentSchema, screeningActionSchema } from "./dto/screening.schema.js";
import { assessmentContext, meaningfulLegacyScreening } from "./screening-review-context.js";

export const libraryAssessmentService = {
  async assess(project: string, actor: string, paperId: string, raw: z.infer<typeof libraryAssessmentSchema>) {
    const input = libraryAssessmentSchema.parse(raw);
    return screeningCommand(project, actor, "ASSESSMENT_REVISED", { ...input, paperId }, {}, async c => {
      const link = await researchPaper(c, paperId);
      let row = await c.tx.screeningRound.findFirst({ where: { projectId: c.project.id, paperId, active: true } });
      if (row && row.id !== input.roundId) throw AppError.conflict("Vòng đánh giá đã thay đổi, tải lại trước khi gửi");
      if (!row) {
        if (input.roundId || input.expectedRevision !== 0) throw AppError.conflict("Vòng đánh giá không còn hiện hành");
        const settings = await screeningSettings(c); expectWorkspaceVersion(settings.version, input.settingsVersion);
        if (settings.reviewMode !== "COLLABORATIVE") throw AppError.conflict("Dự án yêu cầu phân công theo quy trình review đã cấu hình");
        if (meaningfulLegacyScreening({ ...link, status: link.screeningStatus })) await c.tx.screeningLegacyRecord.upsert({ where: { projectId_paperId: { projectId: c.project.id, paperId } }, create: { projectId: c.project.id, paperId, snapshot: jsonSnapshot({ provenance: "PRE_PROTOCOL_STATUS", status: link.screeningStatus, screenedById: link.screenedById, screenedAt: link.screenedAt, inclusionReason: link.inclusionReason, exclusionReason: link.exclusionReason, exclusionNote: link.exclusionNote }) }, update: {} });
        const previous = await c.tx.screeningRound.findFirst({ where: { projectId: c.project.id, paperId }, orderBy: { number: "desc" } });
        row = await c.tx.screeningRound.create({ data: { projectId: c.project.id, paperId, phase: "TITLE_ABSTRACT", number: (previous?.number ?? 0) + 1, settings: jsonSnapshot(settings), unblindedAt: new Date(), createdById: c.actorId } });
      }
      if (roundSettings(row.settings).reviewMode !== "COLLABORATIVE") throw AppError.conflict("Phiếu độc lập phải tuân theo phân công và quy tắc mở lại");
      if (["INCLUDED", "EXCLUDED", "BACKGROUND"].includes(row.status)) throw AppError.conflict("Bài đã có quyết định. Người phụ trách cần mở lại để xem xét thêm");
      const own = await c.tx.screeningAssignment.findUnique({ where: { roundId_reviewerId: { roundId: row.id, reviewerId: c.actorId } } });
      expectWorkspaceVersion(own?.revision ?? 0, input.expectedRevision);
      const revision = own ? own.revision + (own.submittedAt ? 1 : 0) : 1;
      const assignment = await c.tx.screeningAssignment.upsert({ where: { roundId_reviewerId: { roundId: row.id, reviewerId: c.actorId } }, create: { projectId: c.project.id, roundId: row.id, reviewerId: c.actorId, revision }, update: { active: true, revision } });
      const context = await assessmentContext(c, input, "TITLE_ABSTRACT", true);
      const review = await c.tx.screeningReview.create({ data: { ...context, projectId: c.project.id, assignmentId: assignment.id, revision, decision: input.decision, exclusionReason: input.decision === "EXCLUDE" ? input.exclusionReason : "", comment: input.comment } });
      await c.tx.screeningAssignment.update({ where: { id: assignment.id }, data: { submittedAt: review.submittedAt } });
      const next = await recomputeScreening(c, row);
      return { roundId: row.id, result: { roundId: row.id, version: next.version, revision }, details: { reviewId: review.id, revision, previousRevision: own?.revision ?? null, reviewerId: c.actorId } };
    });
  },
  async defer(project: string, actor: string, roundId: string, raw: z.infer<typeof screeningActionSchema>) {
    const input = screeningActionSchema.parse(raw);
    return screeningCommand(project, actor, "SELECTION_DEFERRED", { ...input, roundId }, {}, async c => {
      const row = await screeningRound(c, roundId);
      if (c.actorId !== (row.finalizerId ?? c.project.ownerId) && c.role !== "OWNER") throw AppError.forbidden("Chỉ người phụ trách hoặc chủ dự án được mở lại quyết định");
      expectWorkspaceVersion(row.version, input.expectedVersion);
      if (!row.active || roundSettings(row.settings).reviewMode !== "COLLABORATIVE") throw AppError.conflict("Review độc lập cần mở lại theo quy trình đã lưu");
      const next = await c.tx.screeningRound.update({ where: { id: roundId }, data: { status: "NEEDS_RESOLUTION", version: { increment: 1 } } });
      await projectScreeningStatus(c, row, "NEEDS_RESOLUTION");
      return { roundId, result: { roundId, version: next.version }, details: { reason: input.reason, previousStatus: row.status, version: next.version } };
    });
  },
};
