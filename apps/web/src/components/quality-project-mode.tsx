import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import type { IProject, QualityEvaluationTask, QualityLanguage, QualityProjectEvaluation, QualityView } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { qualityErrorMessage, qualityRequestError } from "@/components/quality-errors";
import { projectsApi } from "@/features/projects/api/projects.api";
import { api } from "@/services/api-client";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";

const VERDICT_LABEL = { core: "Core paper", supporting: "Supporting paper", background: "Background reading", not_relevant: "Not relevant to this project" } as const;
const VERDICT_STYLE = {
  core: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200",
  supporting: "bg-indigo-100 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-200",
  background: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
  not_relevant: "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200",
} as const;
const KIND_LABEL = { method: "Reusable method", dataset: "Reusable dataset", measure: "Reusable measure", framework: "Reusable framework" } as const;
const SCREENING_LABEL = { include: "Suggest including", exclude: "Suggest excluding", undecided: "Screening undecided" } as const;

const paperIdOf = (target: unknown): string => typeof target === "object" && target !== null ? String((target as { _id?: string; id?: string })._id ?? (target as { id?: string }).id ?? "") : String(target ?? "");
const projectIdOf = (project: IProject) => project._id;

function Quote({ quote }: { quote: string }) {
  return <blockquote className="mt-1 whitespace-pre-wrap border-l-2 border-indigo-300 pl-3 text-xs text-slate-600 dark:border-indigo-700 dark:text-slate-400" data-no-i18n>{quote}</blockquote>;
}

export function QualityProjectResult({ result, paperId, inProject, onAdded }: { result: QualityProjectEvaluation; paperId: string; inProject: boolean; onAdded: () => void }) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const a = result.assessment;
  const add = async () => {
    setAdding(true);
    try { await projectsApi.addPaper(result.projectId, { paperId }); setAdded(true); onAdded(); toast.success(t("Added the paper to the project.")); }
    catch (err: unknown) {
      // The project list omits paper links, so "already added" is only known from the 409.
      if ((err as { response?: { status?: number } }).response?.status === 409) { setAdded(true); onAdded(); toast.info(t("This paper is already in the project.")); }
      else toast.error(t("Failed to add the paper to the project."));
    }
    finally { setAdding(false); }
  };
  return <div className="space-y-5">
    {result.freshness === "outdated" && <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-200">{t("The paper or the project plan changed. Re-evaluate before relying on this assessment.")}</p>}
    <section aria-labelledby="project-verdict-title" className="space-y-2">
      <h4 id="project-verdict-title" className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t("Fit with this project")}</h4>
      <p className={cn("inline-block rounded-md px-2.5 py-1 text-sm font-semibold", VERDICT_STYLE[a.verdict])}>{t(VERDICT_LABEL[a.verdict])}</p>
      <p className="text-sm leading-relaxed" data-no-i18n>{a.verdictReason}</p>
    </section>
    {a.questionLinks.length > 0 && <section className="space-y-3"><h4 className="text-sm font-semibold">{t("Plan items this paper helps with")}</h4>
      <ul className="space-y-4">{a.questionLinks.map((link, index) => <li key={index} className="text-sm leading-relaxed"><p className="font-semibold" data-no-i18n>{link.planItem}</p><p data-no-i18n>{link.contribution}</p>{link.evidence.map((item, i) => <Quote key={i} quote={item.quote} />)}</li>)}</ul></section>}
    {a.reusable.length > 0 && <section className="space-y-3"><h4 className="text-sm font-semibold">{t("Reusable methods and data")}</h4>
      <ul className="space-y-3">{a.reusable.map((item, index) => <li key={index} className="text-sm leading-relaxed"><span className="font-semibold">{t(KIND_LABEL[item.kind])}: </span><span data-no-i18n>{item.description}</span>{item.evidence && <Quote quote={item.evidence.quote} />}</li>)}</ul></section>}
    {a.tensions.length > 0 && <section className="space-y-3"><h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200">{t("Tensions with your plan")}</h4>
      <ul className="space-y-3">{a.tensions.map((item, index) => <li key={index} className="text-sm leading-relaxed"><span data-no-i18n>{item.description}</span>{item.evidence.map((e, i) => <Quote key={i} quote={e.quote} />)}</li>)}</ul></section>}
    <section className="space-y-2"><h4 className="text-sm font-semibold">{t("Screening suggestion")}</h4>
      <p className="text-sm leading-relaxed"><span className="font-semibold">{t(SCREENING_LABEL[a.screening.suggestion])}. </span><span data-no-i18n>{a.screening.reason}</span></p>
      {a.screening.criteria.length > 0 && <div><p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t("Your criteria used")}</p><ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-600 dark:text-slate-400" data-no-i18n>{a.screening.criteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul></div>}
    </section>
    {a.actions[0] && <div><h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t("Start with this step")}</h4><p className="mt-1 text-sm leading-relaxed" data-no-i18n>{a.actions[0].action}</p></div>}
    {inProject || added ? <p role="status" className="text-sm font-medium text-emerald-800 dark:text-emerald-300">{t("Added to project")}</p>
      : <Button type="button" variant="outline" onClick={() => void add()} disabled={adding} className="min-h-11 w-full gap-2 text-sm sm:w-auto">{adding && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />}{adding ? t("Adding...") : t("Add to project")}</Button>}
  </div>;
}

/** Opt-in project mode: how one paper serves one project's research plan. */
export function QualityProjectMode({ paperId, language, enabled }: { paperId: string; language: QualityLanguage; enabled: boolean }) {
  const { t } = useI18n();
  const [projects, setProjects] = useState<IProject[] | null>(null);
  const [projectsError, setProjectsError] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [addedTo, setAddedTo] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    void projectsApi.list().then((items) => { if (alive) setProjects(items); }).catch(() => { if (alive) setProjectsError(true); });
    return () => { alive = false; };
  }, []);

  if (projectsError) return <p role="alert" className="text-sm text-amber-800 dark:text-amber-200">{t("Unable to load your projects.")}</p>;
  if (!projects) return <p role="status" className="text-sm text-slate-500">{t("Loading your projects...")}</p>;
  if (projects.length === 0) return <div className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800"><p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">{t("Project mode compares a paper with your project's research plan. You have no project yet.")}</p><Button asChild variant="outline" className="min-h-11"><Link to="/projects">{t("Create a project")}</Link></Button></div>;
  const selected = projects.find((project) => projectIdOf(project) === projectId);
  const inProject = Boolean(selected && (addedTo.includes(projectId) || selected.papers?.some((paper) => paperIdOf(paper.targetId) === paperId)));
  return <div className="space-y-4">
    <label className="block space-y-1"><span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t("Choose a project")}</span>
      <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-slate-700 dark:bg-slate-900">
        <option value="">{t("Choose a project")}</option>{projects.map((project) => <option key={projectIdOf(project)} value={projectIdOf(project)}>{project.title}</option>)}
      </select></label>
    {selected ? <QualityProjectBody key={projectId} paperId={paperId} projectId={projectId} language={language} enabled={enabled} inProject={inProject} onAdded={() => setAddedTo((ids) => [...ids, projectId])} />
      : <p className="text-sm text-slate-600 dark:text-slate-400">{t("Select a project to see how this paper serves its research plan.")}</p>}
  </div>;
}

function QualityProjectBody({ paperId, projectId, language, enabled, inProject, onAdded }: { paperId: string; projectId: string; language: QualityLanguage; enabled: boolean; inProject: boolean; onAdded: () => void }) {
  const { t } = useI18n();
  const [result, setResult] = useState<QualityProjectEvaluation | null>(null);
  const [task, setTask] = useState<QualityEvaluationTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [pollAttempt, setPollAttempt] = useState(0);
  const alive = useRef(true);
  const pending = task?.status === "queued" || task?.status === "running";
  const busy = starting || pending;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useEffect(() => {
    const controller = new AbortController();
    void api.get<{ success: boolean; data: QualityView }>(`/quality/paper/${paperId}`, { params: { language, projectId }, signal: controller.signal }).then((res) => {
      if (controller.signal.aborted) return;
      setResult(res.data.data?.projectEvaluation ?? null);
      const saved = res.data.data?.projectEvaluationTask;
      setTask(saved ?? null);
      if (saved?.status === "failed") setError(qualityErrorMessage(saved.errorCode, saved.error ?? t("Failed to evaluate quality."), t));
    }).catch(() => { if (!controller.signal.aborted) setError(t("Unable to load the saved assessment. Try again before requesting a new evaluation.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  // Translation changes must not restart the request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId, projectId, language]);

  useEffect(() => {
    if (!pending || !task?.jobId || pollError) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>; let polls = 0;
    const poll = async () => {
      try {
        const response = await api.get<{ success: boolean; data: QualityEvaluationTask }>(`/quality/evaluation-jobs/${task.jobId}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        const next = response.data.data;
        if (next.status === "completed") {
          if (!next.projectEvaluation) throw new Error("Missing project assessment");
          setResult(next.projectEvaluation); setTask(null); toast.success(t("AI evaluation completed."));
        } else if (next.status === "failed") { setTask(next); setError(qualityErrorMessage(next.errorCode, next.error ?? t("Failed to evaluate quality."), t)); }
        else { setTask(next); timer = setTimeout(poll, ++polls > 15 ? 5000 : 1800); }
      } catch { if (!controller.signal.aborted) setPollError(t("Unable to check progress. Your assessment may still be running.")); }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  // One polling loop per job.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.jobId, pending, pollAttempt]);

  const evaluate = async () => {
    if (busy || !enabled) return;
    setStarting(true); setError(""); setPollError("");
    try {
      const response = await api.post<{ success: boolean; data: QualityEvaluationTask }>("/quality/evaluate", { targetKind: "paper", targetId: paperId, projectId, language, force: !!result });
      if (!alive.current) return;
      const next = response.data.data;
      if (next.status === "completed" && next.projectEvaluation) { setResult(next.projectEvaluation); setTask(null); toast.success(t("AI evaluation completed.")); }
      else { setTask(next); setPollAttempt((value) => value + 1); }
    } catch (err: unknown) {
      if (!alive.current) return;
      setError(qualityRequestError(err, t("Failed to evaluate quality."), t));
    } finally { if (alive.current) setStarting(false); }
  };

  return <div className="space-y-4" aria-busy={busy || loading}>
    <Button type="button" onClick={() => void evaluate()} disabled={busy || loading || !enabled} variant="outline" className="min-h-11 w-full gap-2 border-indigo-200 text-sm font-semibold text-indigo-700 dark:border-indigo-900 dark:text-indigo-300 sm:w-auto">
      {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />}{busy ? t("Evaluating...") : result ? t("Re-evaluate") : t("Evaluate for this project")}
    </Button>
    {loading && <p role="status" className="text-sm text-slate-500">{t("Loading saved assessment...")}</p>}
    {pending && <p role="status" className="rounded-lg bg-indigo-50 p-3 text-sm text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200">{task.status === "queued" ? t("Assessment queued. You can leave and return here to see the result.") : t("Reading sources and preparing the assessment. You can return here later.")}</p>}
    {(error || pollError) && <div role="alert" className="space-y-2 text-sm text-amber-800 dark:text-amber-200"><p>{pollError || error}</p>{pollError && <Button variant="outline" size="sm" onClick={() => { setPollError(""); setPollAttempt((value) => value + 1); }}>{t("Check progress")}</Button>}</div>}
    {result && <QualityProjectResult result={result} paperId={paperId} inProject={inProject} onAdded={onAdded} />}
  </div>;
}
