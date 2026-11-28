import { z } from "zod";
import { databaseIdSchema } from "../../../common/validation/database-id.js";

export const mentorWorkspaceQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().trim().max(160).optional(),
  projectId: databaseIdSchema.optional(),
  kind: z.enum(["TASK", "MANUSCRIPT_REVIEW", "PROPOSAL_REVIEW", "MENTOR_QUESTION", "REVIEW"]).optional(),
  status: z.enum(["ACTIONABLE", "OVERDUE", "ALL", "TODO", "IN_PROGRESS", "BLOCKED", "WAITING", "DONE"]).default("ACTIONABLE"),
  sort: z.enum(["priority", "deadline"]).default("priority"),
  projectPage: z.coerce.number().int().min(1).max(10000).default(1),
  projectSearch: z.string().trim().max(160).optional(),
  projectFilter: z.enum(["ALL", "ATTENTION", "NO_PENDING"]).default("ALL"),
  projectSort: z.enum(["attention", "updated", "name"]).default("attention"),
  item: z.string().regex(/^(TASK|REVIEW|QUESTION):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).optional(),
}).strict();
export type MentorWorkspaceQuery = z.infer<typeof mentorWorkspaceQuerySchema>;
