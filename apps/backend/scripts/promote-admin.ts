/**
 * Promote a user to the `admin` role — or create a brand-new admin user.
 *
 * Why this exists: public /auth/register intentionally CANNOT create admins
 * (role is restricted to student/lecturer/researcher). To get into the admin
 * UI you need at least one user with role = "admin". This script is the
 * blessed way to mint one.
 *
 * Usage (run from repo root or apps/backend; reads apps/backend/.env):
 *   - Promote an EXISTING user (already registered):
 *       pnpm --filter backend promote-admin you@email.com
 *   - CREATE a new admin from scratch (no such user yet):
 *       pnpm --filter backend promote-admin admin@trend.local "StrongPass123" "Site Admin"
 *
 * Idempotent: re-running on an existing admin is a no-op.
 */
import bcrypt from "bcryptjs";
import { connectMongo, disconnectMongo } from "../src/infrastructure/db.js";
import { UserModel } from "../src/modules/auth/models/user.model.js";
import { logger } from "../src/infrastructure/logger.js";

const BCRYPT_ROUNDS = 10; // same as auth.service.ts

async function main(): Promise<void> {
  const [emailArg, password, fullNameArg] = process.argv.slice(2);
  const email = emailArg?.toLowerCase().trim();

  if (!email || !email.includes("@")) {
    logger.error(
      "Usage:\n" +
        "  promote existing user:  pnpm --filter backend promote-admin <email>\n" +
        "  create new admin:        pnpm --filter backend promote-admin <email> <password> [fullName]",
    );
    process.exit(1);
  }

  await connectMongo();

  const existing = await UserModel.findOne({ email });

  if (existing) {
    if (existing.role === "admin") {
      logger.info({ email }, "user is already an admin — nothing to do");
    } else {
      const previousRole = existing.role;
      existing.role = "admin";
      existing.isActive = true;
      await existing.save();
      logger.info({ email, previousRole }, "✅ user promoted to admin");
    }
    await disconnectMongo();
    process.exit(0);
  }

  // No user with that email — create a fresh admin, but only if a password was given.
  if (!password) {
    logger.error(
      { email },
      "no user found with that email. To CREATE a new admin, pass a password:\n" +
        "  pnpm --filter backend promote-admin <email> <password> [fullName]",
    );
    await disconnectMongo();
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const fullName = fullNameArg?.trim() || email.split("@")[0];
  await UserModel.create({ email, passwordHash, fullName, role: "admin" });
  logger.info({ email, fullName }, "✅ new admin user created — log in with these credentials");

  await disconnectMongo();
  process.exit(0);
}

main().catch((err) => {
  logger.fatal({ err }, "promote-admin failed");
  process.exit(1);
});
