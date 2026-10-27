import * as Y from "yjs";
import { captureHistory, historySummary, retainedHistory, restoreHistory } from "./manuscript-history.js";
import { EventEmitter } from "node:events";
import { isDeepStrictEqual } from "node:util";
import { zipSync, strToU8 } from "fflate";
import type { CreateManuscript, ManuscriptSummary, ManuscriptDetail, ManuscriptFile, ManuscriptManifest, ManuscriptSnapshot, ManuscriptContext, ManuscriptComment, ManuscriptFeedbackSummary } from "@trend/shared-types";
import { Prisma } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { withWorkspace, jsonSnapshot, workspacePeople, workspacePerson, workspaceEvent, workspaceRevision, assertWorkspaceLink, type WorkspaceContext } from "../projects/workspace-access.js";
import { lockProjectAccounts, assertActiveProjectAccount } from "../projects/project-transaction.js";
import { canAccessProjectAsMentor } from "../projects/academic-relationship-access.js";
import { assertReviewerInTransaction } from "../reviews/peer-review-access.js";
import { notificationService } from "../notifications/notification.service.js";
import { hashBytes, sourceState, sourceDocument, sourceText, validateDocument, manuscriptPath, manuscriptTemplate, citationKey, bibtexEntry, MAX_CRDT_BYTES } from "./manuscript-source.js";
import type { ManuscriptEngine, CreateManuscriptSnapshot, ManuscriptSyncQuery, ManuscriptSyncLocation } from "@trend/shared-types";
import { env } from "../../config/env.js";
import { z } from "zod";
import { compilerEndpoint, compilerAvailability, compilationDto, compilationSelect, enqueueCompilation } from "./manuscript-compiler.js";
import { readSourceZip, prepareFigure } from "./manuscript-import.js";

type Db = Prisma.TransactionClient;
type Draft = NonNullable<Awaited<ReturnType<Db["draftWorkspace"]["findUnique"]>>>;
type File = NonNullable<Awaited<ReturnType<Db["manuscriptFile"]["findUnique"]>>>;
export const manuscriptEvents = new EventEmitter();
export { compilerAvailability } from "./manuscript-compiler.js";
const fileSelect = { id: true, path: true, kind: true, version: true, sequence: true, sizeBytes: true, mimeType: true, checksum: true, updatedAt: true } as const;
function fileDto(row: Pick<File, keyof typeof fileSelect>): ManuscriptFile { return { ...row, kind: row.kind as ManuscriptFile["kind"], updatedAt: row.updatedAt.toISOString() }; }
function draftDto(row: Draft, canWrite: boolean): ManuscriptSummary { return { id: row.id, projectId: row.projectId, title: row.name, description: row.description, documentType: row.documentType as ManuscriptSummary["documentType"], template: row.template as ManuscriptSummary["template"], version: row.version, mainFileId: row.mainFileId, archived: Boolean(row.archivedAt), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), canWrite: canWrite && !row.archivedAt }; }
async function manuscript(context: WorkspaceContext, id: string, write = false) {
  const row = await context.tx.draftWorkspace.findFirst({ where: { id, projectId: context.project.id, writingMode: "LATEX", deletedAt: null } });
  if (!row) throw AppError.notFound("Manuscript not found");
  if (write && row.archivedAt) throw AppError.conflict("Archived manuscripts are read-only");
  return row;
}
async function file(context: WorkspaceContext, workspaceId: string, fileId: string) {
  const row = await context.tx.manuscriptFile.findFirst({ where: { id: fileId, workspaceId, deletedAt: null } });
  if (!row) throw AppError.notFound("Manuscript file not found"); return row;
}
function expected(actual: number, expectedVersion: number) { if (actual !== expectedVersion) throw AppError.conflict("This item changed. Refresh before trying again"); }
function assertMinimumSequences(files: Array<{ id: string; sequence: number }>, minimumSequences: Record<string, number>) {
  for (const [fileId, sequence] of Object.entries(minimumSequences)) {
    const row = files.find(f => f.id === fileId);
    if (!row || row.sequence < sequence) throw AppError.conflict("Wait for source changes to be durably saved before creating a snapshot");
  }
}
async function changed(tx: Db, id: string) { return tx.draftWorkspace.update({ where: { id }, data: { version: { increment: 1 } } }); }
function notifyChange(projectId: string, id: string) { manuscriptEvents.emit("changed", { projectId, manuscriptId: id }); }
async function pathsAvailable(tx: Db, workspaceId: string, paths: Array<{ path: string; kind: string }>, ignore: string[] = []) {
  const rows = await tx.manuscriptFile.findMany({ where: { workspaceId, deletedAt: null, id: { notIn: ignore } }, select: { path: true, kind: true } });
  const all = [...rows, ...paths];
  const unique = new Set<string>();
  for (const row of all) {
    const normalized = row.path.toLowerCase();
    if (unique.has(normalized)) throw AppError.conflict("A file or folder already has that path");
    unique.add(normalized);
    if (all.some(parent => parent.kind !== "FOLDER" && normalized.startsWith(`${parent.path.toLowerCase()}/`))) throw AppError.conflict("A source file cannot contain other files");
  }
}
async function enforceQuota(tx: Db, workspaceId: string, extraFiles = 0, extraBytes = 0) {
  const rows = await tx.manuscriptFile.aggregate({ where: { workspaceId, deletedAt: null }, _count: true, _sum: { sizeBytes: true } });
  if (rows._count + extraFiles > 200 || (rows._sum.sizeBytes ?? 0) + extraBytes > 20_000_000) throw AppError.badRequest("Manuscript quota exceeded (200 files, 20 MB)");
}
async function createText(context: WorkspaceContext, workspaceId: string, path: string, text: string) {
  manuscriptPath(path, "TEXT"); const state = sourceState(text);
  return context.tx.manuscriptFile.create({ data: { workspaceId, path, kind: "TEXT", crdtState: state, sizeBytes: Buffer.byteLength(text), checksum: hashBytes(state), createdById: context.actorId } });
}
async function latestFeedback(tx: Db, projectId: string, workspaceId?: string) {
  // One project-scoped query: team replies and feedback on other versions cannot count as a mentor response.
  const rows = await tx.$queryRaw<Array<Omit<ManuscriptFeedbackSummary, "requestedAt"> & { workspaceId: string; requestedAt: Date }>>`
    WITH requests AS (
      SELECT DISTINCT ON (s.workspace_id)
        s.workspace_id, s.id AS snapshot_id, s.label, d.id AS thread_id,
        d.status, d.created_at, d.mentor_relationship_id,
        r.mentor_user_id, r.status AS relationship_status
      FROM manuscript_snapshots s
      JOIN project_discussions d ON d.project_id = s.project_id
        AND d.target_kind = 'MANUSCRIPT_SNAPSHOT' AND d.target_id = s.id
      JOIN mentor_relationships r ON r.id = d.mentor_relationship_id AND r.project_id = s.project_id
      WHERE s.project_id = ${projectId}::uuid AND d.author_id <> r.mentor_user_id
        AND (${workspaceId ?? null}::uuid IS NULL OR s.workspace_id = ${workspaceId ?? null}::uuid)
      ORDER BY s.workspace_id, d.created_at DESC, d.id DESC
    )
    SELECT q.workspace_id AS "workspaceId", q.snapshot_id AS "snapshotId",
      q.label AS "snapshotLabel", q.created_at AS "requestedAt",
      CASE WHEN q.status = 'RESOLVED' THEN 'RESOLVED'
        WHEN EXISTS (
          SELECT 1 FROM project_discussions response
          WHERE response.project_id = ${projectId}::uuid
            AND response.target_kind = 'MANUSCRIPT_SNAPSHOT' AND response.target_id = q.snapshot_id
            AND response.mentor_relationship_id = q.mentor_relationship_id
            AND response.author_id = q.mentor_user_id AND response.created_at >= q.created_at
        ) OR EXISTS (
          SELECT 1 FROM project_team_messages m
          JOIN project_discussions thread ON thread.id = m.thread_id AND thread.project_id = m.project_id
          WHERE m.project_id = ${projectId}::uuid AND m.sender_id = q.mentor_user_id
            AND NOT m.is_deleted AND m.created_at >= q.created_at
            AND thread.target_kind = 'MANUSCRIPT_SNAPSHOT' AND thread.target_id = q.snapshot_id
            AND thread.mentor_relationship_id = q.mentor_relationship_id
        ) THEN 'RESPONDED'
        WHEN q.relationship_status <> 'ACTIVE' THEN 'ENDED'
        ELSE 'PENDING' END AS status
    FROM requests q
  `;
  return new Map(rows.map(row => [row.workspaceId, { snapshotId: row.snapshotId, snapshotLabel: row.snapshotLabel, status: row.status, requestedAt: row.requestedAt.toISOString() }]));
}
export const manuscriptService = {
  async importZip(projectId: string, actorId: string, input: { title: string; mainFile: string; clientKey: string; engine?: ManuscriptEngine }, bytes: Uint8Array) {
    await withWorkspace(projectId, actorId, { write: true }, async () => undefined);
    const archive = readSourceZip(bytes, input.mainFile);
    for (const source of archive.files) if (source.kind === "ASSET") {
      const clean = await prepareFigure(source.path, source.bytes); source.bytes = clean.bytes; source.mimeType = clean.mimeType;
    }
    if (archive.files.reduce((sum, file) => sum + file.bytes.length, 0) > 20_000_000) throw AppError.badRequest("Imported manuscript exceeds 20 MB");
    const receipt = { ...input, archiveChecksum: hashBytes(bytes) };
    const result = await withWorkspace(projectId, actorId, { write: true }, async context => {
      const prior = await context.tx.draftWorkspace.findFirst({ where: { projectId: context.project.id, createdById: actorId, clientKey: input.clientKey } });
      if (prior) {
        if (prior.deletedAt) throw AppError.conflict("This manuscript was deleted. Start a new import.");
        const revision = await context.tx.projectWorkspaceRevision.findFirst({ where: { entityKind: "MANUSCRIPT", entityId: prior.id, version: 1 } });
        if (!isDeepStrictEqual((revision?.snapshot as { creationInput?: unknown })?.creationInput, receipt)) throw AppError.conflict("This import request key was already used");
        return draftDto(prior, true);
      }
      if (await context.tx.draftWorkspace.count({ where: { projectId: context.project.id, writingMode: "LATEX", deletedAt: null } }) >= 100) throw AppError.badRequest("Project manuscript limit reached");
      const row = await context.tx.draftWorkspace.create({ data: { projectId: context.project.id, name: input.title, documentType: "RESEARCH_PAPER", template: "ARTICLE", writingMode: "LATEX", clientKey: input.clientKey, createdById: actorId, ...(input.engine ? { compilerEngine: input.engine, compilerRelease: env.MANUSCRIPT_COMPILER_2025_URL ? "2025" : "2022" } : {}) } });
      await pathsAvailable(context.tx, row.id, archive.files);
      let mainFileId = "";
      for (const source of archive.files) {
        const created = source.kind === "TEXT" ? await createText(context, row.id, source.path, source.text!) : await context.tx.manuscriptFile.create({ data: { workspaceId: row.id, path: source.path, kind: "ASSET", assetData: new Uint8Array(source.bytes), mimeType: source.mimeType!, sizeBytes: source.bytes.length, checksum: hashBytes(source.bytes), createdById: actorId } });
        if (source.path === archive.mainFile) mainFileId = created.id;
      }
      const created = await context.tx.draftWorkspace.update({ where: { id: row.id }, data: { mainFileId } });
      await workspaceRevision(context, "MANUSCRIPT", created, receipt);
      await workspaceEvent(context, "MANUSCRIPT_IMPORTED", "MANUSCRIPT", row.id, { files: archive.files.length, ignored: archive.ignored.length }, `manuscript:import:${row.id}`);
      return draftDto(created, true);
    });
    notifyChange(projectId, result.id); return { ...result, ignoredFiles: archive.ignored };
  },
  async search(projectId: string, actorId: string, id: string, query: string, caseSensitive = false) {
    return withWorkspace(projectId, actorId, {}, async context => {
      await manuscript(context, id);
      const files = await context.tx.manuscriptFile.findMany({ where: { workspaceId: id, kind: "TEXT", deletedAt: null }, select: { id: true, path: true, crdtState: true }, orderBy: { path: "asc" } });
      const matches: Array<{ fileId: string; path: string; line: number; text: string }> = [];
      const needle = caseSensitive ? query : query.toLowerCase();
      for (const file of files) {
        const lines = sourceText(file.crdtState!).split("\n");
        for (let index = 0; index < lines.length; index++) if ((caseSensitive ? lines[index]! : lines[index]!.toLowerCase()).includes(needle)) {
          const position = (caseSensitive ? lines[index]! : lines[index]!.toLowerCase()).indexOf(needle);
          matches.push({ fileId: file.id, path: file.path, line: index + 1, text: lines[index]!.slice(Math.max(0, position - 60), position + query.length + 180) });
          if (matches.length === 101) return { matches: matches.slice(0, 100), truncated: true };
        }
      }
      return { matches, truncated: false };
    });
  },
  async list(projectId: string, actorId: string) {
    return withWorkspace(projectId, actorId, {}, async context => {
      const rows = await context.tx.draftWorkspace.findMany({ where: { projectId: context.project.id, writingMode: "LATEX", deletedAt: null }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 100 });
      const members = await context.tx.projectMember.findMany({ where: { projectId: context.project.id, status: "ACTIVE" }, select: { userId: true } });
      const [people, feedback] = await Promise.all([workspacePeople(context.tx, [context.project.ownerId, ...members.map(m => m.userId)]), latestFeedback(context.tx, context.project.id)]);
      return rows.map(row => ({ ...draftDto(row, context.project.status !== "ARCHIVED"), canDelete: context.project.status !== "ARCHIVED" && (context.role === "OWNER" || row.createdById === context.actorId), collaborators: [...people.values()], latestFeedback: feedback.get(row.id) ?? null }));
    });
  },
  async remove(projectId: string, actorId: string, id: string, expectedVersion: number) {
    const result = await withWorkspace(projectId, actorId, { write: true }, async context => {
      const row = await context.tx.draftWorkspace.findFirst({ where: { id, projectId: context.project.id, writingMode: "LATEX" } });
      if (!row) throw AppError.notFound("Manuscript not found");
      if (context.role !== "OWNER" && row.createdById !== context.actorId) throw AppError.forbidden("Only the project owner or manuscript creator can delete this manuscript");
      if (row.deletedAt) return { id };
      expected(row.version, expectedVersion);
      const removed = await context.tx.draftWorkspace.update({ where: { id }, data: { deletedAt: new Date(), version: { increment: 1 } } });
      await workspaceRevision(context, "MANUSCRIPT", removed);
      await workspaceEvent(context, "MANUSCRIPT_DELETED", "MANUSCRIPT", id, { version: removed.version });
      return { id };
    });
    notifyChange(projectId, id);
    return result;
  },
  async create(projectId: string, actorId: string, input: CreateManuscript) {
    const result = await withWorkspace(projectId, actorId, { write: true }, async context => {
      const prior = await context.tx.draftWorkspace.findFirst({ where: { projectId: context.project.id, createdById: actorId, clientKey: input.clientKey } });
      if (prior) {
        if (prior.deletedAt) throw AppError.conflict("This manuscript was deleted. Start a new request.");
        const receipt = await context.tx.projectWorkspaceRevision.findFirst({ where: { entityKind: "MANUSCRIPT", entityId: prior.id, version: 1 } });
        const creation = (receipt?.snapshot as { creationInput?: unknown })?.creationInput;
        if (!isDeepStrictEqual(creation, jsonSnapshot(input))) throw AppError.conflict("This manuscript request key was already used");
        return draftDto(prior, true);
      }
      if (await context.tx.draftWorkspace.count({ where: { projectId: context.project.id, writingMode: "LATEX", deletedAt: null } }) >= 100) throw AppError.badRequest("Project manuscript limit reached");
      await assertWorkspaceLink(context, input.researchLink ?? null);
      const row = await context.tx.draftWorkspace.create({ data: { projectId: context.project.id, name: input.title, description: input.description, documentType: input.documentType, template: input.template, writingMode: "LATEX", clientKey: input.clientKey, researchLink: input.researchLink ? jsonSnapshot(input.researchLink) : undefined, createdById: actorId } });
      await context.tx.manuscriptFile.create({ data: { workspaceId: row.id, path: "sections", kind: "FOLDER", createdById: actorId } });
      let mainFileId = "";
      for (const source of manuscriptTemplate(input.title, input.template)) {
        const created = await createText(context, row.id, source.path, source.text);
        if (source.path === "main.tex") mainFileId = created.id;
      }
      const created = await context.tx.draftWorkspace.update({ where: { id: row.id }, data: { mainFileId } });
      await workspaceRevision(context, "MANUSCRIPT", created, input);
      await workspaceEvent(context, "MANUSCRIPT_CREATED", "MANUSCRIPT", row.id, { version: 1 }, `manuscript:create:${row.id}`);
      return draftDto(created, true);
    }); notifyChange(projectId, result.id); return result;
  },
  async detail(projectId: string, actorId: string, id: string): Promise<ManuscriptDetail> {
    return withWorkspace(projectId, actorId, {}, async context => {
      const row = await manuscript(context, id);
      if (!row.compilerEngine || !row.compilerRelease) {
        const last = await context.tx.manuscriptCompilation.findFirst({ where: { snapshotId: { in: (await context.tx.manuscriptSnapshot.findMany({ where: { workspaceId: id }, select: { id: true } })).map(s => s.id) } }, orderBy: { createdAt: "desc" } });
        row.compilerEngine ??= last?.toolchain?.match(/^(pdflatex|xelatex|lualatex)/)?.[1] ?? null; row.compilerRelease ??= last?.texLiveVersion ?? null;
      }
      const [files, members] = await Promise.all([context.tx.manuscriptFile.findMany({ where: { workspaceId: id, deletedAt: null }, select: fileSelect, orderBy: { path: "asc" } }), context.tx.projectMember.findMany({ where: { projectId: context.project.id, status: "ACTIVE" }, select: { userId: true } })]);
      const [people, feedback] = await Promise.all([workspacePeople(context.tx, [context.project.ownerId, ...members.map(m => m.userId)]), latestFeedback(context.tx, context.project.id, id)]);
      return { ...draftDto(row, context.project.status !== "ARCHIVED"), files: files.map(fileDto), collaborators: [...people.values()], latestFeedback: feedback.get(id) ?? null, compiler: compilerAvailability, compilerSettings: { engine: (row.compilerEngine ?? "pdflatex") as ManuscriptEngine, texLiveVersion: (row.compilerRelease ?? "2022") as import("@trend/shared-types").ManuscriptTexLive, revision: row.compilerRevision } };
    });
  },
  async compilerSettings(projectId: string, actorId: string, id: string, input: { engine: ManuscriptEngine; texLiveVersion: import("@trend/shared-types").ManuscriptTexLive; expectedRevision: number }) {
    const result = await withWorkspace(projectId, actorId, { write: true }, async context => {
      const row = await manuscript(context, id, true);
      if (!compilerEndpoint(input.texLiveVersion)) throw AppError.badRequest("This compiler release is unavailable");
      expected(row.compilerRevision, input.expectedRevision);
      const saved = await context.tx.draftWorkspace.update({ where: { id }, data: { compilerEngine: input.engine, compilerRelease: input.texLiveVersion, compilerRevision: { increment: 1 } } });
      await workspaceEvent(context, "MANUSCRIPT_COMPILER_SETTINGS", "MANUSCRIPT", id, { engine: input.engine, texLiveVersion: input.texLiveVersion, revision: saved.compilerRevision });
      return { engine: input.engine, texLiveVersion: input.texLiveVersion, revision: saved.compilerRevision };
    }); notifyChange(projectId, id); return result;
  },
  async createFile(projectId: string, actorId: string, id: string, input: { path: string; kind: "TEXT" | "FOLDER"; content: string; clientKey: string }) {
    const result = await withWorkspace(projectId, actorId, { write: true }, async context => {
      await manuscript(context, id, true); manuscriptPath(input.path, input.kind);
      const prior = await context.tx.projectActivity.findFirst({ where: { projectId: context.project.id, idempotencyKey: `manuscript:file:${id}:${actorId}:${input.clientKey}` } });
      if (prior) {
        if ((prior.metadata as { inputHash?: string })?.inputHash !== hashBytes(JSON.stringify(input))) throw AppError.conflict("This file request key was already used");
        return fileDto(await context.tx.manuscriptFile.findUniqueOrThrow({ where: { id: prior.entityId! } }));
      }
      await enforceQuota(context.tx, id, 1, Buffer.byteLength(input.content));
      await pathsAvailable(context.tx, id, [{ path: input.path, kind: input.kind }]);
      const created = input.kind === "TEXT" ? await createText(context, id, input.path, input.content) : await context.tx.manuscriptFile.create({ data: { workspaceId: id, path: input.path, kind: "FOLDER", createdById: actorId } });
      await changed(context.tx, id);
      await workspaceEvent(context, "MANUSCRIPT_FILE_CREATED", "MANUSCRIPT_FILE", created.id, { inputHash: hashBytes(JSON.stringify(input)) }, `manuscript:file:${id}:${actorId}:${input.clientKey}`);
      return fileDto(created);
    }); notifyChange(projectId, id); return result;
  },
  async changeFile(projectId: string, actorId: string, id: string, fileId: string, input: { expectedVersion: number; path?: string; delete?: boolean; main?: boolean }) {
    const result = await withWorkspace(projectId, actorId, { write: true }, async context => {
      const draft = await manuscript(context, id, true), row = await file(context, id, fileId); expected(row.version, input.expectedVersion);
      const descendants = row.kind === "FOLDER" ? await context.tx.manuscriptFile.findMany({ where: { workspaceId: id, deletedAt: null, path: { startsWith: `${row.path}/` } } }) : [];
      if (input.delete) {
        if ([row, ...descendants].some(f => f.id === draft.mainFileId)) throw AppError.conflict("Set another main LaTeX file before deleting this file or folder");
        await context.tx.manuscriptFile.updateMany({ where: { id: { in: [row.id, ...descendants.map(d => d.id)] } }, data: { deletedAt: new Date(), version: { increment: 1 } } });
      } else if (input.main) {
        if (row.kind !== "TEXT" || !row.path.endsWith(".tex")) throw AppError.badRequest("Choose a LaTeX source file");
        await context.tx.draftWorkspace.update({ where: { id }, data: { mainFileId: fileId } });
      } else if (input.path) {
        const next = manuscriptPath(input.path, row.kind as ManuscriptFile["kind"]);
        if (row.kind === "FOLDER" && next.startsWith(`${row.path}/`)) throw AppError.badRequest("A folder cannot be moved into itself");
        const targets = [row, ...descendants].map(f => ({ id: f.id, path: f.id === row.id ? next : `${next}${f.path.slice(row.path.length)}`, kind: f.kind }));
        for (const target of targets) manuscriptPath(target.path, target.kind as ManuscriptFile["kind"]);
        if (targets.some(f => f.id === draft.mainFileId && !f.path.endsWith(".tex"))) throw AppError.badRequest("The main file must keep its .tex extension");
        await pathsAvailable(context.tx, id, targets, targets.map(f => f.id));
        for (const target of targets) await context.tx.manuscriptFile.update({ where: { id: target.id }, data: { path: target.path, version: { increment: 1 } } });
      } else throw AppError.badRequest("Choose a file operation");
      return draftDto(await changed(context.tx, id), true);
    }); notifyChange(projectId, id); return result;
  },
  async asset(projectId: string, actorId: string, id: string, input: { path: string; data: string; replaceId?: string; expectedVersion?: number }) {
    const bytes = Buffer.from(input.data, "base64");
    const path = manuscriptPath(input.path.replace(/\.(jpg|jpeg|webp)$/, ".png"), "ASSET");
    const figure = await prepareFigure(path, bytes), clean = figure.bytes;
    const result = await withWorkspace(projectId, actorId, { write: true }, async context => {
      await manuscript(context, id, true);
      const prior = input.replaceId ? await file(context, id, input.replaceId) : null;
      if (prior && prior.kind !== "ASSET") throw AppError.badRequest("Only image assets can be replaced");
      if (prior) expected(prior.version, input.expectedVersion!);
      await enforceQuota(context.tx, id, prior ? 0 : 1, clean.length - (prior?.sizeBytes ?? 0));
      await pathsAvailable(context.tx, id, [{ path, kind: "ASSET" }], prior ? [prior.id] : []);
      const data = { path, assetData: new Uint8Array(clean), sizeBytes: clean.length, mimeType: figure.mimeType, checksum: hashBytes(clean) };
      const row = prior ? await context.tx.manuscriptFile.update({ where: { id: prior.id }, data: { ...data, version: { increment: 1 } } }) : await context.tx.manuscriptFile.create({ data: { ...data, kind: "ASSET", workspaceId: id, createdById: actorId } });
      await changed(context.tx, id); return fileDto(row);
    }); notifyChange(projectId, id); return result;
  },
  async fileContent(projectId: string, actorId: string, id: string, fileId: string) {
    return withWorkspace(projectId, actorId, {}, async context => {
      const draft = await manuscript(context, id); const row = await file(context, id, fileId);
      return { ...fileDto(row), state: row.crdtState ? Buffer.from(row.crdtState).toString("base64") : null, canWrite: !draft.archivedAt && context.project.status !== "ARCHIVED", data: row.assetData };
    });
  },
  async applyUpdate(projectId: string, actorId: string, id: string, fileId: string, input: { clientSessionId: string; clientSequence: number; update: string }, sessionId?: string) {
    const update = Buffer.from(input.update, "base64");
    if (!update.length || update.length > MAX_CRDT_BYTES) throw AppError.badRequest("Invalid collaborative update size");
    const result = await withWorkspace(projectId, actorId, { write: true }, async context => {
      if (sessionId) {
        const sessions = await context.tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM refresh_tokens WHERE user_id=${actorId}::uuid AND family_id=${sessionId}::uuid AND revoked_at IS NULL AND expires_at > now() FOR SHARE`;
        if (!sessions.length) throw AppError.unauthorized("Session ended");
      }
      await manuscript(context, id, true); const row = await file(context, id, fileId);
      if (row.kind !== "TEXT") throw AppError.badRequest("Only source files support text collaboration");
      const checksum = hashBytes(update);
      const prior = await context.tx.manuscriptUpdate.findUnique({ where: { fileId_actorId_clientSessionId_clientSequence: { fileId, actorId, clientSessionId: input.clientSessionId, clientSequence: input.clientSequence } } });
      if (prior) {
        if (prior.checksum !== checksum) throw AppError.conflict("An update sequence cannot be reused with different bytes");
        return { sequence: row.sequence, fileVersion: row.version, state: Buffer.from(row.crdtState!).toString("base64"), replay: true };
      }
      const last = await context.tx.manuscriptUpdate.findFirst({ where: { fileId, actorId, clientSessionId: input.clientSessionId }, orderBy: { clientSequence: "desc" }, select: { clientSequence: true } });
      if (input.clientSequence !== (last?.clientSequence ?? 0) + 1) throw AppError.conflict("Send collaborative updates in sequence");
      const [history] = await context.tx.$queryRaw<Array<{ bytes: bigint; updates: bigint }>>`SELECT coalesce(sum(octet_length(u.update)),0)::bigint AS bytes, count(*)::bigint AS updates FROM manuscript_updates u JOIN manuscript_files f ON f.id=u.file_id WHERE f.workspace_id=${id}::uuid`;
      if (history && (history.bytes + BigInt(update.length) > 100_000_000n || history.updates >= 100_000n)) throw AppError.badRequest("Collaborative history quota reached; create a new draft from a snapshot");
      const doc = sourceDocument(row.crdtState);
      let state: Uint8Array<ArrayBuffer>;
      try { Y.applyUpdate(doc, update); state = validateDocument(doc); }
      catch (error) { if (error instanceof AppError) throw error; throw AppError.badRequest("Invalid CRDT update"); }
      finally { doc.destroy(); }
      const nextHash = hashBytes(state), actualChange = nextHash !== row.checksum;
      let sequence = row.sequence, fileVersion = row.version;
      if (actualChange) {
        const sizeBytes = Buffer.byteLength(sourceText(state));
        await enforceQuota(context.tx, id, 0, sizeBytes - row.sizeBytes);
        const updated = await context.tx.manuscriptFile.update({ where: { id: fileId }, data: { crdtState: state, sizeBytes, checksum: nextHash, sequence: { increment: 1 }, version: { increment: 1 } } });
        sequence = updated.sequence; fileVersion = updated.version; await changed(context.tx, id);
        const eventKey = `manuscript:writing:${fileId}:${actorId}:${input.clientSessionId}`;
        if (!await context.tx.projectActivity.findFirst({ where: { projectId: context.project.id, idempotencyKey: eventKey } })) await workspaceEvent(context, "MANUSCRIPT_WRITING_SESSION", "MANUSCRIPT", id, { fileId, attribution: "AUTHENTICATED_EDIT_SESSION_ONLY" }, eventKey);
      }
      await context.tx.manuscriptUpdate.create({ data: { fileId, actorId, clientSessionId: input.clientSessionId, clientSequence: input.clientSequence, serverSequence: sequence, update, checksum } });
      return { sequence, fileVersion, state: Buffer.from(state).toString("base64"), replay: !actualChange };
    });
    if (!result.replay) notifyChange(projectId, id);
    return result;
  },
  async snapshots(projectId: string, actorId: string, id: string): Promise<ManuscriptSnapshot[]> {
    return withWorkspace(projectId, actorId, {}, async context => {
      await manuscript(context, id);
      const rows = await context.tx.manuscriptSnapshot.findMany({ where: { workspaceId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 });
      const people = await workspacePeople(context.tx, rows.map(r => r.createdById));
      const sealed = await context.tx.submissionRevision.findMany({ where: { manuscriptSnapshotId: { in: rows.map(r => r.id) } }, select: { manuscriptSnapshotId: true, submissionId: true } });
      return rows.map(row => ({ id: row.id, label: row.label, sourceVersion: row.sourceVersion, checksum: row.checksum, collaboration: historySummary(row.collaborationState), createdAt: row.createdAt.toISOString(), createdBy: workspacePerson(people, row.createdById), submissionId: sealed.find(r => r.manuscriptSnapshotId === row.id)?.submissionId ?? null }));
    });
  },
  async snapshot(projectId: string, actorId: string, id: string, input: CreateManuscriptSnapshot) {
    return withWorkspace(projectId, actorId, { write: true }, async context => {
      const draft = await manuscript(context, id, true);
      const prior = await context.tx.manuscriptSnapshot.findUnique({ where: { workspaceId_createdById_clientKey: { workspaceId: id, createdById: actorId, clientKey: input.clientKey } } });
      if (prior) {
        if (prior.label !== input.label) throw AppError.conflict("This snapshot request key was already used");
        assertMinimumSequences((prior.manifest as unknown as ManuscriptManifest).files, input.minimumSequences);
        return { id: prior.id, sourceVersion: prior.sourceVersion };
      }
      if (!draft.mainFileId) throw AppError.badRequest("Set a main LaTeX file before creating a snapshot");
      const files = await context.tx.manuscriptFile.findMany({ where: { workspaceId: id, deletedAt: null }, orderBy: { path: "asc" } });
      assertMinimumSequences(files, input.minimumSequences);
      const manifest: ManuscriptManifest = { title: draft.name, documentType: draft.documentType as ManuscriptManifest["documentType"], mainFileId: draft.mainFileId, files: files.map(f => ({ id: f.id, path: f.path, kind: f.kind as ManuscriptFile["kind"], sequence: f.sequence, checksum: f.checksum, sizeBytes: f.sizeBytes, mimeType: f.mimeType, ...(f.crdtState ? { text: sourceText(f.crdtState) } : {}) })) };
      const checksum = hashBytes(JSON.stringify(manifest));
      if (input.reuseUnchanged) {
        const unchanged = await context.tx.manuscriptSnapshot.findFirst({ where: { workspaceId: id, projectId: context.project.id, sourceVersion: draft.version, checksum }, orderBy: { createdAt: "desc" }, select: { id: true, sourceVersion: true } });
        if (unchanged) return unchanged;
      }
      if (await context.tx.manuscriptSnapshot.count({ where: { workspaceId: id } }) >= 100) throw AppError.badRequest("Manuscript snapshot limit reached");
      const row = await context.tx.manuscriptSnapshot.create({ data: { workspaceId: id, projectId: context.project.id, label: input.label, sourceVersion: draft.version, manifest: jsonSnapshot(manifest), collaborationState: (await captureHistory(context.tx, projectId, id, files, { engine: draft.compilerEngine, release: draft.compilerRelease, template: draft.template })) ?? undefined, checksum, createdById: actorId, clientKey: input.clientKey } });
      const assets = files.filter(f => f.assetData);
      if (assets.length) await context.tx.manuscriptSnapshotAsset.createMany({ data: assets.map(f => ({ snapshotId: row.id, fileId: f.id, data: f.assetData! })) });
      await workspaceEvent(context, "MANUSCRIPT_SNAPSHOT_CREATED", "MANUSCRIPT", id, { snapshotId: row.id, version: draft.version, attribution: "SNAPSHOT_CREATOR_ONLY" }, `manuscript:snapshot:${row.id}`);
      return { id: row.id, sourceVersion: row.sourceVersion };
    });
  },
  async viewSnapshot(projectId: string, actorId: string, id: string, snapshotId: string): Promise<ManuscriptSnapshot> {
    return withSnapshot(projectId, actorId, id, snapshotId, async (tx, row, grant) => {
      const people = await workspacePeople(tx, [row.createdById]);
      const revision = grant.reviewer ? await tx.reviewerAssignment.findFirst({ where: { reviewerId: actorId, artifactRevisionId: { in: (await tx.submissionRevision.findMany({ where: { manuscriptSnapshotId: snapshotId }, select: { id: true } })).map(r => r.id) }, status: { in: ["accepted", "in_review", "completed"] } }, select: { id: true, artifactRevisionId: true } }) : null;
      return { id: row.id, label: row.label, sourceVersion: row.sourceVersion, checksum: row.checksum, createdAt: row.createdAt.toISOString(), createdBy: workspacePerson(people, row.createdById), manifest: row.manifest as unknown as ManuscriptManifest, canComment: !grant.reviewer && !grant.readOnly, canResolve: grant.member && !grant.readOnly, formalRevisionId: revision?.artifactRevisionId ?? null, formalAssignmentId: revision?.id ?? null };
    });
  },
  async export(projectId: string, actorId: string, id: string, snapshotId?: string) {
    if (snapshotId) return withSnapshot(projectId, actorId, id, snapshotId, async (tx, row) => {
      const manifest = row.manifest as unknown as ManuscriptManifest;
      const assets = await tx.manuscriptSnapshotAsset.findMany({ where: { snapshotId } });
      return exportZip(manifest, new Map(assets.map(a => [a.fileId, a.data])), { snapshotId, sourceVersion: row.sourceVersion, checksum: row.checksum });
    });
    return withWorkspace(projectId, actorId, {}, async context => {
      const draft = await manuscript(context, id);
      const files = await context.tx.manuscriptFile.findMany({ where: { workspaceId: id, deletedAt: null }, orderBy: { path: "asc" } });
      const manifest: ManuscriptManifest = { title: draft.name, documentType: draft.documentType as ManuscriptManifest["documentType"], mainFileId: draft.mainFileId!, files: files.map(f => ({ ...fileDto(f), ...(f.crdtState ? { text: sourceText(f.crdtState) } : {}) })) };
      return exportZip(manifest, new Map(files.filter(f => f.assetData).map(f => [f.id, f.assetData!])), { sourceVersion: draft.version });
    });
  },
  async restore(projectId: string, actorId: string, id: string, snapshotId: string, input: { title: string; clientKey: string }) {
    const result = await withWorkspace(projectId, actorId, { write: true }, async context => {
      await manuscript(context, id, true);
      const snapshot = await context.tx.manuscriptSnapshot.findFirst({ where: { id: snapshotId, workspaceId: id, projectId: context.project.id } });
      if (!snapshot) throw AppError.notFound("Snapshot not found");
      const prior = await context.tx.draftWorkspace.findFirst({ where: { projectId: context.project.id, createdById: actorId, clientKey: input.clientKey } });
      if (prior) {
        const receipt = await context.tx.projectActivity.findFirst({ where: { idempotencyKey: `manuscript:restore:${prior.id}`, projectId: context.project.id } });
        if (prior.deletedAt) throw AppError.conflict("This restored manuscript was deleted. Start a new restore request.");
        if ((receipt?.metadata as { snapshotId?: string; title?: string })?.snapshotId !== snapshotId || (receipt?.metadata as { title?: string })?.title !== input.title) throw AppError.conflict("This restore request key was already used");
        return draftDto(prior, true);
      }
      if (await context.tx.draftWorkspace.count({ where: { projectId: context.project.id, writingMode: "LATEX", deletedAt: null } }) >= 100) throw AppError.badRequest("Project manuscript limit reached");
      const manifest = snapshot.manifest as unknown as ManuscriptManifest;
      const assets = await context.tx.manuscriptSnapshotAsset.findMany({ where: { snapshotId } });
      const history = retainedHistory(snapshot.collaborationState), fileIds = new Map<string, string>();
      const original = await manuscript(context, id);
      const row = await context.tx.draftWorkspace.create({ data: { compilerEngine: history?.settings ? history.settings.engine : original.compilerEngine, compilerRelease: history?.settings ? history.settings.release : original.compilerRelease, projectId: context.project.id, name: input.title, documentType: manifest.documentType, writingMode: "LATEX", template: history?.settings?.template ?? original.template ?? "ARTICLE", createdById: actorId, clientKey: input.clientKey } });
      let mainFileId = "";
      for (const source of manifest.files) {
        const state = source.kind === "TEXT" ? history?.states[source.id] ? new Uint8Array(Buffer.from(history.states[source.id]!, "base64")) : sourceState(source.text ?? "") : null;
        const asset = assets.find(a => a.fileId === source.id)?.data ?? null;
        const created = await context.tx.manuscriptFile.create({ data: { workspaceId: row.id, path: source.path, kind: source.kind, crdtState: state, assetData: asset, mimeType: source.mimeType, sizeBytes: source.sizeBytes, checksum: state ? hashBytes(state) : source.checksum, createdById: actorId } });
        fileIds.set(source.id, created.id);
        if (source.id === manifest.mainFileId) mainFileId = created.id;
      }
      if (history) await restoreHistory(context.tx, context.project.id, row.id, snapshotId, history, fileIds);
      const restored = await context.tx.draftWorkspace.update({ where: { id: row.id }, data: { mainFileId } });
      await workspaceEvent(context, "MANUSCRIPT_RESTORED", "MANUSCRIPT", row.id, { snapshotId, title: input.title }, `manuscript:restore:${row.id}`);
      return draftDto(restored, true);
    }); notifyChange(projectId, result.id); return result;
  },
  async context(projectId: string, actorId: string, id: string): Promise<ManuscriptContext> {
    return withWorkspace(projectId, actorId, {}, async context => {
      await manuscript(context, id);
      const [links, plan, gaps, evidence] = await Promise.all([
        context.tx.projectPaper.findMany({ where: { projectId: context.project.id }, select: { paperId: true }, take: 200 }),
        context.tx.researchPlan.findUnique({ where: { projectId: context.project.id } }),
        context.tx.researchGap.findMany({ where: { projectId: context.project.id }, select: { id: true, title: true, description: true, assessmentStatus: true, assumptions: true }, take: 100 }),
        context.tx.projectEvidenceItem.findMany({ where: { projectId: context.project.id }, select: { id: true, claim: true, context: true, reviewState: true, limitations: true }, take: 200 }),
      ]);
      const ids = links.map(l => l.paperId);
      const gapEvidence = await context.tx.gapEvidenceRecord.findMany({ where: { gapId: { in: gaps.map(g => g.id) } }, select: { id: true, gapId: true, evidenceKind: true, excerpt: true, explanation: true, evidenceItemId: true }, take: 200 });
      const [papers, authors] = await Promise.all([context.tx.paper.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, publicationYear: true, doi: true, journalName: true } }), context.tx.paperAuthor.findMany({ where: { paperId: { in: ids } }, orderBy: { position: "asc" } })]);
      return { references: papers.map(p => { const names = authors.filter(a => a.paperId === p.id).map(a => a.displayName), key = citationKey(p, names); return { id: p.id, title: p.title, authors: names, year: p.publicationYear || null, doi: p.doi, citationKey: key, bibtex: bibtexEntry(p, names, key) }; }), plan: plan ? { title: context.project.title, objective: plan.objectives.join("\n"), questions: plan.questions } : null, gaps: gaps.map(g => ({ id: g.id, title: g.title, description: g.description, status: g.assessmentStatus, limitations: g.assumptions })), evidence: [...evidence.map(e => ({ id: e.id, claim: e.claim, interpretation: e.context, status: e.reviewState, evidenceRole: "EXTRACTED", limitations: e.limitations })), ...gapEvidence.map(e => ({ id: e.id, gapId: e.gapId, claim: e.excerpt ?? e.explanation, interpretation: e.explanation, status: evidence.find(item => item.id === e.evidenceItemId)?.reviewState ?? "UNVERIFIED", evidenceRole: e.evidenceKind, limitations: evidence.find(item => item.id === e.evidenceItemId)?.limitations ?? "" }))] };
    });
  },
  async insertCitation(projectId: string, actorId: string, id: string, paperId: string, requireIncluded = false) {
    const result = await withWorkspace(projectId, actorId, { write: true }, async context => {
      await manuscript(context, id, true);
      if (!await context.tx.projectPaper.findFirst({ where: { projectId, paperId, ...(requireIncluded ? { screeningStatus: "INCLUDED" } : {}) } })) throw AppError.notFound("Project reference not found");
      const paper = await context.tx.paper.findUniqueOrThrow({ where: { id: paperId } });
      if (requireIncluded && paper.dataStatus !== "active") throw AppError.conflict("The AI source is no longer available");
      const authors = await context.tx.paperAuthor.findMany({ where: { paperId }, orderBy: { position: "asc" } });
      let row = await context.tx.manuscriptFile.findFirst({ where: { workspaceId: id, path: "references.bib", deletedAt: null, kind: "TEXT" } });
      if (!row) {
        await enforceQuota(context.tx, id, 1);
        await pathsAvailable(context.tx, id, [{ path: "references.bib", kind: "TEXT" }]);
        row = await createText(context, id, "references.bib", "");
      }
      const doc = sourceDocument(row.crdtState), text = doc.getText("source"), existing = text.toString();
      try {
        const marker = `% lumigap-paper:${paperId}\n`;
        const markerIndex = existing.indexOf(marker);
        const retainedKey = markerIndex >= 0 ? existing.slice(markerIndex + marker.length).match(/^\s*@[A-Za-z]+\s*\{\s*([A-Za-z0-9_:.-]+)\s*,/)?.[1] : undefined;
        let key = retainedKey ?? citationKey(paper, authors.map(a => a.displayName));
        if (!retainedKey) {
          const used = new Set([...existing.matchAll(/@[A-Za-z]+\s*\{\s*([^,\s]+)\s*,/g)].map(m => m[1]));
          const base = key; let suffix = 2; while (used.has(key)) key = `${base}_${suffix++}`;
          text.insert(text.length, `\n${marker}${bibtexEntry(paper, authors.map(a => a.displayName), key)}`);
          const state = validateDocument(doc), sizeBytes = Buffer.byteLength(text.toString());
          await enforceQuota(context.tx, id, 0, sizeBytes - row.sizeBytes);
          row = await context.tx.manuscriptFile.update({ where: { id: row.id }, data: { crdtState: state, checksum: hashBytes(state), sizeBytes, sequence: { increment: 1 }, version: { increment: 1 } } });
          await changed(context.tx, id);
          await context.tx.manuscriptUpdate.create({ data: { fileId: row.id, actorId, clientSessionId: crypto.randomUUID(), clientSequence: 1, serverSequence: row.sequence, update: state, checksum: hashBytes(state) } });
        }
        return { key, fileId: row.id, update: Buffer.from(row.crdtState!).toString("base64"), sequence: row.sequence, fileVersion: row.version };
      } finally { doc.destroy(); }
    });
    manuscriptEvents.emit("source", { projectId, manuscriptId: id, ...result });
    notifyChange(projectId, id); return result;
  },
  async mentors(projectId: string, actorId: string, id: string) {
    return withWorkspace(projectId, actorId, {}, async context => {
      await manuscript(context, id);
      const rows = await context.tx.mentorRelationship.findMany({ where: { projectId: context.project.id, status: "ACTIVE" }, select: { id: true, mentorUserId: true } });
      const people = await workspacePeople(context.tx, rows.map(r => r.mentorUserId));
      const result: Array<{ id: string; mentor: { id: string; name: string } }> = [];
      for (const row of rows) if (await canAccessProjectAsMentor(context.project.id, row.mentorUserId, context.tx)) result.push({ id: row.id, mentor: workspacePerson(people, row.mentorUserId) });
      return result;
    });
  },
  async commentPage(projectId: string, actorId: string, id: string, snapshotId?: string, cursor?: string): Promise<import("@trend/shared-types").ManuscriptCommentPage> {
    const items = await this.comments(projectId, actorId, id, snapshotId, { cursor, pageSize: 20 });
    const hasMore = items.length > 20;
    if (hasMore) items.pop();
    return { items, nextCursor: hasMore ? items.at(-1)!.id : null };
  },
  async comments(projectId: string, actorId: string, id: string, snapshotId?: string, page?: { cursor?: string; pageSize: number }): Promise<ManuscriptComment[]> {
    const run = async (tx: Db, mentorId?: string | null) => {
      const where = { projectId, ...(snapshotId ? { targetKind: "MANUSCRIPT_SNAPSHOT", targetId: snapshotId, ...(mentorId ? { mentorRelationshipId: mentorId } : {}) } : { targetKind: "MANUSCRIPT", targetId: id }) };
      if (page?.cursor && !await tx.projectDiscussion.findFirst({ where: { ...where, id: page.cursor }, select: { id: true } })) throw AppError.notFound("Comment cursor not found");
      const threads = await tx.projectDiscussion.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: page ? page.pageSize + 1 : 200, ...(page?.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}) });
      if (!page) threads.reverse();
      // A busy thread must not consume every other thread's reply budget.
      const messages = threads.length ? await tx.$queryRaw<Array<{ id: string; threadId: string; senderId: string; content: string; createdAt: Date }>>`
        SELECT recent.id, recent.thread_id AS "threadId", recent.sender_id AS "senderId", recent.content, recent.created_at AS "createdAt"
        FROM (VALUES ${Prisma.join(threads.map(thread => Prisma.sql`(${thread.id}::uuid)`))}) AS selected(thread_id)
        CROSS JOIN LATERAL (
          SELECT id, thread_id, sender_id, content, created_at FROM project_team_messages
          WHERE project_id = ${projectId}::uuid AND thread_id = selected.thread_id AND NOT is_deleted
          ORDER BY created_at DESC, id DESC LIMIT 21
        ) recent ORDER BY recent.created_at ASC, recent.id ASC
      ` : [];
      const people = await workspacePeople(tx, [...threads.map(t => t.authorId), ...messages.map(m => m.senderId)]);
      const byThread = new Map<string, typeof messages>();
      for (const message of messages) { const rows = byThread.get(message.threadId) ?? []; rows.push(message); byThread.set(message.threadId, rows); }
      return threads.map(t => ({ id: t.id, title: t.title, body: t.body, status: t.status as ManuscriptComment["status"], conclusion: t.conclusion, version: t.version, author: workspacePerson(people, t.authorId), context: t.context as ManuscriptComment["context"], mentorRelationshipId: t.mentorRelationshipId, hasMoreMessages: (byThread.get(t.id)?.length ?? 0) > 20, messages: (byThread.get(t.id) ?? []).slice(-20).map(m => ({ id: m.id, body: m.content, author: workspacePerson(people, m.senderId), createdAt: m.createdAt.toISOString() })) }));
    };
    if (snapshotId) return withSnapshot(projectId, actorId, id, snapshotId, async (tx, _row, grant) => grant.reviewer ? [] : run(tx, grant.mentorRelationshipId));
    return withWorkspace(projectId, actorId, {}, async context => { await manuscript(context, id); return run(context.tx); });
  },
  async comment(projectId: string, actorId: string, id: string, input: { body: string; clientKey: string; fileId?: string; snapshotId?: string; quote?: string; start?: unknown; end?: unknown; mentorRelationshipId?: string }) {
    const run = async (context: WorkspaceContext) => {
      const prior = await context.tx.projectDiscussion.findUnique({ where: { projectId_authorId_clientKey: { projectId, authorId: actorId, clientKey: input.clientKey } } });
      const receipt = hashBytes(JSON.stringify(input));
      if (prior) { if ((prior.context as { receipt?: string }).receipt !== receipt) throw AppError.conflict("This comment request key was already used"); return { id: prior.id }; }
      if (input.fileId) {
        if (input.snapshotId) {
          const row = await context.tx.manuscriptSnapshot.findUniqueOrThrow({ where: { id: input.snapshotId } });
          if (!(row.manifest as unknown as ManuscriptManifest).files.some(f => f.id === input.fileId)) throw AppError.badRequest("File is not in this snapshot");
        } else await file(context, id, input.fileId);
      }
      let relationshipId = input.mentorRelationshipId ?? null;
      if (relationshipId) {
        if (!context.role || !input.snapshotId) throw AppError.forbidden("Only the team can share a snapshot for mentor feedback");
        const relation = await context.tx.mentorRelationship.findFirst({ where: { id: relationshipId, projectId, status: "ACTIVE" } });
        if (!relation || !await canAccessProjectAsMentor(projectId, relation.mentorUserId, context.tx)) throw AppError.badRequest("Choose an active verified project mentor");
      } else if (!context.role) {
        const relationships = await context.tx.mentorRelationship.findMany({ where: { projectId, mentorUserId: actorId, status: "ACTIVE" }, select: { id: true } });
        const thread = await context.tx.projectDiscussion.findFirst({ where: { projectId, targetKind: "MANUSCRIPT_SNAPSHOT", targetId: input.snapshotId, mentorRelationshipId: { in: relationships.map(r => r.id) } } });
        relationshipId = thread?.mentorRelationshipId ?? null;
        if (!relationshipId) throw AppError.forbidden("A shared feedback request is required");
      }
      const row = await context.tx.projectDiscussion.create({ data: { projectId, title: input.body.slice(0, 120), body: input.body, category: relationshipId ? "MENTOR_QUESTION" : "GENERAL", authorId: actorId, targetKind: input.snapshotId ? "MANUSCRIPT_SNAPSHOT" : "MANUSCRIPT", targetId: input.snapshotId ?? id, mentorRelationshipId: relationshipId, clientKey: input.clientKey, context: jsonSnapshot({ fileId: input.fileId, snapshotId: input.snapshotId, quote: input.quote, start: input.start, end: input.end, receipt }) } });
      await workspaceRevision(context, "DISCUSSION", row);
      await workspaceEvent(context, context.role ? "MANUSCRIPT_COMMENTED" : "MANUSCRIPT_FEEDBACK_PROVIDED", "MANUSCRIPT", id, { snapshotId: input.snapshotId ?? null }, `manuscript:comment:${row.id}`);
      if (input.mentorRelationshipId) {
        const relation = await context.tx.mentorRelationship.findUniqueOrThrow({ where: { id: input.mentorRelationshipId } });
        await notificationService.create({ userId: relation.mentorUserId, type: "MANUSCRIPT_FEEDBACK_REQUEST", title: "Manuscript feedback requested", message: "A research team shared an immutable manuscript version for your feedback.", targetKind: "project", targetId: projectId, eventKey: `manuscript:feedback:${row.id}`, emailStatus: "SKIPPED", emailPayload: { manuscriptId: id, snapshotId: input.snapshotId! } }, context.tx);
      }
      return { id: row.id };
    };
    if (input.snapshotId) return withSnapshot(projectId, actorId, id, input.snapshotId, async (tx, _row, grant) => {
      const project = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
      if (project.status === "ARCHIVED" || grant.reviewer) throw AppError.forbidden("This version is read-only");
      if (grant.readOnly) throw AppError.conflict("Archived manuscripts are read-only");
      return run({ tx, project, actorId, role: grant.member ? project.ownerId === actorId ? "OWNER" : "MEMBER" : null });
    });
    return withWorkspace(projectId, actorId, { write: true }, async context => { await manuscript(context, id, true); return run(context); });
  },
  async publish(projectId: string, actorId: string, id: string, snapshotId: string, authorIds: string[]) {
    return withWorkspace(projectId, actorId, { write: true, accounts: authorIds }, async context => {
      await manuscript(context, id, true);
      const snapshot = await context.tx.manuscriptSnapshot.findFirst({ where: { id: snapshotId, workspaceId: id, projectId } });
      if (!snapshot) throw AppError.notFound("Snapshot not found");
      const prior = await context.tx.submissionRevision.findFirst({ where: { manuscriptSnapshotId: snapshotId } });
      if (prior) {
        const authors = await context.tx.submissionAuthor.findMany({ where: { submissionId: prior.submissionId }, orderBy: { position: "asc" }, select: { userId: true } });
        if (JSON.stringify(authors.map(a => a.userId)) !== JSON.stringify(authorIds)) throw AppError.conflict("This version is already sealed with a different declared author list");
        return { submissionId: prior.submissionId, revisionId: prior.id };
      }
      const manifest = snapshot.manifest as unknown as ManuscriptManifest;
      const content = manifest.files.filter(f => f.kind === "TEXT").map(f => `=== ${f.path} ===\n${f.text}`).join("\n\n");
      const submission = await context.tx.submission.create({ data: { projectId, createdById: actorId, title: `${manifest.title.slice(0, 135)} (${snapshot.label})`, submissionType: manifest.documentType, status: "submitted" } });
      const revision = await context.tx.submissionRevision.create({ data: { submissionId: submission.id, revisionNumber: 1, uploadedById: actorId, contentSnapshot: content, contentType: "LATEX", checksumSha256: hashBytes(content), sizeBytes: Buffer.byteLength(content), manuscriptSnapshotId: snapshotId } });
      await context.tx.submission.update({ where: { id: submission.id }, data: { currentRevisionId: revision.id } });
      const members = await context.tx.projectMember.findMany({ where: { projectId, status: "ACTIVE" }, select: { userId: true } });
      const eligible = new Set([context.project.ownerId, ...members.map(m => m.userId)]);
      if (!authorIds.length || new Set(authorIds).size !== authorIds.length || authorIds.some(userId => !eligible.has(userId))) throw AppError.badRequest("Choose declared authors from the project team");
      for (const userId of authorIds) await assertActiveProjectAccount(context.tx, userId);
      await context.tx.submissionAuthor.createMany({ data: authorIds.map((userId, position) => ({ submissionId: submission.id, userId, position })) });
      await workspaceEvent(context, "MANUSCRIPT_VERSION_SUBMITTED", "MANUSCRIPT", id, { snapshotId, revisionId: revision.id, attribution: "SUBMISSION_ACTOR_ONLY" }, `manuscript:publish:${snapshotId}`);
      return { submissionId: submission.id, revisionId: revision.id };
    });
  },
  async compile(projectId: string, actorId: string, id: string, snapshotId: string, requestedEngine?: ManuscriptEngine, requestedRelease?: import("@trend/shared-types").ManuscriptTexLive) {
    const result = await withWorkspace(projectId, actorId, { write: true }, async context => {
      const draft = await manuscript(context, id, true);
        if (!draft.compilerEngine || !draft.compilerRelease) {
          const last = await context.tx.manuscriptCompilation.findFirst({ where: { snapshotId: { in: (await context.tx.manuscriptSnapshot.findMany({ where: { workspaceId: id }, select: { id: true } })).map(s => s.id) } }, orderBy: { createdAt: "desc" } });
          draft.compilerEngine ??= last?.toolchain?.match(/^(pdflatex|xelatex|lualatex)/)?.[1] ?? null; draft.compilerRelease ??= last?.texLiveVersion ?? null;
        }
      const engine = requestedEngine ?? (draft.compilerEngine as ManuscriptEngine | null) ?? "pdflatex";
      const texLiveVersion = requestedRelease ?? (draft.compilerRelease as import("@trend/shared-types").ManuscriptTexLive | null) ?? "2022";
      const row = await context.tx.manuscriptSnapshot.findFirst({ where: { id: snapshotId, workspaceId: id, projectId: context.project.id } });
      if (!row) throw AppError.notFound("Snapshot not found");
      compilerEndpoint(texLiveVersion);
      // Project lock in withWorkspace serializes duplicate requests, including multiple team members.
      const prior = await context.tx.manuscriptCompilation.findFirst({ where: { snapshotId, texLiveVersion, toolchain: { startsWith: engine }, status: { in: ["QUEUED", "COMPILING", "SUCCESS"] } }, orderBy: { createdAt: "desc" }, select: compilationSelect });
      if (prior) return { job: compilationDto(prior, row.sourceVersion), enqueue: prior.status === "QUEUED" };
      const snapshots = await context.tx.manuscriptSnapshot.findMany({ where: { workspaceId: id }, select: { id: true } });
      if (await context.tx.manuscriptCompilation.count({ where: { snapshotId: { in: snapshots.map(s => s.id) }, status: { in: ["QUEUED", "COMPILING"] } } })) throw AppError.conflict("A compilation is already in progress for this manuscript.");
      if (await context.tx.manuscriptCompilation.count({ where: { requestedById: context.actorId, status: { in: ["QUEUED", "COMPILING"] } } }) >= 3) throw AppError.tooMany("Wait for your existing compilations to finish.");
      const job = await context.tx.manuscriptCompilation.create({ data: { snapshotId, requestedById: context.actorId, texLiveVersion, status: "QUEUED", toolchain: engine }, select: compilationSelect });
      return { job: compilationDto(job, row.sourceVersion), enqueue: true };
    });
    if (result.enqueue) await enqueueCompilation(result.job.id);
    return result.job;
  },
  async compilations(projectId: string, actorId: string, id: string, snapshotId?: string) {
    const read = async (tx: Db) => {
      const snapshots = await tx.manuscriptSnapshot.findMany({ where: { workspaceId: id, projectId, ...(snapshotId ? { id: snapshotId } : {}) }, select: { id: true, sourceVersion: true } });
      const scope = { snapshotId: { in: snapshots.map(s => s.id) } };
      // A terminated worker cannot leave the UI permanently spinning.
      await tx.manuscriptCompilation.updateMany({ where: { ...scope, status: { in: ["QUEUED", "COMPILING"] }, createdAt: { lt: new Date(Date.now() - 15 * 60000) } }, data: { status: "FAILED", completedAt: new Date(), diagnostics: "Compilation timed out. Please compile again." } });
      const latest = await tx.manuscriptCompilation.findFirst({ where: scope, orderBy: { createdAt: "desc" }, select: compilationSelect });
      const successful = await tx.manuscriptCompilation.findFirst({ where: { ...scope, status: "SUCCESS" }, orderBy: { createdAt: "desc" }, select: compilationSelect });
      const dto = (row: typeof latest) => row ? compilationDto(row, snapshots.find(s => s.id === row.snapshotId)!.sourceVersion) : null;
      return { latest: dto(latest), successful: dto(successful) };
    };
    const state = snapshotId ? await withSnapshot(projectId, actorId, id, snapshotId, read) : await withWorkspace(projectId, actorId, {}, async context => { await manuscript(context, id); return read(context.tx); });
    // Repair the small commit/enqueue gap if the API process stopped after saving a queued job.
    if (state.latest?.status === "QUEUED") await enqueueCompilation(state.latest.id);
    return state;
  },
  async compilationPdf(projectId: string, actorId: string, id: string, compilationId: string) {
    const job = await getPrisma().manuscriptCompilation.findUnique({ where: { id: compilationId }, select: { snapshotId: true } });
    if (!job) throw AppError.notFound("PDF not found");
    return withSnapshot(projectId, actorId, id, job.snapshotId, async tx => {
      const output = await tx.manuscriptCompilation.findFirst({ where: { id: compilationId, status: "SUCCESS" }, select: { pdfData: true } });
      if (!output?.pdfData) throw AppError.notFound("PDF not found");
      return output.pdfData;
    });
  },
  async syncTex(projectId: string, actorId: string, id: string, compilationId: string, query: ManuscriptSyncQuery) {
    const job = await getPrisma().manuscriptCompilation.findUnique({ where: { id: compilationId }, select: { snapshotId: true } });
    if (!job) throw AppError.notFound("Compilation not found");
    const authorized = await withSnapshot(projectId, actorId, id, job.snapshotId, async (tx, snapshot) => {
      const row = await tx.manuscriptCompilation.findFirst({ where: { id: compilationId, status: "SUCCESS" }, select: { syncTexData: true, texLiveVersion: true } });
      if (!row?.syncTexData) throw AppError.badRequest("Compile again to enable SyncTeX for this PDF.");
      const files = (snapshot.manifest as unknown as ManuscriptManifest).files.filter(file => file.kind === "TEXT");
      if (query.direction === "forward" && !files.some(file => file.path === query.path)) throw AppError.notFound("Source not in this PDF version");
      return { bytes: row.syncTexData, files, texLiveVersion: row.texLiveVersion };
    });
    const endpoint = compilerEndpoint(authorized.texLiveVersion);
    const response = await fetch(new URL("synctex", `${endpoint.replace(/\/$/, "")}/`), { method: "POST", headers: { "Content-Type": "application/json", "X-Internal-Key": env.INTERNAL_SERVICE_KEY }, body: JSON.stringify({ ...query, synctex: Buffer.from(authorized.bytes).toString("base64") }), signal: AbortSignal.timeout(10000), redirect: "error" });
    if (!response.ok || !response.body) throw AppError.serviceUnavailable("SyncTeX unavailable");
    const chunks: Uint8Array[] = []; let size = 0;
    for await (const chunk of response.body) { size += chunk.length; if (size > 64000) throw AppError.serviceUnavailable("Invalid SyncTeX response"); chunks.push(chunk); }
    const raw = z.object({ locations: z.array(z.record(z.string().max(1000))).max(40) }).safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!raw.success) throw AppError.serviceUnavailable("SyncTeX unavailable");
    const locations: ManuscriptSyncLocation[] = [];
    for (const item of raw.data.locations) {
      if (query.direction === "forward") {
        const page = Number(item.Page), x = Number(item.h) + Number(item.W ?? 0) / 2, y = Math.max(0, Number(item.v) - Number(item.H ?? 0) / 2);
        if (Number.isInteger(page) && page > 0 && page <= 10000 && [x, y].every(value => Number.isFinite(value) && value >= 0 && value <= 20000)) locations.push({ page, x, y });
      } else {
        const path = item.Input?.replace(/^\.\//, ""), line = Number(item.Line);
        if (path && authorized.files.some(file => file.path === path) && Number.isInteger(line) && line > 0 && line <= 500000) locations.push({ path, line });
      }
    }
    // Authorization may have changed while the compiler was queried.
    await withSnapshot(projectId, actorId, id, job.snapshotId, async () => undefined);
    return locations;
  },
};

type Snapshot = NonNullable<Awaited<ReturnType<Db["manuscriptSnapshot"]["findUnique"]>>>;
async function withSnapshot<T>(projectId: string, actorId: string, id: string, snapshotId: string, run: (tx: Db, snapshot: Snapshot, grant: { member: boolean; mentorRelationshipId: string | null; reviewer: boolean; readOnly: boolean }) => Promise<T>) {
  return getPrisma().$transaction(async tx => {
    await lockProjectAccounts(tx, [actorId], projectId); await assertActiveProjectAccount(tx, actorId);
    const snapshot = await tx.manuscriptSnapshot.findFirst({ where: { id: snapshotId, workspaceId: id, projectId } });
    if (!snapshot) throw AppError.notFound("Snapshot not found");
    const [project, membership] = await Promise.all([tx.project.findUniqueOrThrow({ where: { id: projectId } }), tx.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: actorId } } })]);
    const member = project.ownerId === actorId || membership?.status === "ACTIVE";
    let mentorRelationshipId: string | null = null, reviewer = false;
    if (!member) {
      if (await canAccessProjectAsMentor(projectId, actorId, tx)) {
        const relationships = await tx.mentorRelationship.findMany({ where: { projectId, mentorUserId: actorId, status: "ACTIVE" }, select: { id: true } });
        const share = await tx.projectDiscussion.findFirst({ where: { projectId, targetKind: "MANUSCRIPT_SNAPSHOT", targetId: snapshotId, mentorRelationshipId: { in: relationships.map(r => r.id) } } });
        mentorRelationshipId = share?.mentorRelationshipId ?? null;
      }
      if (!mentorRelationshipId) {
        const revisions = await tx.submissionRevision.findMany({ where: { manuscriptSnapshotId: snapshotId }, select: { id: true } });
        reviewer = Boolean(await tx.reviewerAssignment.findFirst({ where: { reviewerId: actorId, artifactRevisionId: { in: revisions.map(r => r.id) }, status: { in: ["accepted", "in_review", "completed"] } } }));
        if (reviewer) await assertReviewerInTransaction(tx, actorId);
      }
      if (!mentorRelationshipId && !reviewer) throw AppError.notFound("Snapshot not found");
    }
    const draft = await tx.draftWorkspace.findFirst({ where: { id, projectId, writingMode: "LATEX", deletedAt: null }, select: { archivedAt: true } });
    if (!reviewer && !draft) throw AppError.notFound("Manuscript not found");
    return run(tx, snapshot, { member, mentorRelationshipId, reviewer, readOnly: project.status === "ARCHIVED" || Boolean(draft?.archivedAt) });
  }, { maxWait: 10000, timeout: 20000 });
}
function exportZip(manifest: ManuscriptManifest, assets: Map<string, Uint8Array>, metadata: object) {
  const output: Record<string, Uint8Array> = {};
  for (const file of manifest.files) {
    manuscriptPath(file.path, file.kind);
    if (file.kind === "TEXT") output[file.path] = strToU8(file.text ?? "");
    if (file.kind === "ASSET") {
      const bytes = assets.get(file.id); if (!bytes) throw AppError.conflict("A retained snapshot asset is unavailable"); output[file.path] = bytes;
    }
  }
  output["lumigap-version.json"] = strToU8(JSON.stringify({ ...metadata, title: manifest.title, mainFile: manifest.files.find(f => f.id === manifest.mainFileId)?.path }, null, 2));
  return zipSync(output);
}
