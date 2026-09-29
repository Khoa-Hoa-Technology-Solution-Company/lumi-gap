import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "../../../generated/prisma/client.js";
import { replaceActivePasswordResetToken } from "../password-reset-token.service.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("replaceActivePasswordResetToken", () => {
  it("invalidates the prior active link before creating the newest one", async () => {
    const secondIssuedAt = new Date("2026-09-26T13:05:00.000Z");
    const rows: Array<{ userId: string; tokenHash: string; consumedAt: Date | null }> = [
      { userId: USER_ID, tokenHash: "older-token", consumedAt: null },
      { userId: USER_ID, tokenHash: "already-used", consumedAt: new Date("2026-09-26T12:00:00.000Z") },
    ];
    const calls: string[] = [];
    const tx = {
      $queryRaw: vi.fn(async () => { calls.push("lock"); return []; }),
      passwordResetToken: {
        updateMany: vi.fn(async ({ where, data }: { where: { userId: string; consumedAt: null }; data: { consumedAt: Date } }) => {
          calls.push("invalidate");
          for (const row of rows) {
            if (row.userId === where.userId && row.consumedAt === null) row.consumedAt = data.consumedAt;
          }
          return { count: 1 };
        }),
        create: vi.fn(async ({ data }: { data: { userId: string; tokenHash: string; expiresAt: Date } }) => {
          calls.push("create");
          const row = { ...data, consumedAt: null };
          rows.push(row);
          return row;
        }),
      },
    } as unknown as Prisma.TransactionClient;

    await replaceActivePasswordResetToken(tx, {
      userId: USER_ID,
      tokenHash: "newest-token",
      issuedAt: secondIssuedAt,
      expiresAt: new Date(secondIssuedAt.getTime() + 30 * 60_000),
    });

    expect(calls).toEqual(["lock", "invalidate", "create"]);
    expect(rows.find((row) => row.tokenHash === "older-token")?.consumedAt).toEqual(secondIssuedAt);
    expect(rows.find((row) => row.tokenHash === "already-used")?.consumedAt).toEqual(new Date("2026-09-26T12:00:00.000Z"));
    expect(rows.filter((row) => row.userId === USER_ID && row.consumedAt === null).map((row) => row.tokenHash)).toEqual(["newest-token"]);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
