import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CalendarRange, Info, LineChart } from "lucide-react";
import type { TrendGranularity, TrendPeriodWindow, TrendPeriodsOverview, TrendingPeriodTopic } from "@trend/shared-types";
import { formatNumber } from "@/utils";
import { useI18n } from "@/i18n";
import { useTrendPeriodsPages } from "../hooks/use-trends";
import type { TrendPeriodsParams } from "../api/trends.api";
import { DataSourceBadge, ScopeNotice } from "./trend-data-source";
import { TrendHowLink, TrendVerdictBadge } from "./trend-verdict-badge";
import { VERDICT_ORDER, VERDICT_PAGE_SIZE, VerdictCountButton, VerdictFilterChips, useVerdictListCaption, type VerdictFilter } from "./verdict-filter";
import { formatSigned } from "../../../pages/trends.insights";

type Translate = ReturnType<typeof useI18n>["t"];

/** Mann–Kendall needs 5 points to reach p < 0.05 (trend.verdict.ts MIN_YEARS). */
const MIN_PERIODS = 5;

const PRESETS: Array<{ id: string; label: string; granularity: TrendGranularity; window: TrendPeriodWindow; periods?: number }> = [
  { id: "ytd-month", label: "This year, by month", granularity: "month", window: "year-to-date" },
  { id: "12-months", label: "Last 12 months", granularity: "month", window: "rolling", periods: 12 },
  { id: "24-months", label: "Last 24 months", granularity: "month", window: "rolling", periods: 24 },
  { id: "ytd-quarter", label: "This year, by quarter", granularity: "quarter", window: "year-to-date" },
  { id: "8-quarters", label: "Last 8 quarters", granularity: "quarter", window: "rolling", periods: 8 },
];

export type TrendPeriodsScope = Omit<TrendPeriodsParams, "granularity" | "window" | "periods" | "limit">;

/** "2026-09" → "09/2026"; quarters stay "2026-Q3". */
export function formatPeriodKey(key: string): string {
  const month = /^(\d{4})-(\d{2})$/.exec(key);
  return month ? `${month[2]}/${month[1]}` : key;
}

function relativeChangePerPeriod(value: number | null, granularity: TrendGranularity, t: Translate): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  const formatted = formatSigned(value, 1);
  return granularity === "month" ? t("{{value}}% per month", { value: formatted }) : t("{{value}}% per quarter", { value: formatted });
}

/**
 * Trends by month or quarter (GET /trends/periods): the yearly verdict run on
 * shorter periods, so "this year" or the last few months can be judged.
 */
export function PeriodsTab({ scope, onOpenTopic }: { scope: TrendPeriodsScope; onOpenTopic: (topic: string, openalexTopicId?: string) => void }) {
  const { t } = useI18n();
  const [presetId, setPresetId] = useState(PRESETS[1]!.id);
  const preset = PRESETS.find((item) => item.id === presetId) ?? PRESETS[1]!;
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>("all");
  const pages = useTrendPeriodsPages({
    ...scope,
    granularity: preset.granularity,
    window: preset.window,
    periods: preset.periods,
    limit: VERDICT_PAGE_SIZE,
    ...(verdictFilter === "all" ? {} : { verdict: verdictFilter }),
  });
  const { isLoading, isFetching, isError } = pages;
  // Counts, periods and totals are the same on every page; topics are paged.
  const data = pages.data?.pages[0];
  const topics = useMemo(() => pages.data?.pages.flatMap((page) => page.topics) ?? [], [pages.data]);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#121212]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <p className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-blue-600 dark:text-blue-400">
              <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />
              {t("Trends by month and quarter")}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {t("The same test as the yearly verdict (the topic's share of its field), run on months or quarters so this year and recent months can be judged. The running period is shown but not tested.")}{" "}
              <TrendHowLink className="whitespace-nowrap" />
            </p>
          </div>
          <DataSourceBadge source={data?.dataSource} />
        </div>
        <div role="radiogroup" aria-label={t("Time window")} className="mt-4 flex flex-wrap gap-2">
          {PRESETS.map((item) => {
            const selected = item.id === preset.id;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setPresetId(item.id)}
                className={`h-9 rounded-lg border px-3 text-xs font-bold transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 ${
                  selected
                    ? "border-blue-800/10 bg-blue-700 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                }`}
              >
                {t(item.label)}
              </button>
            );
          })}
        </div>
        {data && <ScopeNotice notice={data.scopeNotice} className="mt-3" />}
      </section>

      {isError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {t("Could not load the trends by period. Please try again.")}
        </p>
      ) : isLoading && !data ? (
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" aria-busy="true" />
      ) : data ? (
        <PeriodsContent
          data={data}
          topics={topics}
          isFetching={isFetching}
          onOpenTopic={onOpenTopic}
          verdictFilter={verdictFilter}
          onVerdictFilter={setVerdictFilter}
          hasMore={Boolean(pages.hasNextPage)}
          loadingMore={pages.isFetchingNextPage}
          onLoadMore={() => void pages.fetchNextPage()}
        />
      ) : null}
    </div>
  );
}

function PeriodsContent({
  data,
  topics,
  isFetching,
  onOpenTopic,
  verdictFilter,
  onVerdictFilter,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  data: TrendPeriodsOverview;
  topics: TrendingPeriodTopic[];
  isFetching: boolean;
  onOpenTopic: (topic: string, openalexTopicId?: string) => void;
  verdictFilter: VerdictFilter;
  onVerdictFilter: (value: VerdictFilter) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}) {
  const { t } = useI18n();
  const verdictCaption = useVerdictListCaption();
  const openVerdict = (value: VerdictFilter) => {
    onVerdictFilter(value);
    window.setTimeout(() => document.getElementById("trend-period-topics")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };
  const completePeriods = data.periods.filter((period) => period.complete).length;
  const running = data.periods.find((period) => !period.complete);
  const unit = data.granularity === "month" ? t("months") : t("quarters");
  const chartData = useMemo(
    () => data.periodTotalPapers.map((row, index) => ({ label: formatPeriodKey(row.period), count: row.count, complete: data.periods[index]?.complete ?? true })),
    [data],
  );

  return (
    <div className={`space-y-5 transition-opacity ${isFetching ? "opacity-70" : ""}`}>
      {completePeriods < MIN_PERIODS && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-medium text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t("Only {{count}} complete {{unit}} so far: a verdict needs at least 5. Pick a rolling window to judge recent trends now.", { count: completePeriods, unit })}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Stat label={t("Papers in window")} value={formatNumber(data.totalPapersInWindow)} />
        <Stat label={t("Complete {{unit}} tested", { unit })} value={formatNumber(completePeriods)} />
        {VERDICT_ORDER.map((verdict) => (
          <VerdictCountButton
            key={verdict}
            verdict={verdict}
            count={data.verdictCounts[verdict]}
            onSelect={openVerdict}
            className="rounded-xl border-slate-200/70 bg-white p-3 dark:bg-[#121212]"
          />
        ))}
      </div>

      <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#121212]">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t("Papers per period in this scope")}</h3>
        {running && (
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {t("{{period}} is still running and still being indexed; it is not tested.", { period: formatPeriodKey(running.key) })}
          </p>
        )}
        <div className="mt-3 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-800" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} width={56} tickFormatter={(value: number) => formatNumber(value)} />
              <RechartsTooltip formatter={(value: number) => formatNumber(value)} />
              <Area type="monotone" dataKey="count" name={t("Papers")} stroke="#1d4ed8" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section id="trend-period-topics" className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm dark:border-slate-800 dark:bg-[#121212]">
        <div className="border-b border-slate-100 p-5 pb-4 dark:border-slate-800/50">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t("Topics by trend")}</h3>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {verdictCaption(topics.length, data.matchedTopicCount ?? topics.length, verdictFilter)}
            {". "}
            {data.candidateStrata
              ? t("Tested: the largest topics of the scope plus the {{per}} largest of each of its {{strata}} {{level}}, so smaller fields are tested too.", {
                  per: data.candidateStrata.perStratum,
                  strata: formatNumber(data.candidateStrata.strata),
                  level: data.candidateStrata.level === "field" ? t("fields") : t("subfields"),
                })
              : null}
          </p>
          <VerdictFilterChips className="mt-3" value={verdictFilter} onChange={onVerdictFilter} counts={data.verdictCounts} tested={data.testedTopicCount} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/50 text-xs uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/20">
              <tr>
                <th className="w-12 py-3 pl-5 pr-2 text-center font-semibold">#</th>
                <th className="min-w-[240px] px-3 py-3 font-semibold">{t("Topic")}</th>
                <th className="px-3 py-3 font-semibold">{t("Papers per period")}</th>
                <th className="px-3 py-3 font-semibold">{t("Trend")}</th>
                <th className="px-3 py-3 font-semibold">{t("Relative change")}</th>
                <th className="px-3 py-3 text-right font-semibold">{t("Papers")}</th>
                <th className="py-3 pl-2 pr-5" aria-label={t("Actions")} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {topics.map((topic, index) => {
                const classification = topic.classification;
                const change = relativeChangePerPeriod(classification.relativeChangePct, data.granularity, t);
                const changeColor = classification.verdict === "rising"
                  ? "text-emerald-700 dark:text-emerald-400"
                  : classification.verdict === "declining"
                    ? "text-red-600 dark:text-red-400"
                    : "text-slate-600 dark:text-slate-400";
                return (
                  <tr key={topic.taxonomy?.openalexTopicId ?? topic.topic} className="hover:bg-slate-50/55 dark:hover:bg-slate-800/10">
                    <td className="py-3 pl-5 pr-2 text-center font-mono text-xs font-bold text-slate-400">{index + 1}</td>
                    <td className="px-3 py-3">
                      <span className="block text-sm font-bold leading-snug text-slate-900 dark:text-white">{topic.topic}</span>
                      {topic.taxonomy?.fieldName && (
                        <span className="block max-w-[260px] truncate text-[10.5px] font-semibold text-slate-400 dark:text-slate-500">
                          {topic.taxonomy.domainName} / {topic.taxonomy.fieldName}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Sparkline values={topic.periodBreakdown.map((row) => row.count)} />
                    </td>
                    <td className="px-3 py-3">
                      <TrendVerdictBadge classification={classification} size="sm" unit="period" />
                    </td>
                    <td className="px-3 py-3">
                      {classification.verdict === "insufficient" ? (
                        <span className="text-[11px] font-semibold text-slate-400">—</span>
                      ) : (
                        <span className={`whitespace-nowrap font-mono text-sm font-extrabold ${changeColor}`}>{change ?? "—"}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">{formatNumber(topic.totalPapers)}</td>
                    <td className="py-3 pl-2 pr-5 text-center">
                      <button
                        type="button"
                        onClick={() => onOpenTopic(topic.topic, topic.taxonomy?.openalexTopicId)}
                        title={t("Open the yearly trend of this topic")}
                        aria-label={t("Open the yearly trend of this topic")}
                        className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-blue-700 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                      >
                        <LineChart className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {topics.length === 0 && (
            <p className="p-5 text-sm text-slate-500">
              {verdictFilter === "all" ? t("No topic has enough papers in this window.") : t("No tested topic has this verdict in this scope.")}
            </p>
          )}
        </div>
        {hasMore && (
          <div className="border-t border-slate-100 p-3 text-center dark:border-slate-800">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loadingMore}
              className="h-9 rounded-lg border border-slate-200 px-4 text-xs font-bold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-50 disabled:opacity-60 dark:border-slate-800 dark:text-blue-400 dark:hover:bg-blue-950/20"
            >
              {loadingMore ? t("Loading...") : t("Show more topics")}
            </button>
          </div>
        )}
      </section>

      <p className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {t("Works dated only by year are filed under January, and the latest months are still being indexed. The test uses the share of the field, which cancels most of both, but read January and the last complete month with care. Short periods are noisier than years: a monthly verdict describes recent movement, not a lasting trend.")}
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200/70 bg-white p-3 dark:border-slate-800 dark:bg-[#121212]">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const data = values.map((value, index) => ({ index, value }));
  return (
    <div className="h-8 w-28" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <Area type="monotone" dataKey="value" stroke="#2563eb" fill="#3b82f6" fillOpacity={0.12} strokeWidth={1.5} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
