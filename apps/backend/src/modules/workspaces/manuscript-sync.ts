import * as Y from "yjs";
import { z } from "zod";
import { zipSync } from "fflate";
import { AppError } from "../../common/exceptions/app-error.js";
import { withWorkspace, workspaceEvent, jsonSnapshot, workspacePeople, workspacePerson } from "../projects/workspace-access.js";
import { readSourceZip, prepareFigure } from "./manuscript-import.js";
import { sourceDocument, sourceState, hashBytes, validateDocument } from "./manuscript-source.js";
import { manuscriptEvents } from "./manuscript-events.js";
import { assertCanExportProjectSource, researchLedgerService } from "../audit/research-ledger.service.js";
import { manuscriptPath } from "./manuscript-source.js";

export const remoteBindingSchema = z.object({ repository: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,99}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/), branch: z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/).refine(value => !value.includes("..") && value.split("/").every(part => part && !part.endsWith(".lock") && !part.endsWith("."))), head: z.string().regex(/^[a-f0-9]{40}$/), baseline: z.array(z.object({ path: z.string().min(1).max(240), sha: z.string().regex(/^[a-f0-9]{40}$/) }).strict()).max(200), isPrivate: z.boolean().optional(), expectedRevision: z.number().int().nonnegative(), expectedVersion: z.number().int().positive() }).strict();
export const syncBundleSchema = z.object({ mainFile: z.string().min(1).max(240), expectedVersion: z.coerce.number().int().positive(), clientKey: z.string().uuid() }).strict();
const bundleSchema = z.object({ files: z.array(z.object({ path: z.string().min(1).max(240), content: z.string().max(7_000_000).regex(/^[A-Za-z0-9+/]*={0,2}$/) }).strict()).min(1).max(200) }).strict();
export const manuscriptSync = {
  async binding(project: string, actor: string, id: string) {
    return withWorkspace(project, actor, {}, async context => {
      if (!await context.tx.draftWorkspace.findFirst({ where: { id, projectId: project, writingMode: "LATEX", deletedAt: null } })) throw AppError.notFound("Manuscript not found");
      return context.tx.manuscriptRemoteBinding.findUnique({ where: { workspaceId: id } });
    });
  },
  async bind(project: string, actor: string, id: string, input: z.infer<typeof remoteBindingSchema>) {
    const paths = new Set<string>();
    for (const file of input.baseline) {
      manuscriptPath(file.path, "FOLDER");
      if (paths.has(file.path.toLowerCase())) throw AppError.badRequest("Duplicate baseline path");
      paths.add(file.path.toLowerCase());
    }
    return withWorkspace(project, actor, { write: true }, async context => {
      assertCanExportProjectSource(context.project, actor);
      if (context.project.visibility === "PRIVATE" && input.isPrivate === false) throw AppError.forbidden("Cannot export private project manuscript to a public repository");

      const draft = await context.tx.draftWorkspace.findFirst({ where: { id, projectId: project, writingMode: "LATEX", archivedAt: null, deletedAt: null } });
      if (!draft) throw AppError.notFound("Writable manuscript not found");
      if (draft.version !== input.expectedVersion) throw AppError.conflict("Source changed. Inspect synchronization again.");
      const prior = await context.tx.manuscriptRemoteBinding.findUnique({ where: { workspaceId: id } });
      if ((prior?.revision ?? 0) !== input.expectedRevision) throw AppError.conflict("Another member updated the remote connection");
      const { expectedRevision: _revision, expectedVersion: _version, isPrivate: _priv, ...data } = input;
      const row = await context.tx.manuscriptRemoteBinding.upsert({ where: { workspaceId: id }, create: { ...data, baseline: jsonSnapshot(data.baseline), workspaceId: id, updatedById: actor }, update: { ...data, baseline: jsonSnapshot(data.baseline), updatedById: actor, revision: { increment: 1 } } });
      await workspaceEvent(context, "MANUSCRIPT_REMOTE_BASELINE", "MANUSCRIPT", id, { repository: input.repository, branch: input.branch, head: input.head });
      await researchLedgerService.record({ tx: context.tx, projectId: project, actorId: actor, eventType: "MANUSCRIPT_REMOTE_BOUND", resourceKind: "MANUSCRIPT", resourceId: id, currentVersionRef: input.head, visibility: "PROJECT_TEAM", retentionClass: "SECURITY_AUDIT", metadata: { repository: input.repository, branch: input.branch, isPrivate: input.isPrivate ?? true } });
      return row;
    });
  },
  async apply(project: string, actor: string, id: string, input: z.infer<typeof syncBundleSchema>, bytes: Uint8Array) {
    await withWorkspace(project, actor, { write: true }, async context => assertCanExportProjectSource(context.project, actor));
    let value: unknown; try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw AppError.badRequest("Invalid sync bundle"); }
    const parsed = bundleSchema.safeParse(value); if (!parsed.success) throw AppError.badRequest("Invalid sync bundle");
    const archive: Record<string, Uint8Array> = Object.create(null);
    for (const file of parsed.data.files) {
      if (Object.hasOwn(archive, file.path)) throw AppError.badRequest("Duplicate file path");
      const content = Buffer.from(file.content, "base64");
      if (content.toString("base64") !== file.content) throw AppError.badRequest("Invalid source encoding");
      archive[file.path] = content;
    }
    const sources = readSourceZip(zipSync(archive), input.mainFile);
    if (sources.ignored.length) throw AppError.badRequest("Unsupported sync files");
    for (const file of sources.files) if (file.kind === "ASSET") { const clean = await prepareFigure(file.path, file.bytes); file.bytes = clean.bytes; file.mimeType = clean.mimeType; }
    if (sources.files.reduce((sum, file) => sum + file.bytes.length, 0) > 20_000_000 || sources.files.some(file => sources.files.some(parent => file !== parent && file.path.toLowerCase().startsWith(parent.path.toLowerCase() + "/")))) throw AppError.badRequest("Source path or size limit exceeded");
    const receipt = hashBytes(bytes), updates: Array<{ fileId: string; update: string; sequence: number; fileVersion: number }> = [];
    const result = await withWorkspace(project, actor, { write: true }, async context => {
      assertCanExportProjectSource(context.project, actor);

      const draft = await context.tx.draftWorkspace.findFirst({ where: { id, projectId: project, writingMode: "LATEX", archivedAt: null, deletedAt: null } });
      if (!draft) throw AppError.notFound("Writable manuscript not found");
      const key = `manuscript:sync:${id}:${actor}:${input.clientKey}`;
      const prior = await context.tx.projectActivity.findFirst({ where: { projectId: project, idempotencyKey: key } });
      if (prior) {
        if ((prior.metadata as { checksum?: string }).checksum !== receipt || (prior.metadata as { mainFile?: string }).mainFile !== input.mainFile) throw AppError.conflict("Sync key already used");
        return { version: draft.version };
      }
      if (draft.version !== input.expectedVersion) throw AppError.conflict("Source changed. Inspect synchronization again.");
      const files = await context.tx.manuscriptFile.findMany({ where: { workspaceId: id, deletedAt: null } });
      if (sources.files.length + files.filter(file => file.kind === "FOLDER" && sources.files.some(source => source.path.toLowerCase().startsWith(file.path.toLowerCase() + "/"))).length > 200) throw AppError.badRequest("Manuscript file limit exceeded");
      // Preserve a complete recovery point before any incoming source changes.
      const saved = await context.tx.manuscriptSnapshot.findFirst({ where: { workspaceId: id, sourceVersion: draft.version } });
      if (!saved) throw AppError.conflict("Create a source snapshot before pulling remote changes");
      const names = new Set(sources.files.map(file => file.path.toLowerCase()));
      let mainFileId = "";
      for (const source of sources.files) {
        const existing = files.find(file => file.path.toLowerCase() === source.path.toLowerCase());
        if (existing && existing.kind !== source.kind) throw AppError.conflict("File type conflict");
        let fileId: string;
        if (!existing) {
          const state = source.kind === "TEXT" ? sourceState(source.text!) : null;
          const created = await context.tx.manuscriptFile.create({ data: { workspaceId: id, path: source.path, kind: source.kind, crdtState: state, assetData: source.kind === "ASSET" ? new Uint8Array(source.bytes) : null, sizeBytes: source.bytes.length, checksum: hashBytes(state ?? source.bytes), mimeType: source.mimeType, createdById: actor } }); fileId = created.id;
        } else {
          fileId = existing.id;
          if (source.kind === "TEXT") {
            const doc = sourceDocument(existing.crdtState);
            try {
              const text = doc.getText("source"), vector = Y.encodeStateVector(doc);
              if (text.toString() !== source.text) {
                // Retain CRDT identity; incoming changes must converge with open rooms.
                const before = text.toString(), after = source.text!;
                let from = 0, suffix = 0;
                while (from < before.length && from < after.length && before[from] === after[from]) from++;
                while (suffix < before.length - from && suffix < after.length - from && before[before.length - suffix - 1] === after[after.length - suffix - 1]) suffix++;
                doc.transact(() => { text.delete(from, before.length - from - suffix); text.insert(from, after.slice(from, after.length - suffix)); });
                const state = validateDocument(doc), update = new Uint8Array(Y.encodeStateAsUpdate(doc, vector));
                const saved = await context.tx.manuscriptFile.update({ where: { id: fileId }, data: { crdtState: state, checksum: hashBytes(state), sizeBytes: source.bytes.length, path: source.path, sequence: { increment: 1 }, version: { increment: 1 } } });
                await context.tx.manuscriptUpdate.create({ data: { fileId, actorId: actor, clientSessionId: input.clientKey, clientSequence: 1, serverSequence: saved.sequence, update, checksum: hashBytes(update) } });
                updates.push({ fileId, update: Buffer.from(update).toString("base64"), sequence: saved.sequence, fileVersion: saved.version });
              }
            } finally { doc.destroy(); }
          } else if (hashBytes(source.bytes) !== existing.checksum) await context.tx.manuscriptFile.update({ where: { id: fileId }, data: { assetData: new Uint8Array(source.bytes), checksum: hashBytes(source.bytes), sizeBytes: source.bytes.length, mimeType: source.mimeType, version: { increment: 1 } } });
          if (existing.path !== source.path) await context.tx.manuscriptFile.update({ where: { id: fileId }, data: { path: source.path } });
        }
        if (source.path === sources.mainFile) mainFileId = fileId;
      }
      for (const file of files) if (file.kind !== "FOLDER" && !names.has(file.path.toLowerCase())) await context.tx.manuscriptFile.update({ where: { id: file.id }, data: { deletedAt: new Date(), version: { increment: 1 } } });
      // Remove empty folder records that would conflict with incoming files.
      for (const folder of files.filter(file => file.kind === "FOLDER")) if (!sources.files.some(file => file.path.toLowerCase().startsWith(folder.path.toLowerCase() + "/"))) await context.tx.manuscriptFile.update({ where: { id: folder.id }, data: { deletedAt: new Date() } });
      const existingComments = await context.tx.projectDiscussion.findMany({ where: { projectId: project, targetKind: "MANUSCRIPT", targetId: id } });
      for (const comment of existingComments) {
        const ctx = (comment.context ?? {}) as Record<string, unknown>;
        if (ctx.fileId && typeof ctx.fileId === "string") {
          const fileRecord = files.find(f => f.id === ctx.fileId);
          const wasDeleted = fileRecord && !names.has(fileRecord.path.toLowerCase());
          if (wasDeleted && !ctx.historicalSnapshotId) {
            await context.tx.projectDiscussion.update({
              where: { id: comment.id },
              data: { context: jsonSnapshot({ ...ctx, historicalSnapshotId: saved.id, originalPath: fileRecord.path }) },
            });
          }
        }
      }
      const row = await context.tx.draftWorkspace.update({ where: { id }, data: { mainFileId, version: { increment: 1 } } });
      await workspaceEvent(context, "MANUSCRIPT_REMOTE_APPLIED", "MANUSCRIPT", id, { checksum: receipt, mainFile: input.mainFile }, key);
      await researchLedgerService.record({ tx: context.tx, projectId: project, actorId: actor, eventType: "MANUSCRIPT_REMOTE_APPLIED", resourceKind: "MANUSCRIPT", resourceId: id, checksumSha256: receipt, visibility: "PROJECT_TEAM", retentionClass: "SECURITY_AUDIT", metadata: { mainFile: input.mainFile } });
      return { version: row.version };
    });
    for (const update of updates) manuscriptEvents.emit("source", { projectId: project, manuscriptId: id, ...update });
    manuscriptEvents.emit("changed", { projectId: project, manuscriptId: id });
    return result;
  },
  async history(project: string, actor: string, id: string) {
    return withWorkspace(project, actor, {}, async context => {
      const draft = await context.tx.draftWorkspace.findFirst({ where: { id, projectId: project, writingMode: "LATEX", deletedAt: null } });
      if (!draft) throw AppError.notFound("Manuscript not found");
      const events = await context.tx.researchEvidenceEvent.findMany({
        where: {
          projectId: project,
          resourceId: id,
          eventType: { in: ["MANUSCRIPT_REMOTE_BOUND", "MANUSCRIPT_REMOTE_APPLIED", "MANUSCRIPT_SOURCE_EXPORTED"] },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      const people = await workspacePeople(context.tx, events.map(e => e.actorId).filter(Boolean) as string[]);
      return events.map(event => ({
        id: event.id,
        eventType: event.eventType,
        currentVersionRef: event.currentVersionRef,
        createdAt: event.createdAt.toISOString(),
        actor: event.actorId ? workspacePerson(people, event.actorId) : null,
        metadata: (event.metadata ?? {}) as Record<string, unknown>,
      }));
    });
  },
};
