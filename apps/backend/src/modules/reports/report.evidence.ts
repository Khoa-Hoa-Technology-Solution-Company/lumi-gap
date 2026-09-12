import type { EvidencePaper } from "./report.prompt.js";
import type { SortOrder } from "mongoose";
import { env } from "../../config/env.js";
import { PaperModel } from "../papers/models/paper.model.js";
import { retrieve, type RetrieveFilters } from "../retrieval/retriever.js";

export type ReportEvidenceSource = "selected" | "retrieved";

export interface ReportEvidencePaper extends EvidencePaper {
  source: ReportEvidenceSource;
}

export interface MergeReportEvidenceInput {
  selected: ReportEvidencePaper[];
  retrieved: ReportEvidencePaper[];
  maxPapers: number;
}

export interface CollectReportEvidenceInput {
  queryText?: string;
  queryVector?: number[];
  selectedPaperIds?: string[];
  yearFrom?: number;
  yearTo?: number;
  scopeFilters?: Omit<RetrieveFilters, "yearFrom" | "yearTo" | "paperIds" | "openAccess" | "minScore" | "provider">;
  fillWithRetrieved?: boolean;
}

export interface CollectReportEvidenceResult {
  papers: ReportEvidencePaper[];
  retrievedPaperIds: string[];
  selectedPaperIds: string[];
  missingSelectedPaperIds: string[];
  maxEvidencePapers: number;
}

/**
 * One canonical evidence ordering for preview and worker generation.
 * Selected papers are user intent, so they are pinned first; vector retrieval
 * fills the remaining evidence budget without duplicating selected papers.
 */
export function mergeReportEvidence(input: MergeReportEvidenceInput): ReportEvidencePaper[] {
  const maxPapers = Math.max(0, Math.floor(input.maxPapers));
  const seen = new Set<string>();
  const merged: ReportEvidencePaper[] = [];

  for (const candidate of [...input.selected, ...input.retrieved]) {
    if (merged.length >= maxPapers) break;
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    merged.push(candidate);
  }

  return merged;
}

export async function collectReportEvidence(
  input: CollectReportEvidenceInput,
): Promise<CollectReportEvidenceResult> {
  const selectedPaperIds = dedupeIds(input.selectedPaperIds ?? []);
  const shouldRetrieve = input.fillWithRetrieved ?? true;
  const [selected, retrieved] = await Promise.all([
    fetchSelectedEvidencePapers(selectedPaperIds),
    shouldRetrieve ? fetchRetrievedEvidencePapers(input) : Promise.resolve([]),
  ]);

  return {
    papers: mergeReportEvidence({
      selected: selected.papers,
      retrieved,
      maxPapers: env.REPORT_TOP_K,
    }),
    retrievedPaperIds: retrieved.map((p) => p.id),
    selectedPaperIds,
    missingSelectedPaperIds: selected.missingIds,
    maxEvidencePapers: env.REPORT_TOP_K,
  };
}

async function fetchRetrievedEvidencePapers(input: CollectReportEvidenceInput): Promise<ReportEvidencePaper[]> {
  const filters = {
    yearFrom: input.yearFrom,
    yearTo: input.yearTo,
    ...input.scopeFilters,
  };

  if (input.queryVector && input.queryVector.length > 0) {
    // Most report scope fields are applied after $vectorSearch because the
    // deployed vector index only guarantees year/status filters. Retrieve a
    // wider candidate pool so a valid language/taxonomy slice is not discarded
    // merely because it was absent from the first REPORT_TOP_K global matches.
    const hasPostVectorScope = hasNonEmptyScope(input.scopeFilters);
    return retrieve({
      queryVector: input.queryVector,
      topK: env.REPORT_TOP_K,
      poolSize: hasPostVectorScope ? Math.min(500, Math.max(200, env.REPORT_TOP_K * 20)) : env.REPORT_TOP_K,
      numCandidates: hasPostVectorScope ? 1000 : 200,
      filters,
      projection: "report",
    }).then((papers) => papers.map((p) => ({ ...p, source: "retrieved" as const })));
  }

  return fetchTextEvidencePapers(input.queryText, filters);
}

function hasNonEmptyScope(scopeFilters: CollectReportEvidenceInput["scopeFilters"]): boolean {
  if (!scopeFilters) return false;
  return Object.values(scopeFilters).some((value) => Array.isArray(value) && value.length > 0);
}

async function fetchTextEvidencePapers(
  queryText: string | undefined,
  filters: CollectReportEvidenceInput["scopeFilters"] & {
    yearFrom?: number;
    yearTo?: number;
  },
): Promise<ReportEvidencePaper[]> {
  const q = queryText?.trim();
  const match = buildTextEvidenceMatch(filters);
  if (q) match.$text = { $search: q };

  const projection = q
    ? {
        title: 1,
        abstractText: 1,
        publicationYear: 1,
        journalName: 1,
        citationCount: 1,
        "authors.displayName": 1,
        score: { $meta: "textScore" },
      }
    : {
        title: 1,
        abstractText: 1,
        publicationYear: 1,
        journalName: 1,
        citationCount: 1,
        "authors.displayName": 1,
      };
  const sort: Record<string, SortOrder | { $meta: "textScore" }> = q
    ? { score: { $meta: "textScore" }, citationCount: -1 as const }
    : { citationCount: -1 as const, publicationYear: -1 as const };

  const docs = await PaperModel.find(match, projection)
    .sort(sort)
    .limit(env.REPORT_TOP_K)
    .lean();

  return docs.map((doc) => ({
    id: String(doc._id),
    title: String(doc.title ?? ""),
    abstractText: doc.abstractText ? String(doc.abstractText) : undefined,
    publicationYear: doc.publicationYear as number | undefined,
    journalName: doc.journalName ? String(doc.journalName) : undefined,
    citationCount: doc.citationCount as number | undefined,
    authorNames: ((doc.authors ?? []) as Array<{ displayName?: string }>)
      .map((a) => a.displayName ?? "")
      .filter(Boolean),
    score: Number((doc as { score?: number }).score ?? 0.5),
    source: "retrieved",
  }));
}

function buildTextEvidenceMatch(
  filters: CollectReportEvidenceInput["scopeFilters"] & {
    yearFrom?: number;
    yearTo?: number;
  },
): Record<string, unknown> {
  const f = filters ?? {};
  const match: Record<string, unknown> = { dataStatus: "active" };

  if (f.yearFrom !== undefined || f.yearTo !== undefined) {
    match.publicationYear = {
      ...(f.yearFrom !== undefined ? { $gte: f.yearFrom } : {}),
      ...(f.yearTo !== undefined ? { $lte: f.yearTo } : {}),
    };
  }
  if (f.paperKinds && f.paperKinds.length > 0) match.paperKind = { $in: f.paperKinds };
  if (f.openAccessStatuses && f.openAccessStatuses.length > 0) {
    match.openAccessStatus = { $in: normalizeLowercase(f.openAccessStatuses) };
  }
  if (f.providers && f.providers.length > 0) match.primaryProvider = { $in: normalizeLowercase(f.providers) };
  if (f.sources && f.sources.length > 0) match.journalName = { $in: uniqueStrings(f.sources) };
  if (f.languages && f.languages.length > 0) match.language = { $in: normalizeLowercase(f.languages) };

  const citationClauses = uniqueStrings(f.citationBands).map(citationBandToMatch).filter(Boolean);
  if (citationClauses.length === 1) {
    Object.assign(match, citationClauses[0]);
  } else if (citationClauses.length > 1) {
    match.$or = citationClauses;
  }

  const topicElemMatch = buildTopicElementMatch(f);
  if (Object.keys(topicElemMatch).length > 0) {
    match.topics = { $elemMatch: topicElemMatch };
  }

  return match;
}

async function fetchSelectedEvidencePapers(
  ids: string[],
): Promise<{ papers: ReportEvidencePaper[]; missingIds: string[] }> {
  if (ids.length === 0) return { papers: [], missingIds: [] };

  const docs = await PaperModel.find({ _id: { $in: ids }, dataStatus: "active" })
    .select("title abstractText publicationYear journalName citationCount authors")
    .lean();
  const byId = new Map(docs.map((doc) => [String(doc._id), doc]));
  const papers: ReportEvidencePaper[] = [];
  const missingIds: string[] = [];

  for (const id of ids) {
    const doc = byId.get(id);
    if (!doc) {
      missingIds.push(id);
      continue;
    }
    papers.push({
      id,
      title: String(doc.title ?? ""),
      abstractText: doc.abstractText ? String(doc.abstractText) : undefined,
      publicationYear: doc.publicationYear as number | undefined,
      journalName: doc.journalName ? String(doc.journalName) : undefined,
      citationCount: doc.citationCount as number | undefined,
      authorNames: ((doc.authors ?? []) as Array<{ displayName?: string }>)
        .map((a) => a.displayName ?? "")
        .filter(Boolean),
      score: 1,
      source: "selected",
    });
  }

  return { papers, missingIds };
}

function dedupeIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    deduped.push(id);
  }
  return deduped;
}

function buildTopicElementMatch(filters: NonNullable<CollectReportEvidenceInput["scopeFilters"]>): Record<string, unknown> {
  const match: Record<string, unknown> = {};
  const nameFilters = [
    ["topics", "topicName"],
    ["domains", "domainName"],
    ["fields", "fieldName"],
    ["subfields", "subfieldName"],
  ] as const;
  const idFilters = [
    ["topicIds", "openalexTopicId"],
    ["domainIds", "domainId"],
    ["fieldIds", "fieldId"],
    ["subfieldIds", "subfieldId"],
  ] as const;

  for (const [filterKey, topicField] of nameFilters) {
    const values = uniqueStrings(filters[filterKey]);
    if (values.length > 0) match[topicField] = { $in: values };
  }
  for (const [filterKey, topicField] of idFilters) {
    const values = expandOpenAlexIds(uniqueStrings(filters[filterKey]));
    if (values.length > 0) match[topicField] = { $in: values };
  }

  return match;
}

function citationBandToMatch(band: string): Record<string, unknown> | null {
  if (band === "0-9") return { citationCount: { $gte: 0, $lte: 9 } };
  if (band === "10-49") return { citationCount: { $gte: 10, $lte: 49 } };
  if (band === "50-99") return { citationCount: { $gte: 50, $lte: 99 } };
  if (band === "100-499") return { citationCount: { $gte: 100, $lte: 499 } };
  if (band === "500-999") return { citationCount: { $gte: 500, $lte: 999 } };
  if (band === "1000+") return { citationCount: { $gte: 1000 } };
  return null;
}

function normalizeLowercase(values: unknown): string[] {
  return uniqueStrings(values).map((value) => value.toLowerCase());
}

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map(String).map((value) => value.trim()).filter(Boolean)));
}

function expandOpenAlexIds(values: string[]): string[] {
  const expanded = new Set<string>();
  for (const value of values) {
    expanded.add(value);
    const lastSegment = value.split("/").filter(Boolean).at(-1);
    if (lastSegment) {
      expanded.add(lastSegment);
      expanded.add(lastSegment.toUpperCase());
    }
  }
  return Array.from(expanded);
}
