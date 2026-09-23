import { connectMongo, disconnectMongo } from "../src/infrastructure/db.js";
import { logger } from "../src/infrastructure/logger.js";
import { AcademicProfileModel } from "../src/modules/academic-profiles/academic-profile.model.js";
import { UserModel } from "../src/modules/auth/models/user.model.js";

const apply = process.argv.includes("--apply");

async function main() {
  await connectMongo();
  const legacyUsers = await UserModel.find({ role: { $in: ["student", "researcher", "lecturer"] } })
    .select("_id role academicProfileType email")
    .lean();
  const profileOnlyUsers = await UserModel.find({
    academicProfileType: { $in: ["student", "researcher", "lecturer"] },
  }).select("_id academicProfileType").lean();
  const contextualLegacy = await UserModel.find({ role: { $in: ["reviewer", "moderator"] } })
    .select("_id email role")
    .lean();

  logger.info({
    mode: apply ? "apply" : "dry-run",
    legacyAcademicRoleUsers: legacyUsers.length,
    usersRequiringProfileBackfill: profileOnlyUsers.length,
    contextualRolesRequiringManualReview: contextualLegacy.map((user) => ({ id: user._id, email: user.email, role: user.role })),
  }, "Academic profile migration inventory");

  if (!apply) {
    logger.info("Dry run only. Re-run with --apply after reviewing the inventory.");
    return;
  }

  const allProfileUserIds = new Set([
    ...legacyUsers.map((user) => String(user._id)),
    ...profileOnlyUsers.map((user) => String(user._id)),
  ]);
  if (allProfileUserIds.size > 0) {
    await AcademicProfileModel.bulkWrite([...allProfileUserIds].map((userId) => ({
      updateOne: {
        filter: { userId },
        update: { $setOnInsert: { userId, verificationStatus: "SELF_DECLARED" } },
        upsert: true,
      },
    })));
  }

  if (legacyUsers.length > 0) {
    await UserModel.bulkWrite(legacyUsers.map((user) => ({
      updateOne: {
        filter: { _id: user._id, role: user.role },
        update: { $set: { role: "user", academicProfileType: user.academicProfileType ?? user.role } },
      },
    })));
  }
  logger.info({ migratedUsers: legacyUsers.length, backfilledProfiles: allProfileUserIds.size }, "Academic profile migration applied");
}

main()
  .catch((error) => { logger.fatal({ error }, "Academic profile migration failed"); process.exitCode = 1; })
  .finally(async () => { await disconnectMongo().catch(() => undefined); });
