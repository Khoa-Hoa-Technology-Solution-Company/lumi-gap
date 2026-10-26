import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Database } from "lucide-react";
import type { TrendBaselineLevel, TrendClassification, TrendDiscoverCollection, TrendDiscoverItem, TrendSnapshotProvenance, TrendsDiscoverResponse } from "@trend/shared-types";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { formatNumber } from "@/utils";
import { getTopicTrendTarget } from "../../../pages/trends.navigation";
import { formatSigned } from "../../../pages/trends.insights";
import { useTrendsDiscover } from "../hooks/use-trends";
import { formatPValue } from "./trend-evidence-panel";
import { TrendVerdictBadge } from "./trend-verdict-badge";

type Translate = ReturnType<typeof useI18n>["t"];

/** Ranking rules shown to the reader; the same rules the API reports (DISCOVER_RANKING_RULES). */
const COLLECTIONS: Array<{ id: TrendDiscoverCollection; label: string; description: string; rule: string }> = [
  { id: "trending", label: "Trending", description: "Topics whose share of the reference population rises significantly (Mann–Kendall, BH-adjusted).", rule: "Ranked by relative change of the share (%/year), then q, then topic id. Only rising topics with a p-value and a q-value." },
  { id: "fastest_growing", label: "Fastest growing", description: "Trending topics ranked by mean General Growth Tendency (descriptive; stability not verified).", rule: "Only trending topics that meet both Nelis conditions, ranked by mean GGT, then q, then topic id. The Nelis stability rule is not checked." },
  { id: "by_field", label: "Trending by field", description: "Rising topics within each OpenAlex field, tested against the field.", rule: "Per field, rising topics by the Trending rule; fields in alphabetical order." },
];
const BASELINES: TrendBaselineLevel[] = ["global", "domain", "field", "subfield"];
const PAGE_SIZE = 10;
const PER_FIELD = 3;

function baselineName(level: TrendBaselineLevel, t: Translate): string {
  switch (level) {
    case "global": return t("All works with a primary topic");
    case "domain": return t("Domain");
    case "field": return t("Field");
    default: return t("Subfield");
  }
}

/** The stored statistics of an item as the verdict badge expects them (no recomputation). */
function classificationOf(item: TrendDiscoverItem): TrendClassification {
  return {
    verdict: item.verdict,
    confidence: item.confidence,
    yearsUsed: item.yearsUsed,
    totalPapers: item.totalPapers,
    mannKendall: item.mannKendall,
    qValue: item.qValue,
    qFamilySize: item.qFamilySize,
    senSlope: item.senSlopePctPoints,
    senSlopeCi95: item.senSlopeCi95,
    relativeChangePct: item.relativeChangePct,
    reasons: item.verdict === "rising" ? ["SIGNIFICANT_INCREASE"] : item.verdict === "declining" ? ["SIGNIFICANT_DECREASE"] : item.verdict === "insufficient" ? ["TOO_FEW_PAPERS"] : ["NO_SIGNIFICANT_TREND"],
  };
}

export function SnapshotProvenanceNote({ provenance }: { provenance: TrendSnapshotProvenance }) {
  const { t, language } = useI18n();
  const collected = provenance.lastFetchedAt ? new Date(provenance.lastFetchedAt).toLocaleString(language === "vi" ? "vi-VN" : "en-US", { dateStyle: "medium", timeStyle: "short" }) : "—";
  return (
    <div role="note" className="flex flex-wrap items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
      <Database className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <div className="space-y-0.5">
        <p data-testid="discover-provenance">
          {t("Data: OpenAlex snapshot · {{types}} · {{from}}–{{to}} · Reference population: {{baseline}} · Collected {{date}}", {
            types: provenance.workTypes.join(", "),
            from: provenance.yearFrom,
            to: provenance.lastCompleteYear,
            baseline: baselineName(provenance.baselineLevel, t),
            date: collected,
          })}
        </p>
        <p>{t("OpenAlex revises historical counts; these numbers are the state of the API when they were collected.")}</p>
      </div>
    </div>
  );
}

function DiscoverTopicRow({ item, showGgt }: { item: TrendDiscoverItem; showGgt: boolean }) {
  const { t } = useI18n();
  const q = item.qValue === null ? null : item.qValue < 0.001 ? "< 0.001" : formatPValue(item.qValue);
  return (
    <li className="flex flex-col gap-2 border-b border-slate-100 py-3 last:border-b-0 dark:border-slate-800 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-slate-400">#{item.rank}</span>
          <Link to={getTopicTrendTarget(item.topicName, item.topicId)} className="font-semibold text-slate-900 hover:underline dark:text-white" data-topic-id={item.topicId}>
            {item.topicName}
          </Link>
          <TrendVerdictBadge classification={classificationOf(item)} size="sm" />
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{item.taxonomy.fieldName} › {item.taxonomy.subfieldName}</p>
        <p className="text-xs text-slate-700 dark:text-slate-300">
          {t("Share change {{value}}%/year", { value: item.relativeChangePct === null ? "—" : formatSigned(item.relativeChangePct, 1) })}
          {" · "}
          {q === null ? t("q not available") : t("q = {{q}} (Benjamini–Hochberg across {{n}} topics)", { q, n: item.qFamilySize })}
          {" · "}
          {t("{{count}} papers", { count: formatNumber(item.totalPapers) })}
        </p>
        {showGgt && (
          <p className="text-xs text-slate-700 dark:text-slate-300" data-testid="discover-ggt">
            {t("Mean GGT {{mean}}% ± {{sem}}% over {{n}} years", { mean: item.ggt.meanPct === null ? "—" : formatSigned(item.ggt.meanPct, 1), sem: item.ggt.semPct === null ? "—" : item.ggt.semPct.toFixed(1), n: item.ggt.years })}
            <span className="ml-1 text-slate-500 dark:text-slate-400">{t("(descriptive; stability not verified)")}</span>
          </p>
        )}
      </div>
    </li>
  );
}

function Pager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (page: number) => void }) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-end gap-2 text-xs">
      <button type="button" className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />{t("Previous")}</button>
      <span aria-live="polite">{t("Page {{page}} of {{pages}}", { page, pages })}</span>
      <button type="button" className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)}>{t("Next")}<ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></button>
    </div>
  );
}

function Excluded({ data }: { data: TrendsDiscoverResponse }) {
  const { t } = useI18n();
  const { insufficientData, notAssessable, ggtConditionsNotMet } = data.excluded;
  return (
    <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400" data-testid="discover-excluded">
      {t("Not ranked: {{na}} topics whose trend is not assessable against this reference population (for example, a topic that is its whole subfield) and {{ins}} with too little data.", { na: notAssessable, ins: insufficientData })}
      {ggtConditionsNotMet !== undefined && ` ${t("{{n}} trending topics are left out because they do not meet both Nelis conditions (≥ 50 papers every year, every annual GGT < 100%).", { n: ggtConditionsNotMet })}`}
    </p>
  );
}

export function DiscoverTab() {
  const { t } = useI18n();
  const [collection, setCollection] = useState<TrendDiscoverCollection>("trending");
  const [baseline, setBaseline] = useState<TrendBaselineLevel>("field");
  const [page, setPage] = useState(1);
  const [fieldId, setFieldId] = useState<string | undefined>();
  const byField = collection === "by_field";
  const query = useTrendsDiscover({ collection, baseline: byField ? "field" : baseline, page, pageSize: PAGE_SIZE, perField: PER_FIELD, ...(byField && fieldId ? { fieldId } : {}) });
  const data = query.data;
  const current = COLLECTIONS.find((c) => c.id === collection)!;

  const choose = (next: TrendDiscoverCollection) => { setCollection(next); setPage(1); setFieldId(undefined); };

  return (
    <section className="mb-8 space-y-4" aria-labelledby="discover-heading">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#121212]">
        <h2 id="discover-heading" className="text-lg font-bold text-slate-900 dark:text-white">{t("Discover trends")}</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t("Precomputed from one validated OpenAlex snapshot. Changing the page never changes a topic's statistics.")}</p>
        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{t("Independent of the Data Scope filters on this page: the snapshot covers the default work types.")}</p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div role="group" aria-label={t("Collection")} className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-900">
            {COLLECTIONS.map((c) => (
              <button key={c.id} type="button" aria-pressed={collection === c.id} onClick={() => choose(c.id)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${collection === c.id ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white" : "text-slate-600 dark:text-slate-400"}`}>
                {t(c.label)}
              </button>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            {t("Reference population")}
            <select value={byField ? "field" : baseline} disabled={byField} onChange={(event) => { setBaseline(event.target.value as TrendBaselineLevel); setPage(1); }} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
              {BASELINES.map((level) => <option key={level} value={level}>{baselineName(level, t)}</option>)}
            </select>
          </label>
        </div>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{t(current.description)}</p>
        {byField && <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{t("Each topic is tested against its own field; the correction family is the whole field.")}</p>}
      </div>

      {query.isLoading ? (
        <div role="status" aria-label={t("Loading Discover trends")} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#121212]"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
      ) : query.isError || !data ? (
        <div role="alert" className="rounded-2xl border border-red-200 bg-white p-5 text-sm dark:border-red-900 dark:bg-[#121212]">
          <p className="font-semibold text-slate-900 dark:text-white">{t("Discover trends could not be loaded.")}</p>
          <button type="button" className="mt-2 text-xs font-semibold text-blue-600 hover:underline" onClick={() => { void query.refetch(); }}>{t("Retry")}</button>
        </div>
      ) : data.status === "unavailable" ? (
        <div role="status" data-testid="discover-unavailable" className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm dark:border-slate-700 dark:bg-[#121212]">
          <p className="font-semibold text-slate-900 dark:text-white">{t("Discover trends are not available yet.")}</p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            {data.unavailableReason === "SNAPSHOT_STORE_UNAVAILABLE"
              ? t("The store of precomputed OpenAlex snapshots is not set up in this environment.")
              : t("No validated OpenAlex snapshot is active.")}{" "}
            {t("Nothing is shown instead: library counts are not research trends.")}
          </p>
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#121212]">
          {data.provenance && <SnapshotProvenanceNote provenance={data.provenance} />}
          {byField && !fieldId ? (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {(data.fields ?? []).map((field) => (
                <article key={field.fieldId} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800" aria-labelledby={`field-${field.fieldId}`}>
                  <h3 id={`field-${field.fieldId}`} className="text-sm font-bold text-slate-900 dark:text-white">{field.fieldName}</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">{t("{{topics}} topics · {{rising}} rising · BH family of {{family}}", { topics: field.topicsInField, rising: field.risingTopics, family: field.qFamilySize })}</p>
                  {field.topics.length ? (
                    <ul>{field.topics.map((item) => <DiscoverTopicRow key={item.topicId} item={item} showGgt={false} />)}</ul>
                  ) : <p className="mt-2 text-xs text-slate-500">{t("No rising topic in this field.")}</p>}
                  {field.risingTopics > field.topics.length && (
                    <button type="button" className="mt-1 text-xs font-semibold text-blue-600 hover:underline" onClick={() => { setFieldId(field.fieldId); setPage(1); }}>{t("Show all {{n}} rising topics", { n: field.risingTopics })}</button>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <>
              {byField && fieldId && (
                <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline" onClick={() => { setFieldId(undefined); setPage(1); }}><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />{t("All fields")}{data.fields?.[0] ? ` · ${data.fields[0].fieldName}` : ""}</button>
              )}
              {data.items.length ? (
                <ol aria-label={t(current.label)}>{data.items.map((item) => <DiscoverTopicRow key={item.topicId} item={item} showGgt={collection === "fastest_growing"} />)}</ol>
              ) : (
                <p className="text-sm text-slate-600 dark:text-slate-400">{t("No topic meets the criteria in this snapshot.")}</p>
              )}
              <Pager page={page} total={data.total} pageSize={PAGE_SIZE} onPage={setPage} />
            </>
          )}
          <Excluded data={data} />
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{t(current.rule)}</p>
        </div>
      )}
    </section>
  );
}
