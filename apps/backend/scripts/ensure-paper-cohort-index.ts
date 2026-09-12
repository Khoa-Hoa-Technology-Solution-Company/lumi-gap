import { connectMongo, disconnectMongo } from "../src/infrastructure/db.js";
import { PaperCohortMembershipModel } from "../src/modules/api-sync/models/paper-cohort-membership.model.js";

const DESIRED_INDEX = "paper_cohort_campaign_unique";
const LEGACY_KEYS = JSON.stringify({ paperId: 1, cohortId: 1 });

/**
 * Replace the pre-campaign cohort uniqueness rule. A paper may belong to the
 * same logical cohort in multiple campaigns, while duplicate provenance rows
 * inside one campaign remain forbidden.
 */
async function main(): Promise<void> {
  await connectMongo();
  try {
    const indexes = await PaperCohortMembershipModel.collection.indexes();
    const legacyIndexes = indexes.filter(
      (index) => index.unique === true && JSON.stringify(index.key) === LEGACY_KEYS,
    );

    for (const index of legacyIndexes) {
      if (index.name) await PaperCohortMembershipModel.collection.dropIndex(index.name);
    }

    const current = (await PaperCohortMembershipModel.collection.indexes()).find(
      (index) => index.name === DESIRED_INDEX,
    );
    if (!current) {
      await PaperCohortMembershipModel.collection.createIndex(
        { paperId: 1, cohortId: 1, campaignId: 1 },
        { unique: true, name: DESIRED_INDEX },
      );
    }

    console.log(JSON.stringify({
      changed: legacyIndexes.length > 0 || !current,
      droppedLegacyIndexes: legacyIndexes.map((index) => index.name),
      index: DESIRED_INDEX,
    }));
  } finally {
    await disconnectMongo();
  }
}

void main().catch((error: unknown) => {
  console.error("Failed to ensure paper cohort index:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
