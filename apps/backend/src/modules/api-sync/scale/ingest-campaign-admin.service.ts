import { AppError } from "../../../common/exceptions/app-error.js";
import { parseDatabaseId, publicDatabaseId } from "../../../infrastructure/database/database-id.js";
import { getPrisma } from "../../../infrastructure/database/prisma.js";

async function campaign(value: string) {
  const parsed = parseDatabaseId(value);
  if (!parsed) throw AppError.badRequest("Invalid campaign id");
  const row = await getPrisma().openAlexIngestCampaign.findUnique({
    where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value },
  });
  if (!row) throw AppError.notFound("Ingest campaign not found");
  return row;
}

export const ingestCampaignAdminService = {
  async listRecent(limit = 20) {
    const rows = await getPrisma().openAlexIngestCampaign.findMany({ orderBy: { createdAt: "desc" }, take: limit });
    return rows.map((row) => ({ ...row, id: publicDatabaseId(row), _id: publicDatabaseId(row) }));
  },

  async getDetail(campaignIdInput: string) {
    const selected = await campaign(campaignIdInput);
    const [partitionRows, attemptRows] = await Promise.all([
      getPrisma().openAlexIngestPartition.groupBy({
        by: ["state"], where: { campaignId: selected.id },
        _count: { _all: true }, _sum: { targetCount: true, acceptedCount: true },
      }),
      getPrisma().openAlexIngestPageAttempt.groupBy({
        by: ["state"], where: { campaignId: selected.id }, _count: { _all: true },
      }),
    ]);
    return {
      campaign: { ...selected, id: publicDatabaseId(selected), _id: publicDatabaseId(selected) },
      partitions: partitionRows.map((row) => ({ state: row.state, count: row._count._all, targetCount: row._sum.targetCount ?? 0, acceptedCount: row._sum.acceptedCount ?? 0 })),
      attempts: attemptRows.map((row) => ({ state: row.state, count: row._count._all })),
    };
  },
};
