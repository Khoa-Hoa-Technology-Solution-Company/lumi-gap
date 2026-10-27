import { ArrowRight } from "lucide-react";
import type { TrendVerdict } from "@trend/shared-types";
import { formatNumber } from "@/utils";
import { useI18n } from "@/i18n";
import { verdictLabel } from "./trend-verdict-badge";

export type VerdictFilter = TrendVerdict | "all";

export const VERDICT_ORDER: TrendVerdict[] = ["rising", "stable", "declining", "insufficient"];

/** Topics loaded per page of a verdict list. */
export const VERDICT_PAGE_SIZE = 20;

export function isVerdictFilter(value: string | null): value is VerdictFilter {
  return value === "all" || VERDICT_ORDER.includes(value as TrendVerdict);
}

/** Filter chips above a topic table: all tested topics or one verdict, with counts. */
export function VerdictFilterChips({
  value,
  onChange,
  counts,
  tested,
  className = "",
}: {
  value: VerdictFilter;
  onChange: (value: VerdictFilter) => void;
  counts?: Record<TrendVerdict, number>;
  tested: number;
  className?: string;
}) {
  const { t } = useI18n();
  const options: Array<{ id: VerdictFilter; label: string; count: number | undefined }> = [
    { id: "all", label: t("All tested"), count: tested },
    ...VERDICT_ORDER.map((verdict) => ({ id: verdict, label: verdictLabel(verdict, t), count: counts?.[verdict] })),
  ];
  return (
    <div role="radiogroup" aria-label={t("Filter topics by verdict")} className={`flex flex-wrap gap-1.5 ${className}`}>
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.id)}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 ${
              selected
                ? "border-blue-800/10 bg-blue-700 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            }`}
          >
            {option.label}
            {option.count !== undefined && (
              <span className={`rounded-full px-1.5 text-[10.5px] ${selected ? "bg-white/20" : "bg-slate-100 dark:bg-slate-800"}`}>{formatNumber(option.count)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** One verdict count that opens the list of those topics. */
export function VerdictCountButton({
  verdict,
  count,
  onSelect,
  className = "",
}: {
  verdict: TrendVerdict;
  count: number;
  onSelect: (verdict: TrendVerdict) => void;
  className?: string;
}) {
  const { t } = useI18n();
  const label = verdictLabel(verdict, t);
  return (
    <button
      type="button"
      onClick={() => onSelect(verdict)}
      aria-label={t("Show the {{count}} topics: {{verdict}}", { count: formatNumber(count), verdict: label })}
      className={`group flex w-full flex-col items-start rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 dark:border-slate-800 dark:bg-slate-900/30 dark:hover:border-blue-800 dark:hover:bg-blue-950/20 ${className}`}
    >
      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{label}</span>
      <span className="flex w-full items-center justify-between gap-2">
        <span className="text-xl font-black text-slate-900 dark:text-white">{formatNumber(count)}</span>
        <ArrowRight className="h-3.5 w-3.5 text-slate-300 transition-colors group-hover:text-blue-600 dark:text-slate-600" aria-hidden="true" />
      </span>
    </button>
  );
}

/** "Showing 20 of 40 stable topics" under a verdict list. */
export function useVerdictListCaption() {
  const { t } = useI18n();
  return (shown: number, matched: number, filter: VerdictFilter) =>
    filter === "all"
      ? t("Showing {{shown}} of {{matched}} topics tested", { shown: formatNumber(shown), matched: formatNumber(matched) })
      : t("Showing {{shown}} of {{matched}} topics: {{verdict}}", { shown: formatNumber(shown), matched: formatNumber(matched), verdict: verdictLabel(filter, t) });
}
