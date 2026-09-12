import React from "react";
import { Loader2, RotateCcw, LayoutGrid, Calendar } from "lucide-react";
import { formatNumber } from "@/utils";

interface DatasetScopeImpactCardProps {
  hasAnyFilter: boolean;
  clearAllFilters?: () => void;
  isUpdating: boolean;
  totalInWindow: number;
  uniqueTopicsInScope: number;
  scopeString: string;
  yearFrom: number;
  yearTo: number;
  lastCompleteYear?: number;
}

export function DatasetScopeImpactCard({
  hasAnyFilter,
  clearAllFilters,
  isUpdating,
  totalInWindow,
  uniqueTopicsInScope,
  scopeString,
  yearFrom,
  yearTo,
  lastCompleteYear
}: DatasetScopeImpactCardProps) {
  const isYtd = lastCompleteYear ? yearTo > lastCompleteYear : false;

  return (
    <div
      className={`bg-white dark:bg-[#121212] border rounded-2xl p-5 shadow-sm space-y-4 transition-colors ${
        isUpdating
          ? "border-blue-200 dark:border-blue-900/50"
          : "border-slate-200 dark:border-slate-800"
      }`}
      aria-busy={isUpdating}
    >
      <div className="flex items-center justify-between gap-4 select-none">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
            Scope Impact Summary
          </span>
          {isUpdating && (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 shrink-0" />
          )}
        </div>

        {hasAnyFilter && clearAllFilters && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="px-2.5 py-1 bg-red-50 hover:bg-red-100/80 dark:bg-slate-900 dark:hover:bg-red-950/20 border border-slate-200 dark:border-slate-850 hover:border-red-200/50 text-red-650 hover:text-red-700 dark:text-slate-350 dark:hover:text-red-400 rounded-lg text-[10px] font-extrabold flex items-center gap-1 transition-all active:scale-95 shrink-0"
          >
            <RotateCcw className="w-3 h-3" />
            Clear all filters
          </button>
        )}
      </div>

      {/* Dynamic stats */}
      <div className="space-y-4 select-none">
        <div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white leading-none tracking-tight">
            {formatNumber(totalInWindow)} papers
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-1 uppercase tracking-wider">
            {isUpdating
              ? "Refreshing filtered scope"
              : hasAnyFilter
                ? "Current filtered scope"
                : "Full active dataset"}
          </p>
        </div>
        <div>
          <div className="text-lg font-extrabold text-slate-900 dark:text-white leading-none tracking-tight">
            {formatNumber(uniqueTopicsInScope)} unique topics
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-1 uppercase tracking-wider">
            Available after current filters
          </p>
        </div>

        {/* Composed Active Taxonomy Path */}
        <div className="bg-slate-50 dark:bg-slate-900/40 rounded-xl p-3.5 border border-slate-200/40 dark:border-slate-800/80 space-y-1.5">
          <div className="text-[9.5px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <LayoutGrid className="w-3 h-3 text-blue-500" /> Active Taxonomy Path
          </div>
          <div className="text-[11.5px] font-bold text-slate-850 dark:text-slate-300 capitalize leading-relaxed break-words">
            {scopeString}
          </div>
        </div>

        {/* Dynamic Impact Sentence */}
        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 leading-normal bg-blue-50/20 dark:bg-blue-950/10 border-l-2 border-blue-500 px-3 py-2 rounded-r-xl">
          {isUpdating ? (
            <span className="text-blue-700 dark:text-blue-300 font-bold">
              Applying filters. The previous dataset remains visible until the new scoped counts finish loading.
            </span>
          ) : !hasAnyFilter ? (
            <span>You are analyzing the full active corpus. Add a research area or metadata filter to focus the trend analysis.</span>
          ) : totalInWindow < 500 ? (
            <span className="text-amber-700 dark:text-amber-400 font-bold">This scope is narrow. Treat growth signals as exploratory unless supporting evidence volume is high.</span>
          ) : (
            <span>This scope keeps {formatNumber(totalInWindow)} papers. All Trends tabs and scoped actions now use this filtered dataset.</span>
          )}
        </div>

        {/* Scope status notice */}
        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 leading-relaxed border-t border-slate-100 dark:border-slate-800/50 pt-3 flex items-start gap-2">
          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
          {isYtd ? (
            <span>Metric window: {yearFrom}-{yearTo}. {yearTo} is year-to-date and excluded from growth math.</span>
          ) : (
            <span>Metric window: {yearFrom}-{yearTo}. Uses complete-year trend math.</span>
          )}
        </div>
      </div>
    </div>
  );
}
