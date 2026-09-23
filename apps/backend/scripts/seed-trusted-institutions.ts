import { connectMongo, disconnectMongo } from "../src/infrastructure/db.js";
import { logger } from "../src/infrastructure/logger.js";
import { TrustedInstitutionModel } from "../src/modules/academic-profiles/trusted-institution.model.js";

const institutions = [
  {
    name: "FPT University",
    domains: ["fpt.edu.vn", "fe.edu.vn"],
    verificationPolicy: {
      allowInstitutionalEmailVerification: true,
      autoVerifyMethods: ["ORCID_AFFILIATION_MATCH"] as const,
    },
  },
];

async function main() {
  await connectMongo();
  for (const institution of institutions) {
    await TrustedInstitutionModel.updateOne(
      { name: institution.name },
      { $set: { ...institution, domains: institution.domains.map((domain) => domain.toLowerCase()), isActive: true } },
      { upsert: true, runValidators: true },
    );
  }
  logger.info({ institutions: institutions.map((item) => item.name) }, "trusted institutions seeded");
  await disconnectMongo();
}

main().catch(async (error) => {
  logger.fatal({ err: error }, "trusted institution seed failed");
  await disconnectMongo().catch(() => undefined);
  process.exit(1);
});
