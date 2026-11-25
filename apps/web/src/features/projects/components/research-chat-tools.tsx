import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BookOpen, CheckSquare, FileText, Plus, X } from "lucide-react";
import type { ProjectChatReference, ProjectTeamChatMessage } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { projectTeamChatApi } from "../api/project-team-chat.api";
import { workspaceApi } from "../api/workspace.api";

const chatReferenceLabels = { PAPER: "Share paper", TASK: "Share task", MANUSCRIPT_SNAPSHOT: "Share manuscript snapshot", SUBMISSION_REVISION: "Share submitted version" } as const;
const icons = { PAPER: BookOpen, TASK: CheckSquare, MANUSCRIPT_SNAPSHOT: FileText, SUBMISSION_REVISION: FileText };
export function ChatShareMenu({ onChoose, disabled }: { onChoose: (kind: ProjectChatReference["kind"]) => void; disabled: boolean }) {
  const { t } = useI18n(); const chosen = useRef<ProjectChatReference["kind"]>();
  return <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label={t("chat.share")}><Plus size={18} /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" onCloseAutoFocus={event => { if (chosen.current) { event.preventDefault(); const kind = chosen.current; chosen.current = undefined; requestAnimationFrame(() => onChoose(kind)); } }}>{Object.entries(chatReferenceLabels).map(([kind, label]) => { const Icon = icons[kind as ProjectChatReference["kind"]]; return <DropdownMenuItem key={kind} onSelect={() => { chosen.current = kind as ProjectChatReference["kind"]; }}><Icon size={16} />{t(label)}</DropdownMenuItem>; })}</DropdownMenuContent></DropdownMenu>;
}
export function ChatReferencePicker({ projectId, kind, onSelect, onClose }: { projectId: string; kind: ProjectChatReference["kind"]; onSelect: (ref: ProjectChatReference) => void; onClose: () => void }) {
  const { t } = useI18n(); const actor = useAuthStore(s => s.user?.id);
  const [search, setSearch] = useState(""); const [q, setQ] = useState(""); const [page, setPage] = useState(1);
  useEffect(() => { const timer = window.setTimeout(() => { setQ(search.trim()); setPage(1); }, 250); return () => clearTimeout(timer); }, [search]);
  const choices = useQuery({ queryKey: ["chat-references", projectId, actor, kind, q, page], queryFn: () => projectTeamChatApi.references(projectId, kind, q, page), retry: false });
  return <section className="research-chat-picker" aria-label={t(chatReferenceLabels[kind])}><header><strong>{t(chatReferenceLabels[kind])}</strong><Button size="icon" variant="ghost" type="button" aria-label={t("Close")} onClick={onClose}><X size={16} /></Button></header>
    <input autoFocus type="search" value={search} maxLength={200} onChange={e => setSearch(e.target.value)} aria-label={t("chat.findReference")} placeholder={t("chat.findReference")} />
    <div className="research-chat-choices" aria-busy={choices.isFetching}>{choices.isError ? <p role="alert">{t("chat.referenceUnavailable")} <button type="button" onClick={() => void choices.refetch()}>{t("Try again")}</button></p> : choices.isLoading ? <p role="status">{t("Loading…")}</p> : !choices.data?.length ? <p>{t("chat.noReferences")}</p> : choices.data.map(item => <button type="button" key={item.id} onClick={() => onSelect({ kind: item.kind, id: item.id })}><strong>{item.title}</strong><span>{item.version !== undefined ? `v${item.version} · ` : ""}{item.subtitle || (item.status ? t(item.status) : "")}</span></button>)}</div>
    <nav aria-label={t("Pagination")}><Button type="button" size="sm" variant="ghost" disabled={page === 1 || choices.isFetching} onClick={() => setPage(p => p - 1)}>{t("Previous")}</Button><span>{page}</span><Button type="button" size="sm" variant="ghost" disabled={choices.isError || choices.isFetching || (choices.data?.length ?? 0) < 30} onClick={() => setPage(p => p + 1)}>{t("Next")}</Button></nav>
  </section>;
}
export function ChatReferenceCard({ projectId, reference }: { projectId: string; reference: ProjectChatReference }) {
  const { t } = useI18n(); const actor = useAuthStore(s => s.user?.id);
  const card = useQuery({ queryKey: ["chat-reference", projectId, actor, reference.kind, reference.id], queryFn: () => projectTeamChatApi.reference(projectId, reference), retry: false, staleTime: 0, refetchInterval: 30000 });
  const Icon = icons[reference.kind];
  // An access error hides previously cached metadata as well as the destination.
  if (card.isError) return <span className="research-chat-reference" role="status"><Icon size={18} /><span>{t("chat.referenceUnavailable")}</span></span>;
  if (!card.data) return <span className="research-chat-reference" role="status">{t("Loading…")}</span>;
  return <Link className="research-chat-reference" to={card.data.href}><Icon size={20} aria-hidden="true" /><span><small>{t(reference.kind === "PAPER" ? "Paper" : reference.kind === "TASK" ? "Task" : "Manuscript")}{card.data.version !== undefined && ` · v${card.data.version}`}</small><strong>{card.data.title}</strong><span>{card.data.subtitle}{card.data.status && ` · ${t(({ TODO: "To do", IN_PROGRESS: "In progress", BLOCKED: "Blocked", DONE: "Done", SNAPSHOT: "Saved version", ARCHIVED: "Archived", submitted: "Submitted", ready_for_review: "Ready for review", in_review: "In review", completed: "Completed" } as Record<string, string>)[card.data.status] ?? card.data.status)}`}</span><small>{t("chat.openReference")}</small></span></Link>;
}
export function ChatDecisionDialog({ projectId, message, onClose }: { projectId: string; message: ProjectTeamChatMessage; onClose: () => void }) {
  const { t } = useI18n(); const client = useQueryClient(); const actor = useAuthStore(s => s.user?.id); const [decision, setDecision] = useState(""); const [rationale, setRationale] = useState(""); const key = useRef(crypto.randomUUID());
  const save = useMutation({ mutationFn: () => workspaceApi.saveDecision(projectId, { decision, rationale, context: message.content, alternatives: "", threadId: null, link: { kind: "TEAM_MESSAGE", id: message.id }, clientKey: key.current }), onSuccess: () => { void client.invalidateQueries({ queryKey: ["project-workspace", actor, projectId] }); } });
  return <Dialog open onOpenChange={open => { if (!open && !save.isPending) onClose(); }}><DialogContent className="research-chat-decision"><DialogHeader><DialogTitle>{t("chat.saveDecision")}</DialogTitle><DialogDescription>{t("chat.decisionHint")}</DialogDescription></DialogHeader>{save.isSuccess ? <div role="status"><p>{t("chat.decisionSaved")}</p><Link to={`/projects/${projectId}?tab=chat&discussionView=decisions`}>{t("Decision journal")}</Link><Button onClick={onClose}>{t("Close")}</Button></div> : <form onSubmit={e => { e.preventDefault(); if (!save.isPending) save.mutate(); }}><blockquote>{message.content || t("chat.sharedReference")}</blockquote><label>{t("Decision")}<textarea disabled={save.isPending} autoFocus required maxLength={500} rows={2} value={decision} onChange={e => { setDecision(e.target.value); key.current = crypto.randomUUID(); }} /></label><label>{t("Rationale")}<textarea disabled={save.isPending} required maxLength={10000} rows={3} value={rationale} onChange={e => { setRationale(e.target.value); key.current = crypto.randomUUID(); }} /></label>{save.isError && <p role="alert">{t("chat.decisionError")}</p>}<div><Button type="button" variant="ghost" disabled={save.isPending} onClick={onClose}>{t("Cancel")}</Button><Button disabled={save.isPending || !decision.trim() || !rationale.trim()}>{t(save.isPending ? "Saving…" : "Save decision")}</Button></div></form>}</DialogContent></Dialog>;
}
