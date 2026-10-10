import { AppError } from "../../common/exceptions/app-error.js";
import { logger } from "../../infrastructure/logger.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { auditService } from "../audit/audit.service.js";
import { academicProfileService } from "./academic-profile.service.js";
import { normalizeProfileAvatar, profileAvatarStorage } from "./profile-cover-storage.service.js";

async function ensureAcademicUser(userId: string) {
  const parsed = parseDatabaseId(userId);
  const user = parsed ? await getPrisma().user.findUnique({
    where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value },
    select: { id: true, systemRole: true, accountStatus: true, isActive: true },
  }) : null;
  if (!user?.isActive || user.accountStatus !== "ACTIVE" || !["USER", "ADMIN"].includes(user.systemRole)) {
    throw AppError.notFound("Academic profile not found");
  }
  return user;
}

async function removeOldAvatar(key: string | null | undefined) {
  if (!key) return;
  await profileAvatarStorage.remove(key).catch((error) => {
    logger.warn({ err: error }, "failed to remove previous profile avatar");
  });
}

export const academicProfileAvatarService = {
  async upload(userId: string, input: Buffer) {
    const user = await ensureAcademicUser(userId);
    const normalized = await normalizeProfileAvatar(input);
    const newKey = await profileAvatarStorage.save(user.id, normalized);
    let previous;
    try {
      previous = await getPrisma().academicProfile.findUnique({ where: { userId: user.id } });
      const media = { avatarStorageKey: newKey, avatarMimeType: "image/webp", avatarSizeBytes: normalized.length, avatarWidth: 512, avatarHeight: 512, avatarUpdatedAt: new Date() };
      await getPrisma().academicProfile.upsert({ where: { userId: user.id }, create: { userId: user.id, ...media }, update: media });
    } catch (error) {
      await profileAvatarStorage.remove(newKey).catch(() => undefined);
      throw error;
    }
    await removeOldAvatar(previous?.avatarStorageKey);
    await auditService.log("academic_profile.avatar.updated", { userId: user.id, targetTableName: "academic_profiles", targetRecordId: user.id });
    return academicProfileService.getMine(user.id);
  },

  async remove(userId: string) {
    const user = await ensureAcademicUser(userId);
    const previous = await getPrisma().academicProfile.findUnique({ where: { userId: user.id } });
    if (previous) {
      await getPrisma().academicProfile.update({
        where: { id: previous.id },
        data: { avatarStorageKey: null, avatarMimeType: null, avatarSizeBytes: null, avatarWidth: null, avatarHeight: null, avatarUpdatedAt: null },
      });
    }
    await removeOldAvatar(previous?.avatarStorageKey);
    await auditService.log("academic_profile.avatar.removed", { userId: user.id, targetTableName: "academic_profiles", targetRecordId: user.id });
    return academicProfileService.getMine(user.id);
  },

  async publicLocation(userId: string, viewerId?: string) {
    const user = await ensureAcademicUser(userId);
    const profile = await getPrisma().academicProfile.findUnique({ where: { userId: user.id }, select: { avatarStorageKey: true, profileVisibility: true } });
    if (!profile?.avatarStorageKey) throw AppError.notFound("Profile photo not found");
    if (userId !== viewerId && user.id !== viewerId
      && profile.profileVisibility !== "PUBLIC"
      && !(profile.profileVisibility === "MEMBERS_ONLY" && viewerId)) {
      throw AppError.notFound("Profile photo not found");
    }
    return profileAvatarStorage.publicLocation(profile.avatarStorageKey);
  },
};
