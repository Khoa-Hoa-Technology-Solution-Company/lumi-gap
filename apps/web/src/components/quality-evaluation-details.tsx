import { useEffect, useRef } from "react";
import type { QualityCriterionId, QualityEvaluation, QualityRubric } from "@trend/shared-types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";

export function QualityScore({ score }: { score: number | null }) {
  const { t } = useI18n();
  return <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{score === null ? t("Insufficient evidence") : `${score}/5`}</span>;
}

function RubricCriterion({ criterion }: { criterion: QualityRubric["criteria"][number] }) {
  const { t } = useI18n();
  return <details className="group mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
    <summary className="cursor-pointer rounded-sm py-1 text-sm font-medium text-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 dark:text-indigo-300">{t("How this criterion is scored")}</summary>
    <dl className="mt-3 space-y-2 text-sm" data-no-i18n>
      {criterion.anchors.map((anchor) => <div key={anchor.score} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3"><dt className="font-semibold text-slate-700 dark:text-slate-300">{anchor.score}/5</dt><dd className="text-slate-600 dark:text-slate-400">{anchor.description}</dd></div>)}
    </dl>
  </details>;
}

export function QualityEvaluationDetails({ open, onOpenChange, mode, evaluation, rubric, selectedCriterion, returnFocus }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "rubric" | "assessment";
  evaluation: QualityEvaluation | null;
  rubric: QualityRubric;
  selectedCriterion?: QualityCriterionId;
  returnFocus?: HTMLElement | null;
}) {
  const { t, language } = useI18n();
  const sections = useRef(new Map<QualityCriterionId, HTMLElement>());
  const details = mode === "assessment" ? evaluation?.details : undefined;
  const activeRubric = details?.rubric ?? rubric;
  useEffect(() => {
    if (!open || !selectedCriterion) return;
    const frame = requestAnimationFrame(() => {
      const section = sections.current.get(selectedCriterion);
      section?.scrollIntoView({ block: "start" });
      section?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, selectedCriterion]);
  const criterionTitle = (id: QualityCriterionId) => activeRubric.criteria.find((item) => item.id === id)?.title;

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-4xl gap-0 p-0 motion-reduce:animate-none sm:p-0" overlayClassName="motion-reduce:animate-none" closeLabel={t("Close")} onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus?.focus(); }}>
      <DialogHeader className="border-b border-slate-200 px-5 py-6 pr-14 text-left dark:border-slate-800 sm:px-8">
        <DialogTitle className="text-xl leading-snug">{mode === "rubric" ? t("Evaluation criteria") : t("Detailed AI assessment")}</DialogTitle>
        <DialogDescription className="mt-2 leading-relaxed" data-no-i18n>{activeRubric.scope}</DialogDescription>
      </DialogHeader>
      <div className="min-w-0 space-y-7 px-5 py-6 text-sm leading-relaxed [overflow-wrap:anywhere] sm:px-8">
        {mode === "rubric" ? <>
          <p className="text-slate-600 dark:text-slate-400">{t("Each criterion has equal weight. Scores describe the supplied text. Missing evidence is marked separately and prevents an overall score.")}</p>
          {activeRubric.criteria.map((criterion) => <section key={criterion.id}>
            <h3 className="text-base font-semibold" data-no-i18n>{criterion.title}</h3>
            <p className="mt-1 text-slate-600 dark:text-slate-400" data-no-i18n>{criterion.question}</p>
            <RubricCriterion criterion={criterion} />
          </section>)}
        </> : !details ? <section className="space-y-3">
          <h3 className="font-semibold">{t("Older evaluation")}</h3>
          <p className="text-amber-800 dark:text-amber-200">{t("This older evaluation saved only scores and a short note. Re-evaluate to get evidence, criteria and practical next steps.")}</p>
          {evaluation && <><p data-no-i18n>{evaluation.rationale}</p><dl className="space-y-2">{([['relevance', 'Relevance'], ['groundedness', 'Groundedness'], ['completeness', 'Completeness']] as const).map(([key, label]) => <div key={key} className="flex items-center justify-between gap-4"><dt>{t(label)}</dt><dd><QualityScore score={evaluation[key]} /></dd></div>)}</dl></>}
        </section> : <>
          {evaluation?.freshness === "outdated" && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">{t("The source content or rubric has changed. Re-evaluate before relying on this assessment.")}</p>}
          <section>
            <h3 className="mb-2 text-base font-semibold">{t("What the assessment suggests")}</h3>
            <p data-no-i18n>{details.summary}</p>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400" data-no-i18n>{evaluation?.overall == null ? t("No overall score: at least one criterion has insufficient evidence.") : t("Summary score: {{score}}/5. Equal-weight mean of the three criteria.", { score: evaluation.overall.toFixed(1) })}</p>
          </section>
          <div className="divide-y divide-slate-200 border-y border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {details.criteria.map((item) => {
              const criterion = activeRubric.criteria.find((entry) => entry.id === item.id)!;
              return <section key={item.id} ref={(node) => { if (node) sections.current.set(item.id, node); else sections.current.delete(item.id); }} tabIndex={-1} className="scroll-mt-5 py-6 focus-visible:rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500">
                <div className="flex flex-wrap items-start justify-between gap-3"><h3 className="max-w-prose text-base font-semibold" data-no-i18n>{criterion.title}</h3><QualityScore score={item.score} /></div>
                <p className="mt-2 text-slate-500 dark:text-slate-400" data-no-i18n>{criterion.question}</p>
                {item.score !== null && <p className="mt-3 rounded-md bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-400"><span className="font-semibold">{t("Scoring reference")}: </span><span data-no-i18n>{criterion.anchors.find((anchor) => anchor.score === item.score)?.description}</span></p>}
                <h4 className="mb-1 mt-4 font-semibold">{t("Why this assessment")}</h4>
                <p data-no-i18n>{item.finding}</p>
                {item.evidence.length > 0 && <div className="mt-4 space-y-3"><h4 className="font-semibold">{t("Evidence from the supplied text")}</h4>{item.evidence.map((citation, index) => {
                  const source = details.sources.find((entry) => entry.id === citation.sourceId);
                  return <figure key={`${citation.sourceId}-${index}`} className="border-l-2 border-indigo-300 pl-4 dark:border-indigo-700">
                    <blockquote className="whitespace-pre-wrap text-slate-700 dark:text-slate-300" data-no-i18n>{citation.quote}</blockquote>
                    <figcaption className="mt-2 text-xs text-slate-500 dark:text-slate-400"><span data-no-i18n>{source?.title}</span>{source?.paperId && <> <a href={`/papers/${encodeURIComponent(source.paperId)}`} className="rounded-sm text-indigo-700 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 dark:text-indigo-300">{t("Open source paper")}</a></>}</figcaption>
                  </figure>;
                })}<p className="text-xs text-slate-500 dark:text-slate-400">{t("Quotes matched to the supplied text. This does not verify the scientific claim.")}</p></div>}
                {item.missingEvidence.length > 0 && <div className="mt-4"><h4 className="font-semibold text-amber-800 dark:text-amber-200">{t("What is still missing")}</h4><ul className="mt-1 list-disc space-y-1 pl-5" data-no-i18n>{item.missingEvidence.map((missing, index) => <li key={index}>{missing}</li>)}</ul></div>}
                <div className="mt-4"><h4 className="font-semibold">{t("How to use this finding")}</h4><p className="mt-1" data-no-i18n>{item.improvement}</p></div>
                <RubricCriterion criterion={criterion} />
              </section>;
            })}
          </div>
          <section>
            <h3 className="text-base font-semibold">{t("Recommended next steps")}</h3>
            <ol className="mt-3 space-y-5">{details.actions.map((action, index) => <li key={index} className="border-l-2 border-slate-300 pl-4 dark:border-slate-700">
              <div className="mb-1 flex flex-wrap gap-x-3 gap-y-1 text-xs"><span className="font-semibold text-indigo-700 dark:text-indigo-300">{t(`${action.priority} priority`)}</span><span className="text-slate-500 dark:text-slate-400" data-no-i18n>{criterionTitle(action.criterionId)}</span></div>
              <h4 className="font-semibold" data-no-i18n>{action.action}</h4>
              <p className="mt-1" data-no-i18n>{action.why}</p>
              <p className="mt-2 text-slate-600 dark:text-slate-400"><span className="font-semibold">{t("Expected output")}: </span><span data-no-i18n>{action.expectedOutcome}</span></p>
            </li>)}</ol>
          </section>
          <section>
            <h3 className="text-base font-semibold">{t("Questions to explore")}</h3>
            <p className="mt-1 text-slate-500 dark:text-slate-400">{t("These are research proposals to verify through further reading and study design.")}</p>
            <ul className="mt-3 space-y-4">{details.researchQuestions.map((item, index) => <li key={index}><h4 className="font-semibold" data-no-i18n>{item.question}</h4><p className="mt-1 text-slate-600 dark:text-slate-400" data-no-i18n>{item.why}</p></li>)}</ul>
          </section>
          <details className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <summary className="cursor-pointer rounded-sm py-1 font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500">{t("Sources read for this assessment")} ({details.sources.length})</summary>
            <ul className="mt-3 space-y-2 text-xs text-slate-600 dark:text-slate-400">{details.sources.map((source) => <li key={source.id}><span data-no-i18n>{source.title}</span><span className="ml-2" data-no-i18n>{t("{{count}} characters read", { count: source.charactersRead })}{source.truncated ? ` (${t("Excerpt only")})` : ""}</span></li>)}</ul>
          </details>
        </>}
        <section className="border-t border-slate-200 pt-4 dark:border-slate-800">
          <h3 className="font-semibold">{t("Limits of this assessment")}</h3>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-slate-600 dark:text-slate-400" data-no-i18n>{(details?.limitations ?? activeRubric.limitations).map((item, index) => <li key={index}>{item}</li>)}</ul>
        </section>
        {mode === "assessment" && evaluation && <footer className="flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400"><span>{t("Model")}: <span data-no-i18n>{evaluation.model}</span></span><span>{t("Evaluated")}: {new Date(evaluation.evaluatedAt ?? evaluation.createdAt).toLocaleString(language)}</span><span>{t("Rubric")}: <span data-no-i18n>{details?.rubric.version ?? t("Older evaluation")}</span></span></footer>}
      </div>
    </DialogContent>
  </Dialog>;
}
