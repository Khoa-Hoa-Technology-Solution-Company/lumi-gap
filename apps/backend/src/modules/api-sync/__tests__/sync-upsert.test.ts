import { beforeEach, describe, expect, it, vi } from "vitest";
import { ingestOpenAlexWorks, runSync } from "../sync.service.js";

const mocks = vi.hoisted(() => ({
  find: vi.fn(), create: vi.fn(), update: vi.fn(), authorDelete: vi.fn(), keywordDelete: vi.fn(), topicDelete: vi.fn(), authorCreate: vi.fn(), link: vi.fn(),
  providerFind: vi.fn(), configFind: vi.fn(), runCreate: vi.fn(), runUpdate: vi.fn(), fetchPage: vi.fn(), audit: vi.fn(),
}));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => ({
  paper: { findFirst: mocks.find, create: mocks.create, update: mocks.update },
  paperSourceRecord: { findFirst: async () => null, create: async () => ({}) },
  apiProvider: { findUnique: mocks.providerFind },
  apiSyncConfig: { findUnique: mocks.configFind },
  apiSyncRun: { create: mocks.runCreate, update: mocks.runUpdate },
  $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
    paperAuthor: { deleteMany: mocks.authorDelete, createMany: mocks.authorCreate },
    paperKeyword: { deleteMany: mocks.keywordDelete, createMany: async () => ({}) },
    paperTopic: { deleteMany: mocks.topicDelete, createMany: async () => ({}) },
  }),
}) }));
vi.mock("../../../infrastructure/logger.js", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("../../taxonomy/taxonomy-backfill.service.js", () => ({ taxonomyBackfillService: { linkPaperTaxonomy: mocks.link } }));
vi.mock("../../audit/audit.service.js", () => ({ auditService: { log: mocks.audit } }));
vi.mock("../providers/openalex.client.js", () => ({ fetchOpenAlexPage: mocks.fetchPage }));

const id = "00000000-0000-4000-8000-000000000123";
const abstract = Array.from({ length: 60 }, (_, index) => `word${index}`);
const work = { id: "https://openalex.org/W123", doi: "https://doi.org/10.1038/171737a0", title: "Molecular Structure of Nucleic Acids", publication_year: 1953, cited_by_count: 40, authorships: [{ author: { display_name: "Watson" } }, { author: { display_name: "Crick" } }], abstract_inverted_index: Object.fromEntries(abstract.map((word, index) => [word, [index]])) };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.find.mockResolvedValue(null);
  mocks.create.mockImplementation(async ({ data }) => ({ id, ...data }));
  mocks.update.mockImplementation(async ({ data }) => ({ id, ...data }));
  mocks.authorDelete.mockResolvedValue({}); mocks.keywordDelete.mockResolvedValue({}); mocks.topicDelete.mockResolvedValue({});
});

describe("upsertPaper through ingestOpenAlexWorks", () => {
  it("only enriches a user-owned paper and never touches its workflow state or related rows", async () => {
    mocks.find.mockResolvedValue({ id, doi: "10.1038/171737a0", openalexId: null, title: "My draft title", primaryProvider: "user", paperStatus: "pending", dataStatus: "draft", isAiAnalyzable: false, abstractText: null, journalName: "Kept Journal", citationCount: 100 });
    const result = await ingestOpenAlexWorks([work], "provider");
    expect(result.rejectedCount).toBe(0);
    expect(result.records[0]).toMatchObject({ action: "update", paper: { id } });
    expect(mocks.create).not.toHaveBeenCalled();
    const data = mocks.update.mock.calls[0]![0].data;
    expect(data.abstractText.length).toBeGreaterThanOrEqual(250);
    expect(data).toMatchObject({ openalexId: "W123", citationCount: 100 });
    expect(data).not.toHaveProperty("journalName");
    for (const key of ["primaryProvider", "paperStatus", "dataStatus", "title", "doi"]) expect(data).not.toHaveProperty(key);
    // The enriched abstract is long enough to embed, so the derived flag is recomputed; dataStatus stays untouched, so nothing is published.
    expect(data.isAiAnalyzable).toBe(true);
    expect(mocks.authorDelete).not.toHaveBeenCalled();
    expect(mocks.keywordDelete).not.toHaveBeenCalled();
    expect(mocks.topicDelete).not.toHaveBeenCalled();
    expect(mocks.authorCreate).not.toHaveBeenCalled();
    expect(mocks.link).toHaveBeenCalledWith(expect.anything(), id);
  });

  it("derives isAiAnalyzable for a user-owned paper from the abstract it keeps", async () => {
    const userRow = { id, doi: "10.1038/171737a0", openalexId: null, primaryProvider: "user", paperStatus: "pending", dataStatus: "draft", citationCount: 0 };
    mocks.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id, ...data }));
    mocks.find.mockResolvedValue({ ...userRow, isAiAnalyzable: false, abstractText: "u".repeat(300) });
    await ingestOpenAlexWorks([work], "provider");
    expect(mocks.update.mock.calls[0]![0].data).not.toHaveProperty("abstractText");
    expect(mocks.update.mock.calls[0]![0].data.isAiAnalyzable).toBe(true);
    mocks.find.mockResolvedValue({ ...userRow, isAiAnalyzable: true, abstractText: "u".repeat(100) });
    await ingestOpenAlexWorks([work], "provider");
    expect(mocks.update.mock.calls[1]![0].data.isAiAnalyzable).toBe(false);
    expect(mocks.update.mock.calls[1]![0].data).not.toHaveProperty("dataStatus");
  });

  it("keeps overwriting an OpenAlex-owned paper as before", async () => {
    mocks.find.mockResolvedValue({ id, primaryProvider: "openalex", paperStatus: "not-downloaded", dataStatus: "low-quality", isAiAnalyzable: false, abstractText: "old", citationCount: 5 });
    const result = await ingestOpenAlexWorks([work], "provider");
    expect(result.records[0]?.action).toBe("update");
    expect(mocks.update.mock.calls[0]![0].data).toMatchObject({ primaryProvider: "openalex", dataStatus: "active", isAiAnalyzable: true, title: work.title, citationCount: 40 });
    expect(mocks.authorDelete).toHaveBeenCalled();
    expect(mocks.authorCreate).toHaveBeenCalled();
  });

  it("falls back to the update path when a concurrent insert wins the create (P2002)", async () => {
    const row = { id, primaryProvider: "openalex", paperStatus: "not-downloaded", dataStatus: "active", isAiAnalyzable: true, citationCount: 1 };
    mocks.find.mockResolvedValueOnce(null).mockResolvedValueOnce(row);
    mocks.create.mockRejectedValueOnce({ code: "P2002" });
    const result = await ingestOpenAlexWorks([work], "provider");
    expect(result.rejectedCount).toBe(0);
    expect(result.records[0]).toMatchObject({ action: "update", paper: { id } });
    expect(mocks.find).toHaveBeenCalledTimes(2);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it("rejects the work when the retried lookup still loses to P2002 on create", async () => {
    mocks.create.mockRejectedValue({ code: "P2002" });
    const result = await ingestOpenAlexWorks([work], "provider");
    expect(result.rejectedCount).toBe(1);
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });

  it("does not retry a P2002 raised by an update", async () => {
    mocks.find.mockResolvedValue({ id, primaryProvider: "openalex", citationCount: 1 });
    mocks.update.mockRejectedValue({ code: "P2002" });
    const result = await ingestOpenAlexWorks([work], "provider");
    expect(result.rejectedCount).toBe(1);
    expect(mocks.find).toHaveBeenCalledTimes(1);
  });
});

describe("runSync failure handling", () => {
  it("marks the run failed and rejects so the job is retried", async () => {
    mocks.providerFind.mockResolvedValue({ id: "provider" });
    mocks.runCreate.mockResolvedValue({ id: "run-1", runStatus: "running" });
    mocks.runUpdate.mockImplementation(async ({ data }) => ({ id: "run-1", ...data }));
    mocks.fetchPage.mockRejectedValue(new Error("openalex down"));
    await expect(runSync({ searchText: "llm", yearFrom: 2022, maxPages: 1 })).rejects.toThrow("openalex down");
    expect(mocks.runUpdate).toHaveBeenLastCalledWith({ where: { id: "run-1" }, data: expect.objectContaining({ runStatus: "failed", errorMessage: "openalex down", finishedAt: expect.any(Date) }) });
    expect(mocks.audit).toHaveBeenLastCalledWith("sync.completed", expect.objectContaining({ details: expect.objectContaining({ runStatus: "failed" }) }));
  });

  it("returns the run when the sync succeeds", async () => {
    mocks.providerFind.mockResolvedValue({ id: "provider" });
    mocks.runCreate.mockResolvedValue({ id: "run-1", runStatus: "running" });
    mocks.runUpdate.mockImplementation(async ({ data }) => ({ id: "run-1", ...data }));
    mocks.fetchPage.mockResolvedValue({ results: [], nextCursor: null });
    await expect(runSync({ searchText: "llm", yearFrom: 2022, maxPages: 1 })).resolves.toMatchObject({ runStatus: "succeeded" });
  });
});
