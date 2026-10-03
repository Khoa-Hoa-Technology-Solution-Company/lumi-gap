import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertCircle, ArrowUpDown, BookOpen, Check, CheckCircle2, CircleHelp, FileText, Loader2, Search, SlidersHorizontal, Sparkles, Trash2, X, XCircle } from "lucide-react";
import type { IProject, Paper, ProjectExclusionReason, ProjectPaperSummary, ProjectReadingStatus, ProjectScreeningStatus } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { usePaper } from "@/features/papers/hooks/use-papers";
import { useComparePapers } from "@/features/compare/hooks/use-compare";
import { CompareTable } from "@/features/compare/components/compare-table";
import { useRemovePaperFromProject, useUpdateProject, useUpdateProjectPaper } from "@/features/projects/hooks/use-projects";
import { useI18n } from "@/i18n";

type ProjectPaperLink = IProject["papers"][number];
type LiteratureFilter = "UNDECIDED" | "INCLUDED" | "EXCLUDED" | "ALL";
type LiteratureSort = "ADDED_NEWEST" | "YEAR_NEWEST" | "YEAR_OLDEST" | "TITLE";

const exclusionReasons: Array<{ value: ProjectExclusionReason; label: string }> = [
  { value: "WRONG_RESEARCH_TOPIC", label: "Wrong research topic" },
  { value: "WRONG_POPULATION_CONTEXT", label: "Wrong population or context" },
  { value: "WRONG_METHODOLOGY", label: "Wrong methodology" },
  { value: "NOT_PEER_REVIEWED", label: "Not peer reviewed" },
  { value: "INSUFFICIENT_RELEVANT_EVIDENCE", label: "Insufficient relevant evidence" },
  { value: "DUPLICATE", label: "Duplicate" },
  { value: "OTHER", label: "Other" },
];

function paperParts(link: ProjectPaperLink): { id: string; summary?: ProjectPaperSummary } {
  return typeof link.targetId === "string"
    ? { id: link.targetId }
    : { id: link.targetId._id, summary: link.targetId };
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isMobile;
}

function authorLine(authors?: Array<{ displayName?: string }>) {
  const names = authors?.map((author) => author.displayName).filter(Boolean) ?? [];
  if (names.length > 3) return `${names.slice(0, 3).join(", ")} et al.`;
  return names.join(", ");
}

export function ProjectLiteratureWorkspace({
  projectId,
  papers,
  criteria,
  isOwner,
  readOnly,
  onRequestAddPaper,
  onNavigateToReports,
  onNavigateToGaps,
}: {
  projectId: string;
  papers: IProject["papers"];
  criteria?: IProject["screeningCriteria"];
  isOwner: boolean;
  readOnly: boolean;
  onRequestAddPaper: () => void;
  onNavigateToReports: () => void;
  onNavigateToGaps: () => void;
}) {
  const { t, language } = useI18n();
  const isMobile = useIsMobile();
  const updatePaper = useUpdateProjectPaper(projectId);
  const updateProject = useUpdateProject(projectId);
  const removePaper = useRemovePaperFromProject(projectId);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedFilter = searchParams.get("screening");
  const filter: LiteratureFilter = ["ALL", "UNDECIDED", "INCLUDED", "EXCLUDED"].includes(requestedFilter ?? "") ? requestedFilter as LiteratureFilter : "UNDECIDED";
  const setFilter = (next: LiteratureFilter) => {
    const params = new URLSearchParams(searchParams);
    params.set("screening", next);
    setSearchParams(params, { replace: true });
  };
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<LiteratureSort>("ADDED_NEWEST");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [readingFilter, setReadingFilter] = useState<"ALL" | ProjectReadingStatus>("ALL");
  const [yearFilter, setYearFilter] = useState("ALL");
  const [authorFilter, setAuthorFilter] = useState("ALL");
  const [venueFilter, setVenueFilter] = useState("ALL");
  const [evidenceOnly, setEvidenceOnly] = useState(false);
  const [aiAnalyzedOnly, setAiAnalyzedOnly] = useState(false);
  const [selectedPaperId, setSelectedPaperId] = useState("");
  const [selectedBulkIds, setSelectedBulkIds] = useState<string[]>([]);
  const [excludeDialog, setExcludeDialog] = useState<ProjectPaperLink | null>(null);
  const [exclusionReason, setExclusionReason] = useState<ProjectExclusionReason | "">("");
  const [exclusionNote, setExclusionNote] = useState("");
  const [notesDialog, setNotesDialog] = useState<ProjectPaperLink | null>(null);
  const [noteValue, setNoteValue] = useState("");
  const [removeDialog, setRemoveDialog] = useState<ProjectPaperLink | null>(null);
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const [inclusionText, setInclusionText] = useState("");
  const [exclusionText, setExclusionText] = useState("");
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const { data: compareData, isLoading: comparing, isError: compareError } = useComparePapers(compareOpen ? compareIds : []);
  const inclusionLines = criteria?.inclusion.join("\n") ?? "";
  const exclusionLines = criteria?.exclusion.join("\n") ?? "";

  useEffect(() => {
    setSelectedBulkIds((current) => current.filter((id) => papers.some((link) => paperParts(link).id === id)));
  }, [papers]);

  useEffect(() => {
    if (criteriaOpen) {
      setInclusionText(inclusionLines);
      setExclusionText(exclusionLines);
    }
  }, [criteriaOpen, inclusionLines, exclusionLines]);

  const counts = useMemo(() => ({
    all: papers.length,
    undecided: papers.filter((paper) => paper.screeningStatus === "UNDECIDED").length,
    included: papers.filter((paper) => paper.screeningStatus === "INCLUDED").length,
    excluded: papers.filter((paper) => paper.screeningStatus === "EXCLUDED").length,
  }), [papers]);
  const availableFilters = useMemo(() => {
    const summaries = papers.map((link) => paperParts(link).summary).filter((summary): summary is ProjectPaperSummary => Boolean(summary));
    return {
      years: [...new Set(summaries.flatMap((summary) => summary.publicationYear ? [summary.publicationYear] : []))].sort((left, right) => right - left),
      authors: [...new Set(summaries.flatMap((summary) => summary.authors?.flatMap((author) => author.displayName ? [author.displayName] : []) ?? []))].sort((left, right) => left.localeCompare(right)),
      venues: [...new Set(summaries.flatMap((summary) => summary.journalName ? [summary.journalName] : []))].sort((left, right) => left.localeCompare(right)),
    };
  }, [papers]);
  const activeFilterCount = [readingFilter !== "ALL", yearFilter !== "ALL", authorFilter !== "ALL", venueFilter !== "ALL", evidenceOnly, aiAnalyzedOnly].filter(Boolean).length;
  const screenedCount = counts.included + counts.excluded;
  const filteredPapers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const selected = papers.filter((link) => {
      const { summary } = paperParts(link);
      if (filter !== "ALL" && link.screeningStatus !== filter) return false;
      if (readingFilter !== "ALL" && link.readingStatus !== readingFilter) return false;
      if (yearFilter !== "ALL" && String(summary?.publicationYear ?? "") !== yearFilter) return false;
      if (authorFilter !== "ALL" && !summary?.authors?.some((author) => author.displayName === authorFilter)) return false;
      if (venueFilter !== "ALL" && summary?.journalName !== venueFilter) return false;
      if (evidenceOnly && link.evidenceCount === 0) return false;
      if (aiAnalyzedOnly && !summary?.hasAiAnalysis) return false;
      if (!normalized) return true;
      return [summary?.title, summary?.journalName, summary?.publicationYear, authorLine(summary?.authors)]
        .some((value) => String(value ?? "").toLocaleLowerCase().includes(normalized));
    });
    return selected.sort((left, right) => {
      const l = paperParts(left).summary;
      const r = paperParts(right).summary;
      if (sort === "TITLE") return (l?.title ?? "").localeCompare(r?.title ?? "");
      if (sort === "YEAR_NEWEST") return (r?.publicationYear ?? 0) - (l?.publicationYear ?? 0);
      if (sort === "YEAR_OLDEST") return (l?.publicationYear ?? 0) - (r?.publicationYear ?? 0);
      return new Date(right.addedAt).getTime() - new Date(left.addedAt).getTime();
    });
  }, [papers, filter, query, readingFilter, yearFilter, authorFilter, venueFilter, evidenceOnly, aiAnalyzedOnly, sort]);
  const effectiveSelectedId = filteredPapers.some((link) => paperParts(link).id === selectedPaperId)
    ? selectedPaperId
    : !isMobile && filteredPapers.length ? paperParts(filteredPapers[0]!).id : "";
  const selectedLink = filteredPapers.find((link) => paperParts(link).id === effectiveSelectedId);
  const selectedParts = selectedLink ? paperParts(selectedLink) : undefined;
  const paperQuery = usePaper(selectedParts?.id);
  const selectedPaper = paperQuery.data;
  const paperTitle = selectedPaper?.title ?? selectedParts?.summary?.title ?? "";

  const persistStatus = async (link: ProjectPaperLink, status: ProjectScreeningStatus) => {
    const { id } = paperParts(link);
    try {
      await updatePaper.mutateAsync({ paperId: id, data: { screeningStatus: status } });
      toast.success(t("Screening decision saved."));
    } catch {
      toast.error(t("Could not save the screening decision."));
    }
  };

  const startExclusion = (link: ProjectPaperLink) => {
    setExclusionReason("");
    setExclusionNote("");
    setExcludeDialog(link);
  };

  const saveExclusion = async () => {
    if (!excludeDialog || !exclusionReason || updatePaper.isPending) return;
    try {
      await updatePaper.mutateAsync({
        paperId: paperParts(excludeDialog).id,
        data: { screeningStatus: "EXCLUDED", exclusionReason, exclusionNote: exclusionNote.trim() || null },
      });
      toast.success(t("Screening decision saved."));
      setExcludeDialog(null);
    } catch {
      toast.error(t("Could not save the screening decision."));
    }
  };

  const saveNotes = async () => {
    if (!notesDialog || updatePaper.isPending) return;
    try {
      await updatePaper.mutateAsync({ paperId: paperParts(notesDialog).id, data: { notes: noteValue.trim() || null } });
      toast.success(t("Notes saved."));
      setNotesDialog(null);
    } catch {
      toast.error(t("Could not save notes."));
    }
  };

  const changeReadingStatus = async (link: ProjectPaperLink, status: ProjectReadingStatus) => {
    try {
      await updatePaper.mutateAsync({ paperId: paperParts(link).id, data: { readingStatus: status } });
      toast.success(t("Reading status saved."));
    } catch {
      toast.error(t("Could not save the reading status."));
    }
  };

  const saveCriteria = async () => {
    const inclusion = inclusionText.split("\n").map((line) => line.trim()).filter(Boolean);
    const exclusion = exclusionText.split("\n").map((line) => line.trim()).filter(Boolean);
    if ([...inclusion, ...exclusion].some((line) => line.length > 240) || inclusion.length > 20 || exclusion.length > 20) {
      toast.error(t("Use at most 20 criteria per list, with no item longer than 240 characters."));
      return;
    }
    try {
      await updateProject.mutateAsync({ inclusionCriteria: inclusion, exclusionCriteria: exclusion });
      toast.success(t("Screening criteria saved."));
      setCriteriaOpen(false);
    } catch {
      toast.error(t("Could not save screening criteria."));
    }
  };

  const saveRemove = async () => {
    if (!removeDialog) return;
    try {
      await removePaper.mutateAsync(paperParts(removeDialog).id);
      setRemoveDialog(null);
      toast.success(t("Paper removed from the project."));
    } catch {
      toast.error(t("Could not remove this paper."));
    }
  };

  const beginCompare = () => {
    setCompareIds(selectedBulkIds);
    setCompareOpen(true);
  };

  const toggleBulk = (id: string) => setSelectedBulkIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const clearFilters = () => {
    setQuery("");
    setFilter("ALL");
    setReadingFilter("ALL");
    setYearFilter("ALL");
    setAuthorFilter("ALL");
    setVenueFilter("ALL");
    setEvidenceOnly(false);
    setAiAnalyzedOnly(false);
  };
  const screeningTabs: Array<{ key: LiteratureFilter; label: string; count: number }> = [
    { key: "UNDECIDED", label: "To screen", count: counts.undecided },
    { key: "INCLUDED", label: "Included", count: counts.included },
    { key: "EXCLUDED", label: "Excluded", count: counts.excluded },
    { key: "ALL", label: "All", count: counts.all },
  ];

  const detailPanel = selectedLink && selectedParts ? (
    <PaperDetailPanel
      link={selectedLink}
      summary={selectedParts.summary}
      paper={selectedPaper}
      isLoading={paperQuery.isLoading}
      isError={paperQuery.isError}
      isReadOnly={readOnly}
      isSaving={updatePaper.isPending}
      language={language}
      t={t}
      onReadingStatus={(status) => void changeReadingStatus(selectedLink, status)}
      onScreen={(status) => void persistStatus(selectedLink, status)}
      onExclude={() => startExclusion(selectedLink)}
      onEditNotes={() => { setNoteValue(selectedLink.notes ?? ""); setNotesDialog(selectedLink); }}
      onViewEvidence={onNavigateToGaps}
    />
  ) : (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center px-6 text-center text-muted-foreground">
      <BookOpen className="mb-3 h-6 w-6" />
      <p className="text-sm font-medium text-foreground">{t("Select a paper to review")}</p>
      <p className="mt-1 max-w-xs text-xs">{t("Its abstract, notes, and project screening decision will appear here.")}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{t("Literature")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("{{papers}} papers · {{screened}} screened · {{included}} included", { papers: counts.all, screened: screenedCount, included: counts.included })}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{t("{{inclusion}} inclusion · {{exclusion}} exclusion criteria", { inclusion: criteria?.inclusion.length ?? 0, exclusion: criteria?.exclusion.length ?? 0 })}</span>
            <button type="button" className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setCriteriaOpen(true)}>{t("View criteria")}</button>
          </div>
        </div>
        {papers.length > 0 ? <Button size="sm" onClick={onRequestAddPaper}><span className="mr-1 text-base leading-none">+</span>{t("Add papers")}</Button> : null}
      </header>

      {papers.length === 0 ? (
        <div className="flex min-h-[260px] flex-col items-center justify-center border-y border-dashed px-6 py-12 text-center">
          <BookOpen className="h-7 w-7 text-muted-foreground" />
          <h3 className="mt-4 text-base font-semibold">{t("Build your project literature")}</h3>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">{t("Search scholarly literature or add papers you have already saved.")}</p>
          <p className="mt-1 max-w-lg text-xs text-muted-foreground">{t("After adding papers, screen them to build the corpus for evidence synthesis and research-gap analysis.")}</p>
          <Button className="mt-5" onClick={onRequestAddPaper}><span className="mr-1 text-base leading-none">+</span>{t("Add papers")}</Button>
        </div>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto border-b pb-2" role="tablist" aria-label={t("Screening status")}>
            {screeningTabs.map((item) => (
              <button key={item.key} type="button" role="tab" aria-selected={filter === item.key} onClick={() => setFilter(item.key)} className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${filter === item.key ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                {t(item.label)}<span className="text-xs tabular-nums opacity-75">{item.count}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder={t("Search title, author, year, or venue")}/>
            </div>
            <label className="inline-flex h-10 items-center gap-2 rounded-md border bg-background px-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><ArrowUpDown className="h-3.5 w-3.5" />{t("Sort")}</span>
              <select aria-label={t("Sort papers")} value={sort} onChange={(event) => setSort(event.target.value as LiteratureSort)} className="max-w-36 bg-transparent text-xs font-medium text-foreground outline-none">
                <option value="ADDED_NEWEST">{t("Recently added")}</option><option value="YEAR_NEWEST">{t("Year, newest")}</option><option value="YEAR_OLDEST">{t("Year, oldest")}</option><option value="TITLE">{t("Title, A to Z")}</option>
              </select>
            </label>
            <Button type="button" variant="outline" size="sm" aria-expanded={filtersOpen} aria-controls="project-literature-filters" onClick={() => setFiltersOpen((open) => !open)}>
              <SlidersHorizontal className="mr-2 h-3.5 w-3.5" />{t("Filters")}{activeFilterCount > 0 ? <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{activeFilterCount}</span> : null}
            </Button>
          </div>

          {filtersOpen ? (
            <div id="project-literature-filters" className="grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="grid gap-1 text-xs text-muted-foreground">{t("Reading status")}
                <select aria-label={t("Filter by reading status")} value={readingFilter} onChange={(event) => setReadingFilter(event.target.value as "ALL" | ProjectReadingStatus)} className="h-9 rounded-md border bg-background px-2 text-sm text-foreground">
                  <option value="ALL">{t("Any status")}</option><option value="NOT_STARTED">{t("Not started")}</option><option value="READING">{t("Reading")}</option><option value="REVIEWED">{t("Reviewed")}</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">{t("Year")}
                <select aria-label={t("Filter by year")} value={yearFilter} onChange={(event) => setYearFilter(event.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm text-foreground">
                  <option value="ALL">{t("All years")}</option>{availableFilters.years.map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">{t("Author")}
                <select aria-label={t("Filter by author")} value={authorFilter} onChange={(event) => setAuthorFilter(event.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm text-foreground">
                  <option value="ALL">{t("All authors")}</option>{availableFilters.authors.map((author) => <option key={author} value={author}>{author}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-muted-foreground">{t("Venue")}
                <select aria-label={t("Filter by venue")} value={venueFilter} onChange={(event) => setVenueFilter(event.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm text-foreground">
                  <option value="ALL">{t("All venues")}</option>{availableFilters.venues.map((venue) => <option key={venue} value={venue}>{venue}</option>)}
                </select>
              </label>
              <label className="flex min-h-9 items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={evidenceOnly} onChange={(event) => setEvidenceOnly(event.target.checked)} className="h-4 w-4 accent-primary" />{t("Has evidence")}</label>
              <label className="flex min-h-9 items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={aiAnalyzedOnly} onChange={(event) => setAiAnalyzedOnly(event.target.checked)} className="h-4 w-4 accent-primary" />{t("AI analyzed")}</label>
              {activeFilterCount > 0 ? <div className="sm:col-span-2 lg:col-span-3"><button type="button" onClick={clearFilters} className="text-xs font-medium text-primary underline-offset-4 hover:underline">{t("Clear filters")}</button></div> : null}
            </div>
          ) : null}

          {selectedBulkIds.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/50 px-3 py-2">
              <span className="text-xs font-medium">{t("{{count}} selected", { count: selectedBulkIds.length })}</span>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={selectedBulkIds.length < 2 || selectedBulkIds.length > 4} onClick={beginCompare}><Sparkles className="mr-1.5 h-3.5 w-3.5" />{t("Compare selected")}</Button>
                <Button size="sm" variant="outline" onClick={onNavigateToReports}><FileText className="mr-1.5 h-3.5 w-3.5" />{t("Create artifact")}</Button>
                <Button size="sm" variant="outline" onClick={onNavigateToGaps}>{t("Research gaps")}</Button>
              </div>
            </div>
          ) : null}

          <div className="grid overflow-hidden rounded-lg border bg-card lg:min-h-[620px] lg:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)]">
            <section aria-label={t("Project literature list")} className="min-w-0 border-b lg:border-b-0 lg:border-r">
              <div className="flex items-center justify-between border-b px-4 py-2.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Papers")}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{filteredPapers.length}</span>
              </div>
              <div className="max-h-[52vh] overflow-y-auto lg:max-h-[680px]">
                {filteredPapers.length === 0 ? (
                  <div className="px-5 py-12 text-center">
                    <p className="text-sm font-medium">{t("No papers match these filters")}</p>
                    <button type="button" className="mt-2 text-xs text-primary underline-offset-4 hover:underline" onClick={clearFilters}>{t("Clear filters")}</button>
                  </div>
                ) : filteredPapers.map((link) => {
                  const { id, summary } = paperParts(link);
                  const selected = id === effectiveSelectedId;
                  const title = summary?.title ?? t("Paper details unavailable");
                  const screeningLabel = link.screeningStatus === "INCLUDED" ? "Included" : link.screeningStatus === "EXCLUDED" ? "Excluded" : "To screen";
                  const statusClass = link.screeningStatus === "INCLUDED" ? "text-emerald-700 dark:text-emerald-300" : link.screeningStatus === "EXCLUDED" ? "text-rose-700 dark:text-rose-300" : "text-amber-700 dark:text-amber-300";
                  return (
                    <div key={id} className={`group flex items-start gap-2 border-b px-3 py-3 transition-colors last:border-b-0 ${selected ? "bg-primary/[0.06]" : "hover:bg-muted/50"}`}>
                      <input aria-label={t("Select {{title}} for bulk actions", { title })} type="checkbox" checked={selectedBulkIds.includes(id)} onChange={() => toggleBulk(id)} disabled={readOnly} className="mt-1 h-4 w-4 shrink-0 accent-primary" />
                      <button type="button" onClick={() => setSelectedPaperId(id)} aria-current={selected ? "true" : undefined} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <span className="block line-clamp-2 text-sm font-medium leading-5 text-foreground">{title}</span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">{authorLine(summary?.authors) || t("Authors unavailable")} · {summary?.journalName || t("Venue not listed")} · {summary?.publicationYear || t("Year not listed")}</span>
                        <span className={`mt-2 inline-flex items-center gap-1 text-[11px] font-medium ${statusClass}`}>
                          {link.screeningStatus === "INCLUDED" ? <CheckCircle2 className="h-3.5 w-3.5" /> : link.screeningStatus === "EXCLUDED" ? <XCircle className="h-3.5 w-3.5" /> : <CircleHelp className="h-3.5 w-3.5" />}{t(screeningLabel)}
                        </span>
                        <span className="ml-3 inline-flex items-center gap-3 text-[11px] text-muted-foreground"><span>{t("Evidence {{count}}", { count: link.evidenceCount })}</span><span>{t("Notes {{count}}", { count: link.notes?.trim() ? 1 : 0 })}</span></span>
                      </button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground opacity-60 hover:text-destructive group-hover:opacity-100" aria-label={t("Remove {{title}} from project", { title })} onClick={() => setRemoveDialog(link)} disabled={readOnly}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </section>
            <div className="hidden min-w-0 lg:flex lg:flex-col">{detailPanel}</div>
          </div>
        </>
      )}

      <Dialog open={Boolean(excludeDialog)} onOpenChange={(open) => { if (!open && !updatePaper.isPending) setExcludeDialog(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Why are you excluding this paper?")}</DialogTitle>
            <DialogDescription className="line-clamp-2">{excludeDialog ? paperParts(excludeDialog).summary?.title : ""}</DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{t("Choose a reason")}</legend>
            {exclusionReasons.map((reason) => (
              <label key={reason.value} className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm hover:bg-muted/50 ${exclusionReason === reason.value ? "border-primary bg-primary/[0.04]" : ""}`}>
                <input type="radio" name="project-exclusion-reason" value={reason.value} checked={exclusionReason === reason.value} onChange={() => setExclusionReason(reason.value)} className="h-4 w-4 accent-primary" />{t(reason.label)}
              </label>
            ))}
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="project-exclusion-note">{t("Optional note")}</Label>
            <textarea id="project-exclusion-note" value={exclusionNote} onChange={(event) => setExclusionNote(event.target.value)} maxLength={2000} rows={3} className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcludeDialog(null)} disabled={updatePaper.isPending}>{t("Cancel")}</Button>
            <Button variant="destructive" onClick={() => void saveExclusion()} disabled={!exclusionReason || updatePaper.isPending}>{updatePaper.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("Saving…")}</> : t("Exclude paper")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(notesDialog)} onOpenChange={(open) => { if (!open && !updatePaper.isPending) setNotesDialog(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Project notes")}</DialogTitle><DialogDescription>{t("Notes are visible to project members.")}</DialogDescription></DialogHeader>
          <Label htmlFor="project-literature-note">{t("Notes")}</Label>
          <textarea id="project-literature-note" value={noteValue} onChange={(event) => setNoteValue(event.target.value)} maxLength={5000} rows={6} disabled={readOnly} className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotesDialog(null)} disabled={updatePaper.isPending}>{t("Cancel")}</Button>
            <Button onClick={() => void saveNotes()} disabled={readOnly || updatePaper.isPending}>{updatePaper.isPending ? t("Saving…") : t("Save notes")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(removeDialog)} onOpenChange={(open) => { if (!open && !removePaper.isPending) setRemoveDialog(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Remove paper from project?")}</DialogTitle><DialogDescription>{t("This only removes the paper from this project. The saved paper itself will not be deleted.")}</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveDialog(null)} disabled={removePaper.isPending}>{t("Cancel")}</Button>
            <Button variant="destructive" onClick={() => void saveRemove()} disabled={removePaper.isPending}>{removePaper.isPending ? t("Removing…") : t("Remove paper")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={criteriaOpen} onOpenChange={setCriteriaOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{t("Screening criteria")}</DialogTitle><DialogDescription>{t("Use the same criteria while reviewing every paper in this project.")}</DialogDescription></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="project-inclusion-criteria">{t("Inclusion")}</Label><textarea id="project-inclusion-criteria" value={inclusionText} onChange={(event) => setInclusionText(event.target.value)} disabled={!isOwner || readOnly} rows={7} placeholder={t("One criterion per line")} maxLength={5000} className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
            <div className="space-y-2"><Label htmlFor="project-exclusion-criteria">{t("Exclusion")}</Label><textarea id="project-exclusion-criteria" value={exclusionText} onChange={(event) => setExclusionText(event.target.value)} disabled={!isOwner || readOnly} rows={7} placeholder={t("One criterion per line")} maxLength={5000} className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
          </div>
          <p className="text-xs text-muted-foreground">{t("Up to 20 criteria per list, 240 characters each.")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCriteriaOpen(false)}>{t("Close")}</Button>
            {isOwner && !readOnly ? <Button onClick={() => void saveCriteria()} disabled={updateProject.isPending}>{updateProject.isPending ? t("Saving…") : t("Save criteria")}</Button> : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />{t("Cross-paper comparison")}</DialogTitle><DialogDescription>{t("AI-generated comparison of findings, methods, and outcomes.")}</DialogDescription></DialogHeader>
          {comparing ? <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("Comparing papers…")}</div> : compareError ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{t("Comparison could not be loaded. Try again.")}</div> : compareData ? <CompareTable comparison={compareData} /> : null}
          <DialogFooter><Button onClick={() => setCompareOpen(false)}>{t("Close")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={isMobile && Boolean(selectedLink)} onOpenChange={(open) => { if (!open) setSelectedPaperId(""); }}>
        <SheetContent className="max-w-full p-0 sm:max-w-full lg:hidden">
          <div className="border-b px-5 py-4 pr-12"><SheetTitle>{t("Paper details")}</SheetTitle><SheetDescription>{paperTitle}</SheetDescription></div>
          <div className="min-h-0 flex-1 overflow-y-auto">{detailPanel}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function PaperDetailPanel({
  link,
  summary,
  paper,
  isLoading,
  isError,
  isReadOnly,
  isSaving,
  language,
  t,
  onReadingStatus,
  onScreen,
  onExclude,
  onEditNotes,
  onViewEvidence,
}: {
  link: ProjectPaperLink;
  summary?: ProjectPaperSummary;
  paper?: Paper;
  isLoading: boolean;
  isError: boolean;
  isReadOnly: boolean;
  isSaving: boolean;
  language: string;
  t: (key: string, values?: Record<string, string | number>) => string;
  onReadingStatus: (status: ProjectReadingStatus) => void;
  onScreen: (status: ProjectScreeningStatus) => void;
  onExclude: () => void;
  onEditNotes: () => void;
  onViewEvidence: () => void;
}) {
  const title = paper?.title ?? summary?.title ?? t("Paper details unavailable");
  const authors = paper?.authors ?? summary?.authors ?? [];
  const abstract = paper?.abstractText ?? summary?.abstractText;
  const doi = paper?.externalIds?.doi ?? summary?.doi;
  const topics = [...(paper?.topics?.map((topic) => topic.topicName) ?? []), ...(paper?.keywords?.map((keyword) => keyword.keywordName) ?? [])];
  const reasonLabel = exclusionReasons.find((reason) => reason.value === link.exclusionReason)?.label ?? link.exclusionReason;
  const screenedDate = link.screenedAt ? new Date(link.screenedAt).toLocaleDateString(language) : "";
  const screeningLabel = link.screeningStatus === "INCLUDED" ? "Included" : link.screeningStatus === "EXCLUDED" ? "Excluded" : "To screen";

  return (
    <div className="flex h-full min-h-[500px] flex-col">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
        {isLoading ? <div className="space-y-3"><Skeleton className="h-7 w-4/5" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-24 w-full" /></div> : null}
        {isError ? <div role="status" className="flex items-start gap-2 rounded-md bg-destructive/5 px-3 py-2 text-xs text-muted-foreground"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />{t("Could not load the full paper record. Showing the project summary instead.")}</div> : null}
        <header>
          <div className="flex flex-wrap items-center gap-2"><Badge variant={link.screeningStatus === "INCLUDED" ? "default" : "secondary"}>{t(screeningLabel)}</Badge><Badge variant="outline">{t(link.readingStatus === "REVIEWED" ? "Reviewed" : link.readingStatus === "READING" ? "Reading" : "Not started")}</Badge></div>
          <h3 className="mt-3 text-lg font-semibold leading-6 tracking-tight">{title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{authorLine(authors) || t("Authors unavailable")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{[paper?.journalName ?? summary?.journalName, paper?.publicationYear ?? summary?.publicationYear].filter(Boolean).join(" · ") || t("Publication details unavailable")}</p>
          {doi ? <p className="mt-1 break-all text-xs text-muted-foreground">DOI: {doi}</p> : null}
          {link.screenedAt ? <p className="mt-2 text-xs text-muted-foreground">{t("Screened by {{name}} · {{date}}", { name: link.screenedBy?.fullName || t("a project member"), date: screenedDate })}</p> : null}
        </header>

        <section aria-labelledby="paper-abstract-title" className="space-y-2">
          <h4 id="paper-abstract-title" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Abstract")}</h4>
          <p className="whitespace-pre-line text-sm leading-6 text-foreground/90">{abstract || t("No abstract is available for this paper.")}</p>
        </section>

        {topics.length ? <section aria-labelledby="paper-topics-title" className="space-y-2"><h4 id="paper-topics-title" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Topics")}</h4><div className="flex flex-wrap gap-1.5">{topics.slice(0, 8).map((topic, index) => <Badge key={`${topic}-${index}`} variant="secondary" className="font-normal">{topic}</Badge>)}</div></section> : null}

        <section className="grid gap-3 border-y py-3 sm:grid-cols-2">
          <div><p className="text-xs font-medium text-muted-foreground">{t("Evidence records")}</p><p className="mt-1 text-sm font-medium">{t("{{count}} linked to research gaps", { count: link.evidenceCount })}</p>{link.evidenceCount > 0 ? <Button type="button" size="sm" variant="outline" className="mt-2" onClick={onViewEvidence}>{t("View evidence")}</Button> : null}</div>
          <div><p className="text-xs font-medium text-muted-foreground">{t("AI analysis")}</p><p className="mt-1 text-sm font-medium">{paper?.aiAnalysis ? t("Available") : t("Not available in this workspace")}</p>{paper?.aiAnalysis?.summary ? <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">{paper.aiAnalysis.summary}</p> : null}</div>
        </section>

        {link.screeningStatus === "EXCLUDED" && reasonLabel ? <section className="space-y-1"><h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Exclusion reason")}</h4><p className="text-sm">{t(reasonLabel)}{link.exclusionNote ? ` · ${link.exclusionNote}` : ""}</p></section> : null}

        <section className="space-y-2">
          <div className="flex items-center justify-between"><h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Project notes")}</h4><Button type="button" variant="ghost" size="sm" onClick={onEditNotes} disabled={isReadOnly}>{t(link.notes ? "Edit note" : "Add note")}</Button></div>
          {link.notes ? <p className="whitespace-pre-line text-sm leading-5">{link.notes}</p> : <p className="text-sm text-muted-foreground">{t("No notes yet.")}</p>}
        </section>

        <div className="pb-3"><Button asChild type="button" size="sm" variant="outline"><Link to={`/papers/${paper?.id ?? summary?._id ?? (typeof link.targetId === "string" ? link.targetId : "")}`}><FileText className="mr-2 h-3.5 w-3.5" />{t("Open full paper")}</Link></Button></div>
      </div>

      <footer className="sticky bottom-0 space-y-3 border-t bg-card px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-muted-foreground">{t("Screening decision")}</span>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            {t("Reading status")}
            <select aria-label={t("Reading status")} disabled={isReadOnly || isSaving} value={link.readingStatus} onChange={(event) => onReadingStatus(event.target.value as ProjectReadingStatus)} className="h-8 rounded-md border bg-background px-2 font-medium text-foreground">
              <option value="NOT_STARTED">{t("Not started")}</option><option value="READING">{t("Reading")}</option><option value="REVIEWED">{t("Reviewed")}</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Button type="button" size="sm" variant={link.screeningStatus === "INCLUDED" ? "default" : "outline"} onClick={() => onScreen("INCLUDED")} disabled={isReadOnly || isSaving}><Check className="mr-1.5 h-3.5 w-3.5" />{t("Include")}</Button>
          <Button type="button" size="sm" variant={link.screeningStatus === "UNDECIDED" ? "secondary" : "outline"} onClick={() => onScreen("UNDECIDED")} disabled={isReadOnly || isSaving}><CircleHelp className="mr-1.5 h-3.5 w-3.5" />{t("Not sure")}</Button>
          <Button type="button" size="sm" variant={link.screeningStatus === "EXCLUDED" ? "destructive" : "outline"} onClick={onExclude} disabled={isReadOnly || isSaving}><X className="mr-1.5 h-3.5 w-3.5" />{t("Exclude")}</Button>
        </div>
      </footer>
    </div>
  );
}
