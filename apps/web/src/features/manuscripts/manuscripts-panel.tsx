import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCode2, Plus, ArrowUpRight, X } from "lucide-react";
import { MANUSCRIPT_TYPES, MANUSCRIPT_TEMPLATES, type ManuscriptType, type ManuscriptTemplate } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { canLeaveWorkspace, useUnsavedWorkspace } from "@/features/projects/components/workspace-common";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { manuscriptsApi } from "./manuscripts.api";
import { ManuscriptFeedbackLink } from "./manuscript-feedback-link";
import "./manuscripts.css";
export const typeLabel: Record<ManuscriptType, string> = { RESEARCH_PAPER: "Research paper", RESEARCH_PROPOSAL: "Research proposal", THESIS: "Thesis", TECHNICAL_REPORT: "Technical report" };
export const templateLabel: Record<ManuscriptTemplate, string> = { ARTICLE: "Article template", PROPOSAL: "Proposal template", REPORT: "Report template" };

export function ManuscriptsPanel({ projectId, readOnly }: { projectId: string; readOnly: boolean }) {
  const { t } = useI18n(), navigate = useNavigate(), client = useQueryClient();
  const userId = useAuthStore(s => s.user?.id);
  const query = useQuery({ queryKey: ["manuscripts", userId, projectId], queryFn: () => manuscriptsApi.list(projectId), refetchInterval: 15000 });
  const [form, setForm] = useState(false);
  return <Dialog open={form} onOpenChange={open => { if (open) setForm(true); }}><section className="writing-overview" data-no-i18n>
    <header className="writing-section-heading"><div><h2>{t("Manuscripts")}</h2><p>{t("Write together, keep source versions and request academic feedback.")}</p></div>{!readOnly ? <DialogTrigger asChild><Button><Plus className="h-4 w-4" />{t("Create manuscript")}</Button></DialogTrigger> : null}</header>
    {readOnly ? <p className="writing-notice">{t("This project is read-only.")}</p> : null}
    {form ? <CreateManuscriptDialog projectId={projectId} readOnly={readOnly} onClose={() => setForm(false)} onCreated={id => {
      setForm(false);
      void client.invalidateQueries({ queryKey: ["manuscripts", userId, projectId] });
      navigate(`/projects/${projectId}/manuscripts/${id}`);
    }} /> : null}
    {query.isLoading ? <div aria-busy="true" className="writing-skeleton">{t("Loading manuscripts…")}</div> : query.error ? <div role="alert" className="writing-notice"><p>{t("Manuscripts are unavailable or you do not have access.")}</p><Button variant="outline" onClick={() => void query.refetch()}>{t("Try again")}</Button></div> : query.data?.length ? <div className="writing-manuscript-list">{query.data.map(row => <article key={row.id} className="writing-manuscript-item"><Link to={`/projects/${projectId}/manuscripts/${row.id}`} className="writing-manuscript-row"><FileCode2 aria-hidden="true" /><div><h3>{row.title}</h3><p>{t(typeLabel[row.documentType])} · {row.archived ? t("Read-only") : t("Working draft")} · {t("Edited")} {new Date(row.updatedAt).toLocaleString()}</p>{row.description ? <p>{row.description}</p> : null}{row.collaborators?.length ? <p>{t("Project collaborators")}: {row.collaborators.map(person => person.name).join(", ")}</p> : null}</div><ArrowUpRight aria-hidden="true" /></Link>{row.latestFeedback ? <p className="writing-feedback-row"><ManuscriptFeedbackLink projectId={projectId} manuscriptId={row.id} feedback={row.latestFeedback} /></p> : null}</article>)}</div> : <div className="writing-empty"><FileCode2 aria-hidden="true" /><h3>{t("Start your first manuscript")}</h3><p>{t("Create a LaTeX draft when your team is ready. Literature, evidence and research questions remain available as you write.")}</p></div>}
  </section></Dialog>;
}

function CreateManuscriptDialog({ projectId, readOnly, onClose, onCreated }: { projectId: string; readOnly: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useI18n();
  const [title, setTitle] = useState(""), [description, setDescription] = useState("");
  const [type, setType] = useState<ManuscriptType>("RESEARCH_PAPER"), [template, setTemplate] = useState<ManuscriptTemplate>("ARTICLE");
  const key = useRef(crypto.randomUUID()), submitting = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const dirty = Boolean(title || description || type !== "RESEARCH_PAPER" || template !== "ARTICLE");
  useUnsavedWorkspace(dirty || busy);
  const close = async () => { if (!submitting.current && await canLeaveWorkspace() && !submitting.current) onClose(); };
  const create = async () => {
    if (submitting.current || readOnly || title.trim().length < 2) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      const row = await manuscriptsApi.create(projectId, { title: title.trim(), description: description.trim(), documentType: type, template, clientKey: key.current });
      onCreated(row.id);
    } catch { setError(t("Could not create the manuscript. Your input is retained; try again.")); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <DialogContent className="writing-create-dialog" data-no-i18n closeLabel={t("Close")} showClose={false}
    onEscapeKeyDown={event => { event.preventDefault(); void close(); }}
    onPointerDownOutside={event => { event.preventDefault(); void close(); }}>
    <button type="button" className="writing-create-close" aria-label={t("Close")} disabled={busy} onClick={() => void close()}><X size={18} aria-hidden="true" /></button>
    <DialogHeader className="writing-create-heading"><DialogTitle>{t("Create manuscript")}</DialogTitle><DialogDescription>{t("Choose a title and template. Your team can start writing together in the editor.")}</DialogDescription></DialogHeader>
    <form className="writing-create-form" aria-busy={busy} onSubmit={event => { event.preventDefault(); void create(); }}>
      <fieldset disabled={busy || readOnly}>
        <label>{t("Manuscript title")}<Input autoFocus required minLength={2} maxLength={160} value={title} onChange={e => setTitle(e.target.value)} /></label>
        <div className="writing-form-row"><label>{t("Document type")}<select value={type} onChange={e => setType(e.target.value as ManuscriptType)}>{MANUSCRIPT_TYPES.map(value => <option key={value} value={value}>{t(typeLabel[value])}</option>)}</select></label><label>{t("Template")}<select value={template} onChange={e => setTemplate(e.target.value as ManuscriptTemplate)}>{MANUSCRIPT_TEMPLATES.map(value => <option key={value} value={value}>{t(templateLabel[value])}</option>)}</select></label></div>
        <label>{t("Short description (optional)")}<textarea maxLength={2000} rows={3} value={description} onChange={e => setDescription(e.target.value)} /></label>
      </fieldset>
      {error ? <p role="alert" className="writing-error">{error}</p> : null}
      <div className="writing-create-actions"><Button type="button" variant="outline" disabled={busy} onClick={() => void close()}>{t("Cancel")}</Button><Button type="submit" disabled={busy || readOnly || title.trim().length < 2}>{busy ? t("Creating…") : t("Create and open editor")}</Button></div>
    </form>
  </DialogContent>;
}
