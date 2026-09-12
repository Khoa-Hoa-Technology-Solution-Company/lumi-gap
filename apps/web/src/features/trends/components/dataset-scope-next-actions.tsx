import React from "react";
import { Compass, TrendingUp, GitCompare, Search, FileText, ChevronRight, Filter, Globe, Loader2 } from "lucide-react";

type DatasetTrendTab = "overview" | "topics" | "dataset" | "compare" | "ai";

interface DatasetScopeNextActionsProps {
  yearFrom: number;
  yearTo: number;
  domainIds: string[];
  domains: string[];
  fieldIds: string[];
  fields: string[];
  subfieldIds: string[];
  subfields: string[];
  topicIds: string[];
  topicsFilter: string[];
  paperKinds: string[];
  openAccessStatuses: string[];
  providers: string[];
  sources: string[];
  languages: string[];
  citationBands: string[];
  scopeTarget: string;
  scopeString: string;
  setActiveTab?: (tab: DatasetTrendTab) => void;
  navigate: (path: string) => void;
  isUpdating: boolean;
  totalInWindow: number;
  activeFiltersCount: number;
  hasAnyFilter: boolean;
}

export function DatasetScopeNextActions({
  yearFrom,
  yearTo,
  domainIds,
  domains,
  fieldIds,
  fields,
  subfieldIds,
  subfields,
  topicIds,
  topicsFilter,
  paperKinds,
  openAccessStatuses,
  providers,
  sources,
  languages,
  citationBands,
  scopeTarget,
  scopeString,
  setActiveTab,
  navigate,
  isUpdating,
  totalInWindow,
  activeFiltersCount,
  hasAnyFilter
}: DatasetScopeNextActionsProps) {

  // URL query builder carrying all 15 scope parameters
  const buildScopedUrl = (path: string, baseParams: Record<string, string>) => {
    const params = new URLSearchParams(baseParams);
    params.set("yearFrom", String(yearFrom));
    params.set("yearTo", String(yearTo));

    const addList = (key: string, values: string[]) => {
      const cleaned = values.map((value) => value.trim()).filter(Boolean);
      if (cleaned.length > 0) params.set(key, cleaned.join(","));
    };

    addList("domainIds", domainIds);
    addList("domains", domains);
    addList("fieldIds", fieldIds);
    addList("fields", fields);
    addList("subfieldIds", subfieldIds);
    addList("subfields", subfields);
    addList("topicIds", topicIds);
    addList("topics", topicsFilter); // Target pages like /search and /reports accept 'topics'
    addList("topicsFilter", topicsFilter); // Fallback keep url sync intact
    addList("paperKinds", paperKinds);
    addList("openAccessStatuses", openAccessStatuses);
    addList("providers", providers);
    addList("sources", sources);
    addList("languages", languages);
    addList("citationBands", citationBands);

    return `${path}?${params.toString()}`;
  };

  const isDisabled = isUpdating || totalInWindow === 0;

  return (
    <div className="bg-gradient-to-br from-blue-50/20 to-indigo-50/10 dark:from-blue-950/10 dark:to-indigo-950/5 border border-blue-100/50 dark:border-blue-900/30 rounded-2xl p-5 shadow-sm select-none space-y-4">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <h4 className="text-[10px] font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
            Recommended Next Actions
          </h4>
        </div>
        {/* Filter status indicator on Action Rail */}
        <div className="flex items-center gap-1.5 text-[10px] font-extrabold text-slate-500 dark:text-slate-400">
          {isUpdating ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
              <span>Updating scope</span>
            </>
          ) : hasAnyFilter ? (
            <>
              <Filter className="w-3.5 h-3.5 text-blue-500" />
              <span>Carrying {activeFiltersCount} active filters</span>
            </>
          ) : (
            <>
              <Globe className="w-3.5 h-3.5 text-slate-400" />
              <span>Using full corpus</span>
            </>
          )}
        </div>
      </div>

      {isUpdating && (
        <div className="rounded-xl border border-blue-100 bg-white/70 px-3 py-2 text-[10px] font-bold leading-relaxed text-blue-700 shadow-sm dark:border-blue-900/40 dark:bg-slate-950/40 dark:text-blue-300">
          Scoped actions unlock after counts refresh, so Search, Compare, and Report use the latest filters.
        </div>
      )}

      <div className="space-y-3">
        {/* 1. Find signals in this scope */}
        <button
          type="button"
          disabled={isDisabled}
          onClick={() => {
            if (!isDisabled) {
              setActiveTab?.("topics");
              const el = document.getElementById("trends-tab-panels");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }
          }}
          className="w-full flex items-center justify-between p-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:border-blue-300 text-white rounded-xl text-left transition-all active:scale-[0.98] shadow-md group border border-blue-700"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-1.5 bg-blue-500/30 text-white rounded-lg group-hover:scale-110 transition-transform shrink-0">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div className="truncate">
              <div className="text-xs font-extrabold leading-tight">Find signals in this scope</div>
              <div className="text-[10px] text-blue-100/90 mt-0.5 font-semibold leading-relaxed">
                Show rising topics and early keywords using this filtered dataset.
              </div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-blue-100 group-hover:translate-x-0.5 transition-transform" />
        </button>

        {/* 2. Compare scoped topics */}
        <button
          type="button"
          disabled={isDisabled}
          onClick={() => {
            if (!isDisabled) {
              setActiveTab?.("compare");
              const el = document.getElementById("trends-tab-panels");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }
          }}
          className="w-full flex items-center justify-between p-3.5 bg-white dark:bg-slate-900 hover:bg-blue-50/20 dark:hover:bg-slate-855 border border-slate-200 dark:border-slate-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-left transition-all active:scale-[0.98] shadow-sm group"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-1.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-650 dark:text-indigo-400 rounded-lg group-hover:scale-110 transition-transform shrink-0">
              <GitCompare className="w-4 h-4" />
            </div>
            <div className="truncate">
              <div className="text-xs font-extrabold text-slate-900 dark:text-white leading-tight">Compare scoped topics</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-semibold leading-relaxed">
                Compare trend lines only among topics inside this scope.
              </div>
            </div>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
        </button>

        {/* 3. Search scoped papers */}
        <button
          type="button"
          disabled={isDisabled}
          onClick={() => {
            if (!isDisabled) {
              navigate(buildScopedUrl("/search", { q: scopeTarget }));
            }
          }}
          className="w-full flex items-center justify-between p-3.5 bg-white dark:bg-slate-900 hover:bg-blue-50/20 dark:hover:bg-slate-855 border border-slate-200 dark:border-slate-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-left transition-all active:scale-[0.98] shadow-sm group"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-1.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-650 dark:text-emerald-400 rounded-lg group-hover:scale-110 transition-transform shrink-0">
              <Search className="w-4 h-4" />
            </div>
            <div className="truncate">
              <div className="text-xs font-extrabold text-slate-900 dark:text-white leading-tight">Search scoped papers</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-semibold leading-relaxed">
                Open Search with these exact filters applied.
              </div>
            </div>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
        </button>

        {/* 4. Generate scoped report */}
        <button
          type="button"
          disabled={isDisabled}
          onClick={() => {
            if (!isDisabled) {
              navigate(buildScopedUrl("/reports", {
                create: "true",
                topic: scopeTarget,
                query: `Analyze research trends, research gaps, and future directions within ${scopeString}.`,
              }));
            }
          }}
          className="w-full flex items-center justify-between p-3.5 bg-white dark:bg-slate-900 hover:bg-blue-50/20 dark:hover:bg-slate-855 border border-slate-200 dark:border-slate-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-left transition-all active:scale-[0.98] shadow-sm group"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-1.5 bg-purple-50 dark:bg-purple-950/60 text-purple-650 dark:text-purple-400 rounded-lg group-hover:scale-110 transition-transform shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="truncate">
              <div className="text-xs font-extrabold text-slate-900 dark:text-white leading-tight">Generate scoped report</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-semibold leading-relaxed">
                Preview evidence papers from this scope before AI generation.
              </div>
            </div>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
}
