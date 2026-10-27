import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Download, Gavel, Loader2, Scale, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { GapClosureCheckView, ResearchGapItem } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import {
  abstainReasonKey,
  apiErrorMessage,
  boundEquation,
  buildBoundArithmetic,
  calibrationOptionLabel,
  countPendingDocuments,
  coverageOptionLabel,
  formatCount,
  formatRate,
  formatSum,
} from "../closure-format";
import {
  useClosureCalibrations,
  useClosureDossier,
  useCoverageChecks,
  useDecideGapClosure,
  useDownloadClosureDossier,
} from "../hooks/use-gap-closure";
import { ClosureStatusBadge } from "./closure-status-badge";

const SELECT_CLASS = "h-9 w-full rounded-md border bg-background px-2 text-xs";

interface ClosureDecisionSectionProps {
  check: GapClosureCheckView;
  gap: Pick<ResearchGapItem, "id" | "topic" | "projectId" | "canManage">;
}

/** Decide button with coverage and calibration selectors, then the result card with the arithmetic. */
export function ClosureDecisionSection({ check, gap }: ClosureDecisionSectionProps) {
  const { t } = useI18n();
  const decide = useDecideGapClosure(check.id);
  const coverageList = useCoverageChecks({ topic: gap.topic, projectId: gap.projectId });
  const calibrations = useClosureCalibrations();
  const [coverageCheckId, setCoverageCheckId] = useState("");
  const [calibrationId, setCalibrationId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canDecide = (check.status === "SCREENING" || check.status === "DECIDED") && gap.canManage !== false;
  const pending = countPendingDocuments(check.documents);
  const computedCalibrations = (calibrations.data ?? []).filter((item) => item.status === "COMPUTED");

  const runDecision = async () => {
    setError(null);
    try {
      const result = await decide.mutateAsync({
        coverageCheckId: coverageCheckId || undefined,
        calibrationId: calibrationId || undefined,
      });
      toast.success(result.decision === "CLOSED" ? t("Decision recorded: this question is already answered.") : t("Decision recorded."));
    } catch (err) {
      const message = apiErrorMessage(err, t("Could not record the decision."));
      setError(message);
      toast.error(message);
    }
  };

  return (
    <div className="space-y-4">
      {canDecide && (
        <div className="space-y-3 rounded-2xl border border-slate-200/70 p-4 dark:border-slate-800">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200">
            <Gavel className="h-4 w-4 text-cyan-600" />
            {check.status === "DECIDED" ? t("Decide again") : t("Decide")}
          </div>
          {pending > 0 && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
              {t("{{count}} document(s) still wait for a person. Deciding now ends in Needs review.", { count: pending })}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`coverage-${check.id}`} className="text-xs">{t("Coverage check")}</Label>
              <select id={`coverage-${check.id}`} value={coverageCheckId} onChange={(event) => setCoverageCheckId(event.target.value)} className={SELECT_CLASS}>
                <option value="">{t("Latest for this topic")}</option>
                {(coverageList.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {coverageOptionLabel(item)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`calibration-${check.id}`} className="text-xs">{t("Calibration")}</Label>
              <select id={`calibration-${check.id}`} value={calibrationId} onChange={(event) => setCalibrationId(event.target.value)} className={SELECT_CLASS}>
                <option value="">{t("Latest computed (same judge kind)")}</option>
                {computedCalibrations.map((item) => (
                  <option key={item.id} value={item.id}>
                    {calibrationOptionLabel(item)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {(coverageList.data?.length === 0 || computedCalibrations.length === 0) && (
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              {t("Without a coverage check and a computed calibration the check can only end in Needs review.")}{" "}
              <Link to="/gap-closure" className="font-semibold text-cyan-700 hover:underline dark:text-cyan-400">{t("Open coverage and calibrations")}</Link>
            </p>
          )}
          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
          <Button type="button" size="sm" className="h-8 gap-1.5 text-xs" disabled={decide.isPending} onClick={() => void runDecision()}>
            {decide.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scale className="h-3.5 w-3.5" />}
            {t("Apply the decision rule")}
          </Button>
        </div>
      )}
      {!canDecide && check.status === "SCREENING" && (
        <p className="rounded-xl border border-dashed border-slate-200 p-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          {t("Only the creator of the gap or the owner of its project can record the decision.")}
        </p>
      )}

      {check.status === "DECIDED" && check.decision && <ClosureResultCard check={check} />}
    </div>
  );
}

/** The decision with every number behind it, a witness quote for CLOSED, and the dossier export. */
export function ClosureResultCard({ check }: { check: GapClosureCheckView }) {
  const { t } = useI18n();
  const dossier = useClosureDossier(check.id, check.status === "DECIDED", check.decidedAt ?? check.updatedAt);
  const download = useDownloadClosureDossier(check.id);
  const arithmetic = buildBoundArithmetic(check, dossier.data?.coverage, dossier.data?.calibration);
  const sum = formatSum(arithmetic);
  const witness = check.witnessDocumentId ? check.documents.find((doc) => doc.id === check.witnessDocumentId) : undefined;
  const witnessQuote = witness ? (witness.humanQuote ?? witness.aiQuote) : undefined;
  const decision = check.decision;
  const confidence = arithmetic.confidencePercent;
  const toneClass =
    decision === "CLOSED"
      ? "border-rose-300/60 bg-rose-50/60 dark:border-rose-500/30 dark:bg-rose-500/5"
      : decision === "OPEN_CERTIFIED"
        ? "border-emerald-300/60 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/5"
        : "border-amber-300/60 bg-amber-50/60 dark:border-amber-500/30 dark:bg-amber-500/5";

  const exportDossier = async (format: "markdown" | "json") => {
    try {
      await download.mutateAsync(format);
    } catch (err) {
      toast.error(apiErrorMessage(err, t("Could not export the dossier.")));
    }
  };

  return (
    <div className={cn("space-y-3 rounded-2xl border p-4 text-xs", toneClass)} aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-slate-900 dark:text-white">{t("Decision")}</h4>
        <ClosureStatusBadge status={decision} bound={check.bound} />
      </div>

      {decision === "CLOSED" && (
        <div className="space-y-1.5">
          <p className="leading-relaxed text-slate-700 dark:text-slate-300">{t("A document answers this question, so it is not an open gap.")}</p>
          {witness && (
            <blockquote className="space-y-1 rounded-lg border-l-4 border-rose-400 bg-white/70 p-3 dark:bg-slate-900/40">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">{t("Witness quote")}</span>
              {witnessQuote && <p className="italic leading-relaxed">{witnessQuote}</p>}
              <span className="block font-semibold">{witness.title}{witness.publicationYear ? ` (${witness.publicationYear})` : ""}</span>
            </blockquote>
          )}
        </div>
      )}

      {decision === "OPEN_CERTIFIED" && (
        <p className="leading-relaxed text-slate-700 dark:text-slate-300">
          {t("No document answers this question, no search failed, and the chance that a closed question was wrongly called open is within the allowed maximum.")}
        </p>
      )}

      {decision === "ABSTAIN" && check.decisionReasons.length > 0 && (
        <div className="space-y-1.5">
          <p className="font-semibold text-slate-700 dark:text-slate-200">{t("The check did not certify this gap because:")}</p>
          <ul className="list-disc space-y-1 pl-5 leading-relaxed text-slate-700 dark:text-slate-300">
            {check.decisionReasons.map((reason) => <li key={reason}>{t(abstainReasonKey(reason))}</li>)}
          </ul>
        </div>
      )}

      <div className="space-y-2 rounded-xl bg-white/70 p-3 dark:bg-slate-900/40">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">{t("The arithmetic")}</span>
        <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1.5 leading-relaxed">
          <dt className="font-bold">epsHat</dt>
          <dd>
            {arithmetic.epsHat
              ? t("{{value}} (upper bound of {{ratio}} calibration questions missed)", { value: formatRate(arithmetic.epsHat.value), ratio: formatCount(arithmetic.epsHat.misses, arithmetic.epsHat.n) })
              : t("not available: no computed calibration")}
          </dd>
          <dt className="font-bold">pHat</dt>
          <dd>
            {arithmetic.pHat
              ? t("{{value}} (upper bound of {{ratio}} reference papers missing from the corpus and OpenAlex)", { value: formatRate(arithmetic.pHat.value), ratio: formatCount(arithmetic.pHat.x, arithmetic.pHat.m) })
              : arithmetic.mode === "IN_SITU" ? t("not needed: in-situ calibration") : t("not available: no coverage check")}
            {arithmetic.pHat && arithmetic.mode === "IN_SITU" && ` ${t("(not part of B: the in-situ calibration already counts answers missing from the sources)")}`}
          </dd>
          <dt className="font-bold">B</dt>
          <dd>
            {sum && arithmetic.max !== undefined ? (
              <span className={cn("font-semibold", arithmetic.withinMax ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400")}>
                {boundEquation(sum, arithmetic)}
                {arithmetic.withinMax ? <CheckCircle2 className="ml-1 inline h-3.5 w-3.5" /> : <XCircle className="ml-1 inline h-3.5 w-3.5" />}
              </span>
            ) : (
              arithmetic.mode === "IN_SITU" ? t("not available: no computed calibration") : t("not available: both numbers are needed")
            )}
          </dd>
        </dl>
        {confidence !== undefined && (
          <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            {arithmetic.mode === "IN_SITU"
              ? t("In-situ calibration: the calibration questions were searched in the same sources, so B = epsHat holds with {{confidence}}% confidence. B is the largest chance that a closed question is wrongly called open.", { confidence })
              : t("Both upper bounds hold with {{confidence}}% confidence each. B is the largest chance that a closed question is wrongly called open.", { confidence })}
          </p>
        )}
      </div>

      <ul className="space-y-1 leading-relaxed text-slate-700 dark:text-slate-300">
        <li>
          {check.corroborated
            ? t("Corroborated: another paper states this question as a limitation or future work.")
            : t("Not corroborated: no other paper states this question as a limitation or future work.")}
        </li>
        {check.judgeKind && (
          <li>{check.judgeKind === "HUMAN" ? t("Labels counted in the decision: confirmed by a person.") : t("Labels counted in the decision: from the AI screening.")}</li>
        )}
        {dossier.data?.interRaterKappa && (
          <li>{t("Agreement between two reviewers (Cohen's kappa): {{kappa}} over {{documents}} documents.", { kappa: dossier.data.interRaterKappa.kappa.toFixed(2), documents: dossier.data.interRaterKappa.documents })}</li>
        )}
      </ul>

      {dossier.data?.arithmetic && dossier.data.arithmetic.length > 0 && (
        <details className="text-[11px] text-slate-600 dark:text-slate-400">
          <summary className="cursor-pointer font-semibold">{t("Arithmetic as written in the dossier")}</summary>
          <ul className="mt-1.5 space-y-1 font-mono">
            {dossier.data.arithmetic.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </details>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={download.isPending} onClick={() => void exportDossier("markdown")}>
          {download.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {t("Export dossier (Markdown)")}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-8 text-xs" disabled={download.isPending} onClick={() => void exportDossier("json")}>
          {t("Export dossier (JSON)")}
        </Button>
      </div>
    </div>
  );
}
