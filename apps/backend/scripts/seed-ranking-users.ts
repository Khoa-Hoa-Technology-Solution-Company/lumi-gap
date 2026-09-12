import bcrypt from "bcryptjs";
import { connectMongo, disconnectMongo } from "../src/infrastructure/db.js";
import { UserModel } from "../src/modules/auth/models/user.model.js";
import { logger } from "../src/infrastructure/logger.js";

async function main() {
  await connectMongo();

  const passwordHash = await bcrypt.hash("Password123", 10);

  const usersData = [
    {
      email: "top1@test.com",
      passwordHash,
      fullName: "Cao Thủ Submission",
      role: "researcher",
      institution: "Đại học Bách Khoa",
      points: 500,
      credits: 1000,
      isActive: true,
    },
    {
      email: "top2@test.com",
      passwordHash,
      fullName: "Học Thần PDF",
      role: "lecturer",
      institution: "Đại học Khoa học Tự nhiên",
      points: 300,
      credits: 600,
      isActive: true,
    },
    {
      email: "top3@test.com",
      passwordHash,
      fullName: "Học Viên Chăm Chỉ",
      role: "student",
      institution: "Đại học Công nghệ",
      points: 100,
      credits: 200,
      isActive: true,
    },
  ];

  for (const u of usersData) {
    const existing = await UserModel.findOne({ email: u.email });
    if (existing) {
      await UserModel.updateOne({ email: u.email }, { $set: u });
      logger.info({ email: u.email }, "User updated");
    } else {
      await UserModel.create(u);
      logger.info({ email: u.email }, "User created");
    }
  }

  await disconnectMongo();
  logger.info("Seeding ranking users completed.");
  process.exit(0);
}

main().catch((err) => {
  logger.fatal({ err }, "seed failed");
  process.exit(1);
});
