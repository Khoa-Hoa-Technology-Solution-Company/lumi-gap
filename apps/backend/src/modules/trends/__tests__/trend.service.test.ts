import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    paperTopic: { findMany: vi.fn() },
    paper: { findMany: vi.fn() },
    paperAuthor: { groupBy: vi.fn() },
    paperKeyword: { groupBy: vi.fn() },
  },
  statistics: vi.fn(),
}));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => mocks.prisma }));
vi.mock("../trend.evidence.js", () => ({ computeTopicStatistics: mocks.statistics }));
vi.mock("../trend.openalex-client.js", async (importActual) => ({ ...(await importActual<object>()), isOpenAlexBudgetAvailable: () => false }));

import { trendService } from "../trend.service.js";

const TOPIC_ROW = { paperId: "p1", topicName: "Graph Neural Networks", openalexTopicId: "T1254", domainId: "3", domainName: "Physical Sciences", fieldId: "17", fieldName: "Computer Science", subfieldId: "1702", subfieldName: "Artificial Intelligence" };
const PAPER = { id: "11111111-1111-4111-8111-111111111111", title: "GNN survey", publicationYear: 2022, citationCount: 10, journalName: "J", dataStatus: "active" };

describe("local topic detail", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.prisma.paperTopic.findMany.mockResolvedValue([TOPIC_ROW]);
    mocks.prisma.paper.findMany.mockResolvedValue([PAPER]);
    mocks.prisma.paperAuthor.groupBy.mockResolvedValue([]);
    mocks.prisma.paperKeyword.groupBy.mockResolvedValue([]);
    mocks.statistics.mockResolvedValue({ classification: { verdict: "rising" } });
  });

  it("matches a topic id exactly after shortening an OpenAlex URL", async () => {
    await trendService.topic("Graph Neural Networks", { topicId: "https://openalex.org/T1254", yearFrom: 2016, yearTo: 2026 });

    for (const [args] of mocks.prisma.paperTopic.findMany.mock.calls) {
      expect(args.where).toEqual({ openalexTopicId: { equals: "T1254", mode: "insensitive" } });
    }
  });

  it("reports the topic id as taxonomy.openalexTopicId and uses it for the statistics", async () => {
    const detail = await trendService.topic("Graph Neural Networks", { yearFrom: 2016, yearTo: 2026 });

    expect(detail.dataSource).toBe("local");
    expect(detail.taxonomy).toMatchObject({ openalexTopicId: "T1254", fieldId: "17" });
    expect(mocks.statistics.mock.calls[0]![0]).toMatchObject({ topicId: "T1254", fieldId: "17" });
  });
});
