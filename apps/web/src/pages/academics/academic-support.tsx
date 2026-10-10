import { useEffect, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AcademicPageMeta, AvailableMentor } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { useAcademicProfile } from "@/features/academic-profile/hooks/use-academic-profile";
import { PositionVerificationPanel } from "@/features/academic-profile/components/position-verification-panel";
import { ResearchTagField } from "@/features/academic-profile/components/research-focus-fields";
import { academicSupportApi, type MentorshipItem, type MentorPreview, type AcademicSearch, type ContextSection } from "@/features/projects/api/academic-support.api";
import { MentoringPreferencesPanel, useMentoringPreferences, mentorshipError } from "@/features/projects/components/mentoring-preferences";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { authApi } from "@/features/auth/api/auth.api";
import { Button } from "@/components/ui/button";
import { useReviewCenter } from "@/features/reviews";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

function useSupportRefresh() {
  const cache = useQueryClient();
  return () => { for (const key of ["academic-support", "notifications", "home-research", "projects"]) void cache.invalidateQueries({ queryKey: [key] }); };
}
function Pager({ meta, onPage }: { meta?: AcademicPageMeta; onPage: (page: number) => void }) {
  const { t } = useI18n();
  if (!meta || meta.totalPages < 2) return null;
  return <nav aria-label={t("Pagination")} className="flex items-center justify-end gap-3 pt-2 text-xs text-muted-foreground">
    <Button size="sm" variant="ghost" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>{t("Previous")}</Button>
    <span>{meta.page} / {meta.totalPages}</span><Button size="sm" variant="ghost" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>{t("Next")}</Button>
  </nav>;
}
function MentoringItems({ items, onOpen }: { items: MentorshipItem[]; onOpen?: (id: string) => void }) {
  const { t } = useI18n();
  const current = items.filter(i => i.kind === "RELATIONSHIP" ? i.status === "ACTIVE" : i.status === "PENDING");
  const history = items.filter(i => i.kind === "RELATIONSHIP" ? i.status !== "ACTIVE" : i.status !== "PENDING");
  return <div className="space-y-3"><MentorshipList items={current} onOpen={onOpen} />{history.length > 0 && <details><summary className="cursor-pointer text-xs text-muted-foreground">{t("Mentoring history")} ({history.length})</summary><div className="mt-3"><MentorshipList items={history} /></div></details>}</div>;
}
export function AcademicSupportPage() {
  const { t } = useI18n(), navigate = useNavigate(), profile = useAcademicProfile(), pref = useMentoringPreferences();
  const lecturer = profile.data?.academicRole === "LECTURER";
  const [search, setSearch] = useState(""), q = useDebouncedValue(search, 300), [page, setPage] = useState(1), [opportunityPage, setOpportunityPage] = useState(1);
  const [params, setParams] = useSearchParams(), projectId = params.get("projectId");
  const mine = useQuery({ queryKey: ["academic-support", "mine", page], queryFn: () => academicSupportApi.mine({ page }) });
  const opportunities = useQuery({ queryKey: ["academic-support", "opportunities", q, opportunityPage], queryFn: () => academicSupportApi.opportunities({ q, page: opportunityPage }), enabled: pref.data?.acceptingMentorships === true });
  return <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-7 sm:px-6" data-no-i18n>
    <header><h1 className="text-2xl font-semibold tracking-tight">{t(lecturer ? "Lecturer workspace" : "Academic Support")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("Mentoring provides project guidance. Formal review requires a separate artifact request.")}</p></header>
    {lecturer && profile.data && !pref.data?.canEnable && <div className="rounded-lg border bg-card p-4"><PositionVerificationPanel profile={profile.data} editable onEditPosition={() => navigate("/settings/academic")} /></div>}
    <div id="mentoring-settings" className="scroll-mt-24"><MentoringPreferencesPanel lecturer={lecturer} /></div>
    <div className="flex flex-wrap items-center gap-3"><Button asChild variant="outline" size="sm"><Link to="/reviews">{t("Academic Reviews")}</Link></Button><Button asChild variant="ghost" size="sm"><Link to="/projects">{t("Your projects")}</Link></Button>
      <p className="text-sm text-muted-foreground">{t("Incoming Requests")}: {mine.data?.counts.incoming ?? 0} · {t("Active Teams")}: {mine.data?.counts.active ?? 0}</p></div>
    <section className="space-y-3"><h2 className="text-base font-semibold">{t("Mentoring requests & relationships")}</h2>
      {mine.isLoading ? <p role="status">{t("Loading…")}</p> : mine.isError ? <p role="alert">{t("Unable to load mentorship requests.")}</p> : <>
        <MentoringItems items={[...(mine.data?.relationships ?? []), ...(mine.data?.requests ?? [])]} onOpen={id => setParams({ projectId: id })} />
        <Pager meta={mine.data && (mine.data.requestMeta.totalPages >= mine.data.relationshipMeta.totalPages ? mine.data.requestMeta : mine.data.relationshipMeta)} onPage={setPage} /></>}
    </section>
    {projectId && <MentorProjectPanel key={projectId} projectId={projectId} />}
    {pref.data?.acceptingMentorships && <section className="space-y-4 border-t pt-6"><h2 className="font-semibold">{t("Mentor Opportunities")}</h2>
      <Input aria-label={t("Search mentor opportunities")} placeholder={t("Search mentor opportunities")} value={search} maxLength={160} onChange={e => { setSearch(e.target.value); setOpportunityPage(1); }} />
      {opportunities.isLoading && <p role="status">{t("Loading…")}</p>}{opportunities.isError && <p role="alert">{t(mentorshipError(opportunities.error))}</p>}
      {!opportunities.isFetching && !opportunities.data?.items.length && <p className="text-sm text-muted-foreground">{t("No projects are seeking mentors right now.")}</p>}
      <div className="space-y-3">{opportunities.data?.items.map(p => <Opportunity key={p.id} preview={p} />)}</div><Pager meta={opportunities.data?.meta} onPage={setOpportunityPage} />
    </section>}
  </main>;
}
export function ConsentComposer({ project, mentor, onClose }: { project: MentorPreview; mentor?: AvailableMentor; onClose: () => void }) {
  const { t } = useI18n(), refresh = useSupportRefresh(), [message, setMessage] = useState(""), [key, setKey] = useState(() => crypto.randomUUID());
  const send = useMutation({ mutationFn: () => mentor ? academicSupportApi.request(project.id, mentor._id, message, key) : academicSupportApi.offer(project.id, message, key), onSuccess: () => { refresh(); onClose(); }, onError: refresh });
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader>
    <DialogTitle>{t(mentor ? "Invite as Mentor" : "Offer Mentorship")}{mentor && ` · ${mentor.fullName}`}</DialogTitle>
    <DialogDescription>{t("Both parties must agree before mentor access is granted.")}</DialogDescription></DialogHeader>
    <div className="rounded-md bg-muted p-3 text-sm"><p className="font-medium">{project.title}</p><p className="mt-1 text-xs text-muted-foreground">{[...new Set([project.researchField, ...project.expertise].filter(Boolean))].join(" · ")}</p></div>
    <label className="space-y-2 text-sm"><span>{t("Message")} *</span><textarea autoFocus className="min-h-28 w-full rounded-md border bg-background p-3 text-sm" value={message} maxLength={1000} onChange={e => { setMessage(e.target.value); if (send.isError) { setKey(crypto.randomUUID()); send.reset(); } }} placeholder={t("Explain the guidance you are seeking or offering.")} /></label>
    {send.error && <p role="alert" className="text-sm text-destructive">{t(mentorshipError(send.error))}</p>}
    <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>{t("Cancel")}</Button><Button disabled={!message.trim() || send.isPending} onClick={() => send.mutate()}>{t(mentor ? "Send Invitation" : "Send offer")}</Button></div>
  </DialogContent></Dialog>;
}
function Opportunity({ preview }: { preview: MentorPreview }) {
  const { t } = useI18n(), [open, setOpen] = useState(false);
  return <article className="rounded-lg border bg-card p-4"><h3 className="font-medium">{preview.title}</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">{preview.summary}</p><p className="mt-2 text-xs text-muted-foreground">{preview.researchField} · {t(preview.stage)} · {preview.expertise.join(" · ")}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => setOpen(true)}>{t("Offer Mentorship")}</Button>{open && <ConsentComposer project={preview} onClose={() => setOpen(false)} />}</article>;
}
export function MentorshipList({ items, onOpen }: { items: MentorshipItem[]; onOpen?: (id: string) => void }) {
  const { t } = useI18n(), refresh = useSupportRefresh();
  const [action, setAction] = useState<{ item: MentorshipItem; kind: "accept" | "decline" | "cancel" | "end"; open: boolean }>(), [note, setNote] = useState(""), [preview, setPreview] = useState<MentorshipItem>();
  const closeAction = () => setAction(current => current && { ...current, open: false });
  const response = useMutation({ mutationFn: () => academicSupportApi.respond(action!.item, action!.kind, note), onSuccess: () => { closeAction(); setNote(""); refresh(); }, onError: refresh });
  function choose(item: MentorshipItem, kind: "accept" | "decline" | "cancel" | "end") { response.reset(); setNote(""); setAction({ item, kind, open: true }); }
  if (!items.length) return <p className="text-sm text-muted-foreground">{t("No mentorship requests or active mentors.")}</p>;
  return <><ul className="divide-y rounded-lg border bg-card">{items.map(item => <li key={`${item.kind}-${item.id}`} className="space-y-2 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><Link to={`/academics/${encodeURIComponent(item.mentorUser._id)}`} className="text-sm font-medium hover:underline">{item.mentorUser.fullName}</Link>
      <p className="mt-1 text-xs text-muted-foreground">{[item.mentorUser.positionTitle, item.mentorUser.institutionName].filter(Boolean).join(" · ")}{item.mentorUser.verifiedLecturer && ` · ${t("Verified Lecturer")}`}</p>
      <p className="mt-1 text-xs text-muted-foreground">{item.project?.title} · {t(item.kind === "RELATIONSHIP" ? item.status === "ACTIVE" ? "Mentorship active" : "Mentorship ended" : item.status)} · {t(item.kind === "REQUEST" ? item.direction === "LECTURER_TO_PROJECT" ? "Mentorship offer" : "Mentorship request" : "Academic Mentor")}</p>
      {item.kind === "RELATIONSHIP" && <p className="mt-1 text-xs text-muted-foreground">{t("Mentoring since")} {new Date(item.startedAt).toLocaleDateString()}</p>}
    </div><div className="flex flex-wrap gap-2">
      {item.kind === "REQUEST" && <Button variant="ghost" size="sm" onClick={() => setPreview(item)}>{t("View Project Preview")}</Button>}
      {item.actions.cancel && <Button variant="ghost" size="sm" onClick={() => choose(item, "cancel")}>{t("Cancel request")}</Button>}
      {item.actions.decline && <Button variant="outline" size="sm" onClick={() => choose(item, "decline")}>{t("Decline")}</Button>}
      {item.actions.accept && <Button size="sm" onClick={() => choose(item, "accept")}>{t("Accept")}</Button>}
      {item.actions.openProject && (onOpen ? <Button variant="outline" size="sm" onClick={() => onOpen(item.projectId)}>{t("Open project")}</Button> : <Button variant="outline" size="sm" asChild><Link to={`/academic-support?projectId=${encodeURIComponent(item.projectId)}`}>{t("Open project")}</Link></Button>)}
      {item.actions.end && <Button variant="ghost" size="sm" onClick={() => choose(item, "end")}>{t("End mentorship")}</Button>}
    </div></div>
    {item.kind === "REQUEST" && <><p className="text-xs text-muted-foreground">{t("Requested by")}: {item.requestedBy.fullName} · {[item.requestedBy.academicRole && t(item.requestedBy.academicRole), item.requestedBy.institutionName].filter(Boolean).join(" · ")}</p>{item.message && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.message}</p>}{item.responseNote && <p className="text-xs text-muted-foreground">{item.responseNote}</p>}{item.closeReason === "MENTOR_POSITION_FILLED" && <p className="text-xs text-muted-foreground">{t("The mentor position has been filled.")}</p>}{item.status === "PENDING" && item.expiresAt && <p className="text-xs text-muted-foreground">{t("Expires")}: {new Date(item.expiresAt).toLocaleDateString()}</p>}</>}
  </li>)}</ul>
  <Dialog open={action?.open ?? false} onOpenChange={open => { if (!open) closeAction(); }}><DialogContent><DialogHeader><DialogTitle>{t(action?.kind === "accept" ? "Accept mentorship" : action?.kind === "decline" ? "Decline mentorship" : action?.kind === "end" ? "End mentorship" : "Cancel mentorship request")}</DialogTitle><DialogDescription>{t(action?.kind === "end" ? "Mentor access will end immediately. Previous guidance remains in project history." : "Mentorship remains separate from formal academic review.")}</DialogDescription></DialogHeader>
    <label className="space-y-1.5 text-sm"><span>{t("Optional note")}</span><textarea aria-label={t("Note")} className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={note} maxLength={1000} onChange={e => setNote(e.target.value)} /></label>{response.error && <p role="alert" className="text-sm text-destructive">{t(mentorshipError(response.error))}</p>}<Button disabled={response.isPending} onClick={() => response.mutate()}>{t("Confirm")}</Button>
  </DialogContent></Dialog>
  <Dialog open={Boolean(preview)} onOpenChange={open => { if (!open) setPreview(undefined); }}><DialogContent><DialogHeader><DialogTitle>{preview?.project?.title}</DialogTitle><DialogDescription>{t("Only the shared preview is available before acceptance.")}</DialogDescription></DialogHeader><p className="whitespace-pre-wrap break-words text-sm">{preview?.project?.summary}</p><p className="text-xs text-muted-foreground">{preview?.project?.researchField} · {preview?.project?.expertise.join(" · ")}</p></DialogContent></Dialog>
  </>;
}
function MentorSearch({ project, disabled }: { project: MentorPreview; disabled: boolean }) {
  const { t } = useI18n(), [filters, setFilters] = useState<AcademicSearch>({}), deferred = useDebouncedValue(filters, 300), [page, setPage] = useState(1), [selected, setSelected] = useState<AvailableMentor>();
  const taxonomy = useQuery({ queryKey: ["onboarding-options"], queryFn: () => authApi.academicOnboardingOptions() });
  const search = useQuery({ queryKey: ["academic-support", "mentor-search", project.id, deferred, page], queryFn: () => academicSupportApi.mentors(project.id, { ...deferred, page }), enabled: !disabled });
  const change = (field: keyof AcademicSearch, value: string) => { setFilters(current => ({ ...current, [field]: value || undefined })); setPage(1); };
  return <details className="border-t pt-4"><summary className="cursor-pointer text-sm font-medium">{t("Find a Mentor")}</summary><div className="mt-3 space-y-3">
    {disabled ? <p className="text-sm text-muted-foreground">{t("The project has reached its mentor or pending request limit.")}</p> : <>
      <Input aria-label={t("Search available mentors")} placeholder={t("Name, institution, research area or interest")} maxLength={160} value={filters.q ?? ""} onChange={e => change("q", e.target.value)} />
      <details><summary className="cursor-pointer text-xs text-muted-foreground">{t("More filters")}</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{(["institution", "area", "interest", "position"] as const).map(field => <label key={field} className="space-y-1 text-xs"><span>{t({ institution: "Institution", area: "Research Area", interest: "Research Interest", position: "Current Position" }[field])}</span><Input value={filters[field] ?? ""} list={field === "area" ? "mentor-area-options" : undefined} maxLength={field === "institution" ? 200 : 120} onChange={e => change(field, e.target.value)} /></label>)}</div><datalist id="mentor-area-options">{taxonomy.data?.researchAreas.map(area => <option key={area} value={area} />)}</datalist></details>
      {search.isLoading && <p role="status">{t("Loading…")}</p>}{search.isError && <p role="alert">{t(mentorshipError(search.error))}</p>}
      {search.data?.items.map(mentor => <article key={mentor._id} className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3"><div className="min-w-0"><Link to={`/academics/${mentor._id}`} className="text-sm font-medium hover:underline">{mentor.fullName}</Link><p className="mt-1 text-xs text-muted-foreground">{mentor.positionTitle} · {mentor.institutionName} · {t("Verified Lecturer")}</p><p className="mt-1 text-xs text-muted-foreground">{mentor.expertiseAreas.join(" · ")}</p>{mentor.matchedTerms.length > 0 && <p className="mt-2 text-xs text-primary">{t("Matches your project")}: {mentor.matchedTerms.join(" · ")}</p>}<p className="mt-1 text-xs text-muted-foreground">{t("Accepting new teams")}</p></div><Button size="sm" variant="outline" onClick={() => setSelected(mentor)}>{t("Invite as Mentor")}</Button></article>)}
      {search.data && !search.data.items.length && <div className="text-sm text-muted-foreground"><p>{t("No available Mentors match these filters.")}</p><Button variant="ghost" size="sm" onClick={() => { setFilters({}); setPage(1); }}>{t("Clear filters")}</Button></div>}
      <Pager meta={search.data?.meta} onPage={setPage} />
    </>}
  </div>{selected && <ConsentComposer project={project} mentor={selected} onClose={() => setSelected(undefined)} />}</details>;
}
function DiscoverySettings({ project }: { project: MentorPreview }) {
  const { t } = useI18n(), refresh = useSupportRefresh(), [discovery, setDiscovery] = useState(project.discovery), [summary, setSummary] = useState(project.summary), [expertise, setExpertise] = useState(project.expertise);
  const taxonomy = useQuery({ queryKey: ["onboarding-options"], queryFn: () => authApi.academicOnboardingOptions() });
  const save = useMutation({ mutationFn: () => academicSupportApi.saveSettings(project.id, { discovery, summary, expertise }), onSuccess: refresh });
  return <details className="border-t pt-4"><summary className="cursor-pointer text-sm font-medium">{t("Mentorship discovery settings")}</summary><div className="mt-3 space-y-3">
    <select aria-label={t("Mentorship Discovery")} className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={discovery} onChange={e => setDiscovery(e.target.value as typeof discovery)}><option value="CLOSED">{t("Closed")}</option><option value="SEEKING_MENTOR">{t("Seeking Mentor")}</option></select>
    <label className="block space-y-1.5 text-sm"><span>{t("Safe project summary")}</span><textarea className="min-h-24 w-full rounded-md border bg-background p-3" value={summary} maxLength={2000} onChange={e => setSummary(e.target.value)} /></label><p className="text-xs leading-5 text-muted-foreground">{t("Only this preview is shared with verified Lecturers. Keep confidential research out of it.")}</p>
    <ResearchTagField label={t("Expertise requested")} values={expertise} onChange={setExpertise} options={taxonomy.data?.researchAreas} max={10} />
    {save.error && <p role="alert" className="text-sm text-destructive">{t(mentorshipError(save.error))}</p>}<Button size="sm" disabled={save.isPending || discovery === "SEEKING_MENTOR" && summary.trim().length < 10} onClick={() => save.mutate()}>{t("Save discovery settings")}</Button>
  </div></details>;
}
export function MentorProjectPanel({ projectId }: { projectId: string }) {
  const { t } = useI18n(), refresh = useSupportRefresh(), [note, setNote] = useState(""), [section, setSection] = useState<ContextSection>("papers"), [page, setPage] = useState(1), [requestPage, setRequestPage] = useState(1);
  const workspace = useQuery({ queryKey: ["academic-support", "workspace", projectId, section, page], queryFn: () => academicSupportApi.workspace(projectId, { section, page }) });
  const list = useQuery({ queryKey: ["academic-support", "project", projectId, requestPage], queryFn: () => academicSupportApi.list(projectId, { page: requestPage }) });
  const guidance = useMutation({ mutationFn: () => academicSupportApi.guidance(projectId, note), onSuccess: () => { setNote(""); refresh(); }, onError: refresh });
  useEffect(() => { setPage(1); setRequestPage(1); setNote(""); }, [projectId]);
  if (workspace.isLoading) return <p role="status">{t("Loading academic support…")}</p>;
  if (!workspace.data || workspace.isError) return <p role="alert" className="text-sm text-muted-foreground">{t("Academic Support is available to the project team and active verified mentors.")}</p>;
  const data = workspace.data, readOnly = !data.canProvideFeedback;
  return <section className="space-y-5 rounded-lg border bg-card p-4 sm:p-5" data-no-i18n>
    <header><h2 className="text-lg font-semibold">{t("Academic Support")} · {data.project.title}</h2><p className="mt-1 text-xs text-muted-foreground">{t(data.accessRole === "MENTOR" ? "Mentor access: read research context and provide guidance." : "Academic mentors are separate from project members.")}</p></header>
    {list.data && <><h3 className="text-sm font-semibold">{t("Academic Mentor")} · {list.data.counts.active} / {list.data.policy.maxActiveMentors}</h3><MentoringItems items={[...list.data.relationships, ...list.data.requests.filter(r => r.status !== "ACCEPTED")]} />
      <Pager meta={list.data.requestMeta.totalPages >= list.data.relationshipMeta.totalPages ? list.data.requestMeta : list.data.relationshipMeta} onPage={setRequestPage} /></>}{list.isError && <p role="alert">{t("Unable to load mentorship requests.")}</p>}
    {data.canManage && !readOnly && <><DiscoverySettings key={data.project.id} project={data.project} /><MentorSearch project={data.project} disabled={Boolean(list.data && (list.data.counts.active >= list.data.policy.maxActiveMentors || list.data.counts.pending >= list.data.policy.maxPendingRequests))} /></>}
    <div className="space-y-3 border-t pt-4"><h3 className="text-sm font-semibold">{t("Research context")}</h3>{data.context.description && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{data.context.description}</p>}
      {(data.context.inclusionCriteria.length > 0 || data.context.exclusionCriteria.length > 0) && <details><summary className="cursor-pointer text-xs text-muted-foreground">{t("Screening criteria")}</summary><p className="mt-2 whitespace-pre-wrap text-sm">{data.context.inclusionCriteria.join("\n")}</p><p className="mt-2 whitespace-pre-wrap text-sm">{data.context.exclusionCriteria.join("\n")}</p></details>}
      <div className="flex flex-wrap gap-1" role="group" aria-label={t("Research context")}>{(["papers", "gaps", "evidence", "reports", "members"] as const).map(s => <Button key={s} size="sm" variant={s === section ? "secondary" : "ghost"} aria-pressed={s === section} onClick={() => { setSection(s); setPage(1); }}>{t({ papers: "Papers", gaps: "Candidate Gaps", evidence: "Evidence", reports: "Reports", members: "Members" }[s])} ({data.context.counts[s]})</Button>)}</div>
      {!data.context.items.length && <p className="text-sm text-muted-foreground">{t("No research items in this section yet.")}</p>}
      {data.context.items.map(item => <details key={item.id} className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">{item.title}</summary>{item.detail && <p className="mt-2 text-xs text-muted-foreground">{item.detail}</p>}<div className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6">{item.body}</div></details>)}<Pager meta={data.context.meta} onPage={setPage} />
    </div>
    <div className="space-y-3 border-t pt-4"><h3 className="text-sm font-semibold">{t("Mentor guidance")}</h3><p className="text-xs leading-5 text-muted-foreground">{t("Guidance is visible to this project team and active verified mentors. It is not a formal review outcome.")}</p>
      {!readOnly && <><textarea aria-label={t("Guidance note")} className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={note} maxLength={2000} onChange={e => setNote(e.target.value)} />{guidance.error && <p role="alert" className="text-sm text-destructive">{t(mentorshipError(guidance.error))}</p>}<Button size="sm" disabled={!note.trim() || guidance.isPending} onClick={() => guidance.mutate()}>{t("Add guidance")}</Button></>}
      <ul className="space-y-3">{data.guidance.map(g => <li key={g.id} className="rounded-md bg-muted p-3"><p className="mb-2 text-xs font-medium">{g.author?.fullName ?? t("Former user")} · {t(g.attribution === "MENTOR" ? "Mentor" : "Project team")} · {new Date(g.createdAt).toLocaleString()}</p><p className="whitespace-pre-wrap break-words text-sm">{g.note}</p></li>)}</ul>
    </div><ProjectAcademicReviews projectId={projectId} canManage={data.canManage && !readOnly} />
  </section>;
}

function ProjectAcademicReviews({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const { t } = useI18n();
  const center = useReviewCenter();
  const requests = [...(center.data?.sent ?? []), ...(center.data?.incoming ?? [])];
  const items = [...new Map(requests.filter(item => item.artifact.projectId === projectId).map(item => [item.id, item])).values()];
  return <section className="space-y-3 border-t pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">{t("Academic Reviews")}</h3>
      {canManage && <Button size="sm" variant="outline" asChild><Link to={`/projects/${encodeURIComponent(projectId)}?tab=reports`}>{t("Choose an artifact for review")}</Link></Button>}
    </div>
    <p className="text-xs text-muted-foreground">{t("Formal review requests apply to a specific artifact and version.")}</p>
    {center.isLoading ? <p role="status">{t("Loading…")}</p> : center.isError ? <p role="alert">{t("Unable to load academic reviews.")}</p> : items.length ? <ul className="divide-y rounded-md border">{items.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-3"><div><Link to={`/review-requests/${item.id}`} className="text-sm font-medium hover:underline">{item.artifact.title}</Link><p className="mt-1 text-xs text-muted-foreground">{t("Revision")} {item.artifact.revisionNumber} · {item.reviewer.fullName} · {t(item.status)}</p></div><Button variant="ghost" size="sm" asChild><Link to={`/review-requests/${item.id}`}>{t("View request")}</Link></Button></li>)}</ul> : <p className="text-sm text-muted-foreground">{t("No academic review requests available to you for this project.")}</p>}
  </section>;
}
