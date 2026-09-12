import type { PipelineStage } from "mongoose";
import type { ScoredPaper } from "@trend/shared-types";
import { normalizeAcademicTitle } from "../../common/text/academic-text.js";
import { env } from "../../config/env.js";
import { getEmbeddingProvider } from "../embeddings/embedding.factory.js";
import { PaperModel } from "../papers/models/paper.model.js";
import type { PaperStructuredAnalysis } from "../papers/paper-structured-context.js";
import {
  buildPaperMetadataMatch,
  type PaperFilterInput,
} from "../papers/paper-filter.match.js";

import { logger } from "../../infrastructure/logger.js";

export const VECTOR_INDEX = env.MONGODB_VECTOR_INDEX_NAME;

export type RetrievalProjection = "search" | "report" | "gap" | "chat";

export interface RetrieveFilters extends PaperFilterInput {
  minScore?: number;
}

export interface RetrieveOptions {
  queryText?: string;
  queryVector?: number[];
  topK: number;
  poolSize?: number;
  numCandidates?: number;
  filters?: RetrieveFilters;
  projection?: RetrievalProjection;
}

export interface RetrievedPaper {
  id: string;
  title: string;
  abstractText?: string;
  publicationYear?: number;
  journalName?: string;
  citationCount?: number;
  authorNames: string[];
  score: number;
  aiAnalysis?: PaperStructuredAnalysis | null;
}

export async function retrieve(opts: RetrieveOptions): Promise<RetrievedPaper[]> {
  try {
    const queryVector = opts.queryVector ?? (await embedQuery(opts.queryText));
    const pipeline = buildRetrievePipeline({ ...opts, queryVector });
    const docs = await PaperModel.aggregate(pipeline as PipelineStage[]);
    return docs.map(toRetrievedPaper);
  } catch (err: unknown) {
    if (String(err).includes("$vectorSearch stage is only allowed on MongoDB Atlas")) {
      logger.warn("MongoDB Atlas $vectorSearch unavailable; falling back to keyword search");
      const fallbackDocs = await PaperModel.aggregate(buildFallbackKeywordPipeline(opts) as PipelineStage[]);
      return fallbackDocs.map(toRetrievedPaper);
    }
    throw err;
  }
}

export async function retrieveScored(opts: RetrieveOptions): Promise<ScoredPaper[]> {
  try {
    const queryVector = opts.queryVector ?? (await embedQuery(opts.queryText));
    const pipeline = buildRetrievePipeline({ ...opts, queryVector });
    const docs = await PaperModel.aggregate(pipeline as PipelineStage[]);
    return docs.map(toScoredPaper);
  } catch (err: unknown) {
    if (String(err).includes("$vectorSearch stage is only allowed on MongoDB Atlas")) {
      logger.warn("MongoDB Atlas $vectorSearch unavailable; falling back to keyword search");
      const fallbackDocs = await PaperModel.aggregate(buildFallbackKeywordPipeline(opts) as PipelineStage[]);
      return fallbackDocs.map(toScoredPaper);
    }
    throw err;
  }
}

export function buildFallbackKeywordPipeline(opts: RetrieveOptions): PipelineStage[] {
  const topK = Math.max(1, opts.topK);
  const filter = buildVectorFilter(opts);
  const postMatch = buildPostMatch(opts.filters);

  const queryWords = (opts.queryText ?? "")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 5);

  const textMatch =
    queryWords.length > 0
      ? {
          $or: [
            { title: { $regex: queryWords.join("|"), $options: "i" } },
            { abstractText: { $regex: queryWords.join("|"), $options: "i" } },
          ],
        }
      : {};

  const matchStage: Record<string, unknown> = {
    ...filter,
    ...(postMatch ?? {}),
    ...textMatch,
  };

  return [
    { $match: matchStage },
    { $addFields: { score: 1.0 } },
    buildProjection(opts.projection ?? "search"),
    { $limit: topK },
  ];
}

async function embedQuery(queryText: string | undefined): Promise<number[]> {
  const q = queryText?.trim();
  if (!q) throw new Error("retrieve requires queryText or queryVector");
  return getEmbeddingProvider().embed(q);
}

export function buildVectorFilter(opts: Pick<RetrieveOptions, "filters">): Record<string, unknown> {
  const f = opts.filters ?? {};
  const filter: Record<string, unknown> = { dataStatus: "active" };
  const metadataMatch = buildPaperMetadataMatch(f, { includeActive: false });

  if (f.yearFrom !== undefined || f.yearTo !== undefined) {
    filter.publicationYear = {
      ...(f.yearFrom !== undefined ? { $gte: f.yearFrom } : {}),
      ...(f.yearTo !== undefined ? { $lte: f.yearTo } : {}),
    };
  }

  for (const path of [
    "_id",
    "paperKind",
    "openAccessStatus",
    "primaryProvider",
    "journalName",
    "language",
    "citationCount",
  ] as const) {
    if (metadataMatch[path] !== undefined) filter[path] = metadataMatch[path];
  }
  if (metadataMatch.$or !== undefined) filter.$or = metadataMatch.$or;

  const topicMatch = (
    metadataMatch.topics as { $elemMatch?: Record<string, unknown> } | undefined
  )?.$elemMatch;
  if (topicMatch) {
    // Dotted taxonomy predicates are intentionally a superset when multiple
    // values come from topics[]. buildPostMatch keeps the same-element
    // $elemMatch boundary after retrieval, so prefiltering improves recall
    // without weakening correctness.
    for (const [path, value] of Object.entries(topicMatch)) {
      filter[`topics.${path}`] = value;
    }
  }

  return filter;
}

export function buildRetrievePipeline(opts: RetrieveOptions): PipelineStage[] {
  if (!opts.queryVector || opts.queryVector.length === 0) {
    throw new Error("buildRetrievePipeline requires queryVector");
  }

  const topK = Math.max(1, opts.topK);
  const poolSize = opts.poolSize ?? Math.min(1000, Math.max(topK, topK * 10));
  const numCandidates = opts.numCandidates ?? Math.min(1000, Math.max(100, poolSize * 10));
  const postMatch = buildPostMatch(opts.filters);

  return [
    {
      $vectorSearch: {
        index: VECTOR_INDEX,
        path: "embedding",
        queryVector: opts.queryVector,
        numCandidates,
        limit: poolSize,
        filter: buildVectorFilter(opts),
      },
    },
    { $addFields: { score: { $meta: "vectorSearchScore" } } },
    ...(postMatch ? [{ $match: postMatch } as PipelineStage] : []),
    buildProjection(opts.projection ?? "search"),
    { $limit: topK },
  ];
}

function buildPostMatch(filters: RetrieveFilters | undefined): Record<string, unknown> | null {
  const f = filters ?? {};
  const m = buildPaperMetadataMatch(f, { includeActive: false });
  // Keep the full metadata predicate as the correctness boundary. The vector
  // filter is an optimization and may deliberately be a taxonomy superset.
  if (f.minScore && f.minScore > 0) m.score = { $gte: f.minScore };
  return Object.keys(m).length > 0 ? m : null;
}

function buildProjection(projection: RetrievalProjection): PipelineStage.Project {
  if (projection === "gap") {
    return {
      $project: {
        title: 1,
        abstractText: 1,
        aiAnalysis: 1,
        publicationYear: 1,
        journalName: 1,
        citationCount: 1,
        "authors.displayName": 1,
        score: 1,
      },
    };
  }
  if (projection === "report") {
    return {
      $project: {
        title: 1,
        abstractText: 1,
        publicationYear: 1,
        journalName: 1,
        citationCount: 1,
        "authors.displayName": 1,
        score: 1,
      },
    };
  }
  if (projection === "chat") {
    return {
      $project: {
        title: 1,
        abstractText: 1,
        publicationYear: 1,
        "authors.displayName": 1,
        score: 1,
      },
    };
  }
  return { $project: { embedding: 0, __v: 0 } };
}

export function toRetrievedPaper(d: Record<string, unknown>): RetrievedPaper {
  const paper: RetrievedPaper = {
    id: String(d._id),
    title: normalizeAcademicTitle(String(d.title ?? "")),
    abstractText: d.abstractText ? String(d.abstractText) : undefined,
    publicationYear: d.publicationYear as number | undefined,
    journalName: d.journalName ? String(d.journalName) : undefined,
    citationCount: d.citationCount as number | undefined,
    authorNames: ((d.authors ?? []) as Array<{ displayName?: string }>)
      .map((a) => a.displayName ?? "")
      .filter(Boolean),
    score: Number(d.score ?? 0),
  };
  if (d.aiAnalysis !== undefined) {
    paper.aiAnalysis = d.aiAnalysis as PaperStructuredAnalysis | null;
  }
  return paper;
}

export function toScoredPaper(d: Record<string, unknown>): ScoredPaper {
  const { _id, score, ...rest } = d;
  return {
    id: String(_id),
    score: Number(score),
    ...rest,
    title: normalizeAcademicTitle(rest.title as string | undefined),
  } as unknown as ScoredPaper;
}
