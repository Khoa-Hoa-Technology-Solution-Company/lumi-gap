import { databaseIdSchema } from "../../../common/validation/database-id.js";
import { z } from "zod";
const text = (max = 2000) => z.string().trim().max(max);
const uniqueIds = z.array(z.string().uuid()).max(50).refine(ids => new Set(ids).size === ids.length, "Không chọn trùng thành viên/bài báo");
export const screeningHistorySchema = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), kind: z.enum(["ALL", "DISCUSSION", "HISTORY"]).default("ALL") }).strict();
export const screeningPageSchema = z.object({ slots: z.enum(["ALL", "UNCLAIMED", "LAST_SLOT"]).default("ALL"), page: z.coerce.number().int().min(1).max(10000).default(1), source: databaseIdSchema.optional(), pageSize: z.coerce.number().int().min(1).max(50).default(20), q: text(200).default(""), tag: text(80).optional(), sort: z.enum(["newest", "oldest", "title", "year"]).default("newest"), status: z.enum(["CONSENSUS_REQUIRED", "CONSENSUS_IN_PROGRESS","CONFLICT", "NEEDS_CLARIFICATION", "NEEDS_MORE_INFORMATION", "EXCLUSION_REASON_MISMATCH", "RESOLVED", "WAITING_FULLTEXT", "NOT_REVIEWED", "IN_REVIEW", "NEEDS_RESOLUTION", "NEEDS_MORE_INFO", "ADJUDICATING", "AWAITING_FINALIZATION", "INCLUDED", "EXCLUDED", "BACKGROUND"]).optional(), proposerId: z.string().uuid().optional(), reviewerId: z.string().uuid().optional(), filter: z.enum(["ALL", "MINE", "PENDING", "COMPLETED", "OVERDUE", "CONFLICT", "PROPOSED_BY_ME", "QUEUE"]).default("ALL") }).strict();
export const screeningConfigSchema = z.object({ consensusWindowHours: z.number().int().min(1).max(336).default(48), screeningMode: z.enum(["SINGLE_STAGE", "TWO_STAGE"]).optional(), preferredAdjudicatorId: z.string().uuid().nullable().default(null), adjudicationCoordinatorIds: uniqueIds.default([]), statementWindowHours: z.number().int().min(1).max(336).default(48), adjudicationReminderHours: z.number().int().min(24).max(2160).default(72), adjudicationReassignHours: z.number().int().min(48).max(4320).default(168), authorizedAdjudicatorIds: uniqueIds.default([]), allowConservativeFullText: z.boolean().default(false), reviewMode: z.enum(["COLLABORATIVE", "SIMPLE", "INDEPENDENT"]).default("INDEPENDENT"), blindReview: z.boolean().default(true), resolutionPolicy: z.enum(["CONSENSUS", "ADJUDICATION"]).default("ADJUDICATION"), expectedVersion: z.number().int().min(0), requiredReviewers: z.number().int().min(1).max(10), consensusPolicy: z.enum(["UNANIMOUS", "STRICT_MAJORITY"]), aiAssisted: z.boolean(), inclusionCriteria: z.array(text(500).min(3)).max(30), exclusionCriteria: z.array(text(500).min(3)).max(30), researchQuestions: z.array(text(1000).min(3)).max(30), stages: z.array(z.enum(["TITLE_ABSTRACT", "FULL_TEXT"])).max(2).refine(values => new Set(values).size === values.length && (values.length < 2 || values[0] === "TITLE_ABSTRACT")).optional(), discoveryGoalEnabled: z.boolean().optional(), discoveryGoalTarget: z.number().int().min(1).max(50).optional(), discoveryGoalPeriod: z.enum(["WEEK", "MONTH"]).optional(), discoveryGoalPaused: z.boolean().optional(), clientKey: z.string().uuid() }).strict().refine(v => !v.screeningMode || v.reviewMode === "INDEPENDENT" && v.requiredReviewers === 2, "Quy trình theo giai đoạn yêu cầu đúng hai reviewer độc lập").refine(v => v.reviewMode === "COLLABORATIVE" ? v.requiredReviewers === 1 && !v.blindReview && v.resolutionPolicy === "ADJUDICATION" : v.reviewMode === "SIMPLE" ? v.requiredReviewers === 1 : v.requiredReviewers === 2, "Simple Review cần một reviewer; Independent Review cần ít nhất hai reviewer");
export const screeningStartSchema = z.object({ paperIds: uniqueIds.refine(ids => ids.length > 0), phase: z.enum(["TITLE_ABSTRACT", "FULL_TEXT"]), confirmRescreen: z.boolean().default(false), clientKey: z.string().uuid() }).strict();
export const screeningAssignSchema = z.object({ roundIds: uniqueIds.refine(ids => ids.length > 0), mode: z.enum(["MANUAL", "AUTO"]), reviewerIds: uniqueIds.default([]), dueAt: z.string().datetime().nullable().default(null), clientKey: z.string().uuid() }).strict().refine(v => v.mode === "AUTO" || v.reviewerIds.length >= 1, "Chọn người đánh giá");
const assessmentContext = {
  scope: z.enum(["TITLE_ABSTRACT", "FULL_TEXT"]).optional(),
  fullTextReference: text(1000).optional(),
  researchQuestionIds: z.array(z.string().uuid()).max(20).refine(ids => new Set(ids).size === ids.length, "Không chọn trùng câu hỏi nghiên cứu").optional(),
};
export const screeningSubmitSchema = z.object({ ...assessmentContext, assignmentId: z.string().uuid(), expectedRevision: z.number().int().positive(), decision: z.enum(["INCLUDE", "EXCLUDE", "UNSURE"]), exclusionReason: text(500).default(""), comment: text().default(""), confirmed: z.literal(true), clientKey: z.string().uuid() }).strict().superRefine((v, ctx) => {
  const field = v.decision === "EXCLUDE" ? "exclusionReason" : "comment";
  if (v[field].length < 3) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: "Cần ghi lý do hoặc căn cứ đánh giá (ít nhất 3 ký tự)" });
});
export const screeningActionSchema = z.object({ expectedVersion: z.number().int().positive(), reason: text().min(10), confirmed: z.literal(true), clientKey: z.string().uuid() }).strict();
export const screeningResolveSchema = screeningActionSchema.extend({ expectedCaseVersion: z.number().int().positive().optional(), exclusionReason: text(500).optional(), sourceMaterial: text(2000).optional(), retrieveFullText: z.boolean().default(false), decision: z.enum(["INCLUDED", "EXCLUDED", "BACKGROUND", "NEEDS_MORE_INFO"]) }).strict();
export const screeningFinalizerSchema = screeningActionSchema.extend({ finalizerId: z.string().uuid(), acknowledgeProposer: z.boolean().default(false), shareWithMentor: z.boolean().default(false), discussionIds: uniqueIds.refine(ids => ids.length <= 20).default([]) }).strict();
export const screeningAgreementSchema = screeningActionSchema.extend({ sourceMaterial: text(2000).optional(), exclusionReason: text(500).optional(), retrieveFullText: z.boolean().default(false), decision: z.enum(["INCLUDED", "EXCLUDED", "NEEDS_MORE_INFO"]) }).strict();
export const screeningAgreementConfirmSchema = z.object({ expectedVersion: z.number().int().positive(), proposalId: z.string().uuid(), confirmed: z.literal(true), clientKey: z.string().uuid() }).strict();
export const screeningAgreementDeclineSchema = screeningActionSchema.extend({ proposalId: z.string().uuid() }).strict();
export const screeningBeginSchema = z.object({ confirmRescreen: z.boolean().default(false), clientKey: z.string().uuid() }).strict();
export const screeningProposalSchema = z.object({ reason: text().min(3), expectedUpdatedAt: z.string().datetime(), clientKey: z.string().uuid() }).strict();
export const screeningReopenSchema = screeningActionSchema.extend({ assignmentId: z.string().uuid() }).strict();
export const screeningCommentSchema = z.object({ comment: text().min(3), shareWithAdjudicator: z.boolean().default(false), clientKey: z.string().uuid() }).strict();
export const screeningAiSchema = z.object({ clientKey: z.string().uuid() }).strict();
export const libraryAssessmentSchema = z.object({
  ...assessmentContext,
  roundId: z.string().uuid().nullable(), expectedRevision: z.number().int().min(0),
  settingsVersion: z.number().int().min(0), decision: z.enum(["INCLUDE", "EXCLUDE", "UNSURE"]),
  exclusionReason: text(500).default(""), comment: text().default(""), clientKey: z.string().uuid(),
}).strict();
export const analysisSetSchema = z.object({ mode: z.enum(["DRAFT", "OFFICIAL"]), paperIds: uniqueIds.refine(ids => ids.length >= 2 && ids.length <= 10), topic: text(200).min(3), clientKey: z.string().uuid() }).strict();

export const screeningClaimSchema = z.object({ clientKey: z.string().uuid() }).strict();
export const screeningReleaseSchema = z.object({ clientKey: z.string().uuid() }).strict();
export const screeningExtendSchema = z.object({ clientKey: z.string().uuid() }).strict();
export const screeningDiscoveryGoalUpdateSchema = z.object({
  enabled: z.boolean(),
  target: z.number().int().min(1).max(50).default(2),
  period: z.enum(["WEEK", "MONTH"]).default("WEEK"),
  paused: z.boolean().default(false),
  clientKey: z.string().uuid()
}).strict();

export const screeningProposerExceptionSchema = z.object({
  reason: z.string().trim().min(5, "Lý do cấp ngoại lệ tối thiểu 5 ký tự"),
  clientKey: z.string().uuid(),
}).strict();

export const screeningReassessSchema = z.object({
  ...assessmentContext,
  expectedRevision: z.number().int().positive().optional(),
  decision: z.enum(["INCLUDE", "EXCLUDE", "UNSURE"]),
  reason: text().min(5, "Cần ghi lý do xem xét lại đánh giá (tối thiểu 5 ký tự)"),
  exclusionReason: text(500).default(""),
  comment: text().default(""),
  confirmed: z.literal(true).optional().default(true),
  clientKey: z.string().uuid(),
}).strict().refine(v => v.decision !== "EXCLUDE" || v.exclusionReason.length >= 3, { path: ["exclusionReason"], message: "Cần chọn hoặc ghi lý do loại bài" });

export const screeningRequestAdjudicationSchema = z.object({
  expectedVersion: z.number().int().positive(),
  disputePoint: text(2000).optional(), reason: text().min(5).optional(),
  confirmed: z.literal(true).default(true), clientKey: z.string().uuid(),
}).strict();
const caseBase = { caseId: z.string().uuid(), clientKey: z.string().uuid() };
const caseVersion = { ...caseBase, expectedCaseVersion: z.number().int().positive() };
export const screeningCaseActionSchema = z.discriminatedUnion("action", [
  z.object({ ...caseVersion, action: z.literal("ACCEPT"), invitationId: z.string().uuid(), reason: text().min(3).max(2000).default("Đã nhận nhiệm vụ phân xử") }).strict(),
  z.object({ ...caseVersion, action: z.literal("DECLINE"), invitationId: z.string().uuid(), reason: text().min(3).max(2000).default("Đã từ chối nhận phân xử") }).strict(),
  z.object({ ...caseVersion, action: z.literal("SELECT"), candidateId: z.string().uuid(), reason: text().min(10) }).strict(),
  z.object({ ...caseVersion, action: z.literal("RETRY") }).strict(),
  z.object({ ...caseVersion, action: z.literal("START") }).strict(),
  z.object({ ...caseVersion, action: z.literal("REASSIGN"), reason: text().min(10) }).strict(),
  z.object({ ...caseBase, action: z.literal("STATEMENT"), expectedPacketVersion: z.number().int().positive(), expectedStatementRevision: z.number().int().min(0), useExisting: z.boolean(), text: text().default("") }).strict(),
  z.object({ ...caseVersion, action: z.literal("REPORT_CONFLICT"), invitationId: z.string().uuid(), reason: text().min(10) }).strict(),
  z.object({ ...caseVersion, action: z.literal("REVIEW_CONFLICT"), reportId: z.string().uuid(), upheld: z.boolean(), reason: text().min(10) }).strict(),
]).refine(v => v.action !== "STATEMENT" || v.useExisting || v.text.length >= 10, "Bổ sung ít nhất 10 ký tự hoặc sử dụng ý kiến đã ghi");

export const screeningConsensusConfirmSchema = z.object({ decision: z.enum(["INCLUDE", "EXCLUDE"]), reason: text().min(3), confirmed: z.literal(true), clientKey: z.string().uuid() }).strict();
