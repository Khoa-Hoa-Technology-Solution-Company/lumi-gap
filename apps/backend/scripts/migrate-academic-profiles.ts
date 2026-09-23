import mongoose from "mongoose";
import { connectMongo, disconnectMongo } from "../src/infrastructure/db.js";
import { logger } from "../src/infrastructure/logger.js";
import { AcademicProfileModel } from "../src/modules/academic-profiles/academic-profile.model.js";
import { UserModel } from "../src/modules/auth/models/user.model.js";

const apply = process.argv.includes("--apply");
type AcademicType = "student" | "researcher" | "lecturer";

async function main() {
  await connectMongo();
  const legacyAcademicUsers = await UserModel.find({ role: { $in: ["student", "researcher", "lecturer"] } })
    .select("_id role academicProfileType email")
    .lean();
  const typedUsers = await UserModel.find({ academicProfileType: { $in: ["student", "researcher", "lecturer"] } })
    .select("_id academicProfileType")
    .lean();
  const contextualLegacy = await UserModel.find({ role: { $in: ["reviewer", "moderator"] } })
    .select("_id email role")
    .lean();
  const legacyProfiles = await AcademicProfileModel.find({
    $or: [
      { bio: { $exists: true } },
      { department: { $exists: true } },
      { institutionalEmail: { $exists: true } },
      { "externalIdentities.verificationStatus": { $exists: true } },
    ],
  }).lean();

  const allAcademicUserIds = new Set([
    ...legacyAcademicUsers.map((user) => String(user._id)),
    ...typedUsers.map((user) => String(user._id)),
  ]);

  logger.info({
    mode: apply ? "apply" : "dry-run",
    usersRequiringAcademicTypeMirror: legacyAcademicUsers.filter((user) => !user.academicProfileType).length,
    usersEligibleForProfileBackfill: allAcademicUserIds.size,
    profilesUsingLegacyFields: legacyProfiles.length,
    contextualRolesRequiringManualReview: contextualLegacy.map((user) => ({ id: user._id, email: user.email, role: user.role })),
    rolePolicy: "Existing account roles are preserved. Lecturer never implies VERIFIED.",
  }, "Academic profile migration inventory");

  if (!apply) {
    logger.info("Dry run only. Re-run with --apply after reviewing the inventory.");
    return;
  }

  if (allAcademicUserIds.size > 0) {
    await AcademicProfileModel.bulkWrite([...allAcademicUserIds].map((userId) => ({
      updateOne: {
        filter: { userId: new mongoose.Types.ObjectId(userId) },
        update: { $setOnInsert: { userId: new mongoose.Types.ObjectId(userId), verificationStatus: "SELF_DECLARED" } },
        upsert: true,
      },
    })));
  }

  const usersMissingMirror = legacyAcademicUsers.filter((user) => !user.academicProfileType);
  if (usersMissingMirror.length > 0) {
    await UserModel.bulkWrite(usersMissingMirror.map((user) => ({
      updateOne: {
        filter: { _id: user._id, academicProfileType: { $exists: false } },
        // Preserve role to avoid breaking existing guards; only add the profile-type mirror.
        update: { $set: { academicProfileType: user.role as AcademicType } },
      },
    })));
  }

  if (legacyProfiles.length > 0) {
    await AcademicProfileModel.bulkWrite(legacyProfiles.map((profile) => {
      const legacy = profile as typeof profile & {
        bio?: string;
        department?: string;
        institutionalEmail?: string;
        externalIdentities?: Array<Record<string, unknown>>;
      };
      const set: Record<string, unknown> = {};
      const identities = legacy.externalIdentities as unknown as Array<Record<string, unknown>> | undefined;
      if (!profile.biography && legacy.bio) set.biography = legacy.bio;
      if (!profile.affiliation?.department && legacy.department) set["affiliation.department"] = legacy.department;
      if (!profile.affiliation?.institutionalEmail && legacy.institutionalEmail) {
        set["affiliation.institutionalEmail"] = legacy.institutionalEmail;
      }
      if (identities?.some((identity) => "verificationStatus" in identity)) {
        set.externalIdentities = identities.map((identity) => ({
          provider: identity.provider,
          externalId: identity.externalId,
          profileUrl: identity.profileUrl,
          status: identity.status ?? identity.verificationStatus ?? "UNVERIFIED",
          source: identity.source ?? "SELF_ASSERTED",
          linkedAt: identity.linkedAt,
          verifiedAt: identity.verifiedAt,
        }));
      }
      return { updateOne: { filter: { _id: profile._id }, update: { $set: set } } };
    }));
  }

  logger.info({
    mirroredAcademicTypes: usersMissingMirror.length,
    backfilledProfiles: allAcademicUserIds.size,
    migratedLegacyProfileShapes: legacyProfiles.length,
  }, "Academic profile migration applied without changing account roles or verification status");
}

main()
  .catch((error) => { logger.fatal({ error }, "Academic profile migration failed"); process.exitCode = 1; })
  .finally(async () => { await disconnectMongo().catch(() => undefined); });
