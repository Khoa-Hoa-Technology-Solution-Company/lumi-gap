import type { Prisma } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { AppError } from "../../common/exceptions/app-error.js";
import { assertPdfMagic } from "../../common/middleware/upload.js";
import { officialInstitutionUrl, lecturerEvidenceUrl } from "../identity/institution-domain.service.js";
import { verifiedInstitutionalIdentity } from "./institutional-identity.service.js";
import { verificationEvidenceStorage } from "./verification-evidence-storage.service.js";
import type { VerificationRequestInput, VerificationDecisionInput } from "./dto/academic-profile.schema.js";
import { LecturerEvidenceEntrySchema } from "./dto/academic-profile.schema.js";
import { validatedVerificationFile } from "./verification-evidence-file.js";
import { createHash } from "node:crypto";
import { lecturerVerificationNotification } from "./lecturer-verification-delivery.service.js";

export type EvidenceUpload = { buffer: Buffer; originalname: string; mimetype: string; size: number };
const documentTypes = new Set(["INSTITUTION_ISSUED_PROFILE", "EMPLOYMENT_DOCUMENT", "APPOINTMENT_DOCUMENT", "STAFF_ID"]);
type Source = { slot: number; type: string; sourceKind: "URL" | "DOCUMENT"; reference?: string; storageKey?: string; fileName?: string; sizeBytes?: number; mimeType?: string; customEvidenceName?: string; additionalExplanation?: string; urlTrustStatus?: string; upload?: Buffer; uploadId?: string; contentHash?: string; retainedSourceId?: string; previousSourceId?: string };

export function lecturerSubmissionAcknowledgement(request: { id: string; status: string; submittedAt: Date; submissionKey: string | null }) {
  return { requestId: request.id, status: request.status, submittedAt: request.submittedAt.toISOString(), submissionKey: request.submissionKey, accepted: true as const };
}

async function prepareSource(slot: number, type: string | undefined, reference: string | undefined, file: EvidenceUpload | undefined, institutionId: string): Promise<Source> {
  if (!type) throw AppError.badRequest("Choose an institution evidence type");
  if (documentTypes.has(type)) {
    assertPdfMagic(file?.buffer);
    if (!file || reference || file.mimetype !== "application/pdf" || file.buffer.length > 10 * 1024 * 1024) throw AppError.badRequest("Provide a private PDF of up to 10 MB for document evidence");
    const validated = await validatedVerificationFile(file);
    return { slot, type, sourceKind: "DOCUMENT", fileName: safeName(file.originalname, validated.extension), sizeBytes: validated.buffer.length, mimeType: validated.mimeType, upload: validated.buffer };
  }
  if (file || !reference) throw AppError.badRequest("Provide an official institution URL for this source");
  if (type === "OTHER_INSTITUTION_SOURCE") throw AppError.badRequest("Describe your custom evidence");
  return { slot, type, sourceKind: "URL", reference: await officialInstitutionUrl(reference, institutionId), urlTrustStatus: "REGISTRY_APPROVED" };
}

function safeName(name: string, extension: string) { return `${name.split(/[\\/]/).pop()!.replace(/\.[^.]*$/, "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 170) || "evidence"}.${extension}`; }
async function prepareEntries(entries: NonNullable<VerificationRequestInput["sources"]>, files: EvidenceUpload[], institutionId: string, userId: string, positionTitle: string, supplementsRequestId?: string) {
  if (!entries.length || entries.length > 6) throw AppError.badRequest("Provide one to six evidence entries");
  const indices = entries.flatMap(entry => entry.documentIndex === undefined ? [] : [entry.documentIndex]);
  if (indices.length !== files.length || new Set(indices).size !== indices.length || indices.some(index => !files[index])) throw AppError.badRequest("Each document must match one evidence entry");
  const sources: Source[] = [];
  for (const [index, raw] of entries.entries()) {
    const entry = LecturerEvidenceEntrySchema.parse(raw);
    const source: Source = { slot: index + 1, type: entry.type, sourceKind: entry.sourceKind, customEvidenceName: entry.customEvidenceName, additionalExplanation: entry.additionalExplanation };
    if (entry.sourceKind === "URL") Object.assign(source, await lecturerEvidenceUrl(entry.reference!, institutionId));
    else if (entry.retainedSourceId) {
      const prior = supplementsRequestId ? await getPrisma().verificationEvidenceSource.findFirst({ where: { id: entry.retainedSourceId, requestId: supplementsRequestId, request: { userId }, sourceKind: "DOCUMENT", type: entry.type, storageKey: { not: null } } }) : null;
      if (!prior?.storageKey) throw AppError.badRequest("Previously submitted evidence is unavailable. Upload a replacement.");
      Object.assign(source, { retainedSourceId: prior.id, previousSourceId: prior.id, storageKey: prior.storageKey, fileName: prior.fileName, sizeBytes: prior.sizeBytes, mimeType: prior.mimeType, customEvidenceName: prior.customEvidenceName, additionalExplanation: entry.additionalExplanation ?? prior.additionalExplanation });
    } else if (entry.uploadId) {
      const staged = await getPrisma().verificationEvidenceUpload.findFirst({ where: { id: entry.uploadId, userId, institutionId, positionTitle } });
      if (!staged) throw AppError.badRequest("This document upload is unavailable or expired. Upload it again.");
      Object.assign(source, { uploadId: staged.id, storageKey: staged.storageKey, fileName: staged.fileName, sizeBytes: staged.sizeBytes, mimeType: staged.mimeType, contentHash: staged.contentHash });
    } else {
      const file = files[entry.documentIndex!]!, validated = await validatedVerificationFile(file);
      Object.assign(source, { upload: validated.buffer, mimeType: validated.mimeType, sizeBytes: validated.buffer.length, fileName: safeName(file.originalname, validated.extension), contentHash: createHash("sha256").update(validated.buffer).digest("hex") });
    }
    if (sources.some(other => source.reference && source.reference === other.reference || source.contentHash && source.contentHash === other.contentHash || source.storageKey && source.storageKey === other.storageKey)) throw AppError.badRequest("Provide two independent institution evidence sources");
    sources.push(source);
  }
  return sources;
}

export async function submitLecturerVerification(userId: string, input: VerificationRequestInput, file?: EvidenceUpload, additionalFile?: EvidenceUpload, evidenceFiles: EvidenceUpload[] = []) {
  const db = getPrisma();
  if (!input.path) throw AppError.badRequest("Choose the adaptive Lecturer verification path");
  const submissionHash = input.submissionKey ? createHash("sha256").update(JSON.stringify(input)).update(evidenceFiles.map(file => createHash("sha256").update(file.buffer).digest("hex")).join(",")).digest("hex") : undefined;
  if (input.submissionKey) {
    const replay = await db.verificationEvidence.findUnique({ where: { userId_submissionKey: { userId, submissionKey: input.submissionKey } } });
    if (replay) {
      const account = await db.user.findUniqueOrThrow({ where: { id: userId } });
      if (!account.isActive || account.accountStatus !== "ACTIVE" || !account.emailVerifiedAt) throw AppError.forbidden("Verify your LumiGap account email first");
      if (replay.submissionHash !== submissionHash) throw AppError.conflict("This submission key was already used for different evidence");
      return lecturerSubmissionAcknowledgement(replay);
    }
  }
  const [user, profile, affiliation] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId } }),
    db.academicProfile.findUniqueOrThrow({ where: { userId } }),
    db.affiliation.findFirst({ where: { userId, isPrimary: true, isCurrent: true } }),
  ]);
  if (!user.emailVerifiedAt) throw AppError.forbidden("Verify your LumiGap account email first");
  if (profile.academicRole !== "LECTURER" || !profile.positionTitle || !affiliation || input.institutionId !== affiliation.institutionId) throw AppError.badRequest("Choose your institution and current Lecturer position first");
  const standard = input.path === "STANDARD";
  let sources: Source[];
  if (input.sources) {
    if (file || additionalFile || input.primarySourceType || input.additionalSourceType || input.reference || input.additionalReference) throw AppError.badRequest("Do not mix legacy evidence fields with evidence entries");
    sources = await prepareEntries(input.sources, evidenceFiles, affiliation.institutionId, userId, profile.positionTitle, input.supplementsRequestId);
  } else {
    if (evidenceFiles.length) throw AppError.badRequest("Each document must match one evidence entry");
    const primary = await prepareSource(1, input.primarySourceType, input.reference, file, affiliation.institutionId);
    if (standard && (!primary.reference || !["OFFICIAL_FACULTY_PROFILE", "OFFICIAL_STAFF_DIRECTORY", "DEPARTMENT_DIRECTORY"].includes(primary.type))) throw AppError.badRequest("The standard path requires an official faculty/staff profile or directory");
    if (standard && (additionalFile || input.additionalSourceType || input.additionalReference)) throw AppError.badRequest("Additional evidence is only accepted for manual review");
    sources = [primary];
    if (!standard) sources.push(await prepareSource(2, input.additionalSourceType, input.additionalReference, additionalFile, affiliation.institutionId));
    if (sources.length > 1 && (sources[0]!.reference && sources[0]!.reference === sources[1]!.reference || file && additionalFile && file.buffer.equals(additionalFile.buffer))) throw AppError.badRequest("Provide two independent institution evidence sources");
  }
  const primary = sources[0]!;
  const method = standard ? "INSTITUTIONAL_EMAIL_AND_PROFILE" : "MANUAL_INSTITUTIONAL_EVIDENCE";
  const stored: string[] = [];
  const now = new Date();
  let resubmitted = false;
  let request;
  try {
    for (const source of sources) {
      if (source.upload) { source.storageKey = await verificationEvidenceStorage.save(userId, source.upload, source.mimeType); stored.push(source.storageKey); }
    }
    request = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      if (input.submissionKey) {
        const replay = await tx.verificationEvidence.findUnique({ where: { userId_submissionKey: { userId, submissionKey: input.submissionKey } } });
        if (replay) {
          if (replay.submissionHash !== submissionHash) throw AppError.conflict("This submission key was already used for different evidence");
          return replay;
        }
      }
      const live = await tx.academicProfile.findUniqueOrThrow({ where: { userId } });
      const account = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const current = await tx.affiliation.findFirst({ where: { userId, isPrimary: true, isCurrent: true } });
      const institution = await tx.institution.findUnique({ where: { id: affiliation.institutionId } });
      if (!institution?.isActive || institution.status !== "ACTIVE") throw AppError.badRequest("The selected institution is not active");
      if (!account.isActive || account.accountStatus !== "ACTIVE" || !account.emailVerifiedAt || account.fullName !== user.fullName || live.academicRole !== "LECTURER" || live.positionTitle !== profile.positionTitle || live.primaryPosition !== profile.primaryPosition || current?.institutionId !== affiliation.institutionId) throw AppError.conflict("Your academic claim changed; refresh before submitting");
      if (live.positionStatus === "VERIFIED" && live.roleVerificationStatus === "VERIFIED") throw AppError.conflict("Lecturer status is already verified");
      if (await tx.verificationEvidence.findFirst({ where: { userId, verificationType: "POSITION", status: "PENDING" } })) throw AppError.conflict("Lecturer verification is already pending");
      const awaiting = await tx.verificationEvidence.findFirst({ where: { userId, verificationType: "POSITION", status: "NEEDS_MORE_INFORMATION", supersededAt: null, invalidatedAt: null }, orderBy: { submittedAt: "desc" } });
      const predecessor = input.supplementsRequestId ? await tx.verificationEvidence.findFirst({ where: { id: input.supplementsRequestId, userId, verificationType: "POSITION" } }) : awaiting ?? await tx.verificationEvidence.findFirst({ where: { userId, verificationType: "POSITION", status: "REJECTED" }, orderBy: { submittedAt: "desc" } });
      if (input.supplementsRequestId && (!predecessor || predecessor.status !== "NEEDS_MORE_INFORMATION" || predecessor.supersededAt || predecessor.invalidatedAt || predecessor.reviewedAt?.toISOString() !== input.expectedReviewedAt || (predecessor.institutionId ?? (predecessor.metadata as Prisma.JsonObject).institutionId) !== affiliation.institutionId || (predecessor.metadata as Prisma.JsonObject).positionTitle !== live.positionTitle)) throw AppError.conflict("This request changed or can no longer receive supplements. Refresh its status.");
      if (awaiting && predecessor?.id !== awaiting.id) throw AppError.conflict("Supplement the current request before starting another.");
      for (const source of sources) if (source.retainedSourceId) {
        const prior = await tx.verificationEvidenceSource.findFirst({ where: { id: source.retainedSourceId, requestId: predecessor!.id, storageKey: source.storageKey, sourceKind: "DOCUMENT", type: source.type } });
        if (!prior?.storageKey) throw AppError.conflict("Previously submitted evidence is unavailable. Upload a replacement.");
      }
      if (predecessor) for (const source of sources) if (source.reference) source.previousSourceId = (await tx.verificationEvidenceSource.findFirst({ where: { requestId: predecessor.id, reference: source.reference, type: source.type } }))?.id;
      const identity = await verifiedInstitutionalIdentity(userId, affiliation.institutionId, tx);
      if (standard && !identity) throw AppError.badRequest("Verify an institutional email for this institution first, or use manual verification");
      for (const source of sources) if (source.reference) Object.assign(source, input.sources ? await lecturerEvidenceUrl(source.reference, affiliation.institutionId, tx) : { reference: await officialInstitutionUrl(source.reference, affiliation.institutionId, tx) });
      for (const source of sources) if (source.uploadId) {
        const consumed = await tx.verificationEvidenceUpload.updateMany({ where: { id: source.uploadId, userId, institutionId: affiliation.institutionId, positionTitle: live.positionTitle!, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
        if (consumed.count !== 1) throw AppError.conflict("This document upload is unavailable or expired. Upload it again.");
      }
      const superseded = await tx.verificationEvidence.updateMany({ where: { userId, verificationType: "POSITION", status: "NEEDS_MORE_INFORMATION", supersededAt: null }, data: { supersededAt: now } });
      resubmitted = superseded.count > 0;
      const created = await tx.verificationEvidence.create({ data: {
        userId, academicProfileId: profile.id, verificationType: "POSITION", sourceType: primary.reference ? "INSTITUTIONAL_PROFILE" : "DOCUMENT",
        previousRequestId: predecessor?.id, revision: predecessor?.status === "NEEDS_MORE_INFORMATION" ? predecessor.revision + 1 : 1, institutionId: affiliation.institutionId, verificationMethod: method, sourceReference: primary.reference, status: "PENDING", submissionKey: input.submissionKey, submissionHash,
        metadata: { targetValue: profile.positionTitle, claimedName: user.fullName, institutionName: affiliation.institutionName, institutionId: affiliation.institutionId, academicRole: "LECTURER", positionTitle: profile.positionTitle, primaryPosition: profile.primaryPosition, positionCategory: profile.positionCategory, additionalNote: input.additionalNote ?? null, identityBindingPolicy: 2, ...(input.sources ? { evidenceFormVersion: 2 } : {}), ...(standard && identity ? { identitySource: identity.source, institutionalEmail: identity.email, emailVerifiedAt: identity.verifiedAt.toISOString() } : {}) },
        sources: { create: [...(standard && identity ? [{ slot: 0, type: "INSTITUTIONAL_EMAIL", sourceKind: "EMAIL", reference: identity.email, emailIdentityId: identity.emailIdentityId }] : []), ...sources.map(({ upload: _upload, uploadId: _uploadId, retainedSourceId: _retainedId, contentHash: _hash, ...source }) => source)] },
      } });
      await tx.academicProfile.update({ where: { id: profile.id }, data: { positionStatus: "PENDING", roleVerificationStatus: "PENDING", verificationStatus: "PENDING", verificationRequestedAt: now, rejectionReason: null } });
      await tx.affiliation.update({ where: { id: affiliation.id }, data: { positionStatus: "PENDING" } });
      await tx.verificationEvidenceDeletion.deleteMany({ where: { storageKey: { in: sources.flatMap(source => source.storageKey ? [source.storageKey] : []) } } });
      await tx.auditLog.create({ data: { userId, actionName: resubmitted ? "LECTURER_VERIFICATION_RESUBMITTED" : "LECTURER_VERIFICATION_SUBMITTED", targetTableName: "verification_evidence", targetRecordId: created.id, details: { institutionId: affiliation.institutionId, method } } });
      await lecturerVerificationNotification(tx, resubmitted ? "LECTURER_VERIFICATION_SUPPLEMENTED" : "LECTURER_VERIFICATION_SUBMITTED", created);
      return created;
    });
  } catch (error) {
    for (const storageKey of stored) await db.verificationEvidenceDeletion.upsert({ where: { storageKey }, create: { storageKey, userId }, update: { notBefore: new Date() } });
    if ((error as { code?: string }).code === "P2002") throw AppError.conflict("Lecturer verification is already pending");
    throw error;
  }
  return lecturerSubmissionAcknowledgement(request);
}

/** Called under the existing applicant/Admin locks before the conditional decision. */
export async function reviewLecturerEvidence(tx: Prisma.TransactionClient, requestId: string, input: VerificationDecisionInput, adminId: string) {
  const request = await tx.verificationEvidence.findUniqueOrThrow({ where: { id: requestId }, include: { sources: true } });
  const metadata = request.metadata as Prisma.JsonObject;
  if (request.status !== "PENDING") throw AppError.conflict("This request was already decided");
  if (input.decision !== "approve" && input.reason.trim().length < 10) throw AppError.badRequest("Explain the required changes or rejection reason in at least 10 characters.");
  if (input.decision === "approve") {
    if (!request.institutionId || !["INSTITUTIONAL_EMAIL_AND_PROFILE", "MANUAL_INSTITUTIONAL_EVIDENCE"].includes(request.verificationMethod ?? "")) throw AppError.badRequest("This legacy Lecturer request needs updated evidence. Request more information and ask the applicant to resubmit.");
    const [user, profile, affiliation] = await Promise.all([
      tx.user.findUniqueOrThrow({ where: { id: request.userId } }),
      tx.academicProfile.findUniqueOrThrow({ where: { userId: request.userId } }),
      tx.affiliation.findFirst({ where: { userId: request.userId, isPrimary: true, isCurrent: true } }),
    ]);
    const institution = await tx.institution.findUnique({ where: { id: request.institutionId } });
    if (!institution?.isActive || institution.status !== "ACTIVE") throw AppError.badRequest("The selected institution is no longer active");
    if (!user.isActive || user.accountStatus !== "ACTIVE" || !user.emailVerifiedAt || user.fullName !== metadata.claimedName || affiliation?.institutionId !== request.institutionId || profile.positionTitle !== metadata.positionTitle || profile.primaryPosition !== metadata.primaryPosition || profile.academicRole !== "LECTURER") throw AppError.conflict("The account or academic claim changed; request updated evidence");
    const checklist = input.checklist;
    if (!checklist || !checklist.identityMatches || !checklist.institutionMatches || !checklist.currentPositionConfirmed || !checklist.institutionControlled || !checklist.noConflicts || !checklist.identityBound) throw AppError.badRequest("Complete every Lecturer review check before approval");
    const standard = request.verificationMethod === "INSTITUTIONAL_EMAIL_AND_PROFILE";
    const primary = request.sources.find(s => s.slot === 1), email = request.sources.find(s => s.slot === 0), evidence = request.sources.filter(s => s.slot !== 0);
    if (standard) {
      const identity = await verifiedInstitutionalIdentity(request.userId, request.institutionId, tx);
      if (!identity || identity.email !== email?.reference || !primary || metadata.evidenceFormVersion !== 2 && (!primary.reference || !["OFFICIAL_FACULTY_PROFILE", "OFFICIAL_STAFF_DIRECTORY", "DEPARTMENT_DIRECTORY"].includes(primary.type))) throw AppError.badRequest("A current verified institutional identity and official profile are required");
    } else if (!primary || !checklist.identityBound || (evidence.length > 1 ? !checklist.independentEvidence : (input.note?.trim().length ?? 0) < 20)) throw AppError.badRequest("Confirm identity binding and explain how the evidence establishes this account's current institutional position");
    if (!standard && metadata.identityBindingPolicy === 2 && (!input.identityBindingMethod || (input.identityBindingReference?.trim().length ?? 0) < 10 || (input.note?.trim().length ?? 0) < 20)) throw AppError.badRequest("Record an independently established institution contact or trusted record and explain how it binds this account to the claimed person");
    for (const source of request.sources) {
      if (source.slot !== 0) {
        if (source.reference) {
          const assessed = await lecturerEvidenceUrl(source.reference, request.institutionId, tx);
          if (assessed.urlTrustStatus === "PENDING_ADMIN_VALIDATION" && !input.evidenceChecks?.find(check => check.id === source.id)?.institutionDomainConfirmed) throw AppError.badRequest("Explicitly validate the unregistered institution website before approving");
        } else if (!source.storageKey || !(documentTypes.has(source.type) || source.type === "OTHER_INSTITUTION_SOURCE" && source.sourceKind === "DOCUMENT")) throw AppError.badRequest("Required private institution evidence is unavailable");
        if (metadata.evidenceFormVersion === 2 && source.type === "OTHER_INSTITUTION_SOURCE" && !source.customEvidenceName) throw AppError.badRequest("Custom evidence description is missing");
      }
      if (input.evidenceChecks?.find(check => check.id === source.id)?.status !== "VALID") throw AppError.badRequest("Review and mark each required evidence source VALID before approval");
    }
  }
  const checks = input.evidenceChecks ?? [];
  if (new Set(checks.map(c => c.id)).size !== checks.length || checks.some(check => !request.sources.some(s => s.id === check.id))) throw AppError.badRequest("Evidence checks must belong to this request and be unique");
  for (const check of checks) await tx.verificationEvidenceSource.update({ where: { id: check.id }, data: { status: check.status, checkedById: adminId, checkedAt: new Date(), reviewerNote: check.note ?? null, ...(input.decision === "approve" && check.institutionDomainConfirmed && request.sources.find(s => s.id === check.id)?.urlTrustStatus === "PENDING_ADMIN_VALIDATION" ? { urlTrustStatus: "ADMIN_VALIDATED" } : {}) } });
  await tx.verificationEvidence.update({ where: { id: request.id }, data: { metadata: { ...metadata, ...(input.checklist ? { reviewChecklist: input.checklist } : {}), ...(input.identityBindingMethod ? { identityBindingMethod: input.identityBindingMethod, identityBindingReference: input.identityBindingReference } : {}), ...("note" in input && input.note ? { adminNote: input.note } : {}) } as Prisma.InputJsonObject } });
  return request.verificationMethod;
}
