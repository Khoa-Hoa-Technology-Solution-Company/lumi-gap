import type {
  PublicationTrend,
  TrendClassification,
  TrendExplanationResponse,
  TrendMetricTrace,
  TrendMetricTraceSource,
  TrendsOverview,
} from "@trend/shared-types";
import { AppError } from "../../common/exceptions/app-error.js";

/** Bump when the prompt or the context shape changes. */
export const EXPLAIN_PROMPT_VERSION = "trend-explain-v4";
/** Room for a Vietnamese answer of the requested size; the context is compact. */
export const EXPLAIN_MAX_OUTPUT_TOKENS = 3072;

const TRACE_SOURCES: TrendMetricTraceSource[] = ["yearlyTotalPapers", "citationTrend", "topicMetrics", "risingKeywords", "facets", "relationships"];

/**
 * The numbers the model may use. Only aggregates and test results; no raw
 * series or facets, so the prompt stays small and every value is traceable.
 */
export function buildExplainContext(overview: TrendsOverview, detail: PublicationTrend | null) {
  const stats = detail?.statistics;
  return {
    dataSource: overview.dataSource ?? "local",
    window: { yearFrom: overview.yearFrom, yearTo: overview.yearTo, lastCompleteYear: overview.lastCompleteYear },
    papersInScope: overview.totalPapersInWindow,
    topTopics: overview.topics.slice(0, 8).map((topic) => ({
      topic: topic.topic,
      totalPapers: topic.totalPapers,
      trend: verdictRow(topic.classification),
    })),
    risingKeywords: overview.risingKeywords.slice(0, 8).map((keyword) => ({
      keyword: keyword.keyword,
      papersEarlier: keyword.shift?.papersA,
      papersLater: keyword.shift?.papersB,
      z: round(keyword.shift?.z),
      qValue: round(keyword.shift?.qValue, 4),
    })),
    topic: detail
      ? {
          name: detail.topic,
          field: detail.taxonomy?.fieldName,
          totalPapers: detail.totalPapers,
          topSources: detail.topJournals.slice(0, 3).map((item) => item.name),
          statistics: stats
            ? {
                source: stats.source,
                years: [stats.yearsUsed[0], stats.yearsUsed.at(-1)],
                reference: stats.baseline.label,
                trend: verdictRow(stats.classification),
                ppTop10PctByYear: stats.impact.map((row) => [row.year, round(row.ppTop10Pct)]),
                keywordsRising: stats.termShift?.rising.slice(0, 5).map(shiftRow),
                keywordsFalling: stats.termShift?.falling.slice(0, 5).map(shiftRow),
                periods: stats.termShift ? { earlier: stats.termShift.periodA, later: stats.termShift.periodB } : undefined,
              }
            : undefined,
        }
      : null,
  };
}

export function buildExplainPrompt(context: ReturnType<typeof buildExplainContext>, language: "en" | "vi"): string {
  const languageName = language === "vi" ? "Vietnamese" : "English";
  return `You explain research-trend statistics to students and researchers. Write in ${languageName}.
Rules:
- Use only the numbers in DATA. Do not invent values, papers, authors or causes.
- Each "trend" object holds the system's verdict, decided only by the Mann–Kendall test on the topic's yearly share of its field (not raw paper counts): rising or declining when the q-value (overview list) or p-value (single topic) is below 0.05, stable otherwise, insufficient when the data is too thin (reasons say why, e.g. LOCAL_CORPUS, TOO_FEW_YEARS, TOO_FEW_PAPERS).
- Explain the verdict; never contradict it. Do not call a stable or insufficient topic rising or declining, and do not call a topic trending because its raw paper count grows.
- senSlopePctPointsPerYear is Sen's slope of the share (percentage points per year) with its 95% confidence interval senSlopeCi95; relativeChangePctPerYear is that slope relative to the median share.
- confidence "high" means p < 0.01 over at least 8 years; "medium" is any other significant result.
- ppTop10Pct is the share of papers among the 10% most cited of their year and subfield; 10% is the world average.
- Mention the data source (${context.dataSource === "openalex" ? "OpenAlex, whole database" : "local corpus"}) and that the current year is incomplete when relevant.
Return only JSON with exactly this shape and sizes:
{"summary": string (at most 80 words),
 "whyItMatters": string[] (2-3 items),
 "evidenceSignals": [{"text": string, "sources": string[] using only ${TRACE_SOURCES.join(", ")}}] (2-4 items),
 "cautions": string[] (1-3 items),
 "suggestedActions": string[] (2-3 items),
 "metricTrace": [{"source": one of ${TRACE_SOURCES.join(", ")}, "label": string, "value": string copied from DATA, "explanation": string}] (3-6 items)}
DATA:
${JSON.stringify(context)}`;
}

/** Coerces the model output into the response shape the web expects. */
export function normalizeExplanation(raw: unknown, topic: string | undefined, language: "en" | "vi"): TrendExplanationResponse {
  const value = (raw ?? {}) as Record<string, unknown>;
  const summary = typeof value.summary === "string" ? value.summary.trim() : "";
  if (!summary) throw AppError.serviceUnavailable("The AI explanation came back empty; please try again.");
  return {
    topic: topic ?? null,
    language,
    summary,
    whyItMatters: strings(value.whyItMatters, 3),
    evidenceSignals: list(value.evidenceSignals, 4).flatMap((item) => {
      const row = item as { text?: unknown; sources?: unknown };
      if (typeof row.text !== "string" || !row.text.trim()) return [];
      return [{ text: row.text.trim(), sources: strings(row.sources, 6).filter(isTraceSource) }];
    }),
    cautions: strings(value.cautions, 3),
    suggestedActions: strings(value.suggestedActions, 3),
    metricTrace: list(value.metricTrace, 6).flatMap((item): TrendMetricTrace[] => {
      const row = item as Record<string, unknown>;
      if (!isTraceSource(row.source) || typeof row.label !== "string") return [];
      return [{ source: row.source, label: row.label, value: String(row.value ?? ""), explanation: typeof row.explanation === "string" ? row.explanation : "" }];
    }),
    generatedAt: new Date().toISOString(),
  };
}

function verdictRow(classification: TrendClassification | undefined) {
  if (!classification) return undefined;
  return {
    verdict: classification.verdict,
    confidence: classification.confidence ?? undefined,
    reasons: classification.reasons,
    yearsUsed: classification.yearsUsed,
    totalPapers: classification.totalPapers,
    mannKendallTau: round(classification.mannKendall?.tau),
    pValue: round(classification.mannKendall?.pValue, 6),
    qValue: round(classification.qValue, 4),
    senSlopePctPointsPerYear: round(classification.senSlope, 4),
    senSlopeCi95: classification.senSlopeCi95?.map((value) => round(value, 4)),
    relativeChangePctPerYear: round(classification.relativeChangePct),
  };
}

function shiftRow(row: { term: string; papersA: number; papersB: number; z: number; qValue: number }) {
  return { keyword: row.term, papersEarlier: row.papersA, papersLater: row.papersB, z: round(row.z), qValue: round(row.qValue, 4) };
}

function isTraceSource(value: unknown): value is TrendMetricTraceSource {
  return typeof value === "string" && (TRACE_SOURCES as string[]).includes(value);
}

function list(value: unknown, max: number): unknown[] {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

function strings(value: unknown, max: number): string[] {
  const items = Array.isArray(value) ? value : [];
  return items.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()).slice(0, max);
}

function round(value: number | null | undefined, digits = 2): number | undefined {
  if (value === null || value === undefined || !Number.isFinite(value)) return undefined;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
