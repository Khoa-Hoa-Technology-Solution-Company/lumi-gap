import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = vi.hoisted(() => ({ topWorks: 4, minShare: 0.5, openAlexPerGap: 2 }));
vi.mock("../../../config/env.js", () => ({
  env: {
    get GAP_COVERAGE_TOP_WORKS() { return settings.topWorks; },
    get GAP_COVERAGE_MIN_SHARE() { return settings.minShare; },
    get GAP_COUNTER_OPENALEX_PER_GAP() { return settings.openAlexPerGap; },
    GAP_GLOBAL_EVIDENCE_TIMEOUT_MS: 1000,
  },
}));
vi.mock("../../../infrastructure/logger.js", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("../../../infrastructure/cache.js", () => ({ cache: { get: vi.fn().mockResolvedValue(null), set: vi.fn() }, hashKey: (value: unknown) => JSON.stringify(value) }));
vi.mock("../../../infrastructure/queue.js", () => ({ embeddingQueue: { add: vi.fn().mockResolvedValue(undefined) } }));
const prisma = vi.hoisted(() => ({ paper: { findMany: vi.fn() }, apiProvider: { findUnique: vi.fn() } }));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => prisma }));
vi.mock("../../api-sync/providers/openalex.client.js", () => ({ searchOpenAlexWorksForClosure: vi.fn() }));
vi.mock("../../api-sync/sync.service.js", () => ({ ingestOpenAlexWorks: vi.fn() }));

import { searchOpenAlexWorksForClosure } from "../../api-sync/providers/openalex.client.js";
import { ingestOpenAlexWorks } from "../../api-sync/sync.service.js";
import { embeddingQueue } from "../../../infrastructure/queue.js";
import { enrichCorpusForTopic, findOpenAlexCounterPapers, measureTopicCoverage } from "../gap-literature.js";

const work = (id: string, title: string, abstract = "") => ({ id: `https://openalex.org/${id}`, title, display_name: title, abstract_inverted_index: abstract ? Object.fromEntries(abstract.split(" ").map((word, index) => [word, [index]])) : undefined });
const works = [
  work("W1", "Automated program repair feedback for novices"),
  work("W2", "A survey of large language models in education"),
  work("W3", "Repair tools", "automated program repair generates feedback for students"),
  work("W4", "Program synthesis"),
];

beforeEach(() => {
  vi.mocked(searchOpenAlexWorksForClosure).mockReset().mockResolvedValue(works as never);
  prisma.paper.findMany.mockReset().mockResolvedValue([{ openalexId: "W2" }]);
  prisma.apiProvider.findUnique.mockReset().mockResolvedValue({ id: "provider" });
  vi.mocked(ingestOpenAlexWorks).mockReset().mockImplementation(async (list) => ({
    records: list.map((item) => ({ work: item, action: "insert", paper: { id: `paper-${String(item.id).slice(-2)}`, dataStatus: "active" } })),
    fetchedCount: list.length, insertedCount: list.length, updatedCount: 0, rejectedCount: 0, rejectedWorks: [],
  }) as never);
  vi.mocked(embeddingQueue.add).mockClear();
});

describe("measureTopicCoverage", () => {
  it("counts how many of the top OpenAlex works the corpus holds and flags a low share", async () => {
    expect(await measureTopicCoverage("program repair")).toEqual({ checked: 4, present: 1, low: true });
    prisma.paper.findMany.mockResolvedValue([{ openalexId: "W1" }, { openalexId: "W2" }, { openalexId: "W3" }]);
    expect(await measureTopicCoverage("program repair")).toEqual({ checked: 4, present: 3, low: false });
  });

  it("returns null when disabled or when OpenAlex fails", async () => {
    vi.mocked(searchOpenAlexWorksForClosure).mockRejectedValue(new Error("OpenAlex 503"));
    expect(await measureTopicCoverage("program repair")).toBeNull();
    settings.topWorks = 0;
    expect(await measureTopicCoverage("program repair")).toBeNull();
    settings.topWorks = 4;
  });
});

describe("enrichCorpusForTopic", () => {
  it("ingests only the works the corpus is missing and queues their embeddings", async () => {
    expect(await enrichCorpusForTopic("program repair")).toEqual({ checked: 4, added: 3 });
    expect(vi.mocked(ingestOpenAlexWorks).mock.calls[0]![0].map((item) => item.id)).toEqual(["https://openalex.org/W1", "https://openalex.org/W3", "https://openalex.org/W4"]);
    expect(embeddingQueue.add).toHaveBeenCalledWith("manual-embedding", {});
  });
});

describe("findOpenAlexCounterPapers", () => {
  const probe = { topicA: "automated program repair", topicB: "feedback" };

  it("keeps only works that mention both probe topics, ingests them and skips excluded papers", async () => {
    expect(await findOpenAlexCounterPapers("Does APR feedback help novices?", probe, ["paper-W3"])).toEqual(["paper-W1"]);
    expect(vi.mocked(ingestOpenAlexWorks).mock.calls[0]![0].map((item) => item.id)).toEqual(["https://openalex.org/W1", "https://openalex.org/W3"]);
  });

  it("searches nothing without a probe, and returns nothing when OpenAlex fails", async () => {
    expect(await findOpenAlexCounterPapers("question", undefined, [])).toEqual([]);
    expect(searchOpenAlexWorksForClosure).not.toHaveBeenCalled();
    vi.mocked(searchOpenAlexWorksForClosure).mockRejectedValue(new Error("OpenAlex 429"));
    expect(await findOpenAlexCounterPapers("question", probe, [])).toEqual([]);
  });
});
