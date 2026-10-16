import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ExternalLink, Loader2, Plus, ShieldCheck } from "lucide-react";
import type { GapClosureCheckStatus, GapClosureCheckView, ResearchGapItem } from "@trend/shared-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { isClosureCheckRunning } from "../closure-format";
import { closureKeys, useGapClosureCheck, useGapClosureChecks } from "../hooks/use-gap-closure";
import { ClosureDecisionSection } from "./closure-decision-section";
import { ClosureDocumentCard } from "./closure-document-card";
import { ClosureSearchLog } from "./closure-search-log";
import { ClosureStartForm } from "./closure-start-form";
import { ClosureStatusBadge } from "./closure-status-badge";

const DOCUMENT_PAGE_SIZE = 15;

function useCheckStatusNames(): Record<GapClosureCheckStatus, string> {
  const { t } = useI18n();
  return {
    QUEUED: t("Queued"),
    SEARCHING: t("Searching"),
    SCREENING: t("Ready for review"),
    DECIDED: t("Decided"),
    FAILED: t("Failed"),
  };
}

/** Closure check of one gap: start form, search log, document screening, decision and dossier export. */
export function GapClosurePanel({ gap }: { gap: ResearchGapItem }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const statusNames = useCheckStatusNames();
  const checks = useGapClosureChecks(gap.id);
  const [selection, setSelection] = useState<string | "new" | null>(null);
  const [visibleDocuments, setVisibleDocuments] = useState(DOCUMENT_PAGE_SIZE);

  const list = checks.data ?? [];
  const selectedId = selection === "new" ? undefined : (selection ?? list[0]?.id);
  const showForm = selection === "new" || (checks.isSuccess && list.length === 0);
  const check = useGapClosureCheck(selectedId);
  const view = check.data;

  // The list shows each check's status; refresh it once the runner is done.
  const finishedStatus = view && !isClosureCheckRunning(view.status) ? view.status : undefined;
  useEffect(() => {
    if (finishedStatus) void queryClient.invalidateQueries({ queryKey: closureKeys.gapChecks(gap.id) });
  }, [finishedStatus, gap.id, queryClient]);

  const documents = useMemo(() => {
    if (!view) return [];
    return [...view.documents].sort((a, b) => {
      const aPending = a.effectiveLabel ? 1 : 0;
      const bPending = b.effectiveLabel ? 1 : 0;
      return aPending - bPending || a.queryIndex - b.queryIndex || a.rank - b.rank;
    });
  }, [view]);

  const canReview = view?.status === "SCREENING" || view?.status === "DECIDED";

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-2xl border border-cyan-200/60 bg-cyan-50/40 p-4 text-xs leading-relaxed text-slate-700 dark:border-cyan-900/40 dark:bg-cyan-950/10 dark:text-slate-300">
        <p className="flex items-start gap-2 font-semibold">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" />
          <span>{t("AI suggests labels; a person can confirm or change every label. The decision rule is fixed and shown below.")}</span>
        </p>
        <details>
          <summary className="cursor-pointer font-semibold text-cyan-800 dark:text-cyan-300">{t("How the decision is made")}</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>{t("The question is searched in the LumiGap corpus and in OpenAlex. Every query is logged.")}</li>
            <li>{t("Every document found is labelled Answers, Partly answers or Unrelated, with a quote copied from its title or abstract.")}</li>
            <li>{t("Closed: at least one document answers the question. The witness quote is shown.")}</li>
            <li>{t("Open (certified): no document answers it, no search failed, nothing waits for a person, and B = epsHat + pHat is at most the allowed maximum.")}</li>
            <li>{t("epsHat is how often this procedure misses an answer that exists (measured on calibration questions). pHat is how much of the literature the search cannot see (measured on a reference list). Both are upper bounds.")}</li>
            <li>{t("Needs review: anything else. The reasons are listed in plain language.")}</li>
          </ol>
        </details>
        <Link to="/gap-closure" className="inline-flex items-center gap-1 font-semibold text-cyan-700 hover:underline dark:text-cyan-400">
          {t("Coverage checks and calibrations")}
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {checks.isLoading && <div className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />}
      {checks.isError && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {t("Could not load the closure checks.")}
        </p>
      )}

      {list.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`closure-select-${gap.id}`} className="sr-only">{t("Closure check")}</label>
          <select
            id={`closure-select-${gap.id}`}
            value={selection === "new" ? "" : (selectedId ?? "")}
            onChange={(event) => { setSelection(event.target.value || null); setVisibleDocuments(DOCUMENT_PAGE_SIZE); }}
            className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs"
          >
            {selection === "new" && <option value="">{t("New check")}</option>}
            {list.map((item) => <option key={item.id} value={item.id}>{checkOptionLabel(item, statusNames)}</option>)}
          </select>
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setSelection("new")} disabled={selection === "new"}>
            <Plus className="h-3.5 w-3.5" />
            {t("New check")}
          </Button>
        </div>
      )}

      {showForm && (
        <ClosureStartForm
          gap={gap}
          onStarted={(started) => { setSelection(started.id); setVisibleDocuments(DOCUMENT_PAGE_SIZE); }}
        />
      )}

      {!showForm && selectedId && check.isLoading && <div className="h-32 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />}

      {!showForm && view && (
        <div className="space-y-4">
          <CheckHeader check={view} statusName={statusNames[view.status]} />

          {isClosureCheckRunning(view.status) && (
            <p className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300" role="status">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("Searching and screening in the background. This page updates by itself.")}
            </p>
          )}

          {view.status === "FAILED" && (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-relaxed text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
              <strong>{t("The check failed.")}</strong> {view.errorMessage} {t("The credits were refunded. You can start a new check.")}
            </p>
          )}

          <section className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{t("Search log")}</h4>
            <ClosureSearchLog queries={view.queries} />
          </section>

          {view.documents.length > 0 && (
            <section className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {t("Screening")} <Badge variant="outline" className="ml-1 rounded-full text-[10px]">{view.documents.length}</Badge>
              </h4>
              <ul className="space-y-2.5">
                {documents.slice(0, visibleDocuments).map((doc) => (
                  <ClosureDocumentCard key={doc.id} checkId={view.id} doc={doc} facets={view.facets} queries={view.queries} canReview={canReview} />
                ))}
              </ul>
              {documents.length > visibleDocuments && (
                <Button type="button" size="sm" variant="ghost" className="w-full text-xs" onClick={() => setVisibleDocuments((count) => count + DOCUMENT_PAGE_SIZE)}>
                  {t("Show more documents")}
                </Button>
              )}
            </section>
          )}

          {(view.status === "SCREENING" || view.status === "DECIDED") && (
            <section className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{t("Decision")}</h4>
              <ClosureDecisionSection check={view} gap={gap} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function checkOptionLabel(check: GapClosureCheckView, statusNames: Record<GapClosureCheckStatus, string>): string {
  const date = new Date(check.createdAt);
  const when = Number.isNaN(date.getTime()) ? check.createdAt : date.toLocaleString();
  const outcome = check.decision ? check.decision.replaceAll("_", " ") : statusNames[check.status];
  return `${when} · ${outcome}`;
}

function CheckHeader({ check, statusName }: { check: GapClosureCheckView; statusName: string }) {
  const { t } = useI18n();
  return (
    <div className="space-y-1.5 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-900/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="outline" className="text-[10px] uppercase">{statusName}</Badge>
        {check.decision && <ClosureStatusBadge status={check.decision} bound={check.bound} />}
      </div>
      <p className="leading-relaxed text-slate-800 dark:text-slate-100"><strong>{t("Question")}:</strong> {check.question}</p>
      {(check.yearFrom || check.yearTo) && (
        <p className="text-slate-500">{t("Year range")}: {check.yearFrom ?? "…"} – {check.yearTo ?? "…"}</p>
      )}
    </div>
  );
}
