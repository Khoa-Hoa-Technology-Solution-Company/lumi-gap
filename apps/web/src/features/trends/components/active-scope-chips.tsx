import React from "react";
import { X } from "lucide-react";

export interface ActiveChipItem {
  facet: string;
  val: string;
  label: string;
  openalexId?: string;
}

interface ActiveScopeChipsProps {
  activeChips: ActiveChipItem[];
  handleBucketClick: (facet: string, val: string, openalexId?: string) => void;
}

export function ActiveScopeChips({ activeChips, handleBucketClick }: ActiveScopeChipsProps) {
  if (activeChips.length === 0) return null;

  // Enforce precise prefixes on display label
  const getDisplayLabel = (chip: ActiveChipItem) => {
    // Extract actual name by removing existing prefixes if present
    const cleanName = chip.label.replace(/^(Domain|Field|Subfield|Topic|Paper|OA|Provider|Source|Citations):\s*/i, "");
    
    switch (chip.facet) {
      case "Domains":
        return `Domain: ${cleanName}`;
      case "Fields":
        return `Field: ${cleanName}`;
      case "Subfields":
        return `Subfield: ${cleanName}`;
      case "Topics":
        return `Topic: ${cleanName}`;
      case "Paper Types":
        return `Type: ${cleanName}`;
      case "Open Access":
        return `OA: ${cleanName}`;
      case "Providers":
        return `Provider: ${cleanName}`;
      case "Top Sources":
        return `Source: ${cleanName}`;
      case "Citation Bands":
        return `Citations: ${cleanName.replace(/\s*citations$/i, "")}`;
      default:
        return chip.label;
    }
  };

  // Group active chips by category group
  const groupedChips = {
    taxonomy: activeChips.filter(c => ["Domains", "Fields", "Subfields", "Topics"].includes(c.facet)),
    metadata: activeChips.filter(c => ["Paper Types", "Open Access", "Providers", "Top Sources", "Languages"].includes(c.facet)),
    impact: activeChips.filter(c => c.facet === "Citation Bands")
  };

  const renderGroup = (title: string, chips: ActiveChipItem[]) => {
    if (chips.length === 0) return null;
    return (
      <div className="space-y-1.5">
        <span className="text-[9px] font-extrabold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
          {title}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip, idx) => (
            <span
              key={`${chip.facet}:${chip.val}:${idx}`}
              className="inline-flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800 text-slate-700 dark:text-slate-350 pl-2.5 pr-1 py-0.5 rounded-lg text-[10.5px] font-extrabold shadow-sm transition-all"
            >
              <span className="truncate max-w-[150px] capitalize">{getDisplayLabel(chip)}</span>
              <button
                type="button"
                onClick={() => handleBucketClick(chip.facet, chip.val, chip.openalexId)}
                className="p-0.5 hover:bg-slate-200 dark:hover:bg-slate-855 rounded-full text-slate-400 hover:text-red-650 transition-colors shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="pt-4 border-t border-slate-100 dark:border-slate-800/50 space-y-3 select-none">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-extrabold text-slate-455 dark:text-slate-500 uppercase tracking-wider block">
          Active Filters ({activeChips.length})
        </span>
      </div>
      <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
        {renderGroup("Research area", groupedChips.taxonomy)}
        {renderGroup("Publication filters", groupedChips.metadata)}
        {renderGroup("Impact filters", groupedChips.impact)}
      </div>
    </div>
  );
}
