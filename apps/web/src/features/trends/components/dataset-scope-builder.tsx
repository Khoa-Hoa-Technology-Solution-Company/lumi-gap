import React from "react";
import type { TrendsOverview } from "@trend/shared-types";
import { FacetGroup } from "./trends-shared.components";
import { Info, Loader2 } from "lucide-react";
import { formatLanguageName } from "@/utils/language";

interface DatasetScopeBuilderProps {
  data: TrendsOverview;
  isUpdating?: boolean;
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
  handleBucketClick: (facet: string, val: string, openalexId?: string) => void;
  hasParentSelected: boolean;
}

export function DatasetScopeBuilder({
  data,
  isUpdating = false,
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
  handleBucketClick,
  hasParentSelected
}: DatasetScopeBuilderProps) {
  if (!data.facets) return null;

  return (
    <div className="space-y-6" aria-busy={isUpdating}>
      {/* Dynamic Guided Walkthrough: "How to use this scope" */}
      <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-900/60 dark:to-slate-900/20 border border-slate-200/60 dark:border-slate-800 rounded-2xl p-5 select-none space-y-4 shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-200/50 dark:border-slate-850 pb-2.5">
          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
            How to use this scope (Guided Walkthrough)
          </h4>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-semibold text-slate-600 dark:text-slate-400">
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-widest block">Step 1</span>
            <p className="text-[11.5px] font-bold text-slate-800 dark:text-slate-200 leading-tight">Narrow Research Area</p>
            <p className="text-[10.5px] text-slate-500 leading-relaxed mt-0.5">
              Select parent categories under <strong>OpenAlex research area</strong>. Choosing a parent automatically updates and refines the children lists.
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-widest block">Step 2</span>
            <p className="text-[11.5px] font-bold text-slate-800 dark:text-slate-200 leading-tight">Refine Publications</p>
            <p className="text-[10.5px] text-slate-500 leading-relaxed mt-0.5">
              Restrict formats and access types under <strong>Publication filters</strong> to target specific channels (e.g. Gold Open Access).
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-widest block">Step 3</span>
            <p className="text-[11.5px] font-bold text-slate-800 dark:text-slate-200 leading-tight">Set Citation Impact</p>
            <p className="text-[10.5px] text-slate-500 leading-relaxed mt-0.5">
              Use <strong>Citation impact</strong> bands to establish academic influence thresholds and isolate high-value research.
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-widest block">Step 4</span>
            <p className="text-[11.5px] font-bold text-slate-800 dark:text-slate-200 leading-tight">Trigger Scoped Actions</p>
            <p className="text-[10.5px] text-slate-500 leading-relaxed mt-0.5">
              Review the real-time matching papers count on the right, then click any Next Action to carry filters across all workbenches.
            </p>
          </div>
        </div>

        <div className="border-t border-slate-200/50 dark:border-slate-850 pt-3 text-[11px] font-semibold text-slate-500 dark:text-slate-450 leading-relaxed">
          <p>
            💡 <strong>Pro Tip:</strong> Every checkbox interaction triggers an <strong>auto-apply</strong> logic. All matching paper counts and signals re-compute instantly without manual submit.
          </p>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3 text-[10.5px] bg-slate-100/40 dark:bg-slate-900/40 p-2.5 rounded-xl border border-slate-200/30 dark:border-slate-800">
            <div>
              <strong>Taxonomy impact:</strong> Progressive drill-down that filters the entire taxonomy tree hierarchy.
            </div>
            <div>
              <strong>Publication impact:</strong> Filters by structural metadata formats (OA status, paper format kinds).
            </div>
            <div>
              <strong>Citation impact:</strong> Filters by historical citation volume bands to measure study influence.
            </div>
          </div>
        </div>
      </div>

      {isUpdating && (
        <div className="flex items-start gap-3 rounded-2xl border border-blue-200/70 bg-blue-50/70 px-4 py-3 text-xs font-semibold text-blue-800 shadow-sm dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-250">
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-blue-600 dark:text-blue-350" />
          <div className="space-y-0.5">
            <p className="font-extrabold">Applying scope filters...</p>
            <p className="text-blue-700/80 dark:text-blue-300/80">
              Counts, charts, recommended actions, and scoped links are refreshing from the newly selected dataset.
            </p>
          </div>
        </div>
      )}

      {/* Zone 2.1 — Taxonomy Controls */}
      <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="mb-5 select-none space-y-1">
          <h3 className="text-sm font-extrabold text-slate-950 dark:text-white uppercase tracking-wider flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded bg-blue-600 dark:bg-blue-500"></span> OpenAlex research area
          </h3>
          <p className="text-xs text-slate-550 dark:text-slate-400 font-semibold">
            Choose an OpenAlex domain, field, subfield, or topic. This narrows every trend chart and action on this page.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Domains */}
          <div className="relative">
            <FacetGroup
              title="Domains"
              buckets={data.facets.domains}
              total={data.totalPapersInWindow}
              activeValues={domainIds.length > 0 ? domainIds : domains}
              onBucketClick={(val, openalexId) => handleBucketClick("Domains", val, openalexId)}
            />
          </div>

          {/* Fields */}
          <div className={`transition-all ${!hasParentSelected ? "opacity-75" : ""}`}>
            <FacetGroup
              title="Fields"
              buckets={data.facets.fields}
              total={data.totalPapersInWindow}
              activeValues={fieldIds.length > 0 ? fieldIds : fields}
              onBucketClick={(val, openalexId) => handleBucketClick("Fields", val, openalexId)}
            />
          </div>

          {/* Subfields */}
          <div className={`transition-all ${!hasParentSelected ? "opacity-75" : ""}`}>
            <FacetGroup
              title="Subfields"
              buckets={data.facets.subfields}
              total={data.totalPapersInWindow}
              activeValues={subfieldIds.length > 0 ? subfieldIds : subfields}
              onBucketClick={(val, openalexId) => handleBucketClick("Subfields", val, openalexId)}
            />
          </div>

          {/* Topics */}
          <div className={`transition-all ${!hasParentSelected ? "opacity-75" : ""}`}>
            <FacetGroup
              title="Topics"
              buckets={data.facets.topics}
              total={data.totalPapersInWindow}
              activeValues={topicIds.length > 0 ? topicIds : topicsFilter}
              onBucketClick={(val, openalexId) => handleBucketClick("Topics", val, openalexId)}
            />
          </div>
        </div>

        {!hasParentSelected && (
          <div className="mt-5 p-3 bg-slate-50 dark:bg-slate-900/30 border border-slate-200/50 dark:border-slate-800 rounded-xl text-[11px] text-slate-500 font-semibold select-none flex items-center gap-2">
            <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span>If no domain is selected, fields, subfields, and topics show top categories across the entire dataset. Select a parent to focus the list.</span>
          </div>
        )}
      </div>

      {/* Zone 2.2 & 2.3 — Metadata and Citation Impact */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Publication filters (Metadata Section) */}
        <div className="md:col-span-2 bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
          <div className="mb-5 select-none space-y-1">
            <h3 className="text-sm font-extrabold text-slate-950 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded bg-purple-600 dark:bg-purple-500"></span> Publication filters
            </h3>
            <p className="text-xs text-slate-555 dark:text-slate-400 font-semibold">
              Filter by publication formats, open access licensing, hosts and sources.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <FacetGroup
              title="Paper Types"
              buckets={data.facets.paperKinds}
              total={data.totalPapersInWindow}
              activeValues={paperKinds}
              onBucketClick={(val) => handleBucketClick("Paper Types", val)}
            />
            <FacetGroup
              title="Open Access"
              buckets={data.facets.openAccessStatuses}
              total={data.totalPapersInWindow}
              activeValues={openAccessStatuses}
              onBucketClick={(val) => handleBucketClick("Open Access", val)}
            />
            <FacetGroup
              title="Providers"
              buckets={data.facets.providers}
              total={data.totalPapersInWindow}
              activeValues={providers}
              onBucketClick={(val) => handleBucketClick("Providers", val)}
            />
            <FacetGroup
              title="Top Sources"
              buckets={data.facets.topSources}
              total={data.totalPapersInWindow}
              activeValues={sources}
              onBucketClick={(val) => handleBucketClick("Top Sources", val)}
            />
            <FacetGroup
              title="Languages"
              buckets={(data.facets.languages ?? []).map((bucket) => ({
                ...bucket,
                name: formatLanguageName(bucket.id),
              }))}
              total={data.totalPapersInWindow}
              activeValues={languages}
              onBucketClick={(val) => handleBucketClick("Languages", val)}
            />
          </div>
        </div>

        {/* Citation impact (Impact Filter Section) */}
        <div className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div className="space-y-4">
            <div className="select-none space-y-1">
              <h3 className="text-sm font-extrabold text-slate-950 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded bg-emerald-600 dark:bg-emerald-500"></span> Citation impact
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-450 leading-relaxed font-semibold">
                Citation bands filter papers by accumulated OpenAlex citation count. Older papers may naturally have more citations.
              </p>
            </div>

            <div className="border-t border-slate-100 dark:border-slate-800/80 pt-3">
              <FacetGroup
                title="Citation Bands"
                buckets={data.facets.citationBands}
                total={data.totalPapersInWindow}
                activeValues={citationBands}
                onBucketClick={(val) => handleBucketClick("Citation Bands", val)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
