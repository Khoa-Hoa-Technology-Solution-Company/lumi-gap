import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { requireAuth } from "../../common/middleware/auth.js";
import { requireResearchWorkflow } from "../authorization/authorization.middleware.js";
import { createRateLimiter } from "../../common/middleware/rate-limit.js";
import { validate } from "../../common/middleware/validate.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { tokenService } from "../auth/token.service.js";
import { manuscriptService } from "./manuscript.service.js";
import { sourceText } from "./manuscript-source.js";
import { decodeSource } from "./manuscript-import.js";
import { manuscriptAiService } from "./manuscript-ai.service.js";
import { manuscriptSuggestions } from "./manuscript-suggestions.js";
import { manuscriptEvents } from "./manuscript.service.js";
import { compilerSettingsSchema, suggestionSchema } from "./dto/manuscript.schema.js";
import { manuscriptRepository } from "./manuscript-repository.js";
import { manuscriptSync, remoteBindingSchema, syncBundleSchema } from "./manuscript-sync.js";
import { manuscriptAiSchema } from "./dto/manuscript-ai.schema.js";
import { manuscriptPdfImport, pdfImportSchema } from "./manuscript-pdf-import.js";
import { withWorkspace } from "../projects/workspace-access.js";
import { manuscriptParams, createManuscriptSchema, createFileSchema, changeFileSchema, snapshotSchema, commentSchema, snapshotQuery, restoreSchema, compileSchema, importManuscriptSchema } from "./dto/manuscript.schema.js";

export const manuscriptRouter: Router = Router({ mergeParams: true });
manuscriptRouter.use(requireAuth, requireResearchWorkflow, validate(manuscriptParams, "params"));
manuscriptRouter.use((_req, res, next) => { res.setHeader("Cache-Control", "private, no-store"); next(); });
const writes = createRateLimiter("manuscripts:writes", { windowMs: 60000, max: 90 });
const uploads = createRateLimiter("manuscripts:uploads", { windowMs: 60000, max: 10 });
const compiles = createRateLimiter("manuscripts:compiles", { windowMs: 60000, max: 10 });
const aiWrites = createRateLimiter("manuscripts:ai", { windowMs: 60000, max: 10 });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5_000_000, files: 1, fields: 3, fieldSize: 300 } });
const pdfUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5_000_000, files: 1, fields: 4, fieldSize: 300 } });
const archiveUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10_000_000, files: 1, fields: 3, fieldSize: 300 } });
const pdfConversions = createRateLimiter("manuscripts:pdf-conversions", { windowMs: 600000, max: 3 });
// Resolve public project and account IDs before persistence or collaboration tickets.
// Services still authorize the actor and scope every manuscript operation to this project.
const ids = async (req: { params: Record<string, unknown>; user?: { sub: string } }) => {
  const parsed = parseDatabaseId(String(req.params.projectId));
  if (!parsed) throw AppError.badRequest("Invalid identifier");
  const project = parsed.kind === "uuid" ? parsed.value : (await getPrisma().project.findUnique({ where: { legacyMongoId: parsed.value }, select: { id: true } }))?.id;
  if (!project) throw AppError.notFound("Project not found");
  const account = parseDatabaseId(req.user!.sub);
  if (!account) throw AppError.unauthorized("Invalid account identifier");
  const actor = account.kind === "uuid" ? account.value : (await getPrisma().user.findUnique({ where: { legacyMongoId: account.value }, select: { id: true } }))?.id;
  if (!actor) throw AppError.unauthorized("Account not found");
  return { project, actor, id: String(req.params.id) };
};
manuscriptRouter.get("/", async (req, res) => { const a = await ids(req); res.json({ success: true, data: await manuscriptService.list(a.project, a.actor) }); });
manuscriptRouter.post("/", writes, validate(createManuscriptSchema), async (req, res) => { const a = await ids(req); res.status(201).json({ success: true, data: await manuscriptService.create(a.project, a.actor, req.body) }); });
manuscriptRouter.post("/import", uploads, async (req, _res, next) => { const a = await ids(req); await manuscriptService.list(a.project, a.actor); next(); }, archiveUpload.single("archive"), validate(importManuscriptSchema), async (req, res) => {
  if (!req.file) throw AppError.badRequest("Choose a source ZIP"); const a = await ids(req);
  res.status(201).json({ success: true, data: await manuscriptService.importZip(a.project, a.actor, req.body, req.file.buffer) });
});
manuscriptRouter.post("/import-bundle", uploads, async (req, _res, next) => { const a = await ids(req); await manuscriptService.list(a.project, a.actor); next(); }, archiveUpload.single("bundle"), validate(importManuscriptSchema), async (req, res) => {
  if (!req.file) throw AppError.badRequest("Choose a source bundle"); const a = await ids(req);
  res.status(201).json({ success: true, data: await manuscriptRepository.import(a.project, a.actor, req.body, req.file.buffer) });
});
manuscriptRouter.post("/pdf-imports", pdfConversions, async (req, _res, next) => {
  const a = await ids(req); await withWorkspace(a.project, a.actor, { write: true }, async () => {}); next();
}, pdfUpload.single("pdf"), validate(pdfImportSchema), async (req, res) => {
  const a = await ids(req); if (!req.file) throw AppError.badRequest("Choose a PDF no larger than 5 MB");
  res.status(202).json({ success: true, data: await manuscriptPdfImport.create(a.project, a.actor, req.body, req.file.buffer) });
});
const pdfImportParams = z.object({ conversionId: z.string().regex(/^[a-f0-9]{64}$/) }).passthrough();
manuscriptRouter.get("/pdf-imports/:conversionId", validate(pdfImportParams, "params"), async (req, res) => {
  const a = await ids(req); res.json({ success: true, data: await manuscriptPdfImport.get(a.project, a.actor, String(req.params.conversionId)) });
});
manuscriptRouter.get("/pdf-imports/:conversionId/pdf", validate(pdfImportParams, "params"), async (req, res) => {
  const a = await ids(req); const pdf = await manuscriptPdfImport.previewPdf(a.project, a.actor, String(req.params.conversionId));
  res.setHeader("Content-Disposition", 'attachment; filename="converted-preview.pdf"');
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.type("application/pdf").send(pdf);
});
manuscriptRouter.post("/pdf-imports/:conversionId/accept", writes, validate(pdfImportParams, "params"), validate(z.object({}).strict()), async (req, res) => {
  const a = await ids(req); res.status(201).json({ success: true, data: await manuscriptPdfImport.accept(a.project, a.actor, String(req.params.conversionId)) });
});
manuscriptRouter.use("/:id", validate(manuscriptParams, "params"));
manuscriptRouter.get("/:id", async (req, res) => { const a = await ids(req); res.json({ success: true, data: await manuscriptService.detail(a.project, a.actor, a.id) }); });
manuscriptRouter.delete("/:id", writes, validate(z.object({ expectedVersion: z.number().int().min(1) }).strict()), async (req, res) => { const a = await ids(req); res.json({ success: true, data: await manuscriptService.remove(a.project, a.actor, a.id, req.body.expectedVersion) }); });
manuscriptRouter.get("/:id/remote", async (req, res) => { const a = await ids(req); res.json({ success: true, data: await manuscriptSync.binding(a.project, a.actor, a.id) }); });
manuscriptRouter.put("/:id/remote", writes, validate(remoteBindingSchema), async (req, res) => { const a = await ids(req); res.json({ success: true, data: await manuscriptSync.bind(a.project, a.actor, a.id, req.body) }); });
manuscriptRouter.post("/:id/sync-source", uploads, async (req, _res, next) => { const a = await ids(req); if (!(await manuscriptService.detail(a.project, a.actor, a.id)).canWrite) throw AppError.forbidden("Read-only manuscript"); next(); }, archiveUpload.single("bundle"), validate(syncBundleSchema), async (req, res) => { const a = await ids(req); if (!req.file) throw AppError.badRequest("Choose a source bundle"); res.json({ success: true, data: await manuscriptSync.apply(a.project, a.actor, a.id, req.body, req.file.buffer) }); });
manuscriptRouter.patch("/:id/compiler-settings", writes, validate(compilerSettingsSchema), async (req, res) => { const a = await ids(req); res.json({ success: true, data: await manuscriptService.compilerSettings(a.project, a.actor, a.id, req.body) }); });
manuscriptRouter.get("/:id/context", async (req, res) => { const a = await ids(req); res.json({ success: true, data: await manuscriptService.context(a.project, a.actor, a.id) }); });
manuscriptRouter.get("/:id/suggestions", async (req, res) => { const a = await ids(req); res.json({ success: true, data: await manuscriptSuggestions.list(a.project, a.actor, a.id) }); });
manuscriptRouter.post("/:id/suggestions", writes, validate(suggestionSchema), async (req, res) => { const a = await ids(req); const data = await manuscriptSuggestions.create(a.project, a.actor, a.id, req.body); res.status(201).json({ success: true, data }); });
manuscriptRouter.patch("/:id/suggestions/:suggestionId", writes, validate(z.object({ suggestionId: z.string().uuid() }).passthrough(), "params"), validate(z.object({ expectedRevision: z.number().int().positive().max(2147483646), replacement: z.string().max(100000) }).strict()), async (req, res) => {
  const a = await ids(req), data = await manuscriptSuggestions.update(a.project, a.actor, a.id, String(req.params.suggestionId), req.body);
  res.json({ success: true, data });
});
manuscriptRouter.post("/:id/suggestions/:suggestionId/resolve", writes, validate(z.object({ suggestionId: z.string().uuid() }).passthrough(), "params"), validate(z.object({ status: z.enum(["ACCEPTED", "REJECTED"]), expectedRevision: z.number().int().positive() }).strict()), async (req, res) => {
  const a = await ids(req), data = await manuscriptSuggestions.resolve(a.project, a.actor, a.id, String(req.params.suggestionId), req.body.status, req.body.expectedRevision);
  if (data.source) manuscriptEvents.emit("source", { projectId: a.project, manuscriptId: a.id, ...data.source });
  manuscriptEvents.emit("changed", { projectId: a.project, manuscriptId: a.id });
  res.json({ success: true, data: { id: data.id } });
});
manuscriptRouter.get("/:id/search", validate(z.object({ q: z.string().min(2).max(200), caseSensitive: z.enum(["true", "false"]).optional() }).strict(), "query"), async (req, res) => { const a = await ids(req); res.json({ success: true, data: await manuscriptService.search(a.project, a.actor, a.id, String(req.query.q), req.query.caseSensitive === "true") }); });
manuscriptRouter.post("/:id/ai", aiWrites, validate(manuscriptAiSchema), async (req, res) => { const a = await ids(req); res.status(202).json({ success: true, data: await manuscriptAiService.create(a.project, a.actor, a.id, req.body) }); });
manuscriptRouter.get("/:id/ai/:runId", validate(z.object({ runId: z.string().uuid() }).passthrough(), "params"), async (req, res) => { const a = await ids(req); res.json({ success: true, data: await manuscriptAiService.get(a.project, a.actor, a.id, String(req.params.runId)) }); });
manuscriptRouter.delete("/:id/ai/:runId", aiWrites, validate(z.object({ runId: z.string().uuid() }).passthrough(), "params"), async (req, res) => { const a = await ids(req); await manuscriptAiService.cancel(a.project, a.actor, a.id, String(req.params.runId)); res.json({ success: true, data: null }); });
manuscriptRouter.post("/:id/citations", writes, validate(z.object({ paperId: z.string().uuid(), requireIncluded: z.boolean().optional() }).strict()), async (req, res) => { const a = await ids(req); res.json({ success: true, data: await manuscriptService.insertCitation(a.project, a.actor, a.id, req.body.paperId, req.body.requireIncluded) }); });
manuscriptRouter.get("/:id/mentors", async (req, res) => { const a = await ids(req); res.json({ success: true, data: await manuscriptService.mentors(a.project, a.actor, a.id) }); });
manuscriptRouter.post("/:id/files", writes, validate(createFileSchema), async (req, res) => { const a = await ids(req); res.status(201).json({ success: true, data: await manuscriptService.createFile(a.project, a.actor, a.id, req.body) }); });
manuscriptRouter.post("/:id/files/upload", uploads, async (req, _res, next) => { const a = await ids(req); const draft = await manuscriptService.detail(a.project, a.actor, a.id); if (!draft.canWrite) throw AppError.forbidden("This manuscript is read-only"); next(); }, upload.single("source"), validate(z.object({ path: z.string().min(1).max(240), clientKey: z.string().uuid() }).strict()), async (req, res) => {
  if (!req.file) throw AppError.badRequest("Choose a source file"); const a = await ids(req);
  res.status(201).json({ success: true, data: await manuscriptService.createFile(a.project, a.actor, a.id, { ...req.body, kind: "TEXT", content: decodeSource(req.file.buffer) }) });
});
manuscriptRouter.patch("/:id/files/:fileId", writes, validate(manuscriptParams, "params"), validate(changeFileSchema), async (req, res) => { const a = await ids(req); res.json({ success: true, data: await manuscriptService.changeFile(a.project, a.actor, a.id, String(req.params.fileId), req.body) }); });
manuscriptRouter.post("/:id/assets", uploads, async (req, _res, next) => { const a = await ids(req); const draft = await manuscriptService.detail(a.project, a.actor, a.id); if (!draft.canWrite) throw AppError.forbidden("This manuscript is read-only"); next(); }, upload.single("asset"), validate(z.object({ path: z.string().max(240), replaceId: z.string().uuid().optional(), expectedVersion: z.coerce.number().int().positive().optional() }).strict()), async (req, res) => {
  if (!req.file) throw AppError.badRequest("Choose an image asset"); const a = await ids(req);
  res.status(201).json({ success: true, data: await manuscriptService.asset(a.project, a.actor, a.id, { ...req.body, data: req.file.buffer.toString("base64") }) });
});
manuscriptRouter.get("/:id/files/:fileId", validate(manuscriptParams, "params"), async (req, res) => { const a = await ids(req); const { data: _bytes, ...data } = await manuscriptService.fileContent(a.project, a.actor, a.id, String(req.params.fileId)); res.setHeader("Cache-Control", "no-store"); res.json({ success: true, data }); });
manuscriptRouter.get("/:id/files/:fileId/download", validate(manuscriptParams, "params"), async (req, res) => { const a = await ids(req); const file = await manuscriptService.fileContent(a.project, a.actor, a.id, String(req.params.fileId)); const bytes = file.kind === "TEXT" && file.state ? Buffer.from(sourceText(Buffer.from(file.state, "base64")), "utf8") : file.data ? Buffer.from(file.data) : null; if (!bytes) throw AppError.notFound("File not found"); res.set({ "Cache-Control": "private, no-store", "Content-Type": file.kind === "TEXT" ? "text/plain; charset=utf-8" : file.mimeType ?? "application/octet-stream", "Content-Disposition": `attachment; filename="${file.path.split("/").pop()}"`, "X-Content-Type-Options": "nosniff" }).send(bytes); });
manuscriptRouter.post("/:id/files/:fileId/ticket", writes, validate(manuscriptParams, "params"), async (req, res) => { const a = await ids(req); const file = await manuscriptService.fileContent(a.project, a.actor, a.id, String(req.params.fileId)); if (file.kind !== "TEXT") throw AppError.badRequest("Choose a source file"); const ticket = tokenService.signPurposeToken({ actorId: a.actor, projectId: a.project, manuscriptId: a.id, fileId: file.id, sessionId: req.user!.sessionId }, "manuscript-room", "5m"); res.setHeader("Cache-Control", "no-store"); res.json({ success: true, data: { ticket } }); });
manuscriptRouter.get("/:id/snapshots", async (req, res) => { const a = await ids(req); res.json({ success: true, data: await manuscriptService.snapshots(a.project, a.actor, a.id) }); });
manuscriptRouter.post("/:id/snapshots", writes, validate(snapshotSchema), async (req, res) => { const a = await ids(req); res.status(201).json({ success: true, data: await manuscriptService.snapshot(a.project, a.actor, a.id, req.body) }); });
manuscriptRouter.get("/:id/snapshots/:snapshotId", validate(manuscriptParams, "params"), async (req, res) => { const a = await ids(req); res.setHeader("Cache-Control", "no-store"); res.json({ success: true, data: await manuscriptService.viewSnapshot(a.project, a.actor, a.id, String(req.params.snapshotId)) }); });
manuscriptRouter.get("/:id/snapshots/:snapshotId/source-bundle", validate(manuscriptParams, "params"), async (req, res) => { const a = await ids(req); res.json({ success: true, data: await manuscriptRepository.source(a.project, a.actor, a.id, String(req.params.snapshotId)) }); });
manuscriptRouter.post("/:id/snapshots/:snapshotId/restore", writes, validate(manuscriptParams, "params"), validate(restoreSchema), async (req, res) => { const a = await ids(req); res.status(201).json({ success: true, data: await manuscriptService.restore(a.project, a.actor, a.id, String(req.params.snapshotId), req.body) }); });
manuscriptRouter.post("/:id/snapshots/:snapshotId/publish", writes, validate(manuscriptParams, "params"), validate(z.object({ authorIds: z.array(z.string().uuid()).min(1).max(200) }).strict()), async (req, res) => { const a = await ids(req); res.json({ success: true, data: await manuscriptService.publish(a.project, a.actor, a.id, String(req.params.snapshotId), req.body.authorIds) }); });
manuscriptRouter.post("/:id/snapshots/:snapshotId/compile", compiles, validate(manuscriptParams, "params"), validate(compileSchema), async (req, res) => { const a = await ids(req); res.status(202).json({ success: true, data: await manuscriptService.compile(a.project, a.actor, a.id, String(req.params.snapshotId), req.body.engine, req.body.texLiveVersion) }); });
manuscriptRouter.get("/:id/compilations", validate(snapshotQuery, "query"), async (req, res) => { const a = await ids(req); res.json({ success: true, data: await manuscriptService.compilations(a.project, a.actor, a.id, req.query.snapshotId as string | undefined) }); });
manuscriptRouter.get("/:id/compilations/:compilationId/pdf", validate(manuscriptParams, "params"), async (req, res) => { const a = await ids(req); const bytes = await manuscriptService.compilationPdf(a.project, a.actor, a.id, String(req.params.compilationId)); res.set({ "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="manuscript.pdf"', "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox" }).send(Buffer.from(bytes)); });
manuscriptRouter.post("/:id/compilations/:compilationId/synctex", writes, validate(manuscriptParams, "params"), validate(z.discriminatedUnion("direction", [z.object({ direction: z.literal("forward"), path: z.string().min(1).max(240), line: z.number().int().min(1).max(500000) }).strict(), z.object({ direction: z.literal("inverse"), page: z.number().int().min(1).max(10000), x: z.number().min(0).max(20000), y: z.number().min(0).max(20000) }).strict()])), async (req, res) => { const a = await ids(req); res.json({ success: true, data: await manuscriptService.syncTex(a.project, a.actor, a.id, String(req.params.compilationId), req.body) }); });
manuscriptRouter.get("/:id/export", validate(snapshotQuery, "query"), async (req, res) => { const a = await ids(req); const zip = await manuscriptService.export(a.project, a.actor, a.id, req.query.snapshotId as string | undefined); res.set({ "Cache-Control": "private, no-store", "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="manuscript-source.zip"' }).send(Buffer.from(zip)); });
manuscriptRouter.get("/:id/comments", validate(snapshotQuery, "query"), async (req, res) => { const a = await ids(req); res.json({ success: true, data: await manuscriptService.comments(a.project, a.actor, a.id, req.query.snapshotId as string | undefined) }); });
manuscriptRouter.post("/:id/comments", writes, validate(commentSchema), async (req, res) => { const a = await ids(req); res.status(201).json({ success: true, data: await manuscriptService.comment(a.project, a.actor, a.id, req.body) }); });
