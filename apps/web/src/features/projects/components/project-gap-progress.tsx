import { Check, Layers3 } from "lucide-react";
import type { GapAnalysisResult } from "@trend/shared-types";
import { useI18n } from "@/i18n";

const steps = ["Analyze source papers", "Compare findings", "Identify research gaps"] as const;
const stageCopy = {
  submitting: ["Starting analysis", "Sending your selected papers for analysis."],
  queued: ["Waiting for analysis", "Your analysis is queued. It will start when a worker is available."],
  extracting: ["Analyzing source papers", "Reading the available sources for methods, findings and limitations."],
  synthesizing: ["Comparing findings across papers", "The papers have been read. Now we are comparing shared findings, differences and unanswered questions."],
  generating: ["Generating candidate research gaps", "Turning the comparison into research directions linked to your sources."],
} as const;

/** Stage changes and counts come from the worker. These steps are not a time estimate. */
export function ProjectGapProgress({ analysis, selectedCount, submitting = false }: { analysis?: GapAnalysisResult | null; selectedCount: number; submitting?: boolean }) {
  const { t } = useI18n();
  const stage = analysis?.status === "queued" ? "queued" : analysis?.discovery?.stage;
  const activeStage = submitting ? "submitting" : stage && stage !== "ready" ? stage : "queued";
  const waiting = activeStage === "queued" || activeStage === "submitting";
  const activeStep = activeStage === "generating" ? 2 : activeStage === "synthesizing" ? 1 : 0;
  const total = Math.max(0, analysis?.discovery?.total ?? analysis?.selectedPaperIds?.length ?? selectedCount);
  const completed = waiting ? 0 : Math.max(0, Math.min(total, analysis?.discovery?.completed ?? 0));
  const [title, description] = stageCopy[activeStage];

  return <section className="gap-analysis-progress" aria-label={t("Analysis progress")} data-stage={activeStage}>
    <div className="gap-analysis-progress-heading">
      <span className="gap-analysis-progress-kicker"><Layers3 size={16} aria-hidden="true" />{t("Analysis progress")}</span>
      <span className="gap-analysis-progress-phase">{t(activeStage === "submitting" ? "Starting analysis" : activeStage === "queued" ? "Queued" : "Step {{step}} of {{total}}", { step: activeStep + 1, total: steps.length })}</span>
    </div>
    <div className="gap-analysis-progress-copy" role="status" aria-live="polite" aria-atomic="true">
      <h3>{t(title)}</h3>
      <p>{t(description)}</p>
    </div>
    <ol className="gap-analysis-steps" aria-label={t("Analysis stages")}>
      {steps.map((label, index) => {
        const state = index < activeStep ? "complete" : index === activeStep ? "current" : "upcoming";
        return <li key={label} data-state={state} aria-current={state === "current" ? "step" : undefined}>
          <span className="gap-analysis-step-marker" aria-hidden="true">{state === "complete" ? <Check size={16} strokeWidth={2.5} /> : index + 1}</span>
          <div><strong>{t(label)}</strong><span>{index === 0 && !waiting
            ? t("{{done}} / {{total}} papers analyzed", { done: completed, total })
            : t(state === "complete" ? "Completed" : state === "upcoming" ? "Up next" : activeStage === "submitting" ? "Starting analysis" : activeStage === "queued" ? "Waiting for analysis" : "In progress")}</span></div>
        </li>;
      })}
    </ol>
    {activeStage === "extracting" && total > 0 && <div className="gap-analysis-reading" role="progressbar" aria-label={t("Source papers analyzed")} aria-valuemin={0} aria-valuemax={total} aria-valuenow={completed} aria-valuetext={t("{{done}} / {{total}} papers analyzed", { done: completed, total })}>
      <span style={{ transform: `scaleX(${completed / total})` }} />
    </div>}
    <p className="gap-analysis-progress-footnote">{t(submitting ? "Keep this page open until your request is accepted." : "You can leave this page. Your team can follow progress here.")}</p>
  </section>;
}
