import { AppError } from "../../common/exceptions/app-error.js";
import { logger } from "../../infrastructure/logger.js";
import { auditService } from "../audit/audit.service.js";
import { UserModel } from "../auth/models/user.model.js";
import { AcademicProfileModel } from "./academic-profile.model.js";
import { academicProfileService } from "./academic-profile.service.js";
import { normalizeProfileCover, profileCoverStorage } from "./profile-cover-storage.service.js";

async function ensureAcademicUser(userId: string) {
  const user = await UserModel.findById(userId).select("academicProfileType role isActive").lean();
  if (!user || user.isActive === false || !(user.academicProfileType
    || ["student", "researcher", "lecturer"].includes(user.role))) {
    throw AppError.notFound("Academic profile not found");
  }
}

async function removeOldCover(key: string | null | undefined) {
  if (!key) return;
  await profileCoverStorage.remove(key).catch((error) => {
    logger.warn({ err: error }, "failed to remove previous profile cover");
  });
}

export const academicProfileCoverService = {
  async upload(userId: string, input: Buffer) {
    await ensureAcademicUser(userId);
    const normalized = await normalizeProfileCover(input);
    const newKey = await profileCoverStorage.save(userId, normalized);
    let previous;
    try {
      previous = await AcademicProfileModel.findOneAndUpdate(
        { userId },
        { $set: { coverStorageKey: newKey, coverUpdatedAt: new Date() }, $setOnInsert: { userId } },
        { upsert: true, new: false, runValidators: true },
      );
    } catch (error) {
      await profileCoverStorage.remove(newKey).catch(() => undefined);
      throw error;
    }
    await removeOldCover(previous?.coverStorageKey);
    await auditService.log("academic_profile.cover.updated", {
      userId, targetTableName: "academic_profiles", targetRecordId: userId,
    });
    return academicProfileService.getMine(userId);
  },

  async remove(userId: string) {
    await ensureAcademicUser(userId);
    const previous = await AcademicProfileModel.findOneAndUpdate(
      { userId },
      { $unset: { coverStorageKey: 1, coverUpdatedAt: 1 } },
      { new: false },
    );
    await removeOldCover(previous?.coverStorageKey);
    await auditService.log("academic_profile.cover.removed", {
      userId, targetTableName: "academic_profiles", targetRecordId: userId,
    });
    return academicProfileService.getMine(userId);
  },

  async publicLocation(userId: string, viewerId?: string) {
    await ensureAcademicUser(userId);
    const profile = await AcademicProfileModel.findOne({ userId }).select("coverStorageKey profileVisibility").lean();
    if (!profile?.coverStorageKey) throw AppError.notFound("Cover image not found");
    if (userId !== viewerId
      && profile.profileVisibility !== "PUBLIC"
      && !(profile.profileVisibility === "MEMBERS_ONLY" && viewerId)) {
      throw AppError.notFound("Cover image not found");
    }
    return profileCoverStorage.publicLocation(profile.coverStorageKey);
  },
};
