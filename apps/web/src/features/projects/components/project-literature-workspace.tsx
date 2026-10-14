import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertCircle, BookOpen, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, FileText, Loader2, Search, SlidersHorizontal, Sparkles, Trash2, X, XCircle } from "lucide-react";
import type { IProject, Paper, ProjectExclusionReason, ProjectPaperSummary, ProjectReadingStatus, ProjectScreeningStatus } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { usePaper } from "@/features/papers/hooks/use-papers";
import { useComparePapers } from "@/features/compare/hooks/use-compare";
import { CompareTable } from "@/features/compare/components/compare-table";
import { useRemovePaperFromProject, useUpdateProject, useUpdateProjectPaper } from "@/features/projects/hooks/use-projects";
import { useI18n } from "@/i18n";
import { ProjectLiteratureEmpty } from "./project-literature-empty";
import type { PaperPickerSource } from "./project-paper-picker-dialog";

type ProjectPaperLink = IProject["papers"][number];
type LiteratureFilter = ProjectScreeningStatus | "ALL";

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

function authorLine(authors?: Array<{ displayName?: string }>) {
  const names = authors?.map((author) => author.displayName).filter(Boolean) ?? [];
  if (names.length > 3) return `${names.slice(0, 3).join(", ")} et al.`;
  return names.join(", ");
}

export function ProjectLiteratureWorkspace({
  projectId,
  papers,
  criteria,
  screeningMode = "EXPLORATORY",
  isOwner,
  readOnly,
  onRequestAddPaper,
  onNavigateToReports,
  onNavigateToGaps,
  onViewEvidence,
}: {
  projectId: string;
  papers: IProject["papers"];
  criteria?: IProject["screeningCriteria"];
  screeningMode?: IProject["screeningMode"];
  isOwner: boolean;
  readOnly: boolean;
  onRequestAddPaper: (source?: PaperPickerSource) => void;
  onNavigateToReports: () => void;
  onNavigateToGaps: () => void;
  onViewEvidence: () => void;
}) {
  const { t, language } = useI18n();
  const paperTrigger = useRef<HTMLButtonElement | null>(null);
  const paperSearch = useRef<HTMLInputElement>(null);
  const reader = useRef<HTMLDivElement>(null);
  const updatePaper = useUpdateProjectPaper(projectId);
  const updateProject = useUpdateProject(projectId);
  const removePaper = useRemovePaperFromProject(projectId);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedFilter = searchParams.get("screening");
  const filter: LiteratureFilter = ["ALL", "UNDECIDED", "INCLUDED", "EXCLUDED", "MAYBE"].includes(requestedFilter ?? "") ? requestedFilter as LiteratureFilter : "ALL";
  const setFilter = (next: LiteratureFilter) => {
    const params = new URLSearchParams(searchParams);
    params.set("screening", next);
    setSearchParams(params, { replace: true });
  };
  const [query, setQuery] = useState("");
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
    if (selectedPaperId && !papers.some(link => paperParts(link).id === selectedPaperId)) setSelectedPaperId("");
  }, [papers, selectedPaperId]);

  useEffect(() => {
    if (criteriaOpen) {
      setInclusionText(inclusionLines);
      setExclusionText(exclusionLines);
    }
  }, [criteriaOpen, inclusionLines, exclusionLines]);

  const counts = useMemo(() => ({
    all: papers.length,
    included: papers.filter((paper) => paper.screeningStatus === "INCLUDED").length,
    excluded: papers.filter((paper) => paper.screeningStatus === "EXCLUDED").length,
  }), [papers]);
  const screenedCount = counts.included + counts.excluded;
  const filteredPapers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const selected = papers.filter((link) => {
      const { summary } = paperParts(link);
      if (filter !== "ALL" && link.screeningStatus !== filter) return false;
      if (!normalized) return true;
      return [summary?.title, summary?.journalName, summary?.publicationYear, authorLine(summary?.authors)]
        .some((value) => String(value ?? "").toLocaleLowerCase().includes(normalized));
    });
    return selected.sort((left, right) => new Date(right.addedAt).getTime() - new Date(left.addedAt).getTime());
  }, [papers, filter, query]);
  // A decision can remove a paper from the current filter without closing its reader.
  const selectedLink = papers.find((link) => paperParts(link).id === selectedPaperId);
  const selectedParts = selectedLink ? paperParts(selectedLink) : undefined;
  const paperQuery = usePaper(selectedParts?.id);
  const selectedPaper = paperQuery.data;

  const persistStatus = async (link: ProjectPaperLink, status: ProjectScreeningStatus) => {
    if (readOnly || screeningMode === "INDEPENDENT" || updatePaper.isPending) return;
    const { id } = paperParts(link);
    try {
      await updatePaper.mutateAsync({ paperId: id, data: { screeningStatus: status, expectedUpdatedAt: link.updatedAt } });
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
    if (readOnly || !excludeDialog || !exclusionReason || updatePaper.isPending) return;
    try {
      await updatePaper.mutateAsync({
        paperId: paperParts(excludeDialog).id,
        data: { screeningStatus: "EXCLUDED", exclusionReason, exclusionNote: exclusionNote.trim() || null, expectedUpdatedAt: excludeDialog.updatedAt },
      });
      toast.success(t("Screening decision saved."));
      setExcludeDialog(null);
    } catch {
      toast.error(t("Could not save the screening decision."));
    }
  };

  const saveNotes = async () => {
    if (readOnly || !notesDialog || updatePaper.isPending) return;
    try {
      await updatePaper.mutateAsync({ paperId: paperParts(notesDialog).id, data: { notes: noteValue.trim() || null, expectedUpdatedAt: notesDialog.updatedAt } });
      toast.success(t("Notes saved."));
      setNotesDialog(null);
    } catch {
      toast.error(t("Could not save notes."));
    }
  };

  const changeReadingStatus = async (link: ProjectPaperLink, status: ProjectReadingStatus) => {
    if (readOnly || updatePaper.isPending) return;
    try {
      await updatePaper.mutateAsync({ paperId: paperParts(link).id, data: { readingStatus: status, expectedUpdatedAt: link.updatedAt } });
      toast.success(t("Reading status saved."));
    } catch {
      toast.error(t("Could not save the reading status."));
    }
  };

  const saveCriteria = async () => {
    if (!isOwner || readOnly || updateProject.isPending) return;
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
    if (readOnly || !removeDialog || removePaper.isPending) return;
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
  };

  const detailPanel = selectedLink && selectedParts ? (
    <PaperDetailPanel
      link={selectedLink}
      summary={selectedParts.summary}
      paper={selectedPaper}
      isLoading={paperQuery.isLoading}
      isError={paperQuery.isError}
      isReadOnly={readOnly}
      independentScreening={screeningMode === "INDEPENDENT"}
      onOpenScreening={() => { setSelectedPaperId(""); const params = new URLSearchParams(searchParams); params.set("view", "screening"); params.set("source", selectedParts.id); setSearchParams(params); }}
      isSaving={updatePaper.isPending}
      language={language}
      t={t}
      onReadingStatus={(status) => void changeReadingStatus(selectedLink, status)}
      onScreen={(status) => void persistStatus(selectedLink, status)}
      onExclude={() => startExclusion(selectedLink)}
      onEditNotes={() => { setNoteValue(selectedLink.notes ?? ""); setNotesDialog(selectedLink); }}
      onViewEvidence={onViewEvidence}
    />
  ) : null;

  const screeningSummary = <section className="project-screening-summary bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-card dark:from-blue-950/30 dark:via-indigo-950/20 border border-blue-200/70 dark:border-blue-900/40 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4" aria-labelledby="project-screening-title">
    <div>
      <h3 id="project-screening-title" className="text-lg font-bold text-foreground flex items-center gap-2.5">
        <SlidersHorizontal className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
        {t("Screening criteria")}
      </h3>
      <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
        {criteria?.inclusion.length || criteria?.exclusion.length ? t("{{inclusion}} inclusion · {{exclusion}} exclusion criteria", { inclusion: criteria?.inclusion.length ?? 0, exclusion: criteria?.exclusion.length ?? 0 }) : t("No screening criteria yet.")}
      </p>
      {papers.length === 0 && isOwner && !readOnly ? <p className="project-criteria-help text-sm text-muted-foreground mt-1.5">{t("Define which papers to include or exclude. You can update the criteria later.")}</p> : null}
    </div>
    <Button type="button" variant="outline" size="sm" className="rounded-xl border-border/80 bg-background hover:bg-accent font-semibold text-sm px-4 py-2 shrink-0 shadow-xs" onClick={() => setCriteriaOpen(true)}>
      {t(isOwner && !readOnly ? "Set screening criteria" : "View criteria")}
    </Button>
  </section>;

  return (
    <div className="project-literature-workspace space-y-5" data-empty={papers.length === 0}>
      {papers.length > 0 ? (
        <header className="project-content-heading flex flex-col gap-3.5 sm:flex-row sm:items-start sm:justify-between pb-2">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-3xl font-extrabold tracking-tight text-foreground">{t("Literature")}</h2>
              <span className="px-3 py-1 rounded-full text-sm font-bold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                {t("{{count}} paper", { count: counts.all })}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2.5 flex-wrap text-sm font-semibold">
              <span className="px-3 py-1 rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200/70 shadow-xs">
                {t("To screen")}: <strong className="font-bold">{counts.all - screenedCount}</strong>
              </span>
              <span className="px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200/70 shadow-xs">
                {t("Included")}: <strong className="font-bold">{counts.included}</strong>
              </span>
              <span className="px-3 py-1 rounded-lg bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200/70 shadow-xs">
                {t("Excluded")}: <strong className="font-bold">{counts.excluded}</strong>
              </span>
            </div>
          </div>
          {!readOnly ? (
            <Button size="default" onClick={() => onRequestAddPaper()} className="project-primary-action h-10 px-5 text-sm font-semibold shadow-sm">
              <span className="mr-1.5 text-base leading-none font-bold">+</span>{t("Add papers")}
            </Button>
          ) : null}
        </header>
      ) : null}

      {papers.length === 0 ? (
        <ProjectLiteratureEmpty readOnly={readOnly} onAdd={onRequestAddPaper} screening={screeningSummary} />
      ) : (
        <>
          <div className="project-literature-toolbar" role="search" aria-label={t("Search project literature")}>
            <div className="project-literature-search">
              <Search aria-hidden="true" />
              <Input ref={paperSearch} value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t("Search title, author, year, or venue")} placeholder={t("Search title, author, year, or venue")} />
              {query ? <button type="button" aria-label={t("Clear search")} onClick={() => { setQuery(""); paperSearch.current?.focus(); }}><X aria-hidden="true" /></button> : null}
            </div>
            <select aria-label={t("Screening status")} value={filter} onChange={(event) => setFilter(event.target.value as LiteratureFilter)} className="project-literature-status">
              <option value="ALL">{t("All papers")}</option>
              <option value="UNDECIDED">{t("To screen")}</option>
              <option value="MAYBE">{t("Maybe")}</option>
              <option value="INCLUDED">{t("Included")}</option>
              <option value="EXCLUDED">{t("Excluded")}</option>
            </select>
          </div>

          {selectedBulkIds.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/50 px-3 py-2">
              <span className="text-xs font-medium">{t("{{count}} selected", { count: selectedBulkIds.length })}</span>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={selectedBulkIds.length < 2 || selectedBulkIds.length > 4} onClick={beginCompare}><Sparkles className="mr-1.5 h-3.5 w-3.5" />{t("Compare selected")}</Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedBulkIds([])}>{t("Clear selection")}</Button>
              </div>
            </div>
          ) : null}

            <section aria-label={t("Project literature list")} className="project-paper-list">
                {filteredPapers.length === 0 ? (
                  <div className="px-5 py-12 text-center">
                    <p className="text-sm font-medium">{t("No papers match these filters")}</p>
                    <button type="button" className="mt-2 text-xs text-primary underline-offset-4 hover:underline" onClick={clearFilters}>{t("Clear filters")}</button>
                  </div>
                ) : filteredPapers.map((link) => {
                  const { id, summary } = paperParts(link);
                  const title = summary?.title ?? t("Paper details unavailable");
                  const screeningLabel = link.screeningStatus === "INCLUDED" ? "Included" : link.screeningStatus === "EXCLUDED" ? "Excluded" : link.screeningStatus === "MAYBE" ? "Maybe" : "To screen";
                  const statusClass = link.screeningStatus === "INCLUDED" ? "text-emerald-700 dark:text-emerald-300" : link.screeningStatus === "EXCLUDED" ? "text-rose-700 dark:text-rose-300" : link.screeningStatus === "MAYBE" ? "text-blue-700 dark:text-blue-300" : "text-amber-700 dark:text-amber-300";
                  return (
                    <div key={id} className="project-paper-row" data-selected={selectedBulkIds.includes(id)}>
                      <label className="project-paper-checkbox">
                        <input aria-label={t("Select {{title}} for bulk actions", { title })} type="checkbox" checked={selectedBulkIds.includes(id)} onChange={() => toggleBulk(id)} disabled={readOnly} />
                      </label>
                      <button type="button" onClick={event => { paperTrigger.current = event.currentTarget; setSelectedPaperId(id); }} aria-haspopup="dialog" aria-label={t("Read {{title}}", { title })} className="project-paper-open">
                        <span className="project-paper-copy">
                          <strong>{title}</strong>
                          <span className="project-paper-meta"><span>{authorLine(summary?.authors) || t("Authors unavailable")}</span><span>{summary?.journalName || t("Venue not listed")}</span><span>{summary?.publicationYear || t("Year not listed")}</span></span>
                        </span>
                        <span className={`project-paper-status ${statusClass}`}>
                          {link.screeningStatus === "INCLUDED" ? <CheckCircle2 /> : link.screeningStatus === "EXCLUDED" ? <XCircle /> : <CircleHelp />}{t(screeningLabel)}
                        </span>
                        <span className="project-paper-counts">{link.evidenceCount > 0 ? <span>{t("Evidence {{count}}", { count: link.evidenceCount })}</span> : null}{link.notes?.trim() ? <span>{t("Notes {{count}}", { count: 1 })}</span> : null}</span>
                        <span className="project-paper-read">{t("Read paper")}<ChevronRight aria-hidden="true" /></span>
                      </button>
                      <Button type="button" variant="ghost" size="icon" className="project-paper-remove" aria-label={t("Remove {{title}} from project", { title })} onClick={() => setRemoveDialog(link)} disabled={readOnly}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
            </section>
        </>
      )}

      <Dialog open={Boolean(excludeDialog)} onOpenChange={(open) => { if (!open && !updatePaper.isPending) setExcludeDialog(null); }}>
        <DialogContent className="sm:max-w-lg" onCloseAutoFocus={event => { event.preventDefault(); reader.current?.querySelector<HTMLElement>('[data-reader-action="exclude"]')?.focus({ preventScroll: true }); }}>
          <DialogHeader>
            <DialogTitle>{t("Why are you excluding this paper?")}</DialogTitle>
            <DialogDescription className="line-clamp-2">{excludeDialog ? paperParts(excludeDialog).summary?.title : ""}</DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-2" disabled={readOnly || updatePaper.isPending}>
            <legend className="mb-2 text-sm font-medium">{t("Choose a reason")}</legend>
            {exclusionReasons.map((reason) => (
              <label key={reason.value} className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm hover:bg-muted/50 ${exclusionReason === reason.value ? "border-primary bg-primary/[0.04]" : ""}`}>
                <input type="radio" name="project-exclusion-reason" value={reason.value} checked={exclusionReason === reason.value} onChange={() => setExclusionReason(reason.value)} className="h-4 w-4 accent-primary" />{t(reason.label)}
              </label>
            ))}
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="project-exclusion-note">{t("Optional note")}</Label>
            <textarea id="project-exclusion-note" disabled={readOnly || updatePaper.isPending} value={exclusionNote} onChange={(event) => setExclusionNote(event.target.value)} maxLength={2000} rows={3} className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcludeDialog(null)} disabled={updatePaper.isPending}>{t("Cancel")}</Button>
            <Button variant="destructive" onClick={() => void saveExclusion()} disabled={!exclusionReason || updatePaper.isPending}>{updatePaper.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("Saving…")}</> : t("Exclude paper")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(notesDialog)} onOpenChange={(open) => { if (!open && !updatePaper.isPending) setNotesDialog(null); }}>
        <DialogContent onCloseAutoFocus={event => { event.preventDefault(); reader.current?.querySelector<HTMLElement>('[data-reader-action="notes"]')?.focus({ preventScroll: true }); }}>
          <DialogHeader><DialogTitle>{t("Project notes")}</DialogTitle><DialogDescription>{t("Notes are visible to project members.")}</DialogDescription></DialogHeader>
          <Label htmlFor="project-literature-note">{t("Notes")}</Label>
          <textarea id="project-literature-note" value={noteValue} onChange={(event) => setNoteValue(event.target.value)} maxLength={5000} rows={6} disabled={readOnly || updatePaper.isPending} className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
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

      {papers.length > 0 ? screeningSummary : null}
      {papers.length > 0 && !readOnly ? (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 pb-1 px-1">
          <span className="text-xs text-muted-foreground">{t("Research outputs use the project's included papers.")}</span>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button type="button" variant="outline" size="sm" className="rounded-xl border-border/80 shadow-xs hover:border-primary/40 font-medium" disabled={counts.included === 0} onClick={onNavigateToReports}>
              <FileText className="mr-1.5 h-3.5 w-3.5 text-primary" />
              {t("Create artifact")}
            </Button>
            <Button type="button" variant="outline" size="sm" className="rounded-xl border-border/80 shadow-xs hover:border-primary/40 font-medium" disabled={counts.included === 0} onClick={onNavigateToGaps}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5 text-amber-500" />
              {t("Research gaps")}
            </Button>
          </div>
        </div>
      ) : null}
      <Dialog open={criteriaOpen} onOpenChange={next => { if (!updateProject.isPending) setCriteriaOpen(next); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>{t("Screening criteria")}</DialogTitle><DialogDescription>{t("Use the same criteria while reviewing every paper in this project.")}</DialogDescription></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="project-inclusion-criteria">{t("Inclusion")}</Label><textarea id="project-inclusion-criteria" value={inclusionText} onChange={(event) => setInclusionText(event.target.value)} disabled={!isOwner || readOnly || updateProject.isPending} rows={7} placeholder={t("One criterion per line")} maxLength={5000} className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
            <div className="space-y-2"><Label htmlFor="project-exclusion-criteria">{t("Exclusion")}</Label><textarea id="project-exclusion-criteria" value={exclusionText} onChange={(event) => setExclusionText(event.target.value)} disabled={!isOwner || readOnly || updateProject.isPending} rows={7} placeholder={t("One criterion per line")} maxLength={5000} className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div>
          </div>
          <p className="text-xs text-muted-foreground">{t("Up to 20 criteria per list, 240 characters each.")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCriteriaOpen(false)} disabled={updateProject.isPending}>{t("Close")}</Button>
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

      <Dialog open={Boolean(selectedLink)} onOpenChange={open => { if (!open && !notesDialog && !excludeDialog) setSelectedPaperId(""); }}>
        <DialogContent ref={reader} className="project-paper-dialog" overlayClassName="project-paper-reader-overlay" showClose={false} aria-describedby={undefined}
          onOpenAutoFocus={event => { event.preventDefault(); reader.current?.focus({ preventScroll: true }); }}
          onCloseAutoFocus={event => { event.preventDefault(); (paperTrigger.current?.isConnected ? paperTrigger.current : paperSearch.current)?.focus({ preventScroll: true }); }}>
          <div className="project-paper-dialog-header"><span><BookOpen aria-hidden="true" />{t("Paper details")}</span><DialogClose asChild><button type="button" aria-label={t("Close")}><X aria-hidden="true" /></button></DialogClose></div>
          {detailPanel}
        </DialogContent>
      </Dialog>
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
  independentScreening,
  onOpenScreening,
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
  independentScreening: boolean;
  onOpenScreening: () => void;
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
  const screeningLabel = link.screeningStatus === "INCLUDED" ? "Included" : link.screeningStatus === "EXCLUDED" ? "Excluded" : link.screeningStatus === "MAYBE" ? "Maybe" : "To screen";

  return (
    <div className="project-paper-reader">
      <div className="project-paper-reader-body">
        {isLoading ? <div className="space-y-3"><Skeleton className="h-7 w-4/5" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-24 w-full" /></div> : null}
        {isError ? <div role="status" className="flex items-start gap-2 rounded-md bg-destructive/5 px-3 py-2 text-xs text-muted-foreground"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />{t("Could not load the full paper record. Showing the project summary instead.")}</div> : null}
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-all ${
              link.screeningStatus === "INCLUDED"
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                : link.screeningStatus === "EXCLUDED"
                  ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30"
                  : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
            }`}>
              {link.screeningStatus === "INCLUDED" ? <Check className="h-3.5 w-3.5" /> : link.screeningStatus === "EXCLUDED" ? <X className="h-3.5 w-3.5" /> : <CircleHelp className="h-3.5 w-3.5" />}
              {t(screeningLabel)}
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-muted/60 text-muted-foreground border border-border">
              <BookOpen className="h-3.5 w-3.5" />
              {t(link.readingStatus === "REVIEWED" ? "Reviewed" : link.readingStatus === "READING" ? "Reading" : "Not started")}
            </span>
          </div>
          <DialogTitle className="project-paper-reader-title">{title}</DialogTitle>
          <p className="mt-2 text-sm text-muted-foreground">{authorLine(authors) || t("Authors unavailable")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{[paper?.journalName ?? summary?.journalName, paper?.publicationYear ?? summary?.publicationYear].filter(Boolean).join(" · ") || t("Publication details unavailable")}</p>
          {doi ? <p className="mt-1 break-all text-xs text-muted-foreground">DOI: {doi}</p> : null}
          {link.screenedAt ? <p className="mt-2 text-xs text-muted-foreground">{t("Screened by {{name}} · {{date}}", { name: link.screenedBy?.fullName || t("a project member"), date: screenedDate })}</p> : null}
        </header>

        <section aria-labelledby="paper-abstract-title" className="space-y-2">
          <h4 id="paper-abstract-title" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Abstract")}</h4>
          <p className="project-paper-abstract">{abstract || t("No abstract is available for this paper.")}</p>
        </section>

        {topics.length ? <section aria-labelledby="paper-topics-title" className="space-y-2"><h4 id="paper-topics-title" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Topics")}</h4><div className="flex flex-wrap gap-1.5">{topics.slice(0, 8).map((topic, index) => <Badge key={`${topic}-${index}`} variant="secondary" className="font-normal">{topic}</Badge>)}</div></section> : null}

        <section className="grid gap-3 border-y py-3 sm:grid-cols-2">
          <div><p className="text-xs font-medium text-muted-foreground">{t("Evidence records")}</p><p className="mt-1 text-sm font-medium">{t("{{count}} linked to research gaps", { count: link.evidenceCount })}</p>{link.evidenceCount > 0 ? <Button type="button" size="sm" variant="outline" className="mt-2" onClick={onViewEvidence}>{t("View evidence")}</Button> : null}</div>
          <div><p className="text-xs font-medium text-muted-foreground">{t("AI analysis")}</p><p className="mt-1 text-sm font-medium">{paper?.aiAnalysis ? t("Available") : t("Not available in this workspace")}</p>{paper?.aiAnalysis?.summary ? <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">{paper.aiAnalysis.summary}</p> : null}</div>
        </section>

        {link.screeningStatus === "EXCLUDED" && reasonLabel ? <section className="space-y-1"><h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Exclusion reason")}</h4><p className="text-sm">{t(reasonLabel)}{link.exclusionNote ? ` · ${link.exclusionNote}` : ""}</p></section> : null}

        <section className="space-y-2">
          <div className="flex items-center justify-between"><h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Project notes")}</h4><Button type="button" variant="ghost" size="sm" data-reader-action="notes" onClick={onEditNotes} disabled={isReadOnly}>{t(link.notes ? "Edit note" : "Add note")}</Button></div>
          {link.notes ? <p className="whitespace-pre-line text-sm leading-5">{link.notes}</p> : <p className="text-sm text-muted-foreground">{t("No notes yet.")}</p>}
        </section>

        <div className="pb-3"><Button asChild type="button" size="sm" variant="outline"><Link to={`/papers/${paper?.id ?? summary?._id ?? (typeof link.targetId === "string" ? link.targetId : "")}`}><FileText className="mr-2 h-3.5 w-3.5" />{t("Open full paper")}</Link></Button></div>
      </div>

      <footer className="project-paper-reader-footer space-y-3.5 border-t border-border/60 bg-muted/20 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-border/40">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("Screening decision")}</span>
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
              link.screeningStatus === "INCLUDED"
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                : link.screeningStatus === "EXCLUDED"
                  ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
                  : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30"
            }`}>
              {link.screeningStatus === "INCLUDED" ? <Check className="h-3 w-3" /> : link.screeningStatus === "EXCLUDED" ? <X className="h-3 w-3" /> : <CircleHelp className="h-3 w-3" />}
              {t(screeningLabel)}
            </span>
          </div>

          <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{t("Reading status")}</span>
            <div className="relative">
              <select
                aria-label={t("Reading status")}
                disabled={isReadOnly || isSaving}
                value={link.readingStatus}
                onChange={(event) => onReadingStatus(event.target.value as ProjectReadingStatus)}
                className="h-8.5 rounded-xl border border-border/80 bg-background/90 pl-2.5 pr-7 text-xs font-semibold text-foreground shadow-2xs appearance-none transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer disabled:opacity-50"
              >
                <option value="NOT_STARTED">{t("Not started")}</option>
                <option value="READING">{t("Reading")}</option>
                <option value="REVIEWED">{t("Reviewed")}</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
            </div>
          </label>
        </div>

        {independentScreening ? <Button type="button" variant="outline" onClick={onOpenScreening}>{t("Independent reviewers")} · {t("Screening")}</Button> : <div className="grid grid-cols-3 gap-2.5">
          <Button
            type="button"
            size="sm"
            variant={link.screeningStatus === "INCLUDED" ? "default" : "outline"}
            onClick={() => onScreen("INCLUDED")}
            disabled={isReadOnly || isSaving}
            className={`h-10 rounded-xl text-xs font-bold transition-all shadow-xs ${
              link.screeningStatus === "INCLUDED"
                ? "bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-500/25 hover:bg-emerald-700 hover:text-white ring-2 ring-emerald-500/20"
                : "border-border/80 bg-background hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 dark:hover:bg-emerald-950/30 text-foreground"
            }`}
          >
            <Check className="mr-1.5 h-3.5 w-3.5" />{t("Include")}
          </Button>

          <Button
            type="button"
            size="sm"
            variant={link.screeningStatus === "MAYBE" ? "secondary" : "outline"}
            onClick={() => onScreen("MAYBE")}
            disabled={isReadOnly || isSaving}
            className={`h-10 rounded-xl text-xs font-bold transition-all shadow-xs ${
              link.screeningStatus === "MAYBE"
                ? "bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/25 hover:bg-amber-600 hover:text-white ring-2 ring-amber-500/20"
                : "border-border/80 bg-background hover:bg-amber-50 hover:text-amber-700 hover:border-amber-300 dark:hover:bg-amber-950/30 text-foreground"
            }`}
          >
            <CircleHelp className="mr-1.5 h-3.5 w-3.5" />{t("Not sure")}
          </Button>

          <Button
            type="button"
            size="sm"
            variant={link.screeningStatus === "EXCLUDED" ? "destructive" : "outline"}
            data-reader-action="exclude"
            onClick={onExclude}
            disabled={isReadOnly || isSaving}
            className={`h-10 rounded-xl text-xs font-bold transition-all shadow-xs ${
              link.screeningStatus === "EXCLUDED"
                ? "bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-500/25 hover:bg-rose-700 hover:text-white ring-2 ring-rose-500/20"
                : "border-border/80 bg-background hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 dark:hover:bg-rose-950/30 text-foreground"
            }`}
          >
            <X className="mr-1.5 h-3.5 w-3.5" />{t("Exclude")}
          </Button>
        </div>}
      </footer>
    </div>
  );
}
