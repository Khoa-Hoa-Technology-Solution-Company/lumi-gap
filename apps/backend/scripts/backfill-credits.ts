import { connectMongo, disconnectMongo } from "../src/infrastructure/db.js";
import { UserModel } from "../src/modules/auth/models/user.model.js";
import { logger } from "../src/infrastructure/logger.js";
import { env } from "../src/config/env.js";

async function main() {
  await connectMongo();

  const initialCredits = env.INITIAL_USER_CREDITS ?? 1000;
  
  // Find users with undefined, null, or 0 credits
  const users = await UserModel.find({
    $or: [
      { credits: { $exists: false } },
      { credits: null },
      { credits: 0 }
    ]
  });

  logger.info(`Found ${users.length} users with missing or 0 credits.`);

  for (const user of users) {
    user.credits = initialCredits;
    await user.save();
    logger.info({ email: user.email, credits: initialCredits }, "Backfilled credits for user");
  }

  await disconnectMongo();
  logger.info("Backfill credits completed.");
  process.exit(0);
}

main().catch((err) => {
  logger.fatal({ err }, "Backfill credits failed");
  process.exit(1);
});
