import type { TrendTopicFollow, TrendVerdict } from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";
import { env } from "../../config/env.js";
import { parseDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { notificationService } from "../notifications/notification.service.js";
import type { CreateTrendFollowBody } from "./dto/trends.schema.js";
import { findUserId, trendService } from "./trend.service.js";

type FollowRow = Awaited<ReturnType<ReturnType<typeof getPrisma>["trendTopicFollow"]["findFirstOrThrow"]>>;

/** Followed topics are re-checked at most once in this interval, so a re-run of the job does not repeat work. */
const RECHECK_AFTER_MS = 20 * 60 * 60 * 1000;

export const topicKey = (topic: string) => topic.trim().toLowerCase();

const VERDICT_LABEL: Record<TrendVerdict, string> = { rising: "rising", declining: "declining", stable: "stable", insufficient: "insufficient data" };

async function owner(userId: string) {
  const id = await findUserId(userId);
  if (!id) throw AppError.unauthorized();
  return id;
}

function toDto(row: FollowRow): TrendTopicFollow {
  return {
    id: row.id,
    topic: row.topic,
    openalexTopicId: row.openalexTopicId ?? undefined,
    note: row.note ?? undefined,
    lastVerdict: (row.lastVerdict as TrendVerdict | null) ?? undefined,
    lastDataSource: (row.lastDataSource as TrendTopicFollow["lastDataSource"]) ?? undefined,
    lastCheckedAt: row.lastCheckedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/** The current verdict of a topic over the default window, or null when it cannot be computed (no data, OpenAlex down). */
async function currentVerdict(topic: string, openalexTopicId?: string | null) {
  try {
    const detail = await trendService.topic(topic, openalexTopicId ? { topicId: openalexTopicId } : {});
    const verdict = detail.statistics?.classification.verdict;
    return verdict ? { verdict, dataSource: detail.dataSource } : null;
  } catch (err) {
    logger.debug({ err, topic }, "trend follow: verdict unavailable");
    return null;
  }
}

export const trendFollowService = {
  async list(userId: string): Promise<TrendTopicFollow[]> {
    const rows = await getPrisma().trendTopicFollow.findMany({ where: { userId: await owner(userId) }, orderBy: { createdAt: "desc" } });
    return rows.map(toDto);
  },

  async check(userId: string, topic: string): Promise<{ following: boolean; follow?: TrendTopicFollow }> {
    const row = await getPrisma().trendTopicFollow.findUnique({ where: { userId_topicKey: { userId: await owner(userId), topicKey: topicKey(topic) } } });
    return row ? { following: true, follow: toDto(row) } : { following: false };
  },

  async create(userId: string, input: CreateTrendFollowBody): Promise<TrendTopicFollow> {
    const id = await owner(userId), key = topicKey(input.topic);
    const prisma = getPrisma();
    if (await prisma.trendTopicFollow.findUnique({ where: { userId_topicKey: { userId: id, topicKey: key } }, select: { id: true } })) throw AppError.conflict("Topic is already followed");
    // The verdict at follow time is the baseline the daily check compares against.
    const baseline = await currentVerdict(input.topic, input.openalexTopicId);
    const row = await prisma.trendTopicFollow.create({
      data: { userId: id, topic: input.topic.trim(), topicKey: key, openalexTopicId: input.openalexTopicId ?? null, note: input.note?.trim() || null, lastVerdict: baseline?.verdict ?? null, lastDataSource: baseline?.dataSource ?? null, lastCheckedAt: baseline ? new Date() : null },
    });
    return toDto(row);
  },

  async remove(userId: string, followId: string): Promise<void> {
    const id = await owner(userId);
    const parsed = parseDatabaseId(followId);
    if (parsed?.kind !== "uuid") throw AppError.notFound("Followed topic not found");
    const row = await getPrisma().trendTopicFollow.findUnique({ where: { id: parsed.value } });
    if (!row || row.userId !== id) throw AppError.notFound("Followed topic not found");
    await getPrisma().trendTopicFollow.delete({ where: { id: row.id } });
  },

  /**
   * Re-computes the verdict of followed topics that were not checked recently and notifies followers whose
   * topic changed verdict. Each topic is computed once per run, however many users follow it. A topic whose
   * verdict cannot be computed keeps its previous verdict and is retried on the next run.
   */
  async checkFollowedTopics(now = new Date()): Promise<{ topics: number; changed: number }> {
    const prisma = getPrisma();
    const due = await prisma.trendTopicFollow.findMany({
      where: { OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(now.getTime() - RECHECK_AFTER_MS) } }] },
      orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } },
      take: env.TREND_FOLLOW_CHECK_BATCH,
    });
    const byTopic = new Map<string, FollowRow[]>();
    for (const row of due) byTopic.set(row.topicKey, [...(byTopic.get(row.topicKey) ?? []), row]);
    let changed = 0;
    for (const rows of byTopic.values()) {
      const first = rows[0]!;
      const current = await currentVerdict(first.topic, rows.find((row) => row.openalexTopicId)?.openalexTopicId);
      if (!current) continue;
      for (const row of rows) {
        // A verdict from another data source (the local corpus while OpenAlex is down) is not comparable with the
        // baseline: an OpenAlex verdict replaces a local baseline silently, a local one only marks the row checked.
        if (row.lastVerdict && row.lastDataSource && row.lastDataSource !== current.dataSource) {
          const data = current.dataSource === "openalex" ? { lastVerdict: current.verdict, lastDataSource: current.dataSource, lastCheckedAt: now } : { lastCheckedAt: now };
          await prisma.trendTopicFollow.update({ where: { id: row.id }, data });
          continue;
        }
        if (row.lastVerdict && row.lastVerdict !== current.verdict) {
          changed++;
          await notificationService.create({
            userId: row.userId,
            type: "TREND_VERDICT_CHANGED",
            title: `Trend changed: ${row.topic}`,
            message: `"${row.topic}" is now ${VERDICT_LABEL[current.verdict]} (was ${VERDICT_LABEL[row.lastVerdict as TrendVerdict] ?? row.lastVerdict}).`,
            eventKey: `TREND_VERDICT:${row.id}:${row.lastVerdict}:${current.verdict}:${now.toISOString().slice(0, 10)}`,
            emailPayload: { topic: row.topic, openalexTopicId: row.openalexTopicId, from: row.lastVerdict, to: current.verdict },
          }).catch((err) => logger.warn({ err, followId: row.id }, "trend follow: notification failed"));
        }
        await prisma.trendTopicFollow.update({ where: { id: row.id }, data: { lastVerdict: current.verdict, lastDataSource: current.dataSource, lastCheckedAt: now } });
      }
    }
    return { topics: byTopic.size, changed };
  },
};
