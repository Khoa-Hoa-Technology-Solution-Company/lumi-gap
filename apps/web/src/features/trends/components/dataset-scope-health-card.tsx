import React from "react";
import { HeartPulse, AlertTriangle } from "lucide-react";
import type { TrendsOverview } from "@trend/shared-types";

interface DatasetScopeHealthCardProps {
  data: TrendsOverview;
  totalInWindow: number;
  activeFiltersCount: number;
  hasCitationFilter: boolean;
}

export function DatasetScopeHealthCard({
  data,
  totalInWindow,
  activeFiltersCount,
  hasCitationFilter
}: DatasetScopeHealthCardProps) {
  if (!data.taxonomyCoverage) return null;

  const coveragePct = data.taxonomyCoverage.fullHierarchyCoveragePct;
  const isReliable = coveragePct >= 90;
  const isPartial = coveragePct >= 70 && coveragePct < 90;

  return (
    <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4 select-none">
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
            <HeartPulse className="w-3.5 h-3.5 text-red-500" /> Taxonomy Coverage Health
          </h3>
          <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded border uppercase tracking-wider ${
            isReliable
              ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/50"
              : isPartial
              ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/50"
              : "bg-red-50 text-red-750 border-red-200 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/50"
          }`}>
            {isReliable ? "Reliable" : isPartial ? "Partial" : "Weak"}
          </span>
        </div>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
          High taxonomy coverage means filters are based on real OpenAlex classification fields, not inferred labels.
        </p>
      </div>

      <div className="space-y-3.5 border-t border-slate-100 dark:border-slate-800/80 pt-3.5">
        <div>
          <div className="flex justify-between text-[10.5px] font-bold text-slate-700 dark:text-slate-350 mb-1">
            <span>Full Hierarchy</span>
            <span>{coveragePct}%</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isReliable ? "bg-emerald-500" : isPartial ? "bg-amber-500" : "bg-red-500"
              }`}
              style={{ width: `${coveragePct}%` }}
            />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[10.5px] font-bold text-slate-700 dark:text-slate-350 mb-1">
            <span>Primary Topic</span>
            <span>{data.taxonomyCoverage.primaryTopicCoveragePct}%</span>
          </div>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div className="bg-blue-500 h-full rounded-full" style={{ width: `${data.taxonomyCoverage.primaryTopicCoveragePct}%` }} />
          </div>
        </div>
      </div>

      {/* Scope warnings */}
      {(totalInWindow < 500 || activeFiltersCount >= 5 || hasCitationFilter) && (
        <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3.5 space-y-2">
          <div className="text-[9.5px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" /> Scope Warnings
          </div>
          <div className="space-y-1.5">
            {totalInWindow < 500 && (
              <div className="text-[10px] text-amber-750 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20 px-2 py-1.5 border border-amber-200/50 dark:border-amber-900/30 rounded-lg font-bold leading-normal">
                Scope may be too narrow.
              </div>
            )}
            {activeFiltersCount >= 5 && (
              <div className="text-[10px] text-blue-750 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20 px-2 py-1.5 border border-blue-200/50 dark:border-blue-900/30 rounded-lg font-bold leading-normal">
                Many filters may over-constrain results.
              </div>
            )}
            {hasCitationFilter && (
              <div className="text-[10px] text-slate-700 dark:text-slate-350 bg-slate-50 dark:bg-slate-900/50 px-2 py-1.5 border border-slate-200/50 dark:border-slate-800 rounded-lg font-bold leading-normal">
                Citation filters may bias toward older papers.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
