import { createHash } from "node:crypto";
import sharp from "sharp";
import { unzipSync } from "fflate";
import { AppError } from "../../common/exceptions/app-error.js";
import { assertPdfMagic } from "../../common/middleware/upload.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import type { Prisma } from "../../generated/prisma/client.js";
import type { MentorRole } from "@trend/shared-types";
import { assertAcceptingNewMentorships, assertVerifiedLecturer } from "./academic-relationship-access.js";

type Db = Prisma.TransactionClient;
export const attachmentFields = { id: true, fileName: true, mimeType: true, byteSize: true } as const;
export const invitationMimeTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
export type InvitationDirection = "PROJECT_TO_LECTURER" | "LECTURER_TO_PROJECT";

async function senderContext(db: Db, projectInput: string, actorInput: string, direction: InvitationDirection, readOnly = false) {
  const lookup = (value: string) => { const parsed = parseDatabaseId(value); if (!parsed) throw AppError.badRequest("Invalid identifier"); return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value }; };
  const [p, a] = await Promise.all([db.project.findUnique({ where: lookup(projectInput) }), db.user.findUnique({ where: lookup(actorInput) })]);
  if (!p || !a?.isActive || a.accountStatus !== "ACTIVE" || !a.emailVerifiedAt) throw AppError.forbidden();
  await db.$queryRaw`SELECT id FROM projects WHERE id=${p.id}::uuid FOR UPDATE`;
  const live = await db.project.findUniqueOrThrow({ where: { id: p.id } });
  if (!readOnly && ["ARCHIVED", "COMPLETED"].includes(live.status)) throw AppError.conflict("This project is read-only");
  if (direction === "PROJECT_TO_LECTURER") {
    if (live.ownerId !== a.id) throw AppError.forbidden("Only the project owner can prepare official invitations");
  } else {
    if (readOnly) await assertVerifiedLecturer(db, a.id); else await assertAcceptingNewMentorships(db, a.id);
    if (live.mentorshipDiscovery !== "SEEKING_MENTOR") throw AppError.forbidden("This project is not seeking mentorship offers");
    if (live.ownerId === a.id || await db.projectMember.count({ where: { projectId: p.id, userId: a.id, status: "ACTIVE" } })) throw AppError.forbidden();
  }
  return { projectId: p.id, userId: a.id };
}

export async function invitationFiles(db: Db, projectId: string, userId: string, ids: string[]) {
  if (ids.length > 5 || new Set(ids).size !== ids.length) throw AppError.badRequest("Choose at most five different invitation files");
  const files = await db.mentorshipAttachment.findMany({ where: { id: { in: ids }, projectId, uploadedById: userId }, select: attachmentFields });
  if (files.length !== ids.length) throw AppError.forbidden("Invitation files must belong to you and this project");
  if (files.reduce((sum, file) => sum + file.byteSize, 0) > 20 * 1024 * 1024) throw AppError.badRequest("Invitation attachments must total at most 20 MB");
  return files;
}

async function validateContent(file: { buffer: Buffer; mimetype: string; originalname: string }) {
  if (!file.buffer.length || file.buffer.length > 5 * 1024 * 1024 || !invitationMimeTypes.includes(file.mimetype)) throw AppError.badRequest("Use PDF, DOCX, JPEG, PNG or WebP files up to 5 MB");
  if (file.mimetype === "application/pdf") assertPdfMagic(file.buffer);
  else if (file.mimetype.startsWith("image/")) {
    try {
      const decoder = sharp(file.buffer, { limitInputPixels: 25_000_000, animated: false });
      const metadata = await decoder.metadata();
      if (`image/${metadata.format}` !== file.mimetype || (metadata.pages ?? 1) > 1) throw new Error("Unexpected image format");
      // Decode and re-encode to reject truncated images and strip embedded metadata.
      file.buffer = await decoder.toBuffer();
    } catch { throw AppError.badRequest("Uploaded image is invalid or too large"); }
  } else {
    try {
      let expanded = 0, entries = 0;
      const document = unzipSync(file.buffer, { filter: entry => {
        expanded += entry.originalSize; entries++;
        if (expanded > 25 * 1024 * 1024 || entries > 1000 || /vbaProject|\.bin$/i.test(entry.name)) throw new Error("Unsafe document");
        return entry.name === "[Content_Types].xml" || entry.name === "word/document.xml";
      } });
      if (!document["[Content_Types].xml"] || !document["word/document.xml"]) throw new Error("Invalid DOCX");
    } catch { throw AppError.badRequest("Uploaded document is not a valid DOCX file"); }
  }
  if (file.buffer.length > 5 * 1024 * 1024) throw AppError.badRequest("File exceeds 5 MB");
  return file;
}

export const mentorshipContentService = {
  async upload(projectId: string, actorId: string, direction: InvitationDirection, input: { buffer: Buffer; mimetype: string; originalname: string }) {
    // Authorize before image/ZIP processing and check again under the write lock.
    await getPrisma().$transaction(tx => senderContext(tx, projectId, actorId, direction));
    const file = await validateContent(input), sha256 = createHash("sha256").update(file.buffer).digest("hex");
    const fileName = file.originalname.split(/[\\/]/).pop()!.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 180) || "attachment";
    return getPrisma().$transaction(async tx => {
      const context = await senderContext(tx, projectId, actorId, direction);
      const existing = await tx.mentorshipAttachment.findFirst({ where: { projectId: context.projectId, uploadedById: context.userId, sha256, mimeType: file.mimetype }, select: attachmentFields });
      if (existing) return existing;
      const size = await tx.mentorshipAttachment.aggregate({ where: { projectId: context.projectId, uploadedById: context.userId }, _sum: { byteSize: true } });
      if ((size._sum.byteSize ?? 0) + file.buffer.length > 100 * 1024 * 1024) throw AppError.conflict("Invitation file storage limit reached for this project");
      return tx.mentorshipAttachment.create({ data: { projectId: context.projectId, uploadedById: context.userId, fileName, mimeType: file.mimetype, byteSize: file.buffer.length, sha256, content: new Uint8Array(file.buffer) }, select: attachmentFields });
    });
  },
  async draft(projectId: string, actorId: string, direction: InvitationDirection, input?: { message: string; mentorRole: MentorRole; attachmentIds: string[]; expectedVersion: number }) {
    return getPrisma().$transaction(async tx => {
      const context = await senderContext(tx, projectId, actorId, direction, !input);
      const where = { projectId_userId_direction: { ...context, direction } };
      const existing = await tx.mentorshipDraft.findUnique({ where });
      if (input && (existing?.version ?? 0) !== input.expectedVersion) throw AppError.conflict("Your invitation draft changed in another tab. Reload it before saving");
      if (input) await invitationFiles(tx, context.projectId, context.userId, input.attachmentIds);
      const row = input ? await tx.mentorshipDraft.upsert({ where, create: { ...context, direction, message: input.message, mentorRole: input.mentorRole, attachmentIds: input.attachmentIds }, update: { message: input.message, mentorRole: input.mentorRole, attachmentIds: input.attachmentIds, version: { increment: 1 } } }) : existing;
      return { message: row?.message ?? "", mentorRole: (row?.mentorRole ?? "PRIMARY") as MentorRole, version: row?.version ?? 0,
        attachments: row ? await invitationFiles(tx, context.projectId, context.userId, row.attachmentIds) : [], updatedAt: row?.updatedAt.toISOString() };
    });
  },
  async file(attachmentId: string, actorId: string) {
    return getPrisma().$transaction(async tx => {
      const parsed = parseDatabaseId(actorId);
      if (!parsed) throw AppError.forbidden();
      const user = await tx.user.findUnique({ where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value } });
      if (!user?.isActive || user.accountStatus !== "ACTIVE" || !user.emailVerifiedAt) throw AppError.forbidden();
      const file = await tx.mentorshipAttachment.findUnique({ where: { id: attachmentId }, select: { ...attachmentFields, projectId: true, uploadedById: true } });
      if (!file) throw AppError.notFound("Invitation file not found");
      await tx.$queryRaw`SELECT id FROM projects WHERE id=${file.projectId}::uuid FOR SHARE`;
      const project = await tx.project.findUniqueOrThrow({ where: { id: file.projectId } });
      const links = await tx.mentorshipRequestAttachment.findMany({ where: { attachmentId }, select: { requestId: true } });
      const shared = await tx.mentorshipRequest.count({ where: { id: { in: links.map(l => l.requestId) }, projectId: file.projectId,
        ...(project.ownerId === user.id ? {} : { OR: [{ requestedBy: user.id }, { mentorUserId: user.id }] }) } });
      const isOwner = project.ownerId === user.id;
      // Staged files are private to their author while authorized for this project.
      const authorMember = file.uploadedById === user.id && await tx.projectMember.count({ where: { projectId: file.projectId, userId: user.id, status: "ACTIVE" } });
      if (!shared && !(file.uploadedById === user.id && (isOwner || authorMember || project.mentorshipDiscovery === "SEEKING_MENTOR"))) throw AppError.notFound("Invitation file not found");
      return tx.mentorshipAttachment.findUniqueOrThrow({ where: { id: attachmentId } });
    });
  },
};
