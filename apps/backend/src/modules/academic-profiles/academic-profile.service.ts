import {
  classifyAcademicPosition,
  type AcademicAffiliation,
  type AcademicIdentityLink,
  type AcademicFeaturedWork,
  type AcademicPositionCategory,
  type AcademicProfile,
  type AcademicProfilePrivacy,
  type AcademicProfileType,
  type AcademicReviewType,
  type CompactAcademicProfile,
  type PrimaryPosition,
  type PublicAcademicProfile,
  type ResearchSupportType,
  type VerificationStatus,
} from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { auditService } from "../audit/audit.service.js";
import { capabilityService } from "../authorization/capability.service.js";
import { resolveAcademicInstitution } from "../verification/affiliation.service.js";
import { notificationService } from "../notifications/notification.service.js";
import { mapAcademicIdentity, visibleAcademicIdentityLinks } from "./academic-identity.service.js";
import type { LecturerListQueryInput, UpdateAcademicProfileDetailsInput, VerificationDecisionInput, VerificationRequestInput } from "./dto/academic-profile.schema.js";
import { isValidPublicHandle, isValidResolvablePublicHandle, normalizePublicHandle } from "./public-handle.js";
import { verificationEvidenceStorage } from "./verification-evidence-storage.service.js";
import { assertPdfMagic } from "../../common/middleware/upload.js";
import { applyDisplayNameChangeLimit, getDisplayNamePolicy } from "./display-name-policy.service.js";
import { affiliationVerificationService } from "./student-affiliation.service.js";
import { prepareFeaturedWorks, resolveFeaturedWorks } from "./academic-featured-works.service.js";
import { authMailService } from "../auth/auth-mail.service.js";
import { submitLecturerVerification, reviewLecturerEvidence, type EvidenceUpload } from "./lecturer-verification.service.js";
import { lecturerTracking } from "./lecturer-verification-tracking.service.js";
import { lecturerVerificationNotification } from "./lecturer-verification-delivery.service.js";
import { assertVerifiedLecturer, isVerifiedLecturer } from "../projects/academic-relationship-access.js";

type LooseRecord = Record<string, unknown>;
const DEFAULT_PRIVACY: AcademicProfilePrivacy = { orcid: "PUBLIC", researchInterests: "PUBLIC", expertise: "PUBLIC" };

function legacyType(role: string): AcademicProfileType | undefined {
  return ["student", "researcher", "lecturer"].includes(role) ? role as AcademicProfileType : undefined;
}
function compatibilityType(position: string | null): AcademicProfileType | undefined {
  if (position === "STUDENT") return "student";
  if (position === "LECTURER") return "lecturer";
  if (position) return "researcher";
  return undefined;
}
function academicRoleForPosition(position: string | null | undefined): "STUDENT" | "RESEARCHER" | "LECTURER" | undefined {
  if (!position) return undefined;
  if (position === "STUDENT") return "STUDENT";
  if (position === "LECTURER") return "LECTURER";
  return "RESEARCHER";
}
function positionFromLegacy(type: AcademicProfileType | undefined): PrimaryPosition | undefined {
  if (type === "student") return "STUDENT";
  if (type === "lecturer") return "LECTURER";
  if (type === "researcher") return "RESEARCH_STAFF";
  return undefined;
}
function titleForPosition(position: PrimaryPosition | undefined): string | undefined {
  return ({ STUDENT: "Student", LECTURER: "Lecturer", RESEARCH_STAFF: "Research Staff" } as Partial<Record<PrimaryPosition, string>>)[position ?? "OTHER"];
}
function primaryFromCategory(category: AcademicPositionCategory, fallback?: PrimaryPosition): PrimaryPosition {
  if (category === "STUDENT" || category === "LECTURER" || category === "RESEARCH_STAFF") return category;
  return fallback ?? "OTHER";
}
function record(value: unknown): LooseRecord { return value && typeof value === "object" ? value as LooseRecord : {}; }
function stringValue(value: unknown): string | undefined { return typeof value === "string" && value.length > 0 ? value : undefined; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function safeEvidenceFileName(value: string): string {
  const leaf = value.split(/[\\/]/).pop() ?? "position-evidence.pdf";
  return leaf.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180) || "position-evidence.pdf";
}
function iso(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}
function status(value: string): VerificationStatus { return value === "UNVERIFIED" ? "NOT_SUBMITTED" : value as VerificationStatus; }
function normalizeSupportTypes(value: unknown): ResearchSupportType[] {
  const aliases: Record<string, ResearchSupportType | undefined> = {
    RESEARCH_DIRECTION: "RESEARCH_DIRECTION", LITERATURE_REVIEW: "LITERATURE_REVIEW", RESEARCH_GAP_VALIDATION: "RESEARCH_GAP_VALIDATION",
    METHODOLOGY: "RESEARCH_METHODOLOGY", RESEARCH_METHODOLOGY: "RESEARCH_METHODOLOGY", EXPERIMENT_DESIGN: "EXPERIMENT_DESIGN",
    DATA_ANALYSIS: "DATA_ANALYSIS", ACADEMIC_WRITING: "ACADEMIC_WRITING", SOFTWARE_TECHNICAL_REVIEW: "SOFTWARE_TECHNICAL_GUIDANCE",
    SOFTWARE_TECHNICAL_GUIDANCE: "SOFTWARE_TECHNICAL_GUIDANCE",
  };
  return [...new Set(stringArray(value).map((item) => aliases[item]).filter((item): item is ResearchSupportType => Boolean(item)))];
}
function normalizeReviewTypes(value: unknown): AcademicReviewType[] {
  const aliases: Record<string, AcademicReviewType | undefined> = {
    RESEARCH_PROPOSAL: "RESEARCH_PROPOSAL", LITERATURE_REVIEW: "LITERATURE_REVIEW", RESEARCH_GAP: "RESEARCH_GAP",
    METHODOLOGY: "METHODOLOGY", EXPERIMENT_REPORT: "EXPERIMENTAL_RESULTS", EXPERIMENTAL_RESULTS: "EXPERIMENTAL_RESULTS",
    MANUSCRIPT: "RESEARCH_PAPER", RESEARCH_PAPER: "RESEARCH_PAPER", SOFTWARE_RESEARCH_PROJECT: "SOFTWARE_RESEARCH_PROJECT",
  };
  return [...new Set(stringArray(value).map((item) => aliases[item]).filter((item): item is AcademicReviewType => Boolean(item)))];
}
function idWhere(value: string): { id: string } | { legacyMongoId: string } {
  const parsed = parseDatabaseId(value);
  if (!parsed) throw AppError.notFound("Academic profile not found");
  return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value };
}
async function resolveUser(value: string) {
  const user = await getPrisma().user.findUnique({ where: idWhere(value) });
  if (!user || !user.isActive || user.accountStatus !== "ACTIVE") throw AppError.notFound("Academic profile not found");
  return user;
}
function privacySettings(value: unknown): AcademicProfilePrivacy {
  const settings = record(value);
  const valid = (candidate: unknown) => ["PUBLIC", "REGISTERED_USERS", "PRIVATE"].includes(String(candidate));
  return {
    orcid: valid(settings.orcid) ? settings.orcid as AcademicProfilePrivacy["orcid"] : DEFAULT_PRIVACY.orcid,
    researchInterests: valid(settings.researchInterests) ? settings.researchInterests as AcademicProfilePrivacy["researchInterests"] : DEFAULT_PRIVACY.researchInterests,
    expertise: valid(settings.expertise) ? settings.expertise as AcademicProfilePrivacy["expertise"] : DEFAULT_PRIVACY.expertise,
  };
}
function mapAffiliation(item: {
  id: string; institutionName: string; rorId: string | null; department: string | null; positionTitle: string | null;
  institutionId: string; programId: string | null; academicTitle: string | null; positionCategory: string; positionSource: string; positionStatus: string;
  verificationStatus: string; isPrimary: boolean; isCurrent: boolean; validFrom: Date | null; validUntil: Date | null;
}): AcademicAffiliation {
  return {
    id: item.id, institutionId: item.institutionId, programId: item.programId ?? undefined, institutionName: item.institutionName, rorId: item.rorId ?? undefined, department: item.department ?? undefined,
    position: item.positionTitle ?? item.academicTitle ?? undefined, positionTitle: item.positionTitle ?? item.academicTitle ?? undefined,
    positionCategory: item.positionCategory as AcademicAffiliation["positionCategory"], positionSource: item.positionSource as AcademicAffiliation["positionSource"],
    affiliationVerificationStatus: status(item.verificationStatus), positionVerificationStatus: status(item.positionStatus),
    startDate: item.validFrom?.toISOString(), endDate: item.validUntil?.toISOString(), startYear: item.validFrom?.getUTCFullYear(),
    isCurrent: item.isCurrent, isPrimary: item.isPrimary,
  };
}
function historySummary(action: string, details: unknown): string {
  const values = record(details);
  if (action === "academic_profile.display_name.changed") return "Display name changed";
  if (action === "academic_profile.position.changed") return `Position changed: ${stringValue(values.previous) ?? "Not set"} → ${stringValue(values.next) ?? "Not set"}`;
  if (action === "academic_profile.affiliation.changed") return `Current affiliation changed: ${stringValue(values.previous) ?? "Not set"} → ${stringValue(values.next) ?? "Not set"}`;
  if (action === "affiliation.verified") return "Academic affiliation verified";
  if (action.includes("verification.approved")) return `${stringValue(values.type) ?? "Academic"} verification approved`;
  if (action.includes("verification.rejected")) return `${stringValue(values.type) ?? "Academic"} verification rejected`;
  if (action === "academic_profile.avatar.updated") return "Profile photo updated";
  if (action === "academic_profile.cover.updated") return "Cover image updated";
  return "Academic profile updated";
}

async function buildPrivateProfile(userId: string, context: { viewerId?: string; reviewer?: boolean } = { viewerId: userId }): Promise<AcademicProfile> {
  const prisma = getPrisma();
  const user = await resolveUser(userId);
  const profile = await prisma.academicProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, verificationStatus: "SELF_DECLARED" }, update: {} });
  const [identities, identityLinks, works, legacyEvidence, affiliations, requests, history, displayNamePolicy] = await Promise.all([
    prisma.academicExternalIdentity.findMany({ where: { profileId: profile.id }, orderBy: { position: "asc" } }),
    prisma.academicIdentityLink.findMany({ where: { userId: user.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.academicFeaturedWork.findMany({ where: { profileId: profile.id }, orderBy: { position: "asc" } }),
    prisma.academicVerificationEvidence.findMany({ where: { profileId: profile.id }, orderBy: { createdAt: "asc" } }),
    prisma.affiliation.findMany({ where: { userId: user.id }, orderBy: [{ isPrimary: "desc" }, { validUntil: "desc" }, { createdAt: "desc" }] }),
    prisma.verificationEvidence.findMany({ where: { userId: user.id, verificationType: { in: ["POSITION", "AFFILIATION"] } }, include: { sources: { orderBy: { slot: "asc" } } }, orderBy: { submittedAt: "desc" } }),
    prisma.auditLog.findMany({ where: { userId: user.id, OR: [{ actionName: { startsWith: "academic_profile." } }, { actionName: { startsWith: "affiliation." } }] }, orderBy: { createdAt: "desc" }, take: 30 }),
    getDisplayNamePolicy(prisma, user.id),
  ]);
  const academicType = compatibilityType(profile.primaryPosition) ?? user.academicProfileType ?? legacyType(user.role) ?? "researcher";
  const support = record(profile.supportAvailability), review = record(profile.reviewAvailability);
  const compositeStatus = ["PENDING", "VERIFIED", "REJECTED"].includes(profile.verificationStatus)
    ? profile.verificationStatus as "PENDING" | "VERIFIED" | "REJECTED" : "SELF_DECLARED";
  const publicUserId = publicDatabaseId(user);
  const [institutions, programs] = await Promise.all([
    prisma.institution.findMany({ where: { id: { in: affiliations.map(item => item.institutionId) } }, select: { id: true, hostInstitution: true } }),
    prisma.academicProgram.findMany({ where: { id: { in: affiliations.flatMap(item => item.programId ? [item.programId] : []) } }, select: { id: true, name: true } }),
  ]);
  const mappedAffiliations = affiliations.map(item => ({ ...mapAffiliation(item), hostInstitution: institutions.some(institution => institution.id === item.institutionId && institution.hostInstitution), programName: programs.find(program => program.id === item.programId)?.name }));
  const currentAffiliation: AcademicAffiliation = mappedAffiliations.find((item) => item.isPrimary && item.isCurrent) ?? {
    institutionName: user.institution ?? undefined, rorId: profile.affiliationRorId ?? undefined,
    department: profile.affiliationDepartment ?? undefined, position: profile.positionTitle ?? profile.affiliationPosition ?? undefined,
    positionTitle: profile.positionTitle ?? profile.affiliationPosition ?? undefined,
    positionCategory: profile.positionCategory as AcademicAffiliation["positionCategory"],
    positionSource: profile.positionSource as AcademicAffiliation["positionSource"],
    affiliationVerificationStatus: status(profile.affiliationStatus), positionVerificationStatus: status(profile.positionStatus),
    startYear: profile.affiliationStartYear ?? undefined, isCurrent: true, isPrimary: true,
  };
  return {
    id: publicDatabaseId(profile), userId: publicUserId, points: Math.max(0, user.points), publicHandle: profile.publicHandle ?? undefined,
    academicType: academicType as AcademicProfileType,
    academicRole: profile.academicRole as "STUDENT" | "RESEARCHER" | "LECTURER" | null ?? undefined,
    academicRoleVerificationStatus: profile.roleVerificationStatus as VerificationStatus | "SELF_DECLARED",
    primaryPosition: profile.primaryPosition as PrimaryPosition | null ?? undefined,
    positionTitle: profile.positionTitle ?? profile.affiliationPosition ?? titleForPosition(profile.primaryPosition as PrimaryPosition | undefined),
    positionCategory: profile.positionCategory as AcademicProfile["positionCategory"], positionSource: profile.positionSource as AcademicProfile["positionSource"],
    displayName: user.fullName,
    displayNamePolicy,
    avatarUrl: profile.avatarStorageKey ? `/academic-profiles/${publicUserId}/avatar?v=${profile.avatarUpdatedAt?.getTime() ?? 1}` : user.avatarUrl ?? undefined,
    coverUrl: profile.coverStorageKey ? `/academic-profiles/${publicUserId}/cover?v=${profile.coverUpdatedAt?.getTime() ?? 1}` : undefined,
    profileVisibility: profile.profileVisibility as AcademicProfile["profileVisibility"],
    discoverability: {
      showInResearcherSearch: profile.showInResearcherSearch,
      allowCollaborationRequests: profile.allowCollaborationRequests,
    },
    privacy: privacySettings(profile.privacySettings),
    headline: profile.headline ?? undefined, biography: profile.biography ?? undefined, bio: profile.biography ?? undefined,
    academicTitle: profile.academicTitle as AcademicProfile["academicTitle"],
    affiliation: { ...currentAffiliation, institutionalEmail: profile.institutionalEmail ?? undefined, institutionalEmailVerifiedAt: profile.institutionalEmailVerifiedAt?.toISOString() },
    affiliationHistory: mappedAffiliations, institution: currentAffiliation.institutionName, department: currentAffiliation.department,
    institutionalEmail: profile.institutionalEmail ?? undefined, researchInterests: user.researchInterests,
    expertiseAreas: profile.expertiseAreas, skills: profile.skills, researchKeywords: profile.researchKeywords,
     externalIdentities: identities.map((identity) => ({
       provider: identity.provider as AcademicProfile["externalIdentities"][number]["provider"], externalId: identity.externalId ?? undefined,
       profileUrl: identity.profileUrl ?? undefined, status: identity.status as AcademicProfile["externalIdentities"][number]["status"],
       source: identity.source as AcademicProfile["externalIdentities"][number]["source"], linkedAt: identity.linkedAt?.toISOString(), verifiedAt: identity.verifiedAt?.toISOString(),
     })),
     academicIdentityLinks: identityLinks.map((identity) => mapAcademicIdentity({
       ...identity,
       provider: identity.provider as AcademicIdentityLink["provider"],
       connectionMethod: identity.connectionMethod as AcademicIdentityLink["connectionMethod"],
       status: identity.status as AcademicIdentityLink["status"],
       verificationStatus: identity.verificationStatus as AcademicIdentityLink["verificationStatus"],
       visibility: identity.visibility as AcademicIdentityLink["visibility"],
     })),
    featuredWorks: await resolveFeaturedWorks(works.map(work => ({ kind: work.kind as AcademicFeaturedWork["kind"], paperId: work.paperId ?? undefined, projectId: work.projectId ?? undefined, submissionId: work.submissionId ?? undefined, reportId: work.reportId ?? undefined, gapId: work.gapId ?? undefined, doi: work.doi ?? undefined, title: work.title ?? undefined, year: work.year ?? undefined, source: work.source as AcademicFeaturedWork["source"] })), context.viewerId),
    supportAvailability: { enabled: support.enabled === true && (profile.academicRole !== "LECTURER" || isVerifiedLecturer(user, profile)), types: normalizeSupportTypes(support.types), preferredTopics: stringArray(support.preferredTopics), note: stringValue(support.note), updatedAt: iso(support.updatedAt) },
    reviewAvailability: { enabled: review.enabled === true, types: normalizeReviewTypes(review.types), preferredTopics: stringArray(review.preferredTopics), acceptedFields: stringArray(review.acceptedFields), maximumActiveReviews: typeof review.maximumActiveReviews === "number" ? review.maximumActiveReviews : 3, preferredReviewWorkload: stringValue(review.preferredReviewWorkload), note: stringValue(review.note), temporarilyUnavailableUntil: iso(review.temporarilyUnavailableUntil), autoRecommendationEnabled: review.autoRecommendationEnabled !== false, updatedAt: iso(review.updatedAt) },
    verificationStatus: compositeStatus,
    verificationStatuses: { identity: status(profile.identityStatus), email: status(profile.emailStatus), affiliation: status(profile.affiliationStatus), position: status(profile.positionStatus), orcid: status(profile.orcidStatus) },
    verification: { status: compositeStatus, requestedAt: profile.verificationRequestedAt?.toISOString(), verifiedAt: profile.verifiedAt?.toISOString(), verifiedBy: profile.verifiedById ?? undefined, rejectedAt: profile.rejectedAt?.toISOString(), rejectedBy: profile.rejectedById ?? undefined, rejectionReason: profile.rejectionReason ?? undefined, method: profile.verificationMethod ?? undefined, adminNote: context.reviewer ? profile.verificationNote ?? undefined : undefined },
    verificationEvidence: legacyEvidence.map((item) => ({ type: item.type as AcademicProfile["verificationEvidence"][number]["type"], value: item.value ?? undefined, status: item.status as AcademicProfile["verificationEvidence"][number]["status"], source: item.source as AcademicProfile["verificationEvidence"][number]["source"], createdAt: item.createdAt.toISOString(), validatedAt: item.validatedAt?.toISOString() })),
    verificationRequests: requests.map((item) => {
      const metadata = { ...record(item.metadata) };
      if (!context.reviewer) { delete metadata.adminNote; delete metadata.reviewChecklist; delete metadata.identityBindingMethod; delete metadata.identityBindingReference; }
      return { previousRequestId: item.previousRequestId ?? undefined, revision: item.revision, invalidatedAt: item.invalidatedAt?.toISOString(), supersededAt: item.supersededAt?.toISOString(), id: item.id, type: item.verificationType as AcademicProfile["verificationRequests"][number]["type"], targetValue: stringValue(metadata.targetValue), evidenceType: item.sourceType as AcademicProfile["verificationRequests"][number]["evidenceType"], reference: item.sourceReference ?? undefined, status: status(item.status), submittedAt: item.submittedAt.toISOString(), reviewedAt: item.reviewedAt?.toISOString(), rejectionReason: item.rejectionReason ?? undefined, metadata, evidenceFileName: item.evidenceFileName ?? undefined, evidenceMimeType: item.evidenceMimeType ?? undefined, evidenceSizeBytes: item.evidenceSizeBytes ?? undefined,
        verificationMethod: item.verificationMethod as AcademicProfile["verificationRequests"][number]["verificationMethod"] ?? undefined,
        requiresIndependentIdentityBinding: metadata.identityBindingPolicy === 2 && item.verificationMethod === "MANUAL_INSTITUTIONAL_EVIDENCE",
        reviewChecklist: context.reviewer ? record(item.metadata).reviewChecklist as AcademicProfile["verificationRequests"][number]["reviewChecklist"] : undefined,
        sources: (item.sources ?? []).map(source => ({ id: source.id, slot: source.slot, type: source.type as NonNullable<AcademicProfile["verificationRequests"][number]["sources"]>[number]["type"], sourceKind: (source.sourceKind ?? (source.type === "INSTITUTIONAL_EMAIL" ? "EMAIL" : source.storageKey ? "DOCUMENT" : "URL")) as "EMAIL" | "URL" | "DOCUMENT", customEvidenceName: source.customEvidenceName ?? undefined, additionalExplanation: source.additionalExplanation ?? undefined, mimeType: source.mimeType ?? undefined, urlTrustStatus: source.urlTrustStatus as "REGISTRY_APPROVED" | "PENDING_ADMIN_VALIDATION" | "ADMIN_VALIDATED" | undefined ?? undefined, reference: source.reference ?? undefined, fileName: source.fileName ?? undefined, sizeBytes: source.sizeBytes ?? undefined, documentAvailable: Boolean(source.storageKey), status: source.status as "UNCHECKED" | "VALID" | "INVALID" | "INCONCLUSIVE", checkedAt: source.checkedAt?.toISOString(), reviewerNote: context.reviewer ? source.reviewerNote ?? undefined : undefined })),
      };
    }),
    profileHistory: history.map((item) => ({ id: item.id, action: item.actionName, summary: historySummary(item.actionName, item.details), createdAt: item.createdAt.toISOString() })),
    createdAt: profile.createdAt.toISOString(), updatedAt: profile.updatedAt.toISOString(),
  };
}

function visibleTo(setting: AcademicProfilePrivacy[keyof AcademicProfilePrivacy], viewerId?: string): boolean {
  return setting === "PUBLIC" || setting === "REGISTERED_USERS" && Boolean(viewerId);
}
function toPublicProfile(profile: AcademicProfile, viewerId?: string): PublicAcademicProfile {
  const { id: _id, institutionalEmail: _email, displayNamePolicy: _displayNamePolicy, verification: _verification, verificationEvidence: _evidence,
    verificationRequests: _requests, profileHistory: _history, privacy, affiliationHistory: _affiliationHistory,
    affiliation, reviewAvailability, ...safe } = profile;
  const unavailable = reviewAvailability.temporarilyUnavailableUntil ? new Date(reviewAvailability.temporarilyUnavailableUntil).getTime() > Date.now() : false;
  return {
    ...safe,
    researchInterests: visibleTo(privacy.researchInterests, viewerId) ? safe.researchInterests : [],
    expertiseAreas: visibleTo(privacy.expertise, viewerId) ? safe.expertiseAreas : [],
     skills: visibleTo(privacy.expertise, viewerId) ? safe.skills : [],
    researchKeywords: visibleTo(privacy.expertise, viewerId) ? safe.researchKeywords : [],
     // Backfilled scholarly rows must not bypass per-link visibility or resurrect deleted links.
     externalIdentities: safe.externalIdentities.filter((identity) => identity.provider === "GITHUB"),
     academicIdentityLinks: visibleAcademicIdentityLinks(safe.academicIdentityLinks, viewerId, profile.userId),
    affiliation: { id: affiliation.id, institutionId: affiliation.institutionId, hostInstitution: affiliation.hostInstitution, programId: affiliation.programId, programName: affiliation.programName, institutionName: affiliation.institutionName, rorId: affiliation.rorId, department: affiliation.department, position: affiliation.position, positionTitle: affiliation.positionTitle, positionCategory: affiliation.positionCategory, positionSource: affiliation.positionSource, affiliationVerificationStatus: affiliation.affiliationVerificationStatus, positionVerificationStatus: affiliation.positionVerificationStatus, startYear: affiliation.startYear, startDate: affiliation.startDate, endDate: affiliation.endDate, isCurrent: affiliation.isCurrent, isPrimary: affiliation.isPrimary },
    reviewAvailability: { enabled: reviewAvailability.enabled && !unavailable, types: reviewAvailability.types, preferredTopics: reviewAvailability.preferredTopics, acceptedFields: reviewAvailability.acceptedFields, note: reviewAvailability.note, updatedAt: reviewAvailability.updatedAt },
  };
}
function assertVisible(profile: AcademicProfile, viewerId?: string) {
  if (profile.userId === viewerId || profile.profileVisibility === "PUBLIC" || profile.profileVisibility === "MEMBERS_ONLY" && viewerId) return;
  throw AppError.notFound("Academic profile not found");
}
async function publicProfile(userInput: string, viewerId?: string) {
  const owner = await resolveUser(userInput);
  const profile = await buildPrivateProfile(owner.id, { viewerId });
  const publicViewerId = viewerId === owner.id ? publicDatabaseId(owner) : viewerId;
  assertVisible(profile, publicViewerId);
  return toPublicProfile(profile, publicViewerId);
}
function compact(profile: PublicAcademicProfile): CompactAcademicProfile {
  return { userId: profile.userId, publicHandle: profile.publicHandle, displayName: profile.displayName, avatarUrl: profile.avatarUrl, academicRole: profile.academicRole ?? academicRoleForPosition(profile.primaryPosition ?? positionFromLegacy(profile.academicType)), programMajor: profile.academicRole === "STUDENT" || profile.academicType === "student" ? profile.affiliation.programName : undefined, currentPosition: profile.academicRole === "STUDENT" || profile.academicType === "student" ? undefined : profile.positionTitle, affiliationVerification: profile.affiliation.affiliationVerificationStatus, fptAffiliationVerified: profile.affiliation.hostInstitution === true && profile.affiliation.isCurrent === true && profile.affiliation.affiliationVerificationStatus === "VERIFIED", positionVerification: profile.verificationStatuses?.position, academicTitle: profile.academicTitle, institutionName: profile.affiliation.institutionName, verificationStatus: profile.verificationStatus, expertiseAreas: profile.expertiseAreas, supportAvailable: profile.supportAvailability.enabled, reviewAvailable: profile.reviewAvailability.enabled };
}

export const academicProfileService = {
  async getMine(userId: string) { return buildPrivateProfile(userId); },
  async getPublic(userId: string, viewerId?: string) { return publicProfile(userId, viewerId); },
  async getPublicByHandle(handle: string, viewerId?: string) {
    const normalized = normalizePublicHandle(handle);
    if (!isValidResolvablePublicHandle(normalized)) throw AppError.notFound("Academic profile not found");
    const prisma = getPrisma();
    const claimed = await prisma.academicProfileHandle.findUnique({ where: { handle: normalized }, select: { userId: true } })
      ?? await prisma.academicProfile.findFirst({ where: { publicHandle: normalized }, select: { userId: true } });
    if (!claimed) throw AppError.notFound("Academic profile not found");
    return publicProfile(claimed.userId, viewerId);
  },
  async setPublicHandle(userId: string, rawHandle: string) {
    const handle = normalizePublicHandle(rawHandle);
    if (!isValidPublicHandle(handle)) throw AppError.badRequest("Invalid public profile URL");
    const user = await resolveUser(userId), current = await buildPrivateProfile(user.id), prisma = getPrisma();
    if (current.publicHandle === handle) return current;
    const existing = await prisma.academicProfileHandle.findUnique({ where: { handle } });
    if (existing && existing.userId !== user.id) throw AppError.conflict("This public URL is already taken");
    if (!existing && await prisma.academicProfileHandle.count({ where: { userId: user.id } }) >= 20) throw AppError.conflict("Public URL change limit reached");
    try {
      await prisma.$transaction(async (tx) => {
        await tx.academicProfileHandle.upsert({ where: { handle }, create: { handle, userId: user.id }, update: {} });
        await tx.academicProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, publicHandle: handle }, update: { publicHandle: handle } });
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw AppError.conflict("This public URL is already taken");
      throw error;
    }
    await auditService.log("academic_profile.public_handle.updated", { userId: user.id, targetTableName: "academic_profiles", targetRecordId: current.id, details: { previousHandle: current.publicHandle, newHandle: handle } });
    return buildPrivateProfile(user.id);
  },
  async getCompact(userId: string, viewerId?: string) { return compact(await publicProfile(userId, viewerId)); },

  async updateMine(userId: string, input: UpdateAcademicProfileDetailsInput) {
    const prisma = getPrisma(), user = await resolveUser(userId);
    const profile = await prisma.academicProfile.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });
    const currentAffiliation = await prisma.affiliation.findFirst({ where: { userId: user.id, isPrimary: true, isCurrent: true } });
    const requested = input.affiliation ?? {};
    let requestedInstitution = requested.institutionName ?? input.institution;
    if (requested.institutionId) {
      const institution = await prisma.institution.findFirst({ where: { id: requested.institutionId, isActive: true, status: "ACTIVE" } });
      if (!institution) throw AppError.badRequest("Selected institution is no longer available");
      requestedInstitution = institution.name;
    }
    const requestedDepartment = requested.department ?? input.department, requestedEmail = requested.institutionalEmail ?? input.institutionalEmail;
    if (requestedInstitution !== undefined && !requestedInstitution.trim()) throw AppError.badRequest("Institution is required");
    const selectedInstitution = requestedInstitution !== undefined
      ? requested.institutionId
        ? await prisma.institution.findUniqueOrThrow({ where: { id: requested.institutionId } })
        : await resolveAcademicInstitution(requestedInstitution)
      : null;
    if (selectedInstitution) requestedInstitution = selectedInstitution.name;
    const requestedTitle = input.positionTitle ?? requested.position;
    const rolePosition = input.academicRole === "STUDENT" ? "STUDENT" : input.academicRole === "LECTURER" ? "LECTURER" : input.academicRole === "RESEARCHER" ? "RESEARCH_STAFF" : undefined;
    const legacyPosition = rolePosition ?? input.primaryPosition ?? positionFromLegacy(input.academicType);
    const positionInputProvided = requestedTitle !== undefined || legacyPosition !== undefined;
    const nextTitle = requestedTitle ?? (legacyPosition !== undefined ? titleForPosition(legacyPosition) : profile.positionTitle ?? undefined);
    const classification = nextTitle ? classifyAcademicPosition(nextTitle) : { category: (legacyPosition === "STUDENT" || legacyPosition === "LECTURER" || legacyPosition === "RESEARCH_STAFF" ? legacyPosition : "UNCLASSIFIED") as AcademicPositionCategory, source: "PREDEFINED" as const };
    const nextPrimaryPosition = rolePosition ?? (requestedTitle !== undefined ? primaryFromCategory(classification.category, legacyPosition ?? (classification.category === "UNCLASSIFIED" ? profile.primaryPosition as PrimaryPosition : undefined)) : legacyPosition);
    const positionChanged = positionInputProvided && (nextTitle !== profile.positionTitle || classification.category !== profile.positionCategory || classification.source !== profile.positionSource || (nextPrimaryPosition ?? null) !== (profile.primaryPosition ?? null));
    const institutionChanged = selectedInstitution !== null && selectedInstitution.id !== currentAffiliation?.institutionId;
    const positionVerificationTargetChanged = positionChanged || institutionChanged;
    const emailChanged = requestedEmail !== undefined && requestedEmail.toLowerCase() !== profile.institutionalEmail?.toLowerCase();
    const identities = await prisma.academicExternalIdentity.findMany({ where: { profileId: profile.id } });
    const incomingOrcid = input.externalIdentities?.find((item) => item.provider === "ORCID"), oldOrcid = identities.find((item) => item.provider === "ORCID");
    const orcidChanged = input.externalIdentities !== undefined && JSON.stringify(incomingOrcid ?? null) !== JSON.stringify(oldOrcid ? { provider: "ORCID", externalId: oldOrcid.externalId ?? undefined, profileUrl: oldOrcid.profileUrl ?? undefined } : null);
    const resolvedWorks = input.featuredWorks ? await prepareFeaturedWorks(input.featuredWorks, user.id) : [];
    const nextRole = input.academicRole ?? (nextPrimaryPosition ? academicRoleForPosition(nextPrimaryPosition) : profile.academicRole);
    const enteringLecturerRole = nextRole === "LECTURER" && profile.academicRole !== "LECTURER";
    const declaredInstitution = selectedInstitution;
    let nextProgramId: string | null | undefined;
    const now = new Date(), nextPrivacy = input.privacy ? { ...privacySettings(profile.privacySettings), ...input.privacy } : undefined;
    let displayNameChanged = false;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
      if (input.supportAvailability?.enabled && nextRole === "LECTURER") {
        if (positionVerificationTargetChanged) throw AppError.forbidden("Verify your current Lecturer position before enabling mentorship");
        await assertVerifiedLecturer(tx, user.id);
      }
      if (selectedInstitution && !await tx.institution.findFirst({ where: { id: selectedInstitution.id, isActive: true, status: "ACTIVE" } })) throw AppError.badRequest("Selected institution is no longer available");
      if (requestedEmail !== undefined) {
        const live = await tx.academicProfile.findUniqueOrThrow({ where: { id: profile.id } });
        if (live.institutionalEmail !== profile.institutionalEmail) throw AppError.conflict("Institutional email changed; refresh before saving");
      }
      if (positionInputProvided || requestedInstitution !== undefined || requested.programId || requested.programName) {
        const liveProfile = await tx.academicProfile.findUnique({ where: { id: profile.id } });
        if (!liveProfile || liveProfile.positionTitle !== profile.positionTitle || liveProfile.primaryPosition !== profile.primaryPosition
          || liveProfile.academicRole !== profile.academicRole || liveProfile.roleVerificationStatus !== profile.roleVerificationStatus) throw AppError.conflict("Academic identity changed; refresh before saving");
        const liveAffiliation = await tx.affiliation.findFirst({ where: { userId: user.id, isPrimary: true, isCurrent: true } });
        if (liveAffiliation?.id !== currentAffiliation?.id || liveAffiliation?.updatedAt.getTime() !== currentAffiliation?.updatedAt.getTime()) throw AppError.conflict("Academic affiliation changed; refresh before saving");
      }
      if (requested.programId || requested.programName || institutionChanged || input.academicRole !== undefined) {
        if (nextRole !== "STUDENT") nextProgramId = null;
        else {
          const institution = requested.institutionId
            ? await tx.institution.findFirst({ where: { id: requested.institutionId, isActive: true, status: "ACTIVE" } })
            : declaredInstitution ?? await tx.institution.findFirst({ where: { name: { equals: requestedInstitution ?? currentAffiliation?.institutionName ?? user.institution ?? "", mode: "insensitive" }, isActive: true, status: "ACTIVE" } });
          if (!institution) throw AppError.badRequest("Choose an active institution before editing your program");
          let programId = requested.programId ?? (!institutionChanged ? currentAffiliation?.programId : undefined);
          if (requested.programName && !requested.programId) {
            const name = requested.programName.trim();
            const existing = await tx.academicProgram.findFirst({ where: { institutionId: institution.id, name: { equals: name, mode: "insensitive" } } });
            const program = existing ?? await tx.academicProgram.upsert({ where: { institutionId_name: { institutionId: institution.id, name } }, create: { institutionId: institution.id, name }, update: {} });
            if (!program.isActive) throw AppError.badRequest("Selected program is no longer available");
            programId = program.id;
          }
          if (!programId || !await tx.academicProgram.findFirst({ where: { id: programId, institutionId: institution.id, isActive: true } })) throw AppError.badRequest("Program / Major is required for students");
          nextProgramId = programId;
        }
      }
      if (input.displayName !== undefined) displayNameChanged = await applyDisplayNameChangeLimit(tx, user.id, input.displayName, now);
      await tx.user.update({ where: { id: user.id }, data: { ...(nextPrimaryPosition !== undefined ? { academicProfileType: compatibilityType(nextPrimaryPosition) } : {}), ...(requestedInstitution !== undefined ? { institution: requestedInstitution || null } : {}), ...(input.researchInterests !== undefined ? { researchInterests: input.researchInterests } : {}) } });
      await tx.academicProfile.update({ where: { id: profile.id }, data: {
        ...(nextPrimaryPosition !== undefined ? { primaryPosition: nextPrimaryPosition, academicRole: academicRoleForPosition(nextPrimaryPosition) } : {}),
        ...(positionInputProvided ? { positionTitle: nextTitle, positionCategory: classification.category, positionSource: classification.source } : {}),
        ...(positionVerificationTargetChanged ? { positionStatus: "NOT_SUBMITTED", roleVerificationStatus: "SELF_DECLARED", roleVerificationMethod: null, roleVerifiedAt: null, roleVerifiedById: null, verificationStatus: "SELF_DECLARED", verificationRequestedAt: null, verifiedAt: null, verifiedById: null } : {}),
        ...(institutionChanged ? { affiliationStatus: "NOT_SUBMITTED" } : {}), ...(input.headline !== undefined ? { headline: input.headline || null } : {}),
        ...(input.profileVisibility !== undefined ? { profileVisibility: input.profileVisibility } : {}), ...(nextPrivacy ? { privacySettings: nextPrivacy as never } : {}),
        ...(input.discoverability?.showInResearcherSearch !== undefined ? { showInResearcherSearch: input.discoverability.showInResearcherSearch } : {}),
        ...(input.discoverability?.allowCollaborationRequests !== undefined ? { allowCollaborationRequests: input.discoverability.allowCollaborationRequests } : {}),
        ...((input.biography ?? input.bio) !== undefined ? { biography: (input.biography ?? input.bio) || null } : {}), ...(input.academicTitle !== undefined ? { academicTitle: input.academicTitle } : {}),
        ...(input.expertiseAreas !== undefined ? { expertiseAreas: input.expertiseAreas } : {}), ...(input.skills !== undefined ? { skills: input.skills } : {}), ...(input.researchKeywords !== undefined ? { researchKeywords: input.researchKeywords } : {}),
        ...(requested.rorId !== undefined ? { affiliationRorId: requested.rorId || null } : {}), ...(requestedDepartment !== undefined ? { affiliationDepartment: requestedDepartment || null } : {}), ...(positionInputProvided ? { affiliationPosition: nextTitle || null } : {}),
        ...(requested.startYear !== undefined ? { affiliationStartYear: requested.startYear } : {}), ...(requestedEmail !== undefined ? { institutionalEmail: requestedEmail || null } : {}),
        // General research support is not consent to receive official mentorship requests.
        ...(enteringLecturerRole ? { supportAvailability: { ...record(profile.supportAvailability), enabled: false, updatedAt: now.toISOString() } as never } : {}),
        ...(input.supportAvailability !== undefined ? { supportAvailability: { ...input.supportAvailability, updatedAt: now.toISOString() } as never } : {}), ...(input.reviewAvailability !== undefined ? { reviewAvailability: { ...input.reviewAvailability, updatedAt: now.toISOString() } as never } : {}),
        ...(emailChanged ? { institutionalEmailVerifiedAt: null, emailStatus: "NOT_SUBMITTED" } : {}), ...(orcidChanged ? { orcidStatus: "NOT_SUBMITTED" } : {}),
      } });
      if (positionVerificationTargetChanged) {
        await tx.verificationEvidence.updateMany({ where: { userId: user.id, verificationType: "POSITION", status: "VERIFIED", invalidatedAt: null }, data: { invalidatedAt: now } });
        await tx.verificationEvidence.updateMany({ where: { userId: user.id, verificationType: "POSITION", status: { in: ["PENDING", "NEEDS_MORE_INFORMATION"] } }, data: { status: "INVALIDATED", invalidatedAt: now } });
      }
      if (institutionChanged) await tx.verificationEvidence.updateMany({ where: { userId: user.id, verificationType: "AFFILIATION", status: "PENDING" }, data: { status: "INVALIDATED", reviewedAt: now, rejectionReason: "Affiliation changed by profile owner" } });
      if (requestedInstitution !== undefined && requestedInstitution.trim() && !institutionChanged && currentAffiliation) {
        const affiliationData = { institutionName: requestedInstitution, department: requestedDepartment ?? currentAffiliation?.department, rorId: requested.rorId ?? currentAffiliation?.rorId, academicTitle: input.academicTitle === undefined ? currentAffiliation?.academicTitle : input.academicTitle, positionTitle: nextTitle, positionCategory: classification.category, positionSource: classification.source, positionStatus: positionVerificationTargetChanged ? "NOT_SUBMITTED" : currentAffiliation?.positionStatus ?? "NOT_SUBMITTED" };
        await tx.affiliation.update({ where: { id: currentAffiliation.id }, data: affiliationData });
      } else if (positionChanged && currentAffiliation) await tx.affiliation.update({ where: { id: currentAffiliation.id }, data: { positionTitle: nextTitle, positionCategory: classification.category, positionSource: classification.source, positionStatus: "NOT_SUBMITTED" } });
      if (nextProgramId !== undefined && currentAffiliation && !institutionChanged) await tx.affiliation.update({ where: { id: currentAffiliation.id }, data: { programId: nextProgramId } });
      if (institutionChanged && selectedInstitution) {
        if (currentAffiliation) await tx.affiliation.update({ where: { id: currentAffiliation.id }, data: { isPrimary: false, isCurrent: false, endDate: now, validUntil: now } });
        await tx.affiliation.create({ data: {
          userId: user.id, institutionId: selectedInstitution.id, institutionName: selectedInstitution.name,
          department: requestedDepartment, rorId: requested.rorId,
          verificationStatus: "NOT_SUBMITTED", verificationSource: "SELF_DECLARED", isPrimary: true, isCurrent: true,
          positionTitle: nextTitle, positionCategory: classification.category, positionSource: classification.source, positionStatus: "NOT_SUBMITTED",
          programId: nextProgramId, academicTitle: input.academicTitle,
          startDate: requested.startYear ? new Date(Date.UTC(requested.startYear, 0, 1)) : now,
          validFrom: requested.startYear ? new Date(Date.UTC(requested.startYear, 0, 1)) : now,
        } });
      }
      if (emailChanged) await tx.academicEmailVerificationChallenge.updateMany({ where: { userId: user.id, consumedAt: null }, data: { consumedAt: now } });
      if (input.externalIdentities !== undefined) {
        await tx.academicExternalIdentity.deleteMany({ where: { profileId: profile.id } });
        if (input.externalIdentities.length) await tx.academicExternalIdentity.createMany({ data: input.externalIdentities.map((identity, index) => {
          const old = identities.find((item) => item.provider === identity.provider && item.externalId === (identity.externalId ?? null) && item.profileUrl === (identity.profileUrl ?? null));
          const trusted = old && ["OAUTH", "SYSTEM", "ADMIN"].includes(old.source);
          return { profileId: profile.id, provider: identity.provider, externalId: identity.externalId, profileUrl: identity.profileUrl, status: trusted ? old.status : "UNVERIFIED", source: trusted ? old.source : "SELF_ASSERTED", linkedAt: trusted ? old.linkedAt : null, verifiedAt: trusted ? old.verifiedAt : null, position: index };
        }) });
      }
      if (input.featuredWorks !== undefined) {
        await tx.academicFeaturedWork.deleteMany({ where: { profileId: profile.id } });
        if (resolvedWorks.length) await tx.academicFeaturedWork.createMany({ data: resolvedWorks.map((work, index) => ({ profileId: profile.id, ...work, position: index })) });
      }
    });
    await capabilityService.evaluate(user.id);
    if (displayNameChanged) await auditService.log("academic_profile.display_name.changed", { userId: user.id, targetTableName: "users", targetRecordId: user.id });
    if (positionChanged) await auditService.log("academic_profile.position.changed", { userId: user.id, targetTableName: "academic_profiles", targetRecordId: profile.id, details: { previous: profile.positionTitle, next: nextTitle, previousStatus: profile.positionStatus } });
    if (institutionChanged) await auditService.log("academic_profile.affiliation.changed", { userId: user.id, targetTableName: "affiliations", targetRecordId: profile.id, details: { previous: currentAffiliation?.institutionName ?? user.institution, next: requestedInstitution } });
    await auditService.log("academic_profile.updated", { userId: user.id, targetTableName: "academic_profiles", targetRecordId: profile.id, details: { fields: Object.keys(input).filter((field) => field !== "institutionalEmail") } });
    return buildPrivateProfile(user.id);
  },

  async getVerificationStatus(userId: string, submissionKey?: string, requestId?: string, page = 1) {
    const profile = await this.getMine(userId);
    const owner = await resolveUser(userId);
    const submission = submissionKey ? await getPrisma().verificationEvidence.findUnique({ where: { userId_submissionKey: { userId: owner.id, submissionKey } } }) : null;
    return { lecturer: await lecturerTracking(owner.id, requestId, page), academicType: profile.academicType, statuses: profile.verificationStatuses, requests: profile.verificationRequests, submission: submission ? { requestId: submission.id, status: submission.status, submittedAt: submission.submittedAt.toISOString(), submissionKey: submission.submissionKey, accepted: true as const } : null };
  },
  async requestVerification(userId: string, input: VerificationRequestInput, file?: EvidenceUpload, additionalFile?: EvidenceUpload, evidenceFiles: EvidenceUpload[] = []) {
    const prisma = getPrisma(), user = await resolveUser(userId);
    if (input.type === "AFFILIATION") {
      if (additionalFile || input.path || input.sources || evidenceFiles.length) throw AppError.badRequest("Adaptive evidence is only supported for Lecturer position verification");
      await affiliationVerificationService.submit(user.id, input, file);
      return buildPrivateProfile(user.id);
    }
    const profile = await prisma.academicProfile.findUnique({ where: { userId: user.id } });
    if (!profile) throw AppError.badRequest("Complete your academic profile before requesting verification");
    if (profile.academicRole === "LECTURER" || input.submissionKey) {
      const accepted = await submitLecturerVerification(user.id, input, file, additionalFile, evidenceFiles);
      if (input.submissionKey) return accepted;
      return buildPrivateProfile(user.id);
    }
    if (additionalFile || input.path || input.sources || evidenceFiles.length) throw AppError.badRequest("Adaptive evidence is only supported for Lecturer position verification");
    const affiliation = await prisma.affiliation.findFirst({ where: { userId: user.id, isPrimary: true } });
    const targetValue = input.type === "POSITION" ? profile.positionTitle : affiliation?.institutionName ?? user.institution;
    if (!targetValue) throw AppError.badRequest(`Add a current ${input.type === "POSITION" ? "position" : "affiliation"} first`);
    if (input.type === "POSITION" && profile.academicRole === "LECTURER" && (!user.institution || !["DOCUMENT", "INSTITUTIONAL_PROFILE"].includes(input.evidenceType))) throw AppError.badRequest("Lecturer verification requires institutional staff evidence or a private PDF");
    if (input.type === "POSITION" && !profile.positionTitle) throw AppError.badRequest("Add your current position first");
    if (await prisma.verificationEvidence.findFirst({ where: { userId: user.id, verificationType: input.type, status: "PENDING" } })) throw AppError.conflict(`${input.type === "POSITION" ? "Position" : "Affiliation"} verification is already pending`);
    if (input.evidenceType === "DOCUMENT") {
      assertPdfMagic(file?.buffer);
      if (!file || file.mimetype !== "application/pdf" || file.buffer.length > 10 * 1024 * 1024) throw AppError.badRequest("Upload a PDF of up to 10 MB");
      if (input.type !== "POSITION") throw AppError.badRequest("Document evidence is currently supported for position verification only");
    } else if (file) throw AppError.badRequest("A file is only accepted for document evidence");
    if (input.type === "POSITION" && input.evidenceType === "ORCID") {
      throw AppError.badRequest("ORCID can support scholarly identity, but it is not sufficient by itself to verify Lecturer employment");
    }
    let reference = input.reference;
    if (input.evidenceType === "INSTITUTIONAL_EMAIL") {
      if (!profile.institutionalEmail || !profile.institutionalEmailVerifiedAt) throw AppError.badRequest("Verify your institutional email first");
      reference = profile.institutionalEmail;
    }
    if (input.evidenceType === "ORCID") {
      const orcid = await prisma.academicIdentityLink.findFirst({ where: { userId: user.id, provider: "ORCID" } })
        ?? await prisma.academicExternalIdentity.findFirst({ where: { profileId: profile.id, provider: "ORCID" } });
      if (!orcid) throw AppError.badRequest("Connect ORCID before using it as evidence");
      reference = ("identifier" in orcid ? orcid.identifier : orcid.externalId) ?? orcid.profileUrl ?? undefined;
    }
    const now = new Date();
    const fileKey = file ? await verificationEvidenceStorage.save(user.id, file.buffer) : undefined;
    let request;
    try {
      request = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
      const live = await tx.academicProfile.findUnique({ where: { id: profile.id } });
      const liveUser = await tx.user.findUnique({ where: { id: user.id } });
      const liveAffiliation = await tx.affiliation.findFirst({ where: { userId: user.id, isPrimary: true } });
      if (!liveUser?.isActive || liveUser.accountStatus !== "ACTIVE" || liveUser.institution !== user.institution || liveAffiliation?.institutionId !== affiliation?.institutionId || liveAffiliation?.institutionName !== affiliation?.institutionName) throw AppError.conflict("Account or institution changed; refresh before submitting");
      if (!live || live.positionTitle !== profile.positionTitle || live.academicRole !== profile.academicRole || live.primaryPosition !== profile.primaryPosition) throw AppError.conflict("Academic position changed; refresh before submitting");
      if (await tx.verificationEvidence.findFirst({ where: { userId: user.id, verificationType: input.type, status: "PENDING" } })) throw AppError.conflict("Verification is already pending");
      await tx.verificationEvidence.updateMany({ where: { userId: user.id, verificationType: input.type, status: "NEEDS_MORE_INFORMATION", supersededAt: null }, data: { supersededAt: now } });
      const created = await tx.verificationEvidence.create({ data: { userId: user.id, academicProfileId: profile.id, verificationType: input.type, sourceType: input.evidenceType, sourceReference: reference, evidenceStorageKey: fileKey, evidenceFileName: file ? safeEvidenceFileName(file.originalname) : null, evidenceMimeType: file ? "application/pdf" : null, evidenceSizeBytes: file?.size ?? null, status: "PENDING", metadata: { targetValue, institutionName: affiliation?.institutionName ?? user.institution, academicRole: profile.academicRole, positionTitle: profile.positionTitle, primaryPosition: profile.primaryPosition, positionCategory: profile.positionCategory, staffId: input.staffId, additionalNote: input.additionalNote, institutionId: affiliation?.institutionId } } });
      await tx.academicProfile.update({ where: { id: profile.id }, data: input.type === "POSITION" ? { positionStatus: "PENDING", roleVerificationStatus: "PENDING", verificationStatus: "PENDING", verificationRequestedAt: now, rejectionReason: null } : { affiliationStatus: "PENDING" } });
      if (affiliation) await tx.affiliation.update({ where: { id: affiliation.id }, data: input.type === "POSITION" ? { positionStatus: "PENDING" } : { verificationStatus: "PENDING" } });
      if (fileKey) await tx.verificationEvidenceDeletion.deleteMany({ where: { storageKey: fileKey } });
      return created;
      });
    } catch (error) {
      if (fileKey) await prisma.verificationEvidenceDeletion.upsert({ where: { storageKey: fileKey }, create: { storageKey: fileKey, userId: user.id }, update: { notBefore: new Date() } });
      if ((error as { code?: string }).code === "P2002") throw AppError.conflict("A verification request is already pending for this target");
      throw error;
    }
    await auditService.log("academic_profile.verification.requested", { userId: user.id, targetTableName: "verification_evidence", targetRecordId: request.id, details: { type: input.type, evidenceType: input.evidenceType, targetValue } });
    await auditService.log(input.type === "POSITION" && profile.academicRole === "LECTURER" ? "LECTURER_VERIFICATION_SUBMITTED" : "ACADEMIC_ROLE_VERIFICATION_SUBMITTED", { userId: user.id, targetTableName: "verification_evidence", targetRecordId: request.id, details: { evidenceType: input.evidenceType } });
    await notificationService.create({ userId: user.id, title: "Lecturer verification submitted", message: "Open Academic Profile to view your verification status.", type: "academic_verification_submitted", targetKind: "academic_profile", targetId: profile.id });
    return buildPrivateProfile(user.id);
  },
  async listVerificationRequests(statusValue: string, page: number, pageSize: number) {
    const prisma = getPrisma();
    const isFiltered = statusValue && statusValue !== "ALL";
    const where = {
      verificationType: { in: ["POSITION", "AFFILIATION"] },
      ...(isFiltered ? { status: statusValue } : {}),
      ...(statusValue === "NEEDS_MORE_INFORMATION" ? { supersededAt: null } : {}),
    };
    const [requests, total, statusCountsRaw] = await Promise.all([
      prisma.verificationEvidence.findMany({ where, orderBy: { submittedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.verificationEvidence.count({ where }),
      prisma.verificationEvidence.groupBy({
        by: ["status"],
        where: { verificationType: { in: ["POSITION", "AFFILIATION"] } },
        _count: { status: true },
      }),
    ]);
    const statusCounts: Record<string, number> = Object.fromEntries(
      statusCountsRaw.map((item) => [item.status, item._count.status])
    );
    statusCounts.ALL = statusCountsRaw.reduce((sum, item) => sum + item._count.status, 0);
    const data = await Promise.all(requests.map(async (request) => {
      const profile = await buildPrivateProfile(request.userId, { viewerId: request.userId, reviewer: true });
      const history = profile.verificationRequests.filter((item) => item.type === request.verificationType);
      const currentRequest = history.find((item) => item.id === request.id);
      if (!currentRequest) throw AppError.notFound("Verification request not found");
      const account = await prisma.user.findUnique({ where: { id: request.userId }, select: { email: true, emailVerifiedAt: true } });
      return { profile, request: currentRequest, history, accountEmail: account?.email, accountEmailVerified: Boolean(account?.emailVerifiedAt) };
    }));
    return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)), statusCounts } };
  },
  async getVerificationDetails(requestId: string) {
    const parsed = parseDatabaseId(requestId);
    if (!parsed || parsed.kind !== "uuid") throw AppError.notFound("Verification request not found");
    const request = await getPrisma().verificationEvidence.findUnique({ where: { id: parsed.value } });
    if (!request || !["POSITION", "AFFILIATION"].includes(request.verificationType)) throw AppError.notFound("Verification request not found");
    const profile = await buildPrivateProfile(request.userId, { viewerId: request.userId, reviewer: true });
    const history = profile.verificationRequests.filter((item) => item.type === request.verificationType);
    const currentRequest = history.find((item) => item.id === request.id);
    if (!currentRequest) throw AppError.notFound("Verification request not found");
    const account = await getPrisma().user.findUnique({ where: { id: request.userId }, select: { email: true, emailVerifiedAt: true } });
    return { profile, request: currentRequest, history, accountEmail: account?.email, accountEmailVerified: Boolean(account?.emailVerifiedAt) };
  },
  async verificationEvidenceFileLocation(requestId: string, adminId: string, sourceId?: string) {
    const admin = await resolveUser(adminId);
    if (admin.systemRole !== "ADMIN" || admin.accountStatus !== "ACTIVE") throw AppError.forbidden("Administrator access required");
    const parsed = parseDatabaseId(requestId);
    if (!parsed || parsed.kind !== "uuid") throw AppError.notFound("Verification evidence not found");
    const request = await getPrisma().verificationEvidence.findUnique({ where: { id: parsed.value }, select: { userId: true, verificationType: true, evidenceStorageKey: true, evidenceMimeType: true } });
    if (!request || !["POSITION", "AFFILIATION"].includes(request.verificationType)) throw AppError.notFound("Verification evidence not found");
    const parsedSource = sourceId ? parseDatabaseId(sourceId) : undefined;
    if (sourceId && parsedSource?.kind !== "uuid") throw AppError.notFound("Verification evidence not found");
    const source = parsedSource ? await getPrisma().verificationEvidenceSource.findFirst({ where: { id: parsedSource.value, requestId: parsed.value } }) : undefined;
    const key = sourceId ? source?.storageKey : request.evidenceStorageKey;
    if (!key) throw AppError.notFound("Verification evidence not found");
    return { ...await verificationEvidenceStorage.adminLocation(key, request.userId), mimeType: source?.mimeType ?? request.evidenceMimeType ?? "application/pdf" };
  },
  async ownVerificationEvidenceFileLocation(requestId: string, userId: string, sourceId?: string) {
    const owner = await resolveUser(userId);
    if (!owner.isActive || owner.accountStatus !== "ACTIVE") throw AppError.unauthorized();
    const parsed = parseDatabaseId(requestId), parsedSource = sourceId ? parseDatabaseId(sourceId) : undefined;
    if (parsed?.kind !== "uuid" || sourceId && parsedSource?.kind !== "uuid") throw AppError.notFound("Verification evidence not found");
    const request = await getPrisma().verificationEvidence.findFirst({ where: { id: parsed.value, userId: owner.id, verificationType: "POSITION" } });
    if (!request) throw AppError.notFound("Verification evidence not found");
    const source = parsedSource ? await getPrisma().verificationEvidenceSource.findFirst({ where: { id: parsedSource.value, requestId: request.id } }) : null;
    const key = sourceId ? source?.storageKey : request.evidenceStorageKey;
    if (!key) throw AppError.notFound("Verification evidence not found");
    return { ...await verificationEvidenceStorage.adminLocation(key, owner.id), mimeType: source?.mimeType ?? request.evidenceMimeType ?? "application/pdf" };
  },
  async decideVerification(requestId: string, input: VerificationDecisionInput, adminId: string) {
    const prisma = getPrisma(), parsed = parseDatabaseId(requestId);
    if (!parsed || parsed.kind !== "uuid") throw AppError.notFound("Verification request not found");
    const [request, admin] = await Promise.all([prisma.verificationEvidence.findUnique({ where: { id: parsed.value } }), resolveUser(adminId)]);
    if (!request || !["POSITION", "AFFILIATION"].includes(request.verificationType)) throw AppError.notFound("Verification request not found");
    if (request.status !== "PENDING" || request.userId === admin.id) throw AppError.conflict("Only a pending verification can be decided by another user");
    if (admin.systemRole !== "ADMIN" || admin.accountStatus !== "ACTIVE") throw AppError.forbidden("Administrator access required");
    const profile = request.academicProfileId ? await prisma.academicProfile.findUnique({ where: { id: request.academicProfileId } }) : await prisma.academicProfile.findUnique({ where: { userId: request.userId } });
    if (!profile) throw AppError.notFound("Academic profile not found");
    let affiliation = await prisma.affiliation.findFirst({ where: { userId: request.userId, isPrimary: true } });
    const now = new Date(), approved = input.decision === "approve", nextStatus = approved ? "VERIFIED" : input.decision === "more_info" ? "NEEDS_MORE_INFORMATION" : "REJECTED";
    let reviewedMethod: string | null = null;
    await prisma.$transaction(async (tx) => {
      for (const id of [request.userId, admin.id].sort()) await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
      const liveAdmin = await tx.user.findUnique({ where: { id: admin.id } });
      if (!liveAdmin?.isActive || liveAdmin.accountStatus !== "ACTIVE" || liveAdmin.systemRole !== "ADMIN") throw AppError.forbidden("Administrator access required");
      if (request.verificationType === "AFFILIATION") {
        const current = await tx.affiliation.findFirst({ where: { userId: request.userId, isPrimary: true, isCurrent: true } });
        const position = await tx.academicProfile.findUnique({ where: { id: profile.id } });
        const targetUser = await tx.user.findUnique({ where: { id: request.userId }, select: { accountStatus: true, isActive: true } });
        if (!targetUser?.isActive || targetUser.accountStatus !== "ACTIVE" || !request.evidenceStorageKey) throw AppError.conflict("The account or its private evidence is no longer available for review");
        if (!current || current.id !== record(request.metadata).affiliationId || current.verificationStatus !== "PENDING" || position?.primaryPosition !== record(request.metadata).primaryPosition || (record(request.metadata).academicRole !== undefined && position?.academicRole !== record(request.metadata).academicRole)) throw AppError.conflict("The affiliation or position changed; refresh before reviewing");
        affiliation = current;
      }
      const requestedPosition = stringValue(record(request.metadata).positionTitle) ?? stringValue(record(request.metadata).targetValue);
      const requestedPrimaryPosition = record(request.metadata).primaryPosition;
      const requestedPositionCategory = record(request.metadata).positionCategory;
      const requestedInstitution = stringValue(record(request.metadata).institutionName)?.trim().toLocaleLowerCase() ?? "";
      if (request.verificationType === "POSITION") {
        const live = await tx.academicProfile.findUnique({ where: { id: profile.id } });
        const active = await tx.user.findUnique({ where: { id: request.userId }, select: { isActive: true, accountStatus: true } });
        if (!active?.isActive || active.accountStatus !== "ACTIVE" || (record(request.metadata).academicRole !== undefined && live?.academicRole !== record(request.metadata).academicRole)) throw AppError.conflict("Account or Lecturer role changed before this decision");
        const currentAffiliation = await tx.affiliation.findFirst({ where: { userId: request.userId, isPrimary: true }, select: { institutionName: true } });
        const currentUser = currentAffiliation ? null : await tx.user.findUnique({ where: { id: request.userId }, select: { institution: true } });
        if ((currentAffiliation?.institutionName ?? currentUser?.institution ?? "").trim().toLocaleLowerCase() !== requestedInstitution) {
          throw AppError.conflict("The declared institution changed after this request was submitted");
        }
        if (requestedPrimaryPosition !== undefined || requestedPositionCategory !== undefined) {
          const currentPosition = await tx.academicProfile.findUnique({ where: { id: profile.id }, select: { primaryPosition: true, positionCategory: true } });
          if (!currentPosition || currentPosition.primaryPosition !== (requestedPrimaryPosition ?? null) || currentPosition.positionCategory !== requestedPositionCategory) {
            throw AppError.conflict("The declared position changed after this request was submitted");
          }
        }
      }
      if (request.verificationType === "POSITION" && (profile.academicRole === "LECTURER" || record(request.metadata).academicRole === "LECTURER")) reviewedMethod = await reviewLecturerEvidence(tx, request.id, input, admin.id);
      const updated = await tx.verificationEvidence.updateMany({ where: { id: request.id, status: "PENDING" }, data: { status: nextStatus, reviewedById: admin.id, reviewedAt: now, rejectionReason: input.decision === "approve" ? null : input.reason } });
      if (updated.count !== 1) throw AppError.conflict("This verification request has already been decided");
      const profileData = request.verificationType === "POSITION" ? approved
        ? { positionStatus: nextStatus, roleVerificationStatus: "VERIFIED", roleVerificationMethod: reviewedMethod ?? ("method" in input ? input.method : undefined) ?? "MANUAL_REVIEW", roleVerifiedAt: now, roleVerifiedById: admin.id, verificationStatus: "VERIFIED", verifiedAt: now, verifiedById: admin.id, rejectedAt: null, rejectedById: null, rejectionReason: null, verificationMethod: reviewedMethod ?? ("method" in input ? input.method : undefined) ?? "ADMIN_REVIEW", verificationNote: input.note ?? null }
        : { positionStatus: nextStatus, roleVerificationStatus: input.decision === "more_info" ? "SELF_DECLARED" : "REJECTED", roleVerificationMethod: "MANUAL_REVIEW", roleVerifiedAt: null, roleVerifiedById: admin.id, verificationStatus: input.decision === "more_info" ? "SELF_DECLARED" : "REJECTED", verifiedAt: null, verifiedById: null, rejectedAt: input.decision === "more_info" ? null : now, rejectedById: admin.id, rejectionReason: "reason" in input ? input.reason : undefined, verificationMethod: "ADMIN_REVIEW", verificationNote: input.note ?? null }
        : { affiliationStatus: nextStatus };
      if (request.verificationType === "POSITION") {
        const updatedProfile = await tx.academicProfile.updateMany({ where: { id: profile.id, positionTitle: requestedPosition, ...(requestedPrimaryPosition !== undefined ? { primaryPosition: requestedPrimaryPosition as string | null } : {}), ...(requestedPositionCategory !== undefined ? { positionCategory: String(requestedPositionCategory) } : {}) }, data: profileData });
        if (updatedProfile.count !== 1) throw AppError.conflict("The declared position changed after this request was submitted");
        await tx.affiliation.updateMany({ where: { userId: request.userId, isPrimary: true }, data: { positionStatus: nextStatus } });
      } else {
        await tx.academicProfile.update({ where: { id: profile.id }, data: profileData });
        if (affiliation) await tx.affiliation.update({ where: { id: affiliation.id }, data: { verificationStatus: nextStatus, verificationMethod: "MANUAL_DOCUMENT_REVIEW", verificationSource: "ADMIN", verifiedAt: approved ? now : null, verifiedById: admin.id } });
      }
      if (profile.academicRole === "LECTURER" && request.verificationType === "POSITION") {
        await lecturerVerificationNotification(tx, approved ? "LECTURER_VERIFICATION_APPROVED" : input.decision === "more_info" ? "LECTURER_VERIFICATION_MORE_INFO_REQUIRED" : "LECTURER_VERIFICATION_REJECTED", request);
        await tx.auditLog.create({ data: { userId: admin.id, actionName: "LECTURER_VERIFICATION_DECIDED", targetTableName: "verification_evidence", targetRecordId: request.id, details: { decision: input.decision, method: reviewedMethod ?? "MANUAL_REVIEW" } } });
      }
    });
    await capabilityService.evaluate(request.userId);
    if (request.verificationType === "AFFILIATION") {
      await auditService.log(approved ? "AFFILIATION_VERIFICATION_APPROVED" : input.decision === "more_info" ? "AFFILIATION_MORE_INFO_REQUESTED" : "AFFILIATION_VERIFICATION_REJECTED", { userId: admin.id, targetTableName: "verification_evidence", targetRecordId: request.id, details: { targetUserId: request.userId } });
      await notificationService.create({ userId: request.userId, title: approved ? "FPT Education affiliation verified" : nextStatus === "NEEDS_MORE_INFORMATION" ? "More information needed" : "Affiliation request rejected", message: "Open Academic Profile to view your verification status and review message.", type: `affiliation_${nextStatus.toLowerCase()}`, targetKind: "academic_profile", targetId: profile.id });
      const account = await prisma.user.findUnique({ where: { id: request.userId }, select: { email: true } });
      if (account) await authMailService.sendAffiliationStatus(account.email).catch(() => undefined);
      return buildPrivateProfile(request.userId);
    }
    await auditService.log(`academic_profile.verification.${approved ? "approved" : input.decision === "more_info" ? "more_info" : "rejected"}`, { userId: admin.id, targetTableName: "verification_evidence", targetRecordId: request.id, details: { type: request.verificationType, targetUserId: request.userId } });
    await auditService.log(request.verificationType === "POSITION"
      ? (approved ? "LECTURER_VERIFICATION_APPROVED" : input.decision === "more_info" ? "LECTURER_VERIFICATION_MORE_INFO_REQUESTED" : "LECTURER_VERIFICATION_REJECTED")
      : (approved ? "AFFILIATION_VERIFIED" : "AFFILIATION_REJECTED"), {
      userId: admin.id, targetTableName: "verification_evidence", targetRecordId: request.id,
      details: { targetUserId: request.userId, method: reviewedMethod ?? "MANUAL_REVIEW" },
    });
    if (profile.academicRole !== "LECTURER") await notificationService.create({ userId: request.userId, title: `${request.verificationType === "POSITION" ? "Position" : "Affiliation"} verification ${approved ? "approved" : input.decision === "more_info" ? "needs more information" : "rejected"}`, message: approved ? "Your academic verification is now visible on your profile." : "Your verification request needs changes. Open Academic Profile for details.", type: `academic_verification_${approved ? "approved" : input.decision === "more_info" ? "more_info" : "rejected"}`, targetKind: "academic_profile", targetId: profile.id });
    return buildPrivateProfile(request.userId);
  },
  async listLecturers(query: LecturerListQueryInput) {
    const prisma = getPrisma();
    const users = await prisma.user.findMany({ where: { isActive: true, accountStatus: "ACTIVE", systemRole: "USER", ...(query.institution ? { institution: { contains: query.institution, mode: "insensitive" } } : {}), ...(query.researchInterest ? { researchInterests: { has: query.researchInterest } } : {}) }, select: { id: true } });
    const where = { userId: { in: users.map((item) => item.id) }, academicRole: "LECTURER", profileVisibility: "PUBLIC", showInResearcherSearch: true, ...(query.verifiedOnly ? { positionStatus: "VERIFIED", roleVerificationStatus: "VERIFIED" } : {}), ...(query.expertise ? { expertiseAreas: { has: query.expertise } } : {}), ...(query.supportAvailable !== undefined ? { supportAvailability: { path: ["enabled"], equals: query.supportAvailable } } : {}), ...(query.reviewAvailable !== undefined ? { reviewAvailability: { path: ["enabled"], equals: query.reviewAvailable } } : {}) };
    const [profiles, total] = await Promise.all([prisma.academicProfile.findMany({ where, orderBy: [{ verifiedAt: "desc" }, { updatedAt: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }), prisma.academicProfile.count({ where })]);
    return { data: await Promise.all(profiles.map((item) => this.getCompact(item.userId))), meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) } };
  },
  async isVerifiedLecturer(userId: string) {
    const user = await resolveUser(userId);
    const profile = await getPrisma().academicProfile.findUnique({ where: { userId: user.id }, select: { academicRole: true, roleVerificationStatus: true, positionStatus: true } });
    return Boolean(user.emailVerifiedAt) && profile?.academicRole === "LECTURER" && profile.roleVerificationStatus === "VERIFIED" && profile.positionStatus === "VERIFIED";
  },
};
