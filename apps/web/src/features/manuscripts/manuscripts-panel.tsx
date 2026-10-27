import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCode2, Plus, ArrowUpRight, X, Clock, Search, Sparkles, Users } from "lucide-react";
import { MANUSCRIPT_TYPES, MANUSCRIPT_TEMPLATES, type CreateManuscript, type ManuscriptSummary, type ManuscriptType, type ManuscriptTemplate } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { canLeaveWorkspace, useUnsavedWorkspace } from "@/features/projects/components/workspace-common";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { manuscriptsApi } from "./manuscripts.api";
import { ManuscriptFeedbackLink } from "./manuscript-feedback-link";
import { ImportManuscript } from "./manuscript-import";
import { ManuscriptTemplates } from "./manuscript-templates";
import { ManuscriptGithub } from "./manuscript-github";
import { ImportManuscriptPdf } from "./manuscript-pdf-import";
import { DeleteManuscript } from "./manuscript-delete";
import "./manuscripts.css";
export const typeLabel: Record<ManuscriptType, string> = { RESEARCH_PAPER: "Research paper", RESEARCH_PROPOSAL: "Research proposal", THESIS: "Thesis", TECHNICAL_REPORT: "Technical report" };
export const templateLabel: Record<ManuscriptTemplate, string> = { ARTICLE: "Article template", PROPOSAL: "Proposal template", REPORT: "Report template", IEEE_CONFERENCE: "IEEE conference", PRESENTATION: "Beamer presentation", THESIS: "Thesis template", ELSEVIER: "Elsevier article", SPRINGER: "Springer proceedings", APS: "Physics article", BLANK: "Blank document" };

export type ManuscriptCreationDraft = Pick<CreateManuscript, "title" | "description" | "documentType" | "template" | "researchLink">;

export function ManuscriptsPanel({ projectId, readOnly, draft, onDraftConsumed }: { projectId: string; readOnly: boolean; draft?: ManuscriptCreationDraft; onDraftConsumed?: () => void }) {
  const { t, language } = useI18n(), navigate = useNavigate(), client = useQueryClient();
  const userId = useAuthStore(s => s.user?.id);
  const query = useQuery({ queryKey: ["manuscripts", userId, projectId], queryFn: () => manuscriptsApi.list(projectId), refetchInterval: 15000 });
  const [form, setForm] = useState(Boolean(draft) && !readOnly);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  const filteredManuscripts = useMemo(() => {
    if (!query.data) return [];
    return query.data.filter((item) => {
      const q = search.trim().toLowerCase();
      const matchesSearch = !q ||
        item.title.toLowerCase().includes(q) ||
        item.description?.toLowerCase().includes(q);
      const matchesType = typeFilter === "ALL" || item.documentType === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [query.data, search, typeFilter]);

  return <Dialog open={form} onOpenChange={open => { if (open) setForm(true); }}><section className="writing-overview" data-no-i18n>
    <header className="writing-section-heading">
      <div>
        <div className="writing-section-badge">
          <Sparkles size={13} aria-hidden="true" />
          <span>{t("Manuscript Workspace")}</span>
        </div>
        <h2>{t("Manuscripts")}</h2>
        <p>{t("Write together, keep source versions and request academic feedback.")}</p>
      </div>
      {!readOnly ? (
        <div className="writing-actions">
          <ManuscriptGithub project={projectId} />
          <ImportManuscriptPdf project={projectId} onImported={id => { void client.invalidateQueries({ queryKey: ["manuscripts", userId, projectId] }); navigate(`/projects/${projectId}/manuscripts/${id}`); }} />
          <ImportManuscript project={projectId} onImported={id => { void client.invalidateQueries({ queryKey: ["manuscripts", userId, projectId] }); navigate(`/projects/${projectId}/manuscripts/${id}`); }} />
          <DialogTrigger asChild>
            <Button className="writing-create-btn">
              <Plus className="h-4 w-4 mr-1.5" />{t("Create manuscript")}
            </Button>
          </DialogTrigger>
        </div>
      ) : null}
    </header>

    {readOnly ? <p className="writing-notice">{t("This project is read-only.")}</p> : null}

    {form ? <CreateManuscriptDialog projectId={projectId} readOnly={readOnly} draft={draft} onClose={() => { setForm(false); onDraftConsumed?.(); }} onCreated={id => {
      setForm(false);
      onDraftConsumed?.();
      void client.invalidateQueries({ queryKey: ["manuscripts", userId, projectId] });
      navigate(`/projects/${projectId}/manuscripts/${id}`);
    }} /> : null}

    {query.isLoading ? (
      <div aria-busy="true" className="writing-skeleton">{t("Loading manuscripts…")}</div>
    ) : query.error ? (
      <div role="alert" className="writing-notice"><p>{t("Manuscripts are unavailable or you do not have access.")}</p><Button variant="outline" onClick={() => void query.refetch()}>{t("Try again")}</Button></div>
    ) : query.data?.length ? (
      <>
        {query.data.length > 2 && (
          <div className="writing-manuscript-toolbar">
            <div className="writing-search-box">
              <Search size={15} aria-hidden="true" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t("Search manuscripts…")}
                maxLength={160}
              />
              {search && (
                <Button variant="ghost" size="icon" onClick={() => setSearch("")} aria-label={t("Clear search")}>
                  <X size={14} aria-hidden="true" />
                </Button>
              )}
            </div>
            <div className="writing-filter-row">
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                aria-label={t("Filter by document type")}
                className="writing-type-select"
              >
                <option value="ALL">{t("All document types")}</option>
                {MANUSCRIPT_TYPES.map(val => (
                  <option key={val} value={val}>{t(typeLabel[val])}</option>
                ))}
              </select>
              {(search || typeFilter !== "ALL") && (
                <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setTypeFilter("ALL"); }}>
                  {t("Reset")}
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="writing-manuscript-list">
          {filteredManuscripts.map(row => (
            <article key={row.id} className="writing-manuscript-item">
              <Link to={`/projects/${projectId}/manuscripts/${row.id}`} className="writing-manuscript-row">
                <div className="writing-manuscript-icon-box" aria-hidden="true">
                  <FileCode2 size={22} />
                </div>
                <div className="writing-manuscript-main">
                  <div className="writing-manuscript-badges">
                    <span className="writing-type-pill">{t(typeLabel[row.documentType])}</span>
                    <span className="writing-template-pill">{t(templateLabel[row.template] || "Article template")}</span>
                    <span className="writing-status-pill" data-archived={row.archived}>
                      <i aria-hidden="true" />
                      {row.archived ? t("Read-only") : t("Working draft")}
                    </span>
                  </div>
                  <h3 className="writing-manuscript-title">{row.title}</h3>
                  {row.description ? <p className="writing-manuscript-desc">{row.description}</p> : null}
                  <div className="writing-manuscript-meta-row">
                    <span className="writing-meta-date">
                      <Clock size={13} aria-hidden="true" />
                      {t("Edited")} {new Date(row.updatedAt).toLocaleTimeString(language === "vi" ? "vi-VN" : "en-GB", { hour: "2-digit", minute: "2-digit" })} {new Date(row.updatedAt).toLocaleDateString(language === "vi" ? "vi-VN" : "en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    </span>
                    {row.collaborators?.length ? (
                      <span className="writing-meta-collab">
                        <Users size={13} aria-hidden="true" />
                        {t("Project collaborators")}: {row.collaborators.map(person => person.name).join(", ")}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="writing-manuscript-open-link" aria-hidden="true">
                  <ArrowUpRight size={18} />
                </div>
              </Link>
              {!readOnly ? (
                <div className="writing-manuscript-actions-col">
                  <DeleteManuscript
                    projectId={projectId}
                    manuscript={row}
                    onRefresh={() => void query.refetch()}
                    onDeleted={() => {
                      client.setQueryData<ManuscriptSummary[]>(["manuscripts", userId, projectId], rows => rows?.filter(item => item.id !== row.id));
                      void client.invalidateQueries({ queryKey: ["manuscripts", userId, projectId] });
                      void client.invalidateQueries({ queryKey: ["manuscript", userId, projectId, row.id] });
                    }}
                  />
                </div>
              ) : null}
              {row.latestFeedback ? (
                <p className="writing-feedback-row">
                  <ManuscriptFeedbackLink projectId={projectId} manuscriptId={row.id} feedback={row.latestFeedback} />
                </p>
              ) : null}
            </article>
          ))}
          {filteredManuscripts.length === 0 && (
            <div className="writing-no-results" role="status">
              <p>{t("No manuscripts match your search.")}</p>
              <Button variant="outline" size="sm" onClick={() => { setSearch(""); setTypeFilter("ALL"); }}>
                {t("Clear filters")}
              </Button>
            </div>
          )}
        </div>
      </>
    ) : (
      <div className="writing-empty">
        <FileCode2 aria-hidden="true" />
        <h3>{t("Start your first manuscript")}</h3>
        <p>{t("Create a LaTeX draft when your team is ready. Literature, evidence and research questions remain available as you write.")}</p>
      </div>
    )}
  </section></Dialog>;
}

function CreateManuscriptDialog({ projectId, readOnly, draft, onClose, onCreated }: { projectId: string; readOnly: boolean; draft?: ManuscriptCreationDraft; onClose: () => void; onCreated: (id: string) => void }) {
  const { t } = useI18n();
  const [title, setTitle] = useState(draft?.title ?? ""), [description, setDescription] = useState(draft?.description ?? "");
  const [type, setType] = useState<ManuscriptType>(draft?.documentType ?? "RESEARCH_PAPER"), [template, setTemplate] = useState<ManuscriptTemplate>(draft?.template ?? "ARTICLE");
  const key = useRef(crypto.randomUUID()), submitting = useRef(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const dirty = title !== (draft?.title ?? "") || description !== (draft?.description ?? "") || type !== (draft?.documentType ?? "RESEARCH_PAPER") || template !== (draft?.template ?? "ARTICLE");
  useUnsavedWorkspace(dirty || busy);
  const close = async () => { if (!submitting.current && await canLeaveWorkspace() && !submitting.current) onClose(); };
  const create = async () => {
    if (submitting.current || readOnly || title.trim().length < 2) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      const row = await manuscriptsApi.create(projectId, { title: title.trim(), description: description.trim(), documentType: type, template, clientKey: key.current, ...(draft?.researchLink ? { researchLink: draft.researchLink } : {}) });
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
        <div className="writing-form-field">
          <label htmlFor="manuscript-create-title">{t("Manuscript title")}</label>
          <Input id="manuscript-create-title" autoFocus required minLength={2} maxLength={160} value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div className="writing-form-row">
          <div className="writing-form-field">
            <label htmlFor="manuscript-create-type">{t("Document type")}</label>
            <select id="manuscript-create-type" value={type} onChange={e => setType(e.target.value as ManuscriptType)}>
              {MANUSCRIPT_TYPES.map(value => <option key={value} value={value}>{t(typeLabel[value])}</option>)}
            </select>
          </div>
          <div className="writing-form-field">
            <label htmlFor="manuscript-create-template">{t("Template")}</label>
            <select id="manuscript-create-template" value={template} onChange={e => setTemplate(e.target.value as ManuscriptTemplate)}>
              {MANUSCRIPT_TEMPLATES.map(value => <option key={value} value={value}>{t(templateLabel[value])}</option>)}
            </select>
          </div>
        </div>
        <div className="writing-form-field">
          <label htmlFor="manuscript-create-desc">{t("Short description (optional)")}</label>
          <textarea id="manuscript-create-desc" maxLength={2000} rows={3} value={description} onChange={e => setDescription(e.target.value)} />
        </div>
        <ManuscriptTemplates value={template} onChange={setTemplate} />
      </fieldset>
      {error ? <p role="alert" className="writing-error">{error}</p> : null}
      <div className="writing-create-actions"><Button type="button" variant="outline" disabled={busy} onClick={() => void close()}>{t("Cancel")}</Button><Button type="submit" disabled={busy || readOnly || title.trim().length < 2}>{busy ? t("Creating…") : t("Create and open editor")}</Button></div>
    </form>
  </DialogContent>;
}
