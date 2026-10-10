import { AppError } from "../../common/exceptions/app-error.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { assertPdfMagic } from "../../common/middleware/upload.js";
import { verificationEvidenceStorage } from "./verification-evidence-storage.service.js";
import { auditService } from "../audit/audit.service.js";
import { notificationService } from "../notifications/notification.service.js";
import { capabilityService } from "../authorization/capability.service.js";
import { authMailService } from "../auth/auth-mail.service.js";
import type { VerificationRequestInput } from "./dto/academic-profile.schema.js";

type EvidenceFile = { buffer: Buffer; size: number; mimetype: string; originalname: string };

export const affiliationVerificationService = {
  async submit(userId: string, input: VerificationRequestInput, file?: EvidenceFile) {
    const db = getPrisma();
    const [user, profile, institution] = await Promise.all([
      db.user.findUnique({ where: { id: userId } }),
      db.academicProfile.findUnique({ where: { userId } }),
      input.institutionId ? db.institution.findUnique({ where: { id: input.institutionId } }) : null,
    ]);
    if (!user?.isActive || user.accountStatus !== "ACTIVE") throw AppError.unauthorized();
    if (!user.emailVerifiedAt) throw AppError.forbidden("Verify ownership of your email before requesting affiliation verification");
    if (!profile || !["STUDENT", "LECTURER", "RESEARCHER"].includes(profile.academicRole ?? "")) throw AppError.badRequest("Complete your academic profile first");
    const isStudent = profile.academicRole === "STUDENT";
    if (await db.verificationEvidence.findFirst({ where: { userId, verificationType: "AFFILIATION", status: "PENDING" } })) throw AppError.conflict("An affiliation request is already pending");
    if (!institution?.hostInstitution || !institution.isActive || institution.status !== "ACTIVE") throw AppError.badRequest("Choose an active FPT Education institution");
    if (!input.proofType || input.evidenceType !== "DOCUMENT") throw AppError.badRequest("Private affiliation evidence is required");
    if (isStudent && (!input.studentId?.trim() || !["STUDENT_CARD", "ENROLLMENT"].includes(input.proofType))) throw AppError.badRequest("Student ID and enrollment evidence are required");
    if (!isStudent && !["STAFF", "APPOINTMENT"].includes(input.proofType)) throw AppError.badRequest("Institutional staff or appointment evidence is required");
    if (!file || file.mimetype !== "application/pdf" || file.size !== file.buffer.length || file.size > 10 * 1024 * 1024) throw AppError.badRequest("Upload one PDF document up to 10 MB");
    assertPdfMagic(file.buffer);
    const key = await verificationEvidenceStorage.save(userId, file.buffer);
    let request;
    let resubmitted = false;
    try {
      request = await db.$transaction(async (tx) => {
        // Lock the account so submission, profile changes and reviewer decisions
        // cannot produce a request against a different affiliation.
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
        const currentUser = await tx.user.findUnique({ where: { id: userId } });
        if (!currentUser?.isActive || currentUser.accountStatus !== "ACTIVE" || !currentUser.emailVerifiedAt) throw AppError.forbidden("An active account with verified email is required");
        const currentProfile = await tx.academicProfile.findUnique({ where: { userId } });
        if (!currentProfile || currentProfile.academicRole !== profile.academicRole || currentProfile.primaryPosition !== profile.primaryPosition || currentProfile.positionTitle !== profile.positionTitle) throw AppError.conflict("Your academic position changed; refresh before submitting");
        if (await tx.verificationEvidence.findFirst({ where: { userId, verificationType: "AFFILIATION", status: "PENDING" } })) throw AppError.conflict("An affiliation request is already pending");
        const current = await tx.affiliation.findFirst({ where: { userId, isPrimary: true, isCurrent: true } });
        if (current?.institutionId !== institution.id) throw AppError.conflict("Your declared institution changed; update your academic profile before requesting verification");
        if (current?.verificationStatus === "VERIFIED") throw AppError.conflict("Your current affiliation is already verified");
        const previous = await tx.verificationEvidence.findFirst({ where: { userId, verificationType: "AFFILIATION", status: { in: ["NEEDS_MORE_INFORMATION", "REJECTED"] } }, orderBy: { submittedAt: "desc" } });
        resubmitted = Boolean(previous);
        const now = new Date();
        await tx.verificationEvidence.updateMany({ where: { userId, verificationType: "AFFILIATION", status: "NEEDS_MORE_INFORMATION", supersededAt: null }, data: { supersededAt: now } });
        if (current && current.institutionId !== institution.id) await tx.affiliation.update({ where: { id: current.id }, data: { isCurrent: false, isPrimary: false, endDate: now } });
        const affiliationData = { institutionName: institution.name, studentCode: isStudent ? input.studentId!.trim() : null, positionTitle: profile.positionTitle, positionCategory: profile.positionCategory, verificationStatus: "PENDING", verificationSource: "SELF_DECLARED", verifiedAt: null, verifiedById: null, verificationMethod: null };
        const affiliation = current?.institutionId === institution.id
          ? await tx.affiliation.update({ where: { id: current.id }, data: affiliationData })
          : await tx.affiliation.create({ data: { ...affiliationData, userId, institutionId: institution.id, isPrimary: true, isCurrent: true, startDate: now } });
        const created = await tx.verificationEvidence.create({ data: {
          userId, academicProfileId: profile.id, verificationType: "AFFILIATION", sourceType: "DOCUMENT", status: "PENDING",
          evidenceStorageKey: key, evidenceFileName: "affiliation-evidence.pdf", evidenceMimeType: "application/pdf", evidenceSizeBytes: file.size,
          metadata: { affiliationId: affiliation.id, institutionId: institution.id, institutionName: institution.name, primaryPosition: profile.primaryPosition, academicRole: profile.academicRole, positionTitle: profile.positionTitle, studentId: isStudent ? input.studentId!.trim() : "", proofType: input.proofType, additionalNote: input.additionalNote ?? "", resubmissionOf: previous?.id ?? null },
        } });
        await tx.academicProfile.update({ where: { id: profile.id }, data: { affiliationStatus: "PENDING" } });
        await tx.user.update({ where: { id: userId }, data: { institution: institution.name } });
        await tx.verificationEvidenceDeletion.deleteMany({ where: { storageKey: key } });
        return created;
      });
    } catch (error) {
      // Queue on failure as well, so temporary object-store failure cannot leave
      // an uploaded student card without a deletion path.
      await db.verificationEvidenceDeletion.upsert({ where: { storageKey: key }, create: { storageKey: key, userId }, update: { notBefore: new Date() } });
      if ((error as { code?: string }).code === "P2002") throw AppError.conflict("An affiliation request is already pending");
      throw error;
    }
    await auditService.log(resubmitted ? "AFFILIATION_REQUEST_RESUBMITTED" : "AFFILIATION_REQUEST_SUBMITTED", { userId, targetTableName: "verification_evidence", targetRecordId: request.id, details: { institutionId: institution.id } });
    await notificationService.create({ userId, title: "Affiliation request submitted", message: "Your request is awaiting review. Open Academic Profile to view its status.", type: "affiliation_request_submitted", targetKind: "academic_profile", targetId: profile.id });
    await capabilityService.evaluate(userId);
    await authMailService.sendAffiliationStatus(user.email).catch(() => undefined);
  },
};

export const studentAffiliationService = affiliationVerificationService;
