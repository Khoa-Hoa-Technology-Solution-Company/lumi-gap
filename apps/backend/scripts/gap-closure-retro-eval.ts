/**
 * Retrospective experiment: freeze the literature at a cutoff year T and compare the OLD count rule with the
 * Gap Closure Protocol (GCP). Design, procedure and threats to validity: docs/gap-closure-retro-evaluation.md.
 *
 * READ-ONLY: this script never writes to PostgreSQL (it only runs SELECTs). LLM calls go through the cached helpers
 * (Redis), so a rerun with the same questions and documents is cheap. Needs Postgres, Redis, a real GEMINI_API_KEY
 * and, unless --no-openalex is given, internet access to OpenAlex.
 *
 * Run:   pnpm --filter backend eval:gap-closure-retro --cutoff 2018 --limit 20
 *        pnpm --filter backend eval:gap-closure-retro --cutoff 2018 --topic "learning analytics" --out ./retro-la
 * Score: pnpm --filter backend eval:gap-closure-retro --score-audit ./gap-closure-retro-2018/audit.csv   (no database needed)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { GapProbe, QuestionFacets } from "@trend/shared-types";
import type { Prisma as PrismaTypes } from "../src/generated/prisma/client.js";
import {
  auditToCsv,
  computeRetroMetrics,
  evaluateWindow,
  filterDraftsByYears,
  LEGACY_THRESHOLDS,
  legacyCountRule,
  legacyCountYears,
  legacyGrowthWindow,
  parseAuditCsv,
  parseRetroArgs,
  pickWitness,
  renderSummaryMarkdown,
  toAuditRecord,
  type RetroArgs,
  type RetroDocument,
  type RetroGapResult,
  type RetroWindowResult,
  type YearRange,
} from "../src/modules/gap-closure/retro.js";

// eslint-disable-next-line no-console
const log = console.log;
/** Lets Excel read the Vietnamese titles of audit.csv as UTF-8; the CSV parser strips it. */
const UTF8_BOM = String.fromCharCode(0xfeff);

/* ------------------------------------------------------------------ */
/*  Score mode: only the pure code, no database, no env                */
/* ------------------------------------------------------------------ */

function scoreAudit(args: RetroArgs): void {
  const auditPath = resolve(args.auditPath!);
  const records = parseAuditCsv(readFileSync(auditPath, "utf8"));
  const metrics = computeRetroMetrics(records, { useHuman: true });
  const summary = renderSummaryMarkdown(metrics, { generatedAt: new Date().toISOString(), settings: [`Scored from ${auditPath} (human labels override AI labels where present)`] });
  const outDir = resolve(args.out ?? dirname(auditPath));
  mkdirSync(outDir, { recursive: true });
  const target = join(outDir, "summary.scored.md");
  writeFileSync(target, summary);
  log(summary);
  log(`\nwritten: ${target}`);
}

/* ------------------------------------------------------------------ */
/*  Run mode                                                           */
/* ------------------------------------------------------------------ */

type Runtime = Awaited<ReturnType<typeof loadRuntime>>;

/** Loaded lazily so that --score-audit works without a valid .env. */
async function loadRuntime() {
  const [{ env }, prismaModule, redis, generated, trends, probeQuery, runner, search, rules, queriesPrompt, screeningPrompt, userAi, databaseId] = await Promise.all([
    import("../src/config/env.js"),
    import("../src/infrastructure/database/prisma.js"),
    import("../src/infrastructure/redis.js"),
    import("../src/generated/prisma/client.js"),
    import("../src/modules/trends/trend.formulas.js"),
    import("../src/modules/gaps/gap-probe-query.js"),
    import("../src/modules/gap-closure/closure.runner.js"),
    import("../src/modules/gap-closure/closure.search.js"),
    import("../src/modules/gap-closure/closure.rules.js"),
    import("../src/modules/gap-closure/closure.queries.prompt.js"),
    import("../src/modules/gap-closure/closure.screening.prompt.js"),
    import("../src/modules/user-ai/user-ai.runtime.js"),
    import("../src/infrastructure/database/database-id.js"),
  ]);
  return { env, ...prismaModule, ...redis, Prisma: generated.Prisma, ...trends, ...probeQuery, ...runner, ...search, ...rules, ...queriesPrompt, ...screeningPrompt, ...userAi, ...databaseId };
}

interface CertificationInputs {
  coverage: { id: string; pHat: number } | null;
  calibration: { id: string; epsHat: number; judgeKind: string } | null;
}

async function loadCertification(rt: Runtime, args: RetroArgs): Promise<CertificationInputs> {
  const prisma = rt.getPrisma();
  let coverage: CertificationInputs["coverage"] = null, calibration: CertificationInputs["calibration"] = null;
  if (args.coverageId) {
    const id = rt.parseDatabaseId(args.coverageId);
    if (id?.kind !== "uuid") throw new Error("--coverage-id must be a UUID");
    const row = await prisma.coverageCheck.findUnique({ where: { id: id.value }, select: { id: true, pHat: true } });
    if (!row) throw new Error(`Coverage check ${args.coverageId} not found`);
    coverage = { id: row.id, pHat: row.pHat };
  }
  if (args.calibrationId) {
    const id = rt.parseDatabaseId(args.calibrationId);
    if (id?.kind !== "uuid") throw new Error("--calibration-id must be a UUID");
    const row = await prisma.closureCalibration.findUnique({ where: { id: id.value } });
    if (!row) throw new Error(`Calibration ${args.calibrationId} not found`);
    if (row.status !== "COMPUTED" || row.epsHat === null) throw new Error("The calibration has not been computed yet");
    if (row.protocolVersion !== rt.GAP_CLOSURE_PROTOCOL_VERSION) throw new Error(`The calibration measured protocol ${row.protocolVersion}, this script runs ${rt.GAP_CLOSURE_PROTOCOL_VERSION}`);
    if (row.judgeKind !== "AI") throw new Error("This script screens with the AI only, so it needs a calibration whose judgeKind is AI");
    calibration = { id: row.id, epsHat: row.epsHat, judgeKind: row.judgeKind };
  }
  return { coverage, calibration };
}

interface GapRow {
  id: string;
  legacyMongoId: string | null;
  title: string;
  suggestedResearchQuestion: string | null;
  questionFacets: unknown;
  probe: unknown;
}

async function selectGaps(rt: Runtime, args: RetroArgs): Promise<GapRow[]> {
  const where: PrismaTypes.ResearchGapWhereInput = { status: "active" };
  if (args.gapIds.length) {
    const parsed = args.gapIds.map((value) => ({ value, id: rt.parseDatabaseId(value) }));
    const bad = parsed.filter((item) => !item.id).map((item) => item.value);
    if (bad.length) throw new Error(`Not a gap id (UUID or 24-character legacy id): ${bad.join(", ")}`);
    where.OR = [
      { id: { in: parsed.flatMap((item) => (item.id?.kind === "uuid" ? [item.id.value] : [])) } },
      { legacyMongoId: { in: parsed.flatMap((item) => (item.id?.kind === "legacyMongoId" ? [item.id.value] : [])) } },
    ];
  } else if (args.topic) {
    where.OR = [{ topic: { contains: args.topic, mode: "insensitive" } }, { title: { contains: args.topic, mode: "insensitive" } }];
  }
  const rows = await rt.getPrisma().researchGap.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: args.limit,
    select: { id: true, legacyMongoId: true, title: true, suggestedResearchQuestion: true, questionFacets: true, probe: true },
  });
  if (args.gapIds.length) {
    const found = new Set(rows.flatMap((row) => [row.id, row.legacyMongoId ?? ""]));
    const missing = args.gapIds.filter((value) => !found.has(value.toLowerCase()));
    if (missing.length) log(`warning: not found or not active: ${missing.join(", ")}`);
  }
  return rows;
}

/* ---- Step 1: the OLD count rule at T (same SQL shape as gaps.service.ts probe counting) ---- */

function probeWhere(rt: Runtime, phrases: string[], years: YearRange) {
  const queries = phrases.map(rt.buildProbeTsQuery);
  if (queries.some((query) => query === null)) return null;
  const { Prisma } = rt;
  const conditions = [Prisma.sql`"data_status" = 'active'`, ...queries.map((query) => Prisma.sql`"search_document" @@ to_tsquery('simple', ${query})`)];
  if (years.yearFrom !== undefined) conditions.push(Prisma.sql`"publication_year" >= ${years.yearFrom}`);
  if (years.yearTo !== undefined) conditions.push(Prisma.sql`"publication_year" <= ${years.yearTo}`);
  return Prisma.join(conditions, " AND ");
}

async function countPapers(rt: Runtime, phrases: string[], years: YearRange): Promise<number> {
  const where = probeWhere(rt, phrases, years);
  if (!where) return 0;
  const [row] = await rt.getPrisma().$queryRaw<Array<{ count: number }>>(rt.Prisma.sql`SELECT count(*)::int AS count FROM "papers" WHERE ${where}`);
  return row?.count ?? 0;
}

async function growthPct(rt: Runtime, phrase: string, years: YearRange): Promise<number> {
  const window = legacyGrowthWindow(years, new Date().getFullYear());
  const where = probeWhere(rt, [phrase], { yearFrom: window.yearFrom, yearTo: window.yearTo });
  if (!where) return 0;
  const rows = await rt.getPrisma().$queryRaw<Array<{ year: number; count: number }>>(rt.Prisma.sql`SELECT "publication_year" AS year, count(*)::int AS count FROM "papers" WHERE ${where} GROUP BY "publication_year" ORDER BY "publication_year"`);
  const series = rt.fillMissingYears(rows, window.yearFrom, window.yearTo);
  return rt.yoyGrowthPct(rt.truncateToCompleteYears(series, window.lastCompleteYear));
}

async function oldRuleAtCutoff(rt: Runtime, probeJson: unknown, cutoff: number): Promise<RetroGapResult["old"]> {
  const probe = (probeJson ?? null) as GapProbe | null;
  if (!probe?.topicA || !probe?.topicB) return legacyCountRule(null, LEGACY_THRESHOLDS);
  try {
    const years = legacyCountYears(probe, cutoff);
    const [intersectionCount, a, b, growthA, growthB] = await Promise.all([
      countPapers(rt, [probe.topicA, probe.topicB], years),
      countPapers(rt, [probe.topicA], years),
      countPapers(rt, [probe.topicB], years),
      growthPct(rt, probe.topicA, years),
      growthPct(rt, probe.topicB, years),
    ]);
    const rule = legacyCountRule({ intersectionCount, parentCounts: { a, b }, parentRisingGrowthPct: Math.max(growthA, growthB) }, LEGACY_THRESHOLDS);
    return { ...rule, growthPct: { a: growthA, b: growthB }, years };
  } catch (error) {
    return { label: "error", evidence: null, error: errorText(error) };
  }
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, 300);

/* ---- Steps 2 and 3: logged search + AI screening inside a year window ---- */

interface WindowOptions {
  window: RetroWindowResult["window"];
  question: string;
  facets: QuestionFacets;
  queries: string[];
  years: YearRange;
  openalex: boolean;
  certification?: CertificationInputs;
}

function failedWindow(options: WindowOptions, message: string): RetroWindowResult {
  return {
    window: options.window, ...options.years, queries: [], documents: [], droppedByYear: 0, droppedUnknownYear: 0, witness: null, error: message,
    evaluation: { state: "NEEDS_REVIEW", decision: "ABSTAIN", reasons: ["SEARCH_ERRORS"], answers: 0, pending: 0, searchErrors: 0 },
  };
}

async function runWindow(rt: Runtime, options: WindowOptions): Promise<RetroWindowResult> {
  try {
    const logs: RetroWindowResult["queries"] = [];
    const lists: Awaited<ReturnType<typeof rt.searchLocalForClosure>>[] = [];
    const sources = options.openalex && rt.env.GAP_CLOSURE_OPENALEX_PER_QUERY > 0 ? (["LOCAL", "OPENALEX"] as const) : (["LOCAL"] as const);
    for (const query of options.queries) {
      for (const source of sources) {
        const queryIndex = logs.length;
        const params = { query, queryIndex, yearFrom: options.years.yearFrom, yearTo: options.years.yearTo };
        const executedAt = new Date().toISOString();
        try {
          const drafts = source === "LOCAL" ? await rt.searchLocalForClosure(params) : await rt.searchOpenAlexForClosure(params);
          logs.push({ source, query, executedAt, resultCount: drafts.length });
          lists.push(drafts);
        } catch (error) {
          // Fail-closed: a failed search is recorded and the window needs review; it is never "zero results".
          logs.push({ source, query, executedAt, resultCount: 0, error: errorText(error) });
        }
      }
    }
    // The searches filter by year already; this guard also drops documents whose year is unknown or outside the window.
    const merged = rt.mergeClosureDocuments(lists);
    const { kept, dropped, droppedUnknownYear } = filterDraftsByYears(merged, options.years);
    const screened = await rt.screenClosureDocuments(options.question, options.facets, kept);
    const documents: RetroDocument[] = kept.map((draft, index) => {
      const verdict = screened[index]!;
      return {
        dedupeKey: draft.dedupeKey, paperId: draft.paperId, openalexId: draft.openalexId, doi: draft.doi, title: draft.title, publicationYear: draft.publicationYear,
        retrievedFrom: draft.retrievedFrom, aiLabel: verdict.aiLabel, aiQuote: verdict.aiQuote, aiQuoteVerified: verdict.aiQuoteVerified,
        limitationStatement: verdict.limitationStatement, batchFailed: verdict.batchFailed,
      };
    });
    const evaluation = evaluateWindow({
      documents,
      searchErrors: logs.filter((entry) => entry.error).length,
      coverage: options.certification?.coverage ?? null,
      calibration: options.certification?.calibration ?? null,
      maxFalseNovelty: rt.env.GAP_MAX_FALSE_NOVELTY,
    });
    return { window: options.window, ...options.years, queries: logs, documents, droppedByYear: dropped, droppedUnknownYear, evaluation, witness: pickWitness(documents, evaluation.witnessId) };
  } catch (error) {
    return failedWindow(options, errorText(error));
  }
}

async function evaluateGap(rt: Runtime, args: RetroArgs, cutoff: number, gap: GapRow, certification: CertificationInputs): Promise<RetroGapResult> {
  const question = (gap.suggestedResearchQuestion ?? gap.title).trim();
  const facets = (gap.questionFacets ?? {}) as QuestionFacets;
  const old = await oldRuleAtCutoff(rt, gap.probe, cutoff);

  const maxQueries = args.maxQueries ?? rt.env.GAP_CLOSURE_MAX_QUERIES;
  const queries = await rt.proposeClosureQueries(question, facets, maxQueries);
  const common = { question, facets, queries, openalex: args.openalex };
  const atT = await runWindow(rt, { ...common, window: "AT_T", years: { yearTo: cutoff }, certification });
  const afterT = await runWindow(rt, { ...common, window: "AFTER_T", years: { yearFrom: cutoff + 1 } });
  return { gapId: rt.publicDatabaseId(gap), title: gap.title, question, facets: { ...facets }, cutoff, proposedQueries: queries, old, atT, afterT };
}

/* ---- Output ---- */

function writeOutputs(rt: Runtime, args: RetroArgs, cutoff: number, outDir: string, results: RetroGapResult[], certification: CertificationInputs, startedAt: string, final: boolean): void {
  const records = results.map(toAuditRecord);
  const meta = {
    cutoff, startedAt, finishedAt: final ? new Date().toISOString() : null, args,
    protocolVersion: rt.GAP_CLOSURE_PROTOCOL_VERSION, queriesPromptVersion: rt.QUERIES_PROMPT_VERSION, screeningPromptVersion: rt.SCREENING_PROMPT_VERSION,
    model: rt.aiModel("fast"), certification,
    legacyThresholds: LEGACY_THRESHOLDS, // frozen defaults of the removed GAP_SCARCE_* settings
    settings: { localTopK: rt.env.GAP_CLOSURE_LOCAL_TOP_K, openalexPerQuery: rt.env.GAP_CLOSURE_OPENALEX_PER_QUERY, maxFalseNovelty: rt.env.GAP_MAX_FALSE_NOVELTY },
  };
  writeFileSync(join(outDir, "results.json"), JSON.stringify({ meta, gaps: results }, null, 2));
  writeFileSync(join(outDir, "audit.csv"), UTF8_BOM + auditToCsv(records));
  const settings = [
    `Cutoff T = ${cutoff}; the corpus at T is today's corpus filtered to publication_year <= ${cutoff}`,
    `Gaps: ${results.length} (limit ${args.limit}${args.topic ? `, topic "${args.topic}"` : ""}${args.gapIds.length ? ", explicit ids" : ""})`,
    `Sources: LOCAL corpus${args.openalex && rt.env.GAP_CLOSURE_OPENALEX_PER_QUERY > 0 ? " + OpenAlex" : " only (OpenAlex off)"}; up to ${args.maxQueries ?? rt.env.GAP_CLOSURE_MAX_QUERIES} queries per gap`,
    certification.coverage && certification.calibration
      ? `Certification: coverage ${certification.coverage.id} (pHat ${certification.coverage.pHat}), calibration ${certification.calibration.id} (epsHat ${certification.calibration.epsHat}), limit ${rt.env.GAP_MAX_FALSE_NOVELTY}`
      : "Certification: none (no coverage and calibration supplied), so no gap is OPEN_CERTIFIED; \"no answer found\" is an observation, not a certificate",
    `Protocol ${rt.GAP_CLOSURE_PROTOCOL_VERSION}, prompts ${rt.QUERIES_PROMPT_VERSION} / ${rt.SCREENING_PROMPT_VERSION}, model ${rt.aiModel("fast")}`,
    ...(final ? [] : ["INCOMPLETE RUN (checkpoint)"]),
  ];
  const summary = renderSummaryMarkdown(computeRetroMetrics(records, { useHuman: false }), { cutoff, generatedAt: new Date().toISOString(), protocolVersion: rt.GAP_CLOSURE_PROTOCOL_VERSION, settings });
  writeFileSync(join(outDir, "summary.md"), summary);
}

async function runExperiment(args: RetroArgs): Promise<void> {
  const cutoff = args.cutoff!;
  const rt = await loadRuntime();
  const startedAt = new Date().toISOString();
  const outDir = resolve(args.out!);
  mkdirSync(outDir, { recursive: true });
  try {
    await rt.connectPostgres();
    const certification = await loadCertification(rt, args);
    const gaps = await selectGaps(rt, args);
    log(`cutoff ${cutoff}: ${gaps.length} active gap(s) selected; output ${outDir}`);
    const results: RetroGapResult[] = [];
    for (const [index, gap] of gaps.entries()) {
      const result = await evaluateGap(rt, args, cutoff, gap, certification);
      results.push(result);
      log(`[${index + 1}/${gaps.length}] ${result.gapId} old=${result.old.label} atT=${result.atT.error ? "ERROR" : result.atT.evaluation.state} (${result.atT.documents.length} docs) afterT answers=${result.afterT.evaluation.answers} pending=${result.afterT.evaluation.pending} | ${result.title.slice(0, 70)}`);
      writeOutputs(rt, args, cutoff, outDir, results, certification, startedAt, false);
    }
    writeOutputs(rt, args, cutoff, outDir, results, certification, startedAt, true);
    log(`\ndone. results.json, audit.csv and summary.md are in ${outDir}`);
    log("AI labels are PROVISIONAL: have two people fill the reviewer columns of audit.csv, then run with --score-audit.");
  } finally {
    await rt.disconnectPostgres().catch(() => undefined);
    await rt.disconnectRedis().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const args = parseRetroArgs(process.argv.slice(2));
  if (args.mode === "score") scoreAudit(args);
  else await runExperiment(args);
  // Importing the closure modules also creates BullMQ queues (their own Redis connections), which keep the process alive.
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
