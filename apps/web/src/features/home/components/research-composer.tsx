import { useRef, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, Cpu, Database, FileText, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n";
import { HOME_SCOPE_FILTERS, LITERATURE_PATH } from "../utils/home-search";

const sources = [
  { value: "all", label: "All sources" },
  { value: "openalex", label: "OpenAlex" },
  { value: "semanticscholar", label: "Semantic Scholar" },
  { value: "crossref", label: "Crossref" },
  { value: "arxiv", label: "arXiv" },
  { value: "user", label: "Contributed papers" },
] as const;
const suggestions = ["Medicine", "Deep Learning", "Carbon Nanotubes", "Economics"];
const paperTypes = [
  { value: "proceedings", label: "Conference Proceedings" },
  { value: "article", label: "Journal Article" },
  { value: "preprint", label: "Preprint" },
] as const;
const publicationRanges = ["Any time", "Last 5 years", "Last 2 years", "This year"] as const;
type PublicationRange = (typeof publicationRanges)[number] | "Custom range";

export function ResearchComposer({ id = "home-literature-search", canRerank = false }: { id?: string; canRerank?: boolean }) {
  const [searchParams] = useSearchParams();
  return <ResearchComposerForm key={searchParams.toString()} id={id} canRerank={canRerank} searchParams={searchParams} />;
}

function ResearchComposerForm({ id, canRerank, searchParams }: { id: string; canRerank: boolean; searchParams: URLSearchParams }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [mode, setMode] = useState<"semantic" | "keyword">(() => searchParams.get("mode") === "keyword" ? "keyword" : "semantic");
  const [source, setSource] = useState(() => sources.some((item) => item.value === searchParams.get("provider")) ? searchParams.get("provider")! : "all");
  const [types, setTypes] = useState<string[]>(() => searchParams.getAll("type"));
  const [rerank, setRerank] = useState(() => canRerank && searchParams.get("mode") !== "keyword" && searchParams.get("rerank") === "true");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [publicationRange, setPublicationRange] = useState<PublicationRange>(() => {
    const from = searchParams.get("yearFrom"), to = searchParams.get("yearTo"), year = new Date().getFullYear();
    if (!from && !to) return "Any time";
    if (Number(to) === year) {
      if (Number(from) === year) return "This year";
      if (Number(from) === year - 1) return "Last 2 years";
      if (Number(from) === year - 4) return "Last 5 years";
    }
    return "Custom range";
  });
  const [openAccess, setOpenAccess] = useState(() => searchParams.get("openAccess") === "true");
  const activeFilters = Number(publicationRange !== "Any time") + Number(openAccess);
  // Provider names remain proper nouns, independent of UI translation.
  const labelForSource = (item: (typeof sources)[number]) => item.value === "all" || item.value === "user" ? t(item.label) : item.label;
  const sourceLabel = labelForSource(sources.find((item) => item.value === source) ?? sources[0]);
  const placeholder = t(mode === "semantic" ? "Search research papers by concept, question or topic..." : "Search papers by keywords in title or abstract...");
  const rerankHint = t(!canRerank ? "Sign in to use AI reranking." : mode === "keyword" ? "Rerank only available in Semantic mode" : "AI Rerank results for higher relevance");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = query.trim();
    // Encode the query independently so reserved characters remain part of it.
    const parameters: string[] = value ? [`q=${encodeURIComponent(value)}`] : [];
    if (mode === "keyword") parameters.push("mode=keyword");
    if (source !== "all") parameters.push(`provider=${encodeURIComponent(source)}`);
    if (publicationRange === "Custom range") {
      for (const key of ["yearFrom", "yearTo"]) { const year = searchParams.get(key); if (year) parameters.push(`${key}=${encodeURIComponent(year)}`); }
    } else if (publicationRange !== "Any time") {
      const year = new Date().getFullYear();
      const from = publicationRange === "Last 5 years" ? year - 4 : publicationRange === "Last 2 years" ? year - 1 : year;
      parameters.push(`yearFrom=${from}`, `yearTo=${year}`);
    }
    if (openAccess) parameters.push("openAccess=true");
    types.forEach((type) => parameters.push(`type=${encodeURIComponent(type)}`));
    for (const key of HOME_SCOPE_FILTERS) searchParams.getAll(key).forEach((value) => parameters.push(`${key}=${encodeURIComponent(value)}`));
    if (canRerank && mode === "semantic" && rerank) parameters.push("rerank=true");
    navigate(`${LITERATURE_PATH}${parameters.length ? `?${parameters.join("&")}` : ""}`);
  };

  return <div className="research-composer-wrap">
    <form onSubmit={submit} role="search" className="research-composer">
      <div className="research-composer-input-row">
        <Search aria-hidden="true" />
        <label htmlFor={id} className="sr-only">{t("Search papers, DOI, topics, research questions...")}</label>
        <input
          ref={input}
          id={id}
          type="search"
          name="q"
          maxLength={500}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button type="submit" className="research-composer-submit"><Search aria-hidden="true" /><span>{t("Search")}</span></button>
      </div>

      <div className="research-composer-toolbar">
        <div className="research-composer-options">
          <button type="button" className="research-composer-option research-composer-filter" data-active={activeFilters > 0} aria-expanded={filtersOpen} aria-controls={`${id}-filters`} aria-label={activeFilters ? t("Filters, {{count}} active", { count: activeFilters }) : t("Filters")} onClick={() => setFiltersOpen((open) => !open)}>
            <SlidersHorizontal aria-hidden="true" /><span>{t("Filters")}</span>{activeFilters > 0 ? <span className="research-filter-count" aria-hidden="true">{activeFilters}</span> : null}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="research-composer-option" data-active={types.length > 0} aria-label={types.length ? t("Paper type, {{count}} selected", { count: types.length }) : t("Paper type")}>
                <FileText aria-hidden="true" /><span>{t("Type")}{types.length > 0 ? `: ${types.length}` : ""}</span><ChevronDown aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={8} className="research-composer-menu" data-no-i18n>
              <DropdownMenuLabel>{t("Paper type")}</DropdownMenuLabel>
              {paperTypes.map((item) => <DropdownMenuCheckboxItem key={item.value} checked={types.includes(item.value)} onSelect={(event) => event.preventDefault()} onCheckedChange={(checked) => setTypes((previous) => checked ? [...previous, item.value] : previous.filter((value) => value !== item.value))}>{t(item.label)}</DropdownMenuCheckboxItem>)}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="research-composer-option research-composer-source" data-active={source !== "all"} aria-label={t("Research source: {{source}}", { source: sourceLabel })}>
                <Database aria-hidden="true" />
                <span className="research-source-label">{source === "all" ? t("Source") : sourceLabel}</span>
                <ChevronDown aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={8} className="research-composer-menu" data-no-i18n>
              <DropdownMenuRadioGroup value={source} onValueChange={setSource} aria-label={t("Research source")}>
                {sources.map((item) => <DropdownMenuRadioItem key={item.value} value={item.value}>{labelForSource(item)}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="research-composer-actions">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="research-composer-option research-composer-mode" aria-label={t("Search mode: {{mode}}", { mode: t(mode === "semantic" ? "Semantic" : "Keyword") })}>
                {mode === "semantic" ? <Sparkles aria-hidden="true" /> : <Search aria-hidden="true" />}<span>{t(mode === "semantic" ? "Semantic" : "Keyword")}</span><ChevronDown aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={8} className="research-composer-menu" data-no-i18n>
              <DropdownMenuRadioGroup value={mode} onValueChange={(value) => { setMode(value === "keyword" ? "keyword" : "semantic"); if (value === "keyword") setRerank(false); }} aria-label={t("Search mode")}>
                <DropdownMenuRadioItem value="semantic">{t("Semantic")}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="keyword">{t("Keyword")}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <button type="button" className="research-composer-option research-composer-rerank" aria-pressed={rerank} disabled={!canRerank || mode !== "semantic"} title={rerankHint} aria-describedby={`${id}-rerank-hint`} onClick={() => setRerank((previous) => !previous)}><Cpu aria-hidden="true" /><span>{t("AI Rerank")}</span></button>
          <span id={`${id}-rerank-hint`} className="sr-only">{rerankHint}</span>
        </div>
      </div>

      {filtersOpen ? <fieldset id={`${id}-filters`} className="research-composer-filters">
        <legend className="sr-only">{t("Search filters")}</legend>
        <div className="research-composer-filter-fields">
          <label className="research-publication-filter"><span>{t("Publication date")}</span>
            <select value={publicationRange} onChange={(event) => setPublicationRange(event.target.value as PublicationRange)}>
              {publicationRange === "Custom range" ? <option value="Custom range">{t("Custom range")} ({searchParams.get("yearFrom") ?? "…"}–{searchParams.get("yearTo") ?? "…"})</option> : null}
              {publicationRanges.map((range) => <option key={range} value={range}>{t(range)}</option>)}
            </select>
          </label>
          <label className="research-access-filter"><input type="checkbox" checked={openAccess} onChange={(event) => setOpenAccess(event.target.checked)} /><span>{t("Open access only")}</span></label>
        </div>
        <button type="button" className="research-composer-reset" disabled={!activeFilters} onClick={() => { setPublicationRange("Any time"); setOpenAccess(false); }}>{t("Reset filters")}</button>
      </fieldset> : null}
    </form>

    <div className="research-composer-suggestions">
      <span>{t("Try searching:")}</span>
      {suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => { setQuery(t(suggestion)); input.current?.focus(); }}>{t(suggestion)}</button>)}
    </div>
  </div>;
}
