import { useEffect, useState, useMemo, useRef } from "react";
import { Link, Navigate, useSearchParams, useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AcademicPageMeta, AvailableMentor, MentorshipPerson, MentorRole } from "@trend/shared-types";
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
import { canLeaveWorkspace, useUnsavedWorkspace } from "@/features/projects/components/workspace-common";
import { MentorPreviewContent, MentorInvitationSender } from "@/features/projects/components/mentor-preview";
import { MentorGuidance } from "@/features/projects/components/mentor-guidance";
import { MentorAccessWorkspace, MentorPolicyFields, MentorPolicySummary, defaultMentorPolicy } from "@/features/projects/components/mentor-access-workspace";
import { MentorSearchPagination } from "@/features/projects/components/mentor-search-pagination";
import { projectsApi } from "@/features/projects/api/projects.api";
import { useAuthStore } from "@/stores/auth-store";
import { ArrowUpRight, BadgeCheck, Building2, Check, ChevronDown, Compass, Globe, GraduationCap, History, Inbox, Lock, Mail, Search, Send, Settings2, SlidersHorizontal, Sparkles, Tag, Target, Users, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useInvitationContent, InvitationAttachments, InvitationUpload } from "@/features/projects/components/mentorship-invitation-content";
import "@/features/projects/mentor-discovery.css";
import "./academic-support.css";

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
  const [area, setArea] = useState("");
  const [showArea, setShowArea] = useState(false);
  const [offerProject, setOfferProject] = useState<MentorPreview>();
  const deferredArea = useDebouncedValue(area, 300);
  const [search, setSearch] = useState(""), q = useDebouncedValue(search, 300), [page, setPage] = useState(1), [opportunityPage, setOpportunityPage] = useState(1);
  const [params, setParams] = useSearchParams(), projectId = params.get("projectId");
  const requestedView = params.get("view");
  const view = requestedView === "discover" && lecturer ? "discover" : (["incoming", "outgoing", "active", "history"] as const).find(tab => tab === requestedView) ?? "incoming";
  const requestView = view === "discover" ? "incoming" : view;
  const changeView = (next: string) => { setPage(1); setParams(current => { const updated = new URLSearchParams(current); updated.set("view", next); updated.delete("projectId"); return updated; }); };
  const mine = useQuery({ queryKey: ["academic-support", userId, "mine", requestView, page], queryFn: () => academicSupportApi.mine({ page, view: requestView }), enabled: Boolean(userId) });
  const opportunities = useQuery({ queryKey: ["academic-support", userId, "opportunities", q, deferredArea, opportunityPage], queryFn: () => academicSupportApi.opportunities({ q, area: deferredArea || undefined, page: opportunityPage }), enabled: lecturer && view === "discover" && pref.data?.acceptingMentorships === true });
  const tabs = [...(lecturer ? ["discover" as const] : []), "incoming", "active", "outgoing", "history"] as const;
  const tabLabels = { discover: "Find teams to mentor", incoming: "Incoming Requests", active: lecturer ? "Teams you mentor" : "Active Mentorships", outgoing: lecturer ? "Sent mentorship offers" : "Outgoing Requests", history: "Mentoring history" };
  const tabIcons = { discover: Search, incoming: Inbox, active: Users, outgoing: Send, history: History };
  const clearFilters = () => { setSearch(""); setArea(""); setOpportunityPage(1); };
  const openProject = (id: string) => { if (lecturer) navigate(`/academic-support/projects/${encodeURIComponent(id)}`); else setParams(current => { const next = new URLSearchParams(current); next.set("projectId", id); return next; }); };
  if (profile.isLoading) return <main className="mx-auto w-full max-w-5xl px-4 py-7"><p role="status">{t("Loading…")}</p></main>;
  if (profile.isError) return <main className="mx-auto w-full max-w-5xl space-y-3 px-4 py-7"><p role="alert">{t("Unable to load your profile.")}</p><Button variant="outline" onClick={() => void profile.refetch()}>{t("Try again")}</Button></main>;
  if (lecturer && projectId) return <Navigate to={`/academic-support/projects/${encodeURIComponent(projectId)}`} replace />;
  return <main className={`academic-support-page ${lecturer ? "lecturer-workspace" : ""}`} data-no-i18n>
    <header className="academic-support-heading"><div><h1>{t(lecturer ? "Lecturer workspace" : "Academic Support")}</h1><p>{t(lecturer ? "Connect with student teams and guide their next research step." : "Mentoring provides project guidance. Formal review requires a separate artifact request.")}</p></div>{lecturer && <a className="lecturer-availability" href="#mentoring-settings" onClick={() => { const settings = document.querySelector<HTMLDetailsElement>("#mentoring-settings"); if (settings) settings.open = true; }}><span data-enabled={pref.data?.acceptingMentorships === true} aria-hidden="true" />{t(pref.isError ? "Availability unavailable" : pref.isLoading ? "Loading…" : pref.data?.acceptingMentorships ? "Accepting new teams" : "Not accepting new teams")}<Settings2 size={15} aria-hidden="true" /></a>}</header>
    <div className="academic-support-layout"><aside className="academic-support-sidebar"><nav className="academic-support-nav" aria-label={t("Mentoring workspace")}>
      {tabs.map(tab => { const Icon = tabIcons[tab]; return <button type="button" key={tab} aria-current={view === tab ? "page" : undefined} onClick={() => changeView(tab)}><Icon size={18} aria-hidden="true" /><span>{t(tabLabels[tab])}</span>{(tab === "incoming" || tab === "active") && mine.data && <span className="academic-nav-count">{tab === "incoming" ? mine.data.counts.incoming : mine.data.counts.active}</span>}</button>; })}
    </nav><div className="academic-support-links"><Link to="/reviews">{t("Academic Reviews")}<ArrowUpRight size={14} aria-hidden="true" /></Link><Link to="/projects">{t("Your projects")}<ArrowUpRight size={14} aria-hidden="true" /></Link></div></aside>
    <div className="academic-support-content">
    {view === "discover" ? <section className="space-y-4" aria-label={t("Find teams to mentor")}><div className="academic-section-heading"><div><h2>{t("Find teams to mentor")}</h2><p>{t("Explore shared research interests and the support each team needs.")}</p></div></div>
      {pref.isLoading ? <p role="status">{t("Loading…")}</p> : pref.isError ? <div role="alert" className="space-y-2"><p>{t("Unable to load mentoring preferences.")}</p><Button variant="outline" onClick={() => void pref.refetch()}>{t("Try again")}</Button></div> : !pref.data?.acceptingMentorships ? <div className="space-y-3 rounded-lg border bg-muted/30 p-4"><p className="text-sm">{t(pref.data?.canEnable ? "Enable mentoring availability below to discover teams and receive invitations." : "Lecturer verification is required before accepting official mentorships.")}</p><a className="text-sm font-medium text-primary underline underline-offset-4" href="#mentoring-settings">{t("Mentoring availability")}</a></div> : <>
      <div className="mentor-search-controls"><div className="mentor-search-input"><Search size={18} aria-hidden="true" /><Input aria-label={t("Search mentor opportunities")} placeholder={t("Search by project or topic")} value={search} maxLength={160} onChange={e => { setSearch(e.target.value); setOpportunityPage(1); }} />{search && <Button size="icon" variant="ghost" aria-label={t("Clear search")} onClick={() => { setSearch(""); setOpportunityPage(1); }}><X size={16} aria-hidden="true" /></Button>}</div><Button variant="outline" aria-expanded={showArea} aria-controls="team-area-filter" onClick={() => setShowArea(value => !value)}><SlidersHorizontal size={16} aria-hidden="true" />{t("Research Area")}{area && <span className="mentor-filter-count">1</span>}</Button></div>
      <div id="team-area-filter" hidden={!showArea} className="team-area-filter"><label htmlFor="team-area-input">{t("Filter by research area")}</label><Input id="team-area-input" placeholder={t("For example: Artificial Intelligence")} value={area} maxLength={120} onChange={e => { setArea(e.target.value); setOpportunityPage(1); }} /></div>
      <div className="team-results-summary" role="status" aria-live="polite"><span>{opportunities.isFetching ? t("Finding teams…") : opportunities.isSuccess ? `${opportunities.data.meta.total} ${t("teams seeking guidance")}` : ""}</span>{(search || area) ? <Button variant="ghost" size="sm" onClick={clearFilters}><X size={14} aria-hidden="true" />{t("Clear filters")}</Button> : <span>{t("Shared interests first")}</span>}</div>
      {opportunities.isLoading && <div aria-label={t("Loading…")} className="space-y-3"><Skeleton className="h-48 w-full rounded-xl" /><Skeleton className="h-48 w-full rounded-xl" /></div>}{opportunities.isError && <div role="alert" className="academic-empty"><p>{t(mentorshipError(opportunities.error))}</p><Button variant="outline" size="sm" onClick={() => void opportunities.refetch()}>{t("Try again")}</Button></div>}
      {opportunities.isSuccess && !opportunities.isFetching && !opportunities.data.items.length && <div className="academic-empty"><Search size={24} aria-hidden="true" /><p>{t(q || deferredArea ? "No teams match these filters. Try another topic or clear the filters." : "No projects are seeking mentors right now.")}</p>{(search || area) && <Button variant="outline" size="sm" onClick={clearFilters}>{t("Clear filters")}</Button>}</div>}
      <div className="team-opportunities" aria-busy={opportunities.isFetching}>{!opportunities.isError && opportunities.data?.items.map(p => <Opportunity key={p.id} preview={p} onOffer={() => setOfferProject(p)} />)}</div><Pager meta={opportunities.data?.meta} onPage={setOpportunityPage} />
    </> }</section> : <section className="space-y-4" aria-label={t(tabLabels[view])}><div className="academic-section-heading"><div><h2>{t(tabLabels[view])}</h2>
      {lecturer && <p>{t(view === "incoming" ? "Review the team's request before accepting a mentoring role." : view === "active" ? "Open a team to review its research and provide guidance." : view === "outgoing" ? "Follow the offers you have sent. Teams decide whether to accept." : "Review previous requests and completed mentorships.")}</p>}</div></div>
      {mine.isLoading ? <p role="status">{t("Loading…")}</p> : mine.isError ? <div role="alert" className="space-y-2"><p>{t("Unable to load mentorship requests.")}</p><Button variant="outline" size="sm" onClick={() => void mine.refetch()}>{t("Try again")}</Button></div> : <>
        {mine.data && !mine.data.requests.length && !mine.data.relationships.length ? <p className="rounded-lg border border-dashed p-6 text-sm leading-6 text-muted-foreground">{t(view === "incoming" ? "No incoming mentorship invitations. Teams can invite you from your profile when you are accepting new teams." : view === "outgoing" ? "No outgoing mentorship requests yet." : view === "active" ? "No active mentorships yet. Accepted invitations and offers will appear here." : "No mentorship history yet.")}</p> : <MentoringItems items={[...(mine.data?.relationships ?? []), ...(mine.data?.requests ?? [])]} onOpen={openProject} />}
        <Pager meta={mine.data && (mine.data.requestMeta.totalPages >= mine.data.relationshipMeta.totalPages ? mine.data.requestMeta : mine.data.relationshipMeta)} onPage={setPage} /></>}
    </section>}
    {!lecturer && <ProjectMentorFinder onSelect={id => setParams(id ? { projectId: id } : {})} selected={projectId ?? ""} />}
    {projectId && <MentorProjectPanel key={projectId} projectId={projectId} />}
    </div></div>
    <details id="mentoring-settings" open={lecturer && pref.data && !pref.data.acceptingMentorships || undefined} className="academic-support-settings scroll-mt-24"><summary><Settings2 size={17} aria-hidden="true" />{t("Mentoring availability & notifications")}<ChevronDown size={16} aria-hidden="true" /></summary><div className="mt-4 space-y-4">
      {lecturer && profile.data && pref.data && !pref.data.canEnable && <PositionVerificationPanel profile={profile.data} editable onEditPosition={() => navigate("/profile?edit=affiliation")} />}
      <MentoringPreferencesPanel lecturer={lecturer} />
    </div></details>
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
  const [accessPolicy, setAccessPolicy] = useState(defaultMentorPolicy);
  useUnsavedWorkspace(invitation && JSON.stringify(accessPolicy) !== JSON.stringify(defaultMentorPolicy()));
  const settings = useQuery({ queryKey: ["academic-support", userId, "discovery-settings", project.id], queryFn: () => academicSupportApi.settings(project.id), enabled: invitation });
  const send = useMutation({ mutationFn: async () => {
    if (!suggestion) await content.persist();
    const payload = { mentorRole: content.mentorRole, attachmentIds: content.attachments.map(a => a.id), ...(invitation ? { access: accessPolicy } : {}) };
    return mentor ? suggestion ? academicSupportApi.suggest(project.id, mentor._id, content.message) : academicSupportApi.request(project.id, mentor._id, content.message, key, payload) : academicSupportApi.offer(project.id, content.message, key, payload);
  }, onSuccess: () => { if (!mentor) toast.success(t("Mentorship offer sent. Track the team's response in Sent mentorship offers.")); refresh(); onClose(); }, onError: refresh });
  const close = async () => {
    if (send.isPending || closing || content.uploading || !await canLeaveWorkspace()) return;
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
      {invitation && <details><summary className="cursor-pointer text-sm font-medium">Quyền và nội dung chia sẻ sau khi chấp nhận</summary><MentorPolicyFields projectId={project.id} value={accessPolicy} onChange={value => { setAccessPolicy(value); if (send.isError) { setKey(crypto.randomUUID()); send.reset(); } }} disabled={send.isPending || closing} /></details>}
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
  const [expanded, setExpanded] = useState(false);
  const stages = { PLANNING: "Planning", ACTIVE: "Active", ON_HOLD: "On hold", COMPLETED: "Completed", ARCHIVED: "Archived" };
  return <article className="team-opportunity"><div className="team-opportunity-top"><div className="team-opportunity-areas">{preview.researchAreas.map(term => <span key={term}>{t(term)}</span>)}</div><span className="team-opportunity-stage">{t(stages[preview.stage])}</span></div>
    <h3>{preview.title}</h3><p className={expanded ? "team-opportunity-summary" : "team-opportunity-summary line-clamp-2"}>{preview.summary || t("No public description yet.")}</p>
    <div className="team-opportunity-need"><p>{t("Where you can help")}</p><p>{preview.mentoringNeeds || t("Discuss the team's mentoring needs before agreeing to guide them.")}</p></div>
    <div id={`team-detail-${preview.id}`} hidden={!expanded} className="team-opportunity-detail">{preview.expertise.length > 0 && <div><p>{t("Expertise requested")}</p><div className="team-expertise">{preview.expertise.map(term => <span key={term}>{t(term)}</span>)}</div></div>}{Boolean(preview.availableRoles?.length) && <p>{t("Available mentoring roles")}: {preview.availableRoles!.map(role => t(role === "PRIMARY" ? "Primary mentor" : "Secondary mentor")).join(" · ")}</p>}<p>{t("The team leader reviews your offer before you receive project access.")}</p></div>
    <div className="team-opportunity-actions"><button type="button" aria-expanded={expanded} aria-controls={`team-detail-${preview.id}`} onClick={() => setExpanded(value => !value)}>{t(expanded ? "Show less" : "View team details")}<ChevronDown size={16} aria-hidden="true" /></button><Button size="sm" onClick={onOffer}>{t("Offer Mentorship")}<ArrowUpRight size={15} aria-hidden="true" /></Button></div></article>;
}
export function MentorshipList({ items, onOpen }: { items: MentorshipItem[]; onOpen?: (id: string) => void }) {
  const { t } = useI18n(), refresh = useSupportRefresh();
  const userId = useAuthStore(s => s.user?.id);
  const [action, setAction] = useState<{ item: MentorshipItem; kind: "accept" | "decline" | "cancel" | "end"; open: boolean }>(), [note, setNote] = useState(""), [preview, setPreview] = useState<MentorshipItem>();
  const closeAction = () => setAction(current => current && { ...current, open: false });
  const response = useMutation({ mutationFn: () => academicSupportApi.respond(action!.item, action!.kind, note), onSuccess: () => { if (action?.kind === "accept") toast.success(t("Mentorship accepted. Open Active Mentorships to work with the team.")); closeAction(); setNote(""); refresh(); }, onError: refresh });
  function choose(item: MentorshipItem, kind: "accept" | "decline" | "cancel" | "end") { response.reset(); setNote(""); setAction({ item, kind, open: true }); }
  if (!items.length) return <p className="text-sm text-muted-foreground">{t("No mentorship requests or active mentors.")}</p>;
  return <><ul className="mentorship-list divide-y rounded-lg border bg-card">{items.map(item => <li key={`${item.kind}-${item.id}`} className="space-y-2 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div>{item.mentorUser._id === userId ? <h3 className="text-base font-semibold">{item.project?.title ?? t("Research project")}</h3> : <Link target="_blank" rel="noopener noreferrer" to={`/academics/${encodeURIComponent(item.mentorUser._id)}`} className="text-sm font-medium hover:underline">{item.mentorUser.fullName}</Link>}
      {item.mentorUser._id !== userId && <p className="mt-1 text-xs text-muted-foreground">{[item.mentorUser.positionTitle, item.mentorUser.institutionName, item.mentorUser.verifiedLecturer ? t("Verified Lecturer") : undefined].filter(Boolean).join(" · ")}</p>}
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{[item.mentorUser._id !== userId ? item.project?.title : undefined, t(item.mentorRole === "SECONDARY" ? "Secondary mentor" : "Primary mentor"), t(item.kind === "RELATIONSHIP" ? item.status === "ACTIVE" ? "Mentorship active" : "Mentorship ended" : item.status), t(item.kind === "REQUEST" ? item.direction === "LECTURER_TO_PROJECT" ? "Mentorship offer" : "Mentorship request" : "Academic Mentor")].filter(Boolean).join(" · ")}</p>
      {item.kind === "RELATIONSHIP" && <p className="mt-1 text-xs text-muted-foreground">{t("Mentoring since")} {new Date(item.startedAt).toLocaleDateString()}</p>}
    </div><div className="flex flex-wrap gap-2">
      {item.kind === "REQUEST" && <Button variant="ghost" size="sm" onClick={() => setPreview(item)}>{t("View Project Preview")}</Button>}
      {item.actions.cancel && <Button variant="ghost" size="sm" onClick={() => choose(item, "cancel")}>{t("Cancel request")}</Button>}
      {item.actions.decline && <Button variant="outline" size="sm" onClick={() => choose(item, "decline")}>{t("Decline")}</Button>}
      {item.actions.accept && <Button size="sm" onClick={() => choose(item, "accept")}>{t("Accept")}</Button>}
      {item.actions.openProject && (onOpen ? <Button variant="outline" size="sm" onClick={() => onOpen(item.projectId)}>{t("Open project")}</Button> : <Button variant="outline" size="sm" asChild><Link to={item.mentorUser._id === userId ? `/academic-support/projects/${encodeURIComponent(item.projectId)}` : `/academic-support?projectId=${encodeURIComponent(item.projectId)}`}>{t("Open project")}</Link></Button>)}
      {item.actions.end && <Button variant="ghost" size="sm" onClick={() => choose(item, "end")}>{t("End mentorship")}</Button>}
    </div></div>
    {item.kind === "REQUEST" && <><p className="text-xs text-muted-foreground">{t("Requested by")}: {item.requestedBy.fullName} · {[item.requestedBy.academicRole && t(item.requestedBy.academicRole), item.requestedBy.institutionName].filter(Boolean).join(" · ")}</p>{item.message && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{item.message}</p>}{Boolean(item.attachments?.length) && <InvitationAttachments attachments={item.attachments!} />}{item.responseNote && <p className="text-xs text-muted-foreground">{item.responseNote}</p>}{item.closeReason === "MENTOR_POSITION_FILLED" && <p className="text-xs text-muted-foreground">{t("The mentor position has been filled.")}</p>}{item.status === "PENDING" && item.expiresAt && <p className="text-xs text-muted-foreground">{t("Expires")}: {new Date(item.expiresAt).toLocaleDateString()}</p>}</>}
  </li>)}</ul>
  <Dialog open={action?.open ?? false} onOpenChange={open => { if (!open) closeAction(); }}><DialogContent><DialogHeader><DialogTitle>{t(action?.kind === "accept" ? "Accept mentorship" : action?.kind === "decline" ? "Decline mentorship" : action?.kind === "end" ? "End mentorship" : "Cancel mentorship request")}</DialogTitle><DialogDescription>{t(action?.kind === "end" ? "Mentor access will end immediately. Previous guidance remains in project history." : "Mentorship remains separate from formal academic review.")}</DialogDescription></DialogHeader>
    {action?.kind === "accept" && <MentorPolicySummary policy={action.item.accessPolicy} />}
    <label className="space-y-1.5 text-sm"><span>{t("Optional note")}</span><textarea aria-label={t("Note")} className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={note} maxLength={1000} onChange={e => setNote(e.target.value)} /></label>{response.error && <p role="alert" className="text-sm text-destructive">{t(mentorshipError(response.error))}</p>}<Button disabled={response.isPending} onClick={() => response.mutate()}>{t("Confirm")}</Button>
  </DialogContent></Dialog>
  <Dialog open={Boolean(preview)} onOpenChange={open => { if (!open) setPreview(undefined); }}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>{t("View Project Preview")}</DialogTitle><DialogDescription>{t("Only the shared preview is available before acceptance.")}</DialogDescription></DialogHeader>{preview?.project && <MentorPreviewContent preview={preview.project} />}{preview?.kind === "REQUEST" && <><MentorPolicySummary policy={preview.accessPolicy} /><MentorInvitationSender sender={preview.requestedBy} /><p className="text-sm font-medium">{t(preview.mentorRole === "SECONDARY" ? "Secondary mentor" : "Primary mentor")}</p><InvitationAttachments attachments={preview.attachments ?? []} />{preview.message && <div><p className="text-xs font-medium text-muted-foreground">{t("Message")}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{preview.message}</p></div>}</>}</DialogContent></Dialog>
  </>;
}
function MentorSearch({ project, disabled, canInvite }: { project: MentorPreview; disabled: boolean; canInvite: boolean }) {
  const { t } = useI18n(), [filters, setFilters] = useState<AcademicSearch>({}), deferred = useDebouncedValue(filters, 300), [page, setPage] = useState(1), [selected, setSelected] = useState<AvailableMentor>();
  const [pageSize, setPageSize] = useState(6);
  const resultsHeading = useRef<HTMLDivElement>(null);
  const showPage = (next: number) => { setPage(next); resultsHeading.current?.scrollIntoView?.({ block: "start" }); };
  const [showFilters, setShowFilters] = useState(false);
  const [editingPreferences, setEditingPreferences] = useState(false);
  const taxonomy = useQuery({ queryKey: ["onboarding-options"], queryFn: () => authApi.academicOnboardingOptions() });
  const userId = useAuthStore(s => s.user?.id);
  const settings = useQuery({ queryKey: ["academic-support", userId, "discovery-settings", project.id], queryFn: () => academicSupportApi.settings(project.id), enabled: canInvite });
  const preferences = settings.data ?? project;
  const terms = [...new Set([...preferences.researchAreas, ...preferences.expertise])];
  const search = useQuery({ queryKey: ["academic-support", userId, "mentor-search", project.id, deferred, page, pageSize], queryFn: () => academicSupportApi.mentors(project.id, { ...deferred, page, pageSize }), placeholderData: keepPreviousData });
  const lastPage = Math.max(1, search.data?.meta.totalPages ?? 1);
  const correctingPage = search.data?.meta.page === page && page > lastPage;
  useEffect(() => { if (correctingPage) setPage(lastPage); }, [correctingPage, lastPage]);
  const change = (field: keyof AcademicSearch, value: string) => { setFilters(current => ({ ...current, [field]: value || undefined })); setPage(1); };
  const filterCount = [filters.area, filters.interest, filters.institution, filters.position].filter(Boolean).length;
  const filtered = Boolean(filters.q?.trim() || filterCount);
  const clear = () => { setFilters({}); setPage(1); };

  const suggestedTopics = useMemo(() => {
    const topicMap = new Map<string, { name: string; isProjectTopic: boolean; count: number }>();
    terms.forEach(term => {
      const trimmed = term.trim();
      if (trimmed) {
        topicMap.set(trimmed.toLowerCase(), { name: trimmed, isProjectTopic: true, count: 0 });
      }
    });

    if (search.data?.items) {
      search.data.items.forEach(m => {
        m.matchedTerms?.forEach(term => {
          const key = term.trim().toLowerCase();
          const existing = topicMap.get(key);
          if (existing) {
            existing.count += 1;
          } else {
            topicMap.set(key, { name: term.trim(), isProjectTopic: true, count: 1 });
          }
        });
        m.expertiseAreas?.forEach(area => {
          const key = area.trim().toLowerCase();
          const existing = topicMap.get(key);
          if (existing) {
            existing.count += 1;
          } else if (topicMap.size < 10) {
            topicMap.set(key, { name: area.trim(), isProjectTopic: false, count: 1 });
          }
        });
      });
    }

    if (taxonomy.data?.researchAreas && topicMap.size < 5) {
      taxonomy.data.researchAreas.forEach(area => {
        const key = area.trim().toLowerCase();
        if (!topicMap.has(key) && topicMap.size < 8) {
          topicMap.set(key, { name: area.trim(), isProjectTopic: false, count: 0 });
        }
      });
    }

    return Array.from(topicMap.values()).sort((a, b) => {
      if (a.isProjectTopic && !b.isProjectTopic) return -1;
      if (!a.isProjectTopic && b.isProjectTopic) return 1;
      return b.count - a.count;
    });
  }, [terms, search.data?.items, taxonomy.data?.researchAreas]);

  return <section aria-label={t("Find Mentors")} className="mentor-search">
    {settings.isError && <p role="alert" className="mb-3 text-sm text-destructive">{t("Could not load mentor discovery settings.")}</p>}

    <div className="mentor-discovery-hub">
      <div className="mentor-hub-header">
        <div className="mentor-hub-header-left">
          <div className="mentor-hub-icon" aria-hidden="true">
            <Compass size={16} />
          </div>
          <div className="mentor-hub-title-group">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="mentor-hub-title">{t("Mentor preferences")}</h3>
              <span className="mentor-brief-status-pill" data-mode={preferences.discovery}>
                {preferences.discovery === "SEEKING_MENTOR" ? (
                  <>
                    <Globe size={11} className="shrink-0" />
                    <span>{t("Seeking Mentor")}</span>
                  </>
                ) : (
                  <>
                    <Lock size={11} className="shrink-0" />
                    <span>{t("Private")}</span>
                  </>
                )}
              </span>
            </div>
            <p className="mentor-hub-sub">
              {preferences.discovery === "SEEKING_MENTOR"
                ? t("Verified lecturers can discover your shared project preview.")
                : t("Only lecturers you invite will see this preview. Project discovery is off.")}
            </p>
          </div>
        </div>

        {canInvite && (
          <Button
            size="sm"
            variant="ghost"
            className="mentor-hub-edit-btn"
            onClick={() => setEditingPreferences(true)}
          >
            <SlidersHorizontal size={13} aria-hidden="true" />
            <span>{t(terms.length ? "Edit preferences" : "Set up mentor preferences")}</span>
          </Button>
        )}
      </div>

      {preferences.mentoringNeeds && (
        <div className="mentor-hub-needs-strip">
          <Sparkles size={13} className="text-amber-500 shrink-0" aria-hidden="true" />
          <span className="mentor-hub-needs-label">{t("Mentoring support needed:")}</span>
          <span className="mentor-hub-needs-text">{preferences.mentoringNeeds}</span>
        </div>
      )}

      <div className="mentor-hub-search-row">
        <div className="mentor-search-input">
          <Search size={16} aria-hidden="true" />
          <Input
            aria-label={t("Search available mentors")}
            placeholder={t("Name, institution, research area or interest")}
            maxLength={160}
            value={filters.q ?? ""}
            onChange={e => change("q", e.target.value)}
          />
          {filters.q && (
            <Button size="icon" variant="ghost" aria-label={t("Clear search")} onClick={() => change("q", "")}>
              <X size={15} aria-hidden="true" />
            </Button>
          )}
        </div>
        <Button
          variant="outline"
          className="mentor-hub-filter-btn"
          aria-expanded={showFilters}
          aria-controls={`mentor-filters-${project.id}`}
          onClick={() => setShowFilters(value => !value)}
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
          <span>{t("Filters")}</span>
          {filterCount > 0 && <span className="mentor-filter-count">{filterCount}</span>}
        </Button>
      </div>

      <div className="mentor-hub-topics-bar" aria-label={t("Suggested research topics")}>
        <div className="mentor-hub-topics-label">
          <Tag size={12} className="text-primary shrink-0" aria-hidden="true" />
          <span>{t("Suggested research topics")}:</span>
        </div>
        <div className="mentor-topic-chips-scroll">
          <button
            type="button"
            className={`mentor-topic-chip ${!filters.area ? "active" : ""}`}
            onClick={() => change("area", "")}
          >
            <span>{t("All")}</span>
            {search.data && <span className="mentor-chip-count">{search.data.meta.total}</span>}
          </button>
          {suggestedTopics.map(topic => {
            const isSelected = filters.area === topic.name;
            return (
              <button
                key={topic.name}
                type="button"
                className={`mentor-topic-chip ${isSelected ? "active" : ""} ${topic.isProjectTopic ? "highlight" : ""}`}
                onClick={() => change("area", isSelected ? "" : topic.name)}
                title={topic.isProjectTopic ? t("Team's research topic") : undefined}
              >
                {topic.isProjectTopic ? (
                  <Target size={12} className="shrink-0 text-amber-500" aria-hidden="true" />
                ) : (
                  <Tag size={11} className="shrink-0 opacity-60" aria-hidden="true" />
                )}
                <span>{topic.name}</span>
                {topic.count > 0 && <span className="mentor-chip-count">{topic.count}</span>}
                {isSelected && <X size={12} className="shrink-0 ml-1 opacity-75" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        {filters.area && (
          <button
            type="button"
            className="mentor-hub-clear-area-btn"
            onClick={() => change("area", "")}
          >
            {t("View all areas")}
          </button>
        )}
      </div>

      <div id={`mentor-filters-${project.id}`} hidden={!showFilters} className="mentor-search-filters">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(["area", "interest", "institution", "position"] as const).map(field => (
            <label key={field} className="space-y-1.5 text-sm">
              <span>{t({ institution: "Institution", area: "Research Area", interest: "Research Interest", position: "Current Position" }[field])}</span>
              <Input
                value={filters[field] ?? ""}
                list={field === "area" ? `mentor-area-options-${project.id}` : undefined}
                maxLength={field === "institution" ? 200 : 120}
                onChange={e => change(field, e.target.value)}
              />
            </label>
          ))}
        </div>
        <datalist id={`mentor-area-options-${project.id}`}>
          {taxonomy.data?.researchAreas.map(area => <option key={area} value={area} />)}
        </datalist>
      </div>
    </div>

    {filtered && (
      <div className="mentor-active-filters">
        {(["area", "interest", "institution", "position"] as const).filter(field => filters[field]).map(field => (
          <button key={field} type="button" onClick={() => change(field, "")} aria-label={`${t("Remove filter")}: ${filters[field]}`}>
            {filters[field]}
            <X size={13} aria-hidden="true" />
          </button>
        ))}
        <Button size="sm" variant="ghost" onClick={clear}>{t("Clear filters")}</Button>
      </div>
    )}

    <div className="mentor-results-heading" ref={resultsHeading}>
      <div className="flex items-center gap-2">
        <GraduationCap className="h-5 w-5 text-primary" aria-hidden="true" />
        <h3>{t(filtered ? "Search results" : "Lecturers for your project")}{search.data && <span> ({search.data.meta.total})</span>}</h3>
      </div>
      <p>{t("Relevant expertise first")}</p>
    </div>

    {disabled && <p role="status" className="mentor-ranking-note">{t("The project has reached its mentor or pending request limit.")}</p>}
    {editingPreferences && <p role="status" className="mentor-ranking-note">{t("Save or cancel your preference changes before choosing a lecturer.")}</p>}
    {!canInvite && <p className="mentor-ranking-note">{t("Members can suggest lecturers. The project owner sends invitations.")}</p>}

    <div className="mentor-results" aria-busy={search.isFetching}>
      {search.isLoading && <div role="status" aria-label={t("Loading…")}>{[1, 2, 3].map(key => <div key={key} className="flex gap-4 py-5"><Skeleton className="h-14 w-14 shrink-0 rounded-full" /><div className="flex-1 space-y-3"><Skeleton className="h-5 w-1/3" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /></div></div>)}</div>}
      {search.isError && <div role="alert" className="mentor-search-empty"><p>{t(mentorshipError(search.error))}</p><Button variant="outline" size="sm" onClick={() => void search.refetch()}>{t("Try again")}</Button></div>}
      {search.data?.items.map(mentor => {
        const cleanName = mentor.fullName?.replace(/\([^)]*\)/g, "").replace(/\b(TS|ThS|GS|PGS|Dr|Prof)\b\.?/gi, "").trim() || mentor.fullName || "";
        const nameParts = cleanName.split(/\s+/).filter(Boolean);
        const p1 = nameParts[nameParts.length - 2] ?? "";
        const p2 = nameParts[nameParts.length - 1] ?? "";
        const initials = nameParts.length >= 2
          ? `${p1[0] ?? ""}${p2[0] ?? ""}`.toUpperCase() || "?"
          : nameParts[0]?.slice(0, 2).toUpperCase() || "?";
        const hasTopicMatch = mentor.matchedTerms.length > 0;
        const colorThemes = ["avatar-theme-indigo", "avatar-theme-emerald", "avatar-theme-amber", "avatar-theme-sky", "avatar-theme-rose", "avatar-theme-purple"];
        const themeIndex = Math.abs((mentor._id || mentor.fullName || "").split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)) % colorThemes.length;
        const avatarThemeClass = colorThemes[themeIndex];
        const nonMatchedExpertise = mentor.expertiseAreas.filter(
          area => !mentor.matchedTerms.some(m => m.toLowerCase() === area.toLowerCase())
        );
        return (
          <article key={mentor._id} className={`mentor-result ${hasTopicMatch ? "has-topic-match" : ""}`}>
            <div className={`mentor-avatar ${avatarThemeClass}`} aria-hidden="true">{mentor.avatarUrl ? <img src={mentor.avatarUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : initials}</div>
            <div className="mentor-result-body">
              <div className="mentor-result-header">
                <div className="mentor-result-name">
                  <Link target="_blank" rel="noopener noreferrer" to={`/academics/${encodeURIComponent(mentor._id)}`}>{mentor.fullName}</Link>
                  <BadgeCheck size={18} className="text-blue-600 dark:text-blue-400 shrink-0" aria-label={t("Verified Lecturer")} />
                </div>
              </div>

              {(mentor.positionTitle || mentor.institutionName) && (
                <p className="mentor-academic-meta">
                  <Building2 size={13.5} className="text-muted-foreground shrink-0" aria-hidden="true" />
                  <span>
                    {mentor.positionTitle ? `${mentor.positionTitle} · ` : ""}
                    {mentor.institutionName}
                  </span>
                </p>
              )}

              {hasTopicMatch ? (
                <div className="mentor-expertise-clean">
                  <div className="mentor-field-group">
                    <span className="mentor-field-label">
                      <Sparkles size={12} className="text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                      {t("Matches team topic:")}
                    </span>
                    <div className="mentor-chips-wrap">
                      {mentor.matchedTerms.map(term => (
                        <span key={term} className="mentor-tag-matched">
                          <Check size={11} className="mr-1 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                          {term}
                        </span>
                      ))}
                    </div>
                  </div>

                  {nonMatchedExpertise.length > 0 && (
                    <div className="mentor-field-group">
                      <span className="mentor-field-label-sub">{t("Other expertise")}:</span>
                      <div className="mentor-chips-wrap">
                        {nonMatchedExpertise.slice(0, 4).map(term => (
                          <span key={term} className="mentor-tag-neutral">{term}</span>
                        ))}
                        {nonMatchedExpertise.length > 4 && (
                          <span className="mentor-tag-more" title={nonMatchedExpertise.slice(4).join(" · ")}>
                            +{nonMatchedExpertise.length - 4}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mentor-expertise-clean">
                  <div className="mentor-field-group">
                    <span className="mentor-field-label-sub">{t("Areas of expertise")}:</span>
                    <div className="mentor-chips-wrap">
                      {mentor.expertiseAreas.slice(0, 5).map(term => (
                        <span key={term} className="mentor-tag-neutral">{term}</span>
                      ))}
                      {mentor.expertiseAreas.length > 5 && (
                        <span className="mentor-tag-more" title={mentor.expertiseAreas.slice(5).join(" · ")}>
                          +{mentor.expertiseAreas.length - 5}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {mentor.sameInstitution && <p className="mentor-match"><Building2 size={13} aria-hidden="true" />{t("Same institution as your project owner")}</p>}
              {mentor.researchInterests.some(term => !mentor.expertiseAreas.some(area => area.toLocaleLowerCase() === term.toLocaleLowerCase())) && (
                <p className="mentor-interests"><span className="font-medium text-foreground/80">{t("Research Interest")}:</span> {mentor.researchInterests.filter(term => !mentor.expertiseAreas.some(area => area.toLocaleLowerCase() === term.toLocaleLowerCase())).join(" · ")}</p>
              )}
            </div>
            <div className="mentor-result-actions">
              <div className="mentor-action-top-row">
                <span className="mentor-available">
                  <span className="mentor-avail-dot" aria-hidden="true" />
                  {t("Accepting new teams")}
                </span>
                <Button size="sm" disabled={disabled || editingPreferences || search.isFetching} onClick={() => setSelected(mentor)}>{t(canInvite ? "Invite as Mentor" : "Suggest Mentor")}</Button>
              </div>
              <Link target="_blank" rel="noopener noreferrer" to={`/academics/${encodeURIComponent(mentor._id)}`}>{t("View profile")}<ArrowUpRight size={13} className="inline ml-1" aria-hidden="true" /></Link>
            </div>
          </article>
        );
      })}
      {search.data && !search.isError && !correctingPage && !search.data.items.length && <div className="mentor-search-empty"><Search size={26} aria-hidden="true" /><h4>{t(filtered ? "No available Mentors match these filters." : "No lecturers are available right now.")}</h4><p>{t(filtered ? "Try a broader search or remove a filter." : "Lecturers appear here when they are verified and accepting new teams.")}</p>{filtered && <Button variant="outline" size="sm" onClick={clear}>{t("Clear filters")}</Button>}</div>}
    </div>{search.data && !search.isError && !correctingPage && <MentorSearchPagination meta={search.data.meta} busy={search.isFetching} onPage={showPage} onPageSize={size => { setPageSize(size); showPage(1); }} />}
    {selected && <ConsentComposer project={project} mentor={selected} suggestion={!canInvite} onClose={() => setSelected(undefined)} />}
    <Dialog open={editingPreferences} onOpenChange={async open => { if (open || await canLeaveWorkspace()) setEditingPreferences(open); }}><DialogContent className="mentor-preferences-dialog max-h-[88dvh] overflow-y-auto sm:max-w-2xl" data-no-i18n><DialogHeader className="pr-6 text-left"><DialogTitle>{t("Mentor preferences")}</DialogTitle><DialogDescription>{t("Saved fields and expertise are used to rank lecturers. Describe the support you need in your invitation.")}</DialogDescription></DialogHeader>{editingPreferences && <MentorDiscoverySettings projectId={project.id} startEditing onDone={() => setEditingPreferences(false)} />}</DialogContent></Dialog>
  </section>;
}
export function MentorProjectPanel({ projectId }: { projectId: string }) {
  const userId = useAuthStore(s => s.user?.id), { t } = useI18n();
  const [tab, setTab] = useState<"find" | "requests">("find"), [requestPage, setRequestPage] = useState(1);
  const workspace = useQuery({ queryKey: ["academic-support", userId, "workspace", projectId], queryFn: () => academicSupportApi.workspace(projectId) });
  const list = useQuery({ queryKey: ["academic-support", userId, "project", projectId, requestPage], queryFn: () => academicSupportApi.list(projectId, { page: requestPage }) });
  useEffect(() => { setTab("find"); setRequestPage(1); }, [projectId]);
  if (workspace.isLoading) return <div className="mentor-workspace space-y-5" role="status" aria-label={t("Loading academic support…")}><Skeleton className="h-8 w-48" /><Skeleton className="h-20 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-44 w-full" /></div>;
  if (!workspace.data) return <div role="alert" className="mentor-workspace space-y-3 text-sm text-muted-foreground"><p>{t("Academic Support is available to the project team and active verified mentors.")}</p><Button variant="outline" size="sm" onClick={() => void workspace.refetch()}>{t("Try again")}</Button></div>;
  const data = workspace.data, canFind = data.accessRole === "TEAM" && data.canProvideFeedback;
  const activeTab = canFind ? tab : "requests";
  const unavailable = !list.data || list.isError || (list.data.positions ? !Object.values(list.data.positions).some(p => ["VACANT", "INVITING"].includes(p.status) && p.pendingRequests < (list.data!.policy.maxPendingPerRole ?? 3)) : list.data.counts.active >= list.data.policy.maxActiveMentors || list.data.counts.pending >= list.data.policy.maxPendingRequests);
  const changeTab = async (next: "find" | "requests", focus = false) => {
    if (next !== activeTab && !await canLeaveWorkspace()) return;
    setTab(next);
    if (focus) document.getElementById(`mentor-${next}-tab-${projectId}`)?.focus();
  };
  return <section className="mentor-workspace" data-no-i18n>
    {workspace.isError && <div role="alert"><p>{t("Academic Support is available to the project team and active verified mentors.")}</p><Button variant="outline" size="sm" onClick={() => void workspace.refetch()}>{t("Try again")}</Button></div>}
    <header className="mentor-page-heading">
      <p className="mentor-project-name">{data.project.title}</p>
      <h2>{t(canFind ? "Find Mentors" : "Invitations & mentors")}</h2>
      {data.accessRole === "MENTOR" && <Link className="mt-3 inline-flex text-sm text-primary underline underline-offset-4" to={`/projects/${encodeURIComponent(projectId)}/plan-review`}>{t("Open shared plan and questions")}</Link>}
    </header>
    {canFind && <div role="tablist" aria-label={t("Project mentorship")} className="mentor-workspace-tabs" onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      void changeTab(event.key === "Home" ? "find" : event.key === "End" ? "requests" : activeTab === "find" ? "requests" : "find", true);
    }}>
      <button type="button" role="tab" id={`mentor-find-tab-${projectId}`} aria-selected={activeTab === "find"} aria-controls={`mentor-find-panel-${projectId}`} tabIndex={activeTab === "find" ? 0 : -1} onClick={() => void changeTab("find")}><Search size={17} aria-hidden="true" />{t("Find Mentors")}</button>
      <button type="button" role="tab" id={`mentor-requests-tab-${projectId}`} aria-selected={activeTab === "requests"} aria-controls={`mentor-requests-panel-${projectId}`} tabIndex={activeTab === "requests" ? 0 : -1} onClick={() => void changeTab("requests")}><Mail size={17} aria-hidden="true" />{t("Invitations & mentors")}{Boolean(list.data?.counts.pending) && <span className="mentor-tab-count">{list.data!.counts.pending}</span>}</button>
    </div>}
    {canFind && <div role="tabpanel" id={`mentor-find-panel-${projectId}`} aria-labelledby={`mentor-find-tab-${projectId}`} hidden={activeTab !== "find"}><MentorSearch key={projectId} project={data.project} canInvite={data.canManage} disabled={unavailable} /></div>}
    <div role={canFind ? "tabpanel" : undefined} id={`mentor-requests-panel-${projectId}`} aria-labelledby={canFind ? `mentor-requests-tab-${projectId}` : undefined} hidden={activeTab !== "requests"} className="mentor-requests-panel">
      {list.isLoading && <Skeleton className="h-36 w-full" />}
      {list.data && <><div className="mentor-requests-heading"><h3>{t("Invitations & mentors")}</h3><p>{list.data.counts.active} {t("active mentors")} · {list.data.counts.pending} {t("pending requests")}</p></div><MentoringItems items={[...list.data.relationships, ...list.data.requests]} /><Pager meta={list.data.requestMeta.totalPages >= list.data.relationshipMeta.totalPages ? list.data.requestMeta : list.data.relationshipMeta} onPage={setRequestPage} /></>}
    </div>
    {list.isError && <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 text-sm text-destructive"><p>{t("Unable to load mentorship requests.")}</p><Button size="sm" variant="outline" onClick={() => void list.refetch()}>{t("Try again")}</Button></div>}
    {data.accessRole === "TEAM" && <MentorAccessWorkspace projectId={projectId} />}
    {data.accessRole === "TEAM" && data.guidance.length > 0 && <details className="mt-6 border-t pt-5"><summary className="cursor-pointer text-sm font-medium">Lịch sử hướng dẫn trước đây</summary><div className="mt-4"><MentorGuidance projectId={projectId} data={{ ...data, canProvideFeedback: false }} /></div></details>}
  </section>;
}
