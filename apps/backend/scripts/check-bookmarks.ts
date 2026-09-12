import { connectMongo, disconnectMongo } from "../src/infrastructure/db.js";
import { UserModel } from "../src/modules/auth/models/user.model.js";
import { BookmarkModel } from "../src/modules/bookmarks/models/bookmark.model.js";
import { PaperModel } from "../src/modules/papers/models/paper.model.js";
import { logger } from "../src/infrastructure/logger.js";

async function main() {
  await connectMongo();

  const user = await UserModel.findOne({ fullName: "Nguyễn Huy Hoàng" });
  if (!user) {
    console.log("User 'Nguyễn Huy Hoàng' not found in database.");
    await disconnectMongo();
    process.exit(0);
  }

  console.log(`Found user: ${user.fullName} (${user._id})`);

  const bookmarks = await BookmarkModel.find({ userId: user._id });
  console.log(`Found ${bookmarks.length} bookmarks:`);

  for (const b of bookmarks) {
    console.log(`- Bookmark ID: ${b._id}, targetKind: ${b.targetKind}, targetId: ${b.targetId}`);
    if (b.targetKind === "paper") {
      const paper = await PaperModel.findById(b.targetId);
      if (!paper) {
        console.log("  -> Paper NOT found in database!");
      } else {
        console.log(`  -> Paper Title: ${paper.title}`);
        console.log(`  -> Paper Authors:`, paper.authors);
      }
    }
  }

  await disconnectMongo();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
