import { z } from "zod";
import { MANUSCRIPT_TYPES, MANUSCRIPT_TEMPLATES } from "@trend/shared-types";
import { databaseIdSchema } from "../../../common/validation/database-id.js";
export const manuscriptParams = z.object({ projectId: databaseIdSchema, id: z.string().uuid().optional(), fileId: z.string().uuid().optional(), snapshotId: z.string().uuid().optional(), compilationId: z.string().uuid().optional() });
export const compileSchema = z.object({ engine: z.enum(["pdflatex", "xelatex", "lualatex"]).optional(), texLiveVersion: z.enum(["2022", "2025"]).optional() }).strict();
export const compilerSettingsSchema = z.object({ engine: z.enum(["pdflatex", "xelatex", "lualatex"]), texLiveVersion: z.enum(["2022", "2025"]), expectedRevision: z.number().int().positive() }).strict();
export const importManuscriptSchema = z.object({ title: z.string().trim().min(2).max(160), mainFile: z.string().max(240).default(""), clientKey: z.string().uuid() }).strict();
export const createManuscriptSchema = z.object({ title: z.string().trim().min(2).max(160), description: z.string().trim().max(2000).default(""), documentType: z.enum(MANUSCRIPT_TYPES), template: z.enum(MANUSCRIPT_TEMPLATES), clientKey: z.string().uuid(), researchLink: z.object({ kind: z.enum(["QUESTION", "GAP"]), id: z.string().uuid() }).nullable().optional() }).strict();
export const createFileSchema = z.object({ path: z.string().min(1).max(240), kind: z.enum(["TEXT", "FOLDER"]), content: z.string().max(500000).default(""), clientKey: z.string().uuid() }).strict();
export const changeFileSchema = z.object({ expectedVersion: z.number().int().positive(), path: z.string().min(1).max(240).optional(), delete: z.literal(true).optional(), main: z.literal(true).optional() }).strict().refine(value => [value.path, value.delete, value.main].filter(v => v !== undefined).length === 1, "Choose exactly one file operation");
export const snapshotSchema = z.object({ label: z.string().trim().min(1).max(160), clientKey: z.string().uuid(), minimumSequences: z.record(z.string().uuid(), z.number().int().nonnegative()).refine(value => Object.keys(value).length <= 200).default({}), reuseUnchanged: z.boolean().optional() }).strict();
const relativePosition = z.object({ type: z.object({ client: z.number().int().nonnegative(), clock: z.number().int().nonnegative() }).nullable().optional(), tname: z.literal("source").nullable().optional(), item: z.object({ client: z.number().int().nonnegative(), clock: z.number().int().nonnegative() }).nullable().optional(), assoc: z.number().int().optional() }).strict();
export const commentSchema = z.object({ body: z.string().trim().min(1).max(5000), clientKey: z.string().uuid(), fileId: z.string().uuid().optional(), snapshotId: z.string().uuid().optional(), mentorRelationshipId: z.string().uuid().optional(), quote: z.string().max(1000).optional(), start: relativePosition.optional(), end: relativePosition.optional() }).strict();
export const snapshotQuery = z.object({ snapshotId: z.string().uuid().optional() });
export const restoreSchema = z.object({ title: z.string().trim().min(2).max(160), clientKey: z.string().uuid() }).strict();
export const suggestionSchema = z.object({ fileId: z.string().uuid(), sourceSequence: z.number().int().nonnegative(), from: z.number().int().nonnegative().max(500000), to: z.number().int().nonnegative().max(500000), original: z.string().max(100000), replacement: z.string().max(100000), note: z.string().trim().max(2000).default(""), clientKey: z.string().uuid() }).strict().refine(value => value.to >= value.from && value.original !== value.replacement, "Choose a changed source range");
export const collaborationFrame = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello"), ticket: z.string().max(4000), clientId: z.number().int().min(1).max(4294967295) }).strict(),
  z.object({ type: z.literal("update"), clientSessionId: z.string().uuid(), clientSequence: z.number().int().positive().max(2147483647), update: z.string().min(1).max(2800000).regex(/^[A-Za-z0-9+/]*={0,2}$/) }).strict(),
  z.object({ type: z.literal("presence"), clock: z.number().int().nonnegative(), cursor: z.unknown().nullable() }).strict(),
]);
