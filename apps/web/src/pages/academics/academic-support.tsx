import { useEffect, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AcademicPageMeta, AvailableMentor, MentorshipPerson, MentorRole, MentorshipCollection } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import { useAcademicProfile } from "@/features/academic-profile/hooks/use-academic-profile";
import { PositionVerificationPanel } from "@/features/academic-profile/components/position-verification-panel";
import { MentorDiscoverySettings } from "@/features/projects/components/mentor-discovery-settings";
import { academicSupportApi, type MentorshipItem, type MentorPreview, type AcademicSearch } from "@/features/projects/api/academic-support.api";
import { MentoringPreferencesPanel, useMentoringPreferences, mentorshipError } from "@/features/projects/components/mentoring-preferences";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { authApi } from "@/features/auth/api/auth.api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { canLeaveWorkspace } from "@/features/projects/components/workspace-common";
import { MentorPreviewContent, MentorInvitationSender } from "@/features/projects/components/mentor-preview";
import { projectsApi } from "@/features/projects/api/projects.api";
import { useAuthStore } from "@/stores/auth-store";
import { BadgeCheck, Building2, Mail, Search, SlidersHorizontal, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useInvitationContent, InvitationAttachments, InvitationUpload } from "@/features/projects/components/mentorship-invitation-content";
import "@/features/projects/mentor-discovery.css";

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
  if (!current.length) return <MentorshipList items={history} onOpen={onOpen} />;
  return <div className="space-y-3"><MentorshipList items={current} onOpen={onOpen} />{history.length > 0 && <details><summary className="cursor-pointer text-xs text-muted-foreground">{t("Mentoring history")} ({history.length})</summary><div className="mt-3"><MentorshipList items={history} /></div></details>}</div>;
}
export function AcademicSupportPage() {
  const { t } = useI18n(), navigate = useNavigate(), profile = useAcademicProfile(), pref = useMentoringPreferences();
  const lecturer = profile.data?.academicRole === "LECTURER";
  const userId = useAuthStore(s => s.user?.id);
  const [view, setView] = useState<NonNullable<AcademicSearch["view"]>>("incoming"), [area, setArea] = useState("");
  const [offerProject, setOfferProject] = useState<MentorPreview>();
  const deferredArea = useDebouncedValue(area, 300);
  const [search, setSearch] = useState(""), q = useDebouncedValue(search, 300), [page, setPage] = useState(1), [opportunityPage, setOpportunityPage] = useState(1);
  const [params, setParams] = useSearchParams(), projectId = params.get("projectId");
  const mine = useQuery({ queryKey: ["academic-support", userId, "mine", view, page], queryFn: () => academicSupportApi.mine({ page, view }) });
  const opportunities = useQuery({ queryKey: ["academic-support", userId, "opportunities", q, deferredArea, opportunityPage], queryFn: () => academicSupportApi.opportunities({ q, area: deferredArea || undefined, page: opportunityPage }), enabled: pref.data?.acceptingMentorships === true });
  return <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-7 sm:px-6" data-no-i18n>
    <header><h1 className="text-2xl font-semibold tracking-tight">{t(lecturer ? "Lecturer workspace" : "Academic Support")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("Mentoring provides project guidance. Formal review requires a separate artifact request.")}</p></header>
    {lecturer && profile.data && !pref.data?.canEnable && <div className="rounded-lg border bg-card p-4"><PositionVerificationPanel profile={profile.data} editable onEditPosition={() => navigate("/settings/academic")} /></div>}
    <div id="mentoring-settings" className="scroll-mt-24"><MentoringPreferencesPanel lecturer={lecturer} /></div>
    <div className="flex flex-wrap items-center gap-3"><Button asChild variant="outline" size="sm"><Link to="/reviews">{t("Academic Reviews")}</Link></Button><Button asChild variant="ghost" size="sm"><Link to="/projects">{t("Your projects")}</Link></Button>
      <p className="text-sm text-muted-foreground">{t("Incoming Requests")}: {mine.data?.counts.incoming ?? 0} · {t("Active Teams")}: {mine.data?.counts.active ?? 0}</p></div>
    <section className="space-y-3"><h2 className="text-base font-semibold">{t("Mentoring requests & relationships")}</h2>
      <div className="flex flex-wrap gap-1" role="group" aria-label={t("Mentoring requests & relationships")}>{(["incoming", "outgoing", "active", "history"] as const).map(tab => <Button key={tab} size="sm" variant={view === tab ? "secondary" : "ghost"} aria-pressed={view === tab} onClick={() => { setView(tab); setPage(1); }}>{t({ incoming: "Incoming Requests", outgoing: "Outgoing Requests", active: "Active Mentorships", history: "Mentoring history" }[tab])}</Button>)}</div>
      {mine.isLoading ? <p role="status">{t("Loading…")}</p> : mine.isError ? <p role="alert">{t("Unable to load mentorship requests.")}</p> : <>
        <MentoringItems items={[...(mine.data?.relationships ?? []), ...(mine.data?.requests ?? [])]} onOpen={id => setParams({ projectId: id })} />
        <Pager meta={mine.data && (mine.data.requestMeta.totalPages >= mine.data.relationshipMeta.totalPages ? mine.data.requestMeta : mine.data.relationshipMeta)} onPage={setPage} /></>}
    </section>
    <ProjectMentorFinder onSelect={id => setParams(id ? { projectId: id } : {})} selected={projectId ?? ""} />
    {projectId && <MentorProjectPanel key={projectId} projectId={projectId} />}
    {pref.data?.acceptingMentorships && <section className="space-y-4 border-t pt-6"><h2 className="font-semibold">{t("Discover Projects")}</h2>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]"><Input aria-label={t("Search mentor opportunities")} placeholder={t("Search mentor opportunities")} value={search} maxLength={160} onChange={e => { setSearch(e.target.value); setOpportunityPage(1); }} /><Input aria-label={t("Filter by research area")} placeholder={t("Filter by research area")} value={area} maxLength={120} onChange={e => { setArea(e.target.value); setOpportunityPage(1); }} /></div>
      {opportunities.isLoading && <p role="status">{t("Loading…")}</p>}{opportunities.isError && <p role="alert">{t(mentorshipError(opportunities.error))}</p>}
      {!opportunities.isFetching && !opportunities.data?.items.length && <p className="text-sm text-muted-foreground">{t("No projects are seeking mentors right now.")}</p>}
      <div className="space-y-3">{opportunities.data?.items.map(p => <Opportunity key={p.id} preview={p} onOffer={() => setOfferProject(p)} />)}</div><Pager meta={opportunities.data?.meta} onPage={setOpportunityPage} />
    </section>}
    {offerProject && <ConsentComposer project={offerProject} onClose={() => setOfferProject(undefined)} />}
  </main>;
}
function ProjectMentorFinder({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  const { t } = useI18n(), userId = useAuthStore(s => s.user?.id);
  const projects = useQuery({ queryKey: ["projects", userId, "mentorship-finder"], queryFn: projectsApi.list });
  return <section className="space-y-2 border-t pt-5"><h2 className="text-base font-semibold">{t("Find Mentors")}</h2><label className="block text-sm text-muted-foreground" htmlFor="mentorship-project">{t("Choose a project to find or suggest mentors.")}</label><select id="mentorship-project" className="h-10 w-full rounded-md border bg-background px-3 text-sm sm:max-w-md" value={selected} onChange={async e => { const id = e.target.value; if (await canLeaveWorkspace()) onSelect(id); }}><option value="">{t("Choose a project")}</option>{projects.data?.filter(p => !["ARCHIVED", "COMPLETED"].includes(p.status)).map(p => <option key={p._id} value={p._id}>{p.title}</option>)}</select>{projects.isError && <p role="alert" className="text-sm">{t("Unable to load project. Please try again.")}</p>}</section>;
}
export function ConsentComposer({ project, mentor, suggestion = false, onClose }: { project: MentorPreview; mentor?: MentorshipPerson; suggestion?: boolean; onClose: () => void }) {
  const { t } = useI18n(), refresh = useSupportRefresh(), [key, setKey] = useState(() => crypto.randomUUID());
  const userId = useAuthStore(s => s.user?.id);
  const invitation = Boolean(mentor && !suggestion), direction = mentor ? "PROJECT_TO_LECTURER" : "LECTURER_TO_PROJECT";
  const positions = useQuery({ queryKey: ["academic-support", userId, "composer-positions", project.id], queryFn: () => academicSupportApi.list(project.id), enabled: invitation });
  const allowedRoles: MentorRole[] = positions.data?.positions ? (["PRIMARY", "SECONDARY"] as const).filter(role => ["VACANT", "INVITING"].includes(positions.data!.positions![role].status) && positions.data!.positions![role].pendingRequests < (positions.data!.policy.maxPendingPerRole ?? 3)) : project.availableRoles ?? ["PRIMARY"];
  const content = useInvitationContent(project.id, direction, !suggestion, allowedRoles);
  const [editingBrief, setEditingBrief] = useState(false), [closing, setClosing] = useState(false);
  const settings = useQuery({ queryKey: ["academic-support", userId, "discovery-settings", project.id], queryFn: () => academicSupportApi.settings(project.id), enabled: invitation });
  const send = useMutation({ mutationFn: async () => {
    if (!suggestion) await content.persist();
    const payload = { mentorRole: content.mentorRole, attachmentIds: content.attachments.map(a => a.id) };
    return mentor ? suggestion ? academicSupportApi.suggest(project.id, mentor._id, content.message) : academicSupportApi.request(project.id, mentor._id, content.message, key, payload) : academicSupportApi.offer(project.id, content.message, key, payload);
  }, onSuccess: () => { refresh(); onClose(); }, onError: refresh });
  const close = async () => {
    if (send.isPending || closing || content.uploading || editingBrief && !await canLeaveWorkspace()) return;
    setClosing(true);
    try { await content.persist(); onClose(); } catch { setClosing(false); /* Keep unsaved input visible for recovery. */ }
  };
  const change = (value: Parameters<typeof content.change>[0]) => { if (send.isError) { setKey(crypto.randomUUID()); send.reset(); } content.change(value); };
  return <Dialog open onOpenChange={open => { if (!open) void close(); }}><DialogContent className="mentor-invitation-dialog max-h-[88dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader className="pr-6 text-left">
    <DialogTitle className="break-words leading-snug">{t(suggestion ? "Suggest Mentor" : mentor ? "Invite as Mentor" : "Offer Mentorship")}{mentor && ` · ${mentor.fullName}`}</DialogTitle>
    <DialogDescription>{t(suggestion ? "Only the project owner can send the official invitation." : "Both parties must agree before mentor access is granted. Your draft is saved privately for reuse.")}</DialogDescription></DialogHeader>
    {!suggestion && <label className="space-y-1.5 text-sm"><span className="font-medium">{t("Mentor role")}</span><select aria-label={t("Mentor role")} className="h-10 w-full rounded-md border bg-background px-3" value={content.mentorRole} disabled={send.isPending || closing || !content.ready || positions.isFetching} onChange={e => change({ mentorRole: e.target.value as MentorRole })}>
      <option value="PRIMARY" disabled={!allowedRoles.includes("PRIMARY")}>{t("Primary mentor")}</option><option value="SECONDARY" disabled={!allowedRoles.includes("SECONDARY")}>{t("Secondary mentor")}</option>
    </select><p className="text-xs leading-5 text-muted-foreground">{t("The secondary position opens after a verified primary mentor is assigned. Up to 3 pending invitations per position, valid for 7 days.")}</p></label>}
    {invitation && settings.isLoading ? <Skeleton className="h-24 w-full" /> : invitation && settings.isError ? <div role="alert" className="space-y-2 text-sm"><p>{t("Could not load the invitation preview.")}</p><Button size="sm" variant="outline" onClick={() => void settings.refetch()}>{t("Try again")}</Button></div> : editingBrief ? <MentorDiscoverySettings projectId={project.id} startEditing onDone={() => setEditingBrief(false)} /> : <>
      <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">{t("Project information shared with the lecturer")} · {project.title}</summary><div className="mt-3 space-y-3"><MentorPreviewContent preview={invitation && settings.data ? settings.data : project} />
        {invitation && settings.data?.invitationSender && <MentorInvitationSender sender={settings.data.invitationSender} />}
        {invitation && <Button size="sm" type="button" variant="outline" disabled={send.isPending || closing} onClick={() => setEditingBrief(true)}>{t("Edit project information")}</Button>}
      </div></details>
    </>}
    {!content.ready && !suggestion ? <Skeleton className="h-28 w-full" /> : <label className="space-y-2 text-sm"><span className="font-medium">{t("Message")}{suggestion ? " *" : ""}</span><textarea aria-label={t("Message")} autoFocus className="min-h-32 w-full rounded-md border bg-background p-3 text-sm leading-6" value={content.message} disabled={send.isPending || closing} maxLength={1000} onChange={e => change({ message: e.target.value })} placeholder={t("Explain the guidance you are seeking or offering.")} /><span className="block text-right text-xs text-muted-foreground">{content.message.length}/1000</span></label>}
    {!suggestion && <>
      <InvitationAttachments attachments={content.attachments} onRemove={send.isPending || closing || content.uploading ? undefined : id => change({ attachments: content.attachments.filter(a => a.id !== id) })} />
      <InvitationUpload disabled={!content.ready || send.isPending || closing || content.attachments.length >= 5} uploading={content.uploading} onUpload={files => { if (send.isError) { setKey(crypto.randomUUID()); send.reset(); } void content.upload(files); }} />
      <p className="text-xs leading-5 text-muted-foreground">{t("Only files you attach here are shared with this invitation. Your project library stays private.")}</p>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"><p role="status" className="text-xs text-muted-foreground">{t(content.status === "saving" ? "Saving invitation draft…" : content.status === "saved" && !content.dirty ? "Draft saved privately · reusable for another mentor" : "Unsaved invitation changes")}</p><Button type="button" size="sm" variant="ghost" disabled={!content.ready || send.isPending || closing || content.uploading || content.status === "saving"} onClick={() => void content.persist().catch(() => {})}>{t("Save for reuse")}</Button></div>
    </>}
    {(content.error || send.error || positions.isError) && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{t(content.error || mentorshipError(send.error ?? positions.error))}</p>{content.canReload && <Button type="button" size="sm" variant="outline" disabled={content.status === "saving" || content.uploading || send.isPending || closing} onClick={() => void content.reload()}>{t("Reload saved draft")}</Button>}</div>}
    <div className="flex justify-end gap-2 border-t pt-4"><Button variant="ghost" disabled={send.isPending || closing || content.uploading} onClick={() => void close()}>{t("Cancel")}</Button><Button disabled={send.isPending || closing || content.uploading || !content.ready || !content.message.trim() && (!content.attachments.length || suggestion) || !suggestion && !allowedRoles.includes(content.mentorRole) || invitation && (settings.isLoading || settings.isError || positions.isLoading || positions.isError || editingBrief)} onClick={() => send.mutate()}>{t(send.isPending ? "Sending…" : suggestion ? "Send suggestion" : mentor ? "Send Invitation" : "Send offer")}</Button></div>
  </DialogContent></Dialog>;
}
function Opportunity({ preview, onOffer }: { preview: MentorPreview; onOffer: () => void }) {
  const { t } = useI18n();
  return <article className="min-w-0 space-y-3 border-b py-4"><h3 className="font-medium">{preview.title}</h3><p className="text-xs text-muted-foreground">{preview.researchAreas.join(" · ")}</p><p className="line-clamp-2 text-sm leading-6 text-muted-foreground">{preview.summary}</p><details><summary className="cursor-pointer text-sm text-primary">{t("View Project Preview")}</summary><div className="mt-3"><MentorPreviewContent preview={preview} /></div></details><Button variant="outline" size="sm" onClick={onOffer}>{t("Offer Mentorship")}</Button></article>;
}
export function MentorshipList({ items, onOpen }: { items: MentorshipItem[]; onOpen?: (id: string) => void }) {
  const { t } = useI18n(), refresh = useSupportRefresh();
  const [action, setAction] = useState<{ item: MentorshipItem; kind: "accept" | "decline" | "cancel" | "end"; open: boolean }>(), [note, setNote] = useState(""), [preview, setPreview] = useState<MentorshipItem>();
  const closeAction = () => setAction(current => current && { ...current, open: false });
  const response = useMutation({ mutationFn: () => academicSupportApi.respond(action!.item, action!.kind, note), onSuccess: () => { closeAction(); setNote(""); refresh(); }, onError: refresh });
  function choose(item: MentorshipItem, kind: "accept" | "decline" | "cancel" | "end") { response.reset(); setNote(""); setAction({ item, kind, open: true }); }
  if (!items.length) return <p className="text-sm text-muted-foreground">{t("No mentorship requests or active mentors.")}</p>;
  return <><ul className="divide-y rounded-lg border bg-card">{items.map(item => <li key={`${item.kind}-${item.id}`} className="space-y-2 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><Link target="_blank" rel="noopener noreferrer" to={`/academics/${encodeURIComponent(item.mentorUser._id)}`} className="text-sm font-medium hover:underline">{item.mentorUser.fullName}</Link>
      <p className="mt-1 text-xs text-muted-foreground">{[item.mentorUser.positionTitle, item.mentorUser.institutionName].filter(Boolean).join(" · ")}{item.mentorUser.verifiedLecturer && ` · ${t("Verified Lecturer")}`}</p>
      <p className="mt-1 text-xs text-muted-foreground">{item.project?.title} · {t(item.mentorRole === "SECONDARY" ? "Secondary mentor" : "Primary mentor")} · {t(item.kind === "RELATIONSHIP" ? item.status === "ACTIVE" ? "Mentorship active" : "Mentorship ended" : item.status)} · {t(item.kind === "REQUEST" ? item.direction === "LECTURER_TO_PROJECT" ? "Mentorship offer" : "Mentorship request" : "Academic Mentor")}</p>
      {item.kind === "RELATIONSHIP" && <p className="mt-1 text-xs text-muted-foreground">{t("Mentoring since")} {new Date(item.startedAt).toLocaleDateString()}</p>}
    </div><div className="flex flex-wrap gap-2">
      {item.kind === "REQUEST" && <Button variant="ghost" size="sm" onClick={() => setPreview(item)}>{t("View Project Preview")}</Button>}
      {item.actions.cancel && <Button variant="ghost" size="sm" onClick={() => choose(item, "cancel")}>{t("Cancel request")}</Button>}
      {item.actions.decline && <Button variant="outline" size="sm" onClick={() => choose(item, "decline")}>{t("Decline")}</Button>}
      {item.actions.accept && <Button size="sm" onClick={() => choose(item, "accept")}>{t("Accept")}</Button>}
      {item.actions.openProject && (onOpen ? <Button variant="outline" size="sm" onClick={() => onOpen(item.projectId)}>{t("Open project")}</Button> : <Button variant="outline" size="sm" asChild><Link to={`/academic-support?projectId=${encodeURIComponent(item.projectId)}`}>{t("Open project")}</Link></Button>)}
      {item.actions.end && <Button variant="ghost" size="sm" onClick={() => choose(item, "end")}>{t("End mentorship")}</Button>}
    </div></div>
    {item.kind === "REQUEST" && <><p className="text-xs text-muted-foreground">{t("Requested by")}: {item.requestedBy.fullName} · {[item.requestedBy.academicRole && t(item.requestedBy.academicRole), item.requestedBy.institutionName].filter(Boolean).join(" · ")}</p>{item.message && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.message}</p>}{Boolean(item.attachments?.length) && <InvitationAttachments attachments={item.attachments!} />}{item.responseNote && <p className="text-xs text-muted-foreground">{item.responseNote}</p>}{item.closeReason === "MENTOR_POSITION_FILLED" && <p className="text-xs text-muted-foreground">{t("The mentor position has been filled.")}</p>}{item.status === "PENDING" && item.expiresAt && <p className="text-xs text-muted-foreground">{t("Expires")}: {new Date(item.expiresAt).toLocaleDateString()}</p>}</>}
  </li>)}</ul>
  <Dialog open={action?.open ?? false} onOpenChange={open => { if (!open) closeAction(); }}><DialogContent><DialogHeader><DialogTitle>{t(action?.kind === "accept" ? "Accept mentorship" : action?.kind === "decline" ? "Decline mentorship" : action?.kind === "end" ? "End mentorship" : "Cancel mentorship request")}</DialogTitle><DialogDescription>{t(action?.kind === "end" ? "Mentor access will end immediately. Previous guidance remains in project history." : "Mentorship remains separate from formal academic review.")}</DialogDescription></DialogHeader>
    <label className="space-y-1.5 text-sm"><span>{t("Optional note")}</span><textarea aria-label={t("Note")} className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={note} maxLength={1000} onChange={e => setNote(e.target.value)} /></label>{response.error && <p role="alert" className="text-sm text-destructive">{t(mentorshipError(response.error))}</p>}<Button disabled={response.isPending} onClick={() => response.mutate()}>{t("Confirm")}</Button>
  </DialogContent></Dialog>
  <Dialog open={Boolean(preview)} onOpenChange={open => { if (!open) setPreview(undefined); }}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>{t("View Project Preview")}</DialogTitle><DialogDescription>{t("Only the shared preview is available before acceptance.")}</DialogDescription></DialogHeader>{preview?.project && <MentorPreviewContent preview={preview.project} />}{preview?.kind === "REQUEST" && <><MentorInvitationSender sender={preview.requestedBy} /><p className="text-sm font-medium">{t(preview.mentorRole === "SECONDARY" ? "Secondary mentor" : "Primary mentor")}</p><InvitationAttachments attachments={preview.attachments ?? []} />{preview.message && <div><p className="text-xs font-medium text-muted-foreground">{t("Message")}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{preview.message}</p></div>}</>}</DialogContent></Dialog>
  </>;
}
function MentorSearch({ project, disabled, canInvite }: { project: MentorPreview; disabled: boolean; canInvite: boolean }) {
  const { t } = useI18n(), [filters, setFilters] = useState<AcademicSearch>({}), deferred = useDebouncedValue(filters, 300), [page, setPage] = useState(1), [selected, setSelected] = useState<AvailableMentor>();
  const [showFilters, setShowFilters] = useState(false);
  const [editingPreferences, setEditingPreferences] = useState(false);
  const taxonomy = useQuery({ queryKey: ["onboarding-options"], queryFn: () => authApi.academicOnboardingOptions() });
  const userId = useAuthStore(s => s.user?.id);
  const settings = useQuery({ queryKey: ["academic-support", userId, "discovery-settings", project.id], queryFn: () => academicSupportApi.settings(project.id), enabled: canInvite });
  const preferences = settings.data ?? project;
  const terms = [...new Set([...preferences.researchAreas, ...preferences.expertise])];
  const search = useQuery({ queryKey: ["academic-support", userId, "mentor-search", project.id, deferred, page], queryFn: () => academicSupportApi.mentors(project.id, { ...deferred, page }) });
  const change = (field: keyof AcademicSearch, value: string) => { setFilters(current => ({ ...current, [field]: value || undefined })); setPage(1); };
  const filterCount = [filters.area, filters.interest, filters.institution, filters.position].filter(Boolean).length;
  const filtered = Boolean(filters.q?.trim() || filterCount);
  const clear = () => { setFilters({}); setPage(1); };
  return <section aria-label={t("Find Mentors")} className="mentor-search">
    <div className="mentor-search-brief"><div className="mentor-search-brief-copy"><h3>{t("Mentor preferences")}</h3>{settings.isLoading && canInvite ? <Skeleton className="mt-2 h-5 w-48" /> : terms.length ? <div className="mentor-preference-terms">{terms.map(term => <span key={term}>{t(term)}</span>)}</div> : <p>{t("Tell us which fields and expertise your team needs. We will prioritize matching lecturers.")}</p>}{preferences.mentoringNeeds && <p className="mentor-brief-needs">{preferences.mentoringNeeds}</p>}<p className="mentor-discovery-status"><span aria-hidden="true" data-enabled={preferences.discovery === "SEEKING_MENTOR"} />{t(preferences.discovery === "SEEKING_MENTOR" ? "Verified lecturers can discover your shared project preview." : "Only lecturers you invite will see this preview. Project discovery is off.")}</p></div>{canInvite && <Button size="sm" variant="outline" onClick={() => setEditingPreferences(true)}><SlidersHorizontal size={15} aria-hidden="true" />{t(terms.length ? "Edit preferences" : "Set up mentor preferences")}</Button>}</div>
    {settings.isError && <p role="alert" className="mb-3 text-sm text-destructive">{t("Could not load mentor discovery settings.")}</p>}
    <div className="mentor-search-controls"><div className="mentor-search-input"><Search size={19} aria-hidden="true" /><Input aria-label={t("Search available mentors")} placeholder={t("Name, institution, research area or interest")} maxLength={160} value={filters.q ?? ""} onChange={e => change("q", e.target.value)} />{filters.q && <Button size="icon" variant="ghost" aria-label={t("Clear search")} onClick={() => change("q", "")}><X size={16} aria-hidden="true" /></Button>}</div><Button variant="outline" aria-expanded={showFilters} aria-controls={`mentor-filters-${project.id}`} onClick={() => setShowFilters(value => !value)}><SlidersHorizontal size={16} aria-hidden="true" />{t("Filters")}{filterCount > 0 && <span className="mentor-filter-count">{filterCount}</span>}</Button></div>
    <div id={`mentor-filters-${project.id}`} hidden={!showFilters} className="mentor-search-filters"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{(["area", "interest", "institution", "position"] as const).map(field => <label key={field} className="space-y-1.5 text-sm"><span>{t({ institution: "Institution", area: "Research Area", interest: "Research Interest", position: "Current Position" }[field])}</span><Input value={filters[field] ?? ""} list={field === "area" ? `mentor-area-options-${project.id}` : undefined} maxLength={field === "institution" ? 200 : 120} onChange={e => change(field, e.target.value)} /></label>)}</div><datalist id={`mentor-area-options-${project.id}`}>{taxonomy.data?.researchAreas.map(area => <option key={area} value={area} />)}</datalist></div>
    {filtered && <div className="mentor-active-filters">{(["area", "interest", "institution", "position"] as const).filter(field => filters[field]).map(field => <button key={field} type="button" onClick={() => change(field, "")} aria-label={`${t("Remove filter")}: ${filters[field]}`}>{filters[field]}<X size={13} aria-hidden="true" /></button>)}<Button size="sm" variant="ghost" onClick={clear}>{t("Clear filters")}</Button></div>}
    <div className="mentor-results-heading"><h3>{t(filtered ? "Search results" : "Lecturers for your project")}{search.data && <span> ({search.data.meta.total})</span>}</h3><p>{t("Relevant expertise first")}</p></div>
    {disabled && <p role="status" className="mentor-ranking-note">{t("The project has reached its mentor or pending request limit.")}</p>}
    {editingPreferences && <p role="status" className="mentor-ranking-note">{t("Save or cancel your preference changes before choosing a lecturer.")}</p>}
    {!canInvite && <p className="mentor-ranking-note">{t("Members can suggest lecturers. The project owner sends invitations.")}</p>}
    <div className="mentor-results" aria-busy={search.isFetching}>
      {search.isLoading && <div role="status" aria-label={t("Loading…")}>{[1, 2, 3].map(key => <div key={key} className="flex gap-4 py-5"><Skeleton className="h-14 w-14 shrink-0 rounded-full" /><div className="flex-1 space-y-3"><Skeleton className="h-5 w-1/3" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /></div></div>)}</div>}
      {search.isError && <div role="alert" className="mentor-search-empty"><p>{t(mentorshipError(search.error))}</p><Button variant="outline" size="sm" onClick={() => void search.refetch()}>{t("Try again")}</Button></div>}
      {search.data?.items.map(mentor => <article key={mentor._id} className="mentor-result">
        <div className="mentor-avatar" aria-hidden="true">{mentor.avatarUrl ? <img src={mentor.avatarUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : mentor.fullName?.split(/\s+/).filter(Boolean).slice(-2).map(part => part[0]).join("") || "?"}</div>
        <div className="mentor-result-body"><div className="mentor-result-name"><Link target="_blank" rel="noopener noreferrer" to={`/academics/${encodeURIComponent(mentor._id)}`}>{mentor.fullName}</Link><BadgeCheck size={17} aria-label={t("Verified Lecturer")} /></div>{mentor.positionTitle && <p className="mentor-position">{mentor.positionTitle}</p>}{mentor.institutionName && <p className="mentor-institution"><Building2 size={14} aria-hidden="true" />{mentor.institutionName}</p>}
          <div className="mentor-expertise">{mentor.expertiseAreas.slice(0, 4).map(term => <span key={term}>{term}</span>)}{mentor.expertiseAreas.length > 4 && <span title={mentor.expertiseAreas.slice(4).join(" · ")}>+{mentor.expertiseAreas.length - 4}</span>}</div>
          {mentor.matchedTerms.length > 0 && <p className="mentor-match"><BadgeCheck size={14} aria-hidden="true" />{t("Matches your project")}: {mentor.matchedTerms.join(" · ")}</p>}{mentor.sameInstitution && <p className="mentor-match">{t("Same institution as your project owner")}</p>}
          {mentor.researchInterests.some(term => !mentor.expertiseAreas.some(area => area.toLocaleLowerCase() === term.toLocaleLowerCase())) && <p className="mentor-interests">{t("Research Interest")}: {mentor.researchInterests.filter(term => !mentor.expertiseAreas.some(area => area.toLocaleLowerCase() === term.toLocaleLowerCase())).join(" · ")}</p>}
        </div><div className="mentor-result-actions"><span className="mentor-available">{t("Accepting new teams")}</span><Button size="sm" disabled={disabled || editingPreferences} onClick={() => setSelected(mentor)}>{t(canInvite ? "Invite as Mentor" : "Suggest Mentor")}</Button><Link target="_blank" rel="noopener noreferrer" to={`/academics/${encodeURIComponent(mentor._id)}`}>{t("View profile")}</Link></div>
      </article>)}
      {search.data && !search.data.items.length && <div className="mentor-search-empty"><Search size={26} aria-hidden="true" /><h4>{t(filtered ? "No available Mentors match these filters." : "No lecturers are available right now.")}</h4><p>{t(filtered ? "Try a broader search or remove a filter." : "Lecturers appear here when they are verified and accepting new teams.")}</p>{filtered && <Button variant="outline" size="sm" onClick={clear}>{t("Clear filters")}</Button>}</div>}
    </div><Pager meta={search.data?.meta} onPage={setPage} />
    {selected && <ConsentComposer project={project} mentor={selected} suggestion={!canInvite} onClose={() => setSelected(undefined)} />}
    <Dialog open={editingPreferences} onOpenChange={async open => { if (open || await canLeaveWorkspace()) setEditingPreferences(open); }}><DialogContent className="mentor-preferences-dialog max-h-[88dvh] overflow-y-auto sm:max-w-2xl" data-no-i18n><DialogHeader className="pr-6 text-left"><DialogTitle>{t("Mentor preferences")}</DialogTitle><DialogDescription>{t("Saved fields and expertise are used to rank lecturers. Describe the support you need in your invitation.")}</DialogDescription></DialogHeader>{editingPreferences && <MentorDiscoverySettings projectId={project.id} startEditing onDone={() => setEditingPreferences(false)} />}</DialogContent></Dialog>
  </section>;
}
function MentorPositionSummary({ collection }: { collection: MentorshipCollection }) {
  const { t } = useI18n();
  if (!collection.positions) return null;
  const labels = { LOCKED: "Requires a primary mentor", VACANT: "Position available", INVITING: "Invitations pending", ASSIGNED: "Mentor assigned" } as const;
  return <section aria-label={t("Mentor assignments")} className="mentor-position-summary">
    <ol className="mentor-position-list">{(["PRIMARY", "SECONDARY"] as const).map(role => {
      const position = collection.positions![role], relationship = collection.relationships.find(r => r.status === "ACTIVE" && r.mentorRole === role);
      return <li key={role} data-status={position.status}><div className="mentor-position-label"><span className="mentor-position-dot" aria-hidden="true" /><p>{t(role === "PRIMARY" ? "Primary mentor" : "Secondary mentor")}</p>{role === "SECONDARY" && <span className="mentor-position-optional">{t("Optional")}</span>}</div>
        <div className="mentor-position-value">{relationship ? <Link target="_blank" rel="noopener noreferrer" to={`/academics/${encodeURIComponent(relationship.mentorUser._id)}`}>{relationship.mentorUser.fullName}</Link> : <span>{t(labels[position.status])}</span>}{position.pendingRequests > 0 && <span className="mentor-position-pending">{position.pendingRequests}/3 {t("pending requests")}</span>}</div>
      </li>;
    })}</ol>
  </section>;
}
export function MentorProjectPanel({ projectId }: { projectId: string }) {
  const userId = useAuthStore(s => s.user?.id), { t } = useI18n();
  const [tab, setTab] = useState<"find" | "requests">("find"), [requestPage, setRequestPage] = useState(1);
  const workspace = useQuery({ queryKey: ["academic-support", userId, "workspace", projectId], queryFn: () => academicSupportApi.workspace(projectId) });
  const list = useQuery({ queryKey: ["academic-support", userId, "project", projectId, requestPage], queryFn: () => academicSupportApi.list(projectId, { page: requestPage }) });
  useEffect(() => { setTab("find"); setRequestPage(1); }, [projectId]);
  if (workspace.isLoading) return <div className="mentor-workspace space-y-5" role="status" aria-label={t("Loading academic support…")}><Skeleton className="h-8 w-48" /><Skeleton className="h-20 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-44 w-full" /></div>;
  if (!workspace.data || workspace.isError) return <div role="alert" className="mentor-workspace space-y-3 text-sm text-muted-foreground"><p>{t("Academic Support is available to the project team and active verified mentors.")}</p><Button variant="outline" size="sm" onClick={() => void workspace.refetch()}>{t("Try again")}</Button></div>;
  const data = workspace.data, canFind = data.accessRole === "TEAM" && data.canProvideFeedback;
  const activeTab = canFind ? tab : "requests";
  const unavailable = !list.data || list.isError || (list.data.positions ? !Object.values(list.data.positions).some(p => ["VACANT", "INVITING"].includes(p.status) && p.pendingRequests < (list.data!.policy.maxPendingPerRole ?? 3)) : list.data.counts.active >= list.data.policy.maxActiveMentors || list.data.counts.pending >= list.data.policy.maxPendingRequests);
  const changeTab = async (next: "find" | "requests", focus = false) => {
    if (next !== activeTab && !await canLeaveWorkspace()) return;
    setTab(next);
    if (focus) document.getElementById(`mentor-${next}-tab-${projectId}`)?.focus();
  };
  return <section className="mentor-workspace" data-no-i18n>
    <header className="mentor-page-heading"><p className="mentor-project-name">{data.project.title}</p><h2>{t(canFind ? "Find Mentors" : "Invitations & mentors")}</h2><p>{t(canFind ? "Find the right expertise for your team. Invite a lecturer or review incoming offers." : "Academic mentors are separate from project members.")}</p>
      {data.accessRole === "MENTOR" && <Link className="mt-3 inline-flex text-sm text-primary underline underline-offset-4" to={`/projects/${encodeURIComponent(projectId)}/plan-review`}>{t("Open shared plan and questions")}</Link>}
    </header>
    {list.data ? <MentorPositionSummary collection={list.data} /> : !list.isError && <Skeleton className="my-5 h-20 w-full" />}
    {canFind && <div role="tablist" aria-label={t("Project mentorship")} className="mentor-workspace-tabs" onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      void changeTab(event.key === "Home" ? "find" : event.key === "End" ? "requests" : activeTab === "find" ? "requests" : "find", true);
    }}>
      <button type="button" role="tab" id={`mentor-find-tab-${projectId}`} aria-selected={activeTab === "find"} aria-controls={`mentor-find-panel-${projectId}`} tabIndex={activeTab === "find" ? 0 : -1} onClick={() => void changeTab("find")}><Search size={17} aria-hidden="true" />{t("Find Mentors")}</button>
      <button type="button" role="tab" id={`mentor-requests-tab-${projectId}`} aria-selected={activeTab === "requests"} aria-controls={`mentor-requests-panel-${projectId}`} tabIndex={activeTab === "requests" ? 0 : -1} onClick={() => void changeTab("requests")}><Mail size={17} aria-hidden="true" />{t("Invitations & mentors")}{Boolean(list.data?.counts.pending) && <span className="mentor-tab-count">{list.data!.counts.pending}</span>}</button>
    </div>}
    {canFind && <div role="tabpanel" id={`mentor-find-panel-${projectId}`} aria-labelledby={`mentor-find-tab-${projectId}`} hidden={activeTab !== "find"}><MentorSearch project={data.project} canInvite={data.canManage} disabled={unavailable} /></div>}
    <div role={canFind ? "tabpanel" : undefined} id={`mentor-requests-panel-${projectId}`} aria-labelledby={canFind ? `mentor-requests-tab-${projectId}` : undefined} hidden={activeTab !== "requests"} className="mentor-requests-panel">
      {list.isLoading && <Skeleton className="h-36 w-full" />}
      {list.data && <><div className="mentor-requests-heading"><h3>{t("Invitations & mentors")}</h3><p>{list.data.counts.active} {t("active mentors")} · {list.data.counts.pending} {t("pending requests")}</p></div><MentoringItems items={[...list.data.relationships, ...list.data.requests]} /><Pager meta={list.data.requestMeta.totalPages >= list.data.relationshipMeta.totalPages ? list.data.requestMeta : list.data.relationshipMeta} onPage={setRequestPage} /></>}
    </div>
    {list.isError && <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 text-sm text-destructive"><p>{t("Unable to load mentorship requests.")}</p><Button size="sm" variant="outline" onClick={() => void list.refetch()}>{t("Try again")}</Button></div>}
  </section>;
}
