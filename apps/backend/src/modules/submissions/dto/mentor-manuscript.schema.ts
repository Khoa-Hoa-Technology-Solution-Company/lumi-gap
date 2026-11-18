import { z } from "zod";
import { databaseIdSchema } from "../../../common/validation/database-id.js";
export const mentorManuscriptContextSchema = z.object({ projectId: databaseIdSchema, manuscriptId: z.string().uuid().optional(), submissionId: databaseIdSchema.optional() }).strict();
export const mentorManuscriptSendSchema = z.object({
  projectId: databaseIdSchema, mentorId: databaseIdSchema, clientKey: z.string().uuid(),
  source: z.enum(["SNAPSHOT", "PDF"]), manuscriptSnapshotId: z.string().uuid().optional(), compilationId: z.string().uuid().optional(),
  submissionId: databaseIdSchema.optional(), expectedRevisionNumber: z.coerce.number().int().min(1).optional(),
  title: z.string().trim().min(2).max(300).optional(), message: z.string().trim().max(5000).optional(),
  responses: z.array(z.object({ revisionItemId: z.string().uuid(), responseText: z.string().trim().min(1).max(10000) }).strict()).max(100).optional(),
}).strict().superRefine((input, context) => {
  if (input.source === "SNAPSHOT" && (!input.manuscriptSnapshotId || !input.compilationId)) context.addIssue({ code: "custom", message: "Select the compiled PDF of a saved manuscript snapshot." });
  if (input.source === "PDF" && (input.manuscriptSnapshotId || input.compilationId)) context.addIssue({ code: "custom", message: "An uploaded PDF cannot claim a LaTeX snapshot." });
  if (new Set(input.responses?.map(item => item.revisionItemId)).size !== (input.responses?.length ?? 0)) context.addIssue({ code: "custom", message: "Duplicate revision responses are not allowed." });
});
