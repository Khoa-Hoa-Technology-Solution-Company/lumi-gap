import { z } from "zod";
import { objectIdSchema, paginationSchema } from "../../../common/validation/database-id.js";

export const communityCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  rules: z.array(z.string().trim().min(1).max(300)).max(30).optional(),
  researchTopics: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
  researchField: z.string().trim().min(2).max(160).optional(),
  icon: z.string().trim().min(1).max(40).regex(/^[a-z0-9-]+$/i).optional(),
}).strict();

/** Content edits by the owner or an admin. Status is changed through `communityStatusSchema`. */
export const communityUpdateSchema = communityCreateSchema.partial().refine((value) => Object.keys(value).length > 0);

/** Admin-only archive / restore. */
export const communityStatusSchema = z.object({ status: z.enum(["ACTIVE", "ARCHIVED"]) }).strict();

export const transferOwnershipSchema = z.object({ userId: objectIdSchema }).strict();

export const communitySortSchema = z.enum(["recent", "newest", "members", "discussions", "name"]);

export const listQuerySchema = paginationSchema.extend({
  status: z.enum(["ACTIVE", "ARCHIVED", "PENDING_APPROVAL", "REJECTED"]).optional(),
  q: z.string().trim().min(1).max(120).optional(),
  field: z.string().trim().min(1).max(160).optional(),
  sort: communitySortSchema.default("recent"),
  scope: z.enum(["all", "mine"]).default("all"),
  /** Used by the forum composer: list only ACTIVE communities, even for admins. */
  activeOnly: z.enum(["true", "false"]).optional(),
});

export const reviewSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: z.string().trim().min(1).max(2000).optional(),
}).strict().refine((value) => value.decision === "approve" || Boolean(value.note), { message: "A note is required when rejecting a community", path: ["note"] });

export const idParamsSchema = z.object({ id: objectIdSchema });
export const lookupParamsSchema = z.object({ idOrSlug: z.string().trim().min(1).max(120) });
export const memberParamsSchema = z.object({ id: objectIdSchema, userId: objectIdSchema });

export const updateMemberSchema = z.object({
  role: z.enum(["moderator", "member"]).optional(),
  status: z.enum(["pending", "active", "declined", "banned"]).optional(),
}).refine((value) => value.role !== undefined || value.status !== undefined);

export type CommunityListQuery = z.infer<typeof listQuerySchema>;
