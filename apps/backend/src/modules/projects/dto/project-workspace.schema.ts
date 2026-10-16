import { z } from "zod";
import { databaseIdSchema } from "../../../common/validation/database-id.js";

const text = (max: number) => z.string().trim().max(max);
const lines = z.array(z.string().trim().min(1).max(500)).max(20);
const planQuestionSchema = z.object({ id: z.string().uuid(), text: z.string().trim().min(1).max(1000), sourceGapId: z.string().uuid().optional(), evidenceIds: z.array(z.string().uuid()).max(30).refine(ids => new Set(ids).size === ids.length, "Evidence references must be unique").optional(), sourceGapVersion: z.number().int().positive().optional(), sourceEvidenceRevisionIds: z.array(z.string().uuid()).max(30).optional() }).strict();
export const workspaceParams = z.object({ id: databaseIdSchema, itemId: z.string().uuid().optional() });
export const workspacePageSchema = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(20) });
export const workspaceLinkSchema = z.object({ kind: z.enum(["PAPER", "SCREENING", "EVIDENCE", "GAP", "QUESTION", "MANUSCRIPT", "REVIEW_REQUEST", "PLAN_REVISION", "REPORT"]), id: z.string().uuid() }).strict().nullable();
export const researchStageSchema = z.object({ expectedVersion: z.number().int().positive(), stage: z.enum(["DISCOVERY", "SCREENING", "EXTRACTION", "GAP_VALIDATION", "DESIGN", "WRITING", "REVIEW"]).nullable() }).strict();
export const savePlanSchema = z.object({
  expectedVersion: z.number().int().positive(), approach: z.enum(["EXPLORATORY", "LITERATURE_REVIEW", "EMPIRICAL", "UNDECIDED"]),
  problem: text(5000), objectives: lines, questions: z.array(planQuestionSchema).max(20).refine(items => new Set(items.map(item => item.id)).size === items.length, "Question identifiers must be unique"),
  scope: text(5000), methodology: text(20000), searchStrategy: text(5000), deliverables: lines,
  inclusionCriteria: z.array(z.string().trim().min(1).max(240)).max(20), exclusionCriteria: z.array(z.string().trim().min(1).max(240)).max(20), changeSummary: text(500),
}).strict();
export const planQuerySchema = z.object({ revisionId: z.string().uuid().optional() }).strict();
export const taskFieldsSchema = z.object({ title: z.string().trim().min(1).max(240), description: text(10000), status: z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "DONE"]), blockedReason: text(2000), assigneeId: z.string().uuid().nullable(), milestoneId: z.string().uuid().nullable(), dueAt: z.string().datetime().nullable(), link: workspaceLinkSchema }).strict();
const blocked = (value: { status: string; blockedReason: string }) => value.status !== "BLOCKED" || value.blockedReason.length > 0;
export const createTaskSchema = taskFieldsSchema.extend({ clientKey: z.string().uuid() }).strict().refine(blocked, { path: ["blockedReason"], message: "Explain what is blocking this task" });
export const updateTaskSchema = taskFieldsSchema.extend({ expectedVersion: z.number().int().positive() }).strict().refine(blocked, { path: ["blockedReason"], message: "Explain what is blocking this task" });
export const taskQuerySchema = workspacePageSchema.extend({ q: text(200).default(""), status: z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "DONE"]).optional(), assigneeId: z.string().uuid().optional(), mine: z.enum(["1", "0"]).optional() }).strict();
export const versionSchema = z.object({ expectedVersion: z.number().int().positive() }).strict();
export const milestoneFieldsSchema = z.object({ title: z.string().trim().min(1).max(240), description: text(5000), dueAt: z.string().datetime().nullable(), status: z.enum(["PLANNED", "COMPLETE"]) }).strict();
export const updateMilestoneSchema = milestoneFieldsSchema.extend({ expectedVersion: z.number().int().positive() }).strict();
export const commentSchema = z.object({ body: z.string().trim().min(1).max(10000), clientKey: z.string().uuid(), mentions: z.array(z.string().uuid()).max(20).default([]) }).strict();
export const commentQuerySchema = workspacePageSchema.extend({ targetKind: z.enum(["TASK", "PLAN_REVISION"]), targetId: z.string().uuid() }).strict();
export const addCommentSchema = commentSchema.extend({ targetKind: z.enum(["TASK", "PLAN_REVISION"]), targetId: z.string().uuid() }).strict();
export const discussionSchema = z.object({ title: z.string().trim().min(1).max(240), body: z.string().trim().min(1).max(10000), category: z.enum(["GENERAL", "RESEARCH_QUESTION", "EVIDENCE", "DECISION_NEEDED", "MENTOR_QUESTION"]), link: workspaceLinkSchema, mentorRelationshipId: z.string().uuid().nullable(), clientKey: z.string().uuid(), mentions: z.array(z.string().uuid()).max(20).default([]) }).strict();
export const updateDiscussionSchema = discussionSchema.omit({ clientKey: true }).extend({ expectedVersion: z.number().int().positive() }).strict();
export const discussionQuerySchema = workspacePageSchema.extend({ q: text(200).default(""), status: z.enum(["OPEN", "RESOLVED"]).optional() }).strict();
export const resolveDiscussionSchema = versionSchema.extend({ status: z.enum(["OPEN", "RESOLVED"]), conclusion: text(10000) }).strict().refine(value => value.status !== "RESOLVED" || value.conclusion.length > 0, { path: ["conclusion"], message: "Record a conclusion before resolving" });
export const messageSchema = commentSchema.extend({ replyToId: z.string().uuid().nullable().default(null) }).strict();
export const decisionSchema = z.object({ decision: z.string().trim().min(1).max(500), context: text(10000), alternatives: text(10000), rationale: z.string().trim().min(1).max(10000), link: workspaceLinkSchema, threadId: z.string().uuid().nullable(), clientKey: z.string().uuid().optional() }).strict();
export const updateDecisionSchema = decisionSchema.extend({ expectedVersion: z.number().int().positive() }).strict();
export const sharePlanSchema = z.object({ revisionId: z.string().uuid(), relationshipId: z.string().uuid() }).strict();
export const artifactQuerySchema = z.object({ kind: z.enum(["PAPER", "SCREENING", "EVIDENCE", "GAP", "QUESTION", "MANUSCRIPT", "REVIEW_REQUEST", "PLAN_REVISION", "REPORT"]), q: text(200).default("") }).strict();
