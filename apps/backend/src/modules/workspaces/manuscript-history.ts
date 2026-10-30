import { Prisma } from "../../generated/prisma/client.js";
import { jsonSnapshot } from "../projects/workspace-access.js";
import { writingBaseline, type WritingSpan, type DeletedWritingRun } from "./manuscript-writing.calculator.js";

type Db = Prisma.TransactionClient;
type RetainedHistory = {
  format: 1;
  settings?: { engine: string | null; release: string | null; template: string | null };
  states: Record<string, string>;
  writingSpans?: Record<string, WritingSpan[]>;
  writingRecovery?: Record<string, DeletedWritingRun[]>;
  comments: Array<{ id: string; title: string; body: string; category: string; status: string; conclusion: string; authorId: string; context: Record<string, unknown>; createdAt: string }>;
  messages: Array<{ id: string; threadId: string; senderId: string; content: string; createdAt: string; replyToId: string | null }>;
  suggestions: Array<{ fileId: string; authorId: string; original: string; replacement: string; note: string; anchor: Prisma.InputJsonValue; status: string; revision: number; resolvedById: string | null; resolvedAt: string | null; createdAt: string }>;
};

/** Team-only state is deliberately outside the manifest exported/shared with reviewers. */
export async function captureHistory(tx: Db, projectId: string, workspaceId: string, files: Array<{ id: string; crdtState: Uint8Array | null; writingBaseline?: unknown }>, settings: NonNullable<RetainedHistory["settings"]>) {
  const comments = await tx.projectDiscussion.findMany({ where: { projectId, targetKind: "MANUSCRIPT", targetId: workspaceId, mentorRelationshipId: null }, orderBy: { createdAt: "asc" }, take: 201 });
  const messages = await tx.projectTeamMessage.findMany({ where: { projectId, threadId: { in: comments.map(row => row.id) }, isDeleted: false }, orderBy: { createdAt: "asc" }, take: 1001 });
  const suggestions = await tx.manuscriptSuggestion.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" }, take: 501 });
  // Never silently promise a complete restoration for a truncated record.
  if (comments.length > 200 || messages.length > 1000 || suggestions.length > 500 || files.reduce((sum, file) => sum + (file.crdtState?.byteLength ?? 0), 0) > 40_000_000 || suggestions.reduce((sum, row) => sum + Buffer.byteLength(row.original) + Buffer.byteLength(row.replacement), 0) > 20_000_000) return null;
  const writing = await captureWritingHistory(tx, files);
  if (!writing) return null;
  return jsonSnapshot({ ...writing, settings,
    comments: comments.map(({ id, title, body, category, status, conclusion, authorId, context, createdAt }) => ({ id, title, body, category, status, conclusion, authorId, context, createdAt })),
    messages: messages.map(({ id, threadId, senderId, content, createdAt, replyToId }) => ({ id, threadId, senderId, content, createdAt, replyToId })),
    suggestions: suggestions.map(({ fileId, authorId, original, replacement, note, anchor, status, revision, resolvedById, resolvedAt, createdAt }) => ({ fileId, authorId, original, replacement, note, anchor, status, revision, resolvedById, resolvedAt, createdAt })),
  });
}
type WritingHistory = Pick<RetainedHistory, "format" | "states" | "writingSpans" | "writingRecovery">;
export async function captureWritingHistory(tx: Db, files: Array<{ id: string; crdtState: Uint8Array | null; writingBaseline?: unknown }>): Promise<WritingHistory | null> {
  if (files.reduce((sum, file) => sum + (file.crdtState?.byteLength ?? 0), 0) > 40_000_000) return null;
  const writingSpans: Record<string, WritingSpan[]> = Object.fromEntries(files.map(f => [f.id, [...writingBaseline(f.writingBaseline).spans]]));
  const writingRecovery = Object.fromEntries(files.map(f => [f.id, writingBaseline(f.writingBaseline).deleted]));
  let cursor: string | undefined, size = Buffer.byteLength(JSON.stringify({ writingSpans, writingRecovery }));
  if (size > 10_000_000) return null;
  for (;;) {
    const updates = await tx.manuscriptUpdate.findMany({ where: { fileId: { in: files.map(f => f.id) }, writingSpans: { not: Prisma.JsonNull } }, orderBy: { id: "asc" }, take: 500, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true, fileId: true, writingSpans: true, createdAt: true } });
    if (!updates.length) break;
    for (const update of updates) if (Array.isArray(update.writingSpans)) {
      size += Buffer.byteLength(JSON.stringify(update.writingSpans));
      if (size > 10_000_000) return null;
      for (const span of update.writingSpans as WritingSpan[]) writingSpans[update.fileId]!.push({ ...span, ...(span.userId ? { recordedAt: update.createdAt.toISOString() } : {}) });
    }
    cursor = updates.at(-1)!.id;
  }
  return { format: 1, states: Object.fromEntries(files.filter(f => f.crdtState).map(f => [f.id, Buffer.from(f.crdtState!).toString("base64")])), writingSpans, writingRecovery };
}
export function retainedWritingHistory(snapshot: { collaborationState: unknown; writingState: unknown }): WritingHistory | null {
  const value = snapshot.collaborationState ?? snapshot.writingState;
  return value && typeof value === "object" && "format" in value && value.format === 1 ? value as WritingHistory : null;
}
export function retainedHistory(value: unknown): RetainedHistory | null {
  return value && typeof value === "object" && "format" in value && value.format === 1 ? value as RetainedHistory : null;
}
export function historySummary(value: unknown) {
  const saved = retainedHistory(value);
  return saved ? { comments: saved.comments.length, suggestions: saved.suggestions.length } : null;
}
export async function restoreHistory(tx: Db, projectId: string, workspaceId: string, snapshotId: string, saved: RetainedHistory, files: Map<string, string>) {
  const threads = new Map<string, string>(), messageIds = new Map(saved.messages.map(message => [message.id, crypto.randomUUID()]));
  for (const comment of saved.comments) {
    const { fileId, snapshotId: _oldSnapshot, receipt: _receipt, ...context } = comment.context;
    const row = await tx.projectDiscussion.create({ data: { projectId, targetKind: "MANUSCRIPT", targetId: workspaceId, title: comment.title, body: comment.body, category: comment.category, status: comment.status, conclusion: comment.conclusion, authorId: comment.authorId, clientKey: crypto.randomUUID(), createdAt: new Date(comment.createdAt), context: jsonSnapshot({ ...context, ...(typeof fileId === "string" && files.has(fileId) ? { fileId: files.get(fileId) } : {}), restoredFromSnapshot: snapshotId }) } });
    threads.set(comment.id, row.id);
  }
  // Insert first, then resolve reply links so arbitrary reply order is safe.
  for (const message of saved.messages) if (threads.has(message.threadId)) await tx.projectTeamMessage.create({ data: { id: messageIds.get(message.id), projectId, threadId: threads.get(message.threadId), senderId: message.senderId, content: message.content, createdAt: new Date(message.createdAt), clientKey: crypto.randomUUID() } });
  for (const message of saved.messages) if (threads.has(message.threadId) && message.replyToId && messageIds.has(message.replyToId)) await tx.projectTeamMessage.update({ where: { id: messageIds.get(message.id) }, data: { replyToId: messageIds.get(message.replyToId) } });
  for (const suggestion of saved.suggestions) {
    const fileId = files.get(suggestion.fileId); if (!fileId) continue;
    await tx.manuscriptSuggestion.create({ data: { ...suggestion, workspaceId, fileId, clientKey: crypto.randomUUID(), sourceSequence: 0, createdAt: new Date(suggestion.createdAt), resolvedAt: suggestion.resolvedAt ? new Date(suggestion.resolvedAt) : null } });
  }
}
