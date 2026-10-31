/**
 * Read-only before/after report for query understanding in GET /search (step 4 of the taxonomy plan).
 * Each query runs through searchService.semantic twice: autoTags off (old behaviour) and on (resolve the
 * query to a topic/keyword, then hard-filter or boost). For both it prints the median latency and the
 * on-topic rate: the share of the top 10 papers that carry the tag the query was resolved to.
 * Query embeddings are cached in Redis, so after the warm-up run the latency is the search itself.
 *
 * Run: pnpm --filter backend eval:search-tags
 *      pnpm --filter backend eval:search-tags "topic modeling" "chatgpt" --runs 5
 *      pnpm --filter backend eval:search-tags --file queries.txt
 */
import { readFileSync } from "node:fs";
import type { DetectedTag, ScoredPaper, SearchUnderstanding } from "@trend/shared-types";
import { env } from "../src/config/env.js";
import { disconnectRedis } from "../src/infrastructure/redis.js";
import { connectPostgres, disconnectPostgres } from "../src/infrastructure/database/prisma.js";
import { searchService } from "../src/modules/search/search.service.js";
import { paperCarriesTag } from "../src/modules/search/search.taxonomy.js";

const DEFAULT_QUERIES = [
  "topic modeling",
  "chatgpt",
  "large language models",
  "retrieval augmented generation",
  "federated learning",
  "prompt engineering",
  "clinical decision support",
  "intelligent tutoring systems",
  "AI in medical education",
  "algorithmic bias in hiring",
];
const TOP_K = 10;

interface RunResult { ms: number; papers: ScoredPaper[]; total: number; understanding: SearchUnderstanding }

function parseArgs(argv: string[]): { queries: string[]; runs: number } {
  let runs = 3;
  const queries: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--runs") runs = Math.max(1, Number(argv[(i += 1)]) || 3);
    else if (arg === "--file") {
      const path = argv[(i += 1)];
      if (!path) throw new Error("--file needs a path");
      queries.push(...readFileSync(path, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
    } else if (arg.trim()) queries.push(arg.trim());
  }
  return { queries: queries.length ? queries : DEFAULT_QUERIES, runs };
}

async function runOnce(q: string, autoTags: boolean): Promise<RunResult> {
  const started = performance.now();
  const result = await searchService.semantic({ q, page: 1, pageSize: TOP_K, autoTags });
  return { ms: performance.now() - started, papers: result.papers, total: result.total, understanding: result.understanding };
}

async function measure(q: string, autoTags: boolean, runs: number): Promise<RunResult> {
  await runOnce(q, autoTags); // warm-up: query embedding, dictionary, resolver cache
  const results: RunResult[] = [];
  for (let i = 0; i < runs; i += 1) results.push(await runOnce(q, autoTags));
  const sorted = [...results].sort((a, b) => a.ms - b.ms);
  return { ...results[results.length - 1]!, ms: sorted[Math.floor(sorted.length / 2)]!.ms };
}

function onTopicRate(papers: ScoredPaper[], tag: DetectedTag | undefined): number | null {
  if (!tag || papers.length === 0) return null;
  return papers.filter((paper) => paperCarriesTag(paper, tag)).length / papers.length;
}

const pct = (value: number | null) => (value === null ? "-" : `${Math.round(value * 100)}%`);
const ms = (value: number) => `${Math.round(value)} ms`;
const mean = (values: number[]) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0);

async function main(): Promise<void> {
  const { queries, runs } = parseArgs(process.argv.slice(2));
  await connectPostgres();
  console.log(`runs per mode: ${runs} (median), top ${TOP_K}; filter needs confidence >= ${env.SEARCH_TAG_FILTER_MIN_CONFIDENCE}, `
    + `>= ${env.SEARCH_TAG_FILTER_MIN_PAPERS} papers, <= ${env.SEARCH_TAG_FILTER_MAX_SHARE * 100}% of the corpus\n`);

  const rows: Array<Record<string, string | number>> = [];
  const filtered: Array<{ before: number; after: number; msBefore: number; msAfter: number }> = [];
  for (const q of queries) {
    const before = await measure(q, false, runs);
    const after = await measure(q, true, runs);
    const { understanding } = after;
    const tag = understanding.appliedTag ?? understanding.detectedTags[0];
    const rateBefore = onTopicRate(before.papers, tag);
    const rateAfter = onTopicRate(after.papers, tag);
    if (understanding.mode === "filter" && rateBefore !== null && rateAfter !== null) {
      filtered.push({ before: rateBefore, after: rateAfter, msBefore: before.ms, msAfter: after.ms });
    }
    rows.push({
      query: q,
      mode: understanding.mode + (understanding.fellBack ? " (fell back)" : ""),
      tag: tag ? `${tag.kind}: ${tag.name} (${tag.paperCount}, ${tag.confidence})` : "-",
      "on-topic before": pct(rateBefore),
      "on-topic after": pct(rateAfter),
      "latency before": ms(before.ms),
      "latency after": ms(after.ms),
      "pool before": before.total,
      "pool after": after.total,
    });
  }
  console.table(rows);

  if (filtered.length) {
    console.log(`\nfilter-mode queries (${filtered.length}): on-topic top ${TOP_K} `
      + `${pct(mean(filtered.map((r) => r.before)))} -> ${pct(mean(filtered.map((r) => r.after)))}, `
      + `latency ${ms(mean(filtered.map((r) => r.msBefore)))} -> ${ms(mean(filtered.map((r) => r.msAfter)))}`);
  }
  await closeConnections();
  process.exit(0);
}

// Embeddings go through the Redis-backed cache, which opens an ioredis connection that keeps the process alive.
async function closeConnections(): Promise<void> {
  await disconnectPostgres().catch(() => undefined);
  await disconnectRedis().catch(() => undefined);
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await closeConnections();
  process.exit(1);
});
