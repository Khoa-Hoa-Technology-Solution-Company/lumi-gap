import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../../../config/env.js";
import { projectChatService as chat } from "../project-chat.service.js";

const db = vi.hoisted(() => ({
  project: { findFirst: vi.fn() },
  user: { findFirst: vi.fn(), findMany: vi.fn() },
  projectChatMessage: { findFirst: vi.fn(), findMany: vi.fn() },
  projectChatCitation: { findMany: vi.fn() },
}));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => db }));

describe("project AI history cursor query", () => {
  const projectId = "11111111-1111-4111-8111-111111111111";
  const userId = "22222222-2222-4222-8222-222222222222";
  const cursorId = "33333333-3333-4333-8333-333333333333";
  const legacyCursor = "0123456789abcdef01234567";
  const createdAt = new Date("2026-10-24T12:00:00Z");
  const row = (id: string, role: "user" | "assistant") => ({
    id, role, projectId, userId, createdAt, legacyMongoId: null, content: role,
    creditCost: null, isPinned: false, pinnedAt: null, pinnedById: null,
  });
  const userLow = row("f0000000-0000-4000-8000-000000000001", "user");
  const userHigh = row("f0000000-0000-4000-8000-000000000002", "user");
  const assistantLow = row("00000000-0000-4000-8000-000000000001", "assistant");
  const assistantHigh = row("00000000-0000-4000-8000-000000000002", "assistant");
  beforeEach(() => {
    vi.resetAllMocks();
    db.project.findFirst.mockResolvedValue({ id: projectId, ownerId: userId });
    db.user.findFirst.mockResolvedValue({ id: userId, isActive: true, accountStatus: "ACTIVE" });
    db.user.findMany.mockResolvedValue([{ id: userId, legacyMongoId: null, fullName: "Owner", email: "owner@example.org", avatarUrl: null }]);
    db.projectChatCitation.findMany.mockResolvedValue([]);
    db.projectChatMessage.findFirst.mockResolvedValue({ id: cursorId });
    db.projectChatMessage.findMany.mockResolvedValue([]);
  });
  it.each(["private", "team"] as const)("scopes the %s legacy cursor lookup and paginates using the full inverse tie order", async (scope) => {
    const where = { projectId, ...(scope === "private" ? { userId } : {}), scope };
    db.projectChatMessage.findMany.mockResolvedValue([assistantHigh, assistantLow, userHigh, userLow].map(message => ({ ...message, scope })));
    const result = await chat.listHistory(projectId, userId, 50, scope, legacyCursor);
    expect(db.projectChatMessage.findFirst).toHaveBeenCalledWith({ where: { legacyMongoId: legacyCursor, ...where }, select: { id: true } });
    expect(db.projectChatMessage.findMany).toHaveBeenCalledWith({
      where, take: 50, cursor: { id: cursorId }, skip: 1,
      orderBy: [{ createdAt: "desc" }, { role: "asc" }, { id: "desc" }],
    });
    expect(result.map(message => message.id)).toEqual([userLow.id, userHigh.id, assistantLow.id, assistantHigh.id]);
  });
  it.each(["private", "team"] as const)("rejects an invisible %s cursor before reading any history", async (scope) => {
    db.projectChatMessage.findFirst.mockResolvedValue(null);
    await expect(chat.listHistory(projectId, userId, 50, scope, cursorId)).rejects.toMatchObject({ statusCode: 404 });
    expect(db.projectChatMessage.findFirst).toHaveBeenCalledWith({
      where: { id: cursorId, projectId, ...(scope === "private" ? { userId } : {}), scope }, select: { id: true },
    });
    expect(db.projectChatMessage.findMany).not.toHaveBeenCalled();
    expect(db.projectChatCitation.findMany).not.toHaveBeenCalled();
  });
  it("keeps the initial private page free of cursor or skip restrictions", async () => {
    await expect(chat.listHistory(projectId, userId, 50)).resolves.toEqual([]);
    expect(db.projectChatMessage.findFirst).not.toHaveBeenCalled();
    expect(db.projectChatMessage.findMany).toHaveBeenCalledWith({
      where: { projectId, userId, scope: "private" }, take: 50,
      orderBy: [{ createdAt: "desc" }, { role: "asc" }, { id: "desc" }],
    });
  });
  it("keeps tied prompt and answer context in conversational order despite inverted UUIDs", async () => {
    const previousHistoryTurns = env.CHAT_HISTORY_TURNS;
    env.CHAT_HISTORY_TURNS = 1;
    db.projectChatMessage.findMany.mockResolvedValue([assistantLow, userHigh]);
    const internal = chat as unknown as {
      loadRecentHistory(projectId: string, userId: string, scope: "private"): Promise<Array<{ role: string; content: string }>>;
    };
    try {
      await expect(internal.loadRecentHistory(projectId, userId, "private")).resolves.toEqual([
        { role: "user", content: "user" }, { role: "assistant", content: "assistant" },
      ]);
      expect(db.projectChatMessage.findMany).toHaveBeenCalledWith({
        where: { projectId, userId, scope: "private" }, take: 2,
        orderBy: [{ createdAt: "desc" }, { role: "asc" }, { id: "desc" }],
        select: { role: true, content: true },
      });
    } finally { env.CHAT_HISTORY_TURNS = previousHistoryTurns; }
  });
});
