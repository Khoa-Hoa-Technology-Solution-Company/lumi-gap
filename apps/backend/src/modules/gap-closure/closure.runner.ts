import type { ClosureDocumentSource, ClosureFacetMatch, ClosureLabel, ClosureQueryLog, QuestionFacets } from "@trend/shared-types";
import { env } from "../../config/env.js";
import { hashKey } from "../../infrastructure/cache.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { creditService } from "../credits/credit.service.js";
import { LlmContentError } from "../llm/gemini.client.js";
import { cachedGenerateJSON } from "../llm/llm.run.js";
import { aiModel } from "../user-ai/user-ai.runtime.js";
import { Prisma } from "../../generated/prisma/client.js";
import { quoteAppearsIn, type GapClosureJob } from "./closure.rules.js";
import { buildClosureQueriesPrompt, buildClosureQueriesSystemPrompt, MAX_QUERY_CHARS, QUERIES_PROMPT_VERSION, sanitizeClosureQueries } from "./closure.queries.prompt.js";
import { buildScreeningPrompt, sanitizeScreeningOutput, SCREENING_BATCH_SIZE, SCREENING_PROMPT_VERSION, SCREENING_SYSTEM_PROMPT } from "./closure.screening.prompt.js";
import { mergeClosureDocuments, searchLocalForClosure, searchOpenAlexForClosure, type ClosureDocumentDraft } from "./closure.search.js";

/**
 * Runner of the Gap Closure Protocol (docs/superpowers/specs/2026-10-15-gap-closure-protocol-design.md §4):
 * logged search -> stored documents -> AI screening -> status SCREENING. It NEVER decides and never touches research_gaps.
 */

const ERROR_LOG_CHARS = 300;
const ERROR_MESSAGE_CHARS = 500;

/** Thrown when a run cannot succeed on retry; the worker turns it into BullMQ's UnrecoverableError. */
class ClosureRunError extends Error {
  readonly nonRetryable = true;
}
/** The check left SEARCHING while the run was working (failed by the sweep); stop without writing anything. */
class ClosureRunSupersededError extends Error {}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, ERROR_LOG_CHARS);

/**
 * Asks the LLM for queries; falls back to the question itself so the search still runs and stays logged.
 * Exported so read-only tools (scripts/gap-closure-retro-eval.ts) use exactly the production step.
 */
export async function proposeClosureQueries(question: string, facets: QuestionFacets, maxQueries: number): Promise<string[]> {
  try {
    const raw = await cachedGenerateJSON<{ queries?: unknown }>({
      task: "gap-closure-queries",
      promptVersion: QUERIES_PROMPT_VERSION,
      keyParts: { purpose: "gap-closure-queries", question: question.trim(), facets, maxQueries },
      model: aiModel("fast"),
      prompt: buildClosureQueriesPrompt(question, facets, maxQueries),
      validate: (candidate) => { if (!sanitizeClosureQueries(candidate, maxQueries).length) throw new LlmContentError("LLM returned no usable closure queries"); return candidate; },
      options: { system: buildClosureQueriesSystemPrompt(maxQueries), temperature: 0.2, maxOutputTokens: 512 },
    });
    const queries = sanitizeClosureQueries(raw, maxQueries);
    if (queries.length) return queries;
  } catch (error) {
    logger.warn({ err: error }, "closure query proposal failed; searching with the question text");
  }
  return sanitizeClosureQueries([question.slice(0, MAX_QUERY_CHARS)], 1);
}

async function runSearches(check: { id: string; yearFrom: number | null; yearTo: number | null }, queries: string[]) {
  const logs: ClosureQueryLog[] = [];
  const lists: ClosureDocumentDraft[][] = [];
  const sources: ClosureDocumentSource[] = env.GAP_CLOSURE_OPENALEX_PER_QUERY > 0 ? ["LOCAL", "OPENALEX"] : ["LOCAL"];
  for (const query of queries) {
    for (const source of sources) {
      // queryIndex is the position of this search in the log, so a document can point back to its query and source.
      const queryIndex = logs.length;
      const params = { query, queryIndex, yearFrom: check.yearFrom ?? undefined, yearTo: check.yearTo ?? undefined };
      const executedAt = new Date().toISOString();
      try {
        const drafts = source === "LOCAL" ? await searchLocalForClosure(params) : await searchOpenAlexForClosure(params);
        logs.push({ source, query, executedAt, resultCount: drafts.length });
        lists.push(drafts);
      } catch (error) {
        // Never an empty result: the error is logged on the check and the decision abstains.
        logger.warn({ err: error, checkId: check.id, source }, "closure search failed");
        logs.push({ source, query, executedAt, resultCount: 0, error: errorText(error) });
      }
    }
    await getPrisma().gapClosureCheck.updateMany({ where: { id: check.id, status: "SEARCHING" }, data: { queries: logs as unknown as Prisma.InputJsonValue } });
  }
  return { logs, drafts: mergeClosureDocuments(lists) };
}

async function storeDocuments(checkId: string, logs: ClosureQueryLog[], drafts: ClosureDocumentDraft[]) {
  await getPrisma().$transaction(async (db) => {
    const still = await db.gapClosureCheck.updateMany({ where: { id: checkId, status: "SEARCHING" }, data: { queries: logs as unknown as Prisma.InputJsonValue } });
    if (!still.count) throw new ClosureRunSupersededError();
    // A retried run starts from scratch: nothing can have been reviewed while the check is still SEARCHING.
    await db.gapClosureDocument.deleteMany({ where: { checkId } });
    if (drafts.length) {
      await db.gapClosureDocument.createMany({
        data: drafts.map((draft) => ({
          checkId, dedupeKey: draft.dedupeKey, paperId: draft.paperId, openalexId: draft.openalexId, doi: draft.doi, title: draft.title,
          abstractText: draft.abstractText, publicationYear: draft.publicationYear, retrievedFrom: draft.retrievedFrom, queryIndex: draft.queryIndex, rank: draft.rank,
        })),
        skipDuplicates: true,
      });
    }
  });
}

/** What the screening step needs to read of a document; stored rows and unsaved drafts both fit. */
export interface ScreeningInputDoc { dedupeKey: string; title: string; abstractText?: string | null; publicationYear?: number | null }
interface ScreeningBatchDoc extends ScreeningInputDoc { id: string }

/** The AI verdict for one document, with its quote already checked against the document text. */
export interface ClosureScreeningResult {
  /** null = no usable verdict (UNSURE, malformed output or a failed batch): a person must read the document. Never UNRELATED by default. */
  aiLabel: ClosureLabel | null;
  aiQuote: string | null;
  aiFacets: ClosureFacetMatch | null;
  /** True only for ANSWERS/PARTIAL whose quote appears verbatim in the title or abstract. */
  aiQuoteVerified: boolean;
  limitationStatement: boolean;
  /** True when the LLM call for this document's batch failed (every document of the batch is then unlabelled). */
  batchFailed: boolean;
}

const unlabelled = (batchFailed: boolean): ClosureScreeningResult => ({ aiLabel: null, aiQuote: null, aiFacets: null, aiQuoteVerified: false, limitationStatement: false, batchFailed });

/**
 * Screens one batch (at most SCREENING_BATCH_SIZE documents) and returns one result per document, in order.
 * A failed batch is left unlabelled (a person reviews it): nothing is ever recorded as UNRELATED by default.
 */
async function screenClosureBatch(question: string, facets: QuestionFacets, batch: ScreeningInputDoc[], logContext: Record<string, unknown> = {}): Promise<ClosureScreeningResult[]> {
  const prompt = buildScreeningPrompt(question, facets, batch);
  let raw: unknown;
  try {
    raw = await cachedGenerateJSON<unknown>({
      task: "gap-closure-screen",
      promptVersion: SCREENING_PROMPT_VERSION,
      // checkId is deliberately absent: identical question + documents hit the cache.
      keyParts: { purpose: "gap-closure-screen", question: question.trim(), facets, documents: batch.map((doc) => ({ key: doc.dedupeKey, content: hashKey({ title: doc.title, abstract: doc.abstractText, year: doc.publicationYear }) })) },
      model: aiModel("fast"),
      prompt,
      validate: (candidate) => { if (!candidate || typeof candidate !== "object" || !Array.isArray((candidate as { results?: unknown }).results)) throw new LlmContentError("LLM returned no screening results"); return candidate; },
      options: { system: SCREENING_SYSTEM_PROMPT, temperature: 0.1, maxOutputTokens: 2048 },
    });
  } catch (error) {
    logger.warn({ err: error, ...logContext, documents: batch.length }, "closure screening batch failed; documents left for a person to review");
    return batch.map(() => unlabelled(true));
  }
  const verdicts = sanitizeScreeningOutput(raw, batch.length, facets);
  return batch.map((doc, index) => {
    const verdict = verdicts[index];
    if (!verdict) return unlabelled(false);
    const verified = verdict.label !== "UNRELATED" && quoteAppearsIn(verdict.quote, [doc.title, doc.abstractText ?? ""].join("\n"));
    return { aiLabel: verdict.label, aiQuote: verdict.quote, aiFacets: verdict.facets, aiQuoteVerified: verified, limitationStatement: verified && verdict.limitationStatement, batchFailed: false };
  });
}

/**
 * Screens documents against a question with the production prompt, batches and cache keys, WITHOUT storing anything.
 * Returns one result per input document, in the same order. Exported for read-only tools (the retrospective experiment).
 */
export async function screenClosureDocuments(question: string, facets: QuestionFacets, drafts: ScreeningInputDoc[]): Promise<ClosureScreeningResult[]> {
  // Stored rows carry null (not undefined) for missing fields; normalising keeps the cache keys identical to a real check.
  const docs: ScreeningInputDoc[] = drafts.map((draft) => ({ dedupeKey: draft.dedupeKey, title: draft.title, abstractText: draft.abstractText ?? null, publicationYear: draft.publicationYear ?? null }));
  const results: ClosureScreeningResult[] = [];
  for (let start = 0; start < docs.length; start += SCREENING_BATCH_SIZE) {
    results.push(...await screenClosureBatch(question, facets, docs.slice(start, start + SCREENING_BATCH_SIZE)));
  }
  return results;
}

/** Screens one batch and stores the verdicts. Returns how many documents got a label. */
async function screenBatch(checkId: string, question: string, facets: QuestionFacets, batch: ScreeningBatchDoc[]): Promise<number> {
  const results = await screenClosureBatch(question, facets, batch, { checkId });
  let labelled = 0;
  for (const [index, result] of results.entries()) {
    const doc = batch[index];
    if (!result.aiLabel || !doc) continue;
    await getPrisma().gapClosureDocument.update({
      where: { id: doc.id },
      data: {
        aiLabel: result.aiLabel,
        aiQuote: result.aiQuote,
        aiFacets: result.aiFacets ?? Prisma.DbNull,
        aiQuoteVerified: result.aiQuoteVerified,
        limitationStatement: result.limitationStatement,
      },
    });
    labelled += 1;
  }
  return labelled;
}

/**
 * One closure check, claimed atomically. Throws on a failure that BullMQ should retry; the worker marks the check
 * FAILED (with a refund) once retries are exhausted.
 */
export async function runGapClosureCheck(job: GapClosureJob): Promise<void> {
  const prisma = getPrisma();
  const check = await prisma.gapClosureCheck.findUnique({ where: { id: job.checkId } });
  if (!check) { logger.warn({ checkId: job.checkId }, "gap closure check vanished before processing"); return; }
  const claimed = await prisma.gapClosureCheck.updateMany({ where: { id: check.id, status: { in: ["QUEUED", "SEARCHING"] } }, data: { status: "SEARCHING" } });
  if (!claimed.count) { logger.info({ checkId: check.id, status: check.status }, "gap closure check no longer pending; skipping job"); return; }

  try {
    const facets = (check.facets ?? {}) as QuestionFacets;
    let queries = sanitizeClosureQueries(job.queries ?? [], env.GAP_CLOSURE_MAX_QUERIES);
    if (!queries.length) queries = await proposeClosureQueries(check.question, facets, env.GAP_CLOSURE_MAX_QUERIES);
    if (!queries.length) throw new ClosureRunError("The question is too short to build a search query from.");

    const { logs, drafts } = await runSearches(check, queries);
    await storeDocuments(check.id, logs, drafts);

    const documents = await prisma.gapClosureDocument.findMany({
      where: { checkId: check.id },
      orderBy: [{ queryIndex: "asc" }, { rank: "asc" }],
      select: { id: true, dedupeKey: true, title: true, abstractText: true, publicationYear: true },
    });
    let labelled = 0;
    for (let start = 0; start < documents.length; start += SCREENING_BATCH_SIZE) {
      labelled += await screenBatch(check.id, check.question, facets, documents.slice(start, start + SCREENING_BATCH_SIZE));
    }

    const done = await prisma.gapClosureCheck.updateMany({ where: { id: check.id, status: "SEARCHING" }, data: { status: "SCREENING" } });
    if (!done.count) throw new ClosureRunSupersededError();
    logger.info({ checkId: check.id, queries: logs.length, searchErrors: logs.filter((log) => log.error).length, documents: documents.length, labelled }, "gap closure check ready for review");
  } catch (error) {
    if (error instanceof ClosureRunSupersededError) { logger.warn({ checkId: check.id }, "gap closure check was failed while running; result discarded"); return; }
    throw error;
  }
}

/**
 * Fails a check that has not reached review (QUEUED or SEARCHING) and refunds its credits once. The refund only
 * follows a successful claim to FAILED, so repeated calls (retries, sweep + worker) refund at most once.
 */
export async function markClosureCheckFailed(checkId: string, message: string): Promise<void> {
  const prisma = getPrisma();
  const check = await prisma.gapClosureCheck.findUnique({ where: { id: checkId }, select: { id: true, creditTransactionId: true } });
  if (!check) return;
  const claimed = await prisma.gapClosureCheck.updateMany({ where: { id: check.id, status: { in: ["QUEUED", "SEARCHING"] } }, data: { status: "FAILED", errorMessage: message.slice(0, ERROR_MESSAGE_CHARS) } });
  if (!claimed.count || !check.creditTransactionId) return;
  try {
    await creditService.refundCreditsOnce({ transactionId: check.creditTransactionId, reason: `Gap closure check failed: ${message.slice(0, 100)}` });
  } catch (error) {
    logger.error({ err: error, checkId }, "refund after a failed gap closure check failed");
  }
}
