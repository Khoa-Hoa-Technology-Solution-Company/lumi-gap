import { databaseIdSchema } from "../../../common/validation/database-id.js";
import { z } from "zod";
const text = (max = 2000) => z.string().trim().max(max);
const uniqueIds = z.array(z.string().uuid()).max(50).refine(ids => new Set(ids).size === ids.length, "Không chọn trùng thành viên/bài báo");
export const screeningHistorySchema = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), kind: z.enum(["ALL", "DISCUSSION", "HISTORY"]).default("ALL") }).strict();
export const screeningPageSchema = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), source: databaseIdSchema.optional(), pageSize: z.coerce.number().int().min(1).max(50).default(20), q: text(200).default(""), tag: text(80).optional(), sort: z.enum(["newest", "oldest", "title", "year"]).default("newest"), status: z.enum(["NOT_REVIEWED", "IN_REVIEW", "NEEDS_RESOLUTION", "NEEDS_MORE_INFO", "ADJUDICATING", "AWAITING_FINALIZATION", "INCLUDED", "EXCLUDED", "BACKGROUND"]).optional(), proposerId: z.string().uuid().optional(), reviewerId: z.string().uuid().optional(), filter: z.enum(["ALL", "MINE", "PENDING", "COMPLETED", "OVERDUE", "CONFLICT", "PROPOSED_BY_ME", "QUEUE"]).default("ALL") }).strict();
export const screeningConfigSchema = z.object({ authorizedAdjudicatorIds: uniqueIds.default([]), allowConservativeFullText: z.boolean().default(false), reviewMode: z.enum(["COLLABORATIVE", "SIMPLE", "INDEPENDENT"]).default("INDEPENDENT"), blindReview: z.boolean().default(true), resolutionPolicy: z.enum(["CONSENSUS", "ADJUDICATION"]).default("ADJUDICATION"), expectedVersion: z.number().int().min(0), requiredReviewers: z.number().int().min(1).max(10), consensusPolicy: z.enum(["UNANIMOUS", "STRICT_MAJORITY"]), aiAssisted: z.boolean(), inclusionCriteria: z.array(text(500).min(3)).max(30), exclusionCriteria: z.array(text(500).min(3)).max(30), researchQuestions: z.array(text(1000).min(3)).max(30), stages: z.array(z.enum(["TITLE_ABSTRACT", "FULL_TEXT"])).max(2).refine(values => new Set(values).size === values.length).optional(), discoveryGoalEnabled: z.boolean().optional(), discoveryGoalTarget: z.number().int().min(1).max(50).optional(), discoveryGoalPeriod: z.enum(["WEEK", "MONTH"]).optional(), discoveryGoalPaused: z.boolean().optional(), clientKey: z.string().uuid() }).strict().refine(v => v.reviewMode === "COLLABORATIVE" ? v.requiredReviewers === 1 && !v.blindReview && v.resolutionPolicy === "ADJUDICATION" : v.reviewMode === "SIMPLE" ? v.requiredReviewers === 1 : v.requiredReviewers >= 2, "Simple Review cần một reviewer; Independent Review cần ít nhất hai reviewer");
export const screeningStartSchema = z.object({ paperIds: uniqueIds.refine(ids => ids.length>0), phase: z.enum(["TITLE_ABSTRACT", "FULL_TEXT"]), confirmRescreen: z.boolean().default(false), clientKey: z.string().uuid() }).strict();
export const screeningAssignSchema = z.object({ roundIds: uniqueIds.refine(ids => ids.length>0), mode: z.enum(["MANUAL", "AUTO"]), reviewerIds: uniqueIds.default([]), dueAt: z.string().datetime().nullable().default(null), clientKey: z.string().uuid() }).strict().refine(v => v.mode === "AUTO" || v.reviewerIds.length >= 1, "Chọn người đánh giá");
const assessmentContext = {
  scope: z.enum(["TITLE_ABSTRACT", "FULL_TEXT"]).optional(),
  fullTextReference: text(1000).optional(),
  researchQuestionIds: z.array(z.string().uuid()).max(20).refine(ids => new Set(ids).size === ids.length, "Không chọn trùng câu hỏi nghiên cứu").optional(),
};
export const screeningSubmitSchema = z.object({ ...assessmentContext, assignmentId: z.string().uuid(), expectedRevision: z.number().int().positive(), decision: z.enum(["INCLUDE", "EXCLUDE", "UNSURE"]), exclusionReason: text(500).default(""), comment: text().default(""), confirmed: z.literal(true), clientKey: z.string().uuid() }).strict().refine(v => v.decision !== "EXCLUDE" || v.exclusionReason.length>=3, { path: ["exclusionReason"], message: "Cần ghi lý do loại bài" });
export const screeningActionSchema = z.object({ expectedVersion: z.number().int().positive(), reason: text().min(10), confirmed: z.literal(true), clientKey: z.string().uuid() }).strict();
export const screeningResolveSchema = screeningActionSchema.extend({ decision: z.enum(["INCLUDED", "EXCLUDED", "BACKGROUND", "NEEDS_MORE_INFO"]) }).strict();
export const screeningFinalizerSchema = screeningActionSchema.extend({ finalizerId: z.string().uuid(), acknowledgeProposer: z.boolean().default(false), shareWithMentor: z.boolean().default(false), discussionIds: uniqueIds.refine(ids => ids.length <= 20).default([]) }).strict();
export const screeningAgreementSchema = screeningActionSchema.extend({ decision: z.enum(["INCLUDED", "EXCLUDED", "NEEDS_MORE_INFO"]) }).strict();
export const screeningAgreementConfirmSchema = z.object({ expectedVersion: z.number().int().positive(), proposalId: z.string().uuid(), confirmed: z.literal(true), clientKey: z.string().uuid() }).strict();
export const screeningAgreementDeclineSchema = screeningActionSchema.extend({ proposalId: z.string().uuid() }).strict();
export const screeningBeginSchema = z.object({ confirmRescreen: z.boolean().default(false), clientKey: z.string().uuid() }).strict();
export const screeningProposalSchema = z.object({ reason: text().min(3), expectedUpdatedAt: z.string().datetime(), clientKey: z.string().uuid() }).strict();
export const screeningReopenSchema = screeningActionSchema.extend({ assignmentId: z.string().uuid() }).strict();
export const screeningCommentSchema = z.object({ comment: text().min(3), clientKey: z.string().uuid() }).strict();
export const screeningAiSchema = z.object({ clientKey: z.string().uuid() }).strict();
export const libraryAssessmentSchema = z.object({ ...assessmentContext,
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
