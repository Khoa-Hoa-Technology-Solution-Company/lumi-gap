import type {
  AcademicProfile,
  AcademicProfileType,
  PublicAcademicProfile,
} from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { auditService } from "../audit/audit.service.js";
import { UserModel } from "../auth/models/user.model.js";
import { notificationService } from "../notifications/notification.service.js";
import { AcademicProfileModel } from "./academic-profile.model.js";
import type {
  UpdateAcademicProfileDetailsInput,
  VerificationDecisionInput,
} from "./dto/academic-profile.schema.js";

type LeanAcademicProfile = {
  _id: unknown;
  userId: unknown;
  bio?: string | null;
  department?: string | null;
  academicTitle?: string | null;
  institutionalEmail?: string | null;
  expertiseAreas?: string[];
  skills?: string[];
  externalIdentities?: Array<{
    provider: "ORCID" | "GITHUB";
    externalId?: string | null;
    profileUrl?: string | null;
    verificationStatus: "UNVERIFIED" | "LINKED" | "VERIFIED";
  }>;
  supportAvailability?: {
    enabled: boolean;
    types: AcademicProfile["supportAvailability"]["types"];
    preferredTopics: string[];
    note?: string | null;
  };
  reviewAvailability?: {
    enabled: boolean;
    types: AcademicProfile["reviewAvailability"]["types"];
    preferredTopics: string[];
    note?: string | null;
  };
  verificationStatus: AcademicProfile["verificationStatus"];
  verificationRequestedAt?: Date | null;
  verifiedAt?: Date | null;
  verifiedBy?: unknown;
  rejectionReason?: string | null;
  verificationNote?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function legacyType(role: string): AcademicProfileType | undefined {
  return role === "student" || role === "researcher" || role === "lecturer" ? role : undefined;
}

async function loadCombined(userId: string, includePrivate: boolean): Promise<AcademicProfile | PublicAcademicProfile> {
  const [user, profile] = await Promise.all([
    UserModel.findById(userId).select("fullName institution researchInterests academicProfileType role isActive").lean(),
    AcademicProfileModel.findOne({ userId }).lean(),
  ]);
  if (!user || user.isActive === false) throw AppError.notFound("Academic profile not found");
  const academicType = user.academicProfileType ?? legacyType(user.role);
  if (!academicType) throw AppError.notFound("Academic profile not found");
  const now = new Date();
  const base: LeanAcademicProfile = (profile as LeanAcademicProfile | null) ?? {
    _id: user._id,
    userId: user._id,
    expertiseAreas: [],
    skills: [],
    externalIdentities: [],
    supportAvailability: { enabled: false, types: [], preferredTopics: [] },
    reviewAvailability: { enabled: false, types: [], preferredTopics: [] },
    verificationStatus: "SELF_DECLARED",
    createdAt: now,
    updatedAt: now,
  };
  const dto: AcademicProfile = {
    id: String(base._id),
    userId: String(user._id),
    academicType,
    displayName: user.fullName,
    bio: base.bio ?? undefined,
    institution: user.institution ?? undefined,
    department: base.department ?? undefined,
    academicTitle: base.academicTitle ?? undefined,
    institutionalEmail: base.institutionalEmail ?? undefined,
    researchInterests: user.researchInterests ?? [],
    expertiseAreas: base.expertiseAreas ?? [],
    skills: base.skills ?? [],
    externalIdentities: (base.externalIdentities ?? []).map((identity) => ({
      provider: identity.provider,
      externalId: identity.externalId ?? undefined,
      profileUrl: identity.profileUrl ?? undefined,
      verificationStatus: identity.verificationStatus,
    })),
    supportAvailability: {
      enabled: base.supportAvailability?.enabled ?? false,
      types: base.supportAvailability?.types ?? [],
      preferredTopics: base.supportAvailability?.preferredTopics ?? [],
      note: base.supportAvailability?.note ?? undefined,
    },
    reviewAvailability: {
      enabled: base.reviewAvailability?.enabled ?? false,
      types: base.reviewAvailability?.types ?? [],
      preferredTopics: base.reviewAvailability?.preferredTopics ?? [],
      note: base.reviewAvailability?.note ?? undefined,
    },
    verificationStatus: base.verificationStatus,
    verificationRequestedAt: base.verificationRequestedAt?.toISOString(),
    verifiedAt: base.verifiedAt?.toISOString(),
    verifiedBy: base.verifiedBy ? String(base.verifiedBy) : undefined,
    rejectionReason: base.rejectionReason ?? undefined,
    verificationNote: base.verificationNote ?? undefined,
    createdAt: base.createdAt.toISOString(),
    updatedAt: base.updatedAt.toISOString(),
  };
  if (includePrivate) return dto;
  const { institutionalEmail: _email, verifiedBy: _by, rejectionReason: _reason, verificationNote: _note, ...publicDto } = dto;
  return publicDto;
}

export const academicProfileService = {
  async getMine(userId: string) {
    await AcademicProfileModel.updateOne(
      { userId },
      { $setOnInsert: { userId, verificationStatus: "SELF_DECLARED" } },
      { upsert: true },
    );
    return loadCombined(userId, true);
  },

  async getPublic(userId: string) {
    return loadCombined(userId, false);
  },

  async updateMine(userId: string, input: UpdateAcademicProfileDetailsInput) {
    const user = await UserModel.findById(userId);
    if (!user) throw AppError.unauthorized();
    const previousType = user.academicProfileType ?? legacyType(user.role);
    if (input.academicType !== undefined) user.academicProfileType = input.academicType;
    if (input.displayName !== undefined) user.fullName = input.displayName;
    if (input.institution !== undefined) user.institution = input.institution || undefined;
    if (input.researchInterests !== undefined) user.researchInterests = input.researchInterests;
    await user.save();

    const profileSet: Record<string, unknown> = {};
    for (const key of ["bio", "department", "academicTitle", "institutionalEmail", "expertiseAreas", "skills", "supportAvailability", "reviewAvailability"] as const) {
      if (input[key] !== undefined) profileSet[key] = input[key] || undefined;
    }
    if (input.externalIdentities !== undefined) {
      profileSet.externalIdentities = input.externalIdentities.map((identity) => ({
        ...identity,
        verificationStatus: "UNVERIFIED",
      }));
    }
    if (input.academicType !== undefined && input.academicType !== previousType) {
      Object.assign(profileSet, {
        verificationStatus: "SELF_DECLARED",
        verificationRequestedAt: null,
        verifiedAt: null,
        verifiedBy: null,
        rejectionReason: null,
        verificationNote: null,
      });
    }
    await AcademicProfileModel.findOneAndUpdate(
      { userId },
      { $set: profileSet, $setOnInsert: { userId } },
      { upsert: true, new: true, runValidators: true },
    );
    await auditService.log("academic_profile.updated", {
      userId,
      targetTableName: "academic_profiles",
      targetRecordId: userId,
      details: { fields: Object.keys(input) },
    });
    return loadCombined(userId, true);
  },

  async requestVerification(userId: string) {
    const user = await UserModel.findById(userId).select("academicProfileType role institution").lean();
    if (!user) throw AppError.unauthorized();
    if ((user.academicProfileType ?? legacyType(user.role)) !== "lecturer") {
      throw AppError.forbidden("Only lecturer profiles can request verification");
    }
    const profile = await AcademicProfileModel.findOne({ userId });
    if (!profile?.institutionalEmail || !user.institution || !profile.department) {
      throw AppError.badRequest("Institution, department, and institutional email are required");
    }
    if (profile.verificationStatus === "VERIFIED") throw AppError.conflict("Lecturer is already verified");
    if (profile.verificationStatus === "PENDING") throw AppError.conflict("Verification request is already pending");
    profile.verificationStatus = "PENDING";
    profile.verificationRequestedAt = new Date();
    profile.rejectionReason = undefined;
    await profile.save();
    await auditService.log("academic_profile.verification.requested", {
      userId,
      targetTableName: "academic_profiles",
      targetRecordId: profile.id,
    });
    return loadCombined(userId, true);
  },

  async listVerificationRequests(status: string, page: number, pageSize: number) {
    const query = { verificationStatus: status };
    const [profiles, total] = await Promise.all([
      AcademicProfileModel.find(query).sort({ verificationRequestedAt: 1 }).skip((page - 1) * pageSize).limit(pageSize).lean(),
      AcademicProfileModel.countDocuments(query),
    ]);
    const data = await Promise.all(profiles.map((profile) => loadCombined(String(profile.userId), true)));
    return { data, meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  },

  async decideVerification(profileId: string, input: VerificationDecisionInput, adminId: string) {
    const now = new Date();
    const update = input.decision === "approve"
      ? {
          verificationStatus: "VERIFIED",
          verifiedAt: now,
          verifiedBy: adminId,
          verificationNote: input.note,
          rejectionReason: null,
        }
      : {
          verificationStatus: "REJECTED",
          verifiedAt: null,
          verifiedBy: adminId,
          verificationNote: input.note,
          rejectionReason: input.reason,
        };
    const profile = await AcademicProfileModel.findOneAndUpdate(
      { _id: profileId, verificationStatus: "PENDING", userId: { $ne: adminId } },
      { $set: update },
      { new: true, runValidators: true },
    );
    if (!profile) throw AppError.conflict("Only a pending verification can be decided by another user");
    await auditService.log(`academic_profile.verification.${input.decision}d`, {
      userId: adminId,
      targetTableName: "academic_profiles",
      targetRecordId: profile.id,
      details: input,
    });
    await notificationService.create({
      userId: profile.userId,
      title: input.decision === "approve" ? "Lecturer verification approved" : "Lecturer verification rejected",
      message: input.decision === "approve"
        ? "Your lecturer academic profile is now verified."
        : `Your lecturer verification request was rejected.${input.reason ? ` ${input.reason}` : ""}`,
      type: `lecturer_verification_${input.decision === "approve" ? "approved" : "rejected"}`,
      targetKind: "academic_profile",
      targetId: profile._id,
    });
    return loadCombined(String(profile.userId), true);
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
