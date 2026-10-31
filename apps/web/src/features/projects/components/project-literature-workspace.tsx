import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  HelpCircle,
  Link2,
  Loader2,
  Maximize2,
  PanelRight,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  StickyNote,
  Tag,
  Trash2,
  User,
  Users,
  X,
  XCircle,
} from "lucide-react";
import type { IProject, Paper, ProjectExclusionReason, ProjectPaperSummary, ProjectReadingStatus, ProjectScreeningStatus } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { usePaper } from "@/features/papers/hooks/use-papers";
import { useComparePapers } from "@/features/compare/hooks/use-compare";
import { CompareTable } from "@/features/compare/components/compare-table";
import { useRemovePaperFromProject, useUpdateProjectPaper } from "@/features/projects/hooks/use-projects";
import { useI18n } from "@/i18n";
import { ProjectLiteratureEmpty } from "./project-literature-empty";
import { ProjectPaperAnalysis } from "./project-paper-analysis";
import type { PaperPickerSource } from "./project-paper-picker-dialog";
import "../project-literature.css";
import "../research-synthesis.css";

type ProjectPaperLink = IProject["papers"][number];
type LiteratureFilter = ProjectScreeningStatus | "ALL";
const reviewGroups = [{ value: "ALL", label: "All papers" }, { value: "UNDECIDED", label: "Not reviewed" }, { value: "MAYBE", label: "Considering" }, { value: "INCLUDED", label: "Relevant" }, { value: "EXCLUDED", label: "Not relevant" }] as const;
const relevanceLabels = { UNDECIDED: "Not reviewed", MAYBE: "Considering", INCLUDED: "Relevant", EXCLUDED: "Not relevant" } as const;

const statusIcons = {
  UNDECIDED: CircleHelp,
  MAYBE: HelpCircle,
  INCLUDED: CheckCircle2,
  EXCLUDED: XCircle,
} as const;

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
function matchesPaper(link: ProjectPaperLink, id: string) {
  return paperParts(link).id === id || (typeof link.targetId !== "string" && "id" in link.targetId && link.targetId.id === id);
}

function authorLine(authors?: Array<{ displayName?: string }>) {
  const names = authors?.map((author) => author.displayName).filter(Boolean) ?? [];
  if (names.length > 3) return `${names.slice(0, 3).join(", ")} et al.`;
  return names.join(", ");
}

export function ProjectLiteratureWorkspace({
  projectId,
  papers,

  readOnly,
  onRequestAddPaper,
  onViewEvidence,
}: {
  projectId: string;
  papers: IProject["papers"];
  screeningMode?: IProject["screeningMode"];
  readOnly: boolean;
  onRequestAddPaper: (source?: PaperPickerSource) => void;
  onViewEvidence: () => void;
}) {
  const { t, language } = useI18n();
  const paperTrigger = useRef<HTMLButtonElement | null>(null);
  const paperSearch = useRef<HTMLInputElement>(null);
  const reader = useRef<HTMLDivElement>(null);
  const updatePaper = useUpdateProjectPaper(projectId);
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
  const [addedByFilter, setAddedByFilter] = useState("");
  const sourceParam = searchParams.get("source") ?? "";
  const [selectedPaperId, setSelectedPaperId] = useState(sourceParam);
  const [selectedBulkIds, setSelectedBulkIds] = useState<string[]>([]);
  const [notesDialog, setNotesDialog] = useState<ProjectPaperLink | null>(null);
  const [noteValue, setNoteValue] = useState("");
  const [removeDialog, setRemoveDialog] = useState<ProjectPaperLink | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const { data: compareData, isLoading: comparing, isError: compareError } = useComparePapers(compareOpen ? compareIds : []);

  useEffect(() => {
    setSelectedBulkIds((current) => current.filter((id) => papers.some((link) => paperParts(link).id === id)));
  }, [papers]);

  useEffect(() => {
    if (selectedPaperId && selectedPaperId !== sourceParam && !papers.some(link => matchesPaper(link, selectedPaperId))) setSelectedPaperId("");
  }, [papers, selectedPaperId, sourceParam]);
  useEffect(() => { setSelectedPaperId(sourceParam); }, [sourceParam]);
  const closeReader = () => {
    setSelectedPaperId("");
    if (sourceParam) { const params = new URLSearchParams(searchParams); params.delete("source"); setSearchParams(params, { replace: true }); }
  };

  const counts = useMemo(() => ({
    ALL: papers.length,
    UNDECIDED: papers.filter(paper => paper.screeningStatus === "UNDECIDED").length,
    MAYBE: papers.filter(paper => paper.screeningStatus === "MAYBE").length,
    INCLUDED: papers.filter(paper => paper.screeningStatus === "INCLUDED").length,
    EXCLUDED: papers.filter(paper => paper.screeningStatus === "EXCLUDED").length,
  }), [papers]);
  const contributors = useMemo(() => [...new Map(papers.flatMap(link => link.addedBy ? [[link.addedBy._id, link.addedBy] as const] : [])).values()], [papers]);
  const [sortBy, setSortBy] = useState<"newest" | "year-desc" | "year-asc" | "title">("newest");
  const filteredPapers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const selected = papers.filter((link) => {
      const { summary } = paperParts(link);
      if (filter !== "ALL" && link.screeningStatus !== filter) return false;
      if (addedByFilter && link.addedBy?._id !== addedByFilter) return false;
      if (!normalized) return true;
      return [summary?.title, summary?.doi, summary?.journalName, summary?.publicationYear, authorLine(summary?.authors), link.addedBy?.fullName]
        .some((value) => String(value ?? "").toLocaleLowerCase().includes(normalized));
    });
    return selected.sort((left, right) => {
      const leftSummary = paperParts(left).summary;
      const rightSummary = paperParts(right).summary;
      if (sortBy === "year-desc") {
        return (Number(rightSummary?.publicationYear) || 0) - (Number(leftSummary?.publicationYear) || 0);
      }
      if (sortBy === "year-asc") {
        return (Number(leftSummary?.publicationYear) || 0) - (Number(rightSummary?.publicationYear) || 0);
      }
      if (sortBy === "title") {
        return String(leftSummary?.title ?? "").localeCompare(String(rightSummary?.title ?? ""));
      }
      return new Date(right.addedAt).getTime() - new Date(left.addedAt).getTime();
    });
  }, [papers, filter, query, addedByFilter, sortBy]);
  // A decision can remove a paper from the current filter without closing its reader.
  const selectedLink = papers.find(link => matchesPaper(link, selectedPaperId));
  const selectedParts = selectedLink ? paperParts(selectedLink) : undefined;
  const paperQuery = usePaper(selectedParts?.id);
  const selectedPaper = paperQuery.data;

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

  const saveRemove = async () => {
    if (readOnly || !removeDialog || removePaper.isPending) return;
    try {
      await removePaper.mutateAsync(paperParts(removeDialog).id);
      setRemoveDialog(null);
      toast.success(t("Paper removed from the project."));
    } catch (error) {
      toast.error(t((error as { response?: { status?: number } }).response?.status === 409 ? "This paper has linked research records. Mark it as not relevant instead." : "Could not remove this paper."));
    }
  };

  const beginCompare = () => {
    setCompareIds(selectedBulkIds);
    setCompareOpen(true);
  };

  const toggleBulk = (id: string) => setSelectedBulkIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const clearFilters = () => {
    setQuery("");
    setAddedByFilter("");
    setSortBy("newest");
    setFilter("ALL");
  };

  const [readerLayout, setReaderLayout] = useState<"modal" | "drawer">("modal");
  const currentPaperIndex = filteredPapers.findIndex(link => matchesPaper(link, selectedPaperId));
  const hasPrevPaper = currentPaperIndex > 0;
  const hasNextPaper = currentPaperIndex >= 0 && currentPaperIndex < filteredPapers.length - 1;

  const goToPrevPaper = () => {
    if (hasPrevPaper) {
      const prev = filteredPapers[currentPaperIndex - 1];
      if (prev) {
        const prevId = paperParts(prev).id;
        setSelectedPaperId(prevId);
      }
    }
  };

  const goToNextPaper = () => {
    if (hasNextPaper) {
      const next = filteredPapers[currentPaperIndex + 1];
      if (next) {
        const nextId = paperParts(next).id;
        setSelectedPaperId(nextId);
      }
    }
  };

  useEffect(() => {
    if (!selectedPaperId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToPrevPaper();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goToNextPaper();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPaperId, currentPaperIndex, hasPrevPaper, hasNextPaper, filteredPapers]);

  const detailPanel = selectedLink && selectedParts ? (
    <PaperDetailPanel
      projectId={projectId}
      link={selectedLink}
      summary={selectedParts.summary}
      paper={selectedPaper}
      isLoading={paperQuery.isLoading}
      isError={paperQuery.isError}
      isReadOnly={readOnly}
      onOpenScreening={() => { setSelectedPaperId(""); const params = new URLSearchParams(searchParams); params.set("view", "screening"); params.set("source", selectedParts.id); setSearchParams(params); }}
      isSaving={updatePaper.isPending}
      language={language}
      t={t}
      onReadingStatus={(status) => void changeReadingStatus(selectedLink, status)}
      onEditNotes={() => { setNoteValue(selectedLink.notes ?? ""); setNotesDialog(selectedLink); }}
      onViewEvidence={onViewEvidence}
      hasNextPaper={hasNextPaper}
      onNextPaper={goToNextPaper}
    />
  ) : null;

  return (
    <div className="project-literature-workspace" data-empty={papers.length === 0}>
      <header className="project-literature-heading">
        <div className="project-literature-heading-left">
          <div className="project-literature-title-row">
            <h2>{t("Literature")}</h2>
            <span className="project-literature-count-badge">{papers.length}</span>
          </div>
          <p className="project-literature-description">{t("Collect papers and decide together which fit your research topic.")}</p>
        </div>
        {papers.length > 0 && !readOnly && (
          <button
            type="button"
            className="project-literature-add-btn"
            onClick={() => onRequestAddPaper()}
            aria-label={t("Add papers")}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>{t("Add papers")}</span>
          </button>
        )}
      </header>

      {papers.length === 0 ? (
        <ProjectLiteratureEmpty readOnly={readOnly} onAdd={onRequestAddPaper} />
      ) : (
        <>
          <p className="screening-notice" data-no-i18n>
            Thư viện giữ trạng thái phân loại và ghi chú hiện có. Tiến độ gửi phiếu và quyết định cuối được theo dõi riêng trong Đánh giá bài báo.
          </p>

          <div className="project-literature-groups" role="group" aria-label={t("Paper review groups")}>
            {reviewGroups.map((group) => {
              return (
                <button
                  key={group.value}
                  type="button"
                  aria-pressed={filter === group.value}
                  aria-controls="project-literature-list"
                  onClick={() => setFilter(group.value)}
                  data-group={group.value}
                >
                  {t(group.label)} <span>{counts[group.value]}</span>
                </button>
              );
            })}
          </div>

          <div className="project-literature-toolbar" role="search" aria-label={t("Search project literature")}>
            <div className="project-literature-search">
              <Search aria-hidden="true" />
              <Input
                ref={paperSearch}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label={t("Search title, author, year, or venue")}
                placeholder={t("Search title, author, year, or venue")}
              />
              {query ? (
                <button
                  type="button"
                  aria-label={t("Clear search")}
                  onClick={() => { setQuery(""); paperSearch.current?.focus(); }}
                >
                  <X aria-hidden="true" />
                </button>
              ) : null}
            </div>

            <select
              aria-label={t("Filter by who added the paper")}
              value={addedByFilter}
              onChange={event => setAddedByFilter(event.target.value)}
              className="project-literature-status"
            >
              <option value="">{t("Added by anyone")}</option>
              {contributors.map(person => (
                <option key={person._id} value={person._id}>
                  {person.fullName || t("a project member")}
                </option>
              ))}
            </select>

            <select
              aria-label={t("Sort papers")}
              value={sortBy}
              onChange={event => setSortBy(event.target.value as typeof sortBy)}
              className="project-literature-sort"
            >
              <option value="newest">{t("Recently added")}</option>
              <option value="year-desc">{t("Year, newest")}</option>
              <option value="year-asc">{t("Year, oldest")}</option>
              <option value="title">{t("Title, A to Z")}</option>
            </select>
          </div>

          <div className="project-literature-results" role="status">
            <span>{t("{{visible}} of {{total}} papers", { visible: filteredPapers.length, total: papers.length })}</span>
            {(query || filter !== "ALL" || addedByFilter || sortBy !== "newest") && (
              <button type="button" onClick={clearFilters}>
                <RotateCcw className="h-3 w-3 inline-block" aria-hidden="true" />
                {t("Clear filters")}
              </button>
            )}
          </div>

          {selectedBulkIds.length > 0 ? (
            <div className="project-bulk-bar">
              <span className="project-bulk-count">{t("{{count}} selected", { count: selectedBulkIds.length })}</span>
              <div className="project-bulk-actions">
                <Button size="sm" variant="outline" className="rounded-lg shadow-xs" disabled={selectedBulkIds.length < 2 || selectedBulkIds.length > 4} onClick={beginCompare}>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5 text-primary" />
                  {t("Compare selected")}
                </Button>
                <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => setSelectedBulkIds([])}>{t("Clear selection")}</Button>
              </div>
            </div>
          ) : null}

          <section id="project-literature-list" aria-label={t("Project literature list")} className="project-paper-list">
            {filteredPapers.length === 0 ? (
              <div className="project-papers-empty-filter">
                <p>{t("No papers match these filters")}</p>
                <button type="button" onClick={clearFilters}>{t("Clear filters")}</button>
              </div>
            ) : filteredPapers.map((link) => {
              const { id, summary } = paperParts(link);
              const title = summary?.title ?? t("Paper details unavailable");
              const screeningLabel = relevanceLabels[link.screeningStatus];
              const StatusIcon = statusIcons[link.screeningStatus];
              return (
                <div
                  key={id}
                  className="project-paper-row"
                  data-status={link.screeningStatus}
                  data-selected={selectedBulkIds.includes(id)}
                >
                  <label className="project-paper-checkbox">
                    <input
                      aria-label={t("Select {{title}} for bulk actions", { title })}
                      type="checkbox"
                      checked={selectedBulkIds.includes(id)}
                      onChange={() => toggleBulk(id)}
                      disabled={readOnly}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={event => { paperTrigger.current = event.currentTarget; setSelectedPaperId(id); }}
                    aria-haspopup="dialog"
                    aria-label={t("Read {{title}}", { title })}
                    className="project-paper-open"
                  >
                    <span className="project-paper-copy">
                      <div className="project-paper-badges-row">
                        <span className={`project-paper-badge-pill status-${link.screeningStatus}`}>
                          <StatusIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          <span>{t(screeningLabel)}</span>
                        </span>
                        {link.readingStatus !== "NOT_STARTED" && (
                          <span className="project-paper-badge-pill reading-pill">
                            <BookOpen className="h-3 w-3 shrink-0" aria-hidden="true" />
                            <span>{t(link.readingStatus === "REVIEWED" ? "Reviewed" : "Reading")}</span>
                          </span>
                        )}
                        {link.evidenceCount > 0 && (
                          <span className="project-paper-badge-pill evidence-pill">
                            <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
                            <span>{t("{{count}} linked to research gaps", { count: link.evidenceCount })}</span>
                          </span>
                        )}
                        {summary?.publicationYear ? (
                          <span className="project-paper-badge-pill year-pill">
                            <Calendar className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />
                            <span>{summary.publicationYear}</span>
                          </span>
                        ) : null}
                      </div>

                      <strong className="project-paper-title">{title}</strong>

                      <span className="project-paper-meta">
                        <span className="project-paper-meta-item">
                          <Users className="mr-1.5 inline-block h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
                          {authorLine(summary?.authors) || t("Authors unavailable")}
                        </span>
                        <span className="project-paper-meta-sep" aria-hidden="true">•</span>
                        <span className="project-paper-meta-item">
                          <BookOpen className="mr-1.5 inline-block h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
                          {summary?.journalName || t("Venue not listed")}
                        </span>
                        {summary?.doi ? (
                          <>
                            <span className="project-paper-meta-sep" aria-hidden="true">•</span>
                            <span className="project-paper-meta-item">DOI: {summary.doi}</span>
                          </>
                        ) : null}
                      </span>
                    </span>

                    <span className="project-paper-provenance">
                      <span className="project-paper-provenance-info">
                        <span className="project-paper-author-info">
                          <User className="mr-1 inline-block h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden="true" />
                          {t("Added by {{name}}", { name: link.addedBy?.fullName || t("a project member") })} · {new Date(link.addedAt).toLocaleDateString(language)}
                        </span>
                        {link.screenedBy && (
                          <>
                            <span className="project-paper-meta-sep" aria-hidden="true">•</span>
                            <span className="project-paper-reviewer-info">
                              {t("Reviewed by {{name}}", { name: link.screenedBy.fullName || t("a project member") })}
                            </span>
                          </>
                        )}
                        {link.notes?.trim() && (
                          <>
                            <span className="project-paper-meta-sep" aria-hidden="true">•</span>
                            <span className="project-paper-notes-info">
                              <FileText className="mr-1 inline-block h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden="true" />
                              {t("Notes {{count}}", { count: 1 })}
                            </span>
                          </>
                        )}
                      </span>
                      <span className="project-paper-read">
                        {t("Read paper")}
                        <ChevronRight className="h-3.5 w-3.5 transition-transform" aria-hidden="true" />
                      </span>
                    </span>
                  </button>

                  <div className="project-paper-actions-side">
                    <div className="project-paper-decision">
                      <span className="project-relevance" data-status={link.screeningStatus}>
                        {t(screeningLabel)}
                      </span>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="project-paper-remove"
                      aria-label={t("Remove {{title}} from project", { title })}
                      onClick={() => setRemoveDialog(link)}
                      disabled={readOnly}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </section>
        </>
      )}

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

      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />{t("Cross-paper comparison")}</DialogTitle><DialogDescription>{t("AI-generated comparison of findings, methods, and outcomes.")}</DialogDescription></DialogHeader>
          {comparing ? <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("Comparing papers…")}</div> : compareError ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{t("Comparison could not be loaded. Try again.")}</div> : compareData ? <CompareTable comparison={compareData} /> : null}
          <DialogFooter><Button onClick={() => setCompareOpen(false)}>{t("Close")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedLink)} onOpenChange={open => { if (!open && !notesDialog) closeReader(); }}>
        <DialogContent
          ref={reader}
          className="project-paper-dialog"
          data-no-i18n
          overlayClassName="project-paper-reader-overlay"
          data-layout={readerLayout}
          showClose={false}
          aria-describedby={undefined}
          onOpenAutoFocus={event => { event.preventDefault(); reader.current?.focus({ preventScroll: true }); }}
          onCloseAutoFocus={event => { event.preventDefault(); (paperTrigger.current?.isConnected ? paperTrigger.current : paperSearch.current)?.focus({ preventScroll: true }); }}
        >
          <div className="project-paper-dialog-header">
            <div className="project-reader-header-left">
              <span className="project-reader-title-badge">
                <BookOpen className="h-4 w-4" aria-hidden="true" />
                {t("Paper details")}
              </span>
              {filteredPapers.length > 1 && currentPaperIndex >= 0 && (
                <div className="project-reader-nav" role="toolbar" aria-label={t("Paper navigation")}>
                  <button
                    type="button"
                    className="project-reader-nav-btn"
                    disabled={!hasPrevPaper}
                    onClick={goToPrevPaper}
                    aria-label={t("Previous paper")}
                    title={`${t("Previous paper")} (←)`}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <span className="project-reader-nav-count">
                    {currentPaperIndex + 1} / {filteredPapers.length}
                  </span>
                  <button
                    type="button"
                    className="project-reader-nav-btn"
                    disabled={!hasNextPaper}
                    onClick={goToNextPaper}
                    aria-label={t("Next paper")}
                    title={`${t("Next paper")} (→)`}
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
            <div className="project-reader-header-right">
              <button
                type="button"
                className="project-reader-layout-btn"
                onClick={() => setReaderLayout(layout => (layout === "modal" ? "drawer" : "modal"))}
                aria-label={readerLayout === "modal" ? t("Switch to side drawer") : t("Switch to center modal")}
                title={readerLayout === "modal" ? t("Switch to side drawer") : t("Switch to center modal")}
              >
                {readerLayout === "modal" ? <PanelRight className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
              <DialogClose asChild>
                <button type="button" aria-label={t("Close")}>
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </DialogClose>
            </div>
          </div>
          {detailPanel}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PaperDetailPanel({
  projectId,
  link,
  summary,
  paper,
  isLoading,
  isError,
  isReadOnly,
  onOpenScreening,
  isSaving,
  language,
  t,
  onReadingStatus,
  onEditNotes,
  onViewEvidence,
  hasNextPaper,
  onNextPaper,
}: {
  projectId: string;
  link: ProjectPaperLink;
  summary?: ProjectPaperSummary;
  paper?: Paper;
  isLoading: boolean;
  isError: boolean;
  isReadOnly: boolean;
  onOpenScreening: () => void;
  isSaving: boolean;
  language: string;
  t: (key: string, values?: Record<string, string | number>) => string;
  onReadingStatus: (status: ProjectReadingStatus) => void;
  onEditNotes: () => void;
  onViewEvidence: () => void;
  hasNextPaper?: boolean;
  onNextPaper?: () => void;
}) {
  const [readerTab, setReaderTab] = useState<"overview" | "analysis">("overview");
  const [copiedAbstract, setCopiedAbstract] = useState(false);

  useEffect(() => {
    setCopiedAbstract(false);
  }, [link.id]);

  const title = paper?.title ?? summary?.title ?? t("Paper details unavailable");
  const authors = paper?.authors ?? summary?.authors ?? [];
  const abstract = paper?.abstractText ?? summary?.abstractText;
  const doi = paper?.externalIds?.doi ?? summary?.doi;
  const topics = [...(paper?.topics?.map((topic) => topic.topicName) ?? []), ...(paper?.keywords?.map((keyword) => keyword.keywordName) ?? [])];
  const reasonLabel = exclusionReasons.find((reason) => reason.value === link.exclusionReason)?.label ?? link.exclusionReason;
  const screenedDate = link.screenedAt ? new Date(link.screenedAt).toLocaleDateString(language) : "";
  const screeningLabel = relevanceLabels[link.screeningStatus];

  const copyAbstract = async () => {
    if (!abstract) return;
    try {
      await navigator.clipboard.writeText(abstract);
      setCopiedAbstract(true);
      setTimeout(() => setCopiedAbstract(false), 2000);
    } catch {
      setCopiedAbstract(false);
    }
  };

  return (
    <div className="project-paper-reader">
      <div className="project-paper-reader-body" aria-busy={isLoading}>
        {isLoading ? <>
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <div role="status" aria-label={t("Loading...")} className="project-reader-loading">
            <div aria-hidden="true" className="space-y-5">
              <div className="flex gap-2"><Skeleton className="h-7 w-28" /><Skeleton className="h-7 w-24" /></div>
              <div className="space-y-2"><Skeleton className="h-6 w-full" /><Skeleton className="h-6 w-4/5" /></div>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-52 w-full" />
            </div>
          </div>
        </> : <>
        {isError ? <div role="status" className="flex items-start gap-2 rounded-md bg-destructive/5 px-3 py-2 text-xs text-muted-foreground"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />{t("Could not load the full paper record. Showing the project summary instead.")}</div> : null}

        <header className="project-reader-header">
          <div className="project-reader-header-badges">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                link.screeningStatus === "INCLUDED"
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                  : link.screeningStatus === "EXCLUDED"
                    ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
              }`}>
                {link.screeningStatus === "INCLUDED" ? <Check className="h-3.5 w-3.5" /> : link.screeningStatus === "EXCLUDED" ? <X className="h-3.5 w-3.5" /> : <CircleHelp className="h-3.5 w-3.5" />}
                {t(screeningLabel)}
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-muted/70 text-muted-foreground border border-border">
                <BookOpen className="h-3.5 w-3.5 text-muted-foreground/80" />
                {t(link.readingStatus === "REVIEWED" ? "Reviewed" : link.readingStatus === "READING" ? "Reading" : "Not started")}
              </span>
              {doi && (
                <a
                  href={doi.startsWith("http") ? doi : `https://doi.org/${doi}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="project-reader-doi-badge"
                  title={t("Open DOI")}
                >
                  <ExternalLink className="h-3 w-3" />
                  <span>DOI: {doi.replace(/^https?:\/\/doi\.org\//, "")}</span>
                </a>
              )}
            </div>

            <Button asChild type="button" size="sm" variant="ghost" className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground">
              <Link to={`/papers/${paper?.id ?? summary?._id ?? (typeof link.targetId === "string" ? link.targetId : "")}`} target="_blank">
                <FileText className="mr-1.5 h-3.5 w-3.5" />
                {t("Open full paper")}
                <ExternalLink className="ml-1 h-3 w-3 opacity-60" />
              </Link>
            </Button>
          </div>

          <DialogTitle className="project-paper-reader-title">{title}</DialogTitle>

          <div className="project-reader-citation-card">
            {authors.length > 0 && (
              <div className="project-reader-citation-authors">
                <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="font-medium text-foreground text-sm">{authorLine(authors)}</span>
              </div>
            )}

            <div className="project-reader-citation-meta">
              <span className="inline-flex items-center gap-1.5">
                <BookOpen className="h-3 w-3 text-muted-foreground/70" />
                <span>{[paper?.journalName ?? summary?.journalName, paper?.publicationYear ?? summary?.publicationYear].filter(Boolean).join(" · ") || t("Publication details unavailable")}</span>
              </span>

              <span className="project-reader-meta-dot">•</span>

              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-muted-foreground/70" />
                <span>{t("Added by {{name}}", { name: link.addedBy?.fullName || t("a project member") })} · {new Date(link.addedAt).toLocaleDateString(language)}</span>
              </span>

              {link.screenedAt && (
                <>
                  <span className="project-reader-meta-dot">•</span>
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-muted-foreground/70" />
                    <span>{t("Screened by {{name}} · {{date}}", { name: link.screenedBy?.fullName || t("a project member"), date: screenedDate })}</span>
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="project-reader-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={readerTab === "overview"}
              className={`project-reader-tab ${readerTab === "overview" ? "active" : ""}`}
              onClick={() => setReaderTab("overview")}
            >
              <FileText className="h-4 w-4" />
              <span>{t("Abstract & Overview")}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={readerTab === "analysis"}
              className={`project-reader-tab ${readerTab === "analysis" ? "active" : ""}`}
              onClick={() => setReaderTab("analysis")}
            >
              <Sparkles className="h-4 w-4 text-amber-500" />
              <span>{t("AI Insights & Analysis")}</span>
            </button>
          </div>
        </header>

        <div className={`project-reader-content-pane ${readerTab === "overview" ? "" : "hidden"}`}>
          <section aria-labelledby="paper-abstract-title" className="project-reader-abstract-card">
            <div className="project-reader-abstract-header">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <h4 id="paper-abstract-title" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {t("Abstract")}
                </h4>
              </div>
              {abstract && (
                <button
                  type="button"
                  onClick={copyAbstract}
                  className="project-reader-copy-btn"
                  title={t(copiedAbstract ? "Copied" : "Copy abstract")}
                >
                  {copiedAbstract ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{t(copiedAbstract ? "Copied" : "Copy abstract")}</span>
                </button>
              )}
            </div>
            <p className="project-paper-abstract">
              {abstract || t("No abstract is available for this paper.")}
            </p>
          </section>

          {topics.length > 0 && (
            <section aria-labelledby="paper-topics-title" className="project-reader-topics-section">
              <div className="flex items-center gap-1.5 mb-2.5">
                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                <h4 id="paper-topics-title" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("Topics")}
                </h4>
              </div>
              <div className="flex flex-wrap gap-2">
                {topics.slice(0, 10).map((topic, index) => (
                  <span key={`${topic}-${index}`} className="project-reader-topic-chip">
                    {topic}
                  </span>
                ))}
              </div>
            </section>
          )}

          <div className="project-reader-grid">
            <div className="project-reader-card">
              <div className="flex items-center justify-between">
                <span className="project-reader-card-label">
                  <Link2 className="h-3.5 w-3.5 text-primary" />
                  {t("Evidence records")}
                </span>
                <span className="project-reader-card-badge">
                  {link.evidenceCount}
                </span>
              </div>
              <p className="project-reader-card-text">
                {t("{{count}} linked to research gaps", { count: link.evidenceCount })}
              </p>
              {link.evidenceCount > 0 ? (
                <Button type="button" size="sm" variant="outline" className="mt-3 w-fit" onClick={onViewEvidence}>
                  <FileText className="mr-1.5 h-3.5 w-3.5" />
                  {t("View evidence")}
                </Button>
              ) : null}
            </div>

            <div className="project-reader-card">
              <div className="flex items-center justify-between">
                <span className="project-reader-card-label">
                  <StickyNote className="h-3.5 w-3.5 text-amber-500" />
                  {t("Project notes")}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  data-reader-action="notes"
                  onClick={onEditNotes}
                  disabled={isReadOnly}
                >
                  {t(link.notes ? "Edit note" : "Add note")}
                </Button>
              </div>
              <div className="project-reader-card-text">
                {link.notes ? (
                  <p className="whitespace-pre-line line-clamp-3 text-xs leading-relaxed text-foreground">
                    {link.notes}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    {t("No notes yet.")}
                  </p>
                )}
              </div>
            </div>
          </div>

          {link.screeningStatus === "EXCLUDED" && reasonLabel && (
            <div className="project-reader-exclusion-callout">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-400">
                  {t("Exclusion reason")}
                </h4>
                <p className="text-xs text-rose-800 dark:text-rose-300 mt-0.5">
                  {t(reasonLabel)}{link.exclusionNote ? ` · ${link.exclusionNote}` : ""}
                </p>
              </div>
            </div>
          )}
        </div>

        {readerTab === "analysis" && <div className="project-reader-content-pane">
          <ProjectPaperAnalysis
            projectId={projectId}
            paperId={typeof link.targetId === "string" ? link.targetId : link.targetId._id}
            readOnly={isReadOnly}
          />
        </div>}
        </>}
      </div>

      <footer className="project-paper-reader-footer">
        <label className="project-reading-select">{t("Reading status")}
          <select aria-label={t("Reading status")} disabled={isReadOnly || isSaving} value={link.readingStatus} onChange={event => onReadingStatus(event.target.value as ProjectReadingStatus)}>
            <option value="NOT_STARTED">{t("Not started")}</option><option value="READING">{t("Reading")}</option><option value="REVIEWED">{t("Reviewed")}</option>
          </select>
        </label>
        <div className="project-relevance-actions">
          <Button type="button" variant="outline" onClick={onOpenScreening}><span data-no-i18n>Đánh giá bài báo</span></Button>
          {hasNextPaper && onNextPaper && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="project-reader-footer-next"
              onClick={onNextPaper}
            >
              <span>{t("Next paper")}</span>
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
