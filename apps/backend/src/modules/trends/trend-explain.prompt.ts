import type {
  PublicationTrend,
  TopicRelationshipResponse,
  TrendClassification,
  TrendEvidenceSignal,
  TrendExplanationResponse,
  TrendMetricTrace,
  TrendMetricTraceSource,
  TrendPossibleDriver,
  TrendsOverview,
  YearlyCount,
} from "@trend/shared-types";
import { LlmContentError } from "../llm/gemini.client.js";
import { collectAllowedNumbers, findUnsupportedNumbers, formatEvidence, sanitizeIds, UNTRUSTED_DATA_PREAMBLE } from "../llm/grounding.js";

export const TREND_EXPLAIN_PROMPT_VERSION = "trend-explain-v4";

export const TREND_EXPLAIN_SYSTEM_PROMPT = [
  UNTRUSTED_DATA_PREAMBLE,
  "You explain research publication trends for a researcher.",
  "Use only numbers that appear in the METRICS block; never compute or estimate new figures.",
  "Do not invent paper titles, authors, institutions or claims that are not in the data.",
  "possibleDrivers may cite only ids from the REPRESENTATIVE PAPERS block and must be phrased as hypotheses (for example \"may reflect\"), never as facts.",
  "Each topic carries a classification (verdict: rising, declining, stable or insufficient), decided by a Mann–Kendall test on its share of its field. Explain that verdict and never contradict it: call a topic rising or declining only when its verdict says so. momentum, growthRatePct and cagr3yPct are deprecated raw-count figures; do not use them as evidence of a trend.",
  "If a signal is weak, the sample is small or the latest year is incomplete, say so in cautions.",
  "Return only the requested JSON.",
].join("\n");

export interface RepresentativePaper {
  id: string;
  title: string;
  abstractText?: string | null;
  publicationYear: number;
  citationCount: number;
}

const TOP_YEARS = 3;

/** The most cited papers, preferring those from the topic's three busiest years (where the trend is visible). */
export function pickRepresentativePapers<T extends { publicationYear: number; citationCount: number }>(papers: T[], yearlyBreakdown: YearlyCount[], limit = 6): T[] {
  const busiest = new Set([...yearlyBreakdown].sort((a, b) => b.count - a.count || b.year - a.year).slice(0, TOP_YEARS).map((row) => row.year));
  const rank = (paper: T) => Number(busiest.has(paper.publicationYear));
  return [...papers].sort((a, b) => rank(b) - rank(a) || b.citationCount - a.citationCount).slice(0, limit);
}

/** What the prompt needs from `trendService.topic`; its other fields are passed through as metrics. */
export type TrendTopicDetail = Pick<PublicationTrend, "topic" | "totalPapers" | "yearlyBreakdown"> & { statistics?: { classification?: TrendClassification } } & Record<string, unknown>;

export interface TrendExplainData {
  overview: TrendsOverview;
  topicDetail: TrendTopicDetail | null;
  relationships: TopicRelationshipResponse | null;
}

/** The only figures the model is given; the same object feeds the prompt and the number check. */
export function buildTrendMetrics({ overview, topicDetail, relationships }: TrendExplainData) {
  return {
    window: { yearFrom: overview.yearFrom, yearTo: overview.yearTo, lastCompleteYear: overview.lastCompleteYear },
    totalPapersInWindow: overview.totalPapersInWindow,
    yearlyTotalPapers: overview.yearlyTotalPapers,
    citationTrend: overview.citationTrend,
    topTopics: overview.topics.slice(0, 8),
    risingKeywords: overview.risingKeywords.slice(0, 8),
    facets: overview.facets,
    topicDetail,
    relationships,
  };
}

/** Numbers a trend explanation may state: everything in the metrics, 100, and the rounded form of every decimal. */
export function buildAllowedTrendNumbers(data: TrendExplainData): number[] {
  const numbers = collectAllowedNumbers(buildTrendMetrics(data));
  return [...numbers, 100, ...numbers.filter((value) => !Number.isInteger(value)).map(Math.round)];
}

export function buildTrendExplainPrompt(args: TrendExplainData & { topic: string | null; language: "en" | "vi"; papers: RepresentativePaper[] }): string {
  const lang = args.language === "vi" ? "Vietnamese" : "English";
  const evidence = formatEvidence(args.papers.map((paper) => ({ id: paper.id, title: paper.title, abstractText: paper.abstractText ?? undefined, meta: String(paper.publicationYear) })), { maxAbstractChars: 400, emptyText: "(no representative papers available)" });
  return [
    `OUTPUT LANGUAGE: ${lang}.`,
    "Explain the research trend ONLY from the metrics below. Representative papers are context for hypotheses, not a source of figures.",
    "",
    `Focus topic: ${args.topic ?? "overall corpus"}`,
    "",
    "<<<METRICS>>>",
    JSON.stringify(buildTrendMetrics(args), null, 2),
    "<<<END_METRICS>>>",
    "",
    "REPRESENTATIVE PAPERS (cite by id in possibleDrivers):",
    evidence.text,
    "",
    "Return JSON with exactly this shape:",
    JSON.stringify(
      {
        topic: args.topic,
        language: args.language,
        summary: "one concise paragraph",
        whyItMatters: ["two to four bullets"],
        evidenceSignals: [{ text: "bullet grounded in the verdict, counts, citations, facets or relationships", sources: ["yearlyTotalPapers", "citationTrend", "topicMetrics", "risingKeywords", "facets", "relationships"] }],
        cautions: ["bullet about incomplete year, small base, missing data or limits"],
        suggestedActions: ["user action such as search papers, compare topics, generate report, inspect gaps"],
        possibleDrivers: [{ text: "hypothesis about a cause", paperIds: ["<id from REPRESENTATIVE PAPERS>"] }],
        metricTrace: [],
        generatedAt: "ISO timestamp",
      },
      null,
      2,
    ),
  ].join("\n");
}

const formatNumber = (value: number) => new Intl.NumberFormat("en-US").format(value);
const formatSigned = (value: number) => `${value >= 0 ? "+" : ""}${value}`;

export function buildTrendMetricTrace({ overview, topicDetail, relationships }: TrendExplainData): TrendMetricTrace[] {
  const traces: TrendMetricTrace[] = [
    { source: "yearlyTotalPapers", label: "Publication activity", value: `${formatNumber(overview.totalPapersInWindow)} papers, ${overview.yearFrom}-${overview.yearTo}`, explanation: "Counts active papers in the current year window and Data Scope." },
    { source: "citationTrend", label: "Citation activity", value: `${formatNumber(overview.citationTrend.reduce((sum, row) => sum + (row.totalCitations ?? 0), 0))} total citations`, explanation: "Aggregates OpenAlex citation counts by publication year for the same scoped papers." },
    { source: "risingKeywords", label: "Early keyword signals", value: `${formatNumber(overview.risingKeywords.length)} rising keywords`, explanation: "Keywords whose share of papers rose between two periods (log odds ratio, Benjamini–Hochberg)." },
    { source: "facets", label: "Dataset facets", value: `${formatNumber(overview.facets.domains.length)} domains, ${formatNumber(overview.facets.topics.length)} top topic facets`, explanation: "Summarizes the selected corpus by OpenAlex taxonomy and publication metadata." },
  ];
  if (topicDetail) {
    const verdict = topicDetail.statistics?.classification;
    const change = verdict?.relativeChangePct;
    const value = verdict
      ? `${verdict.verdict}${change !== null && change !== undefined && Number.isFinite(change) ? `, ${formatSigned(Math.round(change * 10) / 10)}% per year` : ""}, ${formatNumber(topicDetail.totalPapers)} papers`
      : `${formatNumber(topicDetail.totalPapers)} papers`;
    traces.push({ source: "topicMetrics", label: "Focus topic verdict", value, explanation: "Mann–Kendall test on the topic's yearly share of its field, with Sen's slope as the relative change per year (see /docs)." });
  }
  if (relationships) traces.push({ source: "relationships", label: "Topic co-occurrence", value: `${formatNumber(relationships.edges.length)} related topic links`, explanation: "Counts topics that appear together with the focus topic on the same scoped papers." });
  return traces;
}

const TRACE_SOURCES: TrendMetricTraceSource[] = ["yearlyTotalPapers", "citationTrend", "topicMetrics", "risingKeywords", "facets", "relationships"];
const isTraceSource = (value: unknown): value is TrendMetricTraceSource => TRACE_SOURCES.includes(value as TrendMetricTraceSource);

export function normalizeEvidenceSignals(rawSignals: unknown[], fallbackSources: TrendMetricTraceSource[]): TrendEvidenceSignal[] {
  return rawSignals
    .map((item) => {
      if (typeof item === "string") return { text: item.trim(), sources: fallbackSources };
      if (item && typeof item === "object") {
        const candidate = item as { text?: unknown; sources?: unknown };
        const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
        const sources = Array.isArray(candidate.sources) ? candidate.sources.filter(isTraceSource) : fallbackSources;
        return { text, sources: sources.length > 0 ? sources : fallbackSources };
      }
      return { text: "", sources: fallbackSources };
    })
    .filter((item) => item.text.length > 0);
}

export interface ValidateTrendContext {
  topic: string | null;
  language: "en" | "vi";
  metricTrace: TrendMetricTrace[];
  allowedNumbers: number[];
  allowedPaperIds: Set<string>;
}

/**
 * Checks the shape and the figures of a trend explanation. A made-up number in the summary rejects the whole answer
 * (generateTrendExplanationWithRetry then asks the model once more); in a bullet it only drops that bullet.
 */
export function validateTrendExplanation(out: Partial<Record<keyof TrendExplanationResponse, unknown>>, context: ValidateTrendContext): TrendExplanationResponse {
  if (!out || typeof out.summary !== "string" || out.summary.trim().length === 0 || [out.whyItMatters, out.evidenceSignals, out.cautions, out.suggestedActions].some((list) => !Array.isArray(list))) throw new LlmContentError("Invalid trend explanation shape");
  const summary = out.summary.trim();
  const invented = findUnsupportedNumbers(summary, context.allowedNumbers);
  if (invented.length) throw new LlmContentError(`Trend explanation cites numbers not in the metrics: ${invented.join(", ")}`);
  const grounded = (text: string) => findUnsupportedNumbers(text, context.allowedNumbers).length === 0;
  const bullets = (value: unknown) => (value as unknown[]).map(String).map((text) => text.trim()).filter(Boolean).filter(grounded);
  const drivers: TrendPossibleDriver[] = (Array.isArray(out.possibleDrivers) ? out.possibleDrivers : [])
    .map((item): TrendPossibleDriver => {
      const candidate = (item && typeof item === "object" ? item : {}) as { text?: unknown; paperIds?: unknown };
      return { text: typeof candidate.text === "string" ? candidate.text.trim() : "", paperIds: sanitizeIds(Array.isArray(candidate.paperIds) ? candidate.paperIds : [], context.allowedPaperIds) };
    })
    .filter((driver) => driver.text && driver.paperIds.length > 0 && grounded(driver.text));
  return {
    topic: context.topic,
    language: context.language,
    summary,
    whyItMatters: bullets(out.whyItMatters).slice(0, 4),
    evidenceSignals: normalizeEvidenceSignals(out.evidenceSignals as unknown[], context.metricTrace.map((trace) => trace.source)).filter((signal) => grounded(signal.text)).slice(0, 5),
    cautions: bullets(out.cautions).slice(0, 3),
    suggestedActions: (out.suggestedActions as unknown[]).map(String).map((text) => text.trim()).filter(Boolean).slice(0, 4),
    possibleDrivers: drivers.slice(0, 3),
    metricTrace: context.metricTrace,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Runs `generate`; when its validation rejects the answer (LlmContentError) asks once more, bypassing the cache and
 * telling the model why. A second rejection is thrown for the caller to report; any other error is thrown at once.
 */
export async function generateTrendExplanationWithRetry<T>(
  generate: (prompt: string, options: { bypassCache?: boolean }) => Promise<T>,
  prompt: string,
): Promise<T> {
  try {
    return await generate(prompt, {});
  } catch (error) {
    if (!(error instanceof LlmContentError)) throw error;
    return generate(`${prompt}

Your previous answer was rejected: ${error.message}. Use only numbers that appear in the METRICS block.`, { bypassCache: true });
  }
}
