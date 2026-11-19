import { Link } from "react-router-dom";
import { Info, Loader2, Search } from "lucide-react";
import type { EmergingKeyword, TrendEmergingResponse } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { formatNumber } from "@/utils";
import { useTrendEmerging } from "../hooks/use-trends";
import {
  buildEmergingParams,
  buildSparkBars,
  emergingView,
  emergingWindowYears,
  formatLogOddsRatio,
  formatNoveltyPercent,
  formatPeriodYears,
  formatQCell,
  formatZ,
} from "../emerging";
import { getRisingKeywordTarget } from "../trend-navigation";
import { ScopeNotice } from "./trend-data-source";

interface EmergingTabProps {
  subfieldIds: string[];
  topicIds: string[];
}

/** "Emerging signals" tab: keywords that are new and rising fast (spec 2026-11-14 §7.3). Mounted only while the tab is open, so the slow first request is not made earlier. */
export function EmergingTab({ subfieldIds, topicIds }: EmergingTabProps) {
  const query = useTrendEmerging(buildEmergingParams({ subfieldIds, topicIds }));
  return <EmergingPanel data={query.data} isLoading={query.isLoading} isError={query.isError} onRetry={() => void query.refetch()} />;
}

export interface EmergingPanelProps {
  data?: TrendEmergingResponse;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

/** Presentational part of the tab, without the request, so it can be rendered with a given response. */
export function EmergingPanel({ data, isLoading, isError, onRetry }: EmergingPanelProps) {
  const { t } = useI18n();
  return (
    <div className="space-y-5" data-testid="emerging-tab">
      <div role="note" className="flex items-start gap-3 rounded-xl border border-amber-200/70 bg-amber-50/60 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">{t("Early signal, not a forecast")}</h3>
          <p className="mt-1 text-xs leading-relaxed text-amber-900/90 dark:text-amber-200/90">
            {t("Emerging signals are keywords that are new and growing fast. They are counted on keywords and are separate from the six topic verdicts: they never change a verdict and do not predict what will happen next.")}
          </p>
        </div>
      </div>

      {isError && !data ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <p>{t("Could not load the emerging signals. Please try again.")}</p>
          {onRetry && (
            <button type="button" onClick={onRetry} className="mt-2 rounded-lg border border-red-300 px-3 py-1 text-xs font-bold hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-950/50">
              {t("Retry")}
            </button>
          )}
        </div>
      ) : isLoading && !data ? (
        <div role="status" aria-busy="true" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-[#121212] dark:text-slate-300">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-600" />
          <span>{t("Counting keywords in OpenAlex. The first request can take about 15 seconds; later ones are faster.")}</span>
        </div>
      ) : data ? (
        <EmergingContent data={data} />
      ) : null}
    </div>
  );
}

function EmergingContent({ data }: { data: TrendEmergingResponse }) {
  const { t } = useI18n();
  const view = emergingView(data);
  return (
    <>
      <ScopeNotice notice={data.scopeNotice} />
      {view === "local" ? (
        <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
          {t("Emerging signals need OpenAlex keyword counts; the local corpus cannot compute them.")}
        </p>
      ) : (
        <>
          <CriteriaCard data={data} />
          {view === "empty" ? (
            <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-300">
              {t("No keyword meets every criterion in this scope. Try a wider scope.")}
            </p>
          ) : (
            <SignalsTable data={data} />
          )}
        </>
      )}
    </>
  );
}

function CriteriaCard({ data }: { data: TrendEmergingResponse }) {
  const { t } = useI18n();
  const { criteria, earlierPeriod, recentPeriod } = data;
  const shown = data.keywords.length;
  return (
    <section aria-labelledby="emerging-criteria-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#121212]">
      <h3 id="emerging-criteria-heading" className="text-base font-bold text-slate-900 dark:text-white">{t("How a signal is chosen")}</h3>
      <dl className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-slate-500">{t("Earlier period")}</dt>
          <dd className="mt-0.5 font-mono text-slate-900 dark:text-white">
            {formatPeriodYears(earlierPeriod)} · {t("{{count}} papers", { count: formatNumber(earlierPeriod.papers) })}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-500">{t("Recent period")}</dt>
          <dd className="mt-0.5 font-mono text-slate-900 dark:text-white">
            {formatPeriodYears(recentPeriod)} · {t("{{count}} papers", { count: formatNumber(recentPeriod.papers) })}
          </dd>
        </div>
      </dl>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
        <li>{t("At least {{min}} papers in the recent period.", { min: formatNumber(criteria.minRecentPapers) })}</li>
        <li>
          {t("Novelty: at least {{share}} of the keyword's papers of the last {{years}} years fall in the recent period.", {
            share: formatNoveltyPercent(criteria.noveltyShare),
            years: emergingWindowYears(data),
          })}
        </li>
        <li>{t("Its share rises significantly from the earlier to the recent period (log odds ratio, z > 0 and Benjamini–Hochberg q < {{alpha}}).", { alpha: criteria.significanceLevel })}</li>
      </ol>
      <p className="mt-3 text-xs font-semibold text-slate-800 dark:text-slate-200">
        {t("{{tested}} keywords tested, {{found}} signals found.", { tested: formatNumber(data.termsTested), found: formatNumber(data.matchedCount) })}
        {shown < data.matchedCount ? ` ${t("Showing the {{shown}} with the largest rise.", { shown: formatNumber(shown) })}` : ""}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
        {t("Only the most frequent keywords of the recent period are tested, so a rare new keyword can be missed.")}
      </p>
    </section>
  );
}

function SignalsTable({ data }: { data: TrendEmergingResponse }) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="emerging-table-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#121212]">
      <h3 id="emerging-table-heading" className="text-base font-bold text-slate-900 dark:text-white">{t("Emerging keywords")}</h3>
      <p className="mb-3 mt-1 text-[11px] leading-relaxed text-slate-500">
        {t("Ordered by the log odds ratio (size of the rise), not by z, so a keyword with many papers does not outrank a sharper rise. The lighter dashed last bar is {{year}}, which is still running.", { year: data.lastCompleteYear + 1 })}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-400 dark:border-slate-800">
              <th scope="col" className="py-1.5 pr-2 text-left font-semibold">{t("Keyword")}</th>
              <th scope="col" className="px-2 py-1.5 text-right font-semibold">{t("Papers, earlier → recent")}</th>
              <th scope="col" className="px-2 py-1.5 text-right font-semibold">{t("Novelty")}</th>
              <th scope="col" className="px-2 py-1.5 text-right font-semibold">{t("Log odds ratio")}</th>
              <th scope="col" className="px-2 py-1.5 text-right font-semibold normal-case">z</th>
              <th scope="col" className="px-2 py-1.5 text-right font-semibold normal-case">q</th>
              <th scope="col" className="py-1.5 pl-2 text-right font-semibold">{t("Papers per year")}</th>
            </tr>
          </thead>
          <tbody className="whitespace-nowrap">
            {data.keywords.map((keyword) => (
              <SignalRow key={keyword.keyword} keyword={keyword} lastCompleteYear={data.lastCompleteYear} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SignalRow({ keyword, lastCompleteYear }: { keyword: EmergingKeyword; lastCompleteYear: number }) {
  const { t } = useI18n();
  return (
    <tr className="border-b border-slate-50 dark:border-slate-900">
      <td className="py-2 pr-2">
        <Link
          to={getRisingKeywordTarget(keyword.keyword)}
          aria-label={t("Search papers for {{keyword}}", { keyword: keyword.keyword })}
          className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline dark:text-blue-400"
        >
          <Search className="h-3 w-3 shrink-0" aria-hidden="true" />
          {keyword.keyword}
        </Link>
      </td>
      <td className="px-2 py-2 text-right font-mono text-slate-900 dark:text-white">
        {formatNumber(keyword.earlierPapers)} → {formatNumber(keyword.recentPapers)}
      </td>
      <td className="px-2 py-2 text-right font-mono text-slate-900 dark:text-white">{formatNoveltyPercent(keyword.noveltyShare)}</td>
      <td className="px-2 py-2 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">{formatLogOddsRatio(keyword.shift.logOddsRatio)}</td>
      <td className="px-2 py-2 text-right font-mono text-slate-700 dark:text-slate-300">{formatZ(keyword.shift.z)}</td>
      <td className="px-2 py-2 text-right font-mono text-slate-700 dark:text-slate-300">{formatQCell(keyword.shift.qValue)}</td>
      <td className="py-2 pl-2 text-right">
        <YearBars keyword={keyword} lastCompleteYear={lastCompleteYear} />
      </td>
    </tr>
  );
}

const BAR_W = 5;
const BAR_GAP = 2;
const BAR_H = 22;

/** Small bar sparkline of the yearly breakdown; a year that is still running is drawn with a lighter, dashed bar. */
function YearBars({ keyword, lastCompleteYear }: { keyword: EmergingKeyword; lastCompleteYear: number }) {
  const { t } = useI18n();
  const bars = buildSparkBars(keyword.yearlyBreakdown, lastCompleteYear);
  if (bars.length === 0) return <span className="text-slate-400">—</span>;
  const width = bars.length * (BAR_W + BAR_GAP) - BAR_GAP;
  const label = bars.map((bar) => `${bar.year}: ${bar.count}${bar.partial ? ` (${t("incomplete")})` : ""}`).join(", ");
  return (
    <svg role="img" aria-label={label} width={width} height={BAR_H} viewBox={`0 0 ${width} ${BAR_H}`} className="ml-auto inline-block text-blue-600 dark:text-blue-400">
      <title>{label}</title>
      {bars.map((bar, index) => {
        const h = Math.max(bar.count > 0 ? 1 : 0, bar.height * (BAR_H - 1));
        return (
          <rect
            key={bar.year}
            x={index * (BAR_W + BAR_GAP)}
            y={BAR_H - h}
            width={BAR_W}
            height={h}
            rx={1}
            fill="currentColor"
            fillOpacity={bar.partial ? 0.3 : 0.9}
            stroke={bar.partial ? "currentColor" : "none"}
            strokeDasharray={bar.partial ? "2 1" : undefined}
            strokeWidth={bar.partial ? 0.75 : 0}
          />
        );
      })}
    </svg>
  );
}
