/**
 * The gap pipeline's view of the whole literature (OpenAlex), beyond the local corpus.
 *
 * A gap derived from a thin corpus is often an artifact: the LLM read 10 local papers, none combined A and B, so it
 * called A x B a gap, while OpenAlex holds hundreds of such papers. This module
 *   - measures how much of a topic's most relevant OpenAlex literature the corpus already holds (coverage),
 *   - ingests the missing works on request (worker only: it writes papers), and
 *   - finds OpenAlex works that may already answer a generated gap and ingests them, so they can be linked as
 *     possible counter-evidence instead of being discovered only by a later closure check.
 * Every OpenAlex call is best-effort: a failure returns nothing and the pipeline carries on.
 */
import type { GapCorpusCoverage, GapProbe } from "@trend/shared-types";
import { env } from "../../config/env.js";
import { cache, hashKey } from "../../infrastructure/cache.js";
import { getPrisma } from "../../infrastructure/database/prisma.js";
import { logger } from "../../infrastructure/logger.js";
import { embeddingQueue } from "../../infrastructure/queue.js";
import { searchOpenAlexWorksForClosure } from "../api-sync/providers/openalex.client.js";
import { normalizeOpenAlexWork } from "../api-sync/providers/openalex.normalizer.js";
import type { OpenAlexWork } from "../api-sync/providers/openalex.types.js";
import { ingestOpenAlexWorks } from "../api-sync/sync.service.js";
import { probeAppearsIn } from "./gap-probe-query.js";

/** Search results are stable for a day; caching keeps a preview and the enrichment job on the same list. */
const SEARCH_CACHE_TTL_SECONDS = 24 * 60 * 60;
const openAlexId = (work: OpenAlexWork) => (work.id ?? "").replace("https://openalex.org/", "");

/** Top OpenAlex works for a query (relevance order), cached. Throws on failure; callers decide. */
async function searchWorks(query: string, perPage: number): Promise<OpenAlexWork[]> {
  const key = `gap:openalex-search:v1:${hashKey({ query: query.trim().toLowerCase(), perPage })}`;
  const cached = await cache.get<OpenAlexWork[]>(key);
  if (cached) return cached;
  const works = await searchOpenAlexWorksForClosure({ query: query.slice(0, 300), perPage });
  await cache.set(key, works, SEARCH_CACHE_TTL_SECONDS);
  return works;
}

/** Local active papers among the given OpenAlex ids (as stored: "W123"). */
async function presentInCorpus(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const rows = await getPrisma().paper.findMany({ where: { openalexId: { in: ids }, dataStatus: "active" }, select: { openalexId: true } });
  return new Set(rows.flatMap((row) => (row.openalexId ? [row.openalexId] : [])));
}

/**
 * How many of the topic's GAP_COVERAGE_TOP_WORKS most relevant OpenAlex works the corpus holds. Null when disabled or
 * OpenAlex fails. A low share means a gap found here may only reflect what the corpus is missing.
 */
export async function measureTopicCoverage(topic: string): Promise<GapCorpusCoverage | null> {
  if (!env.GAP_COVERAGE_TOP_WORKS) return null;
  let timer: NodeJS.Timeout | undefined;
  try {
    // Runs inside the preview request, so it gets the same short timeout as the OpenAlex probe counts.
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("OpenAlex coverage timed out")), env.GAP_GLOBAL_EVIDENCE_TIMEOUT_MS); });
    const works = (await Promise.race([searchWorks(topic, env.GAP_COVERAGE_TOP_WORKS), timeout])).filter((work) => openAlexId(work));
    if (!works.length) return null;
    const present = await presentInCorpus(works.map(openAlexId));
    return { checked: works.length, present: present.size, low: present.size / works.length < env.GAP_COVERAGE_MIN_SHARE };
  } catch (error) {
    logger.warn({ err: error, topic }, "OpenAlex coverage check unavailable");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Ingests works into the corpus and queues their embeddings. Returns internal ids of the active papers, by OpenAlex id. */
async function ingestWorks(works: OpenAlexWork[]): Promise<Map<string, string>> {
  if (!works.length) return new Map();
  const provider = await getPrisma().apiProvider.findUnique({ where: { providerName: "openalex" } });
  if (!provider) { logger.warn("openalex provider not seeded; cannot ingest gap literature"); return new Map(); }
  const result = await ingestOpenAlexWorks(works, provider.id);
  if (result.insertedCount) await embeddingQueue.add("manual-embedding", {}).catch((error) => logger.warn({ err: error }, "could not queue embeddings for ingested gap literature"));
  return new Map(result.records.filter((row) => row.paper?.dataStatus === "active").map((row) => [openAlexId(row.work), String(row.paper.id)]));
}

/** Worker job: ingest the topic's relevant OpenAlex works that the corpus is missing. Returns how many were added. */
export async function enrichCorpusForTopic(topic: string): Promise<{ checked: number; added: number }> {
  const works = (await searchWorks(topic, env.GAP_COVERAGE_TOP_WORKS || 25)).filter((work) => openAlexId(work));
  const present = await presentInCorpus(works.map(openAlexId));
  const missing = works.filter((work) => !present.has(openAlexId(work)));
  const added = await ingestWorks(missing);
  logger.info({ topic, checked: works.length, added: added.size }, "gap corpus enriched from OpenAlex");
  return { checked: works.length, added: added.size };
}

/**
 * OpenAlex works that may already answer a gap: the top GAP_COUNTER_OPENALEX_PER_GAP results for its research
 * question that mention BOTH probe topics in title or abstract (the intersection the gap calls empty). They are
 * ingested so they can be linked like corpus papers. Without a grounded probe there is no test, so nothing is returned.
 */
export async function findOpenAlexCounterPapers(query: string, probe: GapProbe | undefined, excludeIds: string[]): Promise<string[]> {
  if (!env.GAP_COUNTER_OPENALEX_PER_GAP || !probe?.topicA || !probe?.topicB || query.trim().length < 3) return [];
  try {
    const works = await searchWorks(query, env.GAP_COUNTER_OPENALEX_PER_GAP * 2);
    const onIntersection = works.filter((work) => {
      const paper = normalizeOpenAlexWork(work), text = [`${paper.title} ${paper.abstractText ?? ""}`];
      return openAlexId(work) && probeAppearsIn(probe.topicA, text) && probeAppearsIn(probe.topicB, text);
    }).slice(0, env.GAP_COUNTER_OPENALEX_PER_GAP);
    const ids = await ingestWorks(onIntersection);
    const excluded = new Set(excludeIds);
    return onIntersection.flatMap((work) => { const id = ids.get(openAlexId(work)); return id && !excluded.has(id) ? [id] : []; });
  } catch (error) {
    logger.warn({ err: error, query }, "OpenAlex counter-evidence search unavailable");
    return [];
  }
}
