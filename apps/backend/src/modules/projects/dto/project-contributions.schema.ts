import { z } from "zod";
import { contributionCategories, creditRoles } from "@trend/shared-types";
import { workspaceLinkSchema } from "./project-workspace.schema.js";

const unique = (ids: string[]) => new Set(ids).size === ids.length;
export const contributionsPageSchema = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20), q: z.string().trim().max(200).default(""), filter: z.enum(["TEAM", "MINE", "PENDING", "DISPUTED"]).default("TEAM") }).strict();
export const contributionFieldsSchema = z.object({
  title: z.string().trim().min(3).max(240), description: z.string().trim().min(20).max(5000),
  category: z.enum(contributionCategories).optional(),
  source: z.enum(["MANUAL", "WORKSPACE"]), workDate: z.string().datetime({ offset: true }),
  participants: z.array(z.object({ userId: z.string().uuid(), roles: z.array(z.enum(creditRoles)).max(14).refine(unique, "Duplicate roles") }).strict()).min(1).max(100).refine(p => unique(p.map(v => v.userId)), "Duplicate participants"),
  evidence: z.string().trim().max(5000), evidenceRefs: z.array(z.union([workspaceLinkSchema.unwrap(), z.object({ kind: z.literal("TASK"), id: z.string().uuid() }).strict()])).max(20),
}).strict();
export const createWorkContributionSchema = contributionFieldsSchema.extend({ clientKey: z.string().uuid() }).strict();
export const editWorkContributionSchema = contributionFieldsSchema.extend({ expectedVersion: z.number().int().positive(), correctionReason: z.string().trim().min(10).max(1000) }).strict();
export const contributionVersionSchema = z.object({ expectedVersion: z.number().int().positive() }).strict();
export const contributionReviewSchema = z.object({ expectedVersion: z.number().int().positive(), decision: z.enum(["ACKNOWLEDGE", "ACCEPT", "NEEDS_CHANGES", "DISPUTE"]), note: z.string().trim().max(2000).default("") }).strict().refine(v => !["NEEDS_CHANGES", "DISPUTE"].includes(v.decision) || v.note.length >= 10, "Explain the requested change");
export const allocationPeriodSchema = z.object({ title: z.string().trim().min(3).max(240), description: z.string().trim().min(10).max(2000), scope: z.string().trim().min(10).max(500), periodStart: z.string().datetime({ offset: true }), periodEnd: z.string().datetime({ offset: true }), clientKey: z.string().uuid() }).strict().refine(v => new Date(v.periodEnd) >= new Date(v.periodStart), "Invalid date range");
const shares = z.array(z.object({ userId: z.string().uuid(), basisPoints: z.number().int().min(0).max(10000), rationale: z.string().trim().max(1000) }).strict()).min(1).max(100).refine(v => unique(v.map(p => p.userId)), "Duplicate participants");
const matrixShareSchema = z.object({
  userId: z.string().uuid(),
  basisPoints: z.number().int().min(0).max(10000),
  rationale: z.string().trim().max(1000).optional(),
}).strict();
const matrixCategorySchema = z.object({
  category: z.enum(contributionCategories),
  weightBasisPoints: z.number().int().min(0).max(10000),
  zeroWeightReason: z.string().trim().max(1000).optional(),
  evidenceIds: z.array(z.string().uuid()).max(100).optional(),
  shares: z.array(matrixShareSchema).min(1).max(100).refine(v => unique(v.map(p => p.userId)), "Duplicate participants"),
}).strict();
const matrixSchema = z.object({
  categories: z.array(matrixCategorySchema).length(4).refine(v => unique(v.map(c => c.category)), "Duplicate categories"),
}).strict();
export const allocationDraftSchema = z.object({
  shares: shares.optional(),
  matrix: matrixSchema.nullable().optional(),
  rationale: z.string().trim().max(5000),
  clientKey: z.string().uuid(),
  evaluationSnapshotId: z.string().uuid().nullable().optional(),
}).strict().refine(v => Boolean(v.matrix || (v.shares && v.shares.length > 0)), "Provide allocation matrix or shares");
export const allocationEditSchema = z.object({
  shares: shares.optional(),
  matrix: matrixSchema.nullable().optional(),
  rationale: z.string().trim().max(5000),
  expectedVersion: z.number().int().positive(),
  evaluationSnapshotId: z.string().uuid().nullable().optional(),
}).strict().refine(v => Boolean(v.matrix || (v.shares && v.shares.length > 0)), "Provide allocation matrix or shares");
export const allocationDecisionSchema = z.object({ decision: z.enum(["APPROVE", "DISPUTE"]), explanation: z.string().trim().max(2000).default("") }).strict().refine(v => v.decision !== "DISPUTE" || v.explanation.length >= 10, "Explain the objection");
export const allocationChallengeSchema = z.object({ explanation: z.string().trim().min(10).max(2000), revisionId: z.string().uuid() }).strict();
export const activitySchema = z.object({
  from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }),
  timeZone: z.string().max(80).default("Asia/Ho_Chi_Minh").refine(v => { try { new Intl.DateTimeFormat("en", { timeZone: v }); return true; } catch { return false; } }, "Invalid timezone"),
  memberId: z.string().uuid().optional(), category: z.enum(["PLAN", "LITERATURE", "SCREENING", "EVIDENCE", "GAP", "TASK", "DECISION", "MANUSCRIPT"]).optional(),
  eventDay: z.string().date().optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20),
}).strict().refine(v => new Date(v.to).getTime() >= new Date(v.from).getTime() && new Date(v.to).getTime() - new Date(v.from).getTime() <= 366 * 86400000, "Select at most one year");
