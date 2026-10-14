import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCode2, Plus, ArrowUpRight } from "lucide-react";
import { MANUSCRIPT_TYPES, MANUSCRIPT_TEMPLATES, type ManuscriptType, type ManuscriptTemplate } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
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
  const [form, setForm] = useState(false), [title, setTitle] = useState(""), [description, setDescription] = useState("");
  const [type, setType] = useState<ManuscriptType>("RESEARCH_PAPER"), [template, setTemplate] = useState<ManuscriptTemplate>("ARTICLE");
  const [key, setKey] = useState(() => crypto.randomUUID()), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const create = async () => {
    setBusy(true); setError("");
    try {
      const row = await manuscriptsApi.create(projectId, { title: title.trim(), description: description.trim(), documentType: type, template, clientKey: key });
      await client.invalidateQueries({ queryKey: ["manuscripts", userId, projectId] });
      navigate(`/projects/${projectId}/manuscripts/${row.id}`);
    } catch { setError(t("Could not create the manuscript. Your input is retained; try again.")); }
    finally { setBusy(false); }
  };
  return <section className="writing-overview" data-no-i18n>
    <header className="writing-section-heading"><div><h2>{t("Manuscripts")}</h2><p>{t("Write together, keep source versions and request academic feedback.")}</p></div>{!readOnly && !form ? <Button onClick={() => { setForm(true); setKey(crypto.randomUUID()); }}><Plus className="h-4 w-4" />{t("Create manuscript")}</Button> : null}</header>
    {readOnly ? <p className="writing-notice">{t("This project is read-only.")}</p> : null}
    {form ? <form className="writing-create" onSubmit={event => { event.preventDefault(); void create(); }}>
      <label>{t("Manuscript title")}<Input autoFocus required maxLength={160} value={title} onChange={e => setTitle(e.target.value)} /></label>
      <div className="writing-form-row"><label>{t("Document type")}<select value={type} onChange={e => setType(e.target.value as ManuscriptType)}>{MANUSCRIPT_TYPES.map(value => <option key={value} value={value}>{t(typeLabel[value])}</option>)}</select></label><label>{t("Template")}<select value={template} onChange={e => setTemplate(e.target.value as ManuscriptTemplate)}>{MANUSCRIPT_TEMPLATES.map(value => <option key={value} value={value}>{t(templateLabel[value])}</option>)}</select></label></div>
      <label>{t("Short description (optional)")}<Input maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} /></label>
      {error ? <p role="alert" className="writing-error">{error}</p> : null}
      <div className="writing-actions"><Button type="submit" disabled={busy || title.trim().length < 2}>{busy ? t("Creating…") : t("Create and open editor")}</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => setForm(false)}>{t("Cancel")}</Button></div>
    </form> : null}
    {query.isLoading ? <div aria-busy="true" className="writing-skeleton">{t("Loading manuscripts…")}</div> : query.error ? <div role="alert" className="writing-notice"><p>{t("Manuscripts are unavailable or you do not have access.")}</p><Button variant="outline" onClick={() => void query.refetch()}>{t("Try again")}</Button></div> : query.data?.length ? <div className="writing-manuscript-list">{query.data.map(row => <article key={row.id} className="writing-manuscript-item"><Link to={`/projects/${projectId}/manuscripts/${row.id}`} className="writing-manuscript-row"><FileCode2 aria-hidden="true" /><div><h3>{row.title}</h3><p>{t(typeLabel[row.documentType])} · {row.archived ? t("Read-only") : t("Working draft")} · {t("Edited")} {new Date(row.updatedAt).toLocaleString()}</p>{row.description ? <p>{row.description}</p> : null}{row.collaborators?.length ? <p>{t("Project collaborators")}: {row.collaborators.map(person => person.name).join(", ")}</p> : null}</div><ArrowUpRight aria-hidden="true" /></Link>{row.latestFeedback ? <p className="writing-feedback-row"><ManuscriptFeedbackLink projectId={projectId} manuscriptId={row.id} feedback={row.latestFeedback} /></p> : null}</article>)}</div> : <div className="writing-empty"><FileCode2 aria-hidden="true" /><h3>{t("Start your first manuscript")}</h3><p>{t("Create a LaTeX draft when your team is ready. Literature, evidence and research questions remain available as you write.")}</p></div>}
  </section>;
}
