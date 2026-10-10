import type { LecturerVerificationTracking, LecturerTrackingRequest, VerificationStatus, AcademicRole } from "@trend/shared-types";
import type { Prisma, VerificationEvidence, VerificationEvidenceSource } from "../../generated/prisma/client.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { AppError } from "../../common/exceptions/app-error.js";

type Row = VerificationEvidence & { sources: VerificationEvidenceSource[] };
const metadata = (row: Row) => row.metadata as Prisma.JsonObject;
const text = (value: unknown) => typeof value === "string" ? value : undefined;
function present(row: Row, carried: Set<string>): LecturerTrackingRequest {
  const values = metadata(row);
  const sources = row.sources.filter(source => source.slot !== 0);
  return { id: row.id, previousRequestId: row.previousRequestId ?? undefined, revision: row.revision,
    status: row.status as VerificationStatus, institutionId: row.institutionId ?? text(values.institutionId),
    institutionName: text(values.institutionName) ?? "", position: text(values.positionTitle) ?? text(values.targetValue) ?? "",
    verificationMethod: row.verificationMethod ?? undefined, submittedAt: row.submittedAt.toISOString(), reviewedAt: row.reviewedAt?.toISOString(),
    invalidatedAt: row.invalidatedAt?.toISOString(), supersededAt: row.supersededAt?.toISOString(), applicantMessage: row.rejectionReason ?? undefined,
    evidence: sources.length ? sources.map(source => ({
      id: source.id, type: source.type, sourceKind: source.sourceKind ?? (source.reference ? "URL" : "DOCUMENT"),
      displayName: source.fileName ?? source.customEvidenceName ?? source.type,
      reference: source.sourceKind === "DOCUMENT" ? undefined : source.reference ?? undefined,
      mimeType: source.mimeType ?? undefined, isAvailable: Boolean(source.storageKey || source.reference), submittedAt: source.createdAt.toISOString(),
      previousSourceId: source.previousSourceId ?? undefined, replaced: Boolean(row.supersededAt && !carried.has(source.id)),
      additionalExplanation: source.additionalExplanation ?? undefined,
    })) : row.sourceType === "DOCUMENT" || row.sourceReference ? [{
      id: row.id, type: row.sourceType, sourceKind: row.sourceType === "DOCUMENT" ? "DOCUMENT" : "URL",
      displayName: row.evidenceFileName ?? row.sourceType,
      reference: row.sourceType === "DOCUMENT" ? undefined : row.sourceReference ?? undefined,
      mimeType: row.evidenceMimeType ?? undefined, isAvailable: Boolean(row.evidenceStorageKey || row.sourceReference),
      submittedAt: row.submittedAt.toISOString(), replaced: Boolean(row.supersededAt),
    }] : [],
  };
}

/** Owner-only, whitelisted DTO. No audit details, storage keys or review assessments. */
export async function lecturerTracking(userId: string, requestId?: string, page = 1): Promise<LecturerVerificationTracking> {
  return getPrisma().$transaction(async tx => {
    const [user, profile, affiliation] = await Promise.all([
      tx.user.findUniqueOrThrow({ where: { id: userId } }), tx.academicProfile.findUniqueOrThrow({ where: { userId } }),
      tx.affiliation.findFirst({ where: { userId, isPrimary: true, isCurrent: true } }),
    ]);
    if (!user.isActive || user.accountStatus !== "ACTIVE") throw AppError.unauthorized();
    const where = { userId, verificationType: "POSITION", OR: [{ metadata: { path: ["academicRole"], equals: "LECTURER" } }, { verificationMethod: { in: ["INSTITUTIONAL_EMAIL_AND_PROFILE", "MANUAL_INSTITUTIONAL_EVIDENCE"] } }] };
    const [latest, history, total] = await Promise.all([
      tx.verificationEvidence.findFirst({ where, orderBy: [{ submittedAt: "desc" }, { id: "desc" }], include: { sources: { orderBy: { slot: "asc" } } } }),
      tx.verificationEvidence.findMany({ where, orderBy: [{ submittedAt: "desc" }, { id: "desc" }], take: 10, skip: (page - 1) * 10, include: { sources: { orderBy: { slot: "asc" } } } }),
      tx.verificationEvidence.count({ where }),
    ]);
    const selected = requestId ? await tx.verificationEvidence.findFirst({ where: { ...where, id: requestId }, include: { sources: { orderBy: { slot: "asc" } } } }) : latest;
    if (requestId && !selected) throw AppError.notFound("Verification request not found");
    const chain: Row[] = []; let cursor = selected;
    while (cursor && chain.length < 100) {
      chain.push(cursor);
      cursor = cursor.previousRequestId ? await tx.verificationEvidence.findFirst({ where: { ...where, id: cursor.previousRequestId }, include: { sources: { orderBy: { slot: "asc" } } } }) : null;
    }
    const carried = new Set((await tx.verificationEvidenceSource.findMany({ where: { request: { userId }, previousSourceId: { in: [...history, ...chain].flatMap(row => row.sources.map(source => source.id)) } }, select: { previousSourceId: true } })).flatMap(source => source.previousSourceId ? [source.previousSourceId] : []));
    const decisionsFromAudit = await tx.auditLog.findMany({ where: { actionName: "LECTURER_VERIFICATION_DECIDED", targetTableName: "verification_evidence", targetRecordId: { in: chain.map(row => row.id) } }, select: { targetRecordId: true, details: true } });
    const timeline: LecturerVerificationTracking["timeline"] = [];
    for (const row of chain.reverse()) {
      const previous = chain.find(item => item.id === row.previousRequestId);
      timeline.push({ id: `${row.id}:submitted`, requestId: row.id, eventType: previous?.status === "NEEDS_MORE_INFORMATION" ? "SUPPLEMENTED" : "SUBMITTED", createdAt: row.submittedAt.toISOString() });
      const decisions = { VERIFIED: "APPROVED", REJECTED: "REJECTED", NEEDS_MORE_INFORMATION: "MORE_INFO", EXPIRED: "EXPIRED" } as const;
      const previousDecision = (decisionsFromAudit.find(event => event.targetRecordId === row.id)?.details as Prisma.JsonObject | undefined)?.decision;
      const eventType = decisions[row.status as keyof typeof decisions] ?? (row.status === "INVALIDATED" && previousDecision === "more_info" ? "MORE_INFO" : undefined);
      if (row.reviewedAt && eventType) timeline.push({ id: `${row.id}:decision`, requestId: row.id, eventType, createdAt: row.reviewedAt.toISOString(), message: row.rejectionReason ?? undefined });
      if (row.invalidatedAt || row.status === "INVALIDATED") timeline.push({ id: `${row.id}:invalidated`, requestId: row.id, eventType: "INVALIDATED", createdAt: (row.invalidatedAt ?? row.reviewedAt ?? row.updatedAt).toISOString() });
    }
    const status = (profile.academicRole !== "LECTURER" || profile.positionStatus === "VERIFIED" && profile.roleVerificationStatus !== "VERIFIED" ? "NOT_SUBMITTED" : profile.positionStatus === "UNVERIFIED" ? "NOT_SUBMITTED" : profile.positionStatus) as VerificationStatus;
    const institution = affiliation ? await tx.institution.findUnique({ where: { id: affiliation.institutionId } }) : null;
    const eligible = profile.academicRole === "LECTURER" && Boolean(user.emailVerifiedAt && profile.positionTitle && institution?.isActive && institution.status === "ACTIVE");
    const actions: LecturerVerificationTracking["allowedActions"] = [];
    if (eligible && status !== "PENDING") {
      if (status === "VERIFIED") actions.push("MENTORING_SETTINGS", "WORKSPACE");
      else if (status === "NEEDS_MORE_INFORMATION" && latest?.status === "NEEDS_MORE_INFORMATION" && !latest.supersededAt && !latest.invalidatedAt && (latest.institutionId ?? text(metadata(latest).institutionId)) === affiliation?.institutionId && metadata(latest).positionTitle === profile.positionTitle) actions.push("SUPPLEMENT");
      else if (status === "REJECTED") actions.push("NEW_REQUEST");
      else actions.push("START");
    }
    return { status, academicRole: profile.academicRole as AcademicRole, accountEmailVerified: Boolean(user.emailVerifiedAt), institutionId: affiliation?.institutionId,
      institutionName: affiliation?.institutionName ?? "", position: profile.positionTitle ?? "", allowedActions: actions,
      currentRequestId: latest?.id, selectedRequest: selected ? present(selected, carried) : null,
      history: history.map(row => present(row, carried)), page, totalPages: Math.max(1, Math.ceil(total / 10)), timeline,
    };
  }, { isolationLevel: "RepeatableRead" });
}
