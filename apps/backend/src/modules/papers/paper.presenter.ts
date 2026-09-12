import type { Paper } from "@trend/shared-types";
import { normalizeAcademicTitle } from "../../common/text/academic-text.js";

type RawPaper = Record<string, any>;

export type PaperDetailDto = Paper & {
  pdfAvailable: boolean;
};

function toId(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "object" && "_id" in (value as object)) {
    return String((value as { _id: unknown })._id);
  }
  return String(value);
}

function presentUser(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const user = value as RawPaper;
  const id = toId(user);
  if (!id || !user.fullName) return undefined;
  return {
    _id: id,
    fullName: String(user.fullName),
    ...(user.institution ? { university: String(user.institution) } : {}),
    ...(user.role ? { role: String(user.role) } : {}),
    ...(user.avatarUrl ? { avatarUrl: String(user.avatarUrl) } : {}),
  };
}

function presentPublicPaperStatus(raw: RawPaper): Paper["paperStatus"] {
  return raw.pdfPath && raw.paperStatus === "downloaded"
    ? "downloaded"
    : "not-downloaded";
}

/**
 * Paper Detail is a public endpoint, so its response must be an explicit
 * allowlist. Storage locations, embeddings, source payloads, email addresses,
 * and workflow audit fields never cross this boundary.
 */
export function presentPaperDetail(
  doc: RawPaper,
  options: { includeWorkflow: boolean },
): PaperDetailDto {
  const raw = typeof doc.toObject === "function" ? doc.toObject() : doc;
  const id = String(raw._id);

  const result: Record<string, unknown> = {
    id,
    externalIds: raw.externalIds ?? {},
    title: normalizeAcademicTitle(raw.title),
    abstractText: raw.abstractText,
    authors: raw.authors ?? [],
    journalId: toId(raw.journalId),
    journalName: raw.journalName,
    publicationYear: raw.publicationYear,
    publicationDate: raw.publicationDate,
    paperKind: raw.paperKind,
    language: raw.language,
    openAccessStatus: raw.openAccessStatus,
    openAccessUrl: raw.openAccessUrl,
    paperLink: raw.paperLink,
    licenseName: raw.licenseName,
    citationCount: raw.citationCount ?? 0,
    fwci: raw.fwci,
    citationNormalizedPercentile: raw.citationNormalizedPercentile,
    relatedWorksCount: raw.relatedWorksCount ?? 0,
    keywords: raw.keywords ?? [],
    topics: raw.topics ?? [],
    primaryProvider: raw.primaryProvider,
    dataStatus: raw.dataStatus,
    dataQualityScore: raw.dataQualityScore ?? 0,
    isAiAnalyzable: Boolean(raw.isAiAnalyzable),
    aiScore: raw.aiScore,
    aiAnalysis: raw.aiAnalysis,
    metadataScore: raw.metadataScore,
    sourceScore: raw.sourceScore,
    duplicateScore: raw.duplicateScore,
    relevanceScore: raw.relevanceScore,
    prestigeScore: raw.prestigeScore,
    utilityScore: raw.utilityScore,
    qualityScore: raw.qualityScore,
    qualityTier: raw.qualityTier,
    qualityTierName: raw.qualityTierName,
    downloadCost: raw.downloadCost,
    uploadCreditReward: raw.uploadCreditReward,
    averageRating: raw.averageRating ?? 0,
    totalRatings: raw.totalRatings ?? 0,
    downloadCount: raw.downloadCount ?? 0,
    viewCount: raw.viewCount ?? 0,
    pdfAvailable: Boolean(raw.pdfPath),
    // Compatibility field for the current FE. This is a protected API route,
    // never the R2 URI, local path, bucket, or object key stored in MongoDB.
    pdfPath: raw.pdfPath ? `/api/v1/papers/${id}/pdf-url` : undefined,
    paperStatus: options.includeWorkflow
      ? raw.paperStatus
      : presentPublicPaperStatus(raw),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };

  if (options.includeWorkflow) {
    result.requestedBy = presentUser(raw.requestedBy);
    result.uploadedBy = presentUser(raw.uploadedBy);
    result.uploadedAt = raw.uploadedAt;
    result.rejectionReason = raw.rejectionReason;
  }

  return result as unknown as PaperDetailDto;
}
