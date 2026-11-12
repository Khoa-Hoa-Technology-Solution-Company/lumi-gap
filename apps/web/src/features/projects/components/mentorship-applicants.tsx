import { useRef, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LecturerMatchEvidence, MentorshipApplicationView, MentorProjectPreview } from "@trend/shared-types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { mentorshipApplicationsApi as api } from "../api/mentorship-applications.api";
import { canLeaveWorkspace, useUnsavedWorkspace } from "./workspace-common";

export const applicationLabels = { APPLIED: "Applied", SHORTLISTED: "Shortlisted", INVITED: "Official invitation sent", ACCEPTED: "Mentorship accepted", DECLINED: "Application declined", WITHDRAWN: "Application withdrawn", CLOSED: "Application closed" } as const;
const terms = (value: string) => [...new Set(value.split(",").map(term => term.trim()).filter(Boolean))];
function ErrorMessage({ error }: { error: unknown }) {
  const { t } = useI18n();
  const message = (error as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
  return <p role="alert" className="text-sm text-destructive">{t(message ?? "Could not update the application. Your input is kept.")}</p>;
}
function useRefreshApplications() {
  const cache = useQueryClient();
  return () => { for (const key of ["academic-support", "notifications"]) void cache.invalidateQueries({ queryKey: [key] }); };
}
export function MentorshipApplicationDialog({ project, onClose }: { project: MentorProjectPreview; onClose: () => void }) {
  const { t } = useI18n(), userId = useAuthStore(s => s.user?.id), refresh = useRefreshApplications();
  const availableRoles = project.availableRoles ?? (["PRIMARY", "SECONDARY"] as const);
  const [draft, setDraft] = useState({ message: "", availability: "", areas: "", methodologies: "", capabilities: "", mentorRole: availableRoles[0] ?? "PRIMARY" });
  const [key] = useState(() => crypto.randomUUID()), lock = useRef(false);
  useUnsavedWorkspace(Boolean(draft.message || draft.availability || draft.areas || draft.capabilities || draft.methodologies));
  const send = useMutation({ mutationFn: () => {
    if (useAuthStore.getState().user?.id !== userId) throw new Error("Account changed");
    return api.apply(project.id, { ...draft, message: draft.message.trim(), availability: draft.availability.trim(), areas: terms(draft.areas), methodologies: terms(draft.methodologies), capabilities: terms(draft.capabilities), idempotencyKey: key });
  }, onSuccess: () => { refresh(); onClose(); } });
  const close = async () => { if (!send.isPending && await canLeaveWorkspace()) onClose(); };
  return <Dialog open onOpenChange={open => { if (!open) void close(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{t("Express mentoring interest")}</DialogTitle><DialogDescription>{t("Applying does not reserve a mentor position or grant project access.")}</DialogDescription></DialogHeader>
    <div className="space-y-2 border-b pb-4"><h3 className="font-semibold">{project.title}</h3><p className="whitespace-pre-wrap text-sm leading-6">{project.summary}</p><p className="text-sm text-muted-foreground">{project.mentoringNeeds}</p>{Boolean(project.methodologies?.length) && <p className="text-sm">{t("Methods requested")}: {project.methodologies!.join(", ")}</p>}</div>
    <form className="space-y-4" onSubmit={async event => { event.preventDefault(); if (lock.current) return; lock.current = true; try { await send.mutateAsync(); } catch { /* Retain the application for retry. */ } finally { lock.current = false; } }}>
      <fieldset disabled={send.isPending} className="space-y-4">
        <div className="space-y-2"><Label htmlFor="application-message">{t("How can you guide this research?")}</Label><textarea id="application-message" className="min-h-28 w-full rounded-md border bg-background p-3 text-sm" required minLength={20} maxLength={2000} value={draft.message} onChange={e => setDraft({ ...draft, message: e.target.value })} /></div>
        {([['areas', 'Research areas you can support'], ['methodologies', 'Methods you can support'], ['capabilities', 'Mentoring support offered']] as const).map(([field, label]) => <div key={field} className="space-y-2"><Label htmlFor={`application-${field}`}>{t(label)}</Label><input id={`application-${field}`} className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft[field]} maxLength={1200} onChange={e => setDraft({ ...draft, [field]: e.target.value })} /><p className="text-xs text-muted-foreground">{t("Separate up to 10 terms with commas.")}</p></div>)}
        <div className="space-y-2"><Label htmlFor="application-availability">{t("Availability and feedback commitment")}</Label><textarea id="application-availability" className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" required minLength={10} maxLength={1000} value={draft.availability} onChange={e => setDraft({ ...draft, availability: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="application-role">{t("Preferred mentoring role")}</Label><select id="application-role" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft.mentorRole} onChange={e => setDraft({ ...draft, mentorRole: e.target.value as "PRIMARY" | "SECONDARY" })}>{availableRoles.map(role => <option key={role} value={role}>{t(role === "PRIMARY" ? "Primary mentor" : "Secondary mentor")}</option>)}</select></div>
      </fieldset>
      {send.isError && <ErrorMessage error={send.error} />}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={send.isPending} onClick={() => void close()}>{t("Cancel")}</Button><Button type="submit" disabled={send.isPending || !availableRoles.includes(draft.mentorRole) || draft.message.trim().length < 20 || draft.availability.trim().length < 10}>{t(send.isPending ? "Sending…" : "Submit application")}</Button></div>
    </form>
  </DialogContent></Dialog>;
}
export function ApplicantEvidence({ evidence }: { evidence: LecturerMatchEvidence }) {
  const { t } = useI18n();
  return <div className="space-y-5 text-sm leading-6 [overflow-wrap:anywhere]">
    <section><h4 className="font-semibold">{t("Identity verification")}</h4><p>{t(evidence.verifiedLecturer ? "Verified Lecturer" : "Lecturer verification unavailable")}</p><p className="text-xs text-muted-foreground">{t("Identity verification does not certify research fit or mentoring quality.")}</p>{evidence.identities.map((identity, index) => <p key={index}><a href={identity.href} target="_blank" rel="noopener noreferrer" className="text-primary underline">{identity.provider}</a> · {t(identity.verified ? "Verified identity link" : "Self-declared identity link")}</p>)}</section>
    <section><h4 className="font-semibold">{t("Research topic evidence")}</h4>{evidence.topics.length ? <ul className="space-y-1">{evidence.topics.map((topic, index) => <li key={index}>{topic.term} <span className="text-xs text-muted-foreground">· {t(topic.source === "PUBLICATION_TITLE" ? "Publication title" : topic.source === "PROFILE_DECLARATION" ? "Profile declaration" : "Application declaration")}</span></li>)}</ul> : <p>{t("No matching evidence available.")}</p>}</section>
    <section><h4 className="font-semibold">{t("Methodology relevance")}</h4><p>{evidence.methodologies.join(", ") || t("No matching evidence available.")}</p><p className="text-xs text-muted-foreground">{t("Methods are explicitly declared by the applicant, not independently verified.")}</p></section>
    <section><h4 className="font-semibold">{t("Mentoring needs compatibility")}</h4><p>{evidence.mentoringNeeds.join(", ") || t("Review the declared support and clarify expectations.")}</p></section>
    <section><h4 className="font-semibold">{t("Relevant public publications")}</h4>{evidence.publications.length ? <ul className="divide-y">{evidence.publications.map((publication, index) => <li key={index} className="space-y-1 py-3">{publication.href ? <a href={publication.href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-4">{publication.title}</a> : <p className="font-medium">{publication.title}</p>}<p className="text-xs text-muted-foreground">{[publication.year, publication.source, t(publication.attribution === "LINKED_IDENTITY" ? "Linked through verified identity" : "Authorship self-declared")].filter(Boolean).join(" · ")}</p><p className="text-xs">{t("Matched topics")}: {publication.matchedTerms.join(", ")}</p></li>)}</ul> : <p>{t("No matching evidence available.")}</p>}</section>
    <section className="border-t pt-4"><h4 className="font-semibold">{t("Unknowns and limitations")}</h4><ul className="list-disc space-y-2 pl-4 text-muted-foreground">{evidence.missing.map((message, index) => <li key={index}>{message.startsWith("Methodology not established: ") ? `${t("Methodology not established")}: ${message.slice(29)}` : t(message)}</li>)}</ul></section>
  </div>;
}
export function ApplicationDetailDialog({ item, onClose, onInvite }: { item: MentorshipApplicationView; onClose: () => void; onInvite?: (item: MentorshipApplicationView) => void }) {
  const { t } = useI18n(), userId = useAuthStore(s => s.user?.id), refresh = useRefreshApplications();
  const [body, setBody] = useState(""), [clientKey, setClientKey] = useState(() => crypto.randomUUID());
  useUnsavedWorkspace(Boolean(body));
  const key = ["academic-support", userId, "application-detail", item.projectId, item.id];
  const query = useQuery({ queryKey: key, queryFn: () => api.detail(item.projectId, item.id), retry: false, refetchInterval: 15000 });
  const action = useMutation({ mutationFn: (kind: "SHORTLIST" | "DECLINE" | "WITHDRAW") => {
    if (useAuthStore.getState().user?.id !== userId || !query.data) throw new Error("Account or application changed");
    return api.action(item.projectId, query.data, kind);
  }, onSuccess: refresh, onError: refresh });
  const note = useMutation({ mutationFn: () => { if (useAuthStore.getState().user?.id !== userId) throw new Error("Account changed"); return api.note(item.projectId, item.id, body.trim(), clientKey); }, onSuccess: () => { setBody(""); setClientKey(crypto.randomUUID()); refresh(); } });
  const data = query.data, busy = action.isPending || note.isPending;
  const close = async () => { if (!busy && await canLeaveWorkspace()) onClose(); };
  return <Dialog open onOpenChange={open => { if (!open) void close(); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{t("Mentoring application")} · {item.lecturer.name}</DialogTitle><DialogDescription>{item.project.title}</DialogDescription></DialogHeader>
    {query.isLoading ? <Skeleton className="h-48" /> : query.isError ? <div className="space-y-3"><ErrorMessage error={query.error} /><Button variant="outline" onClick={() => void query.refetch()}>{t("Try again")}</Button></div> : data && <div className="space-y-6">
      <p className="text-sm font-medium">{t(applicationLabels[data.status])}{data.invitation && ` · ${t(data.invitation.status)}`}</p>
      <a href={`/academics/${encodeURIComponent(data.lecturer.id)}`} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">{t("View academic profile")}</a>
      <section className="space-y-3"><h3 className="font-semibold">{t("Applicant statement")}</h3><p className="whitespace-pre-wrap break-words text-sm leading-6">{data.message}</p><p className="text-sm">{t("Mentoring support offered")}: {data.capabilities.join(", ") || t("Not specified")}</p><h4 className="text-sm font-medium">{t("Availability and feedback commitment")} · {t("Self-declared")}</h4><p className="whitespace-pre-wrap break-words text-sm">{data.availability}</p></section>
      {data.evidence && <ApplicantEvidence evidence={data.evidence} />}
      <section className="space-y-3 border-t pt-5"><h3 className="font-semibold">{t("Clarify expectations")}</h3><p className="text-xs text-muted-foreground">{t("Only the owner and this applicant can read these questions. No private research resources are shared.")}</p>
        <ol className="space-y-3">{data.notes.map(entry => <li key={entry.id} className="space-y-1 border-b pb-3 text-sm"><p className="font-medium">{entry.authorName} <time className="text-xs font-normal text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</time></p><p className="whitespace-pre-wrap break-words leading-6">{entry.body}</p></li>)}</ol>
        {data.canClarify && <form onSubmit={e => { e.preventDefault(); if (!busy) note.mutate(); }} className="space-y-2"><Label htmlFor="application-question">{t("Question or clarification")}</Label><textarea id="application-question" className="min-h-24 w-full rounded-md border bg-background p-3 text-sm" disabled={busy} required minLength={5} maxLength={2000} value={body} onChange={e => setBody(e.target.value)} placeholder={t("Ask about methods, feedback frequency or limitations.")} /><Button type="submit" disabled={busy || body.trim().length < 5}>{t("Send clarification")}</Button></form>}
      </section>
      {(action.error || note.error) && <ErrorMessage error={action.error || note.error} />}
      <div className="flex flex-wrap gap-2 border-t pt-4">{data.canManage && ["APPLIED", "SHORTLISTED"].includes(data.status) && <><Button variant="outline" disabled={busy || data.status === "SHORTLISTED"} onClick={() => action.mutate("SHORTLIST")}>{t("Shortlist applicant")}</Button><Button variant="ghost" disabled={busy} onClick={() => action.mutate("DECLINE")}>{t("Decline application")}</Button></>}{data.canInvite && onInvite && <Button disabled={busy || Boolean(body)} onClick={() => { onClose(); onInvite(data); }}>{t("Prepare official invitation")}</Button>}{data.canWithdraw && <Button variant="outline" disabled={busy} onClick={() => action.mutate("WITHDRAW")}>{t("Withdraw application")}</Button>}</div>
    </div>}
  </DialogContent></Dialog>;
}
export function MentorshipApplicantPool({ projectId, onInvite }: { projectId: string; onInvite: (item: MentorshipApplicationView) => void }) {
  const { t } = useI18n(), userId = useAuthStore(s => s.user?.id);
  const [page, setPage] = useState(1), [detail, setDetail] = useState<MentorshipApplicationView>(), [selected, setSelected] = useState<MentorshipApplicationView[]>([]), [comparing, setComparing] = useState(false);
  const query = useQuery({ queryKey: ["academic-support", userId, "applicants", projectId, page], queryFn: () => api.list(projectId, page), retry: false });
  const comparisons = useQueries({ queries: selected.map(item => ({ queryKey: ["academic-support", userId, "application-detail", projectId, item.id], queryFn: () => api.detail(projectId, item.id), enabled: comparing, retry: false })) });
  return <section className="space-y-4 border-b pb-6" aria-label={t("Mentor applicants")}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{t("Mentor applicants")}{query.data && ` (${query.data.meta.total})`}</h3><p className="mt-1 max-w-prose text-sm leading-6 text-muted-foreground">{t("Applications do not reserve mentor positions. Review applicant evidence before sending an official invitation.")}</p></div><Button variant="outline" disabled={selected.length < 2} onClick={() => setComparing(true)}>{t("Compare applicants")} ({selected.length}/3)</Button></div>
    {query.isLoading ? <Skeleton className="h-32" /> : query.isError ? <div className="space-y-2"><ErrorMessage error={query.error} /><Button variant="outline" onClick={() => void query.refetch()}>{t("Try again")}</Button></div> : !query.data?.items.length ? <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{t("No applications yet. Enable lecturer discovery to collect interest without reserving positions.")}</p> : <ul className="divide-y">{query.data.items.map(item => <li key={item.id} className="flex flex-wrap items-center gap-3 py-4"><input type="checkbox" aria-label={`${t("Select for comparison")}: ${item.lecturer.name}`} checked={selected.some(s => s.id === item.id)} disabled={selected.length === 3 && !selected.some(s => s.id === item.id)} onChange={e => setSelected(e.target.checked ? [...selected, item] : selected.filter(s => s.id !== item.id))} /><div className="min-w-0 flex-1"><p className="break-words font-medium">{item.lecturer.name}</p><p className="text-xs text-muted-foreground">{t(applicationLabels[item.status])} · {t(item.lecturer.verifiedLecturer ? "Verified Lecturer" : "Lecturer verification unavailable")}</p><p className="mt-1 line-clamp-2 text-sm">{item.message}</p></div><Button variant="outline" size="sm" onClick={() => setDetail(item)}>{t("Review applicant evidence")}</Button></li>)}</ul>}
    {query.data && query.data.meta.totalPages > 1 && <div className="flex items-center justify-end gap-3 text-sm"><Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("Previous")}</Button><span>{page}/{query.data.meta.totalPages}</span><Button variant="ghost" disabled={page >= query.data.meta.totalPages} onClick={() => setPage(page + 1)}>{t("Next")}</Button></div>}
    {detail && <ApplicationDetailDialog item={detail} onClose={() => setDetail(undefined)} onInvite={onInvite} />}
    {comparing && <Dialog open onOpenChange={setComparing}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-6xl"><DialogHeader><DialogTitle>{t("Compare applicants")}</DialogTitle><DialogDescription>{t("Compare evidence and declared commitments. The project owner makes the decision.")}</DialogDescription></DialogHeader><div className={`grid gap-6 ${selected.length === 3 ? "lg:grid-cols-3" : "md:grid-cols-2"}`}>{comparisons.map((result, index) => <article key={selected[index]!.id} className="min-w-0 space-y-4"><h3 className="text-lg font-semibold">{selected[index]!.lecturer.name}</h3>{result.isLoading ? <Skeleton className="h-64" /> : result.isError ? <div className="space-y-2"><ErrorMessage error={result.error} /><Button variant="outline" onClick={() => void result.refetch()}>{t("Try again")}</Button></div> : result.data && <><p className="text-xs">{t(applicationLabels[result.data.status])}</p><h4 className="text-sm font-medium">{t("Availability and feedback commitment")} · {t("Self-declared")}</h4><p className="whitespace-pre-wrap break-words text-sm">{result.data.availability}</p><p className="text-sm">{t("Mentoring support offered")}: {result.data.capabilities.join(", ") || t("Not specified")}</p>{result.data.evidence && <ApplicantEvidence evidence={result.data.evidence} />}{result.data.canInvite && <Button onClick={() => { setComparing(false); onInvite(result.data!); }}>{t("Prepare official invitation")}</Button>}</>}</article>)}</div></DialogContent></Dialog>}
  </section>;
}
export function MyMentorshipApplications() {
  const { t } = useI18n(), userId = useAuthStore(s => s.user?.id);
  const [page, setPage] = useState(1), [detail, setDetail] = useState<MentorshipApplicationView>();
  const query = useQuery({ queryKey: ["academic-support", userId, "my-applications", page], queryFn: () => api.mine(page), retry: false });
  return <section className="space-y-3" aria-label={t("My mentoring applications")}><h2 className="font-semibold">{t("My mentoring applications")}</h2>{query.isLoading ? <Skeleton className="h-32" /> : query.isError ? <div className="space-y-2"><ErrorMessage error={query.error} /><Button variant="outline" onClick={() => void query.refetch()}>{t("Try again")}</Button></div> : !query.data?.items.length ? <p className="text-sm text-muted-foreground">{t("You have not applied to mentor a team yet.")}</p> : <ul className="divide-y">{query.data.items.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><h3 className="font-medium">{item.project.title}</h3><p className="text-sm text-muted-foreground">{t(applicationLabels[item.status])}</p></div><Button variant="outline" onClick={() => setDetail(item)}>{t("View application")}</Button></li>)}</ul>}{query.data && query.data.meta.totalPages > 1 && <div className="flex gap-2"><Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("Previous")}</Button><Button variant="ghost" disabled={page >= query.data.meta.totalPages} onClick={() => setPage(page + 1)}>{t("Next")}</Button></div>}{detail && <ApplicationDetailDialog item={detail} onClose={() => setDetail(undefined)} />}</section>;
}
