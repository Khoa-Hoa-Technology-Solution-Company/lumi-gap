import { useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { DiscussionCategory, SaveWorkspaceDiscussion, WorkspaceDiscussion } from "@trend/shared-types";
import { ArrowLeft, MessageSquare, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";

import { workspaceApi } from "../api/workspace.api";
import { useWorkspaceCommand, useWorkspaceResource } from "../hooks/use-workspace";
import { canLeaveWorkspace, CommentItems, useUnsavedWorkspace, WorkspaceArtifactLink, WorkspaceArtifactPicker, WorkspaceComposer, WorkspaceDate, WorkspaceEmpty, WorkspaceError, WorkspaceHeading, WorkspaceHistory, WorkspaceLoading, WorkspacePager, WorkspacePeoplePicker } from "./workspace-common";
import { WorkspaceDecisions } from "./workspace-decisions";

export const categoryLabels: Record<DiscussionCategory, string> = { GENERAL: "General", RESEARCH_QUESTION: "Research question", EVIDENCE: "Evidence", DECISION_NEEDED: "Decision needed", MENTOR_QUESTION: "Mentor question" };
export function WorkspaceDiscussionsPanel({ projectId, readOnly, owner = false, mentor = false, legacyChat }: { projectId: string; readOnly: boolean; owner?: boolean; mentor?: boolean; legacyChat?: ReactNode }) {
  const { t } = useI18n(); const [params, setParams] = useSearchParams();
  const view = mentor ? "threads" : params.get("discussionView") ?? "threads"; const selected = params.get("discussion");
  const navigate = (next: { view?: string; discussion?: string | null; fromThread?: string | null }, checkDraft = true) => {
    if (checkDraft && !canLeaveWorkspace()) return;
    const search = new URLSearchParams(params);
    for (const [key, value] of Object.entries({ discussionView: next.view, discussion: next.discussion, fromThread: next.fromThread })) { if (value === null) search.delete(key); else if (value !== undefined) search.set(key, value); }
    setParams(search, { replace: true });
  };
  return <div className="coord-discussions" data-no-i18n><WorkspaceHeading title={t("Discussions")} description={t(mentor ? "Questions shared with you by this research team." : "Discuss the evidence, close open questions and keep a record of decisions.")} action={!readOnly && !mentor && view === "threads" && <Button size="sm" onClick={() => navigate({ discussion: "new" })}><Plus className="mr-2 h-4 w-4" />{t("New discussion")}</Button>} />
    {!mentor && <div className="coord-subnav" aria-label={t("Discussion views")}><button type="button" aria-current={view === "threads" ? "page" : undefined} onClick={() => navigate({ view: "threads", discussion: null })}>{t("Threads")}</button><button type="button" aria-current={view === "decisions" ? "page" : undefined} onClick={() => navigate({ view: "decisions", discussion: null })}>{t("Decision log")}</button>{legacyChat && <button type="button" aria-current={view === "chat" ? "page" : undefined} onClick={() => navigate({ view: "chat", discussion: null })}>{t("Team chat & AI")}</button>}</div>}
    {view === "decisions" ? <WorkspaceDecisions projectId={projectId} readOnly={readOnly} fromThread={params.get("fromThread")} /> : view === "chat" && legacyChat ? legacyChat : selected ? <DiscussionDetail key={selected} projectId={projectId} selected={selected} readOnly={readOnly} owner={owner} mentor={mentor} onClose={() => navigate({ discussion: null })} onSaved={id => navigate({ discussion: id }, false)} onRecordDecision={id => navigate({ view: "decisions", fromThread: id, discussion: null })} /> : <DiscussionList projectId={projectId} onSelect={discussion => navigate({ discussion })} />}
  </div>;
}
function DiscussionList({ projectId, onSelect }: { projectId: string; onSelect: (id: string) => void }) {
  const { t } = useI18n(); const [q, setQ] = useState(""); const [search, setSearch] = useState(""); const [status, setStatus] = useState(""); const [page, setPage] = useState(1);
  const query = { q, status: status || undefined, page }; const threads = useWorkspaceResource(projectId, "discussions", () => workspaceApi.discussions(projectId, query), query);
  return <><div className="coord-toolbar"><form className="coord-search" onSubmit={e => { e.preventDefault(); setQ(search.trim()); setPage(1); }}><input type="search" placeholder={t("Search discussions…")} aria-label={t("Search discussions")} value={search} maxLength={200} onChange={e => setSearch(e.target.value)} /><Button size="sm" variant="ghost">{t("Search")}</Button></form><select aria-label={t("Discussion status")} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="">{t("All discussions")}</option><option value="OPEN">{t("Open")}</option><option value="RESOLVED">{t("Resolved")}</option></select>{(q || status) && <Button size="sm" variant="ghost" onClick={() => { setQ(""); setSearch(""); setStatus(""); setPage(1); }}>{t("Reset")}</Button>}</div>
    {threads.isLoading ? <WorkspaceLoading /> : threads.isError ? <WorkspaceError error={threads.error} retry={() => void threads.refetch()} /> : !threads.data?.items.length ? <WorkspaceEmpty title={t("Make room for a research conversation")}><p>{t("Discuss a paper, ask a question or work through a decision with your team.")}</p></WorkspaceEmpty> : <ul className="coord-thread-list">{threads.data.items.map(thread => <li key={thread.id}><button type="button" onClick={() => onSelect(thread.id)}><MessageSquare size={18} aria-hidden="true" /><span><span className="coord-thread-meta">{t(categoryLabels[thread.category])}<span className="coord-status" data-status={thread.status}>{t(thread.status === "OPEN" ? "Open" : "Resolved")}</span>{thread.mentorRelationshipId && <span>{t("Shared with mentor")}</span>}</span><strong>{thread.title}</strong><small>{thread.author.name} · <WorkspaceDate value={thread.updatedAt} /></small></span><span className="coord-reply-count">{t("{{count}} replies", { count: thread.replyCount })}</span></button></li>)}</ul>}<WorkspacePager data={threads.data} page={page} onPage={setPage} /></>;
}
export function DiscussionDetail({ projectId, selected, readOnly, owner, mentor, onClose, onSaved, onRecordDecision }: { projectId: string; selected: string; readOnly: boolean; owner: boolean; mentor: boolean; onClose: () => void; onSaved: (id: string) => void; onRecordDecision: (id: string) => void }) {
  const { t } = useI18n(); const [page, setPage] = useState(1); const [editing, setEditing] = useState(false); const [replyTo, setReplyTo] = useState<string | null>(null);
  const detail = useWorkspaceResource(projectId, "discussion", () => workspaceApi.discussion(projectId, selected, page), { selected, page }, selected !== "new");
  const reply = useWorkspaceCommand(projectId, (data: { body: string; mentions: string[]; clientKey: string }) => workspaceApi.reply(projectId, selected, { ...data, replyToId: replyTo }));
  if (selected !== "new" && detail.isLoading) return <WorkspaceLoading />;
  if (selected !== "new" && !detail.data) return <WorkspaceError error={detail.error} retry={() => void detail.refetch()} />;
  const thread = detail.data?.thread;
  return <section className="coord-thread-detail"><Button size="sm" variant="ghost" onClick={onClose}><ArrowLeft className="mr-2 h-4 w-4" />{t("Back to discussions")}</Button>
    {selected === "new" || editing ? <DiscussionEditor projectId={projectId} thread={thread} owner={owner} onSaved={id => { setEditing(false); onSaved(id); }} /> : thread && <><header className="coord-thread-heading"><div className="coord-thread-meta"><span>{t(categoryLabels[thread.category])}</span><span className="coord-status" data-status={thread.status}>{t(thread.status === "OPEN" ? "Open" : "Resolved")}</span></div><h3>{thread.title}</h3><p>{thread.author.name} · <WorkspaceDate value={thread.createdAt} /></p></header>
      {thread.mentorRelationshipId && <p className="coord-share-notice">{t("This discussion and its replies are shared with the selected mentor.")}</p>}
      {thread.planContext && <p className="text-xs text-muted-foreground">{t(thread.planContext.revisionId ? "Immutable version {{version}}" : "Draft at revision {{version}}", { version: thread.planContext.draftVersion })} · {t(thread.planContext.section)}</p>}
      <p className="coord-thread-body">{thread.body}</p>{!mentor && <WorkspaceArtifactLink projectId={projectId} link={thread.link} />}
      {!readOnly && !mentor && detail.data?.canEdit && <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>{t("Edit discussion")}</Button>}
      {thread.conclusion && <section className="coord-conclusion"><h4>{t("Conclusion")}</h4><p>{thread.conclusion}</p></section>}
      <h4 className="coord-subheading">{t("Replies")}</h4><CommentItems items={detail.data?.messages.items ?? []} />
      {detail.data?.canReply && !readOnly && <><label className="coord-reply-select">{t("Reply to")}<select value={replyTo ?? ""} onChange={e => setReplyTo(e.target.value || null)}><option value="">{t("Whole discussion")}</option>{detail.data.messages.items.map(message => <option key={message.id} value={message.id}>{message.author.name}: {message.body.slice(0, 100)}</option>)}</select></label><WorkspaceComposer projectId={projectId} allowMentions={!mentor} pending={reply.isPending} error={reply.error} onSubmit={async data => { await reply.mutateAsync(data); setReplyTo(null); }} /></>}
      <WorkspacePager data={detail.data?.messages} page={page} onPage={setPage} />
      <ThreadHistory projectId={projectId} threadId={thread.id} />
      {!mentor && <>{detail.data?.canResolve && <DiscussionResolution key={thread.id} projectId={projectId} thread={thread} />}{!readOnly && !thread.planContext && <Button size="sm" variant="outline" onClick={() => onRecordDecision(thread.id)}>{t("Record a decision from this discussion")}</Button>}</>}
    </>}
  </section>;
}
function DiscussionEditor({ projectId, thread, owner, onSaved }: { projectId: string; thread?: WorkspaceDiscussion; owner: boolean; onSaved: (id: string) => void }) {
  const { t } = useI18n(); const [params] = useSearchParams(); const sourceGap = params.get("targetGap");
  const initial: SaveWorkspaceDiscussion = { title: thread?.title ?? "", body: thread?.body ?? "", category: thread?.category ?? (sourceGap ? "EVIDENCE" : "GENERAL"), link: thread?.link ?? (sourceGap ? { kind: "GAP", id: sourceGap } : null), mentorRelationshipId: thread?.mentorRelationshipId ?? null };
  const [form, setForm] = useState(initial); const [mentions, setMentions] = useState<string[]>([]); const key = useRef(crypto.randomUUID()); const busy = useRef(false); const [saved, setSaved] = useState(false);
  const [baseline, setBaseline] = useState(initial); const [expectedVersion, setExpectedVersion] = useState(thread?.version);
  const shares = useWorkspaceResource(projectId, "plan-shares", () => workspaceApi.shares(projectId), null, owner);
  const save = useWorkspaceCommand(projectId, () => workspaceApi.saveDiscussion(projectId, { ...form, mentions, ...(thread ? { expectedVersion } : { clientKey: key.current }) }, thread?.id));
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline) || mentions.length > 0;
  useUnsavedWorkspace(!saved && dirty);
  const sharedOptions = shares.data?.filter(share => !share.revokedAt) ?? [];
  return <form className="coord-editor" onSubmit={async e => { e.preventDefault(); if (busy.current) return; busy.current = true; try { const result = await save.mutateAsync(); setSaved(true); onSaved(result.id); } catch { /* Keep the draft. */ } finally { busy.current = false; } }}><h3>{t(thread ? "Edit discussion" : "New discussion")}</h3>{thread && thread.version !== expectedVersion && <div role="status" className="coord-share-notice"><p>{t("A newer version is available. Your draft has been kept.")}</p><Button type="button" size="sm" variant="outline" onClick={() => { if (!dirty || canLeaveWorkspace()) { setForm(initial); setBaseline(initial); setExpectedVersion(thread.version); setMentions([]); } }}>{t("Load latest version")}</Button></div>}<fieldset className="coord-field-stack" disabled={save.isPending}>
    <label>{t("Discussion title")}<input required maxLength={240} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label><label>{t("Category")}<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value as DiscussionCategory, mentorRelationshipId: null })}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
    <label>{t("Discussion content")}<textarea required rows={6} maxLength={10000} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} /></label>
    {form.category === "MENTOR_QUESTION" && owner && <label>{t("Share with mentor, optional")}<select value={form.mentorRelationshipId && form.link ? `${form.mentorRelationshipId}:${form.link.id}` : ""} onChange={e => { const share = sharedOptions.find(item => `${item.relationshipId}:${item.revisionId}` === e.target.value); setForm({ ...form, mentorRelationshipId: share?.relationshipId ?? null, link: share ? { kind: "PLAN_REVISION", id: share.revisionId } : null }); }}><option value="">{t("Team only")}</option>{sharedOptions.map(share => <option key={share.id} value={`${share.relationshipId}:${share.revisionId}`}>{share.mentor.name} · {t("Version {{version}}", { version: share.version })}</option>)}</select><small>{t("Share a plan revision first. The selected mentor can read this entire discussion and reply.")}</small></label>}
    {!form.mentorRelationshipId && <WorkspaceArtifactPicker projectId={projectId} value={form.link} onChange={link => setForm({ ...form, link })} />}
    <details><summary>{t("Notify a teammate")}</summary><WorkspacePeoplePicker projectId={projectId} value={mentions} onChange={setMentions} multiple /></details></fieldset>
    {save.error && <WorkspaceError error={save.error} />}<div className="coord-form-actions"><span>{t(form.mentorRelationshipId ? "Shared with mentor" : "Visible to project members")}</span><Button disabled={save.isPending || !form.title.trim() || !form.body.trim()}>{t("Save discussion")}</Button></div>
  </form>;
}
function DiscussionResolution({ projectId, thread }: { projectId: string; thread: WorkspaceDiscussion }) {
  const { t } = useI18n(); const [baseline, setBaseline] = useState(thread); const [conclusion, setConclusion] = useState(thread.conclusion); const busy = useRef(false);
  const dirty = conclusion !== baseline.conclusion; useUnsavedWorkspace(dirty);
  const save = useWorkspaceCommand(projectId, () => workspaceApi.resolve(projectId, thread.id, { expectedVersion: baseline.version, status: baseline.status === "OPEN" ? "RESOLVED" : "OPEN", conclusion }));
  return <details className="coord-resolution"><summary>{t(baseline.status === "OPEN" ? "Resolve this discussion" : "Reopen this discussion")}</summary><form onSubmit={async e => { e.preventDefault(); if (busy.current) return; busy.current = true; try { const result = await save.mutateAsync(); setBaseline({ ...baseline, conclusion, status: baseline.status === "OPEN" ? "RESOLVED" : "OPEN", version: result.version }); } catch { /* Keep the conclusion and original version. */ } finally { busy.current = false; } }}>{thread.version !== baseline.version && <div role="status" className="coord-share-notice"><p>{t("A newer version is available. Your draft has been kept.")}</p><Button type="button" size="sm" variant="outline" onClick={() => { if (!dirty || canLeaveWorkspace()) { setBaseline(thread); setConclusion(thread.conclusion); } }}>{t("Load latest version")}</Button></div>}<label>{t("Conclusion")}<textarea rows={3} required={baseline.status === "OPEN"} maxLength={10000} value={conclusion} onChange={e => setConclusion(e.target.value)} /></label>{save.error && <WorkspaceError error={save.error} />}<Button size="sm" disabled={save.isPending || baseline.status === "OPEN" && !conclusion.trim()}>{t(baseline.status === "OPEN" ? "Save conclusion and resolve" : "Reopen discussion")}</Button></form></details>;
}
function ThreadHistory({ projectId, threadId }: { projectId: string; threadId: string }) {
  const { t } = useI18n(); const [open, setOpen] = useState(false); const [page, setPage] = useState(1);
  const history = useWorkspaceResource(projectId, "discussion-history", () => workspaceApi.history(projectId, "discussions", threadId, page), { threadId, page }, open);
  return <details className="coord-history-panel" onToggle={e => setOpen(e.currentTarget.open)}><summary>{t("Discussion history")}</summary>{history.isLoading ? <WorkspaceLoading /> : history.isError ? <WorkspaceError error={history.error} retry={() => void history.refetch()} /> : <WorkspaceHistory items={history.data?.items ?? []} />}<WorkspacePager data={history.data} page={page} onPage={setPage} /></details>;
}

export function WorkspaceMentorPlanLink({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  return <Link className="coord-inline-link" to={`/projects/${encodeURIComponent(projectId)}/plan-review`}>{t("Open shared plan and questions")}</Link>;
}
