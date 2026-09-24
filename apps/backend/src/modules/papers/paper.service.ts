import type { Paper, PaperRef } from "@trend/shared-types";
import jwt from "jsonwebtoken";
import { AppError } from "../../common/exceptions/app-error.js";
import { normalizeAcademicTitle } from "../../common/text/academic-text.js";
import { env } from "../../config/env.js";
import { parseDatabaseId, publicDatabaseId } from "../../infrastructure/database/database-id.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { pdfStorageService } from "../../infrastructure/pdf-storage.service.js";
import { creditService } from "../credits/credit.service.js";
import { notificationService } from "../notifications/notification.service.js";
import type { CreatePaperInput } from "./dto/create-paper.schema.js";
import type { SearchSortKey } from "./dto/paper-filters.schema.js";
import type { PaperFilterInput } from "./paper-filter.match.js";
import { calculatePaperQuality } from "./paper-quality.js";
import { presentPaperDetail, type PaperDetailDto } from "./paper.presenter.js";

export interface ListPapersParams extends PaperFilterInput { q?: string; page: number; pageSize: number; sort?: SearchSortKey }
export interface ListPapersResult { papers: Paper[]; total: number }
export interface CountPapersParams { topic?: string; yearFrom?: number; yearTo?: number; keyword?: string }
export interface AdminListPapersParams { status?: string; search?: string; kind?: "normal" | "pdf"; page: number; pageSize: number }
interface AdminListPapersResult extends ListPapersResult { normalTotal: number; pdfTotal: number }
export interface PaperDetailViewer { userId?: string; role?: string }

function idWhere(value: string): { id: string } | { legacyMongoId: string } | null {
  const parsed = parseDatabaseId(value);
  return parsed ? (parsed.kind === "uuid" ? { id: parsed.value } : { legacyMongoId: parsed.value }) : null;
}
async function resolveUser(value: string) {
  const where = idWhere(value); if (!where) throw AppError.badRequest("Invalid user id");
  const row = await getPrisma().user.findUnique({ where, select: { id: true, legacyMongoId: true, fullName: true, email: true, institution: true, role: true, avatarUrl: true } });
  if (!row) throw AppError.notFound("User not found"); return row;
}
async function resolvePaper(value: string) {
  const where = idWhere(value); if (!where) return null;
  return getPrisma().paper.findUnique({ where });
}

export function buildPaperVisibilityFilter(id: string, viewer: PaperDetailViewer = {}): Record<string, unknown> | null {
  const where = idWhere(id); if (!where) return null;
  if (viewer.role === "admin") return where;
  return { ...where, viewer };
}
export function normalizeDoiSearchQuery(query: string): string | undefined {
  const value = query.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "").toLowerCase();
  return /^10\.\d{4,9}\/\S+$/i.test(value) ? value : undefined;
}

function publicUser(user: Awaited<ReturnType<typeof resolveUser>>) {
  return { _id: publicDatabaseId(user), fullName: user.fullName, email: user.email, university: user.institution ?? undefined, role: user.role, avatarUrl: user.avatarUrl };
}

async function hydratePapers(rows: Array<NonNullable<Awaited<ReturnType<typeof resolvePaper>>>>, workflow = false): Promise<Paper[]> {
  if (!rows.length) return [];
  const prisma = getPrisma(); const ids = rows.map((row) => row.id);
  const [authors, keywords, topics, journals, users] = await Promise.all([
    prisma.paperAuthor.findMany({ where: { paperId: { in: ids } }, orderBy: { position: "asc" } }),
    prisma.paperKeyword.findMany({ where: { paperId: { in: ids } }, orderBy: { position: "asc" } }),
    prisma.paperTopic.findMany({ where: { paperId: { in: ids } }, orderBy: { position: "asc" } }),
    prisma.journal.findMany({ where: { id: { in: rows.flatMap((row) => row.journalId ? [row.journalId] : []) } } }),
    workflow ? prisma.user.findMany({ where: { id: { in: rows.flatMap((row) => [row.requestedById, row.uploadedById].filter((id): id is string => Boolean(id))) } }, select: { id: true, legacyMongoId: true, fullName: true, email: true, institution: true, role: true, avatarUrl: true } }) : [],
  ]);
  const group = <T>(items: T[], key: (item: T) => string) => { const map = new Map<string, T[]>(); for (const item of items) { const k = key(item); const list = map.get(k) ?? []; list.push(item); map.set(k, list); } return map; };
  const authorMap = group(authors, (row) => row.paperId), keywordMap = group(keywords, (row) => row.paperId), topicMap = group(topics, (row) => row.paperId);
  const journalMap = new Map(journals.map((row) => [row.id, row])); const userMap = new Map(users.map((row) => [row.id, row]));
  return rows.map((row) => {
    const id = publicDatabaseId(row); const requestedBy = row.requestedById ? userMap.get(row.requestedById) : undefined; const uploadedBy = row.uploadedById ? userMap.get(row.uploadedById) : undefined;
    const raw = { ...row, _id: id, externalIds: { doi: row.doi ?? undefined, openalexId: row.openalexId ?? undefined, semanticScholarId: row.semanticScholarId ?? undefined, arxivId: row.arxivId ?? undefined, pubmedId: row.pubmedId ?? undefined },
      authors: (authorMap.get(row.id) ?? []).map(({ paperId: _paperId, authorId, ...author }) => ({ ...author, authorId: authorId ?? undefined })),
      keywords: (keywordMap.get(row.id) ?? []).map(({ paperId: _paperId, keywordId, ...keyword }) => ({ ...keyword, keywordId: keywordId ?? undefined })),
      topics: (topicMap.get(row.id) ?? []).map(({ paperId: _paperId, topicId, ...topic }) => ({ ...topic, topicId: topicId ?? undefined })),
      journalId: row.journalId ? publicDatabaseId(journalMap.get(row.journalId) ?? { id: row.journalId }) : undefined,
      ...(requestedBy ? { requestedBy: publicUser(requestedBy) } : {}), ...(uploadedBy ? { uploadedBy: publicUser(uploadedBy) } : {}) };
    return presentPaperDetail(raw, { includeWorkflow: workflow }) as Paper;
  });
}

function citationWhere(bands?: string[]) {
  if (!bands?.length) return undefined; const clauses: Record<string, unknown>[] = [];
  for (const band of bands) { if (band === "0-9") clauses.push({ citationCount: { gte: 0, lte: 9 } }); else if (band === "10-49") clauses.push({ citationCount: { gte: 10, lte: 49 } }); else if (band === "50-99") clauses.push({ citationCount: { gte: 50, lte: 99 } }); else if (band === "100-499") clauses.push({ citationCount: { gte: 100, lte: 499 } }); else if (band === "500-999") clauses.push({ citationCount: { gte: 500, lte: 999 } }); else if (band === "1000+") clauses.push({ citationCount: { gte: 1000 } }); }
  return clauses.length ? clauses : undefined;
}

async function listWhere(input: ListPapersParams): Promise<Record<string, unknown>> {
  const where: Record<string, unknown> = { dataStatus: "active" };
  if (input.q) { const doi = normalizeDoiSearchQuery(input.q); where.OR = doi ? [{ doi }] : [{ title: { contains: input.q, mode: "insensitive" } }, { abstractText: { contains: input.q, mode: "insensitive" } }]; }
  if (input.yearFrom !== undefined || input.yearTo !== undefined) where.publicationYear = { ...(input.yearFrom !== undefined ? { gte: input.yearFrom } : {}), ...(input.yearTo !== undefined ? { lte: input.yearTo } : {}) };
  if (input.paperKinds?.length) where.paperKind = { in: input.paperKinds }; if (input.openAccess) where.openAccessUrl = { not: null };
  if (input.openAccessStatuses?.length) where.openAccessStatus = { in: input.openAccessStatuses.map((v) => v.toLowerCase()) };
  const providers = input.providers?.length ? input.providers : input.provider ? [input.provider] : []; if (providers.length) where.primaryProvider = { in: providers.map((v) => v.toLowerCase()) };
  if (input.sources?.length) where.journalName = { in: input.sources }; if (input.languages?.length) where.language = { in: input.languages.map((v) => v.toLowerCase()) };
  const citation = citationWhere(input.citationBands as string[] | undefined); if (citation) where.AND = [{ OR: citation }];
  const topicFilters = [input.topics, input.domains, input.fields, input.subfields, input.topicIds, input.domainIds, input.fieldIds, input.subfieldIds].some((v) => v?.length);
  if (topicFilters) { const matches = await getPrisma().paperTopic.findMany({ where: { ...(input.topics?.length ? { topicName: { in: input.topics } } : {}), ...(input.domains?.length ? { domainName: { in: input.domains } } : {}), ...(input.fields?.length ? { fieldName: { in: input.fields } } : {}), ...(input.subfields?.length ? { subfieldName: { in: input.subfields } } : {}), ...(input.topicIds?.length ? { openalexTopicId: { in: input.topicIds } } : {}), ...(input.domainIds?.length ? { domainId: { in: input.domainIds } } : {}), ...(input.fieldIds?.length ? { fieldId: { in: input.fieldIds } } : {}), ...(input.subfieldIds?.length ? { subfieldId: { in: input.subfieldIds } } : {}) }, select: { paperId: true } }); where.id = { in: [...new Set(matches.map((row) => row.paperId))] }; }
  return where;
}

function cleanUpdate(input: Record<string, unknown>) {
  const allowed = ["title", "abstractText", "journalName", "publicationYear", "publicationDate", "paperKind", "language", "openAccessStatus", "openAccessUrl", "paperLink", "licenseName", "citationCount", "fwci", "paperStatus", "dataStatus", "rejectionReason", "pdfPath", "uploadedAt"];
  return Object.fromEntries(allowed.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]));
}

export const paperService = {
  async list(input: ListPapersParams): Promise<ListPapersResult> {
    const where = await listWhere(input); const orderBy = input.sort === "citations" ? { citationCount: "desc" as const } : input.sort === "year" ? { publicationYear: "desc" as const } : input.q ? [{ citationCount: "desc" as const }, { publicationYear: "desc" as const }] : { createdAt: "desc" as const };
    const [rows, total] = await Promise.all([getPrisma().paper.findMany({ where, orderBy, skip: (input.page - 1) * input.pageSize, take: input.pageSize }), getPrisma().paper.count({ where })]);
    return { papers: await hydratePapers(rows), total };
  },
  async getById(id: string, viewer: PaperDetailViewer = {}): Promise<PaperDetailDto | null> {
    const row = await resolvePaper(id); if (!row) return null; let viewerId: string | undefined;
    if (viewer.userId) viewerId = (await resolveUser(viewer.userId)).id;
    const workflow = viewer.role === "admin" || Boolean(viewerId && [row.requestedById, row.uploadedById].includes(viewerId));
    if (row.dataStatus !== "active" && !workflow) return null; return (await hydratePapers([row], workflow))[0] as PaperDetailDto;
  },
  async getPdfStoragePath(id: string) { return (await resolvePaper(id))?.pdfPath ?? null; },
  async getEditableById(id: string, userId: string, userRole: string) { const row = await resolvePaper(id); if (!row) throw AppError.notFound("Paper not found"); const user = await resolveUser(userId); if (userRole !== "admin" && row.requestedById !== user.id) throw AppError.forbidden(); return (await hydratePapers([row], true))[0]!; },
  async getReferences(id: string, viewer: PaperDetailViewer = {}) { const row = await resolvePaper(id); if (!row || !(await this.getById(id, viewer))) throw AppError.notFound("Paper not found"); if (!row.referencedWorks.length) return []; const refs = await getPrisma().paper.findMany({ where: { dataStatus: "active", OR: [{ openalexId: { in: row.referencedWorks } }, { legacyMongoId: { in: row.referencedWorks.filter((v) => /^[0-9a-f]{24}$/i.test(v)) } }] } }); return (await hydratePapers(refs)).map(toPaperRef); },
  async getRelatedWorks(id: string, viewer: PaperDetailViewer = {}) { const row = await resolvePaper(id); if (!row || !(await this.getById(id, viewer))) throw AppError.notFound("Paper not found"); if (!row.relatedWorks.length) return []; const refs = await getPrisma().paper.findMany({ where: { dataStatus: "active", openalexId: { in: row.relatedWorks } } }); return (await hydratePapers(refs)).map(toPaperRef); },
  async getSummariesByIds(ids: string[]) { const rows = (await Promise.all(ids.map(resolvePaper))).filter((row): row is NonNullable<typeof row> => Boolean(row)); return orderByIds((await hydratePapers(rows)).map(toPaperRef), ids); },
  async count({ topic, yearFrom, yearTo, keyword }: CountPapersParams) { const topicRows = topic ? await getPrisma().paperTopic.findMany({ where: { topicName: { contains: topic, mode: "insensitive" } }, select: { paperId: true } }) : undefined; return { count: await getPrisma().paper.count({ where: { dataStatus: "active", ...(yearFrom !== undefined || yearTo !== undefined ? { publicationYear: { ...(yearFrom !== undefined ? { gte: yearFrom } : {}), ...(yearTo !== undefined ? { lte: yearTo } : {}) } } : {}), ...(keyword ? { OR: [{ title: { contains: keyword, mode: "insensitive" } }, { abstractText: { contains: keyword, mode: "insensitive" } }] } : {}), ...(topicRows ? { id: { in: topicRows.map((row) => row.paperId) } } : {}) } }) }; },

  async create(userId: string, isAdmin: boolean, input: CreatePaperInput, pdfPath?: string) {
    const user = await resolveUser(userId); const duplicate = await getPrisma().paper.findFirst({ where: { OR: [{ doi: input.doi.toLowerCase() }, { title: { equals: input.title, mode: "insensitive" } }] } }); if (duplicate) throw AppError.conflict("A paper with the same DOI or title already exists");
    if (!isAdmin) await creditService.chargeCreditsChecked({ userId, action: "paper_request", amount: 100, targetKind: "paper", idempotencyKey: `paper-request:${user.id}:${input.doi.toLowerCase()}` });
    const quality = calculatePaperQuality(input as never);
    const row = await getPrisma().$transaction(async (tx) => { const created = await tx.paper.create({ data: { doi: input.doi.toLowerCase(), title: input.title, abstractText: input.abstractText, publicationYear: input.publicationYear, paperKind: input.paperKind, paperLink: input.paperLink, openAccessUrl: input.openAccessUrl || null, openAccessStatus: input.openAccessUrl ? "green" : "unknown", primaryProvider: "user", requestedById: user.id, uploadedById: pdfPath ? user.id : null, uploadedAt: pdfPath ? new Date() : null, pdfPath, paperStatus: pdfPath ? "pending" : "not-downloaded", dataStatus: "draft", dataQualityScore: quality.qualityScore / 100, isAiAnalyzable: false, metadataScore: quality.metadataScore, sourceScore: quality.sourceScore, duplicateScore: quality.duplicateScore, relevanceScore: quality.relevanceScore, prestigeScore: quality.prestigeScore, utilityScore: quality.utilityScore, qualityScore: quality.qualityScore, qualityTier: quality.qualityTier, qualityTierName: quality.qualityTierName } });
      await tx.paperAuthor.createMany({ data: input.authors.map((author, index) => ({ paperId: created.id, displayName: author.displayName, position: index, isCorresponding: author.isCorresponding })) });
      await tx.paperKeyword.createMany({ data: input.keywords.map((keyword, index) => ({ paperId: created.id, keywordName: keyword.keywordName, detectedBy: "user", position: index })) });
      if (input.topics.length) await tx.paperTopic.createMany({ data: input.topics.map((topic, index) => ({ paperId: created.id, topicName: topic.topicName, detectedBy: "user", position: index })) }); return created; });
    await notificationService.create({ role: "admin", title: "New paper submission request", message: `${user.fullName} submitted “${row.title}”.`, type: "paper_submission", targetKind: "paper", targetId: row.id }); return (await hydratePapers([row], true))[0]!;
  },
  async getMyPapers(userId: string) { const user = await resolveUser(userId); return hydratePapers(await getPrisma().paper.findMany({ where: { OR: [{ requestedById: user.id }, { uploadedById: user.id }] }, orderBy: { createdAt: "desc" } }), true); },
  async getAllPapersAdmin({ status, search, kind = "normal", page, pageSize }: AdminListPapersParams): Promise<AdminListPapersResult> { const base = { ...(status ? { paperStatus: status } : {}), ...(search ? { OR: [{ title: { contains: search, mode: "insensitive" as const } }, { doi: { contains: search, mode: "insensitive" as const } }] } : {}) }; const where = { ...base, ...(kind === "pdf" ? { pdfPath: { not: null } } : { pdfPath: null }) }; const [rows, total, normalTotal, pdfTotal] = await Promise.all([getPrisma().paper.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }), getPrisma().paper.count({ where }), getPrisma().paper.count({ where: { ...base, pdfPath: null } }), getPrisma().paper.count({ where: { ...base, pdfPath: { not: null } } })]); return { papers: await hydratePapers(rows, true), total, normalTotal, pdfTotal }; },

  async assertCanUploadPdf(paperId: string, uploaderId: string, uploaderRole: string) { const [paper, user] = await Promise.all([resolvePaper(paperId), resolveUser(uploaderId)]); if (!paper) throw AppError.notFound("Paper not found"); if (uploaderRole !== "admin" && paper.requestedById !== user.id && paper.uploadedById !== user.id) throw AppError.forbidden(); return paper; },
  async uploadPdf(paperId: string, uploaderId: string, uploaderRole: string, pdfPath: string) { const paper = await this.assertCanUploadPdf(paperId, uploaderId, uploaderRole); const user = await resolveUser(uploaderId); if (paper.pdfPath) await pdfStorageService.deletePdf(paper.pdfPath); const updated = await getPrisma().paper.update({ where: { id: paper.id }, data: { pdfPath, uploadedById: user.id, uploadedAt: new Date(), paperStatus: paper.requestedById === user.id ? "pending" : "pending-requester-acceptance" } }); return (await hydratePapers([updated], true))[0]!; },
  async acceptPdf(paperId: string, requesterId: string) { const [paper, user] = await Promise.all([resolvePaper(paperId), resolveUser(requesterId)]); if (!paper) throw AppError.notFound("Paper not found"); if (paper.requestedById !== user.id) throw AppError.forbidden(); if (!paper.pdfPath) throw AppError.badRequest("No PDF is available"); const updated = await getPrisma().paper.update({ where: { id: paper.id }, data: { paperStatus: "downloaded", dataStatus: "active" } }); return (await hydratePapers([updated], true))[0]!; },
  async rejectPdf(paperId: string, requesterId: string) { const [paper, user] = await Promise.all([resolvePaper(paperId), resolveUser(requesterId)]); if (!paper) throw AppError.notFound("Paper not found"); if (paper.requestedById !== user.id) throw AppError.forbidden(); if (paper.pdfPath) await pdfStorageService.deletePdf(paper.pdfPath); const updated = await getPrisma().paper.update({ where: { id: paper.id }, data: { pdfPath: null, uploadedById: null, uploadedAt: null, paperStatus: "not-downloaded" } }); return (await hydratePapers([updated], true))[0]!; },
  async cancelRequest(paperId: string, userId: string) { const [paper, user] = await Promise.all([resolvePaper(paperId), resolveUser(userId)]); if (!paper) throw AppError.notFound("Paper not found"); if (paper.requestedById !== user.id) throw AppError.forbidden(); if (paper.pdfPath) await pdfStorageService.deletePdf(paper.pdfPath); await getPrisma().paper.delete({ where: { id: paper.id } }); },
  async updateStatus(paperId: string, status: string, rejectionReason?: string) { const paper = await resolvePaper(paperId); if (!paper) throw AppError.notFound("Paper not found"); const updated = await getPrisma().paper.update({ where: { id: paper.id }, data: { paperStatus: status, rejectionReason: status === "rejected" ? rejectionReason : null, dataStatus: ["downloaded", "not-downloaded", "pending-requester-acceptance"].includes(status) ? "active" : status === "rejected" ? "low-quality" : "draft" } }); return (await hydratePapers([updated], true))[0]!; },
  async getPdfDownloadUrl(paperId: string, userId: string, userRole: string, baseUrl: string) { const paper = await resolvePaper(paperId); if (!paper?.pdfPath) throw AppError.notFound("PDF is not available for this paper"); await resolveUser(userId); if (paper.dataStatus !== "active" && userRole !== "admin") throw AppError.forbidden(); const id = publicDatabaseId(paper); const token = jwt.sign({ paperId: id, sub: userId, purpose: "paper-download" }, env.JWT_ACCESS_SECRET, { expiresIn: "5m" }); return { url: `${baseUrl}/api/v1/papers/${id}/download?token=${encodeURIComponent(token)}`, expiresInSeconds: 300 }; },
  async update(paperId: string, input: Record<string, unknown>) { const paper = await resolvePaper(paperId); if (!paper) throw AppError.notFound("Paper not found"); const uploader = input.uploadedBy ? await resolveUser(String(input.uploadedBy)) : undefined; const updated = await getPrisma().paper.update({ where: { id: paper.id }, data: { ...cleanUpdate(input), ...(uploader ? { uploadedById: uploader.id } : {}) } }); return (await hydratePapers([updated], true))[0]!; },
  async deletePaper(paperId: string, userId: string, userRole: string) { const [paper, user] = await Promise.all([resolvePaper(paperId), resolveUser(userId)]); if (!paper) throw AppError.notFound("Paper not found"); if (userRole !== "admin" && paper.requestedById !== user.id) throw AppError.forbidden(); if (paper.pdfPath) await pdfStorageService.deletePdf(paper.pdfPath); await getPrisma().paper.delete({ where: { id: paper.id } }); },
  async deletePaperPdf(paperId: string) { const paper = await resolvePaper(paperId); if (!paper) throw AppError.notFound("Paper not found"); if (paper.pdfPath) await pdfStorageService.deletePdf(paper.pdfPath); const updated = await getPrisma().paper.update({ where: { id: paper.id }, data: { pdfPath: null, uploadedById: null, uploadedAt: null, paperStatus: "not-downloaded" } }); return (await hydratePapers([updated], true))[0]!; },
  async resubmit(paperId: string, userId: string, input: Record<string, unknown>, pdfPath?: string) { const [paper, user] = await Promise.all([resolvePaper(paperId), resolveUser(userId)]); if (!paper) throw AppError.notFound("Paper not found"); if (paper.requestedById !== user.id) throw AppError.forbidden(); if (paper.paperStatus !== "rejected") throw AppError.conflict("Only rejected papers can be resubmitted"); if (pdfPath && paper.pdfPath) await pdfStorageService.deletePdf(paper.pdfPath); const updated = await getPrisma().paper.update({ where: { id: paper.id }, data: { ...cleanUpdate(input), ...(pdfPath ? { pdfPath, uploadedById: user.id, uploadedAt: new Date() } : {}), paperStatus: "pending", dataStatus: "draft", rejectionReason: null } }); return (await hydratePapers([updated], true))[0]!; },
};

export function orderByIds(refs: PaperRef[], ids: string[]): PaperRef[] { const byId = new Map(refs.map((ref) => [ref.id, ref])); return ids.flatMap((id) => byId.get(id) ? [byId.get(id)!] : []); }
export function toPaperRef(doc: unknown): PaperRef { const paper = doc as Paper & { _id?: unknown }; return { id: paper.id ?? String(paper._id), title: normalizeAcademicTitle(paper.title), publicationYear: paper.publicationYear, authors: paper.authors ?? [], doi: paper.externalIds?.doi }; }
