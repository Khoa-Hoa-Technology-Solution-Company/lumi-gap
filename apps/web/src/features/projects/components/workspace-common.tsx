import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { isAxiosError } from "axios";
import { Link, useSearchParams } from "react-router-dom";
import type { WorkspaceComment, WorkspaceLink, WorkspacePage, WorkspacePerson, WorkspaceRevision } from "@trend/shared-types";
import { AlertCircle, ChevronLeft, ChevronRight, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { workspaceApi } from "../api/workspace.api";
import { useWorkspaceCommand, useWorkspaceResource } from "../hooks/use-workspace";

export const stageLabels = { DISCOVERY: "Literature discovery", SCREENING: "Screening", EXTRACTION: "Evidence extraction", GAP_VALIDATION: "Gap validation", DESIGN: "Research design", WRITING: "Writing", REVIEW: "Review" } as const;
export const taskLabels = { TODO: "To do", IN_PROGRESS: "In progress", BLOCKED: "Blocked", DONE: "Done" } as const;
export const approachLabels = { UNDECIDED: "Undecided", EXPLORATORY: "Exploratory research", LITERATURE_REVIEW: "Literature review", EMPIRICAL: "Empirical research" } as const;
export const linkLabels = { PAPER: "Paper", SCREENING: "Screening work item", EVIDENCE: "Evidence", GAP: "Research gap", QUESTION: "Research question", MANUSCRIPT: "Writing workspace", REVIEW_REQUEST: "Review request", PLAN_REVISION: "Plan revision", REPORT: "Research output" } as const;
export function projectSectionHref(id: string, tab: string, extra?: Record<string, string>) {
  return `/projects/${encodeURIComponent(id)}?${new URLSearchParams({ tab, ...extra })}`;
}
export function useWorkspaceSelection(key: string) {
  const [params, setParams] = useSearchParams();
  return [params.get(key), (value: string | null) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next, { replace: true }); }] as const;
}
const checkedLeaveEvents = new WeakSet<Event>();
export function useUnsavedWorkspace(dirty: boolean) {
  const { t } = useI18n();
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const leave = (event: Event) => { if (checkedLeaveEvents.has(event)) return; checkedLeaveEvents.add(event); if (!window.confirm(t("You have unsaved changes. Leave this section?"))) event.preventDefault(); };
    const click = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (anchor instanceof HTMLAnchorElement && anchor.href !== window.location.href && !anchor.target && !event.ctrlKey && !event.metaKey && !checkedLeaveEvents.has(event)) {
        checkedLeaveEvents.add(event);
        if (!window.confirm(t("You have unsaved changes. Leave this section?"))) { event.preventDefault(); event.stopPropagation(); }
      }
    };
    window.addEventListener("beforeunload", unload); window.addEventListener("project-workspace-leave", leave); document.addEventListener("click", click, true);
    return () => { window.removeEventListener("beforeunload", unload); window.removeEventListener("project-workspace-leave", leave); document.removeEventListener("click", click, true); };
  }, [dirty, t]);
}
export const canLeaveWorkspace = () => window.dispatchEvent(new Event("project-workspace-leave", { cancelable: true }));
export function WorkspaceLoading() {
  const { t } = useI18n();
  return <div className="coord-loading" role="status" aria-label={t("Loading workspace")}><Skeleton className="h-7 w-52" /><Skeleton className="mt-4 h-4 w-3/4" /><Skeleton className="mt-8 h-48 w-full" /></div>;
}
export function WorkspaceError({ error, retry }: { error: unknown; retry?: () => void }) {
  const { t } = useI18n();
  const status = isAxiosError(error) ? error.response?.status : undefined;
  const code = isAxiosError(error) ? error.response?.data?.error?.code : undefined;
  return <div className="coord-error" role="alert"><AlertCircle size={18} aria-hidden="true" /><div><p>{t(code === "QUESTION_IN_USE" ? "This question is linked to research work. Keep it in the plan or update its links before removing it." : status === 409 ? "This item changed since you opened it. Your draft is kept; reload the latest version before saving again." : status === 403 || status === 404 ? "This resource is unavailable or your access has changed." : "Could not complete this request. Your input is kept. Please try again.")}</p>{retry && <Button type="button" size="sm" variant="outline" onClick={retry}>{t("Try again")}</Button>}</div></div>;
}
export function WorkspaceHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <header className="coord-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</header>;
}
export function WorkspaceDate({ value }: { value: string | null }) {
  const { language, t } = useI18n();
  return value ? <time dateTime={value}>{new Intl.DateTimeFormat(language, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value))}</time> : <span>{t("No deadline")}</span>;
}
export function WorkspacePager({ data, page, onPage }: { data?: Pick<WorkspacePage<unknown>, "total" | "hasNext">; page: number; onPage: (page: number) => void }) {
  const { t } = useI18n();
  if (!data || page === 1 && !data.hasNext) return null;
  return <nav className="coord-pagination" aria-label={t("Pagination")}><Button size="sm" variant="ghost" disabled={page === 1} onClick={() => onPage(page - 1)} aria-label={t("Previous page")}><ChevronLeft size={16} /></Button><span>{t("Page {{page}}", { page })}</span><Button size="sm" variant="ghost" disabled={!data.hasNext} onClick={() => onPage(page + 1)} aria-label={t("Next page")}><ChevronRight size={16} /></Button></nav>;
}
export function WorkspacePeoplePicker({ projectId, value, onChange, multiple = false }: { projectId: string; value: string[]; onChange: (ids: string[]) => void; multiple?: boolean }) {
  const { t } = useI18n(); const id = useId();
  const [q, setQ] = useState(""); const [page, setPage] = useState(1);
  const people = useWorkspaceResource(projectId, "people", () => workspaceApi.people(projectId, q, page), { q, page });
  return <div className="coord-people-picker"><label htmlFor={id}>{t(multiple ? "Notify team members" : "Assignee")}</label>
    <input type="search" aria-label={t("Find a team member")} value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder={t("Find a team member")} maxLength={200} />
    <select id={id} multiple={multiple} value={multiple ? value : value[0] ?? ""} onChange={e => onChange(multiple ? [...e.target.selectedOptions].map(o => o.value) : e.target.value ? [e.target.value] : [])}>
      {!multiple && <option value="">{t("Unassigned")}</option>}
      {value.filter(selected => !people.data?.items.some(person => person.id === selected)).map(selected => <option key={selected} value={selected}>{t("Current selection")}</option>)}
      {people.data?.items.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
    </select>{people.isError && <WorkspaceError error={people.error} retry={() => void people.refetch()} />}<WorkspacePager data={people.data} page={page} onPage={setPage} />
    {multiple && <small>{t("Selected members receive a notification. Use Ctrl or Cmd to select more than one.")}</small>}
  </div>;
}
export function WorkspaceArtifactPicker({ projectId, value, onChange, allowedKinds }: { projectId: string; value: WorkspaceLink | null; onChange: (link: WorkspaceLink | null) => void; allowedKinds?: WorkspaceLink["kind"][] }) {
  const { t } = useI18n(); const inputId = useId(); const [q, setQ] = useState("");
  const [kind, setKind] = useState<WorkspaceLink["kind"] | "">(value?.kind ?? "");
  const choices = useWorkspaceResource(projectId, "artifacts", () => workspaceApi.artifacts(projectId, kind as WorkspaceLink["kind"], q), { kind, q }, Boolean(kind));
  return <fieldset className="coord-artifact-picker"><legend><Link2 size={14} aria-hidden="true" />{t("Linked research artifact")}</legend><div className="coord-form-pair">
    <label>{t("Resource type")}<select value={kind} onChange={e => { setKind(e.target.value as typeof kind); setQ(""); onChange(null); }}><option value="">{t("No linked artifact")}</option>{Object.entries(linkLabels).filter(([key]) => !allowedKinds || allowedKinds.includes(key as WorkspaceLink["kind"])).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}</select></label>
    {kind && <div><label htmlFor={inputId}>{t("Find an artifact")}<input id={inputId} type="search" value={q} onChange={e => setQ(e.target.value)} maxLength={200} /></label><select aria-label={t("Select an artifact")} value={value?.id ?? ""} onChange={e => { const item = choices.data?.find(choice => choice.id === e.target.value); onChange(item ? { kind: item.kind, id: item.id } : null); }}><option value="">{t("Choose an artifact")}</option>{value && !choices.data?.some(item => item.id === value.id) && <option value={value.id}>{t("Current linked artifact")}</option>}{choices.data?.map(item => <option key={item.id} value={item.id}>{item.label ?? t(linkLabels[item.kind])}</option>)}</select>{!choices.isLoading && choices.data?.length === 0 && <small>{t("No matching artifacts in this project.")}</small>}</div>}
    </div>{choices.isError && <WorkspaceError error={choices.error} retry={() => void choices.refetch()} />}</fieldset>;
}
export function WorkspaceArtifactLink({ projectId, link }: { projectId: string; link: WorkspaceLink | null }) {
  const { t } = useI18n(); if (!link) return null;
  const url = link.kind === "EVIDENCE" ? projectSectionHref(projectId, "papers", { view: "evidence", evidence: link.id }) : link.kind === "PAPER" ? projectSectionHref(projectId, "papers", { paper: link.id }) : link.kind === "REPORT" ? `/reports/${encodeURIComponent(link.id)}` : link.kind === "REVIEW_REQUEST" ? `/review-requests/${encodeURIComponent(link.id)}` : link.kind === "PLAN_REVISION" ? projectSectionHref(projectId, "plan", { revision: link.id }) : projectSectionHref(projectId, link.kind === "GAP" ? "gaps" : link.kind === "SCREENING" ? "papers" : link.kind === "QUESTION" ? "plan" : "reports");
  return <Link className="coord-inline-link" to={url}><Link2 size={14} aria-hidden="true" />{t(linkLabels[link.kind])}</Link>;
}
export function WorkspaceComments({ projectId, targetKind, targetId, readOnly, mentor = false }: { projectId: string; targetKind: "TASK" | "PLAN_REVISION"; targetId: string; readOnly: boolean; mentor?: boolean }) {
  const { t } = useI18n(); const [page, setPage] = useState(1);
  const comments = useWorkspaceResource(projectId, "comments", () => workspaceApi.comments(projectId, targetKind, targetId, page), { targetKind, targetId, page });
  const add = useWorkspaceCommand(projectId, (data: { body: string; mentions: string[]; clientKey: string }) => workspaceApi.comment(projectId, { ...data, targetKind, targetId }));
  return <section className="coord-comments"><h3>{t("Comments")}</h3>{comments.isLoading ? <Skeleton className="h-16 w-full" /> : comments.isError ? <WorkspaceError error={comments.error} retry={() => void comments.refetch()} /> : <><CommentItems items={comments.data?.items ?? []} /><WorkspacePager data={comments.data} page={page} onPage={setPage} /></>}
    {!readOnly && <WorkspaceComposer projectId={projectId} allowMentions={!mentor} pending={add.isPending} error={add.error} onSubmit={data => add.mutateAsync(data)} />}</section>;
}
export function CommentItems({ items }: { items: WorkspaceComment[] }) {
  const { t } = useI18n();
  return items.length ? <ol className="coord-comment-list">{items.map(item => <li key={item.id}><div><strong>{item.author.name}</strong><WorkspaceDate value={item.createdAt} /></div><p>{item.body}</p></li>)}</ol> : <p className="coord-muted">{t("No comments yet. Leave a question or a suggestion for the team.")}</p>;
}
export function WorkspaceComposer({ projectId, allowMentions = true, pending, error, onSubmit }: { projectId: string; allowMentions?: boolean; pending: boolean; error: unknown; onSubmit: (data: { body: string; mentions: string[]; clientKey: string }) => Promise<unknown> }) {
  const { t } = useI18n(); const [body, setBody] = useState(""); const [mentions, setMentions] = useState<string[]>([]); const clientKey = useRef(crypto.randomUUID()); const busy = useRef(false);
  useUnsavedWorkspace(Boolean(body.trim()));
  return <form className="coord-composer" onSubmit={async e => { e.preventDefault(); if (busy.current || !body.trim()) return; busy.current = true; try { await onSubmit({ body, mentions, clientKey: clientKey.current }); setBody(""); setMentions([]); clientKey.current = crypto.randomUUID(); } catch { /* Input remains available for retry. */ } finally { busy.current = false; } }}>
    <label>{t("Add a comment")}<textarea value={body} onChange={e => setBody(e.target.value)} maxLength={10000} rows={3} required disabled={pending} /></label>
    {allowMentions && <details><summary>{t("Notify a teammate")}</summary><WorkspacePeoplePicker projectId={projectId} value={mentions} onChange={setMentions} multiple /></details>}
    {Boolean(error) && <WorkspaceError error={error} />}<Button size="sm" disabled={pending || !body.trim()}>{t(pending ? "Sending…" : "Send comment")}</Button>
  </form>;
}
export function WorkspaceHistory({ items }: { items: WorkspaceRevision[] }) {
  const { t } = useI18n();
  return <ol className="coord-history">{items.map(item => <li key={item.id}><details><summary><span>{t("Version {{version}}", { version: item.version })} · {item.actor.name}</span><WorkspaceDate value={item.createdAt} /></summary><dl>{Object.entries(item.snapshot).filter(([key]) => !["projectId", "clientKey", "id", "createdById", "recordedById", "authorId", "creationInput"].includes(key)).map(([key, value]) => <div key={key}><dt>{t(key)}</dt><dd>{typeof value === "object" ? JSON.stringify(value) : String(value ?? "")}</dd></div>)}</dl></details></li>)}</ol>;
}
export function WorkspaceEmpty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="coord-empty"><h3>{title}</h3><div>{children}</div></div>;
}
export type { WorkspacePerson };
