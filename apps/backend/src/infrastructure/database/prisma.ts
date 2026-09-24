import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client.js";

import { env } from "../../config/env.js";

let client: PrismaClient | undefined;

/**
 * Return the process-wide Prisma client.
 *
 * API and BullMQ worker processes each own one PostgreSQL pool; a new pool is
 * never created per request or per job.
 */
export function getPrisma(): PrismaClient {
  if (client) return client;
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for PostgreSQL persistence");
  }

  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    max: 20,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
  client = new PrismaClient({ adapter });
  return client;
}

export async function connectPostgres(): Promise<void> {
  await getPrisma().$connect();
}

export async function disconnectPostgres(): Promise<void> {
  if (!client) return;
  const current = client;
  client = undefined;
  await current.$disconnect();
}

export type DatabaseClient = PrismaClient;
