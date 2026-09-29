import type { Prisma } from "../../generated/prisma/client.js";
import { AppError } from "../../common/exceptions/app-error.js";
import type { DatabaseClient } from "../../infrastructure/database/prisma.js";

export const DISPLAY_NAME_CHANGE_LIMIT = 2;
export const DISPLAY_NAME_CHANGE_WINDOW_DAYS = 30;
const WINDOW_MS = DISPLAY_NAME_CHANGE_WINDOW_DAYS * 24 * 60 * 60 * 1_000;

export async function applyDisplayNameChangeLimit(
  tx: Prisma.TransactionClient,
  userId: string,
  requestedName: string,
  now = new Date(),
): Promise<boolean> {
  // Serialize name changes per account before counting so parallel requests
  // cannot both consume the last available change.
  await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${userId}::uuid FOR UPDATE`;
  const user = await tx.user.findUnique({ where: { id: userId }, select: { fullName: true } });
  if (!user) throw AppError.notFound("User not found");
  if (requestedName === user.fullName) return false;

  const since = new Date(now.getTime() - WINDOW_MS);
  const changes = await tx.userDisplayNameChange.findMany({
    where: { userId, changedAt: { gt: since } },
    orderBy: { changedAt: "asc" },
    take: DISPLAY_NAME_CHANGE_LIMIT,
    select: { changedAt: true },
  });
  if (changes.length >= DISPLAY_NAME_CHANGE_LIMIT) {
    const nextAvailableAt = new Date(changes[0]!.changedAt.getTime() + WINDOW_MS);
    throw AppError.tooMany("Display name can be changed at most 2 times in any 30-day period.", {
      limit: DISPLAY_NAME_CHANGE_LIMIT,
      windowDays: DISPLAY_NAME_CHANGE_WINDOW_DAYS,
      nextAvailableAt: nextAvailableAt.toISOString(),
    });
  }

  await tx.user.update({ where: { id: userId }, data: { fullName: requestedName } });
  await tx.userDisplayNameChange.create({ data: { userId, changedAt: now } });
  return true;
}

export async function getDisplayNamePolicy(client: DatabaseClient, userId: string, now = new Date()) {
  const since = new Date(now.getTime() - WINDOW_MS);
  const changes = await client.userDisplayNameChange.findMany({
    where: { userId, changedAt: { gt: since } },
    orderBy: { changedAt: "asc" },
    take: DISPLAY_NAME_CHANGE_LIMIT,
    select: { changedAt: true },
  });
  return {
    maxChanges: DISPLAY_NAME_CHANGE_LIMIT,
    remainingChanges: Math.max(0, DISPLAY_NAME_CHANGE_LIMIT - changes.length),
    windowDays: DISPLAY_NAME_CHANGE_WINDOW_DAYS,
    ...(changes.length >= DISPLAY_NAME_CHANGE_LIMIT
      ? { nextAvailableAt: new Date(changes[0]!.changedAt.getTime() + WINDOW_MS).toISOString() }
      : {}),
  };
}
