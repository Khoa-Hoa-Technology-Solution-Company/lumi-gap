import { useEffect, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/services/api-client";
import { toast } from "sonner";
import { useI18n } from "@/i18n";

type TargetKind = "paper" | "report" | "gap";

interface Evaluation {
  relevance: number;
  groundedness: number;
  completeness: number;
  overall: number;
  rationale: string;
}

/**
 * On-demand LLM-as-judge block (relevance / groundedness / completeness). Advisory —
 * the score never affects tier/credit/approval. Reused across paper / report / gap
 * (the backend `/quality/evaluate` + `/quality/:kind/:id` are kind-agnostic).
 */export function AiEvaluation({
  targetKind,
  targetId,
  enabled = true,
  disabledHint,
  lazy = false,
  className,
  variant = "default",
}: {
  targetKind: TargetKind;
  targetId: string;
  enabled?: boolean;
  disabledHint?: string;
  /** In a list (e.g. gap cards), skip the on-mount fetch so N cards don't fire N
   *  GETs — the cached score loads only when the user clicks "AI đánh giá". */
  lazy?: boolean;
  className?: string;
  variant?: "default" | "flat";
}) {
  const { t } = useI18n();
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [loading, setLoading] = useState(!lazy);
  const [evaluating, setEvaluating] = useState(false);

  useEffect(() => {
    if (lazy || !targetId || !enabled) {
      setLoading(false);
      return;
    }
    api
      .get(`/quality/${targetKind}/${targetId}`)
      .then((res) => {
        if (res.data.success) setEvaluation(res.data.data?.evaluation ?? null);
      })
      .catch(() => {}) // no cached eval / not accessible — show the empty state
      .finally(() => setLoading(false));
  }, [targetKind, targetId, lazy, enabled]);

  const handleEvaluate = async () => {
    setEvaluating(true);
    try {
      // force a real re-judge when an eval already exists ("Đánh giá lại"); without
      // force, evaluate() just returns the cached doc.
      const res = await api.post("/quality/evaluate", {
        targetKind,
        targetId,
        force: !!evaluation,
      });
      if (res.data.success) {
        setEvaluation(res.data.data);
        toast.success(t("AI evaluation completed."));
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || t("Failed to evaluate quality."));
    } finally {
      setEvaluating(false);
    }
  };

  if (loading) return null;

  const dims = evaluation
    ? [
        { label: t("Relevance"), value: evaluation.relevance },
        { label: t("Groundedness"), value: evaluation.groundedness },
        { label: t("Completeness"), value: evaluation.completeness },
      ]
    : [];

  const isFlat = variant === "flat";

  return (
    <div
      className={
        isFlat
          ? `space-y-3 ${className ?? ""}`
          : `rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#121212] p-6 space-y-4 ${className ?? ""}`
      }
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
          <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">{t("AI Quality Evaluation")}</h3>
          <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded-full">
            {t("AI Advisory")}
          </span>
        </div>
        <Button
          onClick={handleEvaluate}
          disabled={evaluating || !enabled}
          title={enabled ? undefined : disabledHint}
          variant={isFlat ? "outline" : "default"}
          className={
            isFlat
              ? "h-8 px-3 rounded-lg text-xs font-semibold border-indigo-200 dark:border-indigo-900/50 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 gap-1.5"
              : "h-9 px-4 gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold"
          }
        >
          {evaluating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {evaluation ? t("Re-evaluate") : t("Evaluate Quality")}
        </Button>
      </div>

      {!enabled ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {disabledHint ?? t("Insufficient data for AI evaluation.")}
        </p>
      ) : evaluation ? (
        <div className="space-y-3">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
              {evaluation.overall.toFixed(1)}
            </span>
            <span className="text-[11px] text-slate-500">/ 5 — {t("Abstract-only advisory score")}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {dims.map((d) => (
              <div key={d.label} className="rounded-xl bg-slate-50/50 dark:bg-zinc-900/30 border border-slate-100/50 dark:border-zinc-800/30 p-2 text-center">
                <div className="text-base font-black text-slate-800 dark:text-slate-200">{d.value}/5</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{d.label}</div>
              </div>
            ))}
          </div>
          {evaluation.rationale && (
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed border-l-2 border-indigo-200 dark:border-indigo-800 pl-3 italic">
              {evaluation.rationale}
            </p>
          )}
          <p className="text-[10px] text-slate-400">
            {t("Based on title and abstract only. Advisory score; it does not affect indexing decisions.")}
          </p>
        </div>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {t('No AI evaluation yet. Click "Evaluate Quality" to run Gemini judge.')}
        </p>
      )}
    </div>
  );
}
