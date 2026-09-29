import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "../../../generated/prisma/client.js";
import { applyDisplayNameChangeLimit, getDisplayNamePolicy } from "../display-name-policy.service.js";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-09-26T00:00:00.000Z");

function createTransaction(initialName = "Ada Researcher", initialChanges: Date[] = []) {
  const state = { name: initialName, changes: [...initialChanges] };
  const tx = {
    $queryRaw: vi.fn(async () => []),
    user: {
      findUnique: vi.fn(async () => ({ fullName: state.name })),
      update: vi.fn(async ({ data }: { data: { fullName: string } }) => { state.name = data.fullName; return { fullName: state.name }; }),
    },
    userDisplayNameChange: {
      findMany: vi.fn(async ({ where, take }: { where: { changedAt: { gt: Date } }; take: number }) => state.changes
        .filter((changedAt) => changedAt > where.changedAt.gt)
        .sort((a, b) => a.getTime() - b.getTime())
        .slice(0, take)
        .map((changedAt) => ({ changedAt }))),
      create: vi.fn(async ({ data }: { data: { changedAt: Date } }) => { state.changes.push(data.changedAt); return data; }),
    },
  };
  return { state, tx: tx as unknown as Prisma.TransactionClient };
}

describe("display name change policy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows two actual changes and records each timestamp", async () => {
    const { state, tx } = createTransaction();

    await applyDisplayNameChangeLimit(tx, USER_ID, "Ada R.", NOW);
    await applyDisplayNameChangeLimit(tx, USER_ID, "Ada Lovelace", new Date(NOW.getTime() + 1_000));

    expect(state.name).toBe("Ada Lovelace");
    expect(state.changes).toHaveLength(2);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it("rejects the third change and reports when a change becomes available", async () => {
    const firstChange = new Date("2026-09-01T00:00:00.000Z");
    const { state, tx } = createTransaction("Ada Researcher", [firstChange, new Date("2026-09-10T00:00:00.000Z")]);

    await expect(applyDisplayNameChangeLimit(tx, USER_ID, "Ada L.", NOW)).rejects.toMatchObject({
      statusCode: 429,
      details: {
        limit: 2,
        windowDays: 30,
        nextAvailableAt: "2026-10-01T00:00:00.000Z",
      },
    });
    expect(state.name).toBe("Ada Researcher");
    expect(state.changes).toHaveLength(2);
  });

  it("does not spend a change when the requested name is unchanged", async () => {
    const { state, tx } = createTransaction("Ada Researcher");

    await expect(applyDisplayNameChangeLimit(tx, USER_ID, "Ada Researcher", NOW)).resolves.toBe(false);

    expect(state.changes).toHaveLength(0);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it("excludes changes older than the rolling 30-day window", async () => {
    const { state, tx } = createTransaction("Ada Researcher", [new Date("2026-08-25T23:59:59.999Z"), NOW]);

    await applyDisplayNameChangeLimit(tx, USER_ID, "Ada L.", NOW);

    expect(state.changes).toHaveLength(3);
    expect(state.name).toBe("Ada L.");
  });

  it("returns the remaining changes and next eligible date for the owner profile", async () => {
    const { tx } = createTransaction("Ada Researcher", [new Date("2026-09-01T00:00:00.000Z"), new Date("2026-09-10T00:00:00.000Z")]);
    const client = { userDisplayNameChange: (tx as unknown as { userDisplayNameChange: unknown }).userDisplayNameChange } as never;

    await expect(getDisplayNamePolicy(client, USER_ID, NOW)).resolves.toEqual({
      maxChanges: 2,
      remainingChanges: 0,
      windowDays: 30,
      nextAvailableAt: "2026-10-01T00:00:00.000Z",
    });
  });
});
