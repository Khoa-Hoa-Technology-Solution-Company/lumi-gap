import { env } from "../../config/env.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { verificationEvidenceStorage } from "./verification-evidence-storage.service.js";
import type { Prisma } from "../../generated/prisma/client.js";

export async function cleanupVerificationEvidence(now = new Date()) {
  const db = getPrisma();
  // Unconsumed objects already have a durable deletion intent from storage.save().
  await db.verificationEvidenceUpload.deleteMany({ where: { expiresAt: { lte: now } } });
  const positionCutoff = new Date(now.getTime() - env.ACADEMIC_VERIFICATION_EVIDENCE_RETENTION_DAYS * 86_400_000);
  const affiliationCutoff = new Date(now.getTime() - env.AFFILIATION_EVIDENCE_RETENTION_DAYS * 86_400_000);
  const expired = await db.verificationEvidence.findMany({
    where: { OR: [{ evidenceStorageKey: { not: null } }, { sources: { some: { OR: [{ storageKey: { not: null } }, { additionalExplanation: { not: null } }, { reviewerNote: { not: null } }] } } }, ...["identityBindingReference", "adminNote", "additionalNote", "studentId", "staffId"].map(field => ({ metadata: { path: [field], string_contains: "" } }))], AND: [
      { OR: [{ status: { in: ["VERIFIED", "REJECTED", "INVALIDATED", "EXPIRED"] } }, { status: "NEEDS_MORE_INFORMATION", supersededAt: { not: null } }] },
      { OR: [{ verificationType: "POSITION", reviewedAt: { lte: positionCutoff } }, { verificationType: { not: "POSITION" }, reviewedAt: { lte: affiliationCutoff } }] },
    ] },
    include: { sources: true }, take: 100,
  });
  for (const item of expired) {
    const retention = item.verificationType === "POSITION" ? env.ACADEMIC_VERIFICATION_EVIDENCE_RETENTION_DAYS : env.AFFILIATION_EVIDENCE_RETENTION_DAYS;
    if (!item.reviewedAt || item.reviewedAt.getTime() > now.getTime() - retention * 86400000) continue;
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${item.userId}::uuid FOR UPDATE`;
      const keys = [item.evidenceStorageKey, ...(item.sources ?? []).map(source => source.storageKey)].filter((key): key is string => Boolean(key));
      for (const storageKey of keys) await tx.verificationEvidenceDeletion.upsert({ where: { storageKey }, create: { storageKey, userId: item.userId, notBefore: now }, update: { notBefore: now } });
      await tx.verificationEvidenceSource.updateMany({ where: { requestId: item.id }, data: { storageKey: null, fileName: null, sizeBytes: null, mimeType: null, additionalExplanation: null, reviewerNote: null } });
      const metadata = item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata) ? { ...item.metadata } : {};
      delete metadata.studentId;
      delete metadata.staffId;
      delete metadata.additionalNote;
      delete metadata.adminNote;
      delete metadata.identityBindingReference;
      await tx.verificationEvidence.updateMany({ where: { id: item.id, evidenceStorageKey: item.evidenceStorageKey }, data: { evidenceStorageKey: null, evidenceFileName: null, evidenceMimeType: null, evidenceSizeBytes: null, metadata: metadata as Prisma.InputJsonObject } });
      if (item.verificationType === "POSITION") {
        const latest = await tx.verificationEvidence.findFirst({ where: { userId: item.userId, verificationType: "POSITION" }, orderBy: { submittedAt: "desc" } });
        // The profile contains a projection of the latest private decision note.
        if (latest?.id === item.id) await tx.academicProfile.updateMany({ where: { userId: item.userId }, data: { verificationNote: null } });
      }
      if (item.verificationType === "AFFILIATION" && typeof metadata.affiliationId === "string") {
        const latest = await tx.verificationEvidence.findFirst({ where: { userId: item.userId, verificationType: "AFFILIATION", sourceType: "DOCUMENT" }, orderBy: { submittedAt: "desc" } });
        const latestMetadata = latest?.metadata as Prisma.JsonObject | undefined;
        // A newer document request may still need the applicant's Student ID.
        if (latest?.id === item.id || latestMetadata?.affiliationId !== metadata.affiliationId) await tx.affiliation.updateMany({ where: { id: metadata.affiliationId, userId: item.userId }, data: { studentCode: null } });
      }
    });
  }
  const queue = await db.verificationEvidenceDeletion.findMany({ where: { notBefore: { lte: now } }, take: 100, orderBy: { createdAt: "asc" } });
  for (const item of queue) {
    // A revision may retain the private object still needed by a newer request.
    if (await db.verificationEvidenceSource.count({ where: { storageKey: item.storageKey } }) || await db.verificationEvidence.count({ where: { evidenceStorageKey: item.storageKey } })) continue;
    // Delete is idempotent; failed storage calls leave the durable task for retry.
    try {
      await verificationEvidenceStorage.remove(item.storageKey, item.userId);
      await db.verificationEvidenceDeletion.deleteMany({ where: { storageKey: item.storageKey } });
    } catch {
      await db.verificationEvidenceDeletion.updateMany({ where: { storageKey: item.storageKey }, data: { notBefore: new Date(now.getTime() + 60 * 60 * 1000) } });
    }
  }
  return queue.length;
}
