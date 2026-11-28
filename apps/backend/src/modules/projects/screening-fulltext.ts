import type { FullTextStatus, PaperReadingSource } from "@trend/shared-types";
import type { WorkspaceContext } from "./workspace-access.js";

export type ExternalUrlClassification = "DIRECT_PDF" | "LANDING_PAGE" | "UNSAFE_OR_INVALID";

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^0\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(?:1[6-9]|2\d|3[01])\./,
  /^\[?::1\]?$/i,
  /\.local$/i,
  /\.internal$/i,
];

/**
 * Classifies an external scholarly URL safely without performing network I/O.
 * Rejects non-HTTP(S), embedded credentials, and private/loopback hosts.
 * Distinguishes direct PDF URLs from publisher/repository landing pages.
 */
export function classifyExternalScholarlyUrl(raw?: string | null): ExternalUrlClassification {
  if (!raw || typeof raw !== "string") return "UNSAFE_OR_INVALID";
  const trimmed = raw.trim();
  if (!trimmed) return "UNSAFE_OR_INVALID";
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return "UNSAFE_OR_INVALID";
  }
  if (!/^https?:$/i.test(url.protocol)) return "UNSAFE_OR_INVALID";
  if (url.username || url.password) return "UNSAFE_OR_INVALID";
  const host = url.hostname.toLowerCase();
  if (!host || PRIVATE_HOST_PATTERNS.some(pattern => pattern.test(host))) {
    return "UNSAFE_OR_INVALID";
  }

  let decodedPath = url.pathname;
  try {
    decodedPath = decodeURIComponent(url.pathname);
  } catch {
    // keep raw pathname
  }

  const isDirectPdfPath =
    /(?:\.pdf|\/pdf\/?|\/pdf\/[^/]+)$/i.test(decodedPath)
    || (/^arxiv\.org$/i.test(host) && /^\/pdf\//i.test(decodedPath))
    || (/^(?:www\.)?biorxiv\.org$/i.test(host) && /\.full\.pdf$/i.test(decodedPath))
    || (/^(?:www\.)?medrxiv\.org$/i.test(host) && /\.full\.pdf$/i.test(decodedPath))
    || (/^pmc\.ncbi\.nlm\.nih\.gov$/i.test(host) && /\/pdf\b/i.test(decodedPath));
  const isPdfQuery = /^(?:pdf|1|true)$/i.test(
    url.searchParams.get("format") ?? url.searchParams.get("download") ?? "",
  );

  return isDirectPdfPath || isPdfQuery ? "DIRECT_PDF" : "LANDING_PAGE";
}

export interface PaperSourceInputs {
  id: string;
  doi?: string | null;
  abstractText?: string | null;
  pdfPath?: string | null;
  paperStatus?: string | null;
  openAccessUrl?: string | null;
  openAccessStatus?: string | null;
  paperLink?: string | null;
  licenseName?: string | null;
  primaryProvider?: string | null;
  journalName?: string | null;
  paperKind?: string | null;
  downloadCost?: number | null;
  updatedAt?: Date | string | null;
  projectFiles?: Array<{ id: string; sha256: string; byteSize: number; createdAt: Date | string; uploadedByName?: string }>;
}

/**
 * Computes authoritative full-text eligibility & status without falsely equating
 * a DOI or publisher landing page with an accessible full-text document.
 */
export function evaluatePaperFullTextStatus(input: {
  pdfPath?: string | null;
  paperStatus?: string | null;
  openAccessUrl?: string | null;
  paperLink?: string | null;
  projectFileCount: number;
}): { fullTextAvailable: boolean; fullTextStatus: FullTextStatus } {
  if (input.projectFileCount > 0) {
    return { fullTextAvailable: true, fullTextStatus: "AUTHORIZED_PROJECT_PDF" };
  }
  if (input.pdfPath && (!input.paperStatus || input.paperStatus === "downloaded")) {
    return { fullTextAvailable: true, fullTextStatus: "AUTHORIZED_CORPUS_PDF" };
  }
  const oaClass = classifyExternalScholarlyUrl(input.openAccessUrl);
  if (oaClass === "DIRECT_PDF") {
    return { fullTextAvailable: true, fullTextStatus: "EXTERNAL_PDF_LINK" };
  }
  const linkClass = classifyExternalScholarlyUrl(input.paperLink);
  if (linkClass === "DIRECT_PDF") {
    return { fullTextAvailable: true, fullTextStatus: "EXTERNAL_PDF_LINK" };
  }
  if (oaClass === "LANDING_PAGE" || linkClass === "LANDING_PAGE") {
    return { fullTextAvailable: false, fullTextStatus: "LANDING_PAGE_ONLY" };
  }
  return { fullTextAvailable: false, fullTextStatus: "UNAVAILABLE" };
}

/**
 * Builds the ordered, non-ambiguous list of reading sources available for a paper
 * within a project context. Never exposes raw storage keys or private bucket paths.
 */
export function buildPaperReadingSources(input: PaperSourceInputs): PaperReadingSource[] {
  const sources: PaperReadingSource[] = [];
  const projectFiles = input.projectFiles ?? [];

  for (let i = 0; i < projectFiles.length; i++) {
    const f = projectFiles[i]!;
    const uploadedAt = f.createdAt instanceof Date ? f.createdAt.toISOString() : String(f.createdAt);
    sources.push({
      id: `project-pdf:${f.id}`,
      kind: "PROJECT_PDF",
      label: projectFiles.length > 1 ? `PDF do nhóm bổ sung (#${i + 1})` : "PDF do nhóm bổ sung",
      provider: f.uploadedByName ? `Tải lên bởi ${f.uploadedByName}` : "Tệp riêng của dự án",
      mediaType: "application/pdf",
      availability: "AUTHORIZED_PROJECT_PDF",
      accessState: "AUTHORIZED",
      verificationState: "VERIFIED_STORAGE",
      verifiedAt: uploadedAt,
      documentVersion: f.sha256.slice(0, 8),
      contentHash: f.sha256,
      byteSize: f.byteSize,
      fileId: f.id,
      readableInWorkspace: true,
      usableForFullTextScreening: true,
    });
  }

  if (input.pdfPath) {
    const approved = !input.paperStatus || input.paperStatus === "downloaded";
    sources.push({
      id: `corpus-pdf:${input.id}`,
      kind: "CORPUS_PDF",
      label: "PDF trong kho LumiGap",
      provider: "LumiGap Corpus",
      mediaType: "application/pdf",
      availability: approved ? "AUTHORIZED_CORPUS_PDF" : "ACCESS_RESTRICTED",
      accessState: approved && (input.downloadCost ?? 0) > 0 ? "REQUIRES_ENTITLEMENT" : approved ? "AUTHORIZED" : "RESTRICTED",
      verificationState: approved ? "VERIFIED_STORAGE" : "UNVERIFIED_EXTERNAL",
      license: input.licenseName ?? null,
      readableInWorkspace: false,
      usableForFullTextScreening: approved,
    });
  }

  const seenUrls = new Set<string>();
  const addExternalUrl = (rawUrl: string | null | undefined, sourceTag: "openAccess" | "paperLink") => {
    const cls = classifyExternalScholarlyUrl(rawUrl);
    if (cls === "UNSAFE_OR_INVALID" || !rawUrl) return;
    const normalized = rawUrl.trim();
    if (seenUrls.has(normalized)) return;
    seenUrls.add(normalized);

    let host = "";
    try {
      host = new URL(normalized).hostname.replace(/^www\./i, "");
    } catch {
      host = "";
    }
    const isPreprintHost = /(?:arxiv\.org|biorxiv\.org|medrxiv\.org|ssrn\.com|osf\.io|zenodo\.org)/i.test(host);

    if (cls === "DIRECT_PDF") {
      sources.push({
        id: `ext-pdf:${sourceTag}:${seenUrls.size}`,
        kind: "EXTERNAL_FULLTEXT_PDF",
        label: isPreprintHost ? "PDF bản tiền ấn phẩm (Preprint)" : "Liên kết PDF truy cập mở",
        provider: host || input.primaryProvider || undefined,
        version: isPreprintHost ? "Preprint / Repository copy" : undefined,
        mediaType: "application/pdf",
        availability: "FULLTEXT_LINK_UNVERIFIED",
        accessState: "EXTERNAL_OPEN",
        verificationState: "URL_PATTERN_PDF",
        license: input.licenseName ?? null,
        url: normalized,
        readableInWorkspace: false,
        usableForFullTextScreening: true,
      });
    } else {
      sources.push({
        id: `ext-landing:${sourceTag}:${seenUrls.size}`,
        kind: "EXTERNAL_LANDING_PAGE",
        label: isPreprintHost ? "Trang kho lưu trữ (Landing page)" : "Trang nguồn bên ngoài (Landing page)",
        provider: host || input.journalName || undefined,
        version: isPreprintHost ? "Repository record" : undefined,
        mediaType: "text/html",
        availability: "EXTERNAL_LANDING_PAGE",
        accessState: "EXTERNAL_OPEN",
        verificationState: "UNVERIFIED_EXTERNAL",
        license: input.licenseName ?? null,
        url: normalized,
        readableInWorkspace: false,
        usableForFullTextScreening: false,
      });
    }
  };

  addExternalUrl(input.openAccessUrl, "openAccess");
  addExternalUrl(input.paperLink, "paperLink");

  if (input.doi && /^10\.\d{4,9}\/\S+$/i.test(input.doi.trim())) {
    const doiUrl = `https://doi.org/${encodeURIComponent(input.doi.trim())}`;
    if (!seenUrls.has(doiUrl)) {
      sources.push({
        id: `doi:${input.doi.trim()}`,
        kind: "DOI_RESOLVER",
        label: "Định danh DOI (Trang xuất bản gốc)",
        provider: "DOI.org",
        mediaType: "text/html",
        availability: "EXTERNAL_LANDING_PAGE",
        accessState: "EXTERNAL_OPEN",
        verificationState: "UNVERIFIED_EXTERNAL",
        url: doiUrl,
        readableInWorkspace: false,
        usableForFullTextScreening: false,
      });
    }
  }

  if (input.abstractText?.trim()) {
    sources.push({
      id: `abstract:${input.id}`,
      kind: "ABSTRACT_ONLY",
      label: "Tóm tắt đã lập chỉ mục",
      provider: input.primaryProvider ? input.primaryProvider.toUpperCase() : "Corpus",
      mediaType: "text/plain",
      availability: "ABSTRACT_AVAILABLE",
      accessState: "AUTHORIZED",
      verificationState: "NOT_APPLICABLE",
      readableInWorkspace: true,
      usableForFullTextScreening: false,
    });
  } else if (sources.length === 0) {
    sources.push({
      id: `metadata:${input.id}`,
      kind: "METADATA_ONLY",
      label: "Chỉ có thông tin thư mục",
      provider: input.primaryProvider ? input.primaryProvider.toUpperCase() : "Corpus",
      availability: "METADATA_ONLY",
      accessState: "AUTHORIZED",
      verificationState: "NOT_APPLICABLE",
      readableInWorkspace: true,
      usableForFullTextScreening: false,
    });
  }

  return sources;
}

/**
 * A DOI or publisher landing page is NOT proof that full text is available.
 * Only an authorized project PDF, an approved corpus PDF, or a direct PDF URL satisfies full-text availability.
 */
export async function screeningFullTextAvailable(c: WorkspaceContext, paperId: string) {
  const [paper, files] = await Promise.all([
    c.tx.paper.findUnique({
      where: { id: paperId },
      select: { pdfPath: true, paperStatus: true, openAccessUrl: true, paperLink: true },
    }),
    c.tx.projectPaperFile.count({ where: { projectId: c.project.id, paperId } }),
  ]);
  return evaluatePaperFullTextStatus({
    pdfPath: paper?.pdfPath,
    paperStatus: paper?.paperStatus,
    openAccessUrl: paper?.openAccessUrl,
    paperLink: paper?.paperLink,
    projectFileCount: files,
  }).fullTextAvailable;
}

export async function screeningExclusionEvidence(c: WorkspaceContext, paperId: string, phase: string) {
  if (phase === "FULL_TEXT") return screeningFullTextAvailable(c, paperId);
  const paper = await c.tx.paper.findUniqueOrThrow({ where: { id: paperId }, select: { abstractText: true } });
  return Boolean(paper.abstractText?.trim()) || screeningFullTextAvailable(c, paperId);
}
