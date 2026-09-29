import { AppError } from "../../common/exceptions/app-error.js";
import { logger } from "../../infrastructure/logger.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { auditService } from "../audit/audit.service.js";
import { academicProfileService } from "./academic-profile.service.js";
import { normalizeProfileCover, profileCoverStorage } from "./profile-cover-storage.service.js";

async function ensureAcademicUser(userId: string) {
  const parsed = parseDatabaseId(userId);
  const user = parsed ? await getPrisma().user.findUnique({
    where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value },
    select: { id: true, systemRole: true, accountStatus: true },
  }) : null;
  if (!user || user.accountStatus !== "ACTIVE"
    || !["USER", "ADMIN"].includes(user.systemRole)) {
    throw AppError.notFound("Academic profile not found");
  }
  return user;
}

async function removeOldCover(key: string | null | undefined) {
  if (!key) return;
  await profileCoverStorage.remove(key).catch((error) => {
    logger.warn({ err: error }, "failed to remove previous profile cover");
  });
}

export const academicProfileCoverService = {
  async upload(userId: string, input: Buffer) {
    const user = await ensureAcademicUser(userId);
    const normalized = await normalizeProfileCover(input);
    const newKey = await profileCoverStorage.save(user.id, normalized);
    let previous;
    try {
      previous = await getPrisma().academicProfile.findUnique({ where: { userId: user.id } });
      const media = { coverStorageKey: newKey, coverMimeType: "image/webp", coverSizeBytes: normalized.length, coverWidth: 1600, coverHeight: 480, coverUpdatedAt: new Date() };
      await getPrisma().academicProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, ...media }, update: media });
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
    const user = await ensureAcademicUser(userId);
    const previous = await getPrisma().academicProfile.findUnique({ where: { userId: user.id } });
    if (previous) await getPrisma().academicProfile.update({ where: { id: previous.id }, data: { coverStorageKey: null, coverMimeType: null, coverSizeBytes: null, coverWidth: null, coverHeight: null, coverUpdatedAt: null } });
    await removeOldCover(previous?.coverStorageKey);
    await auditService.log("academic_profile.cover.removed", {
      userId, targetTableName: "academic_profiles", targetRecordId: userId,
    });
    return academicProfileService.getMine(userId);
  },

  async publicLocation(userId: string, viewerId?: string) {
    const user = await ensureAcademicUser(userId);
    const profile = await getPrisma().academicProfile.findUnique({ where: { userId: user.id }, select: { coverStorageKey: true, profileVisibility: true } });
    if (!profile?.coverStorageKey) throw AppError.notFound("Cover image not found");
    if (userId !== viewerId
      && profile.profileVisibility !== "PUBLIC"
      && !(profile.profileVisibility === "MEMBERS_ONLY" && viewerId)) {
      throw AppError.notFound("Cover image not found");
    }
    return profileCoverStorage.publicLocation(profile.coverStorageKey);
  },
};
