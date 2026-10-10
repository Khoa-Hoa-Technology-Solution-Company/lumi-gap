import { createHash } from "node:crypto";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { validatedVerificationFile } from "./verification-evidence-file.js";
import { verificationEvidenceStorage } from "./verification-evidence-storage.service.js";
import type { EvidenceUpload } from "./lecturer-verification.service.js";

export async function stageLecturerEvidence(value: string, institutionId: string, file?: EvidenceUpload) {
  if (!file) throw AppError.badRequest("Choose an evidence document.");
  const db = getPrisma(), parsed = parseDatabaseId(value);
  if (!parsed) throw AppError.unauthorized();
  const user = await db.user.findUnique({ where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value } });
  if (!user?.isActive || user.accountStatus !== "ACTIVE" || !user.emailVerifiedAt) throw AppError.forbidden("Verify your LumiGap account email first");
  const profile = await db.academicProfile.findUnique({ where: { userId: user.id } });
  const affiliation = await db.affiliation.findFirst({ where: { userId: user.id, isPrimary: true, isCurrent: true } });
  if (profile?.academicRole !== "LECTURER" || !profile.positionTitle || affiliation?.institutionId !== institutionId) throw AppError.conflict("Your academic claim changed; refresh before submitting");
  const validated = await validatedVerificationFile(file);
  const storageKey = await verificationEvidenceStorage.save(user.id, validated.buffer, validated.mimeType);
  // save() creates a durable deletion intent first. Keep it until the request consumes this upload.
  const upload = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
    const live = await tx.academicProfile.findUniqueOrThrow({ where: { userId: user.id } });
    const account = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    const current = await tx.affiliation.findFirst({ where: { userId: user.id, isPrimary: true, isCurrent: true } });
    if (!account.isActive || account.accountStatus !== "ACTIVE" || !account.emailVerifiedAt || live.academicRole !== "LECTURER" || live.positionTitle !== profile.positionTitle || current?.institutionId !== institutionId) throw AppError.conflict("Your academic claim changed; refresh before submitting");
    if (await tx.verificationEvidenceUpload.count({ where: { userId: user.id, consumedAt: null, expiresAt: { gt: new Date() } } }) >= 12) throw new AppError(429, "EVIDENCE_UPLOAD_LIMIT", "Too many staged documents. Try again after unused uploads expire.");
    return tx.verificationEvidenceUpload.create({ data: {
      userId: user.id, institutionId, positionTitle: live.positionTitle!, storageKey,
      fileName: `${file.originalname.split(/[\\/]/).pop()!.replace(/\.[^.]*$/, "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 170) || "evidence"}.${validated.extension}`,
      mimeType: validated.mimeType, sizeBytes: validated.buffer.length,
      contentHash: createHash("sha256").update(validated.buffer).digest("hex"),
      expiresAt: new Date(Date.now() + 50 * 60_000),
    } });
  });
  return { uploadId: upload.id, status: "UPLOADED" as const, expiresAt: upload.expiresAt.toISOString() };
}
