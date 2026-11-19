import { TREND_SIZE_BANDS, type TrendCrossTopicAnalysis, type TrendSizeBand } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { formatNumber } from "@/utils";
import { bandCutoffText } from "../cross-topic";
import { sizeBandLabel } from "./cross-topic-section";

/** Multi-select chips for the size group of the topics (tertiles of total papers); none selected = every size. */
export function SizeBandFilter({
  value,
  onChange,
  cutoffs,
  className = "",
}: {
  value: TrendSizeBand[];
  onChange: (value: TrendSizeBand[]) => void;
  cutoffs?: TrendCrossTopicAnalysis["bandCutoffs"];
  className?: string;
}) {
  const { t } = useI18n();
  const toggle = (band: TrendSizeBand) => {
    const next = value.includes(band) ? value.filter((item) => item !== band) : [...value, band];
    onChange(TREND_SIZE_BANDS.filter((item) => next.includes(item)));
  };
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400" title={t("Size group: tertiles of the topics' total papers in the window, over the whole scope.")}>{t("Size group")}</span>
      <div role="group" aria-label={t("Filter topics by size group")} className="flex flex-wrap gap-1.5">
        {TREND_SIZE_BANDS.map((band) => {
          const selected = value.includes(band);
          return (
            <button
              key={band}
              type="button"
              aria-pressed={selected}
              title={cutoffs ? bandCutoffText(band, cutoffs, formatNumber, t) : undefined}
              onClick={() => toggle(band)}
              className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-bold transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 ${
                selected
                  ? "border-blue-800/10 bg-blue-700 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
              }`}
            >
              {sizeBandLabel(band, t)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** "Clear" pill and size group of a topic row; renders nothing for a topic without cross-topic labels. */
export function TopicCrossLabels({ labels }: { labels: { sizeBand: TrendSizeBand; outlier: boolean; clear: boolean } | undefined }) {
  const { t } = useI18n();
  if (!labels) return null;
  return (
    <span className="inline-flex items-center gap-1.5">
      {labels.clear && (
        <span
          className="cursor-help rounded-full border border-violet-300 bg-violet-50 px-1.5 py-px text-[10px] font-bold text-violet-800 dark:border-violet-800/70 dark:bg-violet-950/30 dark:text-violet-300"
          title={t("Its change is anomalous for topics of its size (Tukey fences)")}
        >
          {t("Clear change")}
        </span>
      )}
      <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">{sizeBandLabel(labels.sizeBand, t)}</span>
    </span>
  );
}
