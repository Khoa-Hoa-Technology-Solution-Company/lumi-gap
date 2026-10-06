import { beforeEach, describe, expect, it, vi } from "vitest";
import { ingestOpenAlexWorks } from "../sync.service.js";

const mocks = vi.hoisted(() => ({ find: vi.fn(), create: vi.fn(), update: vi.fn(), authorCreate: vi.fn(), sourceCreate: vi.fn() }));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => ({
  paper: { findFirst: mocks.find, create: mocks.create, update: mocks.update },
  paperSourceRecord: { findFirst: async () => null, create: mocks.sourceCreate },
  $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
    paperAuthor: { deleteMany: async () => ({}), createMany: mocks.authorCreate },
    paperKeyword: { deleteMany: async () => ({}), createMany: async () => ({}) },
    paperTopic: { deleteMany: async () => ({}), createMany: async () => ({}) },
  }),
}) }));
vi.mock("../../../infrastructure/logger.js", () => ({ logger: { error: vi.fn() } }));
vi.mock("../../audit/audit.service.js", () => ({ auditService: { log: vi.fn() } }));
const id = "00000000-0000-4000-8000-000000000123";
const work = { id: "https://openalex.org/W123", doi: "https://doi.org/10.1038/171737a0", title: "Molecular Structure of Nucleic Acids", publication_year: 1953, authorships: [{ author: { display_name: "Watson" } }, { author: { display_name: "Crick" } }], abstract_inverted_index: null };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.find.mockResolvedValue(null);
  mocks.create.mockImplementation(async ({ data }) => ({ id, ...data }));
  mocks.update.mockImplementation(async ({ data }) => ({ id, ...data }));
});

describe("DOI citation ingestion through existing Paper storage", () => {
  it("imports bibliographic metadata for citation without enabling AI analysis, while keeping the normal import gate", async () => {
    const ordinary = await ingestOpenAlexWorks([work], "provider");
    expect(ordinary.records[0]?.paper).toMatchObject({ dataStatus: "low-quality", isAiAnalyzable: false });
    const citation = await ingestOpenAlexWorks([work], "provider", { purpose: "citation" });
    expect(citation.records[0]?.paper).toMatchObject({ id, dataStatus: "active", isAiAnalyzable: false, doi: "10.1038/171737a0", publicationYear: 1953, paperStatus: "not-downloaded" });
    expect(mocks.authorCreate).toHaveBeenCalledWith({ data: expect.arrayContaining([expect.objectContaining({ paperId: id, displayName: "Watson" }), expect.objectContaining({ paperId: id, displayName: "Crick" })]) });
    expect(mocks.sourceCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ paperId: id, providerId: "provider", externalRecordId: "https://openalex.org/W123" }) });
  });
  it.each(["draft", "low-quality"])("does not republish an existing %s source discovered during import", async (dataStatus) => {
    mocks.find.mockResolvedValue({ id, dataStatus });
    const result = await ingestOpenAlexWorks([work], "provider", { purpose: "citation" });
    expect(result.rejectedCount).toBe(1);
    expect(result.records).toEqual([]);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.sourceCreate).not.toHaveBeenCalled();
  });
  it("rejects incomplete metadata even when citation ingestion is requested", async () => {
    const result = await ingestOpenAlexWorks([{ ...work, authorships: [] }], "provider", { purpose: "citation" });
    expect(result.rejectedCount).toBe(1);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("imports a DOI-less citation using its OpenAlex identity", async () => {
    const result = await ingestOpenAlexWorks([{ ...work, doi: null }], "provider", { purpose: "citation" });
    expect(result.records[0]?.paper).toMatchObject({ id, openalexId: "W123", dataStatus: "active", isAiAnalyzable: false });
    expect(result.records[0]?.paper.doi).toBeUndefined();
  });
  it("keeps an active citation source available after a later ordinary sync", async () => {
    mocks.find.mockResolvedValue({ id, dataStatus: "active", isAiAnalyzable: false, citationCount: 12 });
    const result = await ingestOpenAlexWorks([work], "provider");
    expect(result.records[0]?.paper).toMatchObject({ dataStatus: "active", isAiAnalyzable: false, citationCount: 12 });
  });
});
