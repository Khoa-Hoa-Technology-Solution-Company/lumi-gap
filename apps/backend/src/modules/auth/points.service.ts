import { randomUUID } from "node:crypto";
import { AppError } from "../../common/exceptions/app-error.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { creditService } from "../credits/credit.service.js";
import { notificationService } from "../notifications/notification.service.js";

export const REQUEST_PAPER_COST = 100;
export const REDOWNLOAD_COST = 5;
export const INVALID_PDF_PENALTY = 0;
export const RATING_POINTS = 5;

const APPROVED_STATUSES = ["not-downloaded", "downloaded"];
const REQUESTED_STATUSES = [...APPROVED_STATUSES, "pending", "rejected"];
const LEVEL_THRESHOLDS = [0, 25, 75, 150, 300, 600, 1000, 1500, 2000, 3000, Infinity];

type IdLike = string | { toString(): string };
type PaperLike = {
  _id?: IdLike;
  id?: IdLike;
  legacyMongoId?: string | null;
  uploadedBy?: IdLike | null;
  uploadedById?: IdLike | null;
  paperStatus?: string;
  downloadCost?: number | null;
  uploadCreditReward?: number;
  uploadRewardedAt?: Date | null;
};

function getLevel(points: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 2; i >= 0; i -= 1) {
    if (points >= LEVEL_THRESHOLDS[i]!) return i + 1;
  }
  return 1;
}

function databaseWhere(value: IdLike) {
  const parsed = parseDatabaseId(String(value));
  if (!parsed) return null;
  return parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value };
}

async function resolveUser(value: IdLike) {
  const where = databaseWhere(value);
  if (!where) return null;
  return getPrisma().user.findUnique({ where });
}

async function resolvePaper(value: IdLike) {
  const where = databaseWhere(value);
  if (!where) return null;
  return getPrisma().paper.findUnique({ where });
}

function paperIdentifier(paper: PaperLike): IdLike | null {
  return paper.id ?? paper._id ?? paper.legacyMongoId ?? null;
}

export function computeRankingPoints(input: {
  uploadCreditReward: number;
  ratingsGiven: number;
  penaltyPoints: number;
}): number {
  return Math.max(
    0,
    input.uploadCreditReward + input.ratingsGiven * RATING_POINTS - input.penaltyPoints,
  );
}

export function resolveDownloadCost(
  paper: { downloadCost?: number | null },
  isRepeatDownload: boolean,
): number {
  return isRepeatDownload ? REDOWNLOAD_COST : (paper.downloadCost ?? 0);
}

export async function chargePaperRequestCreditChecked(userId: IdLike): Promise<boolean> {
  const owner = await resolveUser(userId);
  if (!owner) return false;
  const result = await getPrisma().user.updateMany({
    where: { id: owner.id, credits: { gte: REQUEST_PAPER_COST } },
    data: { credits: { decrement: REQUEST_PAPER_COST } },
  });
  return result.count === 1;
}

export async function refundPaperRequestCredit(userId: IdLike): Promise<void> {
  const owner = await resolveUser(userId);
  if (!owner) return;
  await getPrisma().user.update({
    where: { id: owner.id },
    data: { credits: { increment: REQUEST_PAPER_COST } },
  });
}

export async function rewardPaperUploadCredit(
  userId: IdLike,
  reward: number,
  paperId: IdLike,
): Promise<void> {
  if (!userId || reward <= 0) return;
  await creditService.rewardCreditsOnce({
    userId: String(userId),
    amount: reward,
    targetId: String(paperId),
    idempotencyKey: `paper-upload-reward:${String(paperId)}`,
    metadata: { description: "Approved PDF upload reward" },
  });
  await syncUserPoints(userId);
}

export async function chargePaperDownloadCredit({
  userId,
  paper,
}: {
  userId: IdLike;
  paper: PaperLike;
}): Promise<{ cost: number; isRepeatDownload: boolean }> {
  const rawPaperId = paperIdentifier(paper);
  if (!userId || !rawPaperId) return { cost: 0, isRepeatDownload: false };

  const [owner, storedPaper] = await Promise.all([
    resolveUser(userId),
    resolvePaper(rawPaperId),
  ]);
  if (!owner) throw AppError.notFound("User not found");
  if (!storedPaper) throw AppError.notFound("Paper not found");

  const prisma = getPrisma();
  const existingDownload = await prisma.paperDownload.findUnique({
    where: { paperId_userId: { paperId: storedPaper.id, userId: owner.id } },
  });
  const isRepeatDownload = Boolean(existingDownload);
  const cost = resolveDownloadCost(storedPaper, isRepeatDownload);

  if (cost > 0) {
    const targetId = publicDatabaseId(storedPaper);
    await creditService.chargeCreditsCheckedOwned({
      userId: publicDatabaseId(owner),
      action: "paper_download",
      amount: cost,
      targetKind: "paper",
      targetId,
      idempotencyKey: isRepeatDownload
        ? `paper-download:repeat:${owner.id}:${storedPaper.id}:${randomUUID()}`
        : `paper-download:first:${owner.id}:${storedPaper.id}`,
      metadata: { repeatDownload: isRepeatDownload },
    });
  }

  if (!existingDownload) {
    await prisma.paperDownload.upsert({
      where: { paperId_userId: { paperId: storedPaper.id, userId: owner.id } },
      create: { paperId: storedPaper.id, userId: owner.id, cost },
      update: {},
    });
  }

  return { cost, isRepeatDownload };
}

export async function recordInvalidPdfUpload(userId: IdLike): Promise<void> {
  const owner = await resolveUser(userId);
  if (!owner) return;
  if (INVALID_PDF_PENALTY > 0) {
    await getPrisma().user.update({
      where: { id: owner.id },
      data: { penaltyPoints: { increment: INVALID_PDF_PENALTY } },
    });
  }
  await syncUserPoints(publicDatabaseId(owner));
}

async function rankingInputs(userId: IdLike) {
  const owner = await resolveUser(userId);
  if (!owner) return null;
  const prisma = getPrisma();
  const approvedPapersWhere = {
    uploadedById: owner.id,
    paperStatus: { in: APPROVED_STATUSES },
    AND: [{ pdfPath: { not: null } }, { pdfPath: { not: "" } }],
  };
  const [uploadAggregate, uploadedPdfs, requestedPapers, ratings] = await Promise.all([
    prisma.paper.aggregate({
      where: approvedPapersWhere,
      _sum: { uploadCreditReward: true },
    }),
    prisma.paper.count({ where: approvedPapersWhere }),
    prisma.paper.count({
      where: { requestedById: owner.id, paperStatus: { in: REQUESTED_STATUSES } },
    }),
    prisma.userRating.groupBy({
      by: ["paperId"],
      where: { userId: owner.id, paperId: { not: null } },
    }),
  ]);
  return {
    owner,
    uploadCreditReward: uploadAggregate._sum.uploadCreditReward ?? 0,
    uploadedPdfs,
    requestedPapers,
    ratingsGiven: ratings.length,
  };
}

export async function syncUserPoints(userId: IdLike): Promise<number> {
  const inputs = await rankingInputs(userId);
  if (!inputs) return 0;
  const points = computeRankingPoints({
    uploadCreditReward: inputs.uploadCreditReward,
    ratingsGiven: inputs.ratingsGiven,
    penaltyPoints: inputs.owner.penaltyPoints,
  });
  const levelBefore = getLevel(inputs.owner.points);
  const levelAfter = getLevel(points);

  await getPrisma().user.update({ where: { id: inputs.owner.id }, data: { points } });
  if (levelAfter > levelBefore) {
    try {
      await notificationService.create({
        userId: publicDatabaseId(inputs.owner),
        title: "Level Up!",
        message: `🎉 Congratulations! You have leveled up to Level ${levelAfter}!`,
        type: "level_up",
      });
    } catch (err) {
      logger.error({ err, userId: inputs.owner.id }, "Failed to send level-up notification");
    }
  }
  return points;
}

export async function calculateUserRankingStats(userId: IdLike): Promise<{
  points: number;
  uploadCreditReward: number;
  uploadedPdfs: number;
  requestedPapers: number;
  ratingsGiven: number;
  penaltyPoints: number;
}> {
  const inputs = await rankingInputs(userId);
  if (!inputs) {
    return {
      points: 0,
      uploadCreditReward: 0,
      uploadedPdfs: 0,
      requestedPapers: 0,
      ratingsGiven: 0,
      penaltyPoints: 0,
    };
  }
  const penaltyPoints = inputs.owner.penaltyPoints;
  const points = computeRankingPoints({
    uploadCreditReward: inputs.uploadCreditReward,
    ratingsGiven: inputs.ratingsGiven,
    penaltyPoints,
  });
  return {
    points,
    uploadCreditReward: inputs.uploadCreditReward,
    uploadedPdfs: inputs.uploadedPdfs,
    requestedPapers: inputs.requestedPapers,
    ratingsGiven: inputs.ratingsGiven,
    penaltyPoints,
  };
}

export async function clawbackUploadReward(paper: PaperLike): Promise<void> {
  const rawPaperId = paperIdentifier(paper);
  if (!rawPaperId) return;
  const storedPaper = await resolvePaper(rawPaperId);
  if (!storedPaper?.uploadedById) return;

  const reward = storedPaper.uploadCreditReward;
  const claimed = await getPrisma().$transaction(async (tx) => {
    const cleared = await tx.paper.updateMany({
      where: { id: storedPaper.id, uploadRewardedAt: { not: null } },
      data: { uploadRewardedAt: null },
    });
    if (!cleared.count) return false;
    if (reward > 0) {
      const owner = await tx.user.findUnique({
        where: { id: storedPaper.uploadedById! },
        select: { credits: true },
      });
      if (owner) {
        await tx.user.update({
          where: { id: storedPaper.uploadedById! },
          data: { credits: Math.max(0, owner.credits - reward) },
        });
      }
    }
    return true;
  }, { isolationLevel: "Serializable" });

  if (claimed) await syncUserPoints(storedPaper.uploadedById);
}

export async function applyUploadCreditReward(paper: PaperLike): Promise<void> {
  const rawPaperId = paperIdentifier(paper);
  if (!rawPaperId) return;
  const storedPaper = await resolvePaper(rawPaperId);
  if (
    !storedPaper?.uploadedById
    || storedPaper.paperStatus !== "downloaded"
    || storedPaper.uploadRewardedAt
  ) return;

  const claimed = await getPrisma().paper.updateMany({
    where: {
      id: storedPaper.id,
      paperStatus: "downloaded",
      uploadedById: { not: null },
      uploadRewardedAt: null,
    },
    data: { uploadRewardedAt: new Date() },
  });
  if (!claimed.count) return;

  try {
    if (storedPaper.uploadCreditReward > 0) {
      await rewardPaperUploadCredit(
        storedPaper.uploadedById,
        storedPaper.uploadCreditReward,
        publicDatabaseId(storedPaper),
      );
    } else {
      await syncUserPoints(storedPaper.uploadedById);
    }
  } catch (error) {
    await getPrisma().paper.updateMany({
      where: { id: storedPaper.id, uploadRewardedAt: { not: null } },
      data: { uploadRewardedAt: null },
    });
    throw error;
  }
}
