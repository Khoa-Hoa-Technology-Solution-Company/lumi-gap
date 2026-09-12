import { useState, useMemo, useCallback, useEffect } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Check, X, Plus, Search, SlidersHorizontal, Calendar, Unlock, FileText, Database, Sparkles, Cpu, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, Cell, ResponsiveContainer } from "recharts";
import type { Paper, SearchSortKey } from "@trend/shared-types";

type FeSortKey = "relevance" | "date" | "citations";
import { usePapers } from "@/features/papers";
import { useSearch } from "@/features/search";
import { useSearchParams, Link } from "react-router-dom";
import { useBookmarks } from "@/features/bookmarks";
import { PaperCard } from "@/components/paper-card";
import { useAuthStore } from "@/stores/auth-store";
import { formatLanguageName } from "@/utils/language";
import { useI18n } from "@/i18n";

const PAGE_SIZE = 10;
const MIN_PUBLICATION_YEAR = 1900;
const CURRENT_YEAR = new Date().getFullYear();

const SCOPE_FILTER_KEYS = [
  "paperKinds",
  "openAccessStatuses",
  "providers",
  "sources",
  "languages",
  "citationBands",
  "domains",
  "fields",
  "subfields",
  "topics",
  "domainIds",
  "fieldIds",
  "subfieldIds",
  "topicIds",
] as const;

const RELAXABLE_SCOPE_FILTER_KEYS = [
  "paperKinds",
  "openAccessStatuses",
  "providers",
  "sources",
  "languages",
  "citationBands",
] as const;

const SCOPE_FILTER_LABELS: Record<(typeof SCOPE_FILTER_KEYS)[number], string> = {
  paperKinds: "Type",
  openAccessStatuses: "OA",
  providers: "Provider",
  sources: "Source",
  languages: "Language",
  citationBands: "Citations",
  domains: "Domain",
  fields: "Field",
  subfields: "Subfield",
  topics: "Topic",
  domainIds: "Domain",
  fieldIds: "Field",
  subfieldIds: "Subfield",
  topicIds: "Topic",
};

function parseCsvParam(params: URLSearchParams, key: string): string[] {
  const raw = params.get(key);
  if (!raw) return [];
  return raw.split(",").map((value) => value.trim()).filter(Boolean);
}

function getRequestErrorMessage(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return "Search is temporarily unavailable. Please try again.";
  }
  const candidate = error as {
    response?: { data?: { error?: { message?: string } } };
    message?: string;
  };
  return candidate.response?.data?.error?.message
    || candidate.message
    || "Search is temporarily unavailable. Please try again.";
}

export function SearchPage() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q") || "";
  const page = parseInt(searchParams.get("page") || "1", 10);
  const currentUser = useAuthStore((s) => s.user);

  // Filter States initialized from URL search params for seamless home redirection
  const [searchMode, setSearchMode] = useState<"semantic" | "keyword">(
    () => (searchParams.get("mode") as "semantic" | "keyword") || "semantic"
  );
  const [yearFrom, setYearFrom] = useState<string>(
    () => searchParams.get("yearFrom") || String(MIN_PUBLICATION_YEAR)
  );
  const [yearTo, setYearTo] = useState<string>(
    () => searchParams.get("yearTo") || String(CURRENT_YEAR)
  );
  const [openAccessOnly, setOpenAccessOnly] = useState<boolean>(
    () => searchParams.get("openAccess") === "true"
  );
  const [journalTypes, setJournalTypes] = useState<string[]>(
    () => searchParams.getAll("type")
  );
  const [primaryProvider, setPrimaryProvider] = useState<string>(
    () => searchParams.get("provider") || "all"
  );
  const [aiScoreThreshold, setAiScoreThreshold] = useState<number>(
    () => parseFloat(searchParams.get("minScore") || "0")
  );
  const [sortBy, setSortBy] = useState<FeSortKey>(
    () => (searchParams.get("sort") as FeSortKey) || "relevance"
  );
  const [rerank, setRerank] = useState<boolean>(
    () => searchParams.get("rerank") === "true"
  );

  const scopeFilters = useMemo(() => ({
    paperKinds: parseCsvParam(searchParams, "paperKinds"),
    openAccessStatuses: parseCsvParam(searchParams, "openAccessStatuses"),
    providers: parseCsvParam(searchParams, "providers"),
    sources: parseCsvParam(searchParams, "sources"),
    languages: parseCsvParam(searchParams, "languages"),
    citationBands: parseCsvParam(searchParams, "citationBands"),
    domains: parseCsvParam(searchParams, "domains"),
    fields: parseCsvParam(searchParams, "fields"),
    subfields: parseCsvParam(searchParams, "subfields"),
    topics: parseCsvParam(searchParams, "topics"),
    domainIds: parseCsvParam(searchParams, "domainIds"),
    fieldIds: parseCsvParam(searchParams, "fieldIds"),
    subfieldIds: parseCsvParam(searchParams, "subfieldIds"),
    topicIds: parseCsvParam(searchParams, "topicIds"),
  }), [searchParams]);

  const activeScopeFilterCount = useMemo(
    () => Object.values(scopeFilters).reduce((sum, values) => sum + values.length, 0),
    [scopeFilters],
  );

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (yearFrom !== String(MIN_PUBLICATION_YEAR) || yearTo !== String(CURRENT_YEAR)) count += 1;
    if (openAccessOnly) count += 1;
    if (searchMode === "semantic" && aiScoreThreshold > 0) count += 1;
    count += activeScopeFilterCount;
    return count;
  }, [yearFrom, yearTo, openAccessOnly, aiScoreThreshold, searchMode, activeScopeFilterCount]);

  const removeScopeFilterValue = useCallback((key: (typeof SCOPE_FILTER_KEYS)[number], value: string) => {
    setSearchParams(prev => {
      const current = parseCsvParam(prev, key);
      const next = current.filter(v => v !== value);
      if (next.length > 0) {
        prev.set(key, next.join(","));
      } else {
        prev.delete(key);
      }
      prev.set("page", "1");
      return prev;
    });
  }, [setSearchParams]);

  const setLanguageFilter = useCallback((language: string) => {
    setSearchParams(prev => {
      if (language === "all") prev.delete("languages");
      else prev.set("languages", language);
      prev.set("page", "1");
      return prev;
    });
  }, [setSearchParams]);

  const relaxTrendScope = useCallback(() => {
    setSearchParams(prev => {
      RELAXABLE_SCOPE_FILTER_KEYS.forEach(key => prev.delete(key));
      prev.set("page", "1");
      return prev;
    });
  }, [setSearchParams]);

  const clearTrendScope = useCallback(() => {
    setSearchParams(prev => {
      SCOPE_FILTER_KEYS.forEach(key => prev.delete(key));
      prev.set("page", "1");
      return prev;
    });
  }, [setSearchParams]);

  // Dropdown visibility states
  const [isOpenModeDropdown, setIsOpenModeDropdown] = useState<boolean>(false);
  const [isOpenMiniFilters, setIsOpenMiniFilters] = useState<boolean>(false);
  const [isOpenMiniType, setIsOpenMiniType] = useState<boolean>(false);
  const [isOpenMiniSource, setIsOpenMiniSource] = useState<boolean>(false);

  const [localSearchQuery, setLocalSearchQuery] = useState(q);

  useEffect(() => {
    const handleGlobalClick = () => {
      setIsOpenModeDropdown(false);
      setIsOpenMiniFilters(false);
      setIsOpenMiniType(false);
      setIsOpenMiniSource(false);
    };
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, []);

  useEffect(() => {
    setLocalSearchQuery(q);
  }, [q]);

  const handleSearchSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setSearchParams(prev => {
      if (localSearchQuery.trim()) {
        prev.set("q", localSearchQuery.trim());
      } else {
        prev.delete("q");
      }
      prev.set("page", "1");
      return prev;
    });
  }, [localSearchQuery, setSearchParams]);

  const parsedYearFrom = yearFrom ? parseInt(yearFrom, 10) : undefined;
  const parsedYearTo = yearTo ? parseInt(yearTo, 10) : undefined;
  const hasQuery = q.trim().length > 0;

  const isSemanticSearchActive = searchMode === "semantic" && hasQuery;

  // Map FE sort key → BE sort key
  const beSort: SearchSortKey = sortBy === "date" ? "year" : sortBy as SearchSortKey;

  // Server-side filter params shared between both endpoints.
  const filterParams = {
    yearFrom: (!isNaN(parsedYearFrom!) ? parsedYearFrom : undefined) as number | undefined,
    yearTo: (!isNaN(parsedYearTo!) ? parsedYearTo : undefined) as number | undefined,
    paperKind: journalTypes.length > 0 ? journalTypes : undefined,
    openAccess: openAccessOnly || undefined,
    provider: primaryProvider !== "all" ? primaryProvider : undefined,
    sort: beSort,
    ...scopeFilters,
  };

  // Server-side pagination + filters. No more POOL_SIZE or client slicing.
  const browse = usePapers(
    {
      page,
      pageSize: PAGE_SIZE,
      q: searchMode === "keyword" ? q : undefined,
      ...filterParams,
    },
    { enabled: !isSemanticSearchActive },
  );

  const search = useSearch(
    {
      q,
      page,
      pageSize: PAGE_SIZE,
      ...filterParams,
      minScore: aiScoreThreshold > 0 ? aiScoreThreshold : undefined,
      rerank: isSemanticSearchActive ? rerank : undefined,
    },
    { enabled: isSemanticSearchActive },
  );

  const activeQuery = isSemanticSearchActive ? search : browse;
  const data = activeQuery.data;
  const isLoading = activeQuery.isLoading;
  const isError = activeQuery.isError;
  const requestError = activeQuery.error;
  const papers = (data?.papers ?? []) as (Paper & {
    score?: number;
    rerankScore?: number;
    taxonomyBoostScore?: number;
  })[];
  const meta = data?.meta;
  const resultMode = isSemanticSearchActive && meta && "mode" in meta
    ? meta.mode
    : undefined;
  const totalPages = meta?.totalPages ?? 1;
  const safePage = Math.min(Math.max(1, page), totalPages);

  const { data: bookmarks } = useBookmarks({ enabled: Boolean(currentUser) });

  const bookmarkedPaperIds = useMemo(() => {
    if (!bookmarks) return new Set<string>();
    return new Set(bookmarks.filter(b => b.targetKind === "paper").map(b => b.targetId));
  }, [bookmarks]);

  const bookmarkIdMap = useMemo(() => {
    if (!bookmarks) return new Map<string, string>();
    return new Map(bookmarks.filter(b => b.targetKind === "paper").map(b => [b.targetId, b.id]));
  }, [bookmarks]);

  const resolvedNamesMap = useMemo(() => {
    const map = new Map<string, string>();
    const STATIC_NAME_MAP: Record<string, string> = {
      "1": "Physical Sciences",
      "2": "Health Sciences",
      "3": "Social Sciences",
      "4": "Life Sciences",
      "11": "Computer Science",
      "12": "Medicine",
      "13": "Engineering",
      "14": "Social Sciences",
      "T10028": "Topic Modeling",
      "T10502": "Artificial Intelligence in Healthcare and Education",
      "T10123": "Natural Language Processing Techniques",
      "T10850": "Machine Learning in Healthcare",
      "T11294": "Radiomics and Machine Learning in Medical Imaging",
    };
    Object.entries(STATIC_NAME_MAP).forEach(([k, v]) => map.set(k, v));

    papers.forEach(paper => {
      const pTopics = paper.topics || [];
      pTopics.forEach(t => {
        if (t.domainId && t.domainName) map.set(t.domainId, t.domainName);
        if (t.fieldId && t.fieldName) map.set(t.fieldId, t.fieldName);
        if (t.subfieldId && t.subfieldName) map.set(t.subfieldId, t.subfieldName);
        if (t.openalexTopicId && t.topicName) map.set(t.openalexTopicId, t.topicName);
        if (t.topicId && t.topicName) map.set(t.topicId, t.topicName);
      });
    });

    return map;
  }, [papers]);

  const activeScopeChips = useMemo(() => {
    return Object.entries(scopeFilters).flatMap(([key, values]) =>
      values.map((value) => {
        const resolvedName = key === "languages"
          ? formatLanguageName(value)
          : resolvedNamesMap.get(value) || value;
        return {
          key: key as (typeof SCOPE_FILTER_KEYS)[number],
          value,
          label: `${SCOPE_FILTER_LABELS[key as (typeof SCOPE_FILTER_KEYS)[number]]}: ${resolvedName}`,
        };
      }),
    );
  }, [scopeFilters, resolvedNamesMap]);

  const yearlyDistribution = useMemo(() => {
    const map = new Map<number, number>();
    const from = parseInt(yearFrom, 10) || MIN_PUBLICATION_YEAR;
    const to = parseInt(yearTo, 10) || CURRENT_YEAR;
    for (let y = from; y <= to; y++) {
      map.set(y, 0);
    }
    papers.forEach(p => {
      if (p.publicationYear && p.publicationYear >= from && p.publicationYear <= to) {
        map.set(p.publicationYear, (map.get(p.publicationYear) || 0) + 1);
      }
    });
    return Array.from(map.entries())
      .map(([year, count]) => ({ year: String(year), count }))
      .sort((a, b) => Number(a.year) - Number(b.year));
  }, [papers, yearFrom, yearTo]);

  const handlePageChange = useCallback((newPage: number) => {
    setSearchParams(prev => {
      prev.set("page", newPage.toString());
      return prev;
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [setSearchParams]);

  /** Reset page to 1 whenever a filter changes. */
  const resetPage = useCallback(() => {
    setSearchParams(prev => {
      prev.set("page", "1");
      return prev;
    });
  }, [setSearchParams]);

  const handleClearAll = useCallback(() => {
    setYearFrom(String(MIN_PUBLICATION_YEAR));
    setYearTo(String(CURRENT_YEAR));
    setOpenAccessOnly(false);
    setJournalTypes([]);
    setPrimaryProvider("all");
    setAiScoreThreshold(0);
    setRerank(false);
    resetPage();
  }, [resetPage]);

  const handleJournalTypeToggle = (type: string) => {
    setJournalTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
    resetPage();
  };
  const renderSearchBox = () => {
    const isAnyPopoverOpen = isOpenMiniFilters || isOpenMiniType || isOpenMiniSource || isOpenModeDropdown;
    return (
      <div className={`relative w-full ${isAnyPopoverOpen ? "z-50" : "z-20"}`}>
        <form onSubmit={handleSearchSubmit} className="w-full bg-white/90 dark:bg-[#121212]/90 backdrop-blur-md rounded-[24px] border border-slate-200/80 dark:border-slate-800/80 p-2 shadow-md hover:shadow-lg focus-within:shadow-xl focus-within:shadow-blue-500/5 focus-within:border-blue-500/40 transition-all duration-300 ease-out flex flex-col gap-1.5">
          {/* Search Input */}
          <div className="flex-1 min-w-0 flex items-center px-3 py-1 gap-2.5">
            <Search className="w-5 h-5 text-slate-400 dark:text-slate-500 shrink-0" />
            <input
              data-testid="paper-search-input"
              type="text"
              placeholder={
                searchMode === "semantic"
                  ? t("Search research papers by concept, question or topic...")
                  : t("Search papers by keywords in title or abstract...")
              }
              value={localSearchQuery}
              onChange={(e) => setLocalSearchQuery(e.target.value)}
              className="w-full h-10 bg-transparent text-sm font-semibold text-slate-900 dark:text-white focus:outline-none placeholder-slate-400/80"
            />
            {localSearchQuery && (
              <button
                type="button"
                onClick={() => setLocalSearchQuery("")}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="submit"
              aria-label="Search"
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-full text-xs font-extrabold flex items-center gap-1.5 transition-all duration-150 active:scale-95 shadow-sm shrink-0"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search</span>
            </button>
          </div>

          <div className="h-px bg-slate-100 dark:bg-slate-800/60 my-0.5"></div>

          {/* Row 2: Search Options */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-2 pt-0.5 pb-0.5 select-none gap-2 sm:gap-0">
            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
              {/* 1. Integrated Filters Button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpenMiniFilters(prev => !prev);
                    setIsOpenMiniType(false);
                    setIsOpenMiniSource(false);
                  }}
                  className={`h-8 px-3 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all duration-150 border active:scale-95 ${
                    activeFiltersCount > 0
                      ? "bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-blue-200 dark:border-blue-800/80 text-blue-700 dark:text-blue-400 font-extrabold shadow-sm"
                      : "bg-slate-50/60 dark:bg-slate-800/60 border-slate-200/60 dark:border-slate-800/60 text-slate-650 dark:text-slate-355 hover:bg-slate-100 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>Filters</span>
                  {activeFiltersCount > 0 && (
                    <span className="flex items-center justify-center w-5 h-5 text-[10px] font-extrabold bg-blue-600 text-white rounded-full shrink-0">
                      {activeFiltersCount}
                    </span>
                  )}
                </button>

                {isOpenMiniFilters && (
                  <div className="absolute left-0 mt-2 w-72 bg-white dark:bg-[#181818] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl ring-1 ring-slate-900/10 dark:ring-white/10 z-50 p-4 animate-fadeIn duration-150 select-none" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-2 mb-3">
                      <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200">More Filters</span>
                      <button
                        type="button"
                        onClick={() => {
                          setYearFrom(String(MIN_PUBLICATION_YEAR));
                          setYearTo(String(CURRENT_YEAR));
                          setOpenAccessOnly(false);
                          setAiScoreThreshold(0);
                          resetPage();
                        }}
                        className="text-[10px] font-bold text-blue-600 dark:text-blue-450 hover:underline"
                      >
                        Reset
                      </button>
                    </div>

                    {/* 1.1 Publication Year with Sliders */}
                    <div className="mb-4">
                      <label className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 block">
                        Publication Year
                      </label>

                      <div className="space-y-2.5">
                        <div>
                          <div className="flex justify-between text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-0.5">
                            <span>From Year</span>
                            <span className="font-extrabold text-blue-700 dark:text-blue-450">{yearFrom}</span>
                          </div>
                          <input
                            type="range"
                            min={MIN_PUBLICATION_YEAR}
                            max={CURRENT_YEAR}
                            value={yearFrom}
                            onChange={(e) => {
                              const val = e.target.value;
                              setYearFrom(val);
                              if (parseInt(val) > parseInt(yearTo)) {
                                setYearTo(val);
                              }
                              resetPage();
                            }}
                            className="w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-700 active:scale-98 transition-all"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-0.5">
                            <span>To Year</span>
                            <span className="font-extrabold text-blue-700 dark:text-blue-450">{yearTo}</span>
                          </div>
                          <input
                            type="range"
                            min={MIN_PUBLICATION_YEAR}
                            max={CURRENT_YEAR}
                            value={yearTo}
                            onChange={(e) => {
                              const val = e.target.value;
                              setYearTo(val);
                              if (parseInt(val) < parseInt(yearFrom)) {
                                setYearFrom(val);
                              }
                              resetPage();
                            }}
                            className="w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-700 active:scale-98 transition-all"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 1.2 Open Access Only Toggle */}
                    <div
                      onClick={() => { setOpenAccessOnly(prev => !prev); resetPage(); }}
                      className="mb-4 flex items-center justify-between cursor-pointer select-none py-1.5 border-t border-slate-100 dark:border-slate-800/60"
                    >
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Open Access Only
                      </span>
                      <div className={`w-9 h-5 rounded-full relative transition-colors ${openAccessOnly ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-800"}`}>
                        <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${openAccessOnly ? "translate-x-4" : "translate-x-0"}`}></div>
                      </div>
                    </div>

                    <div className="mb-4 border-t border-slate-100 pt-2.5 dark:border-slate-800/60">
                      <label className="mb-1.5 block text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Paper language
                      </label>
                      <select
                        value={scopeFilters.languages[0] ?? "all"}
                        onChange={(event) => setLanguageFilter(event.target.value)}
                        className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-[#1e1e1e] dark:text-slate-200"
                      >
                        <option value="all">All languages</option>
                        <option value="en">English</option>
                        <option value="vi">Vietnamese</option>
                        <option value="zh">Chinese</option>
                        <option value="es">Spanish</option>
                        <option value="fr">French</option>
                        <option value="pt">Portuguese</option>
                        <option value="de">German</option>
                        <option value="ru">Russian</option>
                        <option value="ja">Japanese</option>
                        <option value="ko">Korean</option>
                        <option value="und">Unknown language</option>
                      </select>
                    </div>

                    {/* Semantic similarity threshold (only applies to vector search). */}
                    {searchMode === "semantic" && (
                      <div className="mb-2 border-t border-slate-100 dark:border-slate-800/60 pt-2.5">
                        <div className="flex justify-between text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">
                          <span>Semantic Match Threshold</span>
                          <span className="font-extrabold text-blue-700 dark:text-blue-450">{aiScoreThreshold.toFixed(2)}+</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={Math.round(aiScoreThreshold * 100)}
                          onChange={(e) => {
                            setAiScoreThreshold(parseInt(e.target.value, 10) / 100);
                            resetPage();
                          }}
                          className="w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-700 active:scale-98 transition-all"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 2. Journal Type Filter */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpenMiniType(prev => !prev);
                    setIsOpenMiniFilters(false);
                    setIsOpenMiniSource(false);
                  }}
                  className={`h-8 px-3 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all duration-150 border active:scale-95 ${
                    journalTypes.length > 0
                      ? "bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-blue-200 dark:border-blue-800/80 text-blue-700 dark:text-blue-400 font-extrabold shadow-sm"
                      : "bg-slate-50/60 dark:bg-slate-800/60 border-slate-200/60 dark:border-slate-800/60 text-slate-650 dark:text-slate-355 hover:bg-slate-100 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <FileText className={`w-3.5 h-3.5 shrink-0 ${journalTypes.length > 0 ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-slate-500"}`} />
                  <span>Type{journalTypes.length > 0 ? `: ${journalTypes.length}` : ""}</span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>
                {isOpenMiniType && (
                  <div className="absolute left-0 mt-2 w-52 bg-white dark:bg-[#181818] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl ring-1 ring-slate-900/10 dark:ring-white/10 z-50 p-2.5 animate-fadeIn duration-150 select-none" onClick={(e) => e.stopPropagation()}>
                    <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-2 py-1 mb-1 block select-none">
                      Journal Type
                    </div>
                    <div className="flex flex-col gap-2 p-1">
                      <label className="flex items-center gap-2 cursor-pointer" onClick={() => { handleJournalTypeToggle("proceedings"); resetPage(); }}>
                        <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors ${journalTypes.includes("proceedings") ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1e1e1e]"}`}>
                          {journalTypes.includes("proceedings") && <Check className="w-2.5 h-2.5" />}
                        </div>
                        <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">Conference Proceedings</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer" onClick={() => { handleJournalTypeToggle("article"); resetPage(); }}>
                        <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors ${journalTypes.includes("article") ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1e1e1e]"}`}>
                          {journalTypes.includes("article") && <Check className="w-2.5 h-2.5" />}
                        </div>
                        <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">Journal Article</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer" onClick={() => { handleJournalTypeToggle("preprint"); resetPage(); }}>
                        <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors ${journalTypes.includes("preprint") ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1e1e1e]"}`}>
                          {journalTypes.includes("preprint") && <Check className="w-2.5 h-2.5" />}
                        </div>
                        <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">Preprint</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Source/Provider Filter */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpenMiniSource(prev => !prev);
                    setIsOpenMiniFilters(false);
                    setIsOpenMiniType(false);
                  }}
                  className={`h-8 px-3 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all duration-150 border active:scale-95 ${
                    primaryProvider !== "all"
                      ? "bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-blue-200 dark:border-blue-800/80 text-blue-700 dark:text-blue-400 font-extrabold shadow-sm"
                      : "bg-slate-50/60 dark:bg-slate-800/60 border-slate-200/60 dark:border-slate-800/60 text-slate-655 dark:text-slate-300 hover:bg-slate-100 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <Database className={`w-3.5 h-3.5 shrink-0 ${primaryProvider !== "all" ? "text-blue-600 dark:text-blue-400" : "text-slate-400 dark:text-slate-500"}`} />
                  <span>Source{primaryProvider !== "all" ? `: ${primaryProvider === "openalex" ? "OpenAlex" : "Crossref"}` : ""}</span>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>
                {isOpenMiniSource && (
                  <div className="absolute left-0 mt-2 w-44 bg-white dark:bg-[#181818] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl ring-1 ring-slate-900/10 dark:ring-white/10 z-50 p-1.5 animate-fadeIn duration-150" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => {
                        setPrimaryProvider("all");
                        resetPage();
                        setIsOpenMiniSource(false);
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-lg flex items-center justify-between transition-colors"
                    >
                      <span>All Sources</span>
                      {primaryProvider === "all" && <Check className="w-3.5 h-3.5 text-blue-600" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPrimaryProvider("openalex");
                        resetPage();
                        setIsOpenMiniSource(false);
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-350 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-lg flex items-center justify-between transition-colors"
                    >
                      <span>OpenAlex</span>
                      {primaryProvider === "openalex" && <Check className="w-3.5 h-3.5 text-blue-600" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPrimaryProvider("crossref");
                        resetPage();
                        setIsOpenMiniSource(false);
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-355 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-lg flex items-center justify-between transition-colors"
                    >
                      <span>Crossref</span>
                      {primaryProvider === "crossref" && <Check className="w-3.5 h-3.5 text-blue-600" />}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right side: Real actions */}
            <div className="flex items-center justify-start sm:justify-end gap-2 w-full sm:w-auto border-t border-slate-100 sm:border-0 pt-2 sm:pt-0 dark:border-slate-800/60 mt-1 sm:mt-0">
              {/* Dropdown: keyword or semantic retrieval mode. */}
              <div className="relative">
                <button
                  data-testid="search-mode-menu"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsOpenModeDropdown(prev => !prev);
                  }}
                  className="h-8 px-3.5 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-all border border-slate-200/60 dark:border-slate-800 active:scale-95 shadow-sm"
                >
                  {searchMode === "semantic" ? (
                    <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 animate-pulse shrink-0" />
                  ) : (
                    <Search className="w-3.5 h-3.5 text-slate-455 shrink-0" />
                  )}
                  <span>{searchMode === "semantic" ? "Semantic" : "Keyword"}</span>
                  <ChevronDown className={`w-3 h-3 text-slate-500 transition-transform ${isOpenModeDropdown ? "rotate-180" : ""}`} />
                </button>

                {isOpenModeDropdown && (
                  <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-[#181818] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl ring-1 ring-slate-900/10 dark:ring-white/10 z-50 p-1 animate-fadeIn duration-150">
                    <button
                      data-testid="search-mode-keyword"
                      type="button"
                      onClick={() => {
                        setSearchMode("keyword");
                        setIsOpenModeDropdown(false);
                        resetPage();
                      }}
                      className="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-355 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-lg flex flex-col gap-0.5 transition-colors"
                    >
                      <div className="flex items-center justify-between font-bold">
                        <span>Keyword</span>
                        {searchMode === "keyword" && <Check className="w-3.5 h-3.5 text-blue-600" />}
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Title, abstract, phrase, and DOI matching</span>
                    </button>
                    <button
                      data-testid="search-mode-semantic"
                      type="button"
                      onClick={() => {
                        setSearchMode("semantic");
                        setIsOpenModeDropdown(false);
                        resetPage();
                      }}
                      className="w-full text-left px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-355 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-lg flex flex-col gap-0.5 transition-colors"
                    >
                      <div className="flex items-center justify-between font-bold">
                        <div className="flex items-center gap-1">
                          <span>Semantic</span>
                          <span className="text-[9px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-450 font-bold px-1 rounded">BETA</span>
                        </div>
                        {searchMode === "semantic" && <Check className="w-3.5 h-3.5 text-blue-600" />}
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">AI-powered conceptual meaning search</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Expansion toggle (AI Rerank toggle) */}
              <button
                data-testid="ai-rerank-toggle"
                type="button"
                onClick={() => {
                  if (searchMode === "semantic") {
                    setRerank(prev => !prev);
                    resetPage();
                  }
                }}
                className={`h-8 px-3.5 rounded-full text-xs font-bold transition-all border flex items-center gap-1.5 active:scale-95 ${
                  rerank && searchMode === "semantic"
                    ? "bg-gradient-to-r from-purple-500/10 to-indigo-50/10 border-purple-200 dark:border-purple-800/60 text-purple-700 dark:text-purple-400 font-extrabold shadow-sm"
                    : "bg-transparent border-slate-205 dark:border-slate-800 text-slate-455 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
                title={searchMode === "semantic" ? "AI Rerank results for higher relevance" : "Rerank only available in Semantic mode"}
                disabled={searchMode !== "semantic"}
              >
                <Cpu className={`w-3.5 h-3.5 ${rerank && searchMode === "semantic" ? "text-purple-600 dark:text-purple-400" : "text-slate-450"}`} />
                <span>AI Rerank</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  };

  if (!hasQuery) {
    return (
      <div className="w-full min-h-[65vh] flex flex-col items-center justify-center px-4 select-none animate-fadeIn duration-300">
        <div className="max-w-3xl w-full text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight mb-4">
            All the world's research,<br />
            <span className="bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-transparent">connected and open.</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 max-w-lg mx-auto leading-relaxed font-medium">
            Analyze millions of scholarly works, mapping concepts, citations, and emerging research directions in an open database.
          </p>

          <div className="mb-6 max-w-2xl mx-auto">
            {renderSearchBox()}
          </div>

          {/* Search Suggestions */}
          <div className="text-xs text-slate-450 dark:text-slate-500 font-semibold select-none">
            Try searching:{" "}
            {["medicine", "deep learning", "carbon nanotube", "economics"].map((term) => (
              <button
                key={term}
                onClick={() => {
                  setLocalSearchQuery(term);
                  setSearchParams(prev => {
                    prev.set("q", term);
                    prev.set("page", "1");
                    return prev;
                  });
                }}
                className="mx-1.5 text-blue-600 dark:text-blue-450 hover:underline cursor-pointer font-bold capitalize"
              >
                {term}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="w-full flex flex-col md:flex-row gap-8 items-start">
      {/* LEFT SIDEBAR: Filters (Hidden on mobile, rely on search box dropdowns) */}
      <aside className="hidden md:block w-64 lg:w-72 shrink-0 bg-white dark:bg-[#121212] rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm sticky top-24">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-blue-800 dark:text-blue-500 tracking-tight">Filters</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Refine your results</p>
          </div>
          <button
            onClick={handleClearAll}
            className="text-[10px] font-bold text-blue-600 dark:text-blue-450 hover:underline cursor-pointer uppercase tracking-wider transition-colors"
          >
            Clear All
          </button>
        </div>

        {/* Publication Year */}
        <div className="mb-6">
          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 block">
            PUBLICATION YEAR
          </label>

          {yearlyDistribution.length > 0 && (
            <div className="h-12 w-full mb-3 opacity-90 hover:opacity-100 transition-opacity">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={yearlyDistribution}
                  margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                  onClick={(data) => {
                    if (data && data.activeLabel) {
                      const yr = data.activeLabel;
                      setYearFrom(yr);
                      setYearTo(yr);
                      resetPage();
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                    {yearlyDistribution.map((entry, index) => {
                      const isSelected = parseInt(entry.year) >= parseInt(yearFrom) && parseInt(entry.year) <= parseInt(yearTo);
                      return (
                        <Cell
                          key={`cell-${index}`}
                          fill={isSelected ? "#1d4ed8" : "#e2e8f0"}
                          className="transition-colors duration-150"
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* 2 Range Sliders for dynamic selection */}
          <div className="space-y-3 pt-1 select-none">
            <div>
              <div className="flex justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                <span>From Year</span>
                <span className="font-extrabold text-blue-700 dark:text-blue-400">{yearFrom}</span>
              </div>
              <input
                type="range"
                min={MIN_PUBLICATION_YEAR}
                max={CURRENT_YEAR}
                value={yearFrom}
                onChange={(e) => {
                  const val = e.target.value;
                  setYearFrom(val);
                  if (parseInt(val) > parseInt(yearTo)) {
                    setYearTo(val);
                  }
                  resetPage();
                }}
                className="w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-700 active:scale-98 transition-all"
              />
            </div>
            <div>
              <div className="flex justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                <span>To Year</span>
                <span className="font-extrabold text-blue-700 dark:text-blue-400">{yearTo}</span>
              </div>
              <input
                type="range"
                min={MIN_PUBLICATION_YEAR}
                max={CURRENT_YEAR}
                value={yearTo}
                onChange={(e) => {
                  const val = e.target.value;
                  setYearTo(val);
                  if (parseInt(val) < parseInt(yearFrom)) {
                    setYearFrom(val);
                  }
                  resetPage();
                }}
                className="w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-700 active:scale-98 transition-all"
              />
            </div>
          </div>
        </div>

        {/* Open Access Only */}
        <div
          onClick={() => { setOpenAccessOnly(prev => !prev); resetPage(); }}
          className="mb-6 flex items-center justify-between cursor-pointer select-none"
        >
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Open Access Only
          </span>
          {/* Custom toggle switch */}
          <div
            className={`w-9 h-5 rounded-full relative transition-colors ${openAccessOnly ? "bg-blue-700" : "bg-slate-200 dark:bg-slate-800"}`}
          >
            <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${openAccessOnly ? "translate-x-4" : "translate-x-0"}`}></div>
          </div>
        </div>

        {/* Journal Type */}
        <div className="mb-6">
          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 block">
            JOURNAL TYPE
          </label>
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer select-none" onClick={() => handleJournalTypeToggle("proceedings")}>
              <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${journalTypes.includes("proceedings") ? "bg-blue-700 border-blue-700 text-white" : "border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1e1e1e]"}`}>
                {journalTypes.includes("proceedings") && <Check className="w-3 h-3" />}
              </div>
              <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">Conference Proceedings</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer select-none" onClick={() => handleJournalTypeToggle("article")}>
              <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${journalTypes.includes("article") ? "bg-blue-700 border-blue-700 text-white" : "border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1e1e1e]"}`}>
                {journalTypes.includes("article") && <Check className="w-3 h-3" />}
              </div>
              <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">Journal Article</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer select-none" onClick={() => handleJournalTypeToggle("preprint")}>
              <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${journalTypes.includes("preprint") ? "bg-blue-700 border-blue-700 text-white" : "border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1e1e1e]"}`}>
                {journalTypes.includes("preprint") && <Check className="w-3 h-3" />}
              </div>
              <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">Preprint</span>
            </label>
          </div>
        </div>

        {/* Source */}
        <div className="mb-6">
          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 block">
            SOURCE
          </label>
          <div className="relative">
            <select
              value={primaryProvider}
              onChange={(e) => { setPrimaryProvider(e.target.value); resetPage(); }}
              className="w-full h-10 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1e1e1e] px-3 text-sm font-medium text-slate-900 dark:text-white appearance-none focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">All Sources</option>
              <option value="openalex">OpenAlex</option>
              <option value="semanticscholar">Semantic Scholar</option>
              <option value="crossref">Crossref</option>
              <option value="arxiv">arXiv</option>
              <option value="user">User submissions</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          </div>
        </div>

        <div className="mb-6">
          <label className="mb-3 block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            PAPER LANGUAGE
          </label>
          <div className="relative">
            <select
              value={scopeFilters.languages[0] ?? "all"}
              onChange={(event) => setLanguageFilter(event.target.value)}
              className="h-10 w-full cursor-pointer appearance-none rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-[#1e1e1e] dark:text-white"
            >
              <option value="all">All languages</option>
              <option value="en">English</option>
              <option value="vi">Vietnamese</option>
              <option value="zh">Chinese</option>
              <option value="es">Spanish</option>
              <option value="fr">French</option>
              <option value="pt">Portuguese</option>
              <option value="de">German</option>
              <option value="ru">Russian</option>
              <option value="ja">Japanese</option>
              <option value="ko">Korean</option>
              <option value="und">Unknown language</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
            Filters source metadata only. Paper titles and abstracts remain in their original language.
          </p>
        </div>

        {/* Semantic similarity threshold */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              SEMANTIC MATCH THRESHOLD
            </label>
            <span className="text-xs font-bold text-blue-700 dark:text-blue-500">
              {aiScoreThreshold.toFixed(2)}+
            </span>
          </div>
          <div className="relative pt-1 pb-4">
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(aiScoreThreshold * 100)}
              onChange={(e) => { setAiScoreThreshold(parseInt(e.target.value, 10) / 100); resetPage(); }}
              disabled={searchMode !== "semantic"}
              className="w-full h-1 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-700 disabled:opacity-50"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-2 font-medium">
              <span>0.0</span>
              <span>1.0</span>
            </div>
            {searchMode !== "semantic" && (
              <p className="text-[10px] text-amber-600 dark:text-amber-500 font-semibold mt-2">
                Only available in Semantic Search mode.
              </p>
            )}
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT: Search Results */}
      <main className="flex-1 w-full min-w-0">
        {/* S1: Integrated Search Input & Filters */}
        <div className="mb-6 animate-fadeIn duration-150 relative z-30">
          {renderSearchBox()}
        </div>

        {activeScopeFilterCount > 0 && (
          <div className="mb-6 rounded-2xl border border-blue-150/40 bg-gradient-to-br from-blue-50/50 to-blue-50/20 p-5 shadow-[0_4px_12px_rgba(0,0,0,0.015)] dark:border-blue-900/30 dark:from-blue-950/20 dark:to-blue-950/5 animate-fadeIn">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3 min-w-0">
                <div className="p-2 bg-blue-100/60 dark:bg-blue-950 text-blue-600 dark:text-blue-400 rounded-xl shrink-0 mt-0.5 select-none">
                  <Info className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="text-sm font-extrabold text-slate-900 dark:text-white leading-none">
                    Scoped Search Active
                  </div>
                  <p className="text-[11.5px] leading-relaxed text-slate-550 dark:text-slate-400 font-semibold max-w-3xl">
                    These results are filtered by the active Trends dataset scope. If you get no papers, the scope may be too narrow.
                  </p>
                  
                  {/* Chips */}
                  <div className="pt-2 flex flex-wrap gap-1.5">
                    {activeScopeChips.map((chip) => (
                      <button
                        key={`${chip.key}:${chip.value}`}
                        type="button"
                        onClick={() => removeScopeFilterValue(chip.key, chip.value)}
                        className="inline-flex max-w-[260px] items-center gap-1.5 rounded-xl border border-blue-200/50 bg-white dark:border-slate-800 dark:bg-slate-900 px-3 py-1 text-[11px] font-extrabold text-blue-700 dark:text-blue-400 hover:border-red-300 dark:hover:border-red-900 hover:text-red-650 transition-all shadow-sm"
                        title={`Remove ${chip.label}`}
                      >
                        <span className="truncate">{chip.label}</span>
                        <X className="h-3 w-3 shrink-0 text-blue-455 hover:text-red-500" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              
              {/* Actions buttons */}
              <div className="flex shrink-0 flex-wrap gap-2.5 self-end lg:self-center select-none">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={relaxTrendScope}
                  className="h-8.5 px-3.5 rounded-xl border-blue-200/50 hover:border-blue-300 bg-white hover:bg-blue-50/50 text-[11.5px] font-extrabold text-blue-700 dark:border-blue-900/60 dark:bg-slate-900 dark:text-blue-400 dark:hover:bg-slate-850 shadow-sm transition-all"
                >
                  Relax filters
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={clearTrendScope}
                  className="h-8.5 px-3.5 rounded-xl border-slate-200 dark:border-slate-800 bg-white hover:bg-slate-50 text-[11.5px] font-extrabold text-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-850 shadow-sm transition-all"
                >
                  Clear Trends scope
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-4 border-b border-slate-200 dark:border-slate-800 pb-4 gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                {isLoading ? "Searching..." : hasQuery ? `Results for "${q}"` : "Browse papers"}
              </h1>
              {resultMode === "semantic+rerank" && !isLoading && (
                <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 text-[10px] font-bold px-2 py-0.5 rounded border border-purple-200 dark:border-purple-800 uppercase tracking-wide select-none">
                  AI Reranked
                </span>
              )}
            </div>
            {!isLoading && meta && (
              <p className="text-sm text-slate-500 mt-1">
                Showing {papers.length > 0 ? ((safePage - 1) * PAGE_SIZE) + 1 : 0}–{Math.min(safePage * PAGE_SIZE, meta.total)} of {meta.total}{isSemanticSearchActive ? " top matches" : " papers"}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0 w-full sm:w-auto">
            {currentUser?.role !== "admin" && (
              <Link to="/settings/submit-paper" className="w-full sm:w-auto">
                <Button size="sm" className="w-full sm:w-auto h-9 bg-blue-700 hover:bg-blue-800 text-white font-bold gap-1.5 rounded-lg px-4 shadow-sm transition-all active:scale-95 duration-150">
                  <Plus className="w-4 h-4" />
                  Contribute Paper
                </Button>
              </Link>
            )}

            <div className="flex items-center justify-between sm:justify-start w-full sm:w-auto gap-2 bg-slate-50 dark:bg-[#1e1e1e] sm:bg-transparent p-2 sm:p-0 rounded-lg border sm:border-none border-slate-200 dark:border-slate-800">
              <span className="text-xs font-medium text-slate-500 whitespace-nowrap">Sort by:</span>
              <div className="relative z-0 w-full sm:w-auto">
                <select
                  value={sortBy}
                  onChange={(e) => { setSortBy(e.target.value as FeSortKey); resetPage(); }}
                  className="w-full sm:w-auto h-8 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1e1e1e] pl-3 pr-8 text-xs font-medium text-slate-900 dark:text-white appearance-none focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="relevance">Relevance</option>
                  <option value="date">Date (Newest)</option>
                  <option value="citations">Citations</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>

        {/* Results List */}
        <div className="space-y-4" data-testid="paper-search-results">
          {isLoading ? (
            <div className="py-8 text-center text-slate-500">Loading papers...</div>
          ) : isError ? (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-5 py-8 text-center dark:border-red-900/60 dark:bg-red-950/20"
            >
              <p className="font-semibold text-red-800 dark:text-red-300">Search could not be completed.</p>
              <p className="mt-1 text-sm text-red-700/80 dark:text-red-300/80">
                {getRequestErrorMessage(requestError)}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => void activeQuery.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : papers.length === 0 ? (
            <div className="py-8 text-center text-slate-500">
              {hasQuery ? "No papers found matching the filters." : "Browse state is empty. Enter a search query to explore."}
            </div>
          ) : (
            papers.map(paper => (
              <PaperCard
                key={paper.id}
                id={paper.id}
                title={paper.title}
                authors={
                  paper.authors.length > 3
                    ? paper.authors.slice(0, 3).map(a => a.displayName).join(", ") + ` +${paper.authors.length - 3} more`
                    : paper.authors.map(a => a.displayName).join(", ")
                }
                journal={paper.journalName || "Unknown Journal"}
                doi={paper.externalIds?.doi || ""}
                abstract={paper.abstractText || "No abstract available."}
                score={paper.score?.toFixed(2) ?? "N/A"}
                keywords={paper.keywords?.map(k => k.keywordName) || []}
                isBookmarked={bookmarkedPaperIds.has(paper.id)}
                bookmarkId={bookmarkIdMap.get(paper.id)}
                showBookmark={Boolean(currentUser)}
                publicationYear={paper.publicationYear}
                citationCount={paper.citationCount}
                primaryProvider={paper.primaryProvider}
                language={paper.language}
                paperKind={paper.paperKind}
                openAccessUrl={paper.openAccessUrl}
                dataQualityScore={paper.dataQualityScore}
                aiScore={paper.aiScore?.finalScore}
                rerankScore={paper.rerankScore}
                taxonomyBoostScore={paper.taxonomyBoostScore}
                searchMode={searchMode}
              />
            ))
          )}
        </div>

        {/* Pagination — server-side */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1 mt-10 mb-8">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 text-slate-500 rounded-md border-slate-200 dark:border-slate-800"
              disabled={safePage <= 1}
              onClick={() => handlePageChange(safePage - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-slate-600 dark:text-slate-400 mx-4">
              Page {safePage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 text-slate-500 rounded-md border-slate-200 dark:border-slate-800"
              disabled={safePage >= totalPages}
              onClick={() => handlePageChange(safePage + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
