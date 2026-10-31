import { useEffect, useState, useMemo, useRef } from "react";
import { Link, Navigate, useSearchParams, useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { AcademicPageMeta, AvailableMentor, MentorshipPerson, MentorRole, MentorPlanCandidate } from "@trend/shared-types";
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
import { MentorPreviewContent, MentorInvitationSender, MentorInvitationAccessNotice } from "@/features/projects/components/mentor-preview";
import { MentorGuidance } from "@/features/projects/components/mentor-guidance";
import { MentorAccessWorkspace, MentorPolicyFields, MentorPolicySummary, defaultMentorPolicy } from "@/features/projects/components/mentor-access-workspace";
import { MentorRecruitmentPlan, AddMentorCandidate, useMentorPlan } from "@/features/projects/components/mentor-recruitment-plan";
import { MentorSearchPagination } from "@/features/projects/components/mentor-search-pagination";
import { projectsApi } from "@/features/projects/api/projects.api";
import { useAuthStore } from "@/stores/auth-store";
import { ArrowUpRight, BadgeCheck, Building2, ChevronDown, Globe, GraduationCap, History, Inbox, Lock, Mail, Search, Send, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Tag, Target, Users, X } from "lucide-react";
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
function MentoringItems({ items, onOpen, onOpenAccess }: { items: MentorshipItem[]; onOpen?: (id: string) => void; onOpenAccess?: () => void }) {
  const { t } = useI18n();
  const current = items.filter(i => i.kind === "RELATIONSHIP" ? i.status === "ACTIVE" : i.status === "PENDING");
  const history = items.filter(i => i.kind === "RELATIONSHIP" ? i.status !== "ACTIVE" : i.status !== "PENDING");
  if (!current.length) return <MentorshipList items={history} onOpen={onOpen} onOpenAccess={onOpenAccess} />;
  return <div className="space-y-3"><MentorshipList items={current} onOpen={onOpen} onOpenAccess={onOpenAccess} />{history.length > 0 && <details><summary className="cursor-pointer text-xs text-muted-foreground">{t("Mentoring history")} ({history.length})</summary><div className="mt-3"><MentorshipList items={history} onOpen={onOpen} onOpenAccess={onOpenAccess} /></div></details>}</div>;
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
  const invitationProjectId = params.get("invitationProjectId"), requestId = params.get("requestId");
  const linkedInvitation = useQuery({ queryKey: ["academic-support", userId, "invitation-detail", invitationProjectId, requestId],
    queryFn: () => academicSupportApi.requestDetail(invitationProjectId!, requestId!), enabled: Boolean(userId && invitationProjectId && requestId), retry: false, staleTime: 0 });
  const requestedView = params.get("view");
  const view = requestedView === "discover" && lecturer ? "discover" : (["incoming", "outgoing", "active", "history"] as const).find(tab => tab === requestedView) ?? "incoming";
  const requestView = view === "discover" ? "incoming" : view;
  const changeView = (next: string) => { setPage(1); setParams(current => { const updated = new URLSearchParams(current); updated.set("view", next); updated.delete("projectId"); updated.delete("invitationProjectId"); updated.delete("requestId"); return updated; }); };
  const mine = useQuery({ queryKey: ["academic-support", userId, "mine", requestView, page], queryFn: () => academicSupportApi.mine({ page, view: requestView }), enabled: Boolean(userId) });
  const listedItems = [...(mine.data?.relationships ?? []), ...(mine.data?.requests ?? []).filter(item => item.id !== linkedInvitation.data?.id)];
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
    {invitationProjectId && requestId && <section className="space-y-3" aria-label={t("Research mentorship invitation")}>
      <h2 className="text-base font-semibold">{t("Research mentorship invitation")}</h2>
      {linkedInvitation.isLoading ? <p role="status">{t("Loading…")}</p> : linkedInvitation.isError ? <div role="alert" className="space-y-2"><p>{t(mentorshipError(linkedInvitation.error))}</p><Button variant="outline" size="sm" onClick={() => void linkedInvitation.refetch()}>{t("Try again")}</Button></div> : linkedInvitation.data && <MentorshipList items={[linkedInvitation.data]} onOpen={openProject} />}
    </section>}
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
        {mine.data && !mine.data.requests.length && !mine.data.relationships.length && !linkedInvitation.data ? <p className="rounded-lg border border-dashed p-6 text-sm leading-6 text-muted-foreground">{t(view === "incoming" ? "No incoming mentorship invitations. Teams can invite you from your profile when you are accepting new teams." : view === "outgoing" ? "No outgoing mentorship requests yet." : view === "active" ? "No active mentorships yet. Accepted invitations and offers will appear here." : "No mentorship history yet.")}</p> : listedItems.length > 0 && <MentoringItems items={listedItems} onOpen={openProject} />}
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
export function ConsentComposer({ project, mentor, suggestion = false, onClose, planned }: { project: MentorPreview; mentor?: MentorshipPerson; suggestion?: boolean; onClose: () => void; planned?: { candidate: MentorPlanCandidate; version: number } }) {
  const { t } = useI18n(), refresh = useSupportRefresh(), [key, setKey] = useState(() => crypto.randomUUID());
  const userId = useAuthStore(s => s.user?.id);
  const invitation = Boolean(mentor && !suggestion), direction = mentor ? "PROJECT_TO_LECTURER" : "LECTURER_TO_PROJECT";
  const positions = useQuery({ queryKey: ["academic-support", userId, "composer-positions", project.id], queryFn: () => academicSupportApi.list(project.id), enabled: invitation });
  const recruitment = useMentorPlan(project.id, invitation);
  const allowedRoles: MentorRole[] = planned ? [planned.candidate.mentorRole] : positions.data?.positions ? (["PRIMARY", "SECONDARY"] as const).filter(role => positions.data!.positions![role].status === "VACANT" && !recruitment.data?.closedRoles.includes(role) && (role === "PRIMARY" || recruitment.data?.parallelInvitations || positions.data!.positions!.PRIMARY.status === "ASSIGNED")) : project.availableRoles ?? ["PRIMARY"];
  const content = useInvitationContent(project.id, direction, !suggestion, allowedRoles, mentor?._id);
  const [editingBrief, setEditingBrief] = useState(false), [closing, setClosing] = useState(false);
  const [accessPolicy, setAccessPolicy] = useState(defaultMentorPolicy);
  useUnsavedWorkspace(invitation && JSON.stringify(accessPolicy) !== JSON.stringify(defaultMentorPolicy()));
  const settings = useQuery({ queryKey: ["academic-support", userId, "discovery-settings", project.id], queryFn: () => academicSupportApi.settings(project.id), enabled: invitation });
  const sendLock = useRef(false);
  const send = useMutation({ mutationFn: async () => {
    if (useAuthStore.getState().user?.id !== userId) throw new Error("Your account changed. Reopen the invitation before continuing.");
    if (!suggestion) await content.persist();
    if (useAuthStore.getState().user?.id !== userId) throw new Error("Your account changed. Reopen the invitation before continuing.");
    const payload = { ...(planned ? { candidateId: planned.candidate.id, expectedPlanVersion: planned.version } : {}), mentorRole: content.mentorRole, attachmentIds: content.attachments.map(a => a.id), ...(invitation ? { access: accessPolicy, ...(settings.data?.previewToken ? { expectedPreviewToken: settings.data.previewToken } : {}) } : {}) };
    return mentor ? suggestion ? academicSupportApi.suggest(project.id, mentor._id, content.message) : academicSupportApi.request(project.id, mentor._id, content.message, key, payload) : academicSupportApi.offer(project.id, content.message, key, payload);
  }, onSuccess: () => { if (useAuthStore.getState().user?.id !== userId) return; toast.success(t(!mentor ? "Mentorship offer sent. Track the team's response in Sent mentorship offers." : suggestion ? "Mentor suggestion sent to the project owner." : "Invitation sent. Track the response in Invitations & mentors.")); refresh(); onClose(); }, onError: refresh });
  const submit = () => { if (sendLock.current) return; sendLock.current = true; void send.mutateAsync().catch(() => {}).finally(() => { sendLock.current = false; }); };
  const close = async () => {
    if (send.isPending || closing || content.uploading || !await canLeaveWorkspace()) return;
    setClosing(true);
    try { await content.persist(); onClose(); } catch { setClosing(false); /* Keep unsaved input visible for recovery. */ }
  };
  const change = (value: Parameters<typeof content.change>[0]) => { if (send.isError) { setKey(crypto.randomUUID()); send.reset(); } content.change(value); };
  return <Dialog open onOpenChange={open => { if (!open) void close(); }}><DialogContent className="mentor-invitation-dialog max-h-[88dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader className="pr-6 text-left">
    <DialogTitle className="break-words leading-snug">{t(suggestion ? "Suggest Mentor" : mentor ? "Invite as Mentor" : "Offer Mentorship")}{mentor && ` · ${mentor.fullName}`}</DialogTitle>
    <DialogDescription>{t(suggestion ? "Only the project owner can send the official invitation." : "Both parties must agree before mentor access is granted. Your draft is saved privately for reuse.")}</DialogDescription></DialogHeader>
    {mentor && (
      <div className="mentor-composer-recipient">
        <div className="mentor-composer-recipient-avatar" aria-hidden="true">
          {mentor.avatarUrl ? (
            <img src={mentor.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            mentor.fullName?.slice(0, 2).toUpperCase() || "?"
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm text-foreground">{mentor.fullName}</span>
            {Boolean(mentor.verifiedLecturer && !mentor.fullName?.includes("Demo")) && (
              <BadgeCheck size={16} className="text-blue-600 dark:text-blue-400 shrink-0" aria-label={t("Verified Lecturer")} />
            )}
          </div>
          {(mentor.positionTitle || mentor.institutionName) && (
            <p className="text-xs text-muted-foreground truncate">
              {[mentor.positionTitle, mentor.institutionName].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </div>
    )}
    {!suggestion && <label className="space-y-1.5 text-sm"><span className="font-medium">{t("Mentor role")}</span><select aria-label={t("Mentor role")} className="h-10 w-full rounded-md border bg-background px-3" value={content.mentorRole} disabled={send.isPending || closing || !content.ready || positions.isFetching} onChange={e => change({ mentorRole: e.target.value as MentorRole })}>
      <option value="PRIMARY" disabled={!allowedRoles.includes("PRIMARY")}>{t("Primary mentor")}</option><option value="SECONDARY" disabled={!allowedRoles.includes("SECONDARY")}>{t("Secondary mentor")}</option>
    </select><p className="text-xs leading-5 text-muted-foreground">Mỗi vai trò có tối đa 1 lời mời chờ phản hồi, có hiệu lực 14 ngày. Vai trò của lời mời không tự thay đổi.</p></label>}
    {!suggestion && !allowedRoles.length && (!invitation || positions.isSuccess) && <p role="status" className="text-sm leading-6 text-muted-foreground">{t("No mentoring position is available. Review current mentors and pending invitations before sending another request.")}</p>}
    {invitation && settings.isLoading ? <Skeleton className="h-24 w-full" /> : invitation && settings.isError ? <div role="alert" className="space-y-2 text-sm"><p>{t("Could not load the invitation preview.")}</p><Button size="sm" variant="outline" onClick={() => void settings.refetch()}>{t("Try again")}</Button></div> : editingBrief ? <MentorDiscoverySettings projectId={project.id} startEditing onDone={() => setEditingBrief(false)} /> : <>
      <details open={invitation || undefined} className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">{t("Project information shared with the lecturer")} · {project.title}</summary><div className="mt-3 space-y-3"><MentorPreviewContent preview={invitation && settings.data ? settings.data : project} />
        {invitation && ((settings.data?.summary.trim().length ?? 0) < 30 || (settings.data?.summary.trim().split(/\s+/).length ?? 0) < 5) && <p role="status" className="text-sm leading-6 text-muted-foreground">Bổ sung tóm tắt nghiên cứu được phép chia sẻ, ít nhất 30 ký tự và 5 từ, để giảng viên hiểu đề tài trước khi quyết định.</p>}
        {invitation && settings.data?.invitationSender && <MentorInvitationSender sender={settings.data.invitationSender} />}
        {invitation && <Button size="sm" type="button" variant="outline" disabled={send.isPending || closing} onClick={() => setEditingBrief(true)}>{t("Edit project information")}</Button>}
        {invitation && <MentorInvitationAccessNotice />}
      </div></details>
    </>}
    {!content.ready && !suggestion ? <Skeleton className="h-28 w-full" /> : <label className="space-y-2 text-sm"><span className="font-medium">{t("Message")}{suggestion ? " *" : ""}</span><textarea aria-label={t("Message")} autoFocus={!invitation} className="min-h-32 w-full rounded-md border bg-background p-3 text-sm leading-6" value={content.message} disabled={send.isPending || closing} maxLength={1000} onChange={e => change({ message: e.target.value })} placeholder={t("Explain the guidance you are seeking or offering.")} /><span className="block text-right text-xs text-muted-foreground">{content.message.length}/1000</span></label>}
    {!suggestion && <>
      {invitation && <div className="space-y-1"><p className="text-xs text-muted-foreground">Bắt đầu lời nhắn và tệp riêng cho giảng viên này. Chỉ dùng lại bản nháp khi bạn chủ động chọn.</p><Button type="button" size="sm" variant="outline" disabled={!content.ready || send.isPending || content.uploading} onClick={async () => { if (await canLeaveWorkspace()) await content.reload(); }}>Dùng lại lời nhắn và tệp của bản nháp đã lưu</Button></div>}
      {invitation && <details><summary className="cursor-pointer text-sm font-medium">Quyền và nội dung chia sẻ sau khi chấp nhận</summary><MentorPolicyFields projectId={project.id} value={accessPolicy} onChange={value => { setAccessPolicy(value); if (send.isError) { setKey(crypto.randomUUID()); send.reset(); } }} disabled={send.isPending || closing} /></details>}
      <InvitationAttachments attachments={content.attachments} onRemove={send.isPending || closing || content.uploading ? undefined : id => change({ attachments: content.attachments.filter(a => a.id !== id) })} />
      <InvitationUpload disabled={!content.ready || send.isPending || closing || content.attachments.length >= 5} uploading={content.uploading} onUpload={files => { if (send.isError) { setKey(crypto.randomUUID()); send.reset(); } void content.upload(files); }} />
      <p className="text-xs leading-5 text-muted-foreground">{t("Only files you attach here are shared with this invitation. Your project library stays private.")}</p>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"><p role="status" className="text-xs text-muted-foreground">{t(content.status === "saving" ? "Saving invitation draft…" : content.status === "saved" && !content.dirty ? "Draft saved privately · reusable for another mentor" : "Unsaved invitation changes")}</p><Button type="button" size="sm" variant="ghost" disabled={!content.ready || send.isPending || closing || content.uploading || content.status === "saving"} onClick={() => void content.persist().catch(() => {})}>{t("Save for reuse")}</Button></div>
    </>}
    {(content.error || send.error || positions.isError) && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{t(content.error || mentorshipError(send.error ?? positions.error))}</p>{content.canReload && <Button type="button" size="sm" variant="outline" disabled={content.status === "saving" || content.uploading || send.isPending || closing} onClick={() => void content.reload()}>{t("Reload saved draft")}</Button>}</div>}
    <div className="flex justify-end gap-2 border-t pt-4"><Button variant="ghost" disabled={send.isPending || closing || content.uploading} onClick={() => void close()}>{t("Cancel")}</Button><Button disabled={send.isPending || closing || content.uploading || !content.ready || !content.message.trim() && (!content.attachments.length || suggestion) || !suggestion && !allowedRoles.includes(content.mentorRole) || invitation && ((settings.data?.summary.trim().length ?? 0) < 30 || (settings.data?.summary.trim().split(/\s+/).length ?? 0) < 5 || settings.isFetching || settings.isError || positions.isLoading || positions.isError || editingBrief)} onClick={submit}>{t(send.isPending ? "Sending…" : suggestion ? "Send suggestion" : mentor ? "Send Invitation" : "Send offer")}</Button></div>
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
export function MentorshipList({ items, onOpen, onOpenAccess }: { items: MentorshipItem[]; onOpen?: (id: string) => void; onOpenAccess?: () => void }) {
  const { t } = useI18n(), refresh = useSupportRefresh();
  const userId = useAuthStore(s => s.user?.id);
  const [action, setAction] = useState<{ item: MentorshipItem; kind: "accept" | "decline" | "cancel" | "end"; open: boolean }>(), [note, setNote] = useState(""), [preview, setPreview] = useState<MentorshipItem>();
  const responseLock = useRef(false);
  const acceptRequest = action?.kind === "accept" && action.item.kind === "REQUEST" ? action.item : undefined;
  const details = useQuery({ queryKey: ["academic-support", userId, "invitation-detail", acceptRequest?.projectId, acceptRequest?.id],
    queryFn: () => academicSupportApi.requestDetail(acceptRequest!.projectId, acceptRequest!.id), enabled: Boolean(action?.open && acceptRequest), retry: false, staleTime: 0, refetchOnWindowFocus: false });
  const reviewedItem = acceptRequest && details.data ? details.data : action?.item;
  const canConfirm = Boolean(action?.open && (!acceptRequest || details.isSuccess && !details.isFetching && details.data.actions.accept));
  const briefChanged = Boolean(acceptRequest && details.data && (details.data.previewToken !== acceptRequest.previewToken || details.data.accessPolicy?.version !== acceptRequest.accessPolicy?.version));
  const closeAction = () => setAction(current => current && { ...current, open: false });
  const response = useMutation({ mutationFn: async (submission: { item: MentorshipItem; kind: "accept" | "decline" | "cancel" | "end"; note: string }) => {
    if (useAuthStore.getState().user?.id !== userId) throw new Error("Your account changed. Reopen the invitation before continuing.");
    return academicSupportApi.respond(submission.item, submission.kind, submission.note);
  }, onSuccess: (_result, submission) => { if (useAuthStore.getState().user?.id !== userId) return; if (submission.kind === "accept") toast.success(t("Mentorship accepted. Open Active Mentorships to work with the team.")); closeAction(); setNote(""); refresh(); }, onError: refresh });
  const confirm = () => { if (responseLock.current || !canConfirm || !action || !reviewedItem) return; responseLock.current = true;
    void response.mutateAsync({ item: reviewedItem, kind: action.kind, note }).catch(() => {}).finally(() => { responseLock.current = false; }); };
  function choose(item: MentorshipItem, kind: "accept" | "decline" | "cancel" | "end") { response.reset(); setNote(""); setAction({ item, kind, open: true }); }
  return <>{!items.length && <p className="text-sm text-muted-foreground">{t("No mentorship requests or active mentors.")}</p>}{Boolean(items.length) && <ul className="mentorship-list divide-y rounded-lg border bg-card">{items.map(item => <li key={`${item.kind}-${item.id}`} className="space-y-2 p-4">
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
      {item.kind === "RELATIONSHIP" && item.status === "ACTIVE" && onOpenAccess && (
        <Button variant="outline" size="sm" onClick={onOpenAccess}>
          <ShieldCheck size={13} className="mr-1 text-primary" aria-hidden="true" />
          {t("Configure permissions & access")}
        </Button>
      )}
      {item.actions.end && <Button variant="ghost" size="sm" onClick={() => choose(item, "end")}>{t("End mentorship")}</Button>}
    </div></div>
    {item.kind === "REQUEST" && <>
      {item.kind === "REQUEST" && item.reviewRequired && <p role="status" className="text-sm text-muted-foreground">Lời mời cũ đang cần chủ dự án rà soát vị trí. Bạn chưa thể nhận cho đến khi bước này hoàn tất.</p>}{item.status === "PENDING" && item.direction === "PROJECT_TO_LECTURER" && item.mentorUser._id === userId && item.project && <div className="space-y-4 border-t pt-4"><MentorPreviewContent preview={item.project} /><MentorInvitationAccessNotice /></div>}
      <p className="text-xs text-muted-foreground">{t("Requested by")}: {item.requestedBy.fullName} · {[item.requestedBy.academicRole && t(item.requestedBy.academicRole), item.requestedBy.institutionName].filter(Boolean).join(" · ")}</p>{item.message && <div><p className="text-xs font-medium text-muted-foreground">{t(item.direction === "PROJECT_TO_LECTURER" ? "Guidance requested" : "Message")}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{item.message}</p></div>}{Boolean(item.attachments?.length) && <InvitationAttachments attachments={item.attachments!} />}{item.responseNote && <p className="text-xs text-muted-foreground">{item.responseNote}</p>}{item.closeReason === "MENTOR_POSITION_FILLED" && <p className="text-xs text-muted-foreground">{t("The mentor position has been filled.")}</p>}{item.status === "PENDING" && item.expiresAt && <p className="text-xs text-muted-foreground">{t("Expires")}: {new Date(item.expiresAt).toLocaleDateString()}</p>}</>}
  </li>)}</ul>}
  <Dialog open={action?.open ?? false} onOpenChange={open => { if (!open && !response.isPending) closeAction(); }}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>{t(action?.kind === "accept" ? "Accept mentorship" : action?.kind === "decline" ? "Decline mentorship" : action?.kind === "end" ? "End mentorship" : "Cancel mentorship request")}</DialogTitle><DialogDescription>{t(action?.kind === "end" ? "Mentor access will end immediately. Previous guidance remains in project history." : "Mentorship remains separate from formal academic review.")}</DialogDescription></DialogHeader>
    {action?.kind === "accept" && reviewedItem && <>
      {acceptRequest && details.isFetching && <p role="status" className="text-sm text-muted-foreground">{t("Checking the latest invitation…")}</p>}
      {acceptRequest && details.isError && <div role="alert" className="space-y-2 text-sm"><p>{t("Could not verify the current invitation. Your note is kept.")}</p><Button variant="outline" size="sm" onClick={() => void details.refetch()}>{t("Reload invitation")}</Button></div>}
      {briefChanged && <p role="status" className="text-sm leading-6">{t("The invitation has changed. Review the updated introduction and permissions before confirming.")}</p>}
      {acceptRequest && details.isSuccess && !details.data.actions.accept && <p role="alert" className="text-sm">{t("This invitation can no longer be accepted. It may have expired, been withdrawn or lost its available position.")}</p>}
      {reviewedItem.project && <MentorPreviewContent preview={reviewedItem.project} />}<p className="text-sm font-medium">{t(reviewedItem.mentorRole === "SECONDARY" ? "Secondary mentor" : "Primary mentor")}</p>{reviewedItem.kind === "REQUEST" && <>{reviewedItem.message && <div><p className="text-xs font-medium text-muted-foreground">{t(reviewedItem.direction === "PROJECT_TO_LECTURER" ? "Guidance requested" : "Message")}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{reviewedItem.message}</p></div>}<InvitationAttachments attachments={reviewedItem.attachments ?? []} /></>}<MentorInvitationAccessNotice /><MentorPolicySummary policy={reviewedItem.accessPolicy} />
    </>}
    <label className="space-y-1.5 text-sm"><span>{t("Optional note")}</span><textarea aria-label={t("Note")} className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={note} maxLength={1000} disabled={response.isPending} onChange={e => setNote(e.target.value)} /></label>{response.error && <p role="alert" className="text-sm text-destructive">{t(mentorshipError(response.error))}</p>}<Button disabled={response.isPending || !canConfirm} onClick={confirm}>{t("Confirm")}</Button>
  </DialogContent></Dialog>
  <Dialog open={Boolean(preview)} onOpenChange={open => { if (!open) setPreview(undefined); }}><DialogContent className="max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>{t(preview?.kind === "REQUEST" && preview.direction === "PROJECT_TO_LECTURER" ? "Research mentorship invitation" : "View Project Preview")}</DialogTitle><DialogDescription>{t("Only the shared preview is available before acceptance.")}</DialogDescription></DialogHeader>{preview?.kind === "REQUEST" && preview.legacyPreview && <p role="status" className="text-xs text-muted-foreground">Lời mời cũ: hệ thống chưa lưu bản chụp giới thiệu tại thời điểm gửi. Phần giới thiệu dưới đây là bản hiện tại.</p>}{preview?.project && <MentorPreviewContent preview={preview.project} />}{preview?.kind === "REQUEST" && <><p className="text-sm font-medium">{t("Invited role")}: {t(preview.mentorRole === "SECONDARY" ? "Secondary mentor" : "Primary mentor")}</p><MentorInvitationSender sender={preview.requestedBy} />{preview.message && <div><p className="text-xs font-medium text-muted-foreground">{t(preview.direction === "PROJECT_TO_LECTURER" ? "Guidance requested" : "Message")}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{preview.message}</p></div>}<InvitationAttachments attachments={preview.attachments ?? []} /><MentorInvitationAccessNotice /><MentorPolicySummary policy={preview.accessPolicy} /><div className="flex flex-wrap justify-end gap-2 border-t pt-4">{preview.actions.decline && <Button variant="outline" onClick={() => { choose(preview, "decline"); setPreview(undefined); }}>{t("Decline")}</Button>}{preview.actions.accept && <Button onClick={() => { choose(preview, "accept"); setPreview(undefined); }}>{t("Accept mentorship")}</Button>}</div></>}</DialogContent></Dialog>
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
      <div className="mentor-hub-compact-header">
        <div className="mentor-hub-compact-left">
          <span className="mentor-hub-status-inline" data-mode={preferences.discovery}>
            {preferences.discovery === "SEEKING_MENTOR" ? (
              <>
                <Globe size={12} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="font-medium">{t("Seeking Mentor")}</span>
              </>
            ) : (
              <>
                <Lock size={12} className="shrink-0 text-muted-foreground" />
                <span className="font-medium">{t("Private")}</span>
              </>
            )}
          </span>
          <span className="mentor-hub-sub-inline">
            {preferences.discovery === "SEEKING_MENTOR"
              ? t("Verified lecturers can discover your shared project preview.")
              : t("Only lecturers you invite will see this preview. Project discovery is off.")}
          </span>
          {preferences.mentoringNeeds && (
            <span className="mentor-hub-needs-inline" title={preferences.mentoringNeeds}>
              <Sparkles size={11} className="text-amber-500 shrink-0" aria-hidden="true" />
              <span className="truncate max-w-[280px]">{preferences.mentoringNeeds}</span>
            </span>
          )}
        </div>

        {canInvite && (
          <Button
            size="sm"
            variant="ghost"
            className="mentor-hub-edit-btn-compact"
            onClick={() => setEditingPreferences(true)}
          >
            <SlidersHorizontal size={12} aria-hidden="true" />
            <span>{t(terms.length ? "Edit preferences" : "Set up mentor preferences")}</span>
          </Button>
        )}
      </div>

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
        <div className="mentor-topic-chips-scroll" onWheel={e => { if (e.deltaY !== 0 && e.currentTarget.scrollWidth > e.currentTarget.clientWidth) { e.currentTarget.scrollLeft += e.deltaY; } }}>
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
                  {Boolean(mentor.verifiedLecturer && !mentor.fullName?.includes("Demo")) && (
                    <BadgeCheck size={18} className="text-blue-600 dark:text-blue-400 shrink-0" aria-label={t("Verified Lecturer")} />
                  )}
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
              <span className="mentor-available">
                <span className="mentor-avail-dot" aria-hidden="true" />
                <span>{t("Accepting new teams")}</span>
              </span>
              <Button size="sm" className="mentor-action-cta" disabled={disabled || editingPreferences || search.isFetching} onClick={() => setSelected(mentor)}>{canInvite ? "Thêm vào kế hoạch" : t("Suggest Mentor")}</Button>
              <Link target="_blank" rel="noopener noreferrer" className="mentor-profile-link" to={`/academics/${encodeURIComponent(mentor._id)}`}><span>{t("View profile")}</span><ArrowUpRight size={13} className="inline ml-1" aria-hidden="true" /></Link>
            </div>
          </article>
        );
      })}
      {search.data && !search.isError && !correctingPage && !search.data.items.length && <div className="mentor-search-empty"><Search size={26} aria-hidden="true" /><h4>{t(filtered ? "No available Mentors match these filters." : "No lecturers are available right now.")}</h4><p>{t(filtered ? "Try a broader search or remove a filter." : "Lecturers appear here when they are verified and accepting new teams.")}</p>{filtered && <Button variant="outline" size="sm" onClick={clear}>{t("Clear filters")}</Button>}</div>}
    </div>{search.data && !search.isError && !correctingPage && <MentorSearchPagination meta={search.data.meta} busy={search.isFetching} onPage={showPage} onPageSize={size => { setPageSize(size); showPage(1); }} />}
    {selected && (canInvite ? <AddMentorCandidate projectId={project.id} mentor={selected} onClose={() => setSelected(undefined)} /> : <ConsentComposer project={project} mentor={selected} suggestion onClose={() => setSelected(undefined)} />)}
    <Dialog open={editingPreferences} onOpenChange={async open => { if (open || await canLeaveWorkspace()) setEditingPreferences(open); }}><DialogContent className="mentor-preferences-dialog max-h-[88dvh] overflow-y-auto sm:max-w-2xl" data-no-i18n><DialogHeader className="pr-6 text-left"><DialogTitle>{t("Mentor preferences")}</DialogTitle><DialogDescription>{t("Saved fields and expertise are used to rank lecturers. Describe the support you need in your invitation.")}</DialogDescription></DialogHeader>{editingPreferences && <MentorDiscoverySettings projectId={project.id} startEditing onDone={() => setEditingPreferences(false)} />}</DialogContent></Dialog>
  </section>;
}
export function MentorProjectPanel({ projectId }: { projectId: string }) {
  const userId = useAuthStore(s => s.user?.id), { t } = useI18n();
  const [params] = useSearchParams();
  const initialView = params.get("view");
  const [tab, setTab] = useState<"find" | "requests" | "access">(
    initialView === "access" || initialView === "permissions" ? "access" : "find"
  );
  const [requestPage, setRequestPage] = useState(1);
  const [planned, setPlanned] = useState<{ candidate: MentorPlanCandidate; version: number }>();
  const workspace = useQuery({ queryKey: ["academic-support", userId, "workspace", projectId], queryFn: () => academicSupportApi.workspace(projectId) });
  const list = useQuery({ queryKey: ["academic-support", userId, "project", projectId, requestPage], queryFn: () => academicSupportApi.list(projectId, { page: requestPage }) });
  useEffect(() => {
    const v = params.get("view");
    if (v === "access" || v === "permissions") setTab("access");
    else setTab("find");
    setRequestPage(1);
  }, [projectId, params]);
  if (workspace.isLoading) return <div className="mentor-workspace space-y-5" role="status" aria-label={t("Loading academic support…")}><Skeleton className="h-8 w-48" /><Skeleton className="h-20 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-44 w-full" /></div>;
  if (!workspace.data) return <div role="alert" className="mentor-workspace space-y-3 text-sm text-muted-foreground"><p>{t("Academic Support is available to the project team and active verified mentors.")}</p><Button variant="outline" size="sm" onClick={() => void workspace.refetch()}>{t("Try again")}</Button></div>;
  const data = workspace.data, canFind = data.accessRole === "TEAM" && data.canProvideFeedback;
  const activeTab = canFind ? tab : tab === "access" ? "access" : "requests";
  const unavailable = !list.data || list.isError || !data.canProvideFeedback;
  const changeTab = async (next: "find" | "requests" | "access", focus = false) => {
    if (next !== activeTab && !await canLeaveWorkspace()) return;
    setTab(next);
    if (focus) document.getElementById(`mentor-${next}-tab-${projectId}`)?.focus();
  };
  return <section className="mentor-workspace" data-no-i18n>
    {workspace.isError && <div role="alert"><p>{t("Academic Support is available to the project team and active verified mentors.")}</p><Button variant="outline" size="sm" onClick={() => void workspace.refetch()}>{t("Try again")}</Button></div>}
    <header className="mentor-page-heading">
      <p className="mentor-project-name">{data.project.title}</p>
      <h2>{t(canFind ? (activeTab === "access" ? "Mentor permissions & sharing" : activeTab === "requests" ? "Invitations & mentors" : "Find Mentors") : "Invitations & mentors")}</h2>
      {data.accessRole === "MENTOR" && <Link className="mt-3 inline-flex text-sm text-primary underline underline-offset-4" to={`/projects/${encodeURIComponent(projectId)}/plan-review`}>{t("Open shared plan and questions")}</Link>}
    </header>
    {data.canManage && activeTab !== "access" && <MentorRecruitmentPlan projectId={projectId} onSend={(candidate, version) => setPlanned({ candidate, version })} />}
    {planned && <ConsentComposer project={data.project} mentor={{ _id: planned.candidate.mentorUserId, fullName: planned.candidate.fullName }} planned={planned} onClose={() => setPlanned(undefined)} />}
    {canFind && <div role="tablist" aria-label={t("Project mentorship")} className="mentor-workspace-tabs" onKeyDown={event => {
      const allTabs: Array<"find" | "requests" | "access"> = ["find", "requests", "access"];
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const curIdx = allTabs.indexOf(activeTab);
      const nextIdx = event.key === "Home" ? 0 : event.key === "End" ? allTabs.length - 1 : event.key === "ArrowLeft" ? (curIdx - 1 + allTabs.length) % allTabs.length : (curIdx + 1) % allTabs.length;
      const targetTab = allTabs[nextIdx];
      if (targetTab) void changeTab(targetTab, true);
    }}>
      <button type="button" role="tab" id={`mentor-find-tab-${projectId}`} aria-selected={activeTab === "find"} aria-controls={`mentor-find-panel-${projectId}`} tabIndex={activeTab === "find" ? 0 : -1} onClick={() => void changeTab("find")}><Search size={17} aria-hidden="true" />{t("Find Mentors")}</button>
      <button type="button" role="tab" id={`mentor-requests-tab-${projectId}`} aria-selected={activeTab === "requests"} aria-controls={`mentor-requests-panel-${projectId}`} tabIndex={activeTab === "requests" ? 0 : -1} onClick={() => void changeTab("requests")}><Mail size={17} aria-hidden="true" />{t("Invitations & mentors")}{Boolean(list.data?.counts.pending) && <span className="mentor-tab-count">{list.data!.counts.pending}</span>}</button>
      <button type="button" role="tab" id={`mentor-access-tab-${projectId}`} aria-selected={activeTab === "access"} aria-controls={`mentor-access-panel-${projectId}`} tabIndex={activeTab === "access" ? 0 : -1} onClick={() => void changeTab("access")}><ShieldCheck size={17} aria-hidden="true" />{t("Mentor permissions & sharing")}</button>
    </div>}
    {canFind && <div role="tabpanel" id={`mentor-find-panel-${projectId}`} aria-labelledby={`mentor-find-tab-${projectId}`} hidden={activeTab !== "find"}><MentorSearch key={projectId} project={data.project} canInvite={data.canManage} disabled={unavailable} /></div>}
    <div role={canFind ? "tabpanel" : undefined} id={`mentor-requests-panel-${projectId}`} aria-labelledby={canFind ? `mentor-requests-tab-${projectId}` : undefined} hidden={activeTab !== "requests"} className="mentor-requests-panel">
      {list.isLoading && <Skeleton className="h-36 w-full" />}
      {list.data && <><div className="mentor-requests-heading"><h3>{t("Invitations & mentors")}</h3><p>{list.data.counts.active} {t("active mentors")} · {list.data.counts.pending} {t("pending requests")}</p></div><MentoringItems items={[...list.data.relationships, ...list.data.requests]} onOpenAccess={() => void changeTab("access")} /><Pager meta={list.data.requestMeta.totalPages >= list.data.relationshipMeta.totalPages ? list.data.requestMeta : list.data.relationshipMeta} onPage={setRequestPage} /></>}
    </div>
    {list.isError && <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 text-sm text-destructive"><p>{t("Unable to load mentorship requests.")}</p><Button size="sm" variant="outline" onClick={() => void list.refetch()}>{t("Try again")}</Button></div>}
    {data.accessRole === "TEAM" && <div role="tabpanel" id={`mentor-access-panel-${projectId}`} aria-labelledby={`mentor-access-tab-${projectId}`} hidden={activeTab !== "access"} className="space-y-6 pt-1">
      <MentorAccessWorkspace projectId={projectId} />
      {data.guidance.length > 0 && <details className="mt-6 border-t pt-5"><summary className="cursor-pointer text-sm font-medium">Lịch sử hướng dẫn trước đây</summary><div className="mt-4"><MentorGuidance projectId={projectId} data={{ ...data, canProvideFeedback: false }} /></div></details>}
    </div>}
  </section>;
}
