import React from "react";
import { BookOpen, X, FileText, Calendar } from "lucide-react";
import type { TrendFacetBucket, TrendingTopic } from "@trend/shared-types";
import { formatMetricValue, type TrendSortKey } from "../../../pages/trends.insights";
import { formatNumber } from "@/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useI18n } from "@/i18n";

// Types
export type TooltipPayload<TPayload> = Array<{ payload: TPayload }>;

export type TrendBarDatum = Pick<TrendingTopic, "topic" | "taxonomy" | "totalPapers" | "growthRatePct" | "momentum"> & {
  metricLabel: string;
  metricDisplay: string;
};

export type TrendBarChartDatum = TrendBarDatum & {
  value: number;
};

export type RisingKeywordRow = {
  keyword: string;
  growthRatePct: number;
  growth: string;
  totalPapers: number;
  yearlyBreakdown: TrendingTopic["yearlyBreakdown"];
  status: "Hot" | "Rising";
};

// 1. CustomBarTooltip Component
export function CustomBarTooltip({ active, payload, sortBy }: { active?: boolean, payload?: TooltipPayload<TrendBarDatum>, sortBy: TrendSortKey }) {
  if (active && payload && payload.length && payload[0]) {
    const data = payload[0].payload;
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-lg text-xs select-none">
        <p className="font-extrabold text-slate-900 dark:text-white mb-2">{data.topic}</p>
        <div className="space-y-1.5 text-slate-600 dark:text-slate-400 font-medium">
          <p className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-bold bg-blue-50/50 dark:bg-blue-950/20 px-2 py-1 rounded">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            {data.metricLabel}: {data.metricDisplay}
          </p>
          <p>Total papers: <span className="text-slate-900 dark:text-white font-bold">{formatNumber(data.totalPapers)}</span></p>
          <p>Growth: <span className="text-slate-900 dark:text-white font-bold">{formatMetricValue(data.growthRatePct, sortBy)}</span></p>
          <p>Momentum: <span className="text-slate-900 dark:text-white font-bold">{formatMetricValue(data.momentum, sortBy)}</span></p>
        </div>
      </div>
    );
  }
  return null;
}

// 2. FacetGroup Component
export function FacetGroup({
  title,
  buckets,
  total,
  activeValues = [],
  onBucketClick,
}: {
  title: string;
  buckets: TrendFacetBucket[];
  total: number;
  activeValues?: string[];
  onBucketClick?: (value: string, openalexId?: string) => void;
}) {
  return (
    <div className="space-y-3.5">
      <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{title}</h4>
      <div className="space-y-2.5">
        {(buckets ?? []).slice(0, 4).map((b) => {
          const isSelected = activeValues.includes(b.id || b.name) || (b.openalexId && activeValues.includes(b.openalexId));
          const percentage = total > 0 ? Math.min(100, Math.round((b.count / total) * 100)) : 0;
          return (
            <div
              key={b.id || b.name}
              onClick={() => onBucketClick?.(b.id || b.name, b.openalexId)}
              className={`text-xs group cursor-pointer p-1.5 rounded-lg border transition-all duration-150 select-none ${
                isSelected
                  ? "bg-blue-50/70 border-blue-200 dark:bg-blue-950/20 dark:border-blue-900/30"
                  : "border-transparent hover:bg-slate-50 dark:hover:bg-slate-900/30"
              }`}
            >
              <div className="flex justify-between items-center font-semibold text-slate-700 dark:text-slate-350 mb-1.5 gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors shrink-0 ${
                    isSelected
                      ? "bg-blue-600 border-blue-600 dark:bg-blue-550 dark:border-blue-550 text-white"
                      : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 group-hover:border-blue-500"
                  }`}>
                    {isSelected && (
                      <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="truncate capitalize font-bold leading-none text-slate-850 dark:text-slate-200" title={b.name}>{b.name}</span>
                </div>
                <span className="text-slate-500 dark:text-slate-400 font-medium text-[11px] shrink-0">{formatNumber(b.count)}</span>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="w-full bg-slate-105 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden cursor-help">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isSelected ? "bg-blue-600 dark:bg-blue-400" : "bg-blue-600/60 dark:bg-blue-500/50 group-hover:bg-blue-600"
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="bg-popover text-popover-foreground border shadow-sm text-xs p-2">
                  Represents <strong>{percentage}%</strong> of the current filtered dataset scope ({formatNumber(b.count)} / {formatNumber(total)} papers).
                </TooltipContent>
              </Tooltip>
            </div>
          );
        })}
        {(!buckets || buckets.length === 0) && (
          <p className="text-xs text-slate-450 italic pl-1.5">No data</p>
        )}
      </div>
    </div>
  );
}

// 3. KPICard Component
export function KPICard({ title, value, trend, subtitle, icon }: { title: string, value: string, trend?: string, subtitle?: string, icon: React.ReactNode }) {
  const { t } = useI18n();

  return (
    <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm flex flex-col justify-between">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 tracking-wider mb-2 uppercase">{t(title)}</h4>
          <div className="text-2xl font-bold text-slate-900 dark:text-white leading-none">{value}</div>
        </div>
        <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg shrink-0">
          {icon}
        </div>
      </div>

      <div>
        {trend && (
          <div className="text-xs font-bold text-emerald-600 flex items-center gap-1 mt-2">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
            {t(trend)}
          </div>
        )}
        {subtitle && (
          <div className="text-xs font-medium text-slate-500 flex items-center gap-1.5 mt-2">
            <div className="w-3 h-3 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
               <BookOpen className="w-2 h-2 text-slate-400" />
            </div>
            {t(subtitle)}
          </div>
        )}
      </div>
    </div>
  );
}

// 4. InsightCard Component
export function InsightCard({
  label,
  value,
  taxonomyPath,
  detail,
  meaning,
  sourceHint,
  actionLabel,
  onAction,
  variant = "primary",
  badge,
}: {
  label: string;
  value: string;
  taxonomyPath?: string;
  detail: string;
  meaning?: string;
  sourceHint?: string;
  actionLabel?: string;
  onAction?: () => void;
  variant?: "primary" | "warning" | "neutral" | "success";
  badge?: React.ReactNode;
}) {
  const { t } = useI18n();
  const hasAction = !!actionLabel && !!onAction;

  const variantStyles = {
    primary: {
      card: "bg-blue-50/15 dark:bg-blue-950/5 border-blue-200/50 dark:border-blue-900/30",
      label: "text-blue-600 dark:text-blue-400",
      gradient: "from-blue-500/5 to-indigo-500/5 dark:from-blue-500/10 dark:to-indigo-500/10",
      btn: "text-blue-700 dark:text-blue-400 hover:text-blue-800"
    },
    warning: {
      card: "bg-amber-50/20 dark:bg-amber-950/5 border-amber-200/40 dark:border-amber-900/20",
      label: "text-amber-700 dark:text-amber-400",
      gradient: "from-amber-500/5 to-yellow-500/5 dark:from-amber-500/10 dark:to-yellow-500/10",
      btn: "text-amber-700 dark:text-amber-400 hover:text-amber-800"
    },
    neutral: {
      card: "bg-slate-50/30 dark:bg-slate-900/10 border-slate-200/50 dark:border-slate-800/60",
      label: "text-slate-500 dark:text-slate-400",
      gradient: "from-slate-500/5 to-zinc-500/5 dark:from-slate-500/10 dark:to-zinc-500/10",
      btn: "text-slate-650 dark:text-slate-400 hover:text-slate-850"
    },
    success: {
      card: "bg-emerald-50/20 dark:bg-emerald-950/5 border-emerald-200/40 dark:border-emerald-900/20",
      label: "text-emerald-700 dark:text-emerald-400",
      gradient: "from-emerald-500/5 to-teal-500/5 dark:from-emerald-500/10 dark:to-teal-500/10",
      btn: "text-emerald-700 dark:text-emerald-400 hover:text-emerald-800"
    }
  }[variant];

  return (
    <div
      onClick={() => hasAction && onAction?.()}
      className={`relative overflow-hidden border rounded-2xl p-5 shadow-sm transition-all duration-300 group flex flex-col justify-between min-h-[190px] ${variantStyles.card} ${
        hasAction
          ? "hover:shadow-md hover:scale-[1.01] active:scale-99 cursor-pointer"
          : "select-none cursor-default"
      }`}
    >
      <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform duration-500 ${variantStyles.gradient}`} />
      <div>
        <div className="flex min-w-0 items-center justify-between gap-2">
          <p className={`min-w-0 truncate text-[10px] font-extrabold uppercase tracking-widest ${variantStyles.label}`}>{t(label)}</p>
          {badge}
        </div>
        <p className="mt-2 text-base font-extrabold text-slate-800 dark:text-white line-clamp-1 transition-colors" title={value}>{value}</p>
        {taxonomyPath && (
          <p className="text-[9px] text-slate-400 dark:text-slate-500 font-semibold truncate capitalize mt-0.5" title={taxonomyPath}>{taxonomyPath}</p>
        )}
        <p className="mt-1 text-xs font-semibold text-slate-550 dark:text-slate-400">{t(detail)}</p>
        {meaning && (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 italic leading-normal border-t border-slate-100 dark:border-slate-800/60 pt-1.5">{t(meaning)}</p>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between">
        {sourceHint && (
          <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">{t(sourceHint)}</span>
        )}
        {hasAction ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAction?.();
            }}
            className={`ml-auto flex items-center gap-1 whitespace-nowrap text-xs font-extrabold transition-colors hover:underline ${variantStyles.btn}`}
          >
            <span>{t(actionLabel)}</span>
            <span className="group-hover:translate-x-0.5 transition-transform">➔</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

// 5. Filter Chip Component
export function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 bg-white dark:bg-zinc-950 border border-slate-200 dark:border-slate-800 rounded-full px-2.5 py-1 text-xs font-bold text-slate-700 dark:text-slate-300 shadow-sm select-none">
      <span className="capitalize">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 ml-0.5 font-bold"
      >
        ✕
      </button>
    </span>
  );
}
