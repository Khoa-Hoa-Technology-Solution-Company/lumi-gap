import { useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";
import { researchApi } from "../api/project-research.api";
import { useResearchCommand } from "../hooks/use-project-research";
import { WorkspaceError, canLeaveWorkspace, useUnsavedWorkspace } from "./workspace-common";
import { ResearchScreening } from "./research-screening";
import { ResearchEvidence } from "./research-evidence";
import "../project-research.css";

export function ResearchLiterature({ projectId, readOnly, children }: { projectId: string; readOnly: boolean; children: ReactNode }) {
  const { t } = useI18n(); const [params, setParams] = useSearchParams();
  const view = params.get("view") ?? "library";
  const change = async (value: string) => { if (!(await canLeaveWorkspace())) return; const next = new URLSearchParams(params); next.set("view", value); setParams(next, { replace: true }); };
  return <div className="research-workflow" data-no-i18n>
    <nav className="research-views" aria-label={t("Literature workflow")}>
      {[["library", "Library"], ["screening", "Screening"], ["evidence", "Evidence matrix"]].map(([value, label]) => <button type="button" key={value} aria-current={view === value ? "page" : undefined} onClick={() => change(value!)}>{t(label!)}</button>)}
    </nav>
    {view === "screening" ? <ResearchScreening projectId={projectId} readOnly={readOnly} /> : view === "evidence" ? <ResearchEvidence projectId={projectId} readOnly={readOnly} /> : <>{children}{!readOnly && <ManualReference projectId={projectId} />}</>}
  </div>;
}
function ManualReference({ projectId }: { projectId: string }) {
  const { t } = useI18n(); const [open, setOpen] = useState(false), [clientKey, setClientKey] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState({ title: "", doi: "", year: "", authors: "", reference: "", journalName: "", abstractText: "", paperLink: "" }); const command = useResearchCommand(projectId);
  useUnsavedWorkspace(open && Object.values(form).some(value => value.trim()));
  const save = async () => { try { await command.mutateAsync(() => researchApi.import(projectId, { title: form.title, ...(form.doi.trim() ? { doi: form.doi.trim().replace(/^https?:\/\/(dx\.)?doi.org\//i, "") } : {}), ...(form.year ? { publicationYear: Number(form.year) } : {}), authors: form.authors.split(";").map(name => name.trim()).filter(Boolean), reference: form.reference, journalName: form.journalName, abstractText: form.abstractText, ...(form.paperLink.trim() ? { paperLink: form.paperLink.trim() } : {}), clientKey })); setOpen(false); setForm({ title: "", doi: "", year: "", authors: "", reference: "", journalName: "", abstractText: "", paperLink: "" }); setClientKey(crypto.randomUUID()); } catch { /* Keep the reference and retry key. */ } };
  return <section className="research-manual"><button type="button" className="research-text-action" onClick={() => setOpen(value => !value)}>{t("Add a reference manually")}</button>{open && <form className="research-form" onSubmit={e => { e.preventDefault(); void save(); }}>
    <p className="research-help">{t("No DOI required. Metadata stays pending library review; private project files are never published.")}</p>
    {([['title', 'Paper title'], ['doi', 'DOI (optional)'], ['year', 'Year (optional)'], ['authors', 'Authors, separated by semicolons'], ['journalName', 'Venue'], ['paperLink', 'Source URL (optional)'], ['reference', 'Reference or import source']] as const).map(([key, label]) => <label key={key}>{t(label)}<Input value={form[key]} required={key === "title"} maxLength={key === "title" ? 500 : 1000} type={key === "year" ? "number" : key === "paperLink" ? "url" : "text"} onChange={e => setForm(value => ({ ...value, [key]: e.target.value }))} /></label>)}
    <label>{t("Abstract")}<textarea value={form.abstractText} maxLength={20000} onChange={e => setForm(value => ({ ...value, abstractText: e.target.value }))} /></label>
    {command.isError && <WorkspaceError error={command.error} />}<Button disabled={command.isPending} type="submit">{t("Save reference")}</Button>
  </form>}</section>;
}
