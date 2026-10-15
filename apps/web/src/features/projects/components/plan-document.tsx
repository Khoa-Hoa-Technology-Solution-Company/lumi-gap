import { useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { PlanQuestion, PlanSection, ResearchApproach, ResearchPlanContent } from "@trend/shared-types";
import { ArrowDown, ArrowUp, MessageSquare, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { gapsApi } from "@/features/gaps/api/gaps.api";
import { useWorkspaceResource } from "../hooks/use-workspace";
import { approachLabels, projectSectionHref, WorkspaceArtifactLink, WorkspaceArtifactPicker, WorkspaceError, WorkspaceLoading } from "./workspace-common";
import { PlanSectionFeedback } from "./plan-section-feedback";
import { planSectionLabels } from "./plan-section-labels";

type Props = { projectId: string; content: ResearchPlanContent; editable: boolean; revisionId?: string; version: number; archived: boolean; mentor: boolean; field: <K extends keyof ResearchPlanContent>(key: K, value: ResearchPlanContent[K]) => void };
export function PlanDocument({ projectId, content, editable, revisionId, version, archived, mentor, field }: Props) {
  const { t } = useI18n(); const [section, setSection] = useState<PlanSection | null>(null); const [params] = useSearchParams();
  const text = (key: "problem" | "scope" | "methodology" | "searchStrategy", rows: number, maxLength: number, placeholder: string) => editable ? <textarea id={`plan-${key}`} aria-label={t(planSectionLabels[key])} rows={rows} maxLength={maxLength} value={content[key]} placeholder={t(placeholder)} onChange={event => field(key, event.target.value)} /> : <p className="living-plan-prose">{content[key] || t("Not drafted yet")}</p>;
  const heading = (key: PlanSection) => <div className="living-plan-section-heading"><h3 id={`plan-${key}-heading`}>{t(planSectionLabels[key])}</h3><Button type="button" size="sm" variant="ghost" aria-label={t("Comments on {{section}}", { section: t(planSectionLabels[key]) })} onClick={() => setSection(key)}><MessageSquare size={15} /><span>{t("Comments")}</span></Button></div>;
  return <>
    <div className="living-plan-document">
      <section aria-labelledby="plan-problem-heading">{heading("problem")}{text("problem", 5, 5000, "What problem is your team exploring, and why is it worth investigating?")}</section>
      <section aria-labelledby="plan-objectives-heading">{heading("objectives")}{editable ? <OrderedPlanList label="Research objectives" values={content.objectives} max={20} limit={500} onChange={values => field("objectives", values)} /> : <ReadList values={content.objectives} />}</section>
      <section id="plan-questions" aria-labelledby="plan-questions-heading">{heading("questions")}
        {!content.questions.length && <p className="living-plan-empty">{t("Add questions as literature and evidence clarify your direction.")}</p>}
        <ol className="living-plan-question-list">{content.questions.map((question, index) => <li id={`question-${question.id}`} key={question.id} tabIndex={-1} className={params.get("question") === question.id ? "living-plan-question-focus" : ""}>
          <div className="living-plan-question-heading"><a href={`#question-${question.id}`} className="text-sm font-semibold">RQ{index + 1}</a>{editable && <ListActions index={index} count={content.questions.length} label={t("Question {{number}}", { number: index + 1 })} move={offset => { const items = [...content.questions]; [items[index], items[index + offset]] = [items[index + offset]!, items[index]!]; field("questions", items); }} remove={() => field("questions", content.questions.filter(item => item.id !== question.id))} />}</div>
          {editable ? <textarea aria-label={t("Question {{number}}", { number: index + 1 })} rows={2} maxLength={1000} value={question.text} onChange={event => field("questions", content.questions.map(item => item.id === question.id ? { ...item, text: event.target.value } : item))} /> : <p className="living-plan-prose">{question.text}</p>}
          {!mentor && <><Link className="text-xs text-primary" to={projectSectionHref(projectId, "plan", { question: question.id }) + `#question-${question.id}`}>{t("Question details")}</Link>{question.sourceGapId && <WorkspaceArtifactLink projectId={projectId} link={{ kind: "GAP", id: question.sourceGapId }} />}</>}
          {editable && <QuestionSources projectId={projectId} question={question} onChange={next => field("questions", content.questions.map(item => item.id === question.id ? next : item))} />}
          {!editable && question.sourceGapVersion && <p className="text-xs text-muted-foreground">{t("Source gap revision {{version}}", { version: question.sourceGapVersion })} · {t("{{count}} captured evidence references", { count: question.sourceEvidenceRevisionIds?.length ?? question.evidenceIds?.length ?? 0 })}</p>}
        </li>)}</ol>
        {editable && <Button type="button" size="sm" variant="outline" disabled={content.questions.length >= 20} onClick={() => field("questions", [...content.questions, { id: crypto.randomUUID(), text: "" }])}><Plus size={14} className="mr-2" />{t("Add research question")}</Button>}
      </section>
      <details className="living-plan-details"><summary>{t("Detailed plan")}</summary><div className="living-plan-detail-content">
        <label className="living-plan-approach">{t("Research approach")}{editable ? <select aria-label={t("Research approach")} value={content.approach} onChange={event => field("approach", event.target.value as ResearchApproach)}>{Object.entries(approachLabels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select> : <span>{t(approachLabels[content.approach])}</span>}</label>
        <section aria-labelledby="plan-scope-heading">{heading("scope")}{text("scope", 3, 5000, "Population, context and boundaries of the research…")}</section>
        <section aria-labelledby="plan-methodology-heading">{heading("methodology")}{text("methodology", 5, 20000, "How does your team intend to study and evaluate the problem?")}</section>
        <section aria-labelledby="plan-searchStrategy-heading">{heading("searchStrategy")}{text("searchStrategy", 3, 5000, "Sources, keywords and search strings, as useful for your study…")}
          <div className="grid gap-4 sm:grid-cols-2">{(["inclusionCriteria", "exclusionCriteria"] as const).map(key => <label key={key}>{t(key === "inclusionCriteria" ? "Inclusion criteria" : "Exclusion criteria")}{editable ? <textarea rows={3} value={content[key].join("\n")} onChange={event => field(key, event.target.value.split("\n"))} /> : <ReadList values={content[key]} />}</label>)}</div><p className="text-xs text-muted-foreground">{t("These criteria are shared with project screening. They are optional while planning.")}</p>
        </section>
        <section aria-labelledby="plan-deliverables-heading">{heading("deliverables")}{editable ? <OrderedPlanList label="Expected outcomes" values={content.deliverables} max={20} limit={500} onChange={values => field("deliverables", values)} /> : <ReadList values={content.deliverables} />}{!mentor && <Link className="text-sm text-primary" to={projectSectionHref(projectId, "tasks")}>{t("View tasks and milestones")}</Link>}</section>
      </div></details>
    </div>
    {section && <PlanSectionFeedback key={`${revisionId ?? "draft"}:${section}`} projectId={projectId} section={section} revisionId={revisionId} version={version} archived={archived} mentor={mentor} onClose={() => { setSection(null); document.getElementById(`plan-${section}-heading`)?.scrollIntoView({ block: "nearest" }); }} />}
  </>;
}
function ReadList({ values }: { values: string[] }) { const { t } = useI18n(); return values.length ? <ol className="list-decimal space-y-2 pl-5">{values.map((value, i) => <li key={i} className="living-plan-prose">{value}</li>)}</ol> : <p className="living-plan-empty">{t("Not drafted yet")}</p>; }
function ListActions({ index, count, label, move, remove }: { index: number; count: number; label: string; move: (offset: number) => void; remove: () => void }) {
  const { t } = useI18n();
  return <div className="flex shrink-0">{([-1, 1] as const).map(offset => <Button key={offset} type="button" size="icon" variant="ghost" disabled={offset < 0 ? !index : index >= count - 1} aria-label={t(offset < 0 ? "Move {{item}} up" : "Move {{item}} down", { item: label })} onClick={() => move(offset)}>{offset < 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}</Button>)}<Button type="button" size="icon" variant="ghost" aria-label={t("Remove {{item}}", { item: label })} onClick={remove}><X size={14} /></Button></div>;
}
export function OrderedPlanList({ label, values, max, limit, onChange }: { label: string; values: string[]; max: number; limit: number; onChange: (values: string[]) => void }) {
  const { t } = useI18n(); const keys = useRef(values.map(() => crypto.randomUUID()));
  while (keys.current.length < values.length) keys.current.push(crypto.randomUUID());
  keys.current.length = values.length;
  return <div>{!values.length && <p className="living-plan-empty">{t("Start with one idea. You can refine and add more later.")}</p>}<ol className="living-plan-objectives">{values.map((value, index) => <li key={keys.current[index]}><span className="text-xs text-muted-foreground pt-3">{index + 1}.</span><textarea aria-label={`${t(label)} ${index + 1}`} rows={2} maxLength={limit} value={value} onChange={event => onChange(values.map((item, i) => i === index ? event.target.value : item))} /><ListActions index={index} count={values.length} label={`${t(label)} ${index + 1}`} move={offset => { const items = [...values]; [items[index], items[index + offset]] = [items[index + offset]!, items[index]!]; [keys.current[index], keys.current[index + offset]] = [keys.current[index + offset]!, keys.current[index]!]; onChange(items); }} remove={() => { keys.current.splice(index, 1); onChange(values.filter((_, i) => i !== index)); }} /></li>)}</ol><Button type="button" size="sm" variant="outline" disabled={values.length >= max} onClick={() => onChange([...values, ""])}><Plus size={14} className="mr-2" />{t(label === "Research objectives" ? "Add objective" : "Add expected outcome")}</Button></div>;
}
function QuestionSources({ projectId, question, onChange }: { projectId: string; question: PlanQuestion; onChange: (value: PlanQuestion) => void }) {
  const { t } = useI18n(); const [open, setOpen] = useState(false);
  const evidence = useWorkspaceResource(projectId, "question-evidence", () => gapsApi.evidence(question.sourceGapId!), question.sourceGapId, open && Boolean(question.sourceGapId));
  let details: ReactNode = null;
  if (open) details = <>
    <WorkspaceArtifactPicker projectId={projectId} value={question.sourceGapId ? { kind: "GAP", id: question.sourceGapId } : null} allowedKinds={["GAP"]} onChange={link => { onChange({ id: question.id, text: question.text, ...(link ? { sourceGapId: link.id } : {}) }); }} />
    {question.sourceGapVersion ? <p className="text-xs text-muted-foreground">{t("Source gap revision {{version}}", { version: question.sourceGapVersion })} · {t("{{count}} captured evidence references", { count: question.sourceEvidenceRevisionIds?.length ?? 0 })}</p> : question.sourceGapId && <fieldset className="coord-question-evidence"><legend>{t("Evidence informing this question")}</legend>{evidence.isLoading ? <WorkspaceLoading /> : evidence.isError ? <WorkspaceError error={evidence.error} retry={() => void evidence.refetch()} /> : evidence.data?.map(item => <label key={item.id}><input type="checkbox" checked={question.evidenceIds?.includes(item.id) ?? false} disabled={!question.evidenceIds?.includes(item.id) && (question.evidenceIds?.length ?? 0) >= 30} onChange={event => onChange({ ...question, evidenceIds: event.target.checked ? [...(question.evidenceIds ?? []), item.id] : question.evidenceIds?.filter(id => id !== item.id) })} /><span>{t(item.evidenceKind === "COUNTER" ? "Counterevidence" : "Supporting evidence")} · {item.paperId?.title}<small>{item.explanation}</small></span></label>)}</fieldset>}
    <p className="text-xs text-muted-foreground">{t("Linking sources records your reasoning. It does not validate a gap or approve a research question.")}</p>
  </>;
  return <details onToggle={event => setOpen(event.currentTarget.open)}><summary>{t("Question sources, optional")}</summary>{details}</details>;
}
