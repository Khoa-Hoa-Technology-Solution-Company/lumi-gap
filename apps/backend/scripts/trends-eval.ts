/**
 * Read-only report to pick the lifecycle thresholds of the trend verdict
 * (spec docs/superpowers/specs/2026-11-14-trend-eda-lifecycle-design.md §5.4):
 *   FLAT_PCT   saturated needs |r_R| below it (% per year over the recent window)
 *   NEAR_PEAK  saturated needs peakRatio at or above it
 *   PAST_PEAK  past_peak needs peakRatio below it
 * It tests every topic of the IT scope over the full window, prints the
 * distribution of r_R and peakRatio among the topics whose share rises
 * significantly, how many would be "saturated" for a grid of thresholds, and
 * the topics of each state with the chosen pair. Read the names: pick the pair
 * where the saturated list holds topics you know have levelled off.
 *
 * Every count is an OpenAlex aggregate, cached in Redis for 7 days: a first run
 * spends about one request per topic, a second run none.
 *
 * It also reports (spec §7) the cross-topic analysis of the chosen thresholds
 * (size bands, Tukey fences, "clear" topics) and the emerging keyword signals:
 * how many keywords pass for a grid of NOVELTY_SHARE × EMERGING_MIN_PAPERS,
 * and the keywords close to the novelty threshold.
 *
 * Run: pnpm --filter backend eval:trends
 *      pnpm --filter backend eval:trends --flat 3 --near-peak 0.8 --past-peak 0.5 --window 15
 *      pnpm --filter backend eval:trends --novelty 0.7 --min-recent 20
 */
import { disconnectRedis } from "../src/infrastructure/redis.js";
import { IT_SCOPE, IT_SCOPE_APPLICATION_TOPICS, IT_SCOPE_VERSION, itScopeTopics, itScopeYearCounts, topicYearCounts } from "../src/modules/trends/trend.scope.js";
import { benjaminiHochberg } from "../src/modules/trends/trend.statistics.js";
import type { TrendVerdict } from "@trend/shared-types";
import { analyseCrossTopics } from "../src/modules/trends/trend.cross-topic.js";
import { EMERGING_CANDIDATES, EMERGING_MIN_PAPERS, EMERGING_THRESHOLDS, NOVELTY_SHARE, emergingPeriods, selectEmerging } from "../src/modules/trends/trend.emerging.js";
import { openAlexKeywordCounts } from "../src/modules/trends/trend.evidence.js";
import { openAlexYearCounts } from "../src/modules/trends/trend.openalex-client.js";
import { KEYWORD_SCOPE_CLAUSE } from "../src/modules/trends/trend.openalex-overview.js";
import { withScope, yearsClause } from "../src/modules/trends/trend.openalex-scope.js";
import { FLAT_PCT, FULL_WINDOW_YEARS, NEAR_PEAK, PAST_PEAK, RECENT_WINDOW_YEARS, SIGNIFICANCE_LEVEL, classifyTrend, shareTrendStatistics, type ShareYear } from "../src/modules/trends/trend.verdict.js";

const FLAT_GRID = [1, 2, 3, 5, 8];
const NEAR_PEAK_GRID = [0.7, 0.75, 0.8, 0.85, 0.9, 0.95];
const LIST_LIMIT = 40;
const NOVELTY_GRID = [0.6, 0.65, 0.7, 0.75, 0.8, 0.9];
const MIN_RECENT_GRID = [10, 20, 50, 100, 500];

function numberArg(argv: string[], name: string, fallback: number): number {
  const index = argv.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(argv[index + 1]);
  if (!Number.isFinite(value)) throw new Error(`${name} needs a number`);
  return value;
}

/** Linear-interpolated quantile of an ascending array. */
function quantile(sorted: number[], p: number): number {
  const position = (sorted.length - 1) * p;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low]! + (sorted[high]! - sorted[low]!) * (position - low);
}

function distribution(label: string, values: number[]): string {
  if (values.length === 0) return `  ${label}: no values`;
  const sorted = [...values].sort((a, b) => a - b);
  const points = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1].map((p) => quantile(sorted, p).toFixed(2));
  return `  ${label} (n=${sorted.length})  min ${points[0]} | p10 ${points[1]} | p25 ${points[2]} | median ${points[3]} | p75 ${points[4]} | p90 ${points[5]} | max ${points[6]}`;
}

const fmt = (value: number | null, digits = 2) => (value === null ? "   n/a" : value.toFixed(digits).padStart(6));

async function main(): Promise<void> {
  const log = console.log;
  const argv = process.argv.slice(2);
  const flat = numberArg(argv, "--flat", FLAT_PCT);
  const nearPeak = numberArg(argv, "--near-peak", NEAR_PEAK);
  const pastPeak = numberArg(argv, "--past-peak", PAST_PEAK);
  const windowYears = numberArg(argv, "--window", FULL_WINDOW_YEARS);
  const lastCompleteYear = new Date().getUTCFullYear() - 1;
  const firstYear = lastCompleteYear - windowYears + 1;

  const startedAt = Date.now();
  const topics = await itScopeTopics();
  const [population, series] = await Promise.all([itScopeYearCounts(), topicYearCounts(topics.map((topic) => topic.id))]);
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  const rows = topics.map((topic, index) => {
    const counts = series[index]!;
    const shares: ShareYear[] = [];
    for (let year = firstYear; year <= lastCompleteYear; year++) {
      const total = population.get(year) ?? 0;
      if (total <= 0) continue;
      const count = counts.get(year) ?? 0;
      shares.push({ year, count, sharePct: (count / total) * 100 });
    }
    const stats = shareTrendStatistics(shares);
    return { topic, stats, plateau: { recentRelativeChangePct: stats.recentRelativeChangePct, peakRatio: stats.peakRatio } };
  });
  const qValues = benjaminiHochberg(rows.map((row) => row.stats.mannKendall?.pValue ?? null));

  /** The verdict of trend.verdict.ts with the given thresholds (q-values across every topic of the scope). */
  const classify = (index: number, flatPct: number, peak: number): TrendVerdict =>
    classifyTrend({ ...rows[index]!.stats, source: "openalex", qValue: qValues[index] ?? null }, { flatPct, nearPeak: peak, pastPeak }).verdict;

  log(`scope ${IT_SCOPE_VERSION}: ${IT_SCOPE.length} subfields + ${IT_SCOPE_APPLICATION_TOPICS.length} layer-3 topics, ${topics.length} topics`);
  log(`window W = ${firstYear}-${lastCompleteYear} (${windowYears} years), recent window R = last ${RECENT_WINDOW_YEARS} years`);
  log(`fetched in ${seconds}s: ${topics.length} topic series + population + topic lists (cached requests cost nothing)`);
  log(`population N_t: ${[...population].filter(([year]) => year >= firstYear && year <= lastCompleteYear).sort((a, b) => a[0] - b[0]).map(([year, count]) => `${year}: ${count}`).join(", ")}\n`);

  // FLAT_PCT = 0 leaves no topic saturated: every significant increase is then rising or past_peak.
  const increasing = rows.filter((_row, index) => ["rising", "past_peak"].includes(classify(index, 0, 1)));
  log(`topics with a significant increase (q < ${SIGNIFICANCE_LEVEL}, S > 0): ${increasing.length}`);
  log(distribution("r_R, % per year", increasing.flatMap((row) => (row.plateau.recentRelativeChangePct === null ? [] : [row.plateau.recentRelativeChangePct]))));
  log(distribution("peakRatio      ", increasing.flatMap((row) => (row.plateau.peakRatio === null ? [] : [row.plateau.peakRatio]))));

  log("\nsaturated topics by threshold pair (rows FLAT_PCT, columns NEAR_PEAK):");
  log(`  ${"".padStart(6)}${NEAR_PEAK_GRID.map((peak) => String(peak).padStart(6)).join("")}`);
  for (const flatPct of FLAT_GRID) {
    const cells = NEAR_PEAK_GRID.map((peak) => String(rows.filter((_row, index) => classify(index, flatPct, peak) === "saturated").length).padStart(6));
    log(`  ${String(flatPct).padStart(6)}${cells.join("")}`);
  }

  const states = rows.map((_row, index) => classify(index, flat, nearPeak));
  log(`\nwith FLAT_PCT = ${flat}, NEAR_PEAK = ${nearPeak}, PAST_PEAK = ${pastPeak}:`);
  for (const state of ["rising", "saturated", "past_peak", "declining", "stable", "insufficient"] as const) {
    const members = rows
      .map((row, index) => ({ row, q: qValues[index] ?? null, state: states[index]! }))
      .filter((entry) => entry.state === state)
      .sort((a, b) => (state === "declining" ? (a.row.stats.relativeChangePct ?? 0) - (b.row.stats.relativeChangePct ?? 0) : state === "rising" || state === "saturated" ? (b.row.stats.relativeChangePct ?? 0) - (a.row.stats.relativeChangePct ?? 0) : b.row.stats.totalPapers - a.row.stats.totalPapers));
    log(`\n=== ${state}: ${members.length}`);
    if (members.length) log(`  ${"r_W %/y".padStart(8)} ${"r_R %/y".padStart(8)} ${"peak".padStart(6)} ${"q".padStart(7)} ${"papers".padStart(9)}  topic`);
    for (const { row, q } of members.slice(0, LIST_LIMIT)) {
      log(`  ${fmt(row.stats.relativeChangePct).padStart(8)} ${fmt(row.plateau.recentRelativeChangePct).padStart(8)} ${fmt(row.plateau.peakRatio)} ${fmt(q, 4).padStart(7)} ${String(row.stats.totalPapers).padStart(9)}  ${row.topic.name} [${row.topic.taxonomy.subfieldName ?? "?"}]`);
    }
    if (members.length > LIST_LIMIT) log(`  ... ${members.length - LIST_LIMIT} more`);
  }

  // ---- cross-topic analysis (§7.1) with the chosen thresholds
  const cross = analyseCrossTopics(
    rows.map((row, index) => ({
      topic: row.topic.name,
      totalPapers: row.stats.totalPapers,
      classification: classifyTrend({ ...row.stats, source: "openalex", qValue: qValues[index] ?? null }, { flatPct: flat, nearPeak, pastPeak }),
    })),
  );
  if (cross) {
    const { analysis } = cross;
    log(`
=== cross-topic: ${analysis.population} topics with r; bands small <= ${Math.round(analysis.bandCutoffs.smallMax)} < medium <= ${Math.round(analysis.bandCutoffs.mediumMax)} < large papers`);
    for (const band of ["small", "medium", "large"] as const) {
      const fence = analysis.fences[band];
      const members = analysis.points.filter((point) => point.sizeBand === band);
      log(`  ${band.padEnd(6)} n=${members.length}  fences ${fence ? `[${fence.lower.toFixed(1)}, ${fence.upper.toFixed(1)}]` : "n/a"}  anomalous ${members.filter((point) => point.outlier).length}  clear ${members.filter((point) => point.clear).length}`);
    }
  }

  // ---- emerging keyword signals (§7.3)
  const novelty = numberArg(argv, "--novelty", NOVELTY_SHARE);
  const minRecent = numberArg(argv, "--min-recent", EMERGING_MIN_PAPERS);
  const { earlier, recent } = emergingPeriods(lastCompleteYear);
  const totals = await openAlexYearCounts(withScope(KEYWORD_SCOPE_CLAUSE, yearsClause(earlier[0]!, lastCompleteYear)));
  const sum = (years: number[]) => years.reduce((total, year) => total + (totals.get(year) ?? 0), 0);
  const keywordRows = await openAlexKeywordCounts(KEYWORD_SCOPE_CLAUSE, earlier, recent, { a: 0, b: EMERGING_CANDIDATES });
  const totalEarlier = sum(earlier);
  const totalRecent = sum(recent);
  log(`
=== emerging: E = ${earlier[0]}-${earlier.at(-1)} (${totalEarlier} papers), R = ${recent[0]}-${recent.at(-1)} (${totalRecent} papers), ${keywordRows.length} candidate keywords (top ${EMERGING_CANDIDATES} of R, ${KEYWORD_SCOPE_CLAUSE})`);
  log(distribution("papers in R of the candidates", keywordRows.map((row) => row.papersB)));
  log("signals by threshold pair (rows EMERGING_MIN_PAPERS, columns NOVELTY_SHARE):");
  log(`  ${"".padStart(6)}${NOVELTY_GRID.map((value) => String(value).padStart(6)).join("")}`);
  for (const min of MIN_RECENT_GRID) {
    const cells = NOVELTY_GRID.map((share) => String(selectEmerging(keywordRows, totalEarlier, totalRecent, { ...EMERGING_THRESHOLDS, minRecentPapers: min, noveltyShare: share }).keywords.length).padStart(6));
    log(`  ${String(min).padStart(6)}${cells.join("")}`);
  }
  const loose = selectEmerging(keywordRows, totalEarlier, totalRecent, { ...EMERGING_THRESHOLDS, minRecentPapers: 0, noveltyShare: 0 }).keywords;
  const chosen = new Set(selectEmerging(keywordRows, totalEarlier, totalRecent, { ...EMERGING_THRESHOLDS, minRecentPapers: minRecent, noveltyShare: novelty }).keywords.map((keyword) => keyword.term));
  log(`
keywords rising significantly with novelty 0.55-0.85 (* = signal with NOVELTY_SHARE ${novelty}, EMERGING_MIN_PAPERS ${minRecent}):`);
  log(`  ${"novelty".padStart(8)} ${"E".padStart(7)} ${"R".padStart(7)} ${"LOR".padStart(6)}  keyword`);
  for (const keyword of loose.filter((item) => item.noveltyShare >= 0.55 && item.noveltyShare <= 0.85).sort((a, b) => b.noveltyShare - a.noveltyShare)) {
    log(`  ${(keyword.noveltyShare * 100).toFixed(1).padStart(7)}% ${String(keyword.papersA).padStart(7)} ${String(keyword.papersB).padStart(7)} ${keyword.logOddsRatio.toFixed(2).padStart(6)}  ${chosen.has(keyword.term) ? "*" : " "} ${keyword.term}`);
  }

  await disconnectRedis().catch(() => undefined);
  process.exit(0);
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.message : err);
  await disconnectRedis().catch(() => undefined);
  process.exit(1);
});
