import * as Y from "yjs";
import type { CreateManuscriptSuggestion, ManuscriptSuggestion } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { withWorkspace, workspaceEvent, workspacePeople, workspacePerson, type WorkspaceContext } from "../projects/workspace-access.js";
import { hashBytes, sourceDocument, validateDocument } from "./manuscript-source.js";
import { notificationService } from "../notifications/notification.service.js";

async function draft(context: WorkspaceContext, id: string, write = false) {
  const row = await context.tx.draftWorkspace.findFirst({ where: { id, projectId: context.project.id, writingMode: "LATEX", deletedAt: null } });
  if (!row) throw AppError.notFound("Manuscript not found");
  if (write && row.archivedAt) throw AppError.conflict("Archived manuscripts are read-only");
}
type Anchor = { start: Y.RelativePosition; end: Y.RelativePosition; before: string; after: string };
export function suggestionRange(doc: Y.Doc, anchor: Anchor, original: string) {
  const text = doc.getText("source"), source = text.toString();
  const start = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(anchor.start), doc);
  const end = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(anchor.end), doc);
  if (!start || !end || start.type !== text || end.type !== text || end.index < start.index || source.slice(start.index, end.index) !== original || source.slice(Math.max(0, start.index - anchor.before.length), start.index) !== anchor.before || source.slice(end.index, end.index + anchor.after.length) !== anchor.after) throw AppError.conflict("The suggested source changed. Review it and create a new suggestion.");
  return { from: start.index, to: end.index };
}
export const manuscriptSuggestions = {
  async list(project: string, actor: string, id: string): Promise<ManuscriptSuggestion[]> {
    return withWorkspace(project, actor, {}, async context => {
      await draft(context, id);
      const rows = await context.tx.manuscriptSuggestion.findMany({ where: { workspaceId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 500 });
      const people = await workspacePeople(context.tx, rows.flatMap(row => [row.authorId, ...(row.resolvedById ? [row.resolvedById] : [])]));
      const files = await context.tx.manuscriptFile.findMany({ where: { workspaceId: id, id: { in: rows.map(row => row.fileId) } }, select: { id: true, path: true } });
      return rows.map(row => ({ id: row.id, anchor: row.status === "PENDING" ? row.anchor as unknown as ManuscriptSuggestion["anchor"] : null, fileId: row.fileId, path: files.find(file => file.id === row.fileId)?.path ?? "", original: row.original, replacement: row.replacement, note: row.note, revision: row.revision, status: row.status as ManuscriptSuggestion["status"], createdAt: row.createdAt.toISOString(), resolvedAt: row.resolvedAt?.toISOString() ?? null, author: workspacePerson(people, row.authorId), resolvedBy: row.resolvedById ? workspacePerson(people, row.resolvedById) : null }));
    });
  },
  async create(project: string, actor: string, id: string, input: CreateManuscriptSuggestion) {
    return withWorkspace(project, actor, { write: true }, async context => {
      await draft(context, id, true);
      const prior = await context.tx.manuscriptSuggestion.findUnique({ where: { workspaceId_authorId_clientKey: { workspaceId: id, authorId: context.actorId, clientKey: input.clientKey } } });
      if (prior) {
        const saved = prior.anchor as unknown as Anchor & { from: number; to: number };
        if (prior.fileId !== input.fileId || prior.original !== input.original || prior.replacement !== input.replacement || prior.note !== input.note || prior.sourceSequence !== input.sourceSequence || saved.from !== input.from || saved.to !== input.to) throw AppError.conflict("This suggestion request key was already used");
        return { id: prior.id, revision: prior.revision };
      }
      if (input.from > input.to || input.original === input.replacement || input.original.length > 100000 || input.replacement.length > 100000) throw AppError.badRequest("Choose a changed source range up to 100000 characters");
      if (await context.tx.manuscriptSuggestion.count({ where: { workspaceId: id } }) >= 500) throw AppError.badRequest("Suggestion history limit reached; create a new draft from a snapshot");
      const file = await context.tx.manuscriptFile.findFirst({ where: { id: input.fileId, workspaceId: id, kind: "TEXT", deletedAt: null } });
      if (!file?.crdtState) throw AppError.notFound("Source file not found");
      const doc = sourceDocument(file.crdtState);
      try {
        const text = doc.getText("source"), source = text.toString();
        if (file.sequence !== input.sourceSequence || input.to > source.length || source.slice(input.from, input.to) !== input.original) throw AppError.conflict("Source changed before the suggestion was saved");
        const anchor = { from: input.from, to: input.to, start: Y.createRelativePositionFromTypeIndex(text, input.from, 0), end: Y.createRelativePositionFromTypeIndex(text, input.to, -1), before: source.slice(Math.max(0, input.from - 32), input.from), after: source.slice(input.to, input.to + 32) };
        const row = await context.tx.manuscriptSuggestion.create({ data: { workspaceId: id, fileId: file.id, authorId: context.actorId, clientKey: input.clientKey, original: input.original, replacement: input.replacement, note: input.note, anchor: JSON.parse(JSON.stringify(anchor)), sourceSequence: input.sourceSequence } });
        await workspaceEvent(context, "MANUSCRIPT_SUGGESTION_CREATED", "MANUSCRIPT", id, { suggestionId: row.id, fileId: file.id });
        return { id: row.id, revision: row.revision };
      } finally { doc.destroy(); }
    });
  },
  async update(project: string, actor: string, id: string, suggestionId: string, input: { expectedRevision: number; replacement: string }) {
    return withWorkspace(project, actor, { write: true }, async context => {
      await draft(context, id, true);
      const row = await context.tx.manuscriptSuggestion.findFirst({ where: { id: suggestionId, workspaceId: id, authorId: context.actorId } });
      if (!row) throw AppError.notFound("Suggestion not found");
      if (row.status !== "PENDING") throw AppError.conflict("This suggestion was already resolved");
      if (row.revision !== input.expectedRevision) {
        if (row.revision === input.expectedRevision + 1 && row.replacement === input.replacement) return { id: row.id, revision: row.revision };
        throw AppError.conflict("The proposal was updated elsewhere. Review it before retrying.");
      }
      if (input.replacement.length > 100000) throw AppError.badRequest("Proposal limit exceeded");
      const file = await context.tx.manuscriptFile.findFirst({ where: { id: row.fileId, workspaceId: id, deletedAt: null, kind: "TEXT" } });
      if (!file?.crdtState) throw AppError.conflict("The source file was removed");
      const doc = sourceDocument(file.crdtState);
      try { suggestionRange(doc, row.anchor as unknown as Anchor, row.original); } finally { doc.destroy(); }
      if (row.replacement === input.replacement) return { id: row.id, revision: row.revision };
      const saved = await context.tx.manuscriptSuggestion.update({ where: { id: row.id }, data: { replacement: input.replacement, revision: { increment: 1 } } });
      await workspaceEvent(context, "MANUSCRIPT_SUGGESTION_UPDATED", "MANUSCRIPT", id, { suggestionId: row.id, revision: saved.revision, fileId: row.fileId });
      return { id: saved.id, revision: saved.revision };
    });
  },
  async resolve(project: string, actor: string, id: string, suggestionId: string, status: "ACCEPTED" | "REJECTED", expectedRevision?: number) {
    return withWorkspace(project, actor, { write: true }, async context => {
      await draft(context, id, true);
      const row = await context.tx.manuscriptSuggestion.findFirst({ where: { id: suggestionId, workspaceId: id } });
      if (!row) throw AppError.notFound("Suggestion not found");
      if (expectedRevision !== undefined && row.revision !== expectedRevision) throw AppError.conflict("The proposal changed since you reviewed it. Review the latest revision first.");
      if (row.status !== "PENDING") {
        if (row.status === status) return { id: row.id, source: null };
        throw AppError.conflict("This suggestion was already resolved");
      }
      let source = null;
      if (status === "ACCEPTED") {
        if (row.original === row.replacement) throw AppError.conflict("There are no changes to accept");
        const file = await context.tx.manuscriptFile.findFirst({ where: { id: row.fileId, workspaceId: id, deletedAt: null, kind: "TEXT" } });
        if (!file?.crdtState) throw AppError.conflict("The source file was removed");
        const doc = sourceDocument(file.crdtState);
        try {
          const range = suggestionRange(doc, row.anchor as unknown as Anchor, row.original), text = doc.getText("source"), vector = Y.encodeStateVector(doc);
          doc.transact(() => { text.delete(range.from, range.to - range.from); text.insert(range.from, row.replacement); });
          const state = validateDocument(doc), update = Y.encodeStateAsUpdate(doc, vector), sizeBytes = Buffer.byteLength(text.toString());
          const total = await context.tx.manuscriptFile.aggregate({ where: { workspaceId: id, deletedAt: null }, _sum: { sizeBytes: true } });
          if ((total._sum.sizeBytes ?? 0) + sizeBytes - file.sizeBytes > 20_000_000) throw AppError.badRequest("Manuscript quota exceeded");
          const saved = await context.tx.manuscriptFile.update({ where: { id: file.id }, data: { crdtState: state, checksum: hashBytes(state), sizeBytes, sequence: { increment: 1 }, version: { increment: 1 } } });
          await context.tx.manuscriptUpdate.create({ data: { fileId: file.id, actorId: context.actorId, clientSessionId: row.id, clientSequence: 1, serverSequence: saved.sequence, update: new Uint8Array(update), checksum: hashBytes(update) } });
          await context.tx.draftWorkspace.update({ where: { id }, data: { version: { increment: 1 } } });
          source = { fileId: file.id, update: Buffer.from(update).toString("base64"), sequence: saved.sequence, fileVersion: saved.version };
        } finally { doc.destroy(); }
      }
      await context.tx.manuscriptSuggestion.update({ where: { id: row.id }, data: { status, resolvedById: context.actorId, resolvedAt: new Date() } });
      await workspaceEvent(context, `MANUSCRIPT_SUGGESTION_${status}`, "MANUSCRIPT", id, { suggestionId: row.id, authorId: row.authorId, fileId: row.fileId });
      if (row.authorId !== context.actorId) {
        const member = await context.tx.projectMember.findUnique({ where: { projectId_userId: { projectId: context.project.id, userId: row.authorId } } });
        if (row.authorId === context.project.ownerId || member?.status === "ACTIVE") await notificationService.create({ userId: row.authorId, type: `MANUSCRIPT_SUGGESTION_${status}`, title: "Manuscript suggestion reviewed", message: status === "ACCEPTED" ? "Your proposed manuscript edit was accepted." : "Your proposed manuscript edit was declined.", targetKind: "project", targetId: context.project.id, eventKey: `MANUSCRIPT_SUGGESTION:${row.id}:${status}`, emailStatus: "SKIPPED" }, context.tx);
      }
      return { id: row.id, source };
    });
  },
};
