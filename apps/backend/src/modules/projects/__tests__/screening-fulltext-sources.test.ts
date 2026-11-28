import { describe, expect, it } from "vitest";
import {
  buildPaperReadingSources,
  classifyExternalScholarlyUrl,
  evaluatePaperFullTextStatus,
} from "../screening-fulltext.js";

describe("classifyExternalScholarlyUrl", () => {
  it("classifies direct PDF URLs across academic hosts", () => {
    expect(classifyExternalScholarlyUrl("https://arxiv.org/pdf/2401.12345")).toBe("DIRECT_PDF");
    expect(classifyExternalScholarlyUrl("https://arxiv.org/pdf/2401.12345.pdf")).toBe("DIRECT_PDF");
    expect(classifyExternalScholarlyUrl("https://www.biorxiv.org/content/10.1101/2024.01.01.573901v1.full.pdf")).toBe("DIRECT_PDF");
    expect(classifyExternalScholarlyUrl("https://pmc.ncbi.nlm.nih.gov/articles/PMC1234567/pdf/")).toBe("DIRECT_PDF");
    expect(classifyExternalScholarlyUrl("https://journals.example.org/paper?download=pdf")).toBe("DIRECT_PDF");
    expect(classifyExternalScholarlyUrl("https://journals.example.org/article/42?format=pdf")).toBe("DIRECT_PDF");
  });

  it("classifies DOI resolvers and publisher article pages as LANDING_PAGE, never DIRECT_PDF", () => {
    expect(classifyExternalScholarlyUrl("https://doi.org/10.1007/s10639-024-12580-1")).toBe("LANDING_PAGE");
    expect(classifyExternalScholarlyUrl("https://link.springer.com/article/10.1007/s10639-024-12580-1")).toBe("LANDING_PAGE");
    expect(classifyExternalScholarlyUrl("https://www.nature.com/articles/s41586-024-07487-w")).toBe("LANDING_PAGE");
    expect(classifyExternalScholarlyUrl("https://arxiv.org/abs/2401.12345")).toBe("LANDING_PAGE");
  });

  it("rejects unsafe schemes, credentials, and loopback/private SSRF targets", () => {
    expect(classifyExternalScholarlyUrl(null)).toBe("UNSAFE_OR_INVALID");
    expect(classifyExternalScholarlyUrl("")).toBe("UNSAFE_OR_INVALID");
    expect(classifyExternalScholarlyUrl("javascript:alert(1)")).toBe("UNSAFE_OR_INVALID");
    expect(classifyExternalScholarlyUrl("file:///etc/passwd")).toBe("UNSAFE_OR_INVALID");
    expect(classifyExternalScholarlyUrl("http://localhost:4000/paper.pdf")).toBe("UNSAFE_OR_INVALID");
    expect(classifyExternalScholarlyUrl("http://127.0.0.1/secret.pdf")).toBe("UNSAFE_OR_INVALID");
    expect(classifyExternalScholarlyUrl("http://169.254.169.254/latest/meta-data")).toBe("UNSAFE_OR_INVALID");
    expect(classifyExternalScholarlyUrl("http://10.0.0.5/internal.pdf")).toBe("UNSAFE_OR_INVALID");
    expect(classifyExternalScholarlyUrl("http://192.168.1.10/paper.pdf")).toBe("UNSAFE_OR_INVALID");
    expect(classifyExternalScholarlyUrl("https://user:pass@example.org/paper.pdf")).toBe("UNSAFE_OR_INVALID");
  });
});

describe("evaluatePaperFullTextStatus", () => {
  it("prioritizes authorized project PDFs over all other sources", () => {
    const result = evaluatePaperFullTextStatus({
      projectFileCount: 1,
      pdfPath: "private/corpus/paper.pdf",
      paperStatus: "downloaded",
      openAccessUrl: "https://link.springer.com/article/10.1007/example",
    });
    expect(result).toEqual({ fullTextStatus: "AUTHORIZED_PROJECT_PDF", fullTextAvailable: true });
  });

  it("marks corpus PDF available ONLY when pdfPath exists and paperStatus is downloaded", () => {
    expect(
      evaluatePaperFullTextStatus({
        projectFileCount: 0,
        pdfPath: "corpus/approved.pdf",
        paperStatus: "downloaded",
      }),
    ).toEqual({ fullTextStatus: "AUTHORIZED_CORPUS_PDF", fullTextAvailable: true });

    expect(
      evaluatePaperFullTextStatus({
        projectFileCount: 0,
        pdfPath: "corpus/pending.pdf",
        paperStatus: "pending",
      }),
    ).toEqual({ fullTextStatus: "UNAVAILABLE", fullTextAvailable: false });
  });

  it("marks direct open-access PDF URL as EXTERNAL_PDF_LINK (available)", () => {
    expect(
      evaluatePaperFullTextStatus({
        projectFileCount: 0,
        openAccessUrl: "https://arxiv.org/pdf/2401.12345.pdf",
      }),
    ).toEqual({ fullTextStatus: "EXTERNAL_PDF_LINK", fullTextAvailable: true });
  });

  it("NEVER marks publisher landing pages as fullTextAvailable: true", () => {
    expect(
      evaluatePaperFullTextStatus({
        projectFileCount: 0,
        openAccessUrl: "https://link.springer.com/article/10.1007/s10639-024-12580-1",
      }),
    ).toEqual({ fullTextStatus: "LANDING_PAGE_ONLY", fullTextAvailable: false });

    expect(
      evaluatePaperFullTextStatus({
        projectFileCount: 0,
        paperLink: "https://doi.org/10.1007/s10639-024-12580-1",
      }),
    ).toEqual({ fullTextStatus: "LANDING_PAGE_ONLY", fullTextAvailable: false });
  });

  it("returns UNAVAILABLE when no valid PDF or external source exists", () => {
    expect(
      evaluatePaperFullTextStatus({
        projectFileCount: 0,
        openAccessUrl: "http://127.0.0.1/internal.pdf",
        paperLink: null,
      }),
    ).toEqual({ fullTextStatus: "UNAVAILABLE", fullTextAvailable: false });
  });
});

describe("buildPaperReadingSources", () => {
  it("lists multiple sources cleanly without leaking raw storage keys", () => {
    const sources = buildPaperReadingSources({
      id: "paper-1",
      openAccessUrl: "https://link.springer.com/article/10.1007/s10639-024-12580-1",
      paperLink: "https://arxiv.org/pdf/2401.12345.pdf",
      doi: "10.1007/s10639-024-12580-1",
      pdfPath: "s3://private-bucket/internal/secret-key.pdf",
      paperStatus: "downloaded",
      openAccessStatus: "hybrid",
      licenseName: "CC-BY-4.0",
      projectFiles: [
        {
          id: "file-1",
          byteSize: 1_250_000,
          sha256: "abcdef1234567890",
          uploadedByName: "TS. Nguyễn Minh Anh",
          createdAt: "2026-11-25T10:00:00.000Z",
        },
      ],
    });

    const serialized = JSON.stringify(sources);
    expect(serialized).not.toContain("private-bucket");
    expect(serialized).not.toContain("secret-key.pdf");

    expect(sources.map(s => s.kind)).toEqual([
      "PROJECT_PDF",
      "CORPUS_PDF",
      "EXTERNAL_LANDING_PAGE",
      "EXTERNAL_FULLTEXT_PDF",
      "DOI_RESOLVER",
    ]);

    const projectPdf = sources[0]!;
    expect(projectPdf.readableInWorkspace).toBe(true);
    expect(projectPdf.usableForFullTextScreening).toBe(true);
    expect(projectPdf.fileId).toBe("file-1");
    expect(projectPdf.contentHash).toBe("abcdef1234567890");
    expect(projectPdf.documentVersion).toBe("abcdef12");

    const landing = sources.find(s => s.kind === "EXTERNAL_LANDING_PAGE")!;
    expect(landing.availability).toBe("EXTERNAL_LANDING_PAGE");
    expect(landing.readableInWorkspace).toBe(false);
    expect(landing.usableForFullTextScreening).toBe(false);
  });
});
