import { beforeEach, describe, expect, it, vi } from "vitest";
import { forumPaperService } from "../forum-paper.service.js";
import { fetchOpenAlexWorkByDoi } from "../../api-sync/providers/openalex.client.js";
import { ingestOpenAlexWorks } from "../../api-sync/sync.service.js";

const mocks = vi.hoisted(() => ({ findPaper: vi.fn(), provider: vi.fn(), authors: vi.fn() }));
vi.mock("../../../infrastructure/database/prisma.js", () => ({ getPrisma: () => ({ paper: { findFirst: mocks.findPaper }, apiProvider: { findUnique: mocks.provider }, paperAuthor: { findMany: mocks.authors } }) }));
vi.mock("../../api-sync/providers/openalex.client.js", () => ({ fetchOpenAlexWorkByDoi: vi.fn() }));
vi.mock("../../api-sync/sync.service.js", () => ({ ingestOpenAlexWorks: vi.fn() }));
const doi = "10.1234/forum-test";
const work = { id: "https://openalex.org/W123", doi: `https://doi.org/${doi}`, title: "Resolved research paper", publication_year: 2025, authorships: [{ author: { display_name: "Researcher A" } }], abstract_inverted_index: { literature: Array.from({ length: 80 }, (_, i) => i) } };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findPaper.mockResolvedValue(null);
  mocks.provider.mockResolvedValue({ id: "provider", providerStatus: "enabled" });
  mocks.authors.mockResolvedValue([{ displayName: "Researcher A" }]);
  vi.mocked(fetchOpenAlexWorkByDoi).mockResolvedValue(work);
  vi.mocked(ingestOpenAlexWorks).mockResolvedValue({ records: [{ paper: { id: "00000000-0000-4000-8000-000000000123", legacyMongoId: null, dataStatus: "active" }, work, action: "insert" }], fetchedCount: 1, insertedCount: 1, updatedCount: 0, rejectedCount: 0, rejectedWorks: [] });
});

describe("Forum DOI metadata preview and attachment", () => {
  it("normalizes DOI links, previews without writes, then attaches through existing ingestion", async () => {
    const preview = await forumPaperService.preview(`https://doi.org/${doi.toUpperCase()}`);
    expect(preview).toMatchObject({ doi, title: work.title, authors: ["Researcher A"], publicationYear: 2025, canAttach: true });
    expect(fetchOpenAlexWorkByDoi).toHaveBeenCalledWith(doi);
    expect(ingestOpenAlexWorks).not.toHaveBeenCalled();
    expect(await forumPaperService.attach(doi)).toHaveProperty("paperId", "00000000-0000-4000-8000-000000000123");
    expect(ingestOpenAlexWorks).toHaveBeenCalledWith([work], "provider");
  });
  it("uses existing active metadata without fetching or importing again", async () => {
    mocks.findPaper.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000124", title: "Existing metadata", dataStatus: "active", publicationYear: 2024 });
    expect(await forumPaperService.attach(doi)).toMatchObject({ title: "Existing metadata", canAttach: true, paperId: "00000000-0000-4000-8000-000000000124" });
    expect(fetchOpenAlexWorkByDoi).not.toHaveBeenCalled();
    expect(ingestOpenAlexWorks).not.toHaveBeenCalled();
  });
  it("protects restricted papers and does not publish poor provider metadata", async () => {
    mocks.findPaper.mockResolvedValueOnce({ dataStatus: "draft" });
    await expect(forumPaperService.preview(doi)).rejects.toMatchObject({ statusCode: 403 });
    vi.mocked(fetchOpenAlexWorkByDoi).mockResolvedValue({ ...work, abstract_inverted_index: null });
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
