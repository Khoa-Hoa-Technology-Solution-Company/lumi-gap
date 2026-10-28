import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../common/exceptions/app-error.js";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
    trendTopicFollow: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
  topic: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => mocks.prisma }));
vi.mock("../trend.service.js", () => ({ trendService: { topic: mocks.topic }, findUserId: (id: string) => Promise.resolve(id) }));
vi.mock("../../notifications/notification.service.js", () => ({ notificationService: { create: mocks.notify } }));

import { trendFollowService } from "../trend-follow.service.js";

const NOW = new Date("2026-10-26T04:00:00Z");
function follow(id: string, userId: string, lastVerdict: string | null, topic = "Graph Neural Networks") {
  return { id, userId, topic, topicKey: topic.toLowerCase(), openalexTopicId: "T10012", note: null, lastVerdict, lastDataSource: "openalex", lastCheckedAt: null, createdAt: NOW, updatedAt: NOW };
}
const detail = (verdict: string) => ({ dataSource: "openalex", statistics: { classification: { verdict } } });

describe("followed trend topics", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.prisma.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve({ id: where.id }));
    mocks.notify.mockResolvedValue({});
  });

  it("stores the current verdict as the baseline when following", async () => {
    mocks.prisma.trendTopicFollow.findUnique.mockResolvedValue(null);
    mocks.topic.mockResolvedValue(detail("rising"));
    mocks.prisma.trendTopicFollow.create.mockImplementation(({ data }: { data: object }) => Promise.resolve({ id: "f1", ...data, createdAt: NOW, updatedAt: NOW }));

    const created = await trendFollowService.create(USER_A, { topic: "  Graph Neural Networks ", openalexTopicId: "T10012" });

    expect(mocks.prisma.trendTopicFollow.create.mock.calls[0]![0].data).toMatchObject({ topic: "Graph Neural Networks", topicKey: "graph neural networks", lastVerdict: "rising" });
    expect(created).toMatchObject({ topic: "Graph Neural Networks", lastVerdict: "rising" });
  });

  it("answers 409 when a concurrent request followed the topic first", async () => {
    mocks.prisma.trendTopicFollow.findUnique.mockResolvedValue(null);
    mocks.topic.mockResolvedValue(detail("rising"));
    mocks.prisma.trendTopicFollow.create.mockRejectedValue(Object.assign(new Error("Unique constraint failed"), { code: "P2002" }));

    await expect(trendFollowService.create(USER_A, { topic: "Graph Neural Networks" })).rejects.toMatchObject({ statusCode: 409 });
  });

  it("rejects following the same topic twice", async () => {
    mocks.prisma.trendTopicFollow.findUnique.mockResolvedValue({ id: "f1" });
    await expect(trendFollowService.create(USER_A, { topic: "graph neural networks" })).rejects.toBeInstanceOf(AppError);
  });

  it("computes each topic once and notifies only followers whose verdict changed", async () => {
    mocks.prisma.trendTopicFollow.findMany.mockResolvedValue([follow("f1", USER_A, "stable"), follow("f2", USER_B, "rising"), follow("f3", USER_B, null, "Quantum Sensing")]);
    mocks.topic.mockImplementation((topic: string) => Promise.resolve(detail(topic === "Quantum Sensing" ? "declining" : "rising")));

    const result = await trendFollowService.checkFollowedTopics(NOW);

    expect(result).toEqual({ topics: 2, changed: 1 });
    expect(mocks.topic).toHaveBeenCalledTimes(2);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.notify.mock.calls[0]![0]).toMatchObject({ userId: USER_A, type: "TREND_VERDICT_CHANGED", emailPayload: { topic: "Graph Neural Networks", from: "stable", to: "rising" } });
    // A follow without a baseline records one silently.
    expect(mocks.prisma.trendTopicFollow.update).toHaveBeenCalledWith({ where: { id: "f3" }, data: { lastVerdict: "declining", lastDataSource: "openalex", lastCheckedAt: NOW } });
  });

  it("does not notify when the verdict comes from the local corpus while the baseline is from OpenAlex", async () => {
    mocks.prisma.trendTopicFollow.findMany.mockResolvedValue([follow("f1", USER_A, "rising")]);
    mocks.topic.mockResolvedValue({ dataSource: "local", statistics: { classification: { verdict: "insufficient" } } });

    expect(await trendFollowService.checkFollowedTopics(NOW)).toEqual({ topics: 1, changed: 0 });
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.prisma.trendTopicFollow.update).toHaveBeenCalledWith({ where: { id: "f1" }, data: { lastCheckedAt: NOW } });
  });

  it("replaces a local baseline with the OpenAlex verdict without notifying", async () => {
    mocks.prisma.trendTopicFollow.findMany.mockResolvedValue([{ ...follow("f1", USER_A, "insufficient"), lastDataSource: "local" }]);
    mocks.topic.mockResolvedValue(detail("rising"));

    expect(await trendFollowService.checkFollowedTopics(NOW)).toEqual({ topics: 1, changed: 0 });
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.prisma.trendTopicFollow.update).toHaveBeenCalledWith({ where: { id: "f1" }, data: { lastVerdict: "rising", lastDataSource: "openalex", lastCheckedAt: NOW } });
  });

  it("keeps the baseline when the notification cannot be sent, so the next run retries it", async () => {
    mocks.prisma.trendTopicFollow.findMany.mockResolvedValue([follow("f1", USER_A, "stable")]);
    mocks.topic.mockResolvedValue(detail("rising"));
    mocks.notify.mockRejectedValueOnce(new Error("redis down")).mockResolvedValue({});

    expect(await trendFollowService.checkFollowedTopics(NOW)).toEqual({ topics: 1, changed: 0 });
    expect(mocks.prisma.trendTopicFollow.update).not.toHaveBeenCalled();

    expect(await trendFollowService.checkFollowedTopics(NOW)).toEqual({ topics: 1, changed: 1 });
    // Both attempts use one event key, so a partly sent first attempt is not duplicated.
    expect(mocks.notify.mock.calls[0]![0].eventKey).toBe(mocks.notify.mock.calls[1]![0].eventKey);
    expect(mocks.prisma.trendTopicFollow.update).toHaveBeenCalledWith({ where: { id: "f1" }, data: { lastVerdict: "rising", lastDataSource: "openalex", lastCheckedAt: NOW } });
  });

  it("keeps the previous verdict when the trend cannot be computed", async () => {
    mocks.prisma.trendTopicFollow.findMany.mockResolvedValue([follow("f1", USER_A, "stable")]);
    mocks.topic.mockRejectedValue(new Error("OpenAlex down"));

    expect(await trendFollowService.checkFollowedTopics(NOW)).toEqual({ topics: 1, changed: 0 });
    expect(mocks.prisma.trendTopicFollow.update).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("only lets the owner remove a follow", async () => {
    mocks.prisma.trendTopicFollow.findUnique.mockResolvedValue(follow("33333333-3333-4333-8333-333333333333", USER_B, "stable"));
    await expect(trendFollowService.remove(USER_A, "33333333-3333-4333-8333-333333333333")).rejects.toMatchObject({ statusCode: 404 });
    expect(mocks.prisma.trendTopicFollow.delete).not.toHaveBeenCalled();
  });
});
