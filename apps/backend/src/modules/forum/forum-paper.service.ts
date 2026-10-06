import { AppError } from "../../common/exceptions/app-error.js";
import { publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { fetchOpenAlexWorkByDoi, fetchOpenAlexWorkById, searchOpenAlexWorks } from "../api-sync/providers/openalex.client.js";
import { hasOpenAlexCitationMetadata, normalizeOpenAlexWork } from "../api-sync/providers/openalex.normalizer.js";
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
    return { preview: { paperId: publicDatabaseId(existing), doi, title: existing.title, publicationYear: existing.publicationYear, authors: authors.map((author) => author.displayName), venue: existing.journalName ?? undefined, canAttach: true }, work: null };
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
  // Citation metadata does not require an abstract. A preview never imports a paper.
  const canAttach = hasOpenAlexCitationMetadata(normalized);
  return { preview: { doi, title, publicationYear: normalized.publicationYear, authors: normalized.authors.slice(0, 30).map((author) => cleanForumText(author.displayName)), venue: normalized.journalName, canAttach }, work, provider };
}

export const forumPaperService = {
  async search(query: string) {
    const text = query.trim();
    if (text.length < 3 || text.length > 160) throw AppError.badRequest("Use 3 to 160 characters to search papers");
    const prisma = getPrisma();
    const provider = await prisma.apiProvider.findUnique({ where: { providerName: "openalex" } });
    if (!provider || provider.providerStatus !== "enabled") throw AppError.serviceUnavailable("Paper search is unavailable");
    const works = await searchOpenAlexWorks(text).catch(() => { throw AppError.serviceUnavailable("Paper search is unavailable. Please try again."); });
    const normalized = works.map(normalizeOpenAlexWork).filter((paper) => /^W\d{1,20}$/.test(paper.externalIds.openalexId ?? ""));
    const existing = normalized.length ? await prisma.paper.findMany({ where: { OR: [
      { openalexId: { in: normalized.map((paper) => paper.externalIds.openalexId!) } },
      { doi: { in: normalized.flatMap((paper) => paper.externalIds.doi ? [paper.externalIds.doi] : []), mode: "insensitive" } },
    ] }, select: { id: true, legacyMongoId: true, openalexId: true, doi: true, dataStatus: true } }) : [];
    return normalized.flatMap((paper) => {
      const matches = existing.filter((row) => row.openalexId === paper.externalIds.openalexId || Boolean(row.doi && row.doi.toLowerCase() === paper.externalIds.doi));
      if (matches.some((row) => row.dataStatus !== "active")) return [];
      return [{ openalexId: paper.externalIds.openalexId!, paperId: matches[0] ? publicDatabaseId(matches[0]) : undefined,
        title: cleanForumText(paper.title), doi: paper.externalIds.doi, publicationYear: paper.publicationYear,
        authors: paper.authors.slice(0, 30).map((author) => cleanForumText(author.displayName)), venue: paper.journalName, canAttach: hasOpenAlexCitationMetadata(paper) }];
    });
  },
  async attachOpenAlex(openalexId: string) {
    if (!/^W\d{1,20}$/.test(openalexId)) throw AppError.badRequest("Invalid OpenAlex work identifier");
    const prisma = getPrisma();
    const provider = await prisma.apiProvider.findUnique({ where: { providerName: "openalex" } });
    if (!provider || provider.providerStatus !== "enabled") throw AppError.serviceUnavailable("Paper metadata lookup is unavailable");
    // Re-fetch authoritative metadata on attach; never trust preview metadata sent by a client.
    const work = await fetchOpenAlexWorkById(openalexId).catch(() => { throw AppError.serviceUnavailable("Paper metadata lookup is unavailable. Please try again."); });
    if (!work) throw AppError.notFound("No paper metadata found for this OpenAlex work");
    const paper = normalizeOpenAlexWork(work);
    if (paper.externalIds.openalexId !== openalexId || !hasOpenAlexCitationMetadata(paper)) throw AppError.badRequest("The provider returned incomplete citation metadata");
    const existing = await prisma.paper.findMany({ where: { OR: [{ openalexId }, ...(paper.externalIds.doi ? [{ doi: { equals: paper.externalIds.doi, mode: "insensitive" as const } }] : [])] }, select: { dataStatus: true } });
    if (existing.some((row) => row.dataStatus !== "active")) throw AppError.forbidden("This paper is not available for public forum references");
    const ingested = await ingestOpenAlexWorks([work], provider.id, { purpose: "citation" });
    const record = ingested.records[0]?.paper;
    if (!record || record.dataStatus !== "active") throw AppError.serviceUnavailable("Could not import this paper. Please try again.");
    const authors = await prisma.paperAuthor.findMany({ where: { paperId: record.id }, orderBy: { position: "asc" }, select: { displayName: true }, take: 30 });
    return { paperId: publicDatabaseId(record), openalexId, title: record.title, doi: record.doi ?? undefined, publicationYear: record.publicationYear, authors: authors.map((author) => author.displayName), venue: record.journalName ?? undefined, canAttach: true };
  },
  async preview(doi: string) { return (await lookup(doi)).preview; },
  async attach(doi: string) {
    const result = await lookup(doi);
    if (!result.preview.canAttach) throw AppError.badRequest("The provider returned incomplete citation metadata");
    if (!result.work) return result.preview;
    const ingested = await ingestOpenAlexWorks([result.work], result.provider!.id, { purpose: "citation" });
    const paper = ingested.records[0]?.paper;
    if (!paper || paper.dataStatus !== "active") throw AppError.serviceUnavailable("Could not import this paper. Please try again.");
    return { ...result.preview, paperId: publicDatabaseId(paper) };
  },
};
