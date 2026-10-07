import { beforeEach, describe, expect, it, vi } from "vitest";
import { forumPaperService } from "../forum-paper.service.js";
import { fetchOpenAlexWorkByDoi, fetchOpenAlexWorkById, searchOpenAlexWorks } from "../../api-sync/providers/openalex.client.js";
import { ingestOpenAlexWorks } from "../../api-sync/sync.service.js";

const mocks = vi.hoisted(() => ({ findPaper: vi.fn(), findMany: vi.fn(), provider: vi.fn(), authors: vi.fn() }));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => ({ paper: { findFirst: mocks.findPaper, findMany: mocks.findMany }, apiProvider: { findUnique: mocks.provider }, paperAuthor: { findMany: mocks.authors } }) }));
vi.mock("../../api-sync/providers/openalex.client.js", () => ({ fetchOpenAlexWorkByDoi: vi.fn(), fetchOpenAlexWorkById: vi.fn(), searchOpenAlexWorks: vi.fn() }));
vi.mock("../../api-sync/sync.service.js", () => ({ ingestOpenAlexWorks: vi.fn() }));
const doi = "10.1234/forum-test";
const work = { id: "https://openalex.org/W123", doi: `https://doi.org/${doi}`, title: "Resolved research paper", publication_year: 2025, authorships: [{ author: { display_name: "Researcher A" } }], abstract_inverted_index: { literature: Array.from({ length: 80 }, (_, i) => i) } };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findPaper.mockResolvedValue(null);
  mocks.findMany.mockResolvedValue([]);
  mocks.provider.mockResolvedValue({ id: "provider", providerStatus: "enabled" });
  mocks.authors.mockResolvedValue([{ displayName: "Researcher A" }]);
  vi.mocked(fetchOpenAlexWorkByDoi).mockResolvedValue(work);
  vi.mocked(fetchOpenAlexWorkById).mockResolvedValue(work);
  vi.mocked(searchOpenAlexWorks).mockResolvedValue([work]);
  vi.mocked(ingestOpenAlexWorks).mockResolvedValue({ records: [{ paper: { id: "00000000-0000-4000-8000-000000000123", legacyMongoId: null, dataStatus: "active", title: work.title, publicationYear: 2025, doi }, work, action: "insert" }], fetchedCount: 1, insertedCount: 1, updatedCount: 0, rejectedCount: 0, rejectedWorks: [] });
});

describe("Forum OpenAlex paper search", () => {
  it("searches OpenAlex without importing and reuses the ID of an existing public paper", async () => {
    mocks.findMany.mockResolvedValue([{ id: "00000000-0000-4000-8000-000000000123", openalexId: "W123", doi, dataStatus: "active" }]);
    const results = await forumPaperService.search("  software engineering  ");
    expect(searchOpenAlexWorks).toHaveBeenCalledWith("software engineering");
    expect(results).toEqual([expect.objectContaining({ openalexId: "W123", paperId: "00000000-0000-4000-8000-000000000123", authors: ["Researcher A"], canAttach: true })]);
    expect(ingestOpenAlexWorks).not.toHaveBeenCalled();
  });
  it("does not offer or import a restricted local source, including a DOI collision", async () => {
    mocks.findMany.mockResolvedValue([{ id: "restricted", openalexId: "W456", doi: doi.toUpperCase(), dataStatus: "draft" }]);
    expect(await forumPaperService.search("research paper")).toEqual([]);
    await expect(forumPaperService.attachOpenAlex("W123")).rejects.toMatchObject({ statusCode: 403 });
    expect(ingestOpenAlexWorks).not.toHaveBeenCalled();
  });
  it("fetches fresh metadata and imports a selected source through existing citation ingestion", async () => {
    expect(await forumPaperService.attachOpenAlex("W123")).toMatchObject({ paperId: "00000000-0000-4000-8000-000000000123", title: work.title, authors: ["Researcher A"] });
    expect(fetchOpenAlexWorkById).toHaveBeenCalledWith("W123");
    expect(ingestOpenAlexWorks).toHaveBeenCalledWith([work], "provider", { purpose: "citation" });
  });
  it("allows complete scholarly sources without DOI or abstract", async () => {
    vi.mocked(searchOpenAlexWorks).mockResolvedValue([{ ...work, doi: null, abstract_inverted_index: null }]);
    expect(await forumPaperService.search("research paper")).toEqual([expect.objectContaining({ doi: undefined, openalexId: "W123", canAttach: true })]);
    vi.mocked(fetchOpenAlexWorkById).mockResolvedValue({ ...work, doi: null, abstract_inverted_index: null });
    expect(await forumPaperService.attachOpenAlex("W123")).toHaveProperty("paperId");
  });
  it("rejects invalid IDs, provider mismatches and upstream failures", async () => {
    await expect(forumPaperService.attachOpenAlex("http://localhost/private")).rejects.toMatchObject({ statusCode: 400 });
    expect(fetchOpenAlexWorkById).not.toHaveBeenCalled();
    vi.mocked(fetchOpenAlexWorkById).mockResolvedValue({ ...work, id: "https://openalex.org/W999" });
    await expect(forumPaperService.attachOpenAlex("W123")).rejects.toMatchObject({ statusCode: 400 });
    vi.mocked(searchOpenAlexWorks).mockRejectedValue(new Error("Timeout"));
    await expect(forumPaperService.search("research paper")).rejects.toMatchObject({ statusCode: 503 });
    expect(ingestOpenAlexWorks).not.toHaveBeenCalled();
  });
});

describe("Forum DOI metadata preview and attachment", () => {
  it("normalizes DOI links, previews without writes, then attaches through existing ingestion", async () => {
    const preview = await forumPaperService.preview(`https://doi.org/${doi.toUpperCase()}`);
    expect(preview).toMatchObject({ doi, title: work.title, authors: ["Researcher A"], publicationYear: 2025, canAttach: true });
    expect(fetchOpenAlexWorkByDoi).toHaveBeenCalledWith(doi);
    expect(ingestOpenAlexWorks).not.toHaveBeenCalled();
    expect(await forumPaperService.attach(doi)).toHaveProperty("paperId", "00000000-0000-4000-8000-000000000123");
    expect(ingestOpenAlexWorks).toHaveBeenCalledWith([work], "provider", { purpose: "citation" });
  });
  it("uses existing active metadata without fetching or importing again", async () => {
    mocks.findPaper.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000124", title: "Existing metadata", dataStatus: "active", publicationYear: 2024 });
    expect(await forumPaperService.attach(doi)).toMatchObject({ title: "Existing metadata", canAttach: true, paperId: "00000000-0000-4000-8000-000000000124" });
    expect(fetchOpenAlexWorkByDoi).not.toHaveBeenCalled();
    expect(ingestOpenAlexWorks).not.toHaveBeenCalled();
  });
  it("allows a DOI citation without an abstract, including historical papers", async () => {
    const historical = { ...work, doi: "https://doi.org/10.1038/171737a0", title: "Molecular Structure of Nucleic Acids: A Structure for Deoxyribose Nucleic Acid", publication_year: 1953, authorships: [{ author: { display_name: "James Dewey Watson" } }, { author: { display_name: "Francis Harry Compton Crick" } }], abstract_inverted_index: null, primary_location: { source: { display_name: "Nature" } } };
    vi.mocked(fetchOpenAlexWorkByDoi).mockResolvedValue(historical);
    expect(await forumPaperService.preview("10.1038/171737a0")).toMatchObject({ canAttach: true, publicationYear: 1953, venue: "Nature" });
    expect(ingestOpenAlexWorks).not.toHaveBeenCalled();
    expect(await forumPaperService.attach("10.1038/171737a0")).toHaveProperty("paperId");
    expect(ingestOpenAlexWorks).toHaveBeenCalledWith([historical], "provider", { purpose: "citation" });
  });
  it("protects restricted papers and rejects incomplete citation metadata", async () => {
    mocks.findPaper.mockResolvedValueOnce({ dataStatus: "draft" });
    await expect(forumPaperService.preview(doi)).rejects.toMatchObject({ statusCode: 403 });
    vi.mocked(fetchOpenAlexWorkByDoi).mockResolvedValue({ ...work, authorships: [] });
    expect(await forumPaperService.preview(doi)).toHaveProperty("canAttach", false);
    await expect(forumPaperService.attach(doi)).rejects.toMatchObject({ statusCode: 400 });
    expect(ingestOpenAlexWorks).not.toHaveBeenCalled();
    mocks.findPaper.mockResolvedValueOnce(null).mockResolvedValueOnce({ dataStatus: "low-quality" });
    await expect(forumPaperService.attach(doi)).rejects.toMatchObject({ statusCode: 403 });
  });
  it("rejects arbitrary URLs, DOI mismatches and absent metadata", async () => {
    await expect(forumPaperService.preview("http://127.0.0.1/private")).rejects.toMatchObject({ statusCode: 400 });
    expect(fetchOpenAlexWorkByDoi).not.toHaveBeenCalled();
    vi.mocked(fetchOpenAlexWorkByDoi).mockResolvedValue({ ...work, doi: "https://doi.org/10.1234/different" });
    await expect(forumPaperService.preview(doi)).rejects.toMatchObject({ statusCode: 400 });
    vi.mocked(fetchOpenAlexWorkByDoi).mockResolvedValue(null);
    await expect(forumPaperService.preview(doi)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("returns retryable provider errors without writing metadata", async () => {
    vi.mocked(fetchOpenAlexWorkByDoi).mockRejectedValue(new Error("Provider unavailable"));
    await expect(forumPaperService.attach(doi)).rejects.toMatchObject({ statusCode: 503 });
    expect(ingestOpenAlexWorks).not.toHaveBeenCalled();
  });
});
