import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowUpRight,
  BookCheck,
  BookOpen,
  Check,
  ChevronDown,
  Coins,
  FileText,
  Layers,
  Search,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import type { GapAnalysisResult, ProjectGapDiscoveryResult } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useAnalyzeGap, useGapAnalysisStatus } from "@/features/gaps/hooks/use-gaps";
import { useI18n } from "@/i18n";
import { researchApi } from "../api/project-research.api";
import { useResearchResource } from "../hooks/use-project-research";
import { WorkspaceError, WorkspaceLoading, WorkspacePager } from "./workspace-common";
import { ProjectGapProgress } from "./project-gap-progress";
import "../project-gap-discovery.css";

export function ProjectGapDiscovery({
  projectId,
  defaultTopic = "",
  readOnly = false,
  onAnalysisChange,
}: {
  projectId: string;
  defaultTopic?: string;
  readOnly?: boolean;
  onAnalysisChange?: (analysis: GapAnalysisResult | null) => void;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const overview = useResearchResource(
    projectId,
    ["discovery"],
    () => researchApi.discovery(projectId),
    true,
    (data) =>
      data?.latestAnalysis?.status === "queued" ||
      data?.latestAnalysis?.status === "analyzing"
  );
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [editingAnalysisId, setEditingAnalysisId] = useState<string | null>(null);
  const selectorId = useId();
  const query = useDebouncedValue(search, 250);
  const topic = defaultTopic.trim().length >= 3 ? defaultTopic.slice(0, 200) : "Research gaps";
  const papers = useResearchResource(
    projectId,
    ["discovery-papers", page, query],
    () => researchApi.library(projectId, { state: "INCLUDED", page, pageSize: 50, q: query })
  );
  const [selection, setSelection] = useState<Map<string, string> | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const analyze = useAnalyzeGap();
  const run = useGapAnalysisStatus(runId);
  const lastFinished = useRef<string | null>(null);
  const wasRunningRef = useRef(false);
  const sharedLatest = overview.data?.latestAnalysis;
  const latest =
    sharedLatest && run.data && sharedLatest.id !== run.data.id && sharedLatest.createdAt > run.data.createdAt
      ? sharedLatest
      : run.data ?? sharedLatest;
  const running =
    latest?.status === "queued" ||
    latest?.status === "analyzing" ||
    Boolean(runId && !run.data && !run.isError);
  const maximum = overview.data?.maxPapers ?? 10;
  const minimum = overview.data?.minPapers ?? 2;
  const eligible = papers.data?.items.filter(
    (paper) => !paper.dataStatus || paper.dataStatus === "active"
  );
  const selected =
    selection ?? new Map(eligible?.slice(0, maximum).map((paper) => [paper.paperId, paper.title]));
  const frozen = running || readOnly || analyze.isPending;
  const analysisPapers = latest?.selectedPaperIds?.length
    ? latest.selectedPaperIds
    : latest?.discovery?.papers.map((paper) => paper.id) ?? [];
  const selectionCollapsed =
    latest?.status === "ready" && !analyze.isPending && editingAnalysisId !== latest.id;
  const selectionChanged =
    latest?.status === "ready" &&
    JSON.stringify([...selected.keys()].sort()) !== JSON.stringify([...analysisPapers].sort());

  const isModal = Boolean(latest?.status === "ready");

  useEffect(() => {
    if (!isModal || selectionCollapsed) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEditingAnalysisId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isModal, selectionCollapsed]);

  useEffect(() => {
    onAnalysisChange?.(latest ?? null);
  }, [latest, onAnalysisChange]);

  useEffect(() => {
    if (running || analyze.isPending) {
      wasRunningRef.current = true;
    } else if (wasRunningRef.current) {
      if (latest?.status === "ready") {
        wasRunningRef.current = false;
        const count = latest.gapIds?.length ?? 0;
        toast.success(t("Analysis complete"), {
          description: t("{{count}} candidate gaps found", { count }),
        });
        setEditingAnalysisId(null);
      } else if (latest?.status === "failed") {
        wasRunningRef.current = false;
        toast.error(t("Analysis interrupted"), {
          description:
            latest.errorMessage ||
            t("The previous analysis failed. Try again with the selected papers."),
        });
      }
    }
  }, [running, analyze.isPending, latest?.status, latest?.gapIds?.length, latest?.errorMessage, t]);

  useEffect(() => {
    if (
      !latest ||
      (latest.status !== "ready" && latest.status !== "failed") ||
      lastFinished.current === latest.id
    )
      return;
    lastFinished.current = latest.id;
    void client.invalidateQueries({ queryKey: ["gaps"] });
    void client.invalidateQueries({ queryKey: ["project-research"] });
    void client.invalidateQueries({ queryKey: ["credits"] });
  }, [latest?.id, latest?.status, client, projectId]);

  async function start() {
    if (running || analyze.isPending) return;
    try {
      const result = await analyze.mutateAsync({
        projectId,
        topic: topic.trim(),
        projectDiscovery: true,
        evidenceMode: "selected",
        selectedPaperIds: [...selected.keys()],
      });
      setRunId(result.analysisId);
      void overview.refetch();
    } catch {
      /* Keep the selected papers and topic for retry. */
    }
  }

  const errorMessage = isAxiosError(analyze.error)
    ? analyze.error.response?.data?.error?.message
    : undefined;

  function togglePaper(id: string, title: string, checked: boolean) {
    setSelection((current) => {
      const next = new Map(current ?? selected);
      if (checked) {
        if (next.size < maximum) next.set(id, title);
      } else next.delete(id);
      return next;
    });
  }

  const visiblePapers = selectedOnly
    ? [...selected]
        .filter(([, title]) => title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
        .map(
          ([paperId, title]) =>
            eligible?.find((paper) => paper.paperId === paperId) ?? {
              paperId,
              title,
              publicationYear: undefined,
              journalName: undefined,
              authors: undefined,
            }
        )
    : eligible ?? [];

  function changeView(next: boolean) {
    setSelection(new Map(selected));
    setSelectedOnly(next);
    setSearch("");
    setPage(1);
  }

  const actionDisabled =
    readOnly ||
    running ||
    analyze.isPending ||
    overview.isLoading ||
    overview.isError ||
    (overview.data?.eligibleCount ?? 0) < minimum ||
    papers.isLoading ||
    papers.isError ||
    selected.size < minimum ||
    selected.size > maximum;

  return (
    <section
      className="gap-discovery"
      data-no-i18n
      aria-busy={overview.isLoading}
      aria-label={t("Research gap discovery")}
    >
      <header className="gap-discovery-heading">
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-6 w-6 text-primary" />
          <h2>{t("Research Gaps")}</h2>
        </div>
        <p>{t("Select papers, analyze and explore research gaps.")}</p>
      </header>

      {(running || analyze.isPending) && (
        <ProjectGapProgress
          analysis={
            !analyze.isPending && (latest?.status === "queued" || latest?.status === "analyzing")
              ? latest
              : null
          }
          selectedCount={selected.size}
          submitting={analyze.isPending}
        />
      )}

      {latest?.status === "ready" && !running && !analyze.isPending && (
        <div className="gap-discovery-source-summary">
          <div className="flex items-center gap-3">
            <div className="gap-source-icon-badge">
              <BookCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <strong>{t("Analysis sources")}</strong>
              <span>{t("Based on {{count}} analyzed papers", { count: analysisPapers.length })}</span>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 text-xs font-semibold"
            aria-expanded={!selectionCollapsed}
            aria-controls={selectorId}
            onClick={() => setEditingAnalysisId(selectionCollapsed ? latest.id : null)}
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
            <span>{t(selectionCollapsed ? "Change paper selection" : "Hide paper selection")}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </Button>
        </div>
      )}

      <div
        className={isModal ? "gap-discovery-modal-overlay" : undefined}
        hidden={selectionCollapsed}
        onClick={
          isModal
            ? (event) => {
                if (event.target === event.currentTarget) {
                  setEditingAnalysisId(null);
                }
              }
            : undefined
        }
      >
        <div
          id={selectorId}
          className="gap-discovery-workbench"
          data-modal={isModal}
          data-running={running || analyze.isPending}
          hidden={selectionCollapsed}
          role={isModal ? "dialog" : undefined}
          aria-modal={isModal ? "true" : undefined}
          aria-labelledby={isModal ? "gap-modal-title" : undefined}
        >
          <div className="gap-discovery-library">
            <div className="gap-discovery-library-heading">
              <div>
                <h3 id={isModal ? "gap-modal-title" : undefined}>{t("Choose papers")}</h3>
                <p>
                  {t("Choose {{min}}–{{max}} relevant papers to compare their findings.", {
                    min: minimum,
                    max: maximum,
                  })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link to={`/projects/${projectId}?tab=papers`} className="gap-open-literature-link">
                  <span>{t("Open Literature")}</span>
                  <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
                {isModal && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="gap-modal-close-btn"
                    aria-label={t("Close")}
                    onClick={() => setEditingAnalysisId(null)}
                  >
                    <X size={16} />
                  </Button>
                )}
              </div>
            </div>

          {overview.isLoading ? (
            <WorkspaceLoading />
          ) : overview.isError ? (
            <WorkspaceError error={overview.error} retry={() => void overview.refetch()} />
          ) : (overview.data?.eligibleCount ?? 0) < minimum ? (
            <div className="gap-discovery-empty" role="status">
              <p>
                {t(
                  "Mark at least {{count}} papers Relevant / Included in Literature, then return here to analyze them.",
                  { count: minimum }
                )}
              </p>
            </div>
          ) : (
            <>
              <div className="gap-discovery-toolbar">
                <div className="gap-discovery-views" role="group" aria-label={t("Paper view")}>
                  <button type="button" aria-pressed={!selectedOnly} onClick={() => changeView(false)}>
                    {t("Relevant papers")}
                    <span>{overview.data?.eligibleCount}</span>
                  </button>
                  <button type="button" aria-pressed={selectedOnly} onClick={() => changeView(true)}>
                    {t("Selected papers")}
                    <span>{selected.size}</span>
                  </button>
                </div>

                <label className="gap-discovery-search">
                  <Search size={16} aria-hidden="true" />
                  <Input
                    aria-label={t("Search relevant papers")}
                    placeholder={t(selectedOnly ? "Search selected papers" : "Search title or DOI")}
                    value={search}
                    maxLength={200}
                    disabled={frozen}
                    onChange={(event) => {
                      setSelection(new Map(selected));
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                  />
                </label>
              </div>

              {selected.size > 0 && (
                <div className="gap-discovery-deck" aria-label={t("Assembled synthesis pack")}>
                  <div className="gap-deck-header">
                    <div className="gap-deck-title">
                      <Layers size={15} className="text-primary shrink-0" />
                      <span>{t("Assembled synthesis pack")}</span>
                      <span className="gap-deck-count-pill">{selected.size}/{maximum}</span>
                    </div>
                    <button
                      type="button"
                      className="gap-deck-clear-btn"
                      disabled={frozen}
                      onClick={() => setSelection(new Map())}
                    >
                      {t("Clear selection")}
                    </button>
                  </div>
                  <div className="gap-deck-chips">
                    {Array.from(selected.entries()).map(([id, title], idx) => (
                      <div
                        key={id}
                        className="gap-deck-chip"
                        data-running={running || analyze.isPending}
                        title={title}
                      >
                        {(running || analyze.isPending) ? (
                          <span className="gap-chip-pulse-dot" aria-hidden="true" />
                        ) : null}
                        <span className="gap-deck-chip-idx">#{idx + 1}</span>
                        <span className="gap-deck-chip-title">{title}</span>
                        {!frozen && (
                          <button
                            type="button"
                            className="gap-deck-chip-remove"
                            aria-label={t("Remove {{title}}", { title })}
                            onClick={() => togglePaper(id, title, false)}
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {papers.isLoading ? (
                <WorkspaceLoading />
              ) : papers.isError ? (
                <WorkspaceError error={papers.error} retry={() => void papers.refetch()} />
              ) : (
                <>
                  <div
                    className="gap-discovery-paper-list"
                    role="group"
                    aria-label={t(selectedOnly ? "Selected papers" : "Relevant papers")}
                  >
                    {visiblePapers.map((paper) => (
                      <label
                        key={paper.paperId}
                        className="gap-discovery-paper"
                        data-selected={selected.has(paper.paperId)}
                      >
                        <div className="gap-paper-checkbox-wrap">
                          <input
                            type="checkbox"
                            checked={selected.has(paper.paperId)}
                            disabled={
                              frozen ||
                              (!selected.has(paper.paperId) && selected.size >= maximum)
                            }
                            onChange={(event) =>
                              togglePaper(paper.paperId, paper.title, event.target.checked)
                            }
                          />
                        </div>
                        <div className="gap-paper-type-badge" aria-hidden="true">
                          <FileText size={15} />
                        </div>
                        <span className="gap-discovery-paper-body">
                          <span className="gap-discovery-paper-title" title={paper.title}>
                            {paper.title}
                          </span>
                          <span className="gap-discovery-paper-meta">
                            {paper.publicationYear && (
                              <span className="gap-paper-year-badge">{paper.publicationYear}</span>
                            )}
                            {paper.journalName && (
                              <span className="gap-paper-journal" title={paper.journalName}>
                                <BookOpen size={11} className="inline mr-1 opacity-70" />
                                {paper.journalName}
                              </span>
                            )}
                            {!!paper.authors?.length && (
                              <span className="gap-paper-authors">
                                <Users size={11} className="inline mr-1 opacity-70" />
                                {paper.authors.slice(0, 2).join(", ")}
                                {paper.authors.length > 2 ? " et al." : ""}
                              </span>
                            )}
                          </span>
                        </span>
                        <div className="gap-paper-status-col">
                          {selected.has(paper.paperId) ? (
                            <span className="gap-paper-checked-badge" title={t("Selected papers")}>
                              <Check size={12} />
                            </span>
                          ) : (
                            <span className="gap-paper-index-indicator" aria-hidden="true" />
                          )}
                        </div>
                      </label>
                    ))}
                  </div>

                  {visiblePapers.length === 0 && (
                    <p className="gap-discovery-no-match" role="status">
                      {t(
                        selectedOnly && !search
                          ? "No papers selected yet."
                          : "No matching papers. Try another search."
                      )}
                    </p>
                  )}

                  {!selectedOnly && (
                    <WorkspacePager
                      data={papers.data}
                      page={page}
                      onPage={(next) => {
                        setSelection(new Map(selected));
                        setPage(next);
                      }}
                    />
                  )}
                </>
              )}

            </>
          )}
        </div>

        <footer
          className="gap-discovery-setup"
          aria-label={t("Analysis setup")}
          data-running={running || analyze.isPending}
        >
          {(overview.data?.eligibleCount ?? 0) >= minimum && (
            <div className="gap-discovery-bulk-actions">
              <Button
                variant="outline"
                size="sm"
                className="gap-smart-pick-btn"
                disabled={frozen || papers.isLoading || papers.isError}
                onClick={() => {
                  const next = new Map();
                  const available = eligible ?? [];
                  const pickCount = Math.min(3, available.length, maximum);
                  for (let i = 0; i < pickCount; i++) {
                    const p = available[i];
                    if (p) next.set(p.paperId, p.title);
                  }
                  setSelection(next);
                }}
              >
                <Sparkles size={13} className="mr-1 text-primary" />
                {t("Smart pick 3 papers")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={
                  frozen ||
                  papers.isLoading ||
                  papers.isError ||
                  !eligible?.length ||
                  selected.size >= maximum ||
                  eligible.every((paper) => selected.has(paper.paperId))
                }
                onClick={() => {
                  const next = new Map(selected);
                  for (const paper of eligible ?? []) {
                    if (next.size >= maximum) break;
                    next.set(paper.paperId, paper.title);
                  }
                  setSelection(next);
                }}
              >
                {t(search || papers.data?.hasNext ? "Select shown" : "Select all")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={frozen || !selected.size}
                onClick={() => setSelection(new Map())}
              >
                {t("Clear selection")}
              </Button>
            </div>
          )}

          <div className="gap-setup-center">
            <div className="gap-setup-status-row">
              <div
                className="gap-discovery-selection-status"
                data-ready={selected.size >= minimum && selected.size <= maximum}
                aria-live="polite"
              >
                {t("{{count}} selected for analysis", { count: selected.size })}
              </div>
              {running || analyze.isPending ? (
                <span className="gap-readiness-pill gap-readiness-pill--running">
                  <span className="gap-pulse-indicator" aria-hidden="true">
                    <span className="gap-pulse-core" />
                    <span className="gap-pulse-wave" />
                  </span>
                  {t(
                    analyze.isPending
                      ? "Starting analysis"
                      : latest?.discovery?.stage === "synthesizing"
                      ? "Comparing findings across papers"
                      : latest?.discovery?.stage === "generating"
                      ? "Generating candidate research gaps"
                      : latest?.discovery?.stage === "extracting"
                      ? "Analyzing source papers"
                      : "Waiting for analysis"
                  )}
                </span>
              ) : selected.size >= minimum && selected.size <= maximum ? (
                <span className="gap-readiness-pill gap-readiness-pill--ready">
                  <Check size={12} />
                  {t("Ready for cross-paper analysis")}
                </span>
              ) : (
                <span className="gap-readiness-pill gap-readiness-pill--warn">
                  <AlertCircle size={12} />
                  {t("Select at least {{min}} papers", { min: minimum })}
                </span>
              )}
            </div>

            <div
              className="gap-readiness-meter"
              data-running={running || analyze.isPending}
              aria-hidden="true"
            >
              <div className="gap-readiness-bar-track">
                <div
                  className="gap-readiness-bar-fill"
                  data-state={selected.size >= minimum ? "ready" : "under"}
                  data-running={running || analyze.isPending}
                  style={{ width: `${Math.min(100, Math.max(selected.size > 0 ? 8 : 0, (selected.size / maximum) * 100))}%` }}
                />
                <div
                  className="gap-readiness-marker"
                  style={{ left: `${(minimum / maximum) * 100}%` }}
                  title={t("Select at least {{min}} papers", { min: minimum })}
                />
              </div>
              <div className="gap-readiness-labels">
                <span>0</span>
                <span className="gap-readiness-min-tag">{t("Min")} {minimum}</span>
                <span>{t("Max")} {maximum}</span>
              </div>
            </div>

            <p className="gap-discovery-limits">
              {t("{{min}}–{{max}} papers per analysis", { min: minimum, max: maximum })}
            </p>
            {selected.size < minimum &&
              !overview.isLoading &&
              (overview.data?.eligibleCount ?? 0) >= minimum && (
                <p className="gap-discovery-selection-help" role="status">
                  {t("Choose {{count}} more papers to analyze.", {
                    count: minimum - selected.size,
                  })}
                </p>
              )}

            {(running || analyze.isPending) && (
              <div className="gap-running-live-hud" role="status" aria-live="polite">
                <div className="gap-running-hud-spinner" aria-hidden="true">
                  <Sparkles size={16} className="animate-spin text-primary" />
                </div>
                <div className="gap-running-hud-text">
                  <p className="gap-running-hud-title">
                    {t(
                      analyze.isPending
                        ? "Sending your selected papers for analysis."
                        : latest?.discovery?.stage === "synthesizing"
                        ? "The papers have been read. Now we are comparing shared findings, differences and unanswered questions."
                        : latest?.discovery?.stage === "generating"
                        ? "Turning the comparison into research directions linked to your sources."
                        : latest?.discovery?.stage === "extracting"
                        ? "Reading the available sources for methods, findings and limitations."
                        : "Your analysis is queued. It will start when a worker is available."
                    )}
                  </p>
                </div>
              </div>
            )}

            <div className="gap-discovery-action">
              <small>
                <Coins size={16} aria-hidden="true" className="text-amber-500" />
                {t("30 credits per analysis")}
              </small>
              <div className="flex items-center gap-2">
                {isModal && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingAnalysisId(null)}
                  >
                    {t("Close")}
                  </Button>
                )}
                <Button
                  disabled={actionDisabled}
                  onClick={() => void start()}
                  className={running || analyze.isPending ? "gap-analyze-btn--running" : undefined}
                >
                  <Sparkles
                    size={16}
                    className={`mr-1.5 ${running || analyze.isPending ? "animate-spin text-amber-300" : ""}`}
                  />
                  {t(running || analyze.isPending ? "Analysis in progress" : "Analyze papers")}
                </Button>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>

      {analyze.isError && (
        <div role="alert" className="research-notice">
          <p>{errorMessage ?? t("Could not start analysis. Your selection is kept.")}</p>
          <Button
            variant="outline"
            onClick={() => {
              void overview.refetch();
              void papers.refetch();
              analyze.reset();
            }}
          >
            {t("Refresh sources")}
          </Button>
        </div>
      )}

      {run.isError && <WorkspaceError error={run.error} retry={() => void run.refetch()} />}

      {!running && !analyze.isPending && latest?.status === "failed" && (
        <p role="alert" className="research-notice">
          {t(
            !latest.errorMessage || latest.errorMessage === "Gap analysis failed. Please try again later."
              ? "The previous analysis failed. Try again with the selected papers."
              : latest.errorMessage
          )}
        </p>
      )}

      {!running && !analyze.isPending && latest?.status === "ready" && (
        <div className="gap-discovery-completion-banner" role="status">
          <div className="gap-completion-celebrate-badge" aria-hidden="true">
            <Sparkles className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="gap-completion-content">
            <p className="gap-discovery-success">
              {t("{{count}} candidate gaps found", { count: latest.gapIds.length })} ·{" "}
              {t("Based on {{count}} analyzed papers", { count: analysisPapers.length })}
            </p>
            {selectionChanged && (
              <span className="gap-completion-changed-note">
                {t("Your current selection applies to the next analysis.")}
              </span>
            )}
            {latest.gapIds.length === 0 && (
              <span className="gap-completion-empty-note">
                {t("No grounded gap found in these papers. Try a different selection.")}
              </span>
            )}
          </div>
          <div className="gap-completion-actions">
            {latest.gapIds.length > 0 && (
              <Button
                type="button"
                size="sm"
                className="gap-completion-view-btn"
                onClick={() => {
                  const el =
                    document.getElementById("project-gap-cards") ||
                    document.querySelector(".gap-discovery-results");
                  el?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                <Sparkles size={14} className="mr-1.5" />
                <span>{t("Review evidence")}</span>
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditingAnalysisId(latest.id)}
            >
              <SlidersHorizontal size={14} className="mr-1.5" />
              <span>{t("Change paper selection")}</span>
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

/** The [n] numbering is shared with the stored synthesis and never changes on sorting. */
export function DiscoveryResults({
  projectId,
  result,
}: {
  projectId: string;
  result: ProjectGapDiscoveryResult;
}) {
  const { t } = useI18n();
  return (
    <div className="gap-discovery-results-body">
      <p className="research-help">
        {t(
          "AI interpretations await human review. Quotations are indexed source text; abstract-only coverage is limited."
        )}
      </p>
      {result.synthesis && (
        <section className="gap-discovery-synthesis">
          <h3>{t("Cross-paper findings")}</h3>
          {(
            [
              ["commonFindings", "Shared findings"],
              ["contradictions", "Differences and contradictions"],
              ["openQuestions", "Unresolved questions"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <h4>{t(label)}</h4>
              <p>{result.synthesis?.[key] || t("Not reported in the available sources")}</p>
            </div>
          ))}
        </section>
      )}
      {result.papers.map((paper, index) => (
        <details key={paper.id}>
          <summary>
            [{index + 1}] {paper.title}
          </summary>
          <div className="gap-discovery-extraction">
            <Link
              className="research-source-link"
              to={`/projects/${projectId}?tab=papers&source=${paper.id}`}
            >
              {t("Open source paper")}
            </Link>
            <p className="research-help">
              {t("Source coverage")}: {paper.sourceKind}
              {paper.warnings.map((warning, number) => (
                <span className="block" key={number}>
                  {warning}
                </span>
              ))}
            </p>
            {(
              [
                ["researchQuestions", "Research questions"],
                ["methods", "Methods"],
                ["findings", "Findings"],
                ["limitations", "Limitations"],
                ["futureWork", "Future work"],
              ] as const
            ).map(([key, label]) => {
              const value = paper.analysis[key];
              return (
                <div key={key}>
                  <h4>{t(label)}</h4>
                  {Array.isArray(value) && value.length ? (
                    <ul>
                      {value.map((text, number) => (
                        <li key={number}>{text}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      {typeof value === "string" && value
                        ? value
                        : t("Not reported in the available sources")}
                    </p>
                  )}
                </div>
              );
            })}
            {!!paper.relations?.length && (
              <>
                <h4>{t("Source-linked statements")}</h4>
                {paper.relations.map((relation, number) => (
                  <figure key={number}>
                    <blockquote>{relation.quote}</blockquote>
                    <figcaption>
                      {t(relation.kind)} ·{" "}
                      {relation.pageNumber
                        ? t("Page {{page}}", { page: relation.pageNumber })
                        : t("Indexed source")}{" "}
                      · {relation.chunkId}
                    </figcaption>
                  </figure>
                ))}
              </>
            )}
            <h4>{t("Source passages")}</h4>
            {paper.passages.length ? (
              paper.passages.map((passage) => (
                <figure key={passage.id}>
                  <blockquote>{passage.text}</blockquote>
                  <figcaption>
                    {passage.pageNumber
                      ? t("Page {{page}}", { page: passage.pageNumber })
                      : t("Indexed source")}{" "}
                    · {passage.id}
                  </figcaption>
                </figure>
              ))
            ) : (
              <p>{t("No source passage available. Verify the original paper.")}</p>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
