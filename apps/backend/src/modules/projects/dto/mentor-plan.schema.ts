import { z } from "zod";
import { databaseIdSchema } from "../../../common/validation/database-id.js";

const expectedVersion = z.number().int().min(0);
export const mentorPlanCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("add"), expectedVersion, mentorUserId: databaseIdSchema, mentorRole: z.enum(["PRIMARY", "SECONDARY"]) }).strict(),
  z.object({ action: z.literal("remove"), expectedVersion, candidateId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("move"), expectedVersion, candidateId: z.string().uuid(), offset: z.union([z.literal(-1), z.literal(1)]) }).strict(),
  z.object({ action: z.literal("configure"), expectedVersion, parallelInvitations: z.boolean() }).strict(),
  z.object({ action: z.literal("restart"), expectedVersion }).strict(),
]);
