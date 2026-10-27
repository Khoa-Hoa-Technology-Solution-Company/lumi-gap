import { useId, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, FileText, Pencil } from "lucide-react";
import type { ResearchPlanContent, ResearchPlanView } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { planFields, usePlanDraft } from "../hooks/use-plan-draft";
import { WorkspaceError } from "./workspace-common";

export function ProjectReadme({ projectId, view }: { projectId: string; view: ResearchPlanView }) {
  const { t } = useI18n();
  const state = usePlanDraft(projectId, view);
  const [editing, setEditing] = useState(state.recovered);
  const [preview, setPreview] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const editorId = useId();
  const content = view.canEdit ? state.draft.problem : view.content.problem;
  const status = state.saving ? "Saving…" : state.error ? "Could not sync changes" : state.dirty ? "Changes waiting to sync" : "Saved";
  const finish = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      if (await state.flush()) { setEditing(false); setPreview(false); }
    } finally { setFinishing(false); }
  };
  return <section className="project-about project-readme" aria-label={t("About project")} data-no-i18n>
    <header className="project-readme-toolbar">
      <span className="project-readme-filename"><FileText size={16} aria-hidden="true" />README.md</span>
      <div className="project-readme-actions">
        {(editing || state.dirty || state.saving || Boolean(state.error)) && <span className="project-readme-status" role="status" aria-live="polite">{t(status)}</span>}
        {Boolean(state.error) && !state.conflict && view.canEdit && <Button type="button" size="sm" variant="ghost" disabled={state.saving} onClick={() => void state.retry()}>{t("Retry sync")}</Button>}
        {view.canEdit && <Button type="button" size="sm" variant={editing ? "default" : "ghost"} disabled={finishing || (editing && (!state.valid || Boolean(state.conflict)))} onClick={() => editing ? void finish() : setEditing(true)}>
          {editing ? <Check size={15} aria-hidden="true" /> : <Pencil size={15} aria-hidden="true" />}{t(finishing ? "Saving…" : editing ? "Done editing" : "Edit")}
        </Button>}
      </div>
    </header>
    {state.recovered && <p role="status" className="project-readme-notice">{t("Recovered your unsynced draft from the expired session in this tab.")}</p>}
    {Boolean(state.error) && !state.conflict && view.canEdit && <WorkspaceError error={state.error} />}
    {state.conflict && <PlanConflict conflict={state.conflict} draft={state.draft} onResolve={state.reconcile} />}
    {editing && view.canEdit && <div className="project-readme-editor-bar" role="tablist" aria-label={t("README editor")}>
      <button id={`${editorId}-write-tab`} type="button" role="tab" aria-selected={!preview} aria-controls={`${editorId}-write-panel`} tabIndex={!preview ? 0 : -1} onClick={() => setPreview(false)} onKeyDown={event => { if (event.key === "ArrowRight" || event.key === "End") { event.preventDefault(); setPreview(true); document.getElementById(`${editorId}-preview-tab`)?.focus(); } }}>{t("Write")}</button>
      <button id={`${editorId}-preview-tab`} type="button" role="tab" aria-selected={preview} aria-controls={`${editorId}-preview-panel`} tabIndex={preview ? 0 : -1} onClick={() => setPreview(true)} onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "Home") { event.preventDefault(); setPreview(false); document.getElementById(`${editorId}-write-tab`)?.focus(); } }}>{t("Preview")}</button>
    </div>}
    {editing && view.canEdit && !preview ? <div id={`${editorId}-write-panel`} role="tabpanel" aria-labelledby={`${editorId}-write-tab`} className="project-readme-editor">
      <textarea id="plan-problem" autoFocus aria-label={t("Project introduction")} value={content} rows={20} maxLength={5000} onChange={event => state.field("problem", event.target.value)} placeholder={t("# Project name\n\nWrite about your project…")} />
      <div className="project-readme-editor-hint"><span>{t("Markdown supported")}</span><span>{content.length.toLocaleString()} / 5,000</span></div>
    </div> : <article id={editing ? `${editorId}-preview-panel` : undefined} role={editing ? "tabpanel" : undefined} aria-labelledby={editing ? `${editorId}-preview-tab` : undefined} aria-label={!editing ? t("Project introduction") : undefined} className="project-readme-content about-project-story">
      {content.trim() ? <Markdown remarkPlugins={[remarkGfm]} components={{
        a: ({ href, children }) => <a href={href} rel="noopener noreferrer" target={href?.startsWith("http") ? "_blank" : undefined}>{children}</a>,
        img: ({ src, alt }) => src ? <img src={src} alt={alt ?? ""} loading="lazy" referrerPolicy="no-referrer" /> : null,
        table: ({ children }) => <div className="project-readme-table"><table>{children}</table></div>,
      }}>{content}</Markdown> : <div className="project-readme-empty"><h2>{view.projectTitle}</h2><p>{t("No project introduction yet.")}</p></div>}
    </article>}
  </section>;
}

export function PlanConflict({ conflict, draft, onResolve }: { conflict: { latest: ResearchPlanView; fields: Array<keyof ResearchPlanContent> }; draft: ResearchPlanContent; onResolve: (choices: Partial<Record<keyof ResearchPlanContent, "mine" | "server">>) => void }) {
  const { t } = useI18n(); const [choices, setChoices] = useState<Partial<Record<keyof ResearchPlanContent, "mine" | "server">>>({});
  const display = (value: unknown) => typeof value === "string" ? value || t("Not drafted yet") : JSON.stringify(value, null, 2);
  return <section role="alert" className="living-plan-conflict"><h3>{t("Resolve overlapping changes")}</h3><p>{t("Your draft is kept. Choose which content to use for each conflicting section. Other edits will be merged.")}</p>
    {conflict.fields.filter(key => planFields.includes(key)).map(key => <fieldset key={key}><legend>{t(key)}</legend><div className="grid gap-3 sm:grid-cols-2">{(["mine", "server"] as const).map(choice => <label key={choice}><span className="flex gap-2"><input type="radio" name={`conflict-${key}`} checked={choices[key] === choice} onChange={() => setChoices({ ...choices, [key]: choice })} />{t(choice === "mine" ? "Use my draft" : "Use saved content")}</span><pre>{display(choice === "mine" ? draft[key] : conflict.latest.content[key])}</pre></label>)}</div></fieldset>)}
    <Button type="button" size="sm" disabled={conflict.fields.some(key => !choices[key])} onClick={() => onResolve(choices)}>{t("Merge and continue")}</Button>
  </section>;
}
