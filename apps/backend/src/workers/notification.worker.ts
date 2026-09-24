import { Worker } from "bullmq";
import { enforcePostgresOnlyRuntime } from "../infrastructure/database/postgres-only-runtime.js";
import { connectPostgres, disconnectPostgres } from "../infrastructure/database/prisma.js";
import { getPrisma } from "../infrastructure/database/prisma.js";
import { parseDatabaseId, publicDatabaseId } from "../infrastructure/database/database-id.js";
import { makeConnection, QUEUE_NAMES } from "../infrastructure/queue.js";
import { logger } from "../infrastructure/logger.js";
import { startWorkerHeartbeat } from "../infrastructure/worker-heartbeat.js";

enforcePostgresOnlyRuntime();

interface NotificationJob {
  notificationId: string;
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoPushResponse {
  data?: ExpoPushTicket | ExpoPushTicket[];
  errors?: Array<{ message?: string }>;
}

async function sendPush(notificationId: string): Promise<void> {
  const parsed = parseDatabaseId(notificationId);
  if (!parsed) return;
  const prisma = getPrisma();
  const notification = await prisma.notification.findUnique({
    where: parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value },
  });
  if (!notification?.userId) {
    logger.info({ notificationId }, "notification has no user target; skipping push");
    return;
  }

  const tokens = await prisma.deviceToken.findMany({ where: { userId: notification.userId, disabledAt: null } });
  if (tokens.length === 0) {
    logger.info({ notificationId }, "no device tokens for notification target");
    return;
  }

  const messages = tokens.map((device) => ({
    to: device.token,
    sound: "default",
    title: notification.title,
    body: notification.message,
    data: {
      notificationId: publicDatabaseId(notification),
      type: notification.type,
      paperId: notification.paperId ?? undefined,
      targetKind: notification.targetKind ?? (notification.paperId ? "paper" : undefined),
      targetId: notification.targetLegacyMongoId ?? notification.targetUuid ?? notification.paperId ?? undefined,
    },
  }));

  // TODO: Nit - Expo limits push requests to 100 messages per request. If a user has >100 registered
  // active devices, we should chunk the `messages` array into slices of 100 before posting to Expo.
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    throw new Error(`Expo push request failed with HTTP ${response.status}`);
  }

  const payload = (await response.json()) as ExpoPushResponse;
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message ?? "Expo push error").join("; "));
  }

  // TODO: Technical Debt - Expo reports some dead/unregistered tokens asynchronously via receipts
  // (using getPushNotificationReceiptsAsync or the /getReceipts endpoint) later.
  // We currently only check the immediate ticket status for "DeviceNotRegistered". In the future,
  // we should implement a background sync to check receipts and disable dead tokens.
  const tickets = Array.isArray(payload.data) ? payload.data : payload.data ? [payload.data] : [];
  const disabledTokens = tickets
    .map((ticket, index) => ({ ticket, token: tokens[index]?.token }))
    .filter(({ ticket, token }) => token && ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered")
    .map(({ token }) => token!);

  if (disabledTokens.length > 0) {
    await prisma.deviceToken.updateMany({ where: { token: { in: disabledTokens } }, data: { disabledAt: new Date() } });
  }

  logger.info(
    { notificationId, sent: tickets.filter((ticket) => ticket.status === "ok").length, disabled: disabledTokens.length },
    "push notification sent",
  );
}

async function main() {
  await connectPostgres();
  const stopHeartbeat = startWorkerHeartbeat({
    workerName: "worker:notifications",
    queueName: QUEUE_NAMES.notifications,
  });

  const worker = new Worker(
    QUEUE_NAMES.notifications,
    async (job) => {
      const { notificationId } = job.data as NotificationJob;
      logger.info({ jobId: job.id, notificationId, attempt: job.attemptsMade + 1 }, "notification push job received");
      await sendPush(notificationId);
    },
    { connection: makeConnection(), concurrency: 5 },
  );

  worker.on("completed", (job) => logger.info({ jobId: job.id }, "notification push job completed"));
  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, attempt: job?.attemptsMade, err }, "notification push job failed");
  });

  logger.info("notification worker listening on notifications queue");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "notification worker shutting down");
    await stopHeartbeat();
    await worker.close();
    await disconnectPostgres();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.fatal({ err }, "notification worker crashed on startup");
  process.exit(1);
});
