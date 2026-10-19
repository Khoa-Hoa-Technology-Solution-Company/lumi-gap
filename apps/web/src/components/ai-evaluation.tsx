import { useEffect, useRef, useState } from "react";
import { ChevronRight, Loader2, Sparkles } from "lucide-react";
import { getQualityRubric, type QualityCriterionId, type QualityEvaluation, type QualityEvaluationTask, type QualityLanguage, type QualityTargetKind, type QualityView } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { QualityEvaluationDetails, QualityScore } from "@/components/quality-evaluation-details";
import { api } from "@/services/api-client";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";

interface AiEvaluationProps {
  targetKind: QualityTargetKind;
  targetId: string;
  enabled?: boolean;
  disabledHint?: string;
  /** List cards load a saved evaluation only after the reader requests it. */
  lazy?: boolean;
  className?: string;
  variant?: "default" | "flat";
}

/** A target change remounts the request state, so one paper's response cannot appear on another. */
export function AiEvaluation(props: AiEvaluationProps) {
  const { language } = useI18n();
  const evaluationLanguage: QualityLanguage = language === "vi" ? "vi" : "en";
  return <AiEvaluationBody key={`${props.targetKind}:${props.targetId}:${evaluationLanguage}`} {...props} language={evaluationLanguage} />;
}

function AiEvaluationBody({ targetKind, targetId, enabled = true, disabledHint, lazy = false, className, variant = "default", language }: AiEvaluationProps & { language: QualityLanguage }) {
  const { t } = useI18n();
  const [evaluation, setEvaluation] = useState<QualityEvaluation | null>(null);
  const [loading, setLoading] = useState(!lazy && enabled);
  const [starting, setStarting] = useState(false);
  const [task, setTask] = useState<QualityEvaluationTask | null>(null);
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [pollAttempt, setPollAttempt] = useState(0);
  const [dialogMode, setDialogMode] = useState<"rubric" | "assessment" | null>(null);
  const [selectedCriterion, setSelectedCriterion] = useState<QualityCriterionId>();
  const alive = useRef(true);
  const postRequest = useRef<AbortController>();
  const returnFocus = useRef<HTMLElement | null>(null);
  const rubric = getQualityRubric(targetKind, language);
  const pending = task?.status === "queued" || task?.status === "running";
  const busy = starting || pending;

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; postRequest.current?.abort(); };
  }, []);

  useEffect(() => {
    if (lazy || !enabled || !targetId) { setLoading(false); return; }
    const controller = new AbortController();
    setLoading(true);
    void api.get<{ success: boolean; data: QualityView }>(`/quality/${targetKind}/${targetId}`, { params: { language }, signal: controller.signal }).then((res) => {
      if (controller.signal.aborted) return;
      setEvaluation(res.data.data?.evaluation ?? null);
      const savedTask = res.data.data?.evaluationTask;
      setTask(savedTask ?? null);
      if (savedTask?.status === "failed") setError(savedTask.error ?? t("Failed to evaluate quality."));
    }).catch(() => {
      if (!controller.signal.aborted) setError(t("Unable to load the saved assessment. Try again before requesting a new evaluation."));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  // Translation changes must not restart a target request; the language is already part of the key.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKind, targetId, lazy, enabled, language]);

  useEffect(() => {
    if (!pending || !task?.jobId || pollError || !enabled) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let polls = 0;
    const poll = async () => {
      try {
        const response = await api.get<{ success: boolean; data: QualityEvaluationTask }>(`/quality/evaluation-jobs/${task.jobId}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        const next = response.data.data;
        if (next.status === "completed") {
          if (!next.evaluation) throw new Error("Missing assessment result");
          setEvaluation(next.evaluation); setTask(null);
          toast.success(t("AI evaluation completed."));
        } else if (next.status === "failed") {
          setTask(next); setError(next.error ?? t("Failed to evaluate quality."));
        } else {
          setTask(next);
          timer = setTimeout(poll, ++polls > 15 ? 5000 : 1800);
        }
      } catch {
        if (!controller.signal.aborted) setPollError(t("Unable to check progress. Your assessment may still be running."));
      }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  // Keep one polling loop per job; changing queued -> running must not duplicate requests.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.jobId, pending, pollAttempt, enabled]);

  const openAssessment = (criterion?: QualityCriterionId, opener?: HTMLElement) => { returnFocus.current = opener ?? null; setSelectedCriterion(criterion); setDialogMode("assessment"); };
  const handleEvaluate = async () => {
    if (busy || !enabled) return;
    setStarting(true); setError(""); setPollError("");
    const controller = new AbortController(); postRequest.current = controller;
    try {
      const response = await api.post<{ success: boolean; data: QualityEvaluationTask }>("/quality/evaluate", { targetKind, targetId, language, force: !!evaluation }, { signal: controller.signal });
      if (!alive.current || controller.signal.aborted) return;
      const next = response.data.data;
      if (next.status === "completed" && next.evaluation) {
        setEvaluation(next.evaluation); setTask(null); toast.success(t("AI evaluation completed."));
      } else { setTask(next); setPollAttempt((value) => value + 1); }
    } catch (err: unknown) {
      if (!alive.current || controller.signal.aborted) return;
      const message = (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message;
      setError(message || t("Failed to evaluate quality."));
    } finally { if (alive.current && !controller.signal.aborted) setStarting(false); }
  };

  const details = evaluation?.details;
  const isFlat = variant === "flat";
  return <section aria-label={t("AI Quality Evaluation")} aria-busy={busy || loading} className={cn("min-w-0 space-y-4 text-slate-800 [overflow-wrap:anywhere] dark:text-slate-200", !isFlat && "rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-[#121212] sm:p-6", className)}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2"><Sparkles aria-hidden="true" className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" /><h3 className="text-sm font-bold">{t("AI Quality Evaluation")}</h3><span className="text-xs text-slate-500 dark:text-slate-400">{t("AI Advisory")}</span></div>
      <Button onClick={() => void handleEvaluate()} disabled={busy || loading || !enabled} title={enabled ? undefined : disabledHint} variant="outline" className="min-h-10 gap-2 border-indigo-200 text-xs font-semibold text-indigo-700 dark:border-indigo-900 dark:text-indigo-300">
        {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />}{busy ? t("Evaluating...") : evaluation ? t("Re-evaluate") : t("Evaluate Quality")}
      </Button>
    </div>
    <div className="space-y-1"><p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400" data-no-i18n>{rubric.scope}</p><button type="button" onClick={(event) => { returnFocus.current = event.currentTarget; setSelectedCriterion(undefined); setDialogMode("rubric"); }} className="min-h-9 rounded-sm text-left text-xs font-medium text-indigo-700 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-indigo-300">{t("View criteria and scoring scale")}</button></div>
    {loading && <p role="status" className="text-sm text-slate-500">{t("Loading saved assessment...")}</p>}
    {!enabled ? <p className="text-sm text-slate-500 dark:text-slate-400">{disabledHint ?? t("Insufficient data for AI evaluation.")}</p> : <>
      {pending && <p role="status" className="rounded-lg bg-indigo-50 p-3 text-sm text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">{task.status === "queued" ? t("Assessment queued. You can leave and return here to see the result.") : t("Reading sources and preparing the assessment. You can return here later.")}</p>}
      {(error || pollError) && <div role="alert" className="space-y-2 text-sm text-amber-800 dark:text-amber-200"><p>{pollError || error}</p>{pollError && <Button variant="outline" size="sm" onClick={() => { setPollError(""); setPollAttempt((value) => value + 1); }}>{t("Check progress")}</Button>}</div>}
      {evaluation ? <div className="space-y-4">
        {evaluation.freshness === "outdated" && <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-200">{t("The source content or rubric has changed. Re-evaluate before relying on this assessment.")}</p>}
        {!details ? <><p className="text-xs leading-relaxed text-amber-800 dark:text-amber-200">{t("This older evaluation saved only scores and a short note. Re-evaluate to get evidence, criteria and practical next steps.")}</p><p className="text-sm leading-relaxed" data-no-i18n>{evaluation.rationale}</p></> : <>
          {details.rubric.language !== language && <p className="text-xs text-amber-800 dark:text-amber-200">{t("This assessment was saved in another language. Re-evaluate to use your current language.")}</p>}
          <p className="text-sm leading-relaxed" data-no-i18n>{details.summary}</p>
          <div className="divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-800 dark:border-slate-800">{details.criteria.map((item) => <button type="button" key={item.id} onClick={(event) => openAssessment(item.id, event.currentTarget)} aria-haspopup="dialog" className="flex w-full items-start gap-3 rounded-sm py-3 text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 dark:hover:bg-slate-900">
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold" data-no-i18n>{details.rubric.criteria.find((criterion) => criterion.id === item.id)?.title}</p><p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400" data-no-i18n>{item.finding}</p></div><QualityScore score={item.score} /><ChevronRight aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
          </button>)}</div>
          {details.actions[0] && <div><h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t("Start with this step")}</h4><p className="mt-1 text-sm leading-relaxed" data-no-i18n>{details.actions[0].action}</p></div>}
          <p className="text-xs text-slate-500 dark:text-slate-400" data-no-i18n>{evaluation.overall === null ? t("No overall score: at least one criterion has insufficient evidence.") : t("Summary score: {{score}}/5. Equal-weight mean of the three criteria.", { score: evaluation.overall.toFixed(1) })}</p>
        </>}
        <Button type="button" variant="outline" onClick={(event) => openAssessment(undefined, event.currentTarget)} aria-haspopup="dialog" className="min-h-11 w-full justify-between gap-2 text-sm sm:w-auto">{t("View detailed assessment")}<ChevronRight aria-hidden="true" className="h-4 w-4" /></Button>
      </div> : !loading && <div className="space-y-3"><p className="text-sm text-slate-600 dark:text-slate-400">{t("Get a reading assessment with evidence, missing information and practical research next steps.")}</p><ul className="list-disc space-y-1 pl-5 text-xs text-slate-500 dark:text-slate-400" data-no-i18n>{rubric.criteria.map((criterion) => <li key={criterion.id}>{criterion.title}</li>)}</ul></div>}
    </>}
    <QualityEvaluationDetails open={dialogMode !== null} onOpenChange={(open) => { if (!open) setDialogMode(null); }} mode={dialogMode ?? "rubric"} evaluation={evaluation} rubric={rubric} selectedCriterion={selectedCriterion} returnFocus={returnFocus.current} />
  </section>;
}
