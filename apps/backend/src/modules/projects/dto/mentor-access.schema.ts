import { z } from "zod";
import { mentorPermissions, mentorResourceKinds, mentorResourceCategories, mentorResourceSorts, creditRoles } from "@trend/shared-types";
const uniqueCreditRoles = z.array(z.enum(creditRoles)).max(creditRoles.length).refine(roles => new Set(roles).size === roles.length, "Vai trò đóng góp không được trùng lặp");
export const mentorShareSchema = z.object({ kind: z.enum(mentorResourceKinds), resourceId: z.string().uuid(), sectionKey: z.string().trim().max(64).default(""), title: z.string().trim().min(1).max(240), content: z.string().trim().min(1).max(50000) }).strict().refine(v => v.kind !== "MANUSCRIPT" || Boolean(v.sectionKey), "Chọn phần bản thảo cần chia sẻ");
export const mentorPolicySchema = z.object({ preset: z.enum(["OBSERVER", "ADVISOR", "REVIEWER"]), permissions: z.array(z.enum(mentorPermissions)).max(mentorPermissions.length).refine(v => new Set(v).size === v.length), expiresAt: z.string().datetime().nullable(), shares: z.array(mentorShareSchema).max(30).optional() }).strict();
export const configureMentorAccessSchema = mentorPolicySchema.extend({ expectedVersion: z.number().int().positive(), reason: z.string().trim().min(3).max(1000) }).strict();
export const mentorAccessActionSchema = z.object({ expectedVersion: z.number().int().positive(), reason: z.string().trim().min(3).max(1000).default("Ngừng chia sẻ theo yêu cầu của nhóm"), confirmed: z.literal(true) }).strict();
export const mentorAccessPageSchema = z.object({ activeOnly: z.enum(["true", "false"]).optional(), page: z.coerce.number().int().min(1).max(10000).default(1), q: z.string().trim().max(160).default(""), kind: z.enum(mentorResourceKinds).optional() }).strict();
export const mentorFeedbackPageSchema = mentorAccessPageSchema.extend({ shareId: z.string().uuid().optional() });
export const mentorResourceInboxSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().trim().max(160).default(""),
  projectId: z.string().uuid().optional(),
  paperId: z.string().uuid().optional(),
  category: z.enum(mentorResourceCategories).default("ALL"),
  sort: z.enum(mentorResourceSorts).default("newest"),
}).strict();
export const mentorFeedbackSchema = z.object({ shareId: z.string().uuid().nullable().default(null), replyToId: z.string().uuid().nullable().default(null), kind: z.enum(["MESSAGE", "COMMENT", "SUGGESTION", "REVIEW"]), body: z.string().trim().min(1).max(5000), creditRoles: uniqueCreditRoles.default([]), clientKey: z.string().uuid() }).strict();
export const mentorFeedbackStatusSchema = z.object({ expectedVersion: z.number().int().positive(), status: z.enum(["ACCEPTED", "REJECTED", "RESOLVED"]), response: z.string().trim().min(3).max(2000), resultingRevisionRef: z.string().trim().max(120).nullable().optional() }).strict();
export const mentorAgreementSchema = z.object({ creditRoles: uniqueCreditRoles.refine(roles => roles.length > 0, "Chọn ít nhất một vai trò đóng góp"), acknowledgement: z.string().trim().min(3).max(3000), note: z.string().trim().max(2000).default(""), clientKey: z.string().uuid() }).strict();
export const mentorAgreementResponseSchema = z.object({ status: z.enum(["ACCEPTED", "REJECTED", "WITHDRAWN"]), confirmed: z.literal(true) }).strict();

export const mentorPaperShareSchema = z.object({ kind: z.literal("PAPER"), resourceId: z.string().uuid(), accessMode: z.enum(["VIEW", "COMMENT"]), expectedVersion: z.number().int().positive(), message: z.string().trim().max(2000).optional() }).strict();
export const mentorResourceWriteSchema = z.union([mentorPaperShareSchema, mentorShareSchema.innerType().extend({ expectedVersion: z.number().int().positive() }).refine(v => v.kind !== "MANUSCRIPT" || Boolean(v.sectionKey), "Chọn phần bản thảo")]);
