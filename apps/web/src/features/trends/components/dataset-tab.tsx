import React, { useMemo } from "react";
import type { TrendsOverview } from "@trend/shared-types";
import { SlidersHorizontal } from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DatasetScopeImpactCard } from "./dataset-scope-impact-card";
import { DatasetScopeHealthCard } from "./dataset-scope-health-card";
import { DatasetScopeNextActions } from "./dataset-scope-next-actions";
import { ActiveScopeChips, type ActiveChipItem } from "./active-scope-chips";
import { DatasetScopeBuilder } from "./dataset-scope-builder";
import { formatLanguageName } from "@/utils/language";

type DatasetTrendTab = "overview" | "topics" | "dataset" | "compare" | "ai";

interface DatasetTabProps {
  data: TrendsOverview;
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
  handleBucketClick: (facet: string, val: string, openalexId?: string) => void;
  setActiveTab?: (tab: DatasetTrendTab) => void;
  navigate: (path: string) => void;
  clearAllFilters?: () => void;
  hasAnyFilter?: boolean;
  isUpdating?: boolean;
}

export function DatasetTab({
  data,
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
  handleBucketClick,
  setActiveTab,
  navigate,
  clearAllFilters,
  hasAnyFilter = false,
  isUpdating = false,
}: DatasetTabProps) {

  const totalInWindow = data.totalPapersInWindow ?? 0;

  // 1. Derives active taxonomy path
  const scopeString = useMemo(() => {
    const parts: string[] = [];
    if (domainIds.length > 0) {
      const name = data.facets?.domains?.find(d => d.openalexId === domainIds[0] || d.id === domainIds[0])?.name || domainIds[0];
      if (name) parts.push(name);
    } else if (domains.length > 0 && domains[0]) {
      parts.push(domains[0]);
    }

    if (fieldIds.length > 0) {
      const name = data.facets?.fields?.find(f => f.openalexId === fieldIds[0] || f.id === fieldIds[0])?.name || fieldIds[0];
      if (name) parts.push(name);
    } else if (fields.length > 0 && fields[0]) {
      parts.push(fields[0]);
    }

    if (subfieldIds.length > 0) {
      const name = data.facets?.subfields?.find(s => s.openalexId === subfieldIds[0] || s.id === subfieldIds[0])?.name || subfieldIds[0];
      if (name) parts.push(name);
    } else if (subfields.length > 0 && subfields[0]) {
      parts.push(subfields[0]);
    }

    if (topicIds.length > 0) {
      const name = data.facets?.topics?.find(t => t.openalexId === topicIds[0] || t.id === topicIds[0])?.name || topicIds[0];
      if (name) parts.push(name);
    } else if (topicsFilter.length > 0 && topicsFilter[0]) {
      parts.push(topicsFilter[0]);
    }

    return parts.length > 0 ? parts.join(" → ") : "All OpenAlex Domains";
  }, [data, domainIds, domains, fieldIds, fields, subfieldIds, subfields, topicIds, topicsFilter]);

  const scopeTarget = useMemo(() => {
    return scopeString !== "All OpenAlex Domains"
      ? scopeString.split(" → ").pop() || scopeString
      : "research trends";
  }, [scopeString]);

  // 2. Extracts active filter chips info
  const activeChips = useMemo(() => {
    const chips: ActiveChipItem[] = [];

    // Domains
    domainIds.forEach(id => {
      const name = data.facets?.domains?.find(d => d.openalexId === id || d.id === id)?.name || id;
      chips.push({ facet: "Domains", val: id, label: `Domain: ${name}`, openalexId: id });
    });
    domains.forEach(name => {
      chips.push({ facet: "Domains", val: name, label: `Domain: ${name}` });
    });

    // Fields
    fieldIds.forEach(id => {
      const name = data.facets?.fields?.find(f => f.openalexId === id || f.id === id)?.name || id;
      chips.push({ facet: "Fields", val: id, label: `Field: ${name}`, openalexId: id });
    });
    fields.forEach(name => {
      chips.push({ facet: "Fields", val: name, label: `Field: ${name}` });
    });

    // Subfields
    subfieldIds.forEach(id => {
      const name = data.facets?.subfields?.find(s => s.openalexId === id || s.id === id)?.name || id;
      chips.push({ facet: "Subfields", val: id, label: `Subfield: ${name}`, openalexId: id });
    });
    subfields.forEach(name => {
      chips.push({ facet: "Subfields", val: name, label: `Subfield: ${name}` });
    });

    // Topics
    topicIds.forEach(id => {
      const name = data.facets?.topics?.find(t => t.openalexId === id || t.id === id)?.name || id;
      chips.push({ facet: "Topics", val: id, label: `Topic: ${name}`, openalexId: id });
    });
    topicsFilter.forEach(name => {
      chips.push({ facet: "Topics", val: name, label: `Topic: ${name}` });
    });

    // Paper Types
    paperKinds.forEach(kind => {
      chips.push({ facet: "Paper Types", val: kind, label: `Paper: ${kind}` });
    });

    // Open Access
    openAccessStatuses.forEach(status => {
      chips.push({ facet: "Open Access", val: status, label: `OA: ${status}` });
    });

    // Providers
    providers.forEach(p => {
      chips.push({ facet: "Providers", val: p, label: `Provider: ${p}` });
    });

    // Top Sources
    sources.forEach(src => {
      chips.push({ facet: "Top Sources", val: src, label: `Source: ${src}` });
    });

    languages.forEach(language => {
      chips.push({ facet: "Languages", val: language, label: `Language: ${formatLanguageName(language)}` });
    });

    // Citation Bands
    citationBands.forEach(band => {
      chips.push({ facet: "Citation Bands", val: band, label: `Citations: ${band}` });
    });

    return chips;
  }, [
    data, domainIds, domains, fieldIds, fields, subfieldIds, subfields, topicIds, topicsFilter,
    paperKinds, openAccessStatuses, providers, sources, languages, citationBands
  ]);

  const hasParentSelected = domainIds.length > 0 || domains.length > 0;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-5">
        {/* Header & Explanation */}
        <div className="flex items-center gap-3 select-none">
          <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 text-blue-650 dark:text-blue-400 rounded-xl shrink-0">
            <SlidersHorizontal className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white leading-none">Dataset Scope Builder</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold leading-relaxed animate-fadeIn">
              Choose the paper dataset used by every Trends tab. Then continue to signals, comparison, search, or reports with the same scope.
            </p>
          </div>
        </div>

        {/* Main 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* LEFT COLUMN: Filters Controls (8 columns) */}
          <div className="lg:col-span-8">
            <DatasetScopeBuilder
              data={data}
              isUpdating={isUpdating}
              domainIds={domainIds}
              domains={domains}
              fieldIds={fieldIds}
              fields={fields}
              subfieldIds={subfieldIds}
              subfields={subfields}
              topicIds={topicIds}
              topicsFilter={topicsFilter}
              paperKinds={paperKinds}
              openAccessStatuses={openAccessStatuses}
              providers={providers}
              sources={sources}
              languages={languages}
              citationBands={citationBands}
              handleBucketClick={handleBucketClick}
              hasParentSelected={hasParentSelected}
            />
          </div>

          {/* RIGHT COLUMN: Sticky Sidebar cockpit (4 columns) */}
          <div className="lg:col-span-4 lg:sticky lg:top-5 space-y-6">

            {/* Zone 1 — Scope Impact Summary Card */}
            <DatasetScopeImpactCard
              hasAnyFilter={hasAnyFilter}
              clearAllFilters={clearAllFilters}
              isUpdating={isUpdating}
              totalInWindow={totalInWindow}
              uniqueTopicsInScope={data.uniqueTopicsInScope ?? data.topics.length}
              scopeString={scopeString}
              yearFrom={yearFrom}
              yearTo={yearTo}
              lastCompleteYear={data.lastCompleteYear}
            />

            {/* Zone 4 — Sticky Scoped Next Actions */}
            <DatasetScopeNextActions
              yearFrom={yearFrom}
              yearTo={yearTo}
              domainIds={domainIds}
              domains={domains}
              fieldIds={fieldIds}
              fields={fields}
              subfieldIds={subfieldIds}
              subfields={subfields}
              topicIds={topicIds}
              topicsFilter={topicsFilter}
              paperKinds={paperKinds}
              openAccessStatuses={openAccessStatuses}
              providers={providers}
              sources={sources}
              languages={languages}
              citationBands={citationBands}
              scopeTarget={scopeTarget}
              scopeString={scopeString}
              setActiveTab={setActiveTab}
              navigate={navigate}
              isUpdating={isUpdating}
              totalInWindow={totalInWindow}
              activeFiltersCount={activeChips.length}
              hasAnyFilter={hasAnyFilter}
            />

            {/* Zone 3 — Data Health & Warnings */}
            <DatasetScopeHealthCard
              data={data}
              totalInWindow={totalInWindow}
              activeFiltersCount={activeChips.length}
              hasCitationFilter={citationBands.length > 0}
            />

            {/* Category-Grouped Active filter chips */}
            <ActiveScopeChips
              activeChips={activeChips}
              handleBucketClick={handleBucketClick}
            />
          </div>
        </div>

        {/* Technical footer notes */}
        <div className="px-4 py-3 bg-slate-50/50 dark:bg-slate-900/10 border-l-2 border-slate-300 dark:border-slate-700 rounded-r-xl text-[11px] text-slate-555 dark:text-slate-400 select-none">
          <p className="leading-relaxed">
            <strong>Dataset Scope Basis:</strong> Active paper statistics calculated inside the filtered data window. Domain, field, subfield, and topic taxonomy hierarchy mappings are powered by OpenAlex.
          </p>
        </div>
      </div>
    </TooltipProvider>
  );
}
