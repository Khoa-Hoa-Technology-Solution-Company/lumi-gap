import mongoose from "mongoose";
import type {
  AcademicFeaturedWork,
  AcademicProfile,
  AcademicProfileType,
  AcademicReviewType,
  AcademicVerificationEvidence,
  CompactAcademicProfile,
  PublicAcademicProfile,
  ResearchSupportType,
  VerificationEvidenceType,
} from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { auditService } from "../audit/audit.service.js";
import { UserModel } from "../auth/models/user.model.js";
import { notificationService } from "../notifications/notification.service.js";
import { PaperModel } from "../papers/models/paper.model.js";
import { AcademicProfileModel } from "./academic-profile.model.js";
import { AcademicProfileHandleModel } from "./academic-profile-handle.model.js";
import { isValidPublicHandle, normalizePublicHandle } from "./public-handle.js";
import { evaluateLecturerVerificationEvidence } from "./academic-verification.policy.js";
import { institutionalEmailVerificationService } from "./institutional-email-verification.service.js";
import { TrustedInstitutionModel } from "./trusted-institution.model.js";
import type {
  LecturerListQueryInput,
  UpdateAcademicProfileDetailsInput,
  VerificationDecisionInput,
} from "./dto/academic-profile.schema.js";

type LooseRecord = Record<string, unknown>;

function legacyType(role: string): AcademicProfileType | undefined {
  return role === "student" || role === "researcher" || role === "lecturer" ? role : undefined;
}

function iso(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function record(value: unknown): LooseRecord {
  return value && typeof value === "object" ? value as LooseRecord : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function normalizeSupportTypes(value: unknown): ResearchSupportType[] {
  const aliases: Record<string, ResearchSupportType | undefined> = {
    RESEARCH_DIRECTION: "RESEARCH_DIRECTION",
    LITERATURE_REVIEW: "LITERATURE_REVIEW",
    RESEARCH_GAP_VALIDATION: "RESEARCH_GAP_VALIDATION",
    METHODOLOGY: "RESEARCH_METHODOLOGY",
    RESEARCH_METHODOLOGY: "RESEARCH_METHODOLOGY",
    EXPERIMENT_DESIGN: "EXPERIMENT_DESIGN",
    DATA_ANALYSIS: "DATA_ANALYSIS",
    ACADEMIC_WRITING: "ACADEMIC_WRITING",
    SOFTWARE_TECHNICAL_REVIEW: "SOFTWARE_TECHNICAL_GUIDANCE",
    SOFTWARE_TECHNICAL_GUIDANCE: "SOFTWARE_TECHNICAL_GUIDANCE",
  };
  return [...new Set(stringArray(value).map((item) => aliases[item]).filter((item): item is ResearchSupportType => Boolean(item)))];
}

function normalizeReviewTypes(value: unknown): AcademicReviewType[] {
  const aliases: Record<string, AcademicReviewType | undefined> = {
    RESEARCH_PROPOSAL: "RESEARCH_PROPOSAL",
    LITERATURE_REVIEW: "LITERATURE_REVIEW",
    RESEARCH_GAP: "RESEARCH_GAP",
    METHODOLOGY: "METHODOLOGY",
    EXPERIMENT_REPORT: "EXPERIMENTAL_RESULTS",
    EXPERIMENTAL_RESULTS: "EXPERIMENTAL_RESULTS",
    MANUSCRIPT: "RESEARCH_PAPER",
    RESEARCH_PAPER: "RESEARCH_PAPER",
    SOFTWARE_RESEARCH_PROJECT: "SOFTWARE_RESEARCH_PROJECT",
  };
  return [...new Set(stringArray(value).map((item) => aliases[item]).filter((item): item is AcademicReviewType => Boolean(item)))];
}

async function resolveFeaturedWorks(profile: LooseRecord): Promise<AcademicFeaturedWork[]> {
  const works = Array.isArray(profile.featuredWorks) ? profile.featuredWorks.map(record) : [];
  const paperIds = works
    .map((work) => stringValue(work.paperId?.toString()))
    .filter((id): id is string => Boolean(id) && mongoose.isValidObjectId(id));
  const papers = paperIds.length > 0
    ? await PaperModel.find({ _id: { $in: paperIds } })
        .select("title publicationYear externalIds.doi")
        .lean()
    : [];
  const byId = new Map(papers.map((paper) => [String(paper._id), paper]));

  return works.map((work) => {
    const paperId = stringValue(work.paperId?.toString());
    const paper = paperId ? byId.get(paperId) : undefined;
    if (paper) {
      return {
        paperId,
        title: paper.title,
        year: paper.publicationYear,
        doi: paper.externalIds?.doi ?? undefined,
        source: "LUMIGAP",
        canonical: true,
      };
    }
    return {
      paperId,
      doi: stringValue(work.doi),
      title: stringValue(work.title),
      year: typeof work.year === "number" ? work.year : undefined,
      source: work.source === "ORCID" ? "ORCID" : "MANUAL",
      canonical: false,
    };
  });
}

async function buildPrivateProfile(userId: string): Promise<AcademicProfile> {
  const [user, rawProfile] = await Promise.all([
    UserModel.findById(userId)
      .select("fullName avatarUrl institution researchInterests academicProfileType role isActive points")
      .lean(),
    AcademicProfileModel.findOne({ userId }).lean(),
  ]);
  if (!user || user.isActive === false) throw AppError.notFound("Academic profile not found");
  const academicType = user.academicProfileType ?? legacyType(user.role);
  if (!academicType) throw AppError.notFound("Academic profile not found");

  const now = new Date();
  const profile = record(rawProfile ?? {
    _id: user._id,
    userId: user._id,
    verificationStatus: "SELF_DECLARED",
    createdAt: now,
    updatedAt: now,
  });
  const affiliation = record(profile.affiliation);
  const support = record(profile.supportAvailability);
  const review = record(profile.reviewAvailability);
  const status = profile.verificationStatus === "PENDING"
    || profile.verificationStatus === "VERIFIED"
    || profile.verificationStatus === "REJECTED"
    ? profile.verificationStatus
    : "SELF_DECLARED";

  const externalIdentities = (Array.isArray(profile.externalIdentities) ? profile.externalIdentities : [])
    .map(record)
    .map((identity) => ({
      provider: identity.provider as AcademicProfile["externalIdentities"][number]["provider"],
      externalId: stringValue(identity.externalId),
      profileUrl: stringValue(identity.profileUrl),
      status: (identity.status ?? identity.verificationStatus ?? "UNVERIFIED") as AcademicProfile["externalIdentities"][number]["status"],
      source: (identity.source ?? "SELF_ASSERTED") as AcademicProfile["externalIdentities"][number]["source"],
      linkedAt: iso(identity.linkedAt),
      verifiedAt: iso(identity.verifiedAt),
    }));
  const evidence = (Array.isArray(profile.verificationEvidence) ? profile.verificationEvidence : [])
    .map(record)
    .map((item) => ({
      type: item.type as AcademicProfile["verificationEvidence"][number]["type"],
      value: stringValue(item.value),
      status: item.status as AcademicProfile["verificationEvidence"][number]["status"],
      source: item.source as AcademicProfile["verificationEvidence"][number]["source"],
      createdAt: iso(item.createdAt) ?? now.toISOString(),
      validatedAt: iso(item.validatedAt),
    }));
  const institutionName = user.institution ?? undefined;
  const department = stringValue(affiliation.department) ?? stringValue(profile.department);
  const institutionalEmail = stringValue(affiliation.institutionalEmail) ?? stringValue(profile.institutionalEmail);
  const biography = stringValue(profile.biography) ?? stringValue(profile.bio);

  return {
    id: String(profile._id ?? user._id),
    userId: String(user._id),
    points: typeof user.points === "number" && Number.isFinite(user.points) ? Math.max(0, user.points) : 0,
    publicHandle: stringValue(profile.publicHandle),
    academicType,
    displayName: user.fullName,
    avatarUrl: user.avatarUrl ?? undefined,
    coverUrl: stringValue(profile.coverStorageKey)
      ? `/academic-profiles/${userId}/cover?v=${profile.coverUpdatedAt instanceof Date ? profile.coverUpdatedAt.getTime() : "1"}`
      : undefined,
    profileVisibility: profile.profileVisibility === "MEMBERS_ONLY" || profile.profileVisibility === "PRIVATE"
      ? profile.profileVisibility
      : "PUBLIC",
    headline: stringValue(profile.headline),
    biography,
    bio: biography,
    academicTitle: profile.academicTitle as AcademicProfile["academicTitle"],
    affiliation: {
      institutionName,
      rorId: stringValue(affiliation.rorId),
      department,
      position: stringValue(affiliation.position),
      startYear: typeof affiliation.startYear === "number" ? affiliation.startYear : undefined,
      institutionalEmail,
      institutionalEmailVerifiedAt: iso(affiliation.institutionalEmailVerifiedAt),
    },
    institution: institutionName,
    department,
    institutionalEmail,
    researchInterests: user.researchInterests ?? [],
    expertiseAreas: stringArray(profile.expertiseAreas),
    skills: stringArray(profile.skills),
    researchKeywords: stringArray(profile.researchKeywords),
    externalIdentities,
    featuredWorks: await resolveFeaturedWorks(profile),
    supportAvailability: {
      enabled: support.enabled === true,
      types: normalizeSupportTypes(support.types),
      preferredTopics: stringArray(support.preferredTopics),
      note: stringValue(support.note),
      updatedAt: iso(support.updatedAt),
    },
    reviewAvailability: {
      enabled: review.enabled === true,
      types: normalizeReviewTypes(review.types),
      preferredTopics: stringArray(review.preferredTopics),
      acceptedFields: stringArray(review.acceptedFields),
      maximumActiveReviews: typeof review.maximumActiveReviews === "number" ? review.maximumActiveReviews : 3,
      preferredReviewWorkload: stringValue(review.preferredReviewWorkload),
      note: stringValue(review.note),
      temporarilyUnavailableUntil: iso(review.temporarilyUnavailableUntil),
      autoRecommendationEnabled: review.autoRecommendationEnabled !== false,
      updatedAt: iso(review.updatedAt),
    },
    verificationStatus: status,
    verification: {
      status,
      requestedAt: iso(profile.verificationRequestedAt),
      verifiedAt: iso(profile.verifiedAt),
      verifiedBy: profile.verifiedBy ? String(profile.verifiedBy) : undefined,
      rejectedAt: iso(profile.rejectedAt),
      rejectedBy: profile.rejectedBy ? String(profile.rejectedBy) : undefined,
      rejectionReason: stringValue(profile.rejectionReason),
      method: stringValue(profile.verificationMethod),
      adminNote: stringValue(profile.verificationNote),
    },
    verificationEvidence: evidence,
    createdAt: iso(profile.createdAt) ?? now.toISOString(),
    updatedAt: iso(profile.updatedAt) ?? now.toISOString(),
  };
}

function toPublicProfile(profile: AcademicProfile): PublicAcademicProfile {
  const {
    id: _id,
    institutionalEmail: _legacyEmail,
    verification: _verification,
    verificationEvidence: _evidence,
    affiliation,
    reviewAvailability,
    ...safe
  } = profile;
  const temporarilyUnavailable = reviewAvailability.temporarilyUnavailableUntil
    ? new Date(reviewAvailability.temporarilyUnavailableUntil).getTime() > Date.now()
    : false;
  return {
    ...safe,
    affiliation: {
      institutionName: affiliation.institutionName,
      rorId: affiliation.rorId,
      department: affiliation.department,
      position: affiliation.position,
      startYear: affiliation.startYear,
    },
    reviewAvailability: {
      enabled: reviewAvailability.enabled && !temporarilyUnavailable,
      types: reviewAvailability.types,
      preferredTopics: reviewAvailability.preferredTopics,
      acceptedFields: reviewAvailability.acceptedFields,
      note: reviewAvailability.note,
      updatedAt: reviewAvailability.updatedAt,
    },
  };
}

function assertProfileVisible(profile: AcademicProfile, viewerId?: string) {
  if (profile.userId === viewerId || profile.profileVisibility === "PUBLIC") return;
  if (profile.profileVisibility === "MEMBERS_ONLY" && viewerId) return;
  throw AppError.notFound("Academic profile not found");
}

function toCompactProfile(profile: PublicAcademicProfile): CompactAcademicProfile {
  return {
    userId: profile.userId,
    publicHandle: profile.publicHandle,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    academicTitle: profile.academicTitle,
    institutionName: profile.affiliation.institutionName,
    verificationStatus: profile.verificationStatus,
    expertiseAreas: profile.expertiseAreas,
    supportAvailable: profile.supportAvailability.enabled,
    reviewAvailable: profile.reviewAvailability.enabled,
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const academicProfileService = {
  async getMine(userId: string) {
    await AcademicProfileModel.updateOne(
      { userId },
      { $setOnInsert: { userId, verificationStatus: "SELF_DECLARED" } },
      { upsert: true },
    );
    return buildPrivateProfile(userId);
  },

  async getPublic(userId: string, viewerId?: string) {
    const profile = await buildPrivateProfile(userId);
    assertProfileVisible(profile, viewerId);
    return toPublicProfile(profile);
  },

  async getPublicByHandle(handle: string, viewerId?: string) {
    const normalized = normalizePublicHandle(handle);
    if (!isValidPublicHandle(normalized)) throw AppError.notFound("Academic profile not found");
    const claimed = await AcademicProfileHandleModel.findOne({ handle: normalized }).select("userId").lean();
    if (!claimed) throw AppError.notFound("Academic profile not found");
    const profile = await buildPrivateProfile(String(claimed.userId));
    assertProfileVisible(profile, viewerId);
    return toPublicProfile(profile);
  },

  async setPublicHandle(userId: string, handle: string) {
    handle = normalizePublicHandle(handle);
    if (!isValidPublicHandle(handle)) throw AppError.badRequest("Invalid public profile URL");
    const current = await buildPrivateProfile(userId);
    if (current.publicHandle === handle) return current;

    const existingClaim = await AcademicProfileHandleModel.findOne({ handle }).select("userId").lean();
    if (existingClaim && String(existingClaim.userId) !== userId) {
      throw AppError.conflict("This public URL is already taken");
    }
    if (!existingClaim && await AcademicProfileHandleModel.countDocuments({ userId }) >= 20) {
      throw AppError.conflict("Public URL change limit reached");
    }

    let claimed;
    try {
      await AcademicProfileHandleModel.init();
      claimed = await AcademicProfileHandleModel.findOneAndUpdate(
        { handle },
        { $setOnInsert: { handle, userId } },
        { upsert: true, new: true, runValidators: true },
      );
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        throw AppError.conflict("This public URL is already taken");
      }
      throw error;
    }
    if (!claimed || String(claimed.userId) !== userId) {
      throw AppError.conflict("This public URL is already taken");
    }

    try {
      await AcademicProfileModel.findOneAndUpdate(
        { userId },
        { $set: { publicHandle: handle }, $setOnInsert: { userId } },
        { upsert: true, new: true, runValidators: true },
      );
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        throw AppError.conflict("This public URL is already taken");
      }
      throw error;
    }
    await auditService.log("academic_profile.public_handle.updated", {
      userId,
      targetTableName: "academic_profiles",
      targetRecordId: current.id,
      details: { previousHandle: current.publicHandle, newHandle: handle },
    });
    return buildPrivateProfile(userId);
  },

  async getCompact(userId: string, viewerId?: string) {
    const profile = await buildPrivateProfile(userId);
    assertProfileVisible(profile, viewerId);
    return toCompactProfile(toPublicProfile(profile));
  },

  async updateMine(userId: string, input: UpdateAcademicProfileDetailsInput) {
    const user = await UserModel.findById(userId);
    if (!user) throw AppError.unauthorized();
    const previousType = user.academicProfileType ?? legacyType(user.role);
    const existingProfile = record(await AcademicProfileModel.findOne({ userId }).lean());
    const existingAffiliation = record(existingProfile.affiliation);
    const requestedAffiliation = input.affiliation ?? {};
    const currentIdentities = (Array.isArray(existingProfile.externalIdentities) ? existingProfile.externalIdentities : [])
      .map(record)
      .map((identity) => ({ provider: identity.provider, externalId: identity.externalId, profileUrl: identity.profileUrl }));
    const requestedEmail = requestedAffiliation.institutionalEmail ?? input.institutionalEmail;
    const currentEmail = stringValue(existingAffiliation.institutionalEmail) ?? stringValue(existingProfile.institutionalEmail);
    const institutionalEmailChanged = requestedEmail !== undefined
      && requestedEmail.toLowerCase() !== currentEmail?.toLowerCase();
    const verificationMaterialChanged = Boolean(
      (input.academicType !== undefined && input.academicType !== previousType)
      || (input.displayName !== undefined && input.displayName !== user.fullName)
      || ((requestedAffiliation.institutionName ?? input.institution) !== undefined
        && (requestedAffiliation.institutionName ?? input.institution) !== (user.institution ?? undefined))
      || ((requestedAffiliation.department ?? input.department) !== undefined
        && (requestedAffiliation.department ?? input.department) !== (stringValue(existingAffiliation.department) ?? stringValue(existingProfile.department)))
      || institutionalEmailChanged
      || (requestedAffiliation.rorId !== undefined && requestedAffiliation.rorId !== stringValue(existingAffiliation.rorId))
      || (requestedAffiliation.position !== undefined && requestedAffiliation.position !== stringValue(existingAffiliation.position))
      || (input.externalIdentities !== undefined
        && JSON.stringify(input.externalIdentities) !== JSON.stringify(currentIdentities))
    );
    if (input.academicType !== undefined) user.academicProfileType = input.academicType;
    if (input.displayName !== undefined) user.fullName = input.displayName;
    const institution = input.affiliation?.institutionName ?? input.institution;
    if (institution !== undefined) user.institution = institution || undefined;
    if (input.researchInterests !== undefined) user.researchInterests = input.researchInterests;
    await user.save();

    const profileSet: Record<string, unknown> = {};
    if (input.headline !== undefined) profileSet.headline = input.headline || null;
    if (input.profileVisibility !== undefined) profileSet.profileVisibility = input.profileVisibility;
    const biography = input.biography ?? input.bio;
    if (biography !== undefined) {
      profileSet.biography = biography || null;
      profileSet.bio = null;
    }
    if (input.academicTitle !== undefined) profileSet.academicTitle = input.academicTitle;
    for (const key of ["expertiseAreas", "skills", "researchKeywords"] as const) {
      if (input[key] !== undefined) profileSet[key] = input[key];
    }

    const affiliation = input.affiliation ?? {};
    const department = affiliation.department ?? input.department;
    const institutionalEmail = affiliation.institutionalEmail ?? input.institutionalEmail;
    for (const [key, value] of Object.entries({
      rorId: affiliation.rorId,
      department,
      position: affiliation.position,
      startYear: affiliation.startYear,
      institutionalEmail,
    })) {
      if (value !== undefined) profileSet[`affiliation.${key}`] = value === "" ? null : value;
    }
    if (department !== undefined) profileSet.department = null;
    if (institutionalEmail !== undefined) profileSet.institutionalEmail = null;

    if (input.externalIdentities !== undefined) {
      profileSet.externalIdentities = input.externalIdentities.map((identity) => {
        const existing = (Array.isArray(existingProfile.externalIdentities) ? existingProfile.externalIdentities : [])
          .map(record)
          .find((candidate) => candidate.provider === identity.provider
            && stringValue(candidate.externalId) === identity.externalId
            && stringValue(candidate.profileUrl) === identity.profileUrl);
        if (existing && (existing.source === "OAUTH" || existing.source === "SYSTEM" || existing.source === "ADMIN")) {
          return {
            ...identity,
            status: existing.status,
            source: existing.source,
            linkedAt: existing.linkedAt,
            verifiedAt: existing.verifiedAt,
          };
        }
        return { ...identity, status: "UNVERIFIED", source: "SELF_ASSERTED" };
      });
    }
    if (input.featuredWorks !== undefined) {
      const requestedPaperIds = input.featuredWorks
        .filter((work) => work.source === "LUMIGAP")
        .map((work) => work.paperId as string);
      if (requestedPaperIds.length > 0) {
        const found = await PaperModel.countDocuments({ _id: { $in: requestedPaperIds } });
        if (found !== new Set(requestedPaperIds).size) throw AppError.badRequest("One or more featured papers do not exist");
      }
      profileSet.featuredWorks = input.featuredWorks.map((work) => work.source === "LUMIGAP"
        ? { paperId: work.paperId, source: "LUMIGAP" }
        : work);
    }
    const updatedAt = new Date();
    if (input.supportAvailability !== undefined) {
      profileSet.supportAvailability = { ...input.supportAvailability, updatedAt };
    }
    if (input.reviewAvailability !== undefined) {
      profileSet.reviewAvailability = { ...input.reviewAvailability, updatedAt };
    }
    if (institutionalEmailChanged) {
      profileSet["affiliation.institutionalEmailVerifiedAt"] = null;
      profileSet.verificationEvidence = [];
    }
    if (verificationMaterialChanged
        && (existingProfile.verificationStatus === "VERIFIED" || existingProfile.verificationStatus === "PENDING")) {
      Object.assign(profileSet, {
        verificationStatus: "SELF_DECLARED",
        verificationRequestedAt: null,
        verifiedAt: null,
        verifiedBy: null,
        rejectedAt: null,
        rejectedBy: null,
        rejectionReason: null,
        verificationMethod: null,
        verificationNote: null,
        verificationEvidence: [],
      });
    }
    await AcademicProfileModel.findOneAndUpdate(
      { userId },
      { $set: profileSet, $setOnInsert: { userId } },
      { upsert: true, new: true, runValidators: true },
    );
    if (institutionalEmailChanged) await institutionalEmailVerificationService.invalidate(userId);
    await auditService.log("academic_profile.updated", {
      userId,
      targetTableName: "academic_profiles",
      targetRecordId: userId,
      details: { fields: Object.keys(input).filter((field) => !["institutionalEmail", "affiliation"].includes(field)) },
    });
    if (verificationMaterialChanged
        && (existingProfile.verificationStatus === "VERIFIED" || existingProfile.verificationStatus === "PENDING")) {
      await auditService.log("academic_profile.verification.reset", {
        userId,
        targetTableName: "academic_profiles",
        targetRecordId: userId,
        details: { previousStatus: existingProfile.verificationStatus, reason: "identity_material_changed" },
      });
    }
    return buildPrivateProfile(userId);
  },

  async getVerificationStatus(userId: string) {
    const profile = await this.getMine(userId);
    return { academicType: profile.academicType, verification: profile.verification };
  },

  async requestVerification(userId: string) {
    const user = await UserModel.findById(userId).select("academicProfileType role institution").lean();
    if (!user) throw AppError.unauthorized();
    if ((user.academicProfileType ?? legacyType(user.role)) !== "lecturer") {
      throw AppError.forbidden("Only lecturer profiles can request verification");
    }
    const current = await AcademicProfileModel.findOne({ userId }).lean();
    const currentRecord = record(current);
    const affiliation = record(currentRecord.affiliation);
    const email = stringValue(affiliation.institutionalEmail) ?? stringValue(currentRecord.institutionalEmail);
    const department = stringValue(affiliation.department) ?? stringValue(currentRecord.department);
    if (!email || !user.institution || !department) {
      throw AppError.badRequest("Institution, department, and institutional email are required");
    }
    if (!affiliation.institutionalEmailVerifiedAt) {
      throw AppError.badRequest("Verify the institutional email before requesting Lecturer verification");
    }
    const now = new Date();
    const identities = Array.isArray(currentRecord.externalIdentities)
      ? currentRecord.externalIdentities.map(record)
      : [];
    const existingEvidence: AcademicVerificationEvidence[] = (Array.isArray(currentRecord.verificationEvidence)
      ? currentRecord.verificationEvidence.map(record)
      : []).map((item) => ({
        type: item.type as VerificationEvidenceType,
        value: stringValue(item.value),
        status: item.status as AcademicVerificationEvidence["status"],
        source: item.source as AcademicVerificationEvidence["source"],
        createdAt: iso(item.createdAt) ?? now.toISOString(),
        validatedAt: iso(item.validatedAt),
      }));
    const evidence: AcademicVerificationEvidence[] = [
      ...existingEvidence.filter((item) => item.type !== "ORCID"),
      ...identities
        .filter((identity) => identity.provider === "ORCID")
        .map((identity) => ({
          type: "ORCID" as const,
          value: stringValue(identity.externalId) ?? stringValue(identity.profileUrl),
          status: "SUBMITTED" as const,
          source: "USER" as const,
          createdAt: now.toISOString(),
        })),
    ];
    const trustedInstitution = await TrustedInstitutionModel.findOne({
      domains: email.slice(email.lastIndexOf("@") + 1).toLowerCase(),
      isActive: true,
    }).lean();
    const policy = evaluateLecturerVerificationEvidence({
      institutionalEmailVerified: true,
      evidence,
      allowedAutoVerifyMethods: trustedInstitution
        ? trustedInstitution.verificationPolicy?.autoVerifyMethods as VerificationEvidenceType[] | undefined
        : [],
    });
    if (policy.decision === "NOT_ELIGIBLE") {
      throw AppError.badRequest("Verified institutional email evidence is required");
    }
    const autoVerified = policy.decision === "AUTO_VERIFIED";
    const profile = await AcademicProfileModel.findOneAndUpdate(
      { userId, verificationStatus: { $nin: ["PENDING", "VERIFIED"] } },
      {
        $set: {
          verificationStatus: autoVerified ? "VERIFIED" : "PENDING",
          verificationRequestedAt: now,
          verificationEvidence: evidence,
          verifiedAt: autoVerified ? now : null,
          verificationMethod: autoVerified ? "DETERMINISTIC_EVIDENCE_POLICY" : null,
          rejectionReason: null,
          rejectedAt: null,
          rejectedBy: null,
        },
      },
      { new: true, runValidators: true },
    );
    if (!profile) throw AppError.conflict("Verification is already pending or approved");
    await auditService.log("academic_profile.verification.requested", {
      userId,
      targetTableName: "academic_profiles",
      targetRecordId: profile.id,
      details: { evidenceTypes: evidence.map((item) => item.type), policyDecision: policy.decision, reasons: policy.reasons },
    });
    if (autoVerified) {
      await auditService.log("academic_profile.verification.auto_verified", {
        userId,
        targetTableName: "academic_profiles",
        targetRecordId: profile.id,
        details: { evidenceTypes: policy.evidenceTypes, reasons: policy.reasons },
      });
    }
    return buildPrivateProfile(userId);
  },

  async listVerificationRequests(status: string, page: number, pageSize: number) {
    const query = { verificationStatus: status };
    const [profiles, total] = await Promise.all([
      AcademicProfileModel.find(query).sort({ verificationRequestedAt: 1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      AcademicProfileModel.countDocuments(query),
    ]);
    const data = await Promise.all(profiles.map((profile) => buildPrivateProfile(String(profile.userId))));
    return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  },

  async getVerificationDetails(profileId: string) {
    const profile = await AcademicProfileModel.findById(profileId).select("userId").lean();
    if (!profile) throw AppError.notFound("Academic profile not found");
    return buildPrivateProfile(String(profile.userId));
  },

  async decideVerification(profileId: string, input: VerificationDecisionInput, adminId: string) {
    const now = new Date();
    const update = input.decision === "approve"
      ? {
          verificationStatus: "VERIFIED",
          verifiedAt: now,
          verifiedBy: adminId,
          rejectedAt: null,
          rejectedBy: null,
          rejectionReason: null,
          verificationMethod: input.method ?? "ADMIN_REVIEW",
          verificationNote: input.note,
          "verificationEvidence.$[evidence].status": "VALIDATED",
          "verificationEvidence.$[evidence].validatedAt": now,
        }
      : {
          verificationStatus: "REJECTED",
          verifiedAt: null,
          verifiedBy: null,
          rejectedAt: now,
          rejectedBy: adminId,
          rejectionReason: input.reason,
          verificationMethod: "ADMIN_REVIEW",
          verificationNote: input.note,
          "verificationEvidence.$[evidence].status": "REJECTED",
        };
    const profile = await AcademicProfileModel.findOneAndUpdate(
      { _id: profileId, verificationStatus: "PENDING", userId: { $ne: adminId } },
      { $set: update },
      { new: true, runValidators: true, arrayFilters: [{ "evidence.status": "SUBMITTED" }] },
    );
    if (!profile) throw AppError.conflict("Only a pending verification can be decided by another user");
    await auditService.log(`academic_profile.verification.${input.decision}d`, {
      userId: adminId,
      targetTableName: "academic_profiles",
      targetRecordId: profile.id,
      details: { decision: input.decision, targetUserId: String(profile.userId) },
    });
    await notificationService.create({
      userId: profile.userId,
      title: input.decision === "approve" ? "Lecturer verification approved" : "Lecturer verification rejected",
      message: input.decision === "approve"
        ? "Your lecturer academic profile is now verified."
        : "Your lecturer verification request needs changes. Open Academic Profile for details.",
      type: `lecturer_verification_${input.decision === "approve" ? "approved" : "rejected"}`,
      targetKind: "academic_profile",
      targetId: profile._id,
    });
    return buildPrivateProfile(String(profile.userId));
  },

  async listLecturers(query: LecturerListQueryInput) {
    const userFilter: LooseRecord = {
      isActive: { $ne: false },
      $or: [{ academicProfileType: "lecturer" }, { academicProfileType: { $exists: false }, role: "lecturer" }],
    };
    if (query.institution) userFilter.institution = { $regex: escapeRegex(query.institution), $options: "i" };
    if (query.researchInterest) userFilter.researchInterests = { $regex: `^${escapeRegex(query.researchInterest)}$`, $options: "i" };
    const users = await UserModel.find(userFilter).select("_id").lean();
    const filter: LooseRecord = {
      userId: { $in: users.map((user) => user._id) },
      $or: [{ profileVisibility: "PUBLIC" }, { profileVisibility: { $exists: false } }],
    };
    if (query.verifiedOnly) filter.verificationStatus = "VERIFIED";
    if (query.expertise) filter.expertiseAreas = { $regex: `^${escapeRegex(query.expertise)}$`, $options: "i" };
    if (query.supportAvailable !== undefined) filter["supportAvailability.enabled"] = query.supportAvailable;
    if (query.reviewAvailable !== undefined) filter["reviewAvailability.enabled"] = query.reviewAvailable;
    const [profiles, total] = await Promise.all([
      AcademicProfileModel.find(filter).sort({ verifiedAt: -1, updatedAt: -1 })
        .skip((query.page - 1) * query.pageSize).limit(query.pageSize).select("userId").lean(),
      AcademicProfileModel.countDocuments(filter),
    ]);
    const data = await Promise.all(profiles.map(async (profile) => this.getCompact(String(profile.userId))));
    return { data, meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) } };
  },

  async isVerifiedLecturer(userId: string): Promise<boolean> {
    const [user, profile] = await Promise.all([
      UserModel.findById(userId).select("academicProfileType role").lean(),
      AcademicProfileModel.findOne({ userId }).select("verificationStatus").lean(),
    ]);
    return Boolean(
      user
      && (user.academicProfileType ?? legacyType(user.role)) === "lecturer"
      && profile?.verificationStatus === "VERIFIED",
    );
  },
};
