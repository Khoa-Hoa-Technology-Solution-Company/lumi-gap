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
import { notificationService } from "../notifications/notification.service.js";
import { visibleAcademicIdentityLinks } from "./academic-identity.service.js";
import { institutionalEmailVerificationService } from "./institutional-email-verification.service.js";
import type { LecturerListQueryInput, UpdateAcademicProfileDetailsInput, VerificationDecisionInput, VerificationRequestInput } from "./dto/academic-profile.schema.js";
import { isValidPublicHandle, isValidResolvablePublicHandle, normalizePublicHandle } from "./public-handle.js";
import { verificationEvidenceStorage } from "./verification-evidence-storage.service.js";
import { assertPdfMagic } from "../../common/middleware/upload.js";

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
  if (!user || user.accountStatus !== "ACTIVE") throw AppError.notFound("Academic profile not found");
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
  academicTitle: string | null; positionCategory: string; positionSource: string; positionStatus: string;
  verificationStatus: string; isPrimary: boolean; validFrom: Date | null; validUntil: Date | null;
}): AcademicAffiliation {
  return {
    id: item.id, institutionName: item.institutionName, rorId: item.rorId ?? undefined, department: item.department ?? undefined,
    position: item.positionTitle ?? item.academicTitle ?? undefined, positionTitle: item.positionTitle ?? item.academicTitle ?? undefined,
    positionCategory: item.positionCategory as AcademicAffiliation["positionCategory"], positionSource: item.positionSource as AcademicAffiliation["positionSource"],
    affiliationVerificationStatus: status(item.verificationStatus), positionVerificationStatus: status(item.positionStatus),
    startDate: item.validFrom?.toISOString(), endDate: item.validUntil?.toISOString(), startYear: item.validFrom?.getUTCFullYear(),
    isCurrent: item.validUntil === null, isPrimary: item.isPrimary,
  };
}
function historySummary(action: string, details: unknown): string {
  const values = record(details);
  if (action === "academic_profile.position.changed") return `Position changed: ${stringValue(values.previous) ?? "Not set"} → ${stringValue(values.next) ?? "Not set"}`;
  if (action === "academic_profile.affiliation.changed") return `Current affiliation changed: ${stringValue(values.previous) ?? "Not set"} → ${stringValue(values.next) ?? "Not set"}`;
  if (action === "affiliation.verified") return "Academic affiliation verified";
  if (action.includes("verification.approved")) return `${stringValue(values.type) ?? "Academic"} verification approved`;
  if (action.includes("verification.rejected")) return `${stringValue(values.type) ?? "Academic"} verification rejected`;
  if (action === "academic_profile.avatar.updated") return "Profile photo updated";
  if (action === "academic_profile.cover.updated") return "Cover image updated";
  return "Academic profile updated";
}

async function buildPrivateProfile(userId: string): Promise<AcademicProfile> {
  const prisma = getPrisma();
  const user = await resolveUser(userId);
  const profile = await prisma.academicProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, verificationStatus: "SELF_DECLARED" }, update: {} });
  const [identities, identityLinks, works, legacyEvidence, affiliations, requests, history] = await Promise.all([
    prisma.academicExternalIdentity.findMany({ where: { profileId: profile.id }, orderBy: { position: "asc" } }),
    prisma.academicIdentityLink.findMany({ where: { userId: user.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.academicFeaturedWork.findMany({ where: { profileId: profile.id }, orderBy: { position: "asc" } }),
    prisma.academicVerificationEvidence.findMany({ where: { profileId: profile.id }, orderBy: { createdAt: "asc" } }),
    prisma.affiliation.findMany({ where: { userId: user.id }, orderBy: [{ isPrimary: "desc" }, { validUntil: "desc" }, { createdAt: "desc" }] }),
    prisma.verificationEvidence.findMany({ where: { userId: user.id, verificationType: { in: ["POSITION", "AFFILIATION"] } }, orderBy: { submittedAt: "desc" } }),
    prisma.auditLog.findMany({ where: { userId: user.id, OR: [{ actionName: { startsWith: "academic_profile." } }, { actionName: { startsWith: "affiliation." } }] }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  const academicType = compatibilityType(profile.primaryPosition) ?? user.academicProfileType ?? legacyType(user.role) ?? "researcher";
  const support = record(profile.supportAvailability), review = record(profile.reviewAvailability);
  const compositeStatus = ["PENDING", "VERIFIED", "REJECTED"].includes(profile.verificationStatus)
    ? profile.verificationStatus as "PENDING" | "VERIFIED" | "REJECTED" : "SELF_DECLARED";
  const publicUserId = publicDatabaseId(user);
  const mappedAffiliations = affiliations.map(mapAffiliation);
  const currentAffiliation: AcademicAffiliation = mappedAffiliations.find((item) => item.isPrimary) ?? {
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
    academicType: academicType as AcademicProfileType, primaryPosition: profile.primaryPosition as PrimaryPosition | null ?? undefined,
    positionTitle: profile.positionTitle ?? profile.affiliationPosition ?? titleForPosition(profile.primaryPosition as PrimaryPosition | undefined),
    positionCategory: profile.positionCategory as AcademicProfile["positionCategory"], positionSource: profile.positionSource as AcademicProfile["positionSource"],
    displayName: user.fullName,
    avatarUrl: profile.avatarStorageKey ? `/academic-profiles/${publicUserId}/avatar?v=${profile.avatarUpdatedAt?.getTime() ?? 1}` : user.avatarUrl ?? undefined,
    coverUrl: profile.coverStorageKey ? `/academic-profiles/${publicUserId}/cover?v=${profile.coverUpdatedAt?.getTime() ?? 1}` : undefined,
    profileVisibility: profile.profileVisibility as AcademicProfile["profileVisibility"], privacy: privacySettings(profile.privacySettings),
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
     academicIdentityLinks: identityLinks.map((identity): AcademicIdentityLink => ({
       id: identity.id,
       provider: identity.provider as AcademicIdentityLink["provider"],
       label: identity.label ?? undefined,
       identifier: identity.identifier ?? undefined,
       profileUrl: identity.profileUrl ?? undefined,
       connectionMethod: identity.connectionMethod as AcademicIdentityLink["connectionMethod"],
       status: identity.status as AcademicIdentityLink["status"],
       visibility: identity.visibility as AcademicIdentityLink["visibility"],
       createdAt: identity.createdAt.toISOString(),
       updatedAt: identity.updatedAt.toISOString(),
     })),
    featuredWorks: works.map((work) => ({ paperId: work.paperId ?? undefined, doi: work.doi ?? undefined, title: work.title ?? undefined, year: work.year ?? undefined, source: work.source as AcademicFeaturedWork["source"], canonical: work.paperId !== null })),
    supportAvailability: { enabled: support.enabled === true, types: normalizeSupportTypes(support.types), preferredTopics: stringArray(support.preferredTopics), note: stringValue(support.note), updatedAt: iso(support.updatedAt) },
    reviewAvailability: { enabled: review.enabled === true, types: normalizeReviewTypes(review.types), preferredTopics: stringArray(review.preferredTopics), acceptedFields: stringArray(review.acceptedFields), maximumActiveReviews: typeof review.maximumActiveReviews === "number" ? review.maximumActiveReviews : 3, preferredReviewWorkload: stringValue(review.preferredReviewWorkload), note: stringValue(review.note), temporarilyUnavailableUntil: iso(review.temporarilyUnavailableUntil), autoRecommendationEnabled: review.autoRecommendationEnabled !== false, updatedAt: iso(review.updatedAt) },
    verificationStatus: compositeStatus,
    verificationStatuses: { identity: status(profile.identityStatus), email: status(profile.emailStatus), affiliation: status(profile.affiliationStatus), position: status(profile.positionStatus), orcid: status(profile.orcidStatus) },
    verification: { status: compositeStatus, requestedAt: profile.verificationRequestedAt?.toISOString(), verifiedAt: profile.verifiedAt?.toISOString(), verifiedBy: profile.verifiedById ?? undefined, rejectedAt: profile.rejectedAt?.toISOString(), rejectedBy: profile.rejectedById ?? undefined, rejectionReason: profile.rejectionReason ?? undefined, method: profile.verificationMethod ?? undefined, adminNote: profile.verificationNote ?? undefined },
    verificationEvidence: legacyEvidence.map((item) => ({ type: item.type as AcademicProfile["verificationEvidence"][number]["type"], value: item.value ?? undefined, status: item.status as AcademicProfile["verificationEvidence"][number]["status"], source: item.source as AcademicProfile["verificationEvidence"][number]["source"], createdAt: item.createdAt.toISOString(), validatedAt: item.validatedAt?.toISOString() })),
    verificationRequests: requests.map((item) => ({ id: item.id, type: item.verificationType as AcademicProfile["verificationRequests"][number]["type"], targetValue: stringValue(record(item.metadata).targetValue) ?? undefined, evidenceType: item.sourceType as AcademicProfile["verificationRequests"][number]["evidenceType"], reference: item.sourceReference ?? undefined, status: status(item.status), submittedAt: item.submittedAt.toISOString(), reviewedAt: item.reviewedAt?.toISOString(), rejectionReason: item.rejectionReason ?? undefined, metadata: record(item.metadata), evidenceFileName: item.evidenceFileName ?? undefined, evidenceMimeType: item.evidenceMimeType ?? undefined, evidenceSizeBytes: item.evidenceSizeBytes ?? undefined })),
    profileHistory: history.map((item) => ({ id: item.id, action: item.actionName, summary: historySummary(item.actionName, item.details), createdAt: item.createdAt.toISOString() })),
    createdAt: profile.createdAt.toISOString(), updatedAt: profile.updatedAt.toISOString(),
  };
}

function visibleTo(setting: AcademicProfilePrivacy[keyof AcademicProfilePrivacy], viewerId?: string): boolean {
  return setting === "PUBLIC" || setting === "REGISTERED_USERS" && Boolean(viewerId);
}
function toPublicProfile(profile: AcademicProfile, viewerId?: string): PublicAcademicProfile {
  const { id: _id, institutionalEmail: _email, verification: _verification, verificationEvidence: _evidence,
    verificationRequests: _requests, profileHistory: _history, privacy, affiliationHistory: _affiliationHistory,
    affiliation, reviewAvailability, ...safe } = profile;
  const unavailable = reviewAvailability.temporarilyUnavailableUntil ? new Date(reviewAvailability.temporarilyUnavailableUntil).getTime() > Date.now() : false;
  return {
    ...safe,
    researchInterests: visibleTo(privacy.researchInterests, viewerId) ? safe.researchInterests : [],
    expertiseAreas: visibleTo(privacy.expertise, viewerId) ? safe.expertiseAreas : [],
     skills: visibleTo(privacy.expertise, viewerId) ? safe.skills : [],
     externalIdentities: safe.externalIdentities.filter((identity) => identity.provider !== "ORCID" || visibleTo(privacy.orcid, viewerId)),
     academicIdentityLinks: visibleAcademicIdentityLinks(safe.academicIdentityLinks, viewerId, profile.userId),
    affiliation: { id: affiliation.id, institutionName: affiliation.institutionName, rorId: affiliation.rorId, department: affiliation.department, position: affiliation.position, positionTitle: affiliation.positionTitle, positionCategory: affiliation.positionCategory, positionSource: affiliation.positionSource, affiliationVerificationStatus: affiliation.affiliationVerificationStatus, positionVerificationStatus: affiliation.positionVerificationStatus, startYear: affiliation.startYear, startDate: affiliation.startDate, endDate: affiliation.endDate, isCurrent: affiliation.isCurrent, isPrimary: affiliation.isPrimary },
    reviewAvailability: { enabled: reviewAvailability.enabled && !unavailable, types: reviewAvailability.types, preferredTopics: reviewAvailability.preferredTopics, acceptedFields: reviewAvailability.acceptedFields, note: reviewAvailability.note, updatedAt: reviewAvailability.updatedAt },
  };
}
function assertVisible(profile: AcademicProfile, viewerId?: string) {
  if (profile.userId === viewerId || profile.profileVisibility === "PUBLIC" || profile.profileVisibility === "MEMBERS_ONLY" && viewerId) return;
  throw AppError.notFound("Academic profile not found");
}
function compact(profile: PublicAcademicProfile): CompactAcademicProfile {
  return { userId: profile.userId, publicHandle: profile.publicHandle, displayName: profile.displayName, avatarUrl: profile.avatarUrl, academicTitle: profile.academicTitle, institutionName: profile.affiliation.institutionName, verificationStatus: profile.verificationStatus, expertiseAreas: profile.expertiseAreas, supportAvailable: profile.supportAvailability.enabled, reviewAvailable: profile.reviewAvailability.enabled };
}

export const academicProfileService = {
  async getMine(userId: string) { return buildPrivateProfile(userId); },
  async getPublic(userId: string, viewerId?: string) { const profile = await buildPrivateProfile(userId); assertVisible(profile, viewerId); return toPublicProfile(profile, viewerId); },
  async getPublicByHandle(handle: string, viewerId?: string) {
    const normalized = normalizePublicHandle(handle);
    if (!isValidResolvablePublicHandle(normalized)) throw AppError.notFound("Academic profile not found");
    const prisma = getPrisma();
    const claimed = await prisma.academicProfileHandle.findUnique({ where: { handle: normalized }, select: { userId: true } })
      ?? await prisma.academicProfile.findFirst({ where: { publicHandle: normalized }, select: { userId: true } });
    if (!claimed) throw AppError.notFound("Academic profile not found");
    const profile = await buildPrivateProfile(claimed.userId); assertVisible(profile, viewerId); return toPublicProfile(profile, viewerId);
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
  async getCompact(userId: string, viewerId?: string) { const profile = await buildPrivateProfile(userId); assertVisible(profile, viewerId); return compact(toPublicProfile(profile, viewerId)); },

  async updateMine(userId: string, input: UpdateAcademicProfileDetailsInput) {
    const prisma = getPrisma(), user = await resolveUser(userId);
    const profile = await prisma.academicProfile.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });
    const currentAffiliation = await prisma.affiliation.findFirst({ where: { userId: user.id, isPrimary: true } });
    const requested = input.affiliation ?? {}, requestedInstitution = requested.institutionName ?? input.institution;
    const requestedDepartment = requested.department ?? input.department, requestedEmail = requested.institutionalEmail ?? input.institutionalEmail;
    const requestedTitle = input.positionTitle ?? requested.position, legacyPosition = input.primaryPosition ?? positionFromLegacy(input.academicType);
    const positionInputProvided = requestedTitle !== undefined || legacyPosition !== undefined;
    const nextTitle = requestedTitle ?? (legacyPosition !== undefined ? titleForPosition(legacyPosition) : profile.positionTitle ?? undefined);
    const classification = nextTitle ? classifyAcademicPosition(nextTitle) : { category: (legacyPosition === "STUDENT" || legacyPosition === "LECTURER" || legacyPosition === "RESEARCH_STAFF" ? legacyPosition : "UNCLASSIFIED") as AcademicPositionCategory, source: "PREDEFINED" as const };
    const nextPrimaryPosition = requestedTitle !== undefined ? primaryFromCategory(classification.category, legacyPosition) : legacyPosition;
    const positionChanged = positionInputProvided && (nextTitle !== profile.positionTitle || classification.category !== profile.positionCategory || classification.source !== profile.positionSource || (nextPrimaryPosition ?? null) !== (profile.primaryPosition ?? null));
    const institutionChanged = requestedInstitution !== undefined && requestedInstitution.trim().toLocaleLowerCase() !== (currentAffiliation?.institutionName ?? user.institution ?? "").trim().toLocaleLowerCase();
    const positionVerificationTargetChanged = positionChanged || institutionChanged;
    const emailChanged = requestedEmail !== undefined && requestedEmail.toLowerCase() !== profile.institutionalEmail?.toLowerCase();
    const identities = await prisma.academicExternalIdentity.findMany({ where: { profileId: profile.id } });
    const incomingOrcid = input.externalIdentities?.find((item) => item.provider === "ORCID"), oldOrcid = identities.find((item) => item.provider === "ORCID");
    const orcidChanged = input.externalIdentities !== undefined && JSON.stringify(incomingOrcid ?? null) !== JSON.stringify(oldOrcid ? { provider: "ORCID", externalId: oldOrcid.externalId ?? undefined, profileUrl: oldOrcid.profileUrl ?? undefined } : null);
    const resolvedWorks = await Promise.all((input.featuredWorks ?? []).map(async (work) => {
      if (work.source !== "LUMIGAP") return { paperId: null, doi: work.doi ?? null, title: work.title ?? null, year: work.year ?? null, source: work.source };
      const paper = await prisma.paper.findUnique({ where: idWhere(work.paperId!), select: { id: true } });
      if (!paper) throw AppError.badRequest("One or more featured papers do not exist");
      return { paperId: paper.id, doi: null, title: null, year: null, source: "LUMIGAP" };
    }));
    const now = new Date(), nextPrivacy = input.privacy ? { ...privacySettings(profile.privacySettings), ...input.privacy } : undefined;
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { ...(nextPrimaryPosition !== undefined ? { academicProfileType: compatibilityType(nextPrimaryPosition) } : {}), ...(input.displayName !== undefined ? { fullName: input.displayName } : {}), ...(requestedInstitution !== undefined ? { institution: requestedInstitution || null } : {}), ...(input.researchInterests !== undefined ? { researchInterests: input.researchInterests } : {}) } });
      await tx.academicProfile.update({ where: { id: profile.id }, data: {
        ...(nextPrimaryPosition !== undefined ? { primaryPosition: nextPrimaryPosition } : {}),
        ...(requestedTitle !== undefined ? { positionTitle: nextTitle, positionCategory: classification.category, positionSource: classification.source } : {}),
        ...(positionVerificationTargetChanged ? { positionStatus: "NOT_SUBMITTED", verificationStatus: "SELF_DECLARED", verificationRequestedAt: null, verifiedAt: null, verifiedById: null } : {}),
        ...(institutionChanged ? { affiliationStatus: "NOT_SUBMITTED" } : {}), ...(input.headline !== undefined ? { headline: input.headline || null } : {}),
        ...(input.profileVisibility !== undefined ? { profileVisibility: input.profileVisibility } : {}), ...(nextPrivacy ? { privacySettings: nextPrivacy as never } : {}),
        ...((input.biography ?? input.bio) !== undefined ? { biography: (input.biography ?? input.bio) || null } : {}), ...(input.academicTitle !== undefined ? { academicTitle: input.academicTitle } : {}),
        ...(input.expertiseAreas !== undefined ? { expertiseAreas: input.expertiseAreas } : {}), ...(input.skills !== undefined ? { skills: input.skills } : {}), ...(input.researchKeywords !== undefined ? { researchKeywords: input.researchKeywords } : {}),
        ...(requested.rorId !== undefined ? { affiliationRorId: requested.rorId || null } : {}), ...(requestedDepartment !== undefined ? { affiliationDepartment: requestedDepartment || null } : {}), ...(requestedTitle !== undefined ? { affiliationPosition: nextTitle || null } : {}),
        ...(requested.startYear !== undefined ? { affiliationStartYear: requested.startYear } : {}), ...(requestedEmail !== undefined ? { institutionalEmail: requestedEmail || null } : {}),
        ...(input.supportAvailability !== undefined ? { supportAvailability: { ...input.supportAvailability, updatedAt: now.toISOString() } as never } : {}), ...(input.reviewAvailability !== undefined ? { reviewAvailability: { ...input.reviewAvailability, updatedAt: now.toISOString() } as never } : {}),
        ...(emailChanged ? { institutionalEmailVerifiedAt: null, emailStatus: "NOT_SUBMITTED" } : {}), ...(orcidChanged ? { orcidStatus: "NOT_SUBMITTED" } : {}),
      } });
      if (positionVerificationTargetChanged) await tx.verificationEvidence.updateMany({ where: { userId: user.id, verificationType: "POSITION", status: { in: ["PENDING", "VERIFIED"] } }, data: { status: "INVALIDATED", reviewedAt: now, rejectionReason: "Position or institution changed by profile owner" } });
      if (institutionChanged) await tx.verificationEvidence.updateMany({ where: { userId: user.id, verificationType: "AFFILIATION", status: "PENDING" }, data: { status: "INVALIDATED", reviewedAt: now, rejectionReason: "Affiliation changed by profile owner" } });
      if (requestedInstitution !== undefined && requestedInstitution.trim()) {
        const affiliationData = { institutionName: requestedInstitution, department: requestedDepartment ?? currentAffiliation?.department, rorId: requested.rorId ?? currentAffiliation?.rorId, academicTitle: input.academicTitle === undefined ? currentAffiliation?.academicTitle : input.academicTitle, positionTitle: nextTitle, positionCategory: classification.category, positionSource: classification.source, positionStatus: positionVerificationTargetChanged ? "NOT_SUBMITTED" : currentAffiliation?.positionStatus ?? "NOT_SUBMITTED" };
        if (institutionChanged && currentAffiliation) {
          await tx.affiliation.update({ where: { id: currentAffiliation.id }, data: { isPrimary: false, validUntil: now } });
          await tx.affiliation.create({ data: { userId: user.id, ...affiliationData, verificationStatus: "NOT_SUBMITTED", verificationSource: "SELF_DECLARED", affiliationType: "EXTERNAL", isPrimary: true, validFrom: requested.startYear ? new Date(Date.UTC(requested.startYear, 0, 1)) : now } });
        } else if (currentAffiliation) await tx.affiliation.update({ where: { id: currentAffiliation.id }, data: affiliationData });
        else await tx.affiliation.create({ data: { userId: user.id, ...affiliationData, verificationStatus: "NOT_SUBMITTED", verificationSource: "SELF_DECLARED", affiliationType: "EXTERNAL", isPrimary: true, validFrom: requested.startYear ? new Date(Date.UTC(requested.startYear, 0, 1)) : now } });
      } else if (positionChanged && currentAffiliation) await tx.affiliation.update({ where: { id: currentAffiliation.id }, data: { positionTitle: nextTitle, positionCategory: classification.category, positionSource: classification.source, positionStatus: "NOT_SUBMITTED" } });
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
    if (emailChanged) await institutionalEmailVerificationService.invalidate(user.id);
    await capabilityService.evaluate(user.id);
    if (positionChanged) await auditService.log("academic_profile.position.changed", { userId: user.id, targetTableName: "academic_profiles", targetRecordId: profile.id, details: { previous: profile.positionTitle, next: nextTitle, previousStatus: profile.positionStatus } });
    if (institutionChanged) await auditService.log("academic_profile.affiliation.changed", { userId: user.id, targetTableName: "affiliations", targetRecordId: profile.id, details: { previous: currentAffiliation?.institutionName ?? user.institution, next: requestedInstitution } });
    await auditService.log("academic_profile.updated", { userId: user.id, targetTableName: "academic_profiles", targetRecordId: profile.id, details: { fields: Object.keys(input).filter((field) => field !== "institutionalEmail") } });
    return buildPrivateProfile(user.id);
  },

  async getVerificationStatus(userId: string) { const profile = await this.getMine(userId); return { academicType: profile.academicType, statuses: profile.verificationStatuses, requests: profile.verificationRequests }; },
  async requestVerification(userId: string, input: VerificationRequestInput, file?: { buffer: Buffer; originalname: string; mimetype: string; size: number }) {
    const prisma = getPrisma(), user = await resolveUser(userId);
    const profile = await prisma.academicProfile.findUnique({ where: { userId: user.id } });
    if (!profile) throw AppError.badRequest("Complete your academic profile before requesting verification");
    const affiliation = await prisma.affiliation.findFirst({ where: { userId: user.id, isPrimary: true } });
    const targetValue = input.type === "POSITION" ? profile.positionTitle : affiliation?.institutionName ?? user.institution;
    if (!targetValue) throw AppError.badRequest(`Add a current ${input.type === "POSITION" ? "position" : "affiliation"} first`);
    if (input.type === "POSITION" && !profile.positionTitle) throw AppError.badRequest("Add your current position first");
    if (await prisma.verificationEvidence.findFirst({ where: { userId: user.id, verificationType: input.type, status: "PENDING" } })) throw AppError.conflict(`${input.type === "POSITION" ? "Position" : "Affiliation"} verification is already pending`);
    if (input.evidenceType === "DOCUMENT") {
      assertPdfMagic(file?.buffer);
      if (input.type !== "POSITION") throw AppError.badRequest("Document evidence is currently supported for position verification only");
    } else if (file) throw AppError.badRequest("A file is only accepted for document evidence");
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
      const created = await tx.verificationEvidence.create({ data: { userId: user.id, academicProfileId: profile.id, verificationType: input.type, sourceType: input.evidenceType, sourceReference: reference, evidenceStorageKey: fileKey, evidenceFileName: file ? safeEvidenceFileName(file.originalname) : null, evidenceMimeType: file ? "application/pdf" : null, evidenceSizeBytes: file?.size ?? null, status: "PENDING", metadata: { targetValue, institutionName: affiliation?.institutionName ?? user.institution, positionTitle: profile.positionTitle, primaryPosition: profile.primaryPosition, positionCategory: profile.positionCategory } } });
      await tx.academicProfile.update({ where: { id: profile.id }, data: input.type === "POSITION" ? { positionStatus: "PENDING", verificationStatus: "PENDING", verificationRequestedAt: now, rejectionReason: null } : { affiliationStatus: "PENDING" } });
      if (affiliation) await tx.affiliation.update({ where: { id: affiliation.id }, data: input.type === "POSITION" ? { positionStatus: "PENDING" } : { verificationStatus: "PENDING" } });
      return created;
      });
    } catch (error) {
      if (fileKey) await verificationEvidenceStorage.remove(fileKey, user.id).catch(() => undefined);
      if ((error as { code?: string }).code === "P2002") throw AppError.conflict("A verification request is already pending for this target");
      throw error;
    }
    await auditService.log("academic_profile.verification.requested", { userId: user.id, targetTableName: "verification_evidence", targetRecordId: request.id, details: { type: input.type, evidenceType: input.evidenceType, targetValue } });
    return buildPrivateProfile(user.id);
  },
  async listVerificationRequests(statusValue: string, page: number, pageSize: number) {
    const prisma = getPrisma(), where = { verificationType: { in: ["POSITION", "AFFILIATION"] }, status: statusValue };
    const [requests, total] = await Promise.all([prisma.verificationEvidence.findMany({ where, orderBy: { submittedAt: "asc" }, skip: (page - 1) * pageSize, take: pageSize }), prisma.verificationEvidence.count({ where })]);
    const data = await Promise.all(requests.map(async (request) => {
      const profile = await buildPrivateProfile(request.userId);
      const history = profile.verificationRequests.filter((item) => item.type === request.verificationType);
      const currentRequest = history.find((item) => item.id === request.id);
      if (!currentRequest) throw AppError.notFound("Verification request not found");
      return { profile, request: currentRequest, history };
    }));
    return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  },
  async getVerificationDetails(requestId: string) {
    const parsed = parseDatabaseId(requestId);
    if (!parsed || parsed.kind !== "uuid") throw AppError.notFound("Verification request not found");
    const request = await getPrisma().verificationEvidence.findUnique({ where: { id: parsed.value } });
    if (!request || !["POSITION", "AFFILIATION"].includes(request.verificationType)) throw AppError.notFound("Verification request not found");
    const profile = await buildPrivateProfile(request.userId);
    const history = profile.verificationRequests.filter((item) => item.type === request.verificationType);
    const currentRequest = history.find((item) => item.id === request.id);
    if (!currentRequest) throw AppError.notFound("Verification request not found");
    return { profile, request: currentRequest, history };
  },
  async verificationEvidenceFileLocation(requestId: string) {
    const parsed = parseDatabaseId(requestId);
    if (!parsed || parsed.kind !== "uuid") throw AppError.notFound("Verification evidence not found");
    const request = await getPrisma().verificationEvidence.findUnique({ where: { id: parsed.value }, select: { userId: true, verificationType: true, evidenceStorageKey: true } });
    if (!request || request.verificationType !== "POSITION" || !request.evidenceStorageKey) throw AppError.notFound("Verification evidence not found");
    return verificationEvidenceStorage.adminLocation(request.evidenceStorageKey, request.userId);
  },
  async decideVerification(requestId: string, input: VerificationDecisionInput, adminId: string) {
    const prisma = getPrisma(), parsed = parseDatabaseId(requestId);
    if (!parsed || parsed.kind !== "uuid") throw AppError.notFound("Verification request not found");
    const [request, admin] = await Promise.all([prisma.verificationEvidence.findUnique({ where: { id: parsed.value } }), resolveUser(adminId)]);
    if (!request || !["POSITION", "AFFILIATION"].includes(request.verificationType)) throw AppError.notFound("Verification request not found");
    if (request.status !== "PENDING" || request.userId === admin.id) throw AppError.conflict("Only a pending verification can be decided by another user");
    const profile = request.academicProfileId ? await prisma.academicProfile.findUnique({ where: { id: request.academicProfileId } }) : await prisma.academicProfile.findUnique({ where: { userId: request.userId } });
    if (!profile) throw AppError.notFound("Academic profile not found");
    const affiliation = await prisma.affiliation.findFirst({ where: { userId: request.userId, isPrimary: true } });
    const now = new Date(), approved = input.decision === "approve", nextStatus = approved ? "VERIFIED" : "REJECTED";
    await prisma.$transaction(async (tx) => {
      const requestedPosition = stringValue(record(request.metadata).positionTitle) ?? stringValue(record(request.metadata).targetValue);
      const requestedPrimaryPosition = record(request.metadata).primaryPosition;
      const requestedPositionCategory = record(request.metadata).positionCategory;
      const requestedInstitution = stringValue(record(request.metadata).institutionName)?.trim().toLocaleLowerCase() ?? "";
      if (request.verificationType === "POSITION") {
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
      const updated = await tx.verificationEvidence.updateMany({ where: { id: request.id, status: "PENDING" }, data: { status: nextStatus, reviewedById: admin.id, reviewedAt: now, rejectionReason: approved ? null : input.reason } });
      if (updated.count !== 1) throw AppError.conflict("This verification request has already been decided");
      const profileData = request.verificationType === "POSITION" ? approved
        ? { positionStatus: nextStatus, verificationStatus: "VERIFIED", verifiedAt: now, verifiedById: admin.id, rejectedAt: null, rejectedById: null, rejectionReason: null, verificationMethod: input.method ?? "ADMIN_REVIEW", verificationNote: input.note }
        : { positionStatus: nextStatus, verificationStatus: "REJECTED", verifiedAt: null, verifiedById: null, rejectedAt: now, rejectedById: admin.id, rejectionReason: input.reason, verificationMethod: "ADMIN_REVIEW", verificationNote: input.note }
        : { affiliationStatus: nextStatus };
      if (request.verificationType === "POSITION") {
        const updatedProfile = await tx.academicProfile.updateMany({ where: { id: profile.id, positionTitle: requestedPosition, ...(requestedPrimaryPosition !== undefined ? { primaryPosition: requestedPrimaryPosition as string | null } : {}), ...(requestedPositionCategory !== undefined ? { positionCategory: String(requestedPositionCategory) } : {}) }, data: profileData });
        if (updatedProfile.count !== 1) throw AppError.conflict("The declared position changed after this request was submitted");
        await tx.affiliation.updateMany({ where: { userId: request.userId, isPrimary: true }, data: { positionStatus: nextStatus } });
      } else {
        await tx.academicProfile.update({ where: { id: profile.id }, data: profileData });
        if (affiliation) await tx.affiliation.update({ where: { id: affiliation.id }, data: { verificationStatus: nextStatus, verificationSource: "ADMIN" } });
      }
    });
    await capabilityService.evaluate(request.userId);
    await auditService.log(`academic_profile.verification.${approved ? "approved" : "rejected"}`, { userId: admin.id, targetTableName: "verification_evidence", targetRecordId: request.id, details: { type: request.verificationType, targetUserId: request.userId } });
    await notificationService.create({ userId: request.userId, title: `${request.verificationType === "POSITION" ? "Position" : "Affiliation"} verification ${approved ? "approved" : "rejected"}`, message: approved ? "Your academic verification is now visible on your profile." : "Your verification request needs changes. Open Academic Profile for details.", type: `academic_verification_${approved ? "approved" : "rejected"}`, targetKind: "academic_profile", targetId: profile.id });
    return buildPrivateProfile(request.userId);
  },
  async listLecturers(query: LecturerListQueryInput) {
    const prisma = getPrisma();
    const users = await prisma.user.findMany({ where: { accountStatus: "ACTIVE", systemRole: "RESEARCH_USER", ...(query.institution ? { institution: { contains: query.institution, mode: "insensitive" } } : {}), ...(query.researchInterest ? { researchInterests: { has: query.researchInterest } } : {}) }, select: { id: true } });
    const where = { userId: { in: users.map((item) => item.id) }, primaryPosition: "LECTURER", profileVisibility: "PUBLIC", ...(query.verifiedOnly ? { positionStatus: "VERIFIED" } : {}), ...(query.expertise ? { expertiseAreas: { has: query.expertise } } : {}), ...(query.supportAvailable !== undefined ? { supportAvailability: { path: ["enabled"], equals: query.supportAvailable } } : {}), ...(query.reviewAvailable !== undefined ? { reviewAvailability: { path: ["enabled"], equals: query.reviewAvailable } } : {}) };
    const [profiles, total] = await Promise.all([prisma.academicProfile.findMany({ where, orderBy: [{ verifiedAt: "desc" }, { updatedAt: "desc" }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }), prisma.academicProfile.count({ where })]);
    return { data: await Promise.all(profiles.map((item) => this.getCompact(item.userId))), meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) } };
  },
  async isVerifiedLecturer(userId: string) { const user = await resolveUser(userId); const profile = await getPrisma().academicProfile.findUnique({ where: { userId: user.id }, select: { primaryPosition: true, positionStatus: true } }); return profile?.primaryPosition === "LECTURER" && profile.positionStatus === "VERIFIED"; },
};
