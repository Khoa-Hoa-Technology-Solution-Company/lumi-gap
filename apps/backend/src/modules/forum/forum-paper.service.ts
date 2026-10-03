import { AppError } from "../../common/exceptions/app-error.js";
import { publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { fetchOpenAlexWorkByDoi } from "../api-sync/providers/openalex.client.js";
import { normalizeOpenAlexWork } from "../api-sync/providers/openalex.normalizer.js";
import { ingestOpenAlexWorks } from "../api-sync/sync.service.js";
import { normalizeDoiSearchQuery } from "../papers/paper.service.js";
import { cleanForumText } from "./forum.rules.js";

async function lookup(input: string) {
  const doi = normalizeDoiSearchQuery(input);
  if (!doi || doi.length > 300) throw AppError.badRequest("Enter a valid DOI");
  const prisma = getPrisma();
  const existing = await prisma.paper.findFirst({ where: { doi: { equals: doi, mode: "insensitive" } } });
  if (existing) {
    if (existing.dataStatus !== "active") throw AppError.forbidden("This paper is not available for public forum references");
    const authors = await prisma.paperAuthor.findMany({ where: { paperId: existing.id }, orderBy: { position: "asc" }, select: { displayName: true }, take: 30 });
    return { preview: { paperId: publicDatabaseId(existing), doi, title: existing.title, publicationYear: existing.publicationYear, authors: authors.map((author) => author.displayName), canAttach: true }, work: null };
  }
  const provider = await prisma.apiProvider.findUnique({ where: { providerName: "openalex" } });
  if (!provider || provider.providerStatus !== "enabled") throw AppError.serviceUnavailable("Paper metadata lookup is unavailable");
  const work = await fetchOpenAlexWorkByDoi(doi).catch(() => { throw AppError.serviceUnavailable("Paper metadata lookup is unavailable. Please try again."); });
  if (!work) throw AppError.notFound("No paper metadata found for this DOI");
  const normalized = normalizeOpenAlexWork(work);
  if (normalized.externalIds.doi !== doi) throw AppError.badRequest("The provider returned a different DOI");
  if (normalized.externalIds.openalexId) {
    const existingWork = await prisma.paper.findFirst({ where: { openalexId: normalized.externalIds.openalexId }, select: { id: true, legacyMongoId: true, dataStatus: true } });
    if (existingWork && existingWork.dataStatus !== "active") throw AppError.forbidden("This paper is not available for public forum references");
  }
  const title = cleanForumText(normalized.title);
  if (!title || !normalized.publicationYear) throw AppError.badRequest("The provider returned incomplete paper metadata");
  // Keep the existing ingestion quality gate. A preview never publishes or imports a paper.
  const canAttach = Boolean(normalized.abstractText && normalized.abstractText.length >= 250);
  return { preview: { doi, title, publicationYear: normalized.publicationYear, authors: normalized.authors.slice(0, 30).map((author) => cleanForumText(author.displayName)), canAttach }, work, provider };
}

export const forumPaperService = {
  async preview(doi: string) { return (await lookup(doi)).preview; },
  async attach(doi: string) {
    const result = await lookup(doi);
    if (!result.preview.canAttach) throw AppError.badRequest("This paper does not meet the existing public metadata quality requirements");
    if (!result.work) return result.preview;
    const ingested = await ingestOpenAlexWorks([result.work], result.provider!.id);
    const paper = ingested.records[0]?.paper;
    if (!paper || paper.dataStatus !== "active") throw AppError.serviceUnavailable("Could not import this paper. Please try again.");
    return { ...result.preview, paperId: publicDatabaseId(paper) };
  },
};
