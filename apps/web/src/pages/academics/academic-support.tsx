import { MentorshipInvitationViewer } from "@/features/projects/components/mentorship-invitation-viewer";
import { mentorshipViewer } from "@/features/projects/utils/mentorship-viewer";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { academicProfileApi } from "@/features/academic-profile/api/academic-profile.api";
import { SupervisorInvitationForm } from "@/features/projects/components/supervisor-invitation-form";
import { MentorRoleAssignments } from "@/features/projects/components/mentor-role-assignments";
import { mentorRoleLabelKeys } from "@trend/shared-types";
import { MentorshipApplicantPool, MentorshipApplicationDialog, MyMentorshipApplications } from "@/features/projects/components/mentorship-applicants";
import { ResearchTeamDossierSheet, formatSupportLabel } from "@/features/projects/components/research-team-dossier-sheet";
import { LecturerProposalDialog } from "@/features/projects/components/lecturer-proposal-dialog";
import { MemberProfileConsentCard } from "@/features/projects/components/member-profile-consent-card";
import { mentorshipApplicationsApi } from "@/features/projects/api/mentorship-applications.api";
import type { MentorshipApplicationView, ResearchTeamDossier } from "@trend/shared-types";
import { useEffect, useState, useMemo, useRef } from "react";
import { Link, Navigate, useSearchParams, useNavigate, useLocation } from "react-router-dom";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { canLeaveWorkspace, useUnsavedWorkspace } from "@/features/projects/components/workspace-common";
import { MentorPreviewContent, MentorInvitationSender, MentorInvitationAccessNotice } from "@/features/projects/components/mentor-preview";
import { InvitationDossierView, SUPPORT_TYPE_LABELS } from "@/features/projects/components/invitation-dossier-view";
import { InvitationDossierForm, SupportAreasChecklist, createInitialDossierState, toInvitationDossierInput, type DossierDraftState } from "@/features/projects/components/invitation-dossier-composer";
import { MentorGuidance } from "@/features/projects/components/mentor-guidance";
import { MentorAccessWorkspace, MentorPolicyFields, MentorPolicySummary, defaultMentorPolicy } from "@/features/projects/components/mentor-access-workspace";
import { MentorRecruitmentPlan } from "@/features/projects/components/mentor-recruitment-plan";
import { SuggestMentorDialog } from "@/features/projects/components/suggest-mentor-dialog";
import { OwnerMentorSuggestionsInbox, MemberMentorSuggestionsList } from "@/features/projects/components/mentor-suggestions-panel";
import { MentorSearchPagination } from "@/features/projects/components/mentor-search-pagination";
import { projectsApi } from "@/features/projects/api/projects.api";
import { useAuthStore } from "@/stores/auth-store";
import { ArrowUpRight, BadgeCheck, Building2, Calendar, CheckCircle2, ChevronDown, FileText, GraduationCap, History, Inbox, Mail, MessageSquare, MoreHorizontal, Paperclip, Search, Send, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, Target, Users, X, XCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useInvitationContent, InvitationAttachments, InvitationUpload } from "@/features/projects/components/mentorship-invitation-content";
import { MentorMatchEvidenceDialog } from "@/features/projects/components/mentor-match-evidence-dialog";
import { ResearchNeedsPanel } from "@/features/projects/components/research-needs-panel";
import "@/features/projects/mentor-discovery.css";
import "./academic-support.css";
import { legacyAcademicSupportDestination, mentorWorkspaceDestination } from "@/features/projects/utils/mentor-workspace-navigation";

function useSupportRefresh() {
  const cache = useQueryClient();
  return () => { for (const key of ["mentor-workspace", "academic-support", "notifications", "home-research", "projects"]) void cache.invalidateQueries({ queryKey: [key] }); };
}
function Pager({ meta, onPage }: { meta?: AcademicPageMeta; onPage: (page: number) => void }) {
  const { t } = useI18n();
  if (!meta || meta.totalPages < 2) return null;
  return <nav aria-label={t("Pagination")} className="flex items-center justify-end gap-3 pt-2 text-xs text-muted-foreground">
    <Button size="sm" variant="ghost" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>{t("Previous")}</Button>
    <span>{meta.page} / {meta.totalPages}</span><Button size="sm" variant="ghost" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>{t("Next")}</Button>
  </nav>;
}
function personInitials(name?: string) {
  const clean = (name ?? "").replace(/\([^)]*\)/g, "").replace(/\b(TS|ThS|GS|PGS|Dr|Prof)\b\.?/gi, "").trim() || name || "";
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[parts.length - 2]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toLocaleUpperCase("vi-VN");
  return parts[0]?.slice(0, 2).toLocaleUpperCase("vi-VN") || "GV";
}
function mentorshipStatusTone(item: MentorshipItem): "emerald" | "amber" | "slate" {
  if (item.kind === "RELATIONSHIP") return item.status === "ACTIVE" ? "emerald" : "slate";
  if (item.status === "PENDING") return "amber";
  if (item.status === "ACCEPTED") return "emerald";
  return "slate";
}
function projectMentorshipStatusLabel(item: MentorshipItem, language: string, t: (key: string) => string): string {
  const isVi = language === "vi";
  if (item.kind === "RELATIONSHIP") {
    return item.status === "ACTIVE"
      ? (isVi ? "Đang hướng dẫn" : "Active mentor")
      : (isVi ? "Đã kết thúc" : "Ended");
  }
  if (item.status === "PENDING") {
    return item.direction === "LECTURER_TO_PROJECT"
      ? (isVi ? "Chờ chủ dự án phản hồi" : "Awaiting owner response")
      : (isVi ? "Chờ giảng viên phản hồi" : "Awaiting lecturer response");
  }
  switch (item.status) {
    case "ACCEPTED":
      return isVi ? "Đã chấp thuận" : "Accepted";
    case "DECLINED":
      return isVi ? "Đã từ chối" : "Declined";
    case "CANCELED_BY_PROJECT":
    case "CANCELLED":
      return isVi ? "Đã thu hồi" : "Withdrawn";
    case "EXPIRED":
      return isVi ? "Đã hết hạn" : "Expired";
    case "CLOSED_CAPACITY_REACHED":
    case "SUPERSEDED":
      return isVi ? "Không còn khả dụng" : "No longer available";
    default:
      return t(item.status);
  }
}
function statusPillStyle(tone: "emerald" | "amber" | "slate") {
  if (tone === "emerald") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (tone === "amber") return "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300";
  return "border-border bg-muted/60 text-muted-foreground";
}
function formatAcademicRoleLabel(role: string | undefined, t: (key: string) => string): string | undefined {
  if (!role) return undefined;
  const translated = t(role);
  if (translated === translated.toLocaleUpperCase("vi-VN") && translated.length > 3) {
    return translated[0] + translated.slice(1).toLocaleLowerCase("vi-VN");
  }
  return translated;
}
function MentoringItems({ items, onOpen, onOpenAccess, onManageAccess, currentProjectId, directHistory = false }: { items: MentorshipItem[]; onOpen?: (id: string) => void; onOpenAccess?: () => void; onManageAccess?: (mentorUserId: string) => void; currentProjectId?: string; directHistory?: boolean }) {
  const { t } = useI18n();
  if (currentProjectId) {
    const active = items.filter(item => item.kind === "RELATIONSHIP" && item.status === "ACTIVE");
    const pending = items.filter(item => item.kind === "REQUEST" && item.status === "PENDING");
    const history = items.filter(item => item.kind === "RELATIONSHIP" ? item.status !== "ACTIVE" : item.status !== "PENDING");
    return <div className="space-y-4">
      <section className="space-y-2" aria-label={t("supervisor.activeSection")}>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/85">{t("supervisor.activeSection")} ({active.length})</h3>
        </div>
        {!active.length ? (
          <p className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-3.5 py-2.5 text-xs text-muted-foreground">{t("supervisor.noActive")}</p>
        ) : (
          <MentorshipList items={active} currentProjectId={currentProjectId} variant="active" onManageAccess={onManageAccess} showEmpty={false} />
        )}
      </section>

      <section className="space-y-2" aria-label={t("supervisor.pendingSection")}>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/85">{t("supervisor.pendingSection")} ({pending.length})</h3>
        </div>
        {!pending.length ? (
          <p className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-3.5 py-2.5 text-xs text-muted-foreground">{t("supervisor.noPending")}</p>
        ) : (
          <MentorshipList items={pending} currentProjectId={currentProjectId} variant="pending" showEmpty={false} />
        )}
      </section>

      {history.length > 0 && (
        <details className="group rounded-xl border border-border/80 bg-muted/15 overflow-hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2.5 text-xs font-semibold text-foreground/90 hover:bg-muted/35 transition-colors">
            <span className="inline-flex items-center gap-2">
              <History className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <span>{t("Mentoring history")}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">{history.length}</span>
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="border-t border-border/70 bg-card">
            <MentorshipList items={history} currentProjectId={currentProjectId} variant="history" showEmpty={false} />
          </div>
        </details>
      )}
    </div>;
  }
  if (directHistory) {
    return <MentorshipList items={items} onOpen={onOpen} onOpenAccess={onOpenAccess} showEmpty={false} variant="history" />;
  }
  const current = items.filter(i => i.kind === "RELATIONSHIP" ? i.status === "ACTIVE" : i.status === "PENDING");
  const history = items.filter(i => i.kind === "RELATIONSHIP" ? i.status !== "ACTIVE" : i.status !== "PENDING");
  return <div className="space-y-3"><MentorshipList items={current} onOpen={onOpen} onOpenAccess={onOpenAccess} showEmpty={false} /><details hidden={!history.length}><summary className="cursor-pointer text-xs text-muted-foreground">{t("Mentoring history")} ({history.length})</summary><div className="mt-3"><MentorshipList items={history} onOpen={onOpen} onOpenAccess={onOpenAccess} showEmpty={false} variant="history" /></div></details></div>;
}
/** Compatibility entry only; the support UI lives in the mentor shell or a team's project. */
export function AcademicSupportEntryPage() {
  const profile = useAcademicProfile();
  const [params] = useSearchParams();
  const { hash } = useLocation();
  const { t } = useI18n();
  if (profile.isLoading) return <main className="mx-auto max-w-5xl p-6" role="status">{t("Loading…")}</main>;
  if (profile.isError || !profile.data) return <main className="mx-auto max-w-5xl space-y-3 p-6"><p role="alert">{t("Unable to load your profile.")}</p><Button variant="outline" onClick={() => void profile.refetch()}>{t("Try again")}</Button></main>;
  return <Navigate to={legacyAcademicSupportDestination(params, profile.data.academicRole === "LECTURER", hash)} replace />;
}

export function AcademicSupportPage({ embedded = false }: { embedded?: boolean }) {
  const Container = embedded ? "section" : "main";
  const { t, language } = useI18n(), navigate = useNavigate(), profile = useAcademicProfile(), pref = useMentoringPreferences();
  const lecturer = profile.data?.academicRole === "LECTURER";
  const userId = useAuthStore(s => s.user?.id);
  const [area, setArea] = useState("");
  const [showArea, setShowArea] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(() => typeof window !== "undefined" && window.location.hash === "#mentoring-settings");
  const [offerProject, setOfferProject] = useState<MentorPreview>();
  const [proposalState, setProposalState] = useState<{ project: MentorPreview; dossier?: ResearchTeamDossier }>();
  const [dossierProjectId, setDossierProjectId] = useState<string>();
  const [existingRequestViewer, setExistingRequestViewer] = useState<{ projectId: string; requestId: string }>();
  const deferredArea = useDebouncedValue(area, 300);
  const [search, setSearch] = useState(""), q = useDebouncedValue(search, 300), [page, setPage] = useState(1), [opportunityPage, setOpportunityPage] = useState(1);
  const [params, setParams] = useSearchParams(), projectId = params.get("projectId");
  const invitationProjectId = params.get("invitationProjectId"), requestId = params.get("requestId");
  const linkedInvitation = useQuery({
    queryKey: ["academic-support", userId, "invitation-detail", invitationProjectId, requestId],
    queryFn: () => academicSupportApi.requestDetail(invitationProjectId!, requestId!), enabled: Boolean(userId && invitationProjectId && requestId), retry: false, staleTime: 0
  });
  const requestedView = params.get("view");
  const view = requestedView === "discover" && lecturer ? "discover" : (["incoming", "outgoing", "active", "history"] as const).find(tab => tab === requestedView) ?? "incoming";
  const requestView = view === "discover" ? "incoming" : view;
  const changeView = (next: string) => { setPage(1); setParams(current => { const updated = new URLSearchParams(current); updated.set("view", next); updated.delete("projectId"); updated.delete("invitationProjectId"); updated.delete("requestId"); return updated; }); };
  const queryClient = useQueryClient();
  const mine = useQuery({
    queryKey: ["academic-support", userId, "mine", requestView, page],
    queryFn: () => academicSupportApi.mine({ page, view: requestView }),
    enabled: Boolean(userId),
    staleTime: 30_000,
    placeholderData: page > 1 ? keepPreviousData : undefined,
  });
  // Keep same-actor tab counts visually stable across incoming/outgoing/history transitions;
  // strictly clear when userId changes or authorization/fetch fails.
  const stableCountsRef = useRef<{ userId?: string; counts?: { incoming: number; active: number } }>({});
  if (mine.isError || stableCountsRef.current.userId !== userId) {
    stableCountsRef.current = { userId };
  }
  if (mine.data?.counts) {
    stableCountsRef.current = { userId, counts: mine.data.counts };
  }
  const navCounts = mine.data?.counts ?? stableCountsRef.current.counts;
  const prefetchSupportTab = (tab: "incoming" | "outgoing" | "active" | "history") => {
    if (!userId) return;
    void queryClient.prefetchQuery({
      queryKey: ["academic-support", userId, "mine", tab, 1],
      queryFn: () => academicSupportApi.mine({ page: 1, view: tab }),
      staleTime: 30_000,
    });
  };
  const listedItems = [...(mine.data?.relationships ?? []), ...(mine.data?.requests ?? []).filter(item => item.id !== linkedInvitation.data?.id)];
  const opportunities = useQuery({
    queryKey: ["academic-support", userId, "opportunities", q, deferredArea, opportunityPage],
    queryFn: () => academicSupportApi.opportunities({ q, area: deferredArea || undefined, page: opportunityPage }),
    enabled: lecturer && view === "discover" && pref.data?.acceptingMentorships === true,
    placeholderData: opportunityPage > 1 ? keepPreviousData : undefined,
  });
  const sentOffers = useQuery({
    queryKey: ["academic-support", userId, "my-applications", 1],
    queryFn: () => mentorshipApplicationsApi.mine(1),
    enabled: Boolean(userId && lecturer && view === "discover"),
    staleTime: 30_000,
    retry: false,
  });
  const pendingOfferProjectIds = useMemo(
    () => new Set((sentOffers.data?.items ?? []).filter(item => ["APPLIED", "SHORTLISTED", "INVITED", "ACCEPTED"].includes(item.status)).map(item => item.projectId)),
    [sentOffers.data?.items],
  );
  const pendingOfferCount = useMemo(
    () => (sentOffers.data?.items ?? []).filter(item => ["APPLIED", "SHORTLISTED"].includes(item.status)).length,
    [sentOffers.data?.items],
  );
  const tabs = embedded && lecturer
    ? (view === "discover" ? [] : (["incoming", "outgoing", "history"] as const))
    : ([...(lecturer ? ["discover" as const] : []), "incoming", "active", "outgoing", "history"] as const);
  const tabLabels = { discover: "Find teams to mentor", incoming: "Incoming Requests", active: lecturer ? "Teams you mentor" : "Active Mentorships", outgoing: lecturer ? "My mentoring applications" : "Outgoing Requests", history: "Mentoring history" };
  const tabIcons = { discover: Search, incoming: Inbox, active: Users, outgoing: Send, history: History };
  const clearFilters = () => { setSearch(""); setArea(""); setOpportunityPage(1); };
  const projectHref = (id: string) => { const href = `/academic-support/projects/${encodeURIComponent(id)}`; return embedded ? mentorWorkspaceDestination(href) : href; };
  const openProject = (id: string) => { if (lecturer) navigate(projectHref(id)); else setParams(current => { const next = new URLSearchParams(current); next.set("projectId", id); return next; }); };
  if (profile.isLoading) return <main className="mx-auto w-full max-w-5xl px-4 py-7"><p role="status">{t("Loading…")}</p></main>;
  if (profile.isError) return <main className="mx-auto w-full max-w-5xl space-y-3 px-4 py-7"><p role="alert">{t("Unable to load your profile.")}</p><Button variant="outline" onClick={() => void profile.refetch()}>{t("Try again")}</Button></main>;
  if (lecturer && projectId) return <Navigate to={projectHref(projectId)} replace />;
  return <Container className={`academic-support-page ${lecturer ? "lecturer-workspace" : ""} ${embedded ? "mentor-embedded-support" : ""}`} data-no-i18n>
    {lecturer && !embedded && <Button asChild variant="ghost" className="mb-3"><Link to="/mentor-workspace">{t("mentorWorkspace.backGlobal")}</Link></Button>}
    <header className="academic-support-heading"><div><h1>{t(embedded ? view === "discover" ? "mentorWorkspace.discovery" : "mentorWorkspace.invitations" : lecturer ? "Lecturer workspace" : "Academic Support")}</h1><p>{t(lecturer ? "Connect with student teams and guide their next research step." : "Mentoring provides project guidance. Formal review requires a separate artifact request.")}</p></div>{lecturer ? <a role="button" href="#mentoring-settings" className="lecturer-availability" data-enabled={pref.data?.acceptingMentorships === true} onClick={e => { e.preventDefault(); setSettingsOpen(true); }} onKeyDown={e => { if (e.key === " ") { e.preventDefault(); setSettingsOpen(true); } }}><span data-enabled={pref.data?.acceptingMentorships === true} aria-hidden="true" />{t(pref.isError ? "Availability unavailable" : pref.isLoading ? "Loading…" : pref.data?.acceptingMentorships ? "Accepting new teams" : "Not accepting new teams")}<Settings2 size={15} aria-hidden="true" /></a> : <Button type="button" size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => setSettingsOpen(true)}><Settings2 size={15} aria-hidden="true" /><span>{t("Mentoring availability & notifications")}</span></Button>}</header>
    <div className="academic-support-layout">{tabs.length > 0 && <aside className="academic-support-sidebar"><nav className="academic-support-nav" aria-label={t("Mentoring workspace")}>
      {tabs.map(tab => {
        const Icon = tabIcons[tab];
        return (
          <button
            type="button"
            key={tab}
            aria-current={view === tab ? "page" : undefined}
            onMouseEnter={() => tab !== "discover" && prefetchSupportTab(tab)}
            onFocus={() => tab !== "discover" && prefetchSupportTab(tab)}
            onClick={() => changeView(tab)}
          >
            <Icon size={17} aria-hidden="true" />
            <span>{t(tabLabels[tab])}</span>
            {(tab === "incoming" || tab === "active") && navCounts && (
              <span className="academic-nav-count">
                {tab === "incoming" ? navCounts.incoming : navCounts.active}
              </span>
            )}
          </button>
        );
      })}
    </nav><div className="academic-support-links"><Link to="/reviews">{t("Academic Reviews")}<ArrowUpRight size={14} aria-hidden="true" /></Link><Link to="/projects">{t("Your projects")}<ArrowUpRight size={14} aria-hidden="true" /></Link></div></aside>}
    <div className="academic-support-content">
    {invitationProjectId && requestId && <section className="space-y-3" aria-label={t("Research mentorship invitation")}>
      <h2 className="text-base font-semibold">{t("Research mentorship invitation")}</h2>
      {linkedInvitation.isLoading ? <p role="status">{t("Loading…")}</p> : linkedInvitation.isError ? <div role="alert" className="space-y-2"><p>{t(mentorshipError(linkedInvitation.error))}</p><Button variant="outline" size="sm" onClick={() => void linkedInvitation.refetch()}>{t("Try again")}</Button></div> : linkedInvitation.data && <MentorshipList items={[linkedInvitation.data]} onOpen={openProject} />}
    </section>}
    {view === "discover" ? <section className="space-y-4" aria-label={t("Find teams to mentor")}><div className="academic-section-heading flex flex-wrap items-start justify-between gap-3"><div><h2>{language === "vi" ? "Khám phá nhóm" : t("Find teams to mentor")}</h2><p>{language === "vi" ? "Các nhóm được ưu tiên hiển thị dựa trên lĩnh vực nghiên cứu, mối quan tâm và thông tin chuyên môn trong hồ sơ học thuật của bạn." : "Research teams are prioritized using the research fields, interests, and expertise in your Academic Profile."}</p></div>{embedded && lecturer && <Button asChild size="sm" variant="outline" className="gap-1.5"><Link to="/mentor-workspace?view=outgoing"><Send size={14} aria-hidden="true" /><span>{language === "vi" ? "Đề nghị đã gửi" : t(tabLabels.outgoing)}</span>{pendingOfferCount > 0 && <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/12 px-1.5 text-[11px] font-semibold tabular-nums text-primary">{pendingOfferCount}</span>}</Link></Button>}</div>
      {pref.data?.acceptingMentorships && !(pref.data.supportTypes?.length) ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-primary/25 bg-primary/[0.04] px-3.5 py-2.5 text-xs">
          <p className="text-foreground/90">
            {language === "vi"
              ? "Bổ sung phạm vi hướng dẫn để các nhóm nghiên cứu hiểu rõ những nội dung thầy/cô có thể hỗ trợ."
              : "Add your preferred mentoring support scope so research teams clearly understand how you can guide them."}
          </p>
          <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 text-xs" onClick={() => setSettingsOpen(true)}>
            {language === "vi" ? "Cập nhật phạm vi hướng dẫn" : "Update mentoring scope"}
          </Button>
        </div>
      ) : null}
      {pref.isLoading ? <p role="status">{t("Loading…")}</p> : pref.isError ? <div role="alert" className="space-y-2"><p>{t("Unable to load mentoring preferences.")}</p><Button variant="outline" onClick={() => void pref.refetch()}>{t("Try again")}</Button></div> : !pref.data?.acceptingMentorships ? <div className="space-y-3 rounded-xl border bg-muted/30 p-5"><p className="text-sm">{t(pref.data?.canEnable ? "Enable mentoring availability below to discover teams and receive invitations." : "Lecturer verification is required before accepting official mentorships.")}</p><Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setSettingsOpen(true)}><Settings2 size={14} aria-hidden="true" /><span>{t("Mentoring availability")}</span></Button></div> : <>
      <div className="mentor-search-controls"><div className="mentor-search-input"><Search size={18} aria-hidden="true" /><Input aria-label={t("Search mentor opportunities")} placeholder={t("Search by project or topic")} value={search} maxLength={160} onChange={e => { setSearch(e.target.value); setOpportunityPage(1); }} />{search && <Button size="icon" variant="ghost" aria-label={t("Clear search")} onClick={() => { setSearch(""); setOpportunityPage(1); }}><X size={16} aria-hidden="true" /></Button>}</div><Button variant="outline" aria-expanded={showArea} aria-controls="team-area-filter" onClick={() => setShowArea(value => !value)}><SlidersHorizontal size={16} aria-hidden="true" />{t("Research Area")}{area && <span className="mentor-filter-count">1</span>}</Button></div>
      <div id="team-area-filter" hidden={!showArea} className="team-area-filter"><label htmlFor="team-area-input">{t("Filter by research area")}</label><Input id="team-area-input" placeholder={t("For example: Artificial Intelligence")} value={area} maxLength={120} onChange={e => { setArea(e.target.value); setOpportunityPage(1); }} /></div>
      <div className="team-results-summary" role="status" aria-live="polite"><span>{opportunities.isFetching ? t("Finding teams…") : opportunities.isSuccess ? `${opportunities.data.meta.total} ${language === "vi" ? "nhóm đang tìm người hướng dẫn" : t("teams seeking guidance")}` : ""}</span>{(search || area) ? <Button variant="ghost" size="sm" onClick={clearFilters}><X size={14} aria-hidden="true" />{t("Clear filters")}</Button> : null}</div>
      {opportunities.isLoading && <div aria-label={t("Loading…")} className="space-y-3"><Skeleton className="h-48 w-full rounded-xl" /><Skeleton className="h-48 w-full rounded-xl" /></div>}{opportunities.isError && <div role="alert" className="academic-empty"><p>{t(mentorshipError(opportunities.error))}</p><Button variant="outline" size="sm" onClick={() => void opportunities.refetch()}>{t("Try again")}</Button></div>}
      {opportunities.isSuccess && !opportunities.isFetching && !opportunities.data.items.length && <div className="academic-empty"><Search size={24} aria-hidden="true" /><p>{t(q || deferredArea ? "No teams match these filters. Try another topic or clear the filters." : "No projects are seeking mentors right now.")}</p>{(search || area) && <Button variant="outline" size="sm" onClick={clearFilters}>{t("Clear filters")}</Button>}</div>}
      <div className="team-opportunities" aria-busy={opportunities.isFetching}>{!opportunities.isError && opportunities.data?.items.map(p => <Opportunity key={p.id} preview={p} alreadyOffered={pendingOfferProjectIds.has(p.id)} onViewDossier={() => setDossierProjectId(p.id)} onOffer={() => { if (p.hasProspectiveAccessPolicy) setProposalState({ project: p }); else setOfferProject(p); }} />)}</div><Pager meta={opportunities.data?.meta} onPage={setOpportunityPage} />
    </> }</section> : <section className="space-y-4" aria-label={t(tabLabels[view])}><div className="academic-section-heading"><div>{lecturer && !embedded && view === "incoming" && <p className="mb-1 text-xs font-medium text-muted-foreground">Lecturer Dashboard / Supervision Requests</p>}<h2>{lecturer && view === "incoming" ? (language === "vi" ? "Yêu cầu hướng dẫn mới" : t("Incoming Requests")) : t(tabLabels[view])}</h2>
      {lecturer && <p>{t(view === "incoming" ? "Review the team's request before accepting a mentoring role." : view === "active" ? "Open a team to review its research and provide guidance." : view === "outgoing" ? "Follow the offers you have sent. Teams decide whether to accept." : "Review previous requests and completed mentorships.")}</p>}</div></div>
      {lecturer && view === "outgoing" && <MyMentorshipApplications />}
      {mine.isLoading ? (
        <div role="status" aria-label={t("Loading…")} className="space-y-3">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      ) : mine.isError ? <div role="alert" className="space-y-2"><p>{t("Unable to load mentorship requests.")}</p><Button variant="outline" size="sm" onClick={() => void mine.refetch()}>{t("Try again")}</Button></div> : <>
        {mine.data && !mine.data.requests.length && !mine.data.relationships.length && !linkedInvitation.data && !(lecturer && view === "outgoing") ? (
          <div className="academic-empty-card">
            <span className="academic-empty-icon" aria-hidden="true">
              {view === "history" ? <History size={22} /> : <Inbox size={22} />}
            </span>
            <h3 className="text-sm font-semibold text-foreground">
              {view === "incoming"
                ? (language === "vi" ? "Chưa có lời mời hướng dẫn mới" : "No incoming mentorship invitations")
                : view === "history"
                  ? (language === "vi" ? "Chưa có lịch sử hướng dẫn" : "No mentorship history yet")
                  : t(tabLabels[view])}
            </h3>
            <p className="max-w-md text-xs leading-5 text-muted-foreground">
              {t(view === "incoming" ? "No incoming mentorship invitations. Teams can invite you from your profile when you are accepting new teams." : view === "outgoing" ? "No outgoing mentorship requests yet." : view === "active" ? "No active mentorships yet. Accepted invitations and offers will appear here." : "No mentorship history yet.")}
            </p>
            {lecturer && view === "incoming" ? (
              <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                {embedded ? (
                  <Button asChild size="sm" className="gap-1.5">
                    <Link to="/mentor-workspace?view=discover">
                      <span>{t("mentorWorkspace.discovery")}</span>
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </Link>
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        <MentoringItems items={listedItems} onOpen={openProject} directHistory={view === "history"} />
            <Pager meta={mine.data && (mine.data.requestMeta.totalPages >= mine.data.relationshipMeta.totalPages ? mine.data.requestMeta : mine.data.relationshipMeta)} onPage={setPage} /></>}
        </section>}
        {!lecturer && <ProjectMentorFinder onSelect={id => setParams(id ? { projectId: id } : {})} selected={projectId ?? ""} />}
        {projectId && <MentorProjectPanel key={projectId} projectId={projectId} />}
      </div></div>

    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent id="mentoring-settings" className="sm:max-w-lg" data-no-i18n>
        <DialogHeader>
          <DialogTitle>{t("Mentoring availability & notifications")}</DialogTitle>
          <DialogDescription>
            {language === "vi"
              ? "Quản lý trạng thái tiếp nhận nhóm nghiên cứu mới và thông báo email cho các lời mời hướng dẫn."
              : "Manage whether research teams can invite you and configure email notifications for invitations."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          {lecturer && profile.data && pref.data && !pref.data.canEnable ? (
            <PositionVerificationPanel
              profile={profile.data}
              editable
              onEditPosition={() => {
                setSettingsOpen(false);
                navigate("/profile?edit=affiliation");
              }}
            />
          ) : null}
          <MentoringPreferencesPanel lecturer={lecturer} plain />
        </div>
      </DialogContent>
    </Dialog>

    {offerProject && <MentorshipApplicationDialog project={offerProject} onClose={() => setOfferProject(undefined)} />}
    {dossierProjectId && (
      <ResearchTeamDossierSheet
        projectId={dossierProjectId}
        mode="lecturer"
        onClose={() => setDossierProjectId(undefined)}
        onPropose={dossier => {
          const matched = opportunities.data?.items.find(item => item.id === dossier.projectId) ?? {
            id: dossier.projectId,
            title: dossier.overview.title,
            summary: dossier.overview.summary,
            stage: dossier.overview.stage,
            discovery: dossier.discovery,
            researchAreas: dossier.overview.researchAreas,
            expertise: dossier.needs.expertise,
            mentoringNeeds: dossier.needs.mentoringNeeds,
            availableRoles: dossier.needs.availableRoles,
            hasProspectiveAccessPolicy: Boolean(dossier.collaborationTerms.prospectiveAccess),
          };
          setDossierProjectId(undefined);
          setProposalState({ project: matched, dossier });
        }}
        onOpenExistingRequest={(pid, rid) => {
          setDossierProjectId(undefined);
          setExistingRequestViewer({ projectId: pid, requestId: rid });
        }}
      />
    )}
    {proposalState && (
      <LecturerProposalDialog
        project={proposalState.project}
        initialDossier={proposalState.dossier}
        onClose={() => setProposalState(undefined)}
        onOpenDossier={() => {
          const pid = proposalState.project.id;
          setProposalState(undefined);
          setDossierProjectId(pid);
        }}
        onFallbackLegacyInterest={() => {
          const p = proposalState.project;
          setProposalState(undefined);
          setOfferProject(p);
        }}
      />
    )}
    {existingRequestViewer && (
      <MentorshipInvitationViewer
        projectId={existingRequestViewer.projectId}
        requestId={existingRequestViewer.requestId}
        onClose={() => setExistingRequestViewer(undefined)}
      />
    )}
  </Container>;
}
function ProjectMentorFinder({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  const { t } = useI18n(), userId = useAuthStore(s => s.user?.id);
  const projects = useQuery({ queryKey: ["projects", userId, "mentorship-finder"], queryFn: projectsApi.list });
  return <section className="space-y-2 border-t pt-5"><h2 className="text-base font-semibold">{t("Find Mentors")}</h2><label className="block text-sm text-muted-foreground" htmlFor="mentorship-project">{t("Choose a project to find or suggest mentors.")}</label><select id="mentorship-project" className="h-10 w-full rounded-md border bg-background px-3 text-sm sm:max-w-md" value={selected} onChange={async e => { const id = e.target.value; if (await canLeaveWorkspace()) onSelect(id); }}><option value="">{t("Choose a project")}</option>{projects.data?.filter(p => !["ARCHIVED", "COMPLETED"].includes(p.status)).map(p => <option key={p._id} value={p._id}>{p.title}</option>)}</select>{projects.isError && <p role="alert" className="text-sm">{t("Unable to load project. Please try again.")}</p>}</section>;
}
type ComposerMentor = MentorshipPerson & Partial<Pick<AvailableMentor, "expertiseAreas" | "researchInterests" | "matchedTerms" | "sameInstitution" | "acceptingMentorships">>;
export function ConsentComposer(props: { project: MentorPreview; mentor?: ComposerMentor; suggestion?: boolean; onClose: () => void; planned?: { candidate: MentorPlanCandidate; version: number }; application?: { id: string; version: number } }) {
  if (props.suggestion && props.mentor) {
    return <SuggestMentorDialog project={props.project} mentor={props.mentor} onClose={props.onClose} />;
  }
  if (props.mentor) return <SupervisorInvitationForm project={props.project} mentor={props.mentor} planned={props.planned} application={props.application} onClose={props.onClose} />;
  return <ConsentComposerInner {...props} />;
}
function ConsentComposerInner({ project, mentor, suggestion = false, onClose, planned, application }: { project: MentorPreview; mentor?: ComposerMentor; suggestion?: boolean; onClose: () => void; planned?: { candidate: MentorPlanCandidate; version: number }; application?: { id: string; version: number } }) {
  const { t } = useI18n(), refresh = useSupportRefresh(), cache = useQueryClient(), [key, setKey] = useState(() => crypto.randomUUID());
  const userId = useAuthStore(s => s.user?.id);
  const invitation = Boolean(mentor && !suggestion), direction = mentor ? "PROJECT_TO_LECTURER" : "LECTURER_TO_PROJECT";
  const positions = useQuery({ queryKey: ["academic-support", userId, "composer-positions", project.id], queryFn: () => academicSupportApi.list(project.id), enabled: invitation });
  const allowedRoles: MentorRole[] = ["UNASSIGNED"];
  const content = useInvitationContent(project.id, direction, !suggestion, allowedRoles, mentor?._id);
  const [editingBrief, setEditingBrief] = useState(false), [closing, setClosing] = useState(false);
  const [step, setStep] = useState<"compose" | "preview">("compose");
  const [confirmedConsent, setConfirmedConsent] = useState(false);
  const [abstractDraft, setAbstractDraft] = useState<string | null>(null);
  const [savingAbstract, setSavingAbstract] = useState(false);
  const [dossierState, setDossierState] = useState<DossierDraftState>(() => createInitialDossierState());
  const seededSettings = useRef(false);
  const [accessPolicy, setAccessPolicy] = useState(defaultMentorPolicy);
  const settings = useQuery({ queryKey: ["academic-support", userId, "discovery-settings", project.id], queryFn: () => academicSupportApi.settings(project.id), enabled: invitation });
  useEffect(() => {
    if (!settings.data || seededSettings.current) return;
    seededSettings.current = true;
    const defaults = settings.data.dossierDefaults;
    setDossierState(prev => ({
      ...prev,
      keywordsText: prev.keywordsText || defaults?.keywords.join(", ") || "",
      proposedNote: prev.proposedNote || settings.data?.mentoringNeeds || "",
    }));
  }, [settings.data]);
  const effectiveSummary = (abstractDraft !== null ? abstractDraft : settings.data?.summary ?? "").trim();
  const summaryEdited = Boolean(invitation && settings.data && abstractDraft !== null && abstractDraft.trim() !== settings.data.summary.trim());
  useUnsavedWorkspace(invitation && (summaryEdited || JSON.stringify(accessPolicy) !== JSON.stringify(defaultMentorPolicy())));
  const dossierInput = useMemo(() => toInvitationDossierInput(dossierState), [dossierState]);
  const abstractTooShort = invitation && (effectiveSummary.length < 30 || effectiveSummary.split(/\s+/).filter(Boolean).length < 5);
  const persistAbstractIfEdited = async () => {
    if (!invitation || !summaryEdited || !settings.data) return settings.data?.previewToken;
    const saved = await academicSupportApi.saveSettings(project.id, {
      discovery: settings.data.discovery,
      summary: effectiveSummary,
      expertise: settings.data.expertise,
      researchAreas: settings.data.researchAreas,
      mentoringNeeds: settings.data.mentoringNeeds,
      expectedVersion: settings.data.version,
    });
    cache.setQueryData(["academic-support", userId, "discovery-settings", project.id], saved);
    setAbstractDraft(null);
    return saved.previewToken;
  };
  const dossierPreview = useQuery({
    queryKey: ["academic-support", userId, "dossier-preview", project.id, mentor?._id, content.mentorRole, content.message, accessPolicy, dossierInput, settings.data?.previewToken],
    queryFn: () => academicSupportApi.previewDossier(project.id, { mentorUserId: mentor!._id, message: content.message, mentorRole: content.mentorRole, access: accessPolicy, dossier: dossierInput }),
    enabled: Boolean(invitation && step === "preview" && mentor && !editingBrief && !savingAbstract),
    staleTime: 0,
  });
  const sendLock = useRef(false);
  const send = useMutation({
    mutationFn: async () => {
      if (useAuthStore.getState().user?.id !== userId) throw new Error("Your account changed. Reopen the invitation before continuing.");
      if (!suggestion) await content.persist();
      const latestToken = await persistAbstractIfEdited();
      if (useAuthStore.getState().user?.id !== userId) throw new Error("Your account changed. Reopen the invitation before continuing.");
      const payload = { ...(application ? { applicationId: application.id, expectedApplicationVersion: application.version } : {}), ...(planned ? { candidateId: planned.candidate.id, expectedPlanVersion: planned.version } : {}), mentorRole: content.mentorRole, attachmentIds: content.attachments.map(a => a.id), ...(invitation ? { access: accessPolicy, dossier: dossierInput, ...(latestToken ? { expectedPreviewToken: latestToken } : {}) } : {}) };
      return mentor ? suggestion ? academicSupportApi.suggest(project.id, mentor._id, content.message) : academicSupportApi.request(project.id, mentor._id, content.message, key, payload) : academicSupportApi.offer(project.id, content.message, key, payload);
    }, onSuccess: () => { if (useAuthStore.getState().user?.id !== userId) return; toast.success(t(!mentor ? "Mentorship offer sent. Track the team's response in Sent mentorship offers." : suggestion ? "Mentor suggestion sent to the project owner." : "Invitation sent. Track the response in Invitations & mentors.")); refresh(); onClose(); }, onError: refresh
  });
  const submit = () => { if (sendLock.current) return; sendLock.current = true; void send.mutateAsync().catch(() => { }).finally(() => { sendLock.current = false; }); };
  const close = async () => {
    if (send.isPending || savingAbstract || closing || content.uploading || !await canLeaveWorkspace()) return;
    setClosing(true);
    try { await content.persist(); onClose(); } catch { setClosing(false); /* Keep unsaved input visible for recovery. */ }
  };
  const change = (value: Parameters<typeof content.change>[0]) => { if (send.isError) { setKey(crypto.randomUUID()); send.reset(); } setConfirmedConsent(false); content.change(value); };
  const updateDossier = (updater: (prev: DossierDraftState) => DossierDraftState) => { if (send.isError) { setKey(crypto.randomUUID()); send.reset(); } setConfirmedConsent(false); setDossierState(updater); };
  const openPreview = async () => {
    if (summaryEdited && !abstractTooShort) {
      setSavingAbstract(true);
      try { await persistAbstractIfEdited(); }
      catch { setSavingAbstract(false); return; }
      setSavingAbstract(false);
    }
    setStep("preview");
  };
  const roleBlocked = !suggestion && !allowedRoles.length && (!invitation || positions.isSuccess);
  const canSendInvitation = !send.isPending && !savingAbstract && !closing && !content.uploading && content.ready && Boolean(content.message.trim() || (!suggestion && content.attachments.length)) && (suggestion || allowedRoles.includes(content.mentorRole)) && (!invitation || (confirmedConsent && !abstractTooShort && !settings.isFetching && !settings.isError && !positions.isLoading && !positions.isError && !editingBrief && !dossierPreview.isError));
  const sharedPreviewModel = settings.data ? { ...settings.data, summary: abstractDraft !== null ? abstractDraft : settings.data.summary } : { ...project, summary: "" };
  const mentorFields = [...(mentor?.expertiseAreas ?? []), ...(mentor?.researchInterests ?? [])].filter((v, i, arr) => arr.indexOf(v) === i).slice(0, 3);
  const sharedField = settings.data?.researchField || settings.data?.researchAreas?.[0] || project.researchField || project.researchAreas?.[0];
  const sharedKeywordsText = dossierState.keywordsText || settings.data?.dossierDefaults?.keywords.slice(0, 3).join(", ") || project.expertise?.slice(0, 3).join(", ");
  const sharedGoalText = dossierState.approvedObjective.trim() || settings.data?.mentoringNeeds?.trim();
  const privacyNoticeBox = (
    <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-2.5">
      <div className="flex items-start gap-2.5">
        <ShieldCheck size={17} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="space-y-1 text-xs leading-5">
          <p className="font-semibold text-foreground">Quyền riêng tư</p>
          <p className="text-muted-foreground">
            Chỉ chia sẻ Proposal Preview. Giảng viên chưa được xem thư viện tài liệu, dữ liệu nhóm hoặc bản thảo riêng tư cho đến khi chấp nhận và được cấp quyền.
          </p>
        </div>
      </div>
      <label className="flex items-start gap-2.5 rounded-lg border bg-background p-2.5 text-xs leading-5 cursor-pointer">
        <input type="checkbox" aria-label="Xác nhận chia sẻ hồ sơ mời hướng dẫn" className="mt-0.5" checked={confirmedConsent} disabled={send.isPending || savingAbstract || closing} onChange={e => setConfirmedConsent(e.target.checked)} />
        <span>Tôi xác nhận thông tin đề tài, hồ sơ học thuật và tệp đính kèm được chọn tại đây có thể được chia sẻ với giảng viên này.</span>
      </label>
    </div>
  );
  return <Dialog open onOpenChange={open => { if (!open) void close(); }}><DialogContent className="mentor-invitation-dialog max-h-[88dvh] overflow-y-auto sm:max-w-3xl" data-no-i18n><DialogHeader className="pr-6 text-left">
    <DialogTitle className="break-words leading-snug">{invitation ? "Gửi yêu cầu hướng dẫn" : `${t(suggestion ? "Suggest Mentor" : "Offer Mentorship")}${mentor ? ` · ${mentor.fullName}` : ""}`}</DialogTitle>
    <DialogDescription>{t(suggestion ? "Only the project owner can send the official invitation." : "Both parties must agree before mentor access is granted. Your draft is saved privately for reuse.")}</DialogDescription></DialogHeader>
    {invitation && (
      <nav aria-label="Các bước gửi yêu cầu hướng dẫn" className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-1 text-xs">
        <button
          type="button"
          disabled={editingBrief || send.isPending || savingAbstract}
          onClick={() => setStep("compose")}
          aria-current={step === "compose" ? "step" : undefined}
          className={step === "compose" ? "rounded-md bg-background px-3 py-1.5 font-semibold text-foreground shadow-sm" : "rounded-md px-3 py-1.5 font-medium text-muted-foreground hover:text-foreground"}
        >
          1. Soạn yêu cầu hướng dẫn
        </button>
        <button
          type="button"
          disabled={editingBrief || send.isPending || savingAbstract}
          onClick={() => void openPreview()}
          aria-current={step === "preview" ? "step" : undefined}
          className={step === "preview" ? "rounded-md bg-background px-3 py-1.5 font-semibold text-foreground shadow-sm" : "rounded-md px-3 py-1.5 font-medium text-muted-foreground hover:text-foreground"}
        >
          2. Xem trước hồ sơ
        </button>
      </nav>
    )}
    {mentor && (!invitation || step === "compose") && (
      <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-2.5">
        <div className="flex items-start gap-3">
          <div className="mentor-composer-recipient-avatar shrink-0" aria-hidden="true">
            {mentor.avatarUrl ? (
              <img src={mentor.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              mentor.fullName?.slice(0, 2).toUpperCase() || "?"
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            {invitation && <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5"><GraduationCap size={14} aria-hidden="true" /><span>Giảng viên đã chọn</span></p>}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-sm text-foreground">{mentor.fullName}</span>
              {Boolean(/\bdemo\b/i.test(mentor.fullName ?? "")) && <Badge variant="outline">{t("supervisor.demo")}</Badge>}
              {Boolean(mentor.verifiedLecturer && !mentor.fullName?.includes("Demo")) && (
                <BadgeCheck size={16} className="text-blue-600 dark:text-blue-400 shrink-0" aria-label={t("Verified Lecturer")} />
              )}
              {invitation && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">Sẵn sàng nhận hướng dẫn</span>}
            </div>
            <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
              {[mentor.positionTitle, mentor.institutionName, mentorFields.join(", ")].filter(Boolean).join(" · ") || t("Academic Mentor")}
            </p>
          </div>
        </div>
        {!suggestion && (
          <label className="block space-y-1 pt-1 border-t border-border/60 text-xs">
            <span className="font-medium text-foreground">{t("Mentor role")}</span>
            <select aria-label={t("Mentor role")} className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={content.mentorRole} disabled={send.isPending || closing || !content.ready || positions.isFetching} onChange={e => change({ mentorRole: e.target.value as MentorRole })}>
              <option value="PRIMARY" disabled={!allowedRoles.includes("PRIMARY")}>{t("Primary mentor")}</option><option value="SECONDARY" disabled={!allowedRoles.includes("SECONDARY")}>{t("Secondary mentor")}</option>
            </select>
            <p className="text-[11px] leading-4 text-muted-foreground">Lời mời mới độc lập, chưa phân vai và không tự động hết hạn.</p>
          </label>
        )}
      </div>
    )}
    {roleBlocked && <p role="status" className="text-sm leading-6 text-muted-foreground">{t("No mentoring position is available. Review current mentors and pending invitations before sending another request.")}</p>}
    {invitation && step === "compose" && (settings.isLoading ? <Skeleton className="h-24 w-full" /> : settings.isError ? <div role="alert" className="space-y-2 text-sm"><p>{t("Could not load the invitation preview.")}</p><Button size="sm" variant="outline" onClick={() => void settings.refetch()}>{t("Try again")}</Button></div> : editingBrief ? <MentorDiscoverySettings projectId={project.id} startEditing onDone={() => setEditingBrief(false)} /> : <>
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Đề tài được chia sẻ</p>
        <div className="rounded-xl border border-border/80 bg-background p-3.5 space-y-2">
          <div>
            <p className="text-sm font-semibold text-foreground">{project.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">
              {[sharedField, sharedKeywordsText, sharedGoalText].filter(Boolean).join(" · ") || "Thông tin từ dự án nghiên cứu"}
            </p>
          </div>
          <details open className="rounded-lg border bg-muted/20 p-3">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">{t("Project information shared with the lecturer")} · {project.title}</summary>
            <div className="mt-2.5 space-y-2.5">
              <MentorPreviewContent preview={sharedPreviewModel} />
              {settings.data?.invitationSender && <MentorInvitationSender sender={settings.data.invitationSender} />}
              <Button size="sm" type="button" variant="outline" disabled={send.isPending || closing} onClick={() => setEditingBrief(true)}>{t("Edit project information")}</Button>
              <MentorInvitationAccessNotice />
            </div>
          </details>
        </div>
      </div>

      <label className="block space-y-1.5 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-foreground">Research Abstract</span>
          {summaryEdited && <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">Chưa lưu tóm tắt chia sẻ</span>}
        </div>
        <textarea
          aria-label="Research Abstract"
          className="min-h-24 w-full rounded-xl border bg-background p-3 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={abstractDraft !== null ? abstractDraft : (settings.data?.summary ?? "")}
          maxLength={2000}
          disabled={send.isPending || savingAbstract || closing}
          placeholder="Tóm tắt vấn đề, mục tiêu, phương pháp dự kiến..."
          onChange={e => { setAbstractDraft(e.target.value); if (send.isError) { setKey(crypto.randomUUID()); send.reset(); } }}
        />
        <p className="text-xs leading-5 text-muted-foreground">
          {abstractTooShort
            ? "Bổ sung tóm tắt nghiên cứu được phép chia sẻ, ít nhất 30 ký tự và 5 từ, để giảng viên hiểu đề tài trước khi quyết định."
            : "Bạn có thể soạn hoặc rà soát lại tóm tắt từ mô tả đề tài, và phải tự xác nhận nội dung trước khi gửi."}
        </p>
      </label>

      <div className="space-y-2 text-sm">
        <p className="font-medium text-foreground">Loại hỗ trợ mong muốn</p>
        <SupportAreasChecklist
          selected={dossierState.supportAreas}
          disabled={send.isPending || closing}
          onToggle={area => updateDossier(prev => ({
            ...prev,
            supportAreas: prev.supportAreas.includes(area)
              ? prev.supportAreas.filter(x => x !== area)
              : [...prev.supportAreas, area],
          }))}
        />
      </div>

      {!content.ready ? <Skeleton className="h-28 w-full" /> : (
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-foreground">Lời nhắn tới giảng viên *</span>
          <textarea
            aria-label={t("Message")}
            className="min-h-24 w-full rounded-xl border bg-background p-3 text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={content.message}
            disabled={send.isPending || closing}
            maxLength={1000}
            onChange={e => change({ message: e.target.value })}
            placeholder="Giới thiệu ngắn gọn nhóm và lý do mong muốn được thầy/cô hướng dẫn..."
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <button type="button" className="underline underline-offset-2 hover:text-foreground" disabled={!content.ready || send.isPending || content.uploading} onClick={async () => { if (await canLeaveWorkspace()) await content.reload(); }}>
              Dùng lại lời nhắn và tệp của bản nháp đã lưu
            </button>
            <span>{content.message.length}/1000</span>
          </div>
        </label>
      )}

      <details className="rounded-xl border border-border/80 bg-muted/15 p-3.5">
        <summary className="cursor-pointer text-xs font-semibold text-foreground">
          Tùy chọn nâng cao: Mục tiêu nghiên cứu, hồ sơ nhóm, quyền sau khi chấp nhận & tệp đính kèm
        </summary>
        <div className="mt-3 space-y-4">
          <InvitationDossierForm state={dossierState} onChange={updateDossier} settings={settings.data} disabled={send.isPending || closing} onEditProjectBrief={() => setEditingBrief(true)} hideSupportAreas />
          <div className="rounded-lg border bg-background p-3.5 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vai trò, quyền và nội dung chia sẻ sau khi chấp nhận</p>
            <MentorPolicyFields projectId={project.id} value={accessPolicy} onChange={value => { setAccessPolicy(value); setConfirmedConsent(false); if (send.isError) { setKey(crypto.randomUUID()); send.reset(); } }} disabled={send.isPending || closing} />
          </div>
          <div className="space-y-2">
            <InvitationAttachments attachments={content.attachments} onRemove={send.isPending || closing || content.uploading ? undefined : id => change({ attachments: content.attachments.filter(a => a.id !== id) })} />
            <InvitationUpload disabled={!content.ready || send.isPending || closing || content.attachments.length >= 5} uploading={content.uploading} onUpload={files => { if (send.isError) { setKey(crypto.randomUUID()); send.reset(); } void content.upload(files); }} />
            <p className="text-xs leading-5 text-muted-foreground">{t("Only files you attach here are shared with this invitation. Your project library stays private.")}</p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <p role="status" className="text-xs text-muted-foreground">{t(content.status === "saving" ? "Saving invitation draft…" : content.status === "saved" && !content.dirty ? "Draft saved privately · reusable for another mentor" : "Unsaved invitation changes")}</p>
            <Button type="button" size="sm" variant="ghost" disabled={!content.ready || send.isPending || closing || content.uploading || content.status === "saving"} onClick={() => void content.persist().catch(() => { })}>{t("Save for reuse")}</Button>
          </div>
        </div>
      </details>

      {privacyNoticeBox}
    </>)}
    {invitation && step === "preview" && <div className="space-y-4">
      <div className="rounded-md border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
        Đây là bản xem trước chính xác của <strong>Hồ sơ mời hướng dẫn nghiên cứu</strong> mà Thầy/Cô sẽ nhận được sau khi hệ thống lọc các trường riêng tư.
      </div>
      {dossierPreview.isLoading ? <Skeleton className="h-64 w-full" /> : dossierPreview.isError ? <div role="alert" className="space-y-2 text-sm text-destructive"><p>{mentorshipError(dossierPreview.error)}</p><Button type="button" size="sm" variant="outline" onClick={() => void dossierPreview.refetch()}>{t("Try again")}</Button></div> : (
        <InvitationDossierView
          dossier={dossierPreview.data}
          legacyProject={sharedPreviewModel}
          legacySender={settings.data?.invitationSender}
          legacyMessage={content.message}
          attachments={content.attachments}
        />
      )}
      {abstractTooShort && <p role="alert" className="text-sm text-destructive">Cần hoàn thiện tóm tắt đề tài (tối thiểu 30 ký tự và 5 từ) trước khi gửi.</p>}
      {!content.message.trim() && !content.attachments.length && <p role="alert" className="text-sm text-destructive">Vui lòng nhập lời nhắn gửi giảng viên hoặc đính kèm tệp giới thiệu.</p>}
      {privacyNoticeBox}
    </div>}
    {!invitation && <>
      {!content.ready && !suggestion ? <Skeleton className="h-28 w-full" /> : <label className="space-y-2 text-sm"><span className="font-medium">{t("Message")}{suggestion ? " *" : ""}</span><textarea aria-label={t("Message")} autoFocus={!invitation} className="min-h-32 w-full rounded-md border bg-background p-3 text-sm leading-6" value={content.message} disabled={send.isPending || closing} maxLength={1000} onChange={e => change({ message: e.target.value })} placeholder={t("Explain the guidance you are seeking or offering.")} /><span className="block text-right text-xs text-muted-foreground">{content.message.length}/1000</span></label>}
      {!suggestion && <>
        <InvitationAttachments attachments={content.attachments} onRemove={send.isPending || closing || content.uploading ? undefined : id => change({ attachments: content.attachments.filter(a => a.id !== id) })} />
        <InvitationUpload disabled={!content.ready || send.isPending || closing || content.attachments.length >= 5} uploading={content.uploading} onUpload={files => { if (send.isError) { setKey(crypto.randomUUID()); send.reset(); } void content.upload(files); }} />
        <p className="text-xs leading-5 text-muted-foreground">{t("Only files you attach here are shared with this invitation. Your project library stays private.")}</p>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"><p role="status" className="text-xs text-muted-foreground">{t(content.status === "saving" ? "Saving invitation draft…" : content.status === "saved" && !content.dirty ? "Draft saved privately · reusable for another mentor" : "Unsaved invitation changes")}</p><Button type="button" size="sm" variant="ghost" disabled={!content.ready || send.isPending || closing || content.uploading || content.status === "saving"} onClick={() => void content.persist().catch(() => { })}>{t("Save for reuse")}</Button></div>
      </>}
    </>}
    {(content.error || send.error || positions.isError) && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{t(content.error || mentorshipError(send.error ?? positions.error))}</p>{content.canReload && <Button type="button" size="sm" variant="outline" disabled={content.status === "saving" || content.uploading || send.isPending || closing} onClick={() => void content.reload()}>{t("Reload saved draft")}</Button>}</div>}
    <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
      <div className="flex gap-2">
        <Button variant="ghost" disabled={send.isPending || savingAbstract || closing || content.uploading} onClick={() => void close()}>{t("Cancel")}</Button>
        {invitation && step === "preview" && <Button type="button" variant="outline" disabled={send.isPending || savingAbstract || closing || editingBrief} onClick={() => setStep("compose")}>Quay lại chỉnh sửa</Button>}
      </div>
      <div className="flex flex-wrap gap-2">
        {invitation && step === "compose" && !roleBlocked && (
          <Button type="button" variant="outline" disabled={editingBrief || send.isPending || savingAbstract} onClick={() => void openPreview()}>
            Xem trước hồ sơ
          </Button>
        )}
        <Button disabled={!canSendInvitation} onClick={submit}>{t(send.isPending || savingAbstract ? "Sending…" : suggestion ? "Send suggestion" : mentor ? "Send Invitation" : "Send offer")}</Button>
      </div>
    </div>
  </DialogContent></Dialog>;
}
function Opportunity({ preview, alreadyOffered = false, onViewDossier, onOffer }: { preview: MentorPreview; alreadyOffered?: boolean; onViewDossier: () => void; onOffer: () => void }) {
  const { t, language } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const isVi = language === "vi";
  const stages = { PLANNING: "Planning", ACTIVE: "Active", ON_HOLD: "On hold", COMPLETED: "Completed", ARCHIVED: "Archived" };
  return (
    <article className="team-opportunity">
      <div className="team-opportunity-top">
        <div className="team-opportunity-areas">
          {preview.researchAreas.map(term => <span key={term}>{t(term)}</span>)}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {preview.teamMemberCount !== undefined ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <Users size={11} aria-hidden="true" />
              <span>{preview.teamMemberCount} {t("supervisor.members")}</span>
            </span>
          ) : null}
          <span className="team-opportunity-stage">{t(stages[preview.stage])}</span>
        </div>
      </div>

      <h3>{preview.title}</h3>
      <p className="team-opportunity-summary line-clamp-2">{preview.summary || t("No public description yet.")}</p>

      {preview.supportTypes?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {preview.supportTypes!.slice(0, 4).map(type => (
            <span key={type} className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
              {formatSupportLabel(type, language, t)}
            </span>
          ))}
        </div>
      ) : null}

      <div className="team-opportunity-need">
        <p>{isVi ? "Nội dung cần hỗ trợ" : t("Where you can help")}</p>
        <p>{preview.mentoringNeeds || t("Discuss the team's mentoring needs before agreeing to guide them.")}</p>
      </div>

      <div id={`team-detail-${preview.id}`} hidden={!expanded} className="team-opportunity-details space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
        {preview.expertise.length > 0 ? (
          <p>
            <strong className="font-medium text-foreground">{isVi ? "Chuyên môn nhóm đang tìm" : t("Expertise requested")}:</strong>{" "}
            {preview.expertise.map(term => t(term)).join(" · ")}
          </p>
        ) : null}
        {preview.availableRoles?.length ? (
          <p>
            <strong className="font-medium text-foreground">{t("Available mentoring roles")}:</strong>{" "}
            {preview.availableRoles!.map(role => t(mentorRoleLabelKeys[role])).join(" · ")}
          </p>
        ) : null}
        {(preview.expectedFrequency || preview.expectedDuration) ? (
          <p>
            <strong className="font-medium text-foreground">{isVi ? "Kỳ vọng trao đổi" : "Expected cadence"}:</strong>{" "}
            {[preview.expectedFrequency, preview.expectedDuration].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </div>

      <div className="team-opportunity-actions">
        <button type="button" aria-expanded={expanded} aria-controls={`team-detail-${preview.id}`} onClick={() => setExpanded(v => !v)}>
          <span>{t(expanded ? "Show less" : "View team details")}</span>
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={onViewDossier}>
            <FileText size={14} aria-hidden="true" />
            <span>{isVi ? "Xem hồ sơ nhóm" : "Team dossier"}</span>
          </Button>
          {alreadyOffered ? (
            <Button size="sm" variant="secondary" disabled className="gap-1.5">
              <CheckCircle2 size={15} aria-hidden="true" />
              <span>{t("Offer already sent")}</span>
            </Button>
          ) : (
            <Button size="sm" onClick={onOffer}>
              {preview.hasProspectiveAccessPolicy ? (isVi ? "Đề nghị hướng dẫn" : "Offer Mentorship") : t("Offer to support team")}
              <ArrowUpRight size={15} aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
export function MentorshipList({
  items,
  onOpen,
  onOpenAccess,
  onManageAccess,
  onManageRoles,
  showRolesMenu = false,
  showEmpty = true,
  currentProjectId,
  variant,
}: {
  items: MentorshipItem[];
  onOpen?: (id: string) => void;
  onOpenAccess?: () => void;
  onManageAccess?: (mentorUserId: string) => void;
  onManageRoles?: () => void;
  showRolesMenu?: boolean;
  showEmpty?: boolean;
  currentProjectId?: string;
  variant?: "active" | "pending" | "history";
}) {
  const { t, language } = useI18n(), refresh = useSupportRefresh();
  const isVi = language === "vi";
  const userId = useAuthStore(s => s.user?.id);
  const [action, setAction] = useState<{ item: MentorshipItem; kind: "accept" | "decline" | "cancel" | "end" | "request-info"; open: boolean }>(), [note, setNote] = useState(""), [preview, setPreview] = useState<MentorshipItem>();
  const responseLock = useRef(false);

  const acceptRequest = action?.kind === "accept" && action.item.kind === "REQUEST" ? action.item : undefined;
  const details = useQuery({
    queryKey: ["academic-support", userId, "invitation-detail", acceptRequest?.projectId, acceptRequest?.id],
    queryFn: () => academicSupportApi.requestDetail(acceptRequest!.projectId, acceptRequest!.id), enabled: Boolean(action?.open && acceptRequest), retry: false, staleTime: 0, refetchOnWindowFocus: false
  });
  const reviewedItem = acceptRequest && details.data ? details.data : action?.item;
  const canConfirm = Boolean(
    action?.open
    && (action.kind !== "request-info" || note.trim().length >= 5)
    && (!acceptRequest || (details.isSuccess && !details.isFetching && details.data.actions.accept)),
  );
  const briefChanged = Boolean(acceptRequest && details.data && (details.data.previewToken !== acceptRequest.previewToken || details.data.accessPolicy?.version !== acceptRequest.accessPolicy?.version));
  const closeAction = () => setAction(current => current && { ...current, open: false });

  const response = useMutation({
    mutationFn: async (submission: { item: MentorshipItem; kind: "accept" | "decline" | "cancel" | "end" | "request-info"; note: string }) => {
      if (useAuthStore.getState().user?.id !== userId) throw new Error("Your account changed. Reopen the invitation before continuing.");
      if (submission.kind === "request-info") return academicSupportApi.requestInfo(submission.item, submission.note);
      return academicSupportApi.respond(submission.item, submission.kind, submission.note);
    }, onSuccess: (_result, submission) => {
      if (useAuthStore.getState().user?.id !== userId) return;
      if (submission.kind === "accept") toast.success(t("supervisor.accepted"));
      else if (submission.kind === "request-info") toast.success(isVi ? "Đã gửi yêu cầu bổ sung thông tin tới nhóm nghiên cứu." : "Clarification request sent to the research team.");
      closeAction(); setNote(""); refresh();
    }, onError: refresh
  });
  const confirm = () => {
    if (responseLock.current || !canConfirm || !action || !reviewedItem) return; responseLock.current = true;
    void response.mutateAsync({ item: reviewedItem, kind: action.kind, note }).catch(() => { }).finally(() => { responseLock.current = false; });
  };
  function choose(item: MentorshipItem, kind: "accept" | "decline" | "cancel" | "end" | "request-info") { response.reset(); setNote(""); setAction({ item, kind, open: true }); }
  const listContainerClass = currentProjectId
    ? variant === "history"
      ? "mentorship-list divide-y divide-border/70"
      : "mentorship-list space-y-2.5"
    : "mentorship-list space-y-3";
  return <>{showEmpty && !items.length && <p className="text-sm text-muted-foreground">{t("No mentorship requests or active mentors.")}</p>}{Boolean(items.length) && <ul className={listContainerClass} data-no-i18n>{items.map(item => {
    if (currentProjectId) {
      const tone = mentorshipStatusTone(item);
      const statusLabel = projectMentorshipStatusLabel(item, language, t);
      const metaLine = [item.mentorUser.positionTitle, item.mentorUser.institutionName].filter(Boolean).join(" · ");
      const dateLocale = isVi ? "vi-VN" : "en-US";
      const dateStr = new Date(item.kind === "RELATIONSHIP" ? item.startedAt : item.createdAt).toLocaleDateString(dateLocale);
      const endedStr = item.kind === "RELATIONSHIP" && item.endedAt ? new Date(item.endedAt).toLocaleDateString(dateLocale) : undefined;
      const roleLabelText = t(mentorRoleLabelKeys[item.mentorRole ?? "UNASSIGNED"]);
      const isIncomingProposal = item.kind === "REQUEST" && item.direction === "LECTURER_TO_PROJECT";
      const directionTag = item.kind === "REQUEST"
        ? (isIncomingProposal ? (isVi ? "Đề nghị đến" : "Incoming proposal") : (isVi ? "Lời mời đã gửi" : "Sent invitation"))
        : (isVi ? "Quan hệ hướng dẫn" : "Mentoring relationship");

      if (variant === "history") {
        const secondaryReason = item.kind === "RELATIONSHIP"
          ? item.endReason
          : item.closeReason === "MENTOR_POSITION_FILLED"
            ? t("The mentor position has been filled.")
            : item.responseNote;
        return (
          <li key={`${item.kind}-${item.id}`} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="break-words text-[13.5px] font-semibold text-foreground">{item.mentorUser.fullName}</p>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{directionTag}</span>
                {item.kind === "RELATIONSHIP" && (
                  <span className="text-[11.5px] text-muted-foreground">
                    {roleLabelText} · {isVi ? `Từ ${dateStr}` : `From ${dateStr}`}{endedStr ? (isVi ? ` đến ${endedStr}` : ` to ${endedStr}`) : ""}
                  </span>
                )}
                {item.kind === "REQUEST" && (
                  <span className="text-[11.5px] text-muted-foreground">{t("supervisor.sentOn")} {dateStr}</span>
                )}
              </div>
              {metaLine && <p className="truncate text-xs text-muted-foreground">{metaLine}</p>}
              {secondaryReason && <p className="line-clamp-1 text-xs text-muted-foreground/90">{secondaryReason}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Badge variant="outline" className={`h-5 px-2 text-[11px] font-medium ${statusPillStyle(tone)}`}>
                {statusLabel}
              </Badge>
              {item.kind === "REQUEST" ? (
                <Button size="sm" variant="ghost" className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground" onClick={() => setPreview(item)}>
                  {isVi ? "Xem chi tiết" : "View details"}
                </Button>
              ) : (
                <Button size="sm" variant="ghost" className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground" asChild>
                  <Link target="_blank" rel="noopener noreferrer" to={`/academics/${encodeURIComponent(item.mentorUser._id)}`}>{t("View profile")}</Link>
                </Button>
              )}
            </div>
          </li>
        );
      }

      const isActiveCard = item.kind === "RELATIONSHIP" && item.status === "ACTIVE";
      const avatarStyle = isActiveCard
        ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/25 dark:text-emerald-300"
        : isIncomingProposal
          ? "bg-blue-500/10 text-blue-700 border-blue-500/25 dark:text-blue-300"
          : "bg-amber-500/10 text-amber-800 border-amber-500/25 dark:text-amber-300";

      return (
        <li
          key={`${item.kind}-${item.id}`}
          className={`flex flex-col gap-3 rounded-xl border px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between ${isActiveCard
            ? "border-border/90 bg-card shadow-2xs"
            : "border-border/80 bg-card"
            }`}
        >
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border text-xs font-bold ${avatarStyle}`} aria-hidden="true">
              {item.mentorUser.avatarUrl ? (
                <img src={item.mentorUser.avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                personInitials(item.mentorUser.fullName)
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  target="_blank"
                  rel="noopener noreferrer"
                  to={`/academics/${encodeURIComponent(item.mentorUser._id)}`}
                  className="break-words text-sm font-semibold text-foreground hover:text-primary hover:underline"
                >
                  {item.mentorUser.fullName}
                </Link>
                {Boolean(item.mentorUser.verifiedLecturer && !/\bdemo\b/i.test(item.mentorUser.fullName ?? "")) && (
                  <BadgeCheck size={15} className="text-blue-600 dark:text-blue-400 shrink-0" aria-label={t("Verified Lecturer")} />
                )}
                {isActiveCard && (
                  <Badge variant="secondary" className="h-5 px-2 text-[11px] font-medium">
                    {roleLabelText}
                  </Badge>
                )}
                {isIncomingProposal && item.proposalVersion && item.proposalVersion > 1 ? (
                  <Badge variant="secondary" className="h-5 px-2 text-[11px] font-medium">
                    v{item.proposalVersion}
                  </Badge>
                ) : null}
                <Badge variant="outline" className={`h-5 gap-1.5 px-2 text-[11px] font-medium ${statusPillStyle(tone)}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${tone === "emerald" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : "bg-muted-foreground/50"}`} aria-hidden="true" />
                  {statusLabel}
                </Badge>
              </div>
              {metaLine && <p className="truncate text-xs text-muted-foreground">{metaLine}</p>}
              <p className="text-xs text-muted-foreground/90">
                {item.kind === "RELATIONSHIP"
                  ? `${isVi ? "Đồng hành từ" : "Mentoring since"} ${dateStr}`
                  : `${t("supervisor.sentOn")} ${dateStr}`}
              </p>
              {item.kind === "REQUEST" && item.message ? (
                <p className="line-clamp-2 pt-0.5 text-xs leading-5 text-foreground/85">{item.message}</p>
              ) : null}
              {item.kind === "RELATIONSHIP" && "terms" in item && Array.isArray((item as { terms?: { needConfirmations?: Array<{ needId: string; title: string; status: string }> } }).terms?.needConfirmations) && (item as { terms?: { needConfirmations?: Array<{ needId: string; title: string; status: string }> } }).terms!.needConfirmations!.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(item as { terms?: { needConfirmations?: Array<{ needId: string; title: string; status: string }> } }).terms!.needConfirmations!.slice(0, 4).map(conf => (
                    <Badge
                      key={conf.needId}
                      variant="outline"
                      className={`h-5 px-2 text-[10.5px] font-normal ${
                        conf.status === "CAN_SUPPORT"
                          ? "border-emerald-500/30 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300"
                          : conf.status === "NEEDS_DISCUSSION"
                            ? "border-amber-500/30 bg-amber-500/8 text-amber-800 dark:text-amber-300"
                            : "border-border text-muted-foreground"
                      }`}
                    >
                      {conf.title} · {conf.status === "CAN_SUPPORT" ? (isVi ? "Có thể hỗ trợ" : "Can support") : conf.status === "NEEDS_DISCUSSION" ? (isVi ? "Cần trao đổi" : "Discuss") : (isVi ? "Ngoài phạm vi" : "Outside scope")}
                    </Badge>
                  ))}
                </div>
              ) : null}
              {item.kind === "REQUEST" && item.status === "PENDING" && Date.now() - new Date(item.createdAt).getTime() >= 14 * 86400000 ? (
                <p className="text-[11.5px] text-amber-700 dark:text-amber-300">{t("supervisor.unanswered")}</p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 shrink-0 sm:pl-2">
            {item.kind === "REQUEST" ? (
              <>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setPreview(item)}>
                  {isIncomingProposal
                    ? (isVi ? "Xem đề nghị" : "View proposal")
                    : t(mentorshipViewer(item, userId) === "RECIPIENT" ? "supervisor.viewInvitation" : "supervisor.viewSent")}
                </Button>
                {isIncomingProposal && item.actions.accept ? (
                  <Button size="sm" className="h-8 text-xs" onClick={() => choose(item, "accept")}>
                    {isVi ? "Chấp nhận" : "Accept"}
                  </Button>
                ) : null}
                {isIncomingProposal && item.actions.decline ? (
                  <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground hover:text-foreground" onClick={() => choose(item, "decline")}>
                    {t("Decline")}
                  </Button>
                ) : null}
                {!isIncomingProposal && item.actions.cancel ? (
                  <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground hover:text-destructive" onClick={() => choose(item, "cancel")}>
                    {t("supervisor.withdraw")}
                  </Button>
                ) : null}
              </>
            ) : (
              <>
                {item.status === "ACTIVE" && (
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs font-medium" asChild>
                    <Link to={`/projects/${encodeURIComponent(currentProjectId)}?tab=chat&channel=mentors`}>
                      <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("supervisor.chat")}
                    </Link>
                  </Button>
                )}
                {item.status === "ACTIVE" && onManageAccess && (
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs font-medium" onClick={() => onManageAccess(item.mentorUser._id)}>
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("Manage sharing")}
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground" asChild>
                  <Link target="_blank" rel="noopener noreferrer" to={`/academics/${encodeURIComponent(item.mentorUser._id)}`}>
                    {t("View profile")}
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </Button>
                {(item.actions.end || (showRolesMenu && onManageRoles)) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" aria-label={`${t("supervisor.manageMentor")} ${item.mentorUser.fullName}`} title={t("supervisor.manageMentor")}>
                        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {showRolesMenu && onManageRoles && (
                        <DropdownMenuItem onSelect={() => onManageRoles()}>
                          {isVi ? "Phân vai hướng dẫn" : "Manage mentoring roles"}
                        </DropdownMenuItem>
                      )}
                      {item.actions.end && (
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => choose(item, "end")}>
                          {t("End mentorship")}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </>
            )}
          </div>
        </li>
      );
    }
    if (item.kind === "REQUEST" && item.dossier?.presentation === "BRIEF") return <li key={item.id} className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-sm font-semibold">{item.mentorUser._id === userId ? item.project?.title : item.mentorUser.fullName}</h3><p className="mt-1 text-xs text-muted-foreground">{item.mentorUser._id !== userId && `${item.project?.title} · `}{item.dossier.project.researchField}</p><p className="mt-1 text-xs text-muted-foreground">{item.requestedBy.fullName} · {new Date(item.createdAt).toLocaleDateString()}</p></div><Badge variant="secondary">{t(item.status)}</Badge></div>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => { response.reset(); setPreview(item); }}>{t(mentorshipViewer(item, userId) === "SENDER" ? "supervisor.viewSent" : "supervisor.viewInvitation")}</Button>{item.actions.cancel && <Button size="sm" variant="ghost" onClick={() => choose(item, "cancel")}>{t("Cancel request")}</Button>}{item.actions.openProject && <Button size="sm" variant="outline" asChild><Link to={item.mentorUser._id === userId ? mentorWorkspaceDestination(`/academic-support/projects/${encodeURIComponent(item.projectId)}`) : `/projects/${encodeURIComponent(item.projectId)}?tab=support`}>{t("Open project")}</Link></Button>}</div>
    </li>;
    const incomingForLecturer = item.kind === "REQUEST" && item.status === "PENDING" && item.direction === "PROJECT_TO_LECTURER" && item.mentorUser._id === userId;
    if (incomingForLecturer) {
      const rep = item.dossier?.team.representative;
      const teamSize = item.dossier?.team.teamMemberCount ?? item.project?.teamMemberCount ?? 1;
      const fieldText = item.dossier?.project.researchField || item.dossier?.project.researchAreas?.[0] || item.project?.researchField || item.project?.researchAreas?.[0];
      const supportList = item.dossier?.expectations.supportAreas ?? [];
      const createdDate = item.createdAt ? new Date(item.createdAt).toLocaleDateString("vi-VN") : undefined;
      return (
        <li key={`${item.kind}-${item.id}`} className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">
                Lecturer Dashboard / Supervision Requests · {t(mentorRoleLabelKeys[item.mentorRole ?? "UNASSIGNED"])}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">Yêu cầu hướng dẫn mới</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
                Pending
              </span>
              {item.kind === "REQUEST" && item.status === "PENDING" && Date.now() - new Date(item.createdAt).getTime() >= 14 * 86400000 && <p className="text-xs text-muted-foreground">{t("supervisor.unanswered")}</p>}
              {item.expiresAt && <span className="text-xs text-muted-foreground">{t("Expires")}: {new Date(item.expiresAt).toLocaleDateString("vi-VN")}</span>}
            </div>
          </div>

          <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-1">
            <h3 className="text-base font-semibold leading-snug text-foreground">{item.project?.title ?? t("Research project")}</h3>
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
              <span>Nhóm nghiên cứu ({teamSize} thành viên · {item.requestedBy.fullName})</span>
              {rep?.affiliationVerified && <BadgeCheck size={13} className="text-emerald-600 shrink-0" aria-hidden="true" />}
              {fieldText && <span>· {fieldText}</span>}
              {createdDate && <span>· Gửi {createdDate}</span>}
            </p>
          </div>

          {item.reviewRequired && <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">Lời mời cũ đang cần chủ dự án rà soát vị trí. Bạn chưa thể nhận cho đến khi bước này hoàn tất.</p>}

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-foreground">Thông tin giảng viên được xem</p>
              <Button variant="outline" size="sm" onClick={() => setPreview(item)}>{t("Review Invitation Dossier")}</Button>
            </div>

            <div className="space-y-2.5 rounded-xl border border-border/70 bg-background p-3.5">
              <div className="flex items-start gap-2.5">
                <FileText size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 space-y-0.5">
                  <p className="text-xs font-semibold text-foreground">Research Abstract</p>
                  <p className="line-clamp-3 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
                    {item.dossier?.project.abstract || item.project?.summary || t("The team has not shared a research abstract yet.")}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 border-t border-border/50 pt-2.5">
                <Users size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 space-y-0.5">
                  <p className="text-xs font-semibold text-foreground">Research Team</p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {rep && !rep.redacted
                      ? `Đại diện: ${rep.fullName}${[rep.institutionName, rep.programName, rep.academicYearLabel].filter(Boolean).length ? ` (${[rep.institutionName, rep.programName, rep.academicYearLabel].filter(Boolean).join(" · ")})` : ""} · Quy mô ${teamSize} thành viên`
                      : `${t("Requested by")}: ${item.requestedBy.fullName}${item.requestedBy.institutionName ? ` · ${item.requestedBy.institutionName}` : ""} · Quy mô ${teamSize} thành viên`}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 border-t border-border/50 pt-2.5">
                <Target size={16} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 space-y-1.5">
                  <p className="text-xs font-semibold text-foreground">Expected Support</p>
                  {supportList.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {supportList.map(area => (
                        <span key={area} className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                          {SUPPORT_TYPE_LABELS[area] ?? area}
                        </span>
                      ))}
                    </div>
                  )}
                  {item.message && (
                    <div className="text-xs leading-5 text-muted-foreground">
                      <span className="font-medium text-foreground/80">{t("Guidance requested")}: </span>
                      <span className="line-clamp-2">{item.message}</span>
                    </div>
                  )}
                  {Boolean(item.attachments?.length) && (
                    <p className="text-[11px] text-muted-foreground">{item.attachments!.length} tệp đính kèm trong hồ sơ</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {item.infoRequest && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs space-y-1">
              <p className="font-semibold text-amber-800 dark:text-amber-300">
                Đã gửi yêu cầu bổ sung thông tin ({new Date(item.infoRequest.requestedAt).toLocaleDateString("vi-VN")})
              </p>
              <p className="whitespace-pre-wrap text-foreground/90">{item.infoRequest.message}</p>
            </div>
          )}

          <div className="space-y-2.5 pt-1 border-t border-border/60">
            <p className="text-xs font-semibold text-foreground">Quyết định của giảng viên</p>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {item.actions.accept && (
                <div className="flex flex-col items-center justify-between gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.03] p-3.5 text-center">
                  <div className="flex flex-col items-center gap-1.5">
                    <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                    <Button size="sm" onClick={() => choose(item, "accept")}>{t("Accept")}</Button>
                  </div>
                  <p className="text-xs leading-4 text-muted-foreground">Trở thành Supervisor và truy cập theo quyền được cấp</p>
                </div>
              )}
              {item.actions.decline && (
                <div className="flex flex-col items-center justify-between gap-2 rounded-xl border border-rose-500/20 bg-rose-500/[0.02] p-3.5 text-center">
                  <div className="flex flex-col items-center gap-1.5">
                    <XCircle size={20} className="text-rose-600 dark:text-rose-400" aria-hidden="true" />
                    <Button variant="outline" size="sm" onClick={() => choose(item, "decline")}>{t("Decline")}</Button>
                  </div>
                  <p className="text-xs leading-4 text-muted-foreground">Từ chối hướng dẫn và có thể gửi lời nhắn</p>
                </div>
              )}
            </div>

            {(item.actions.requestInfo ?? item.actions.decline) && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 p-3.5">
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-xs font-semibold text-foreground">Yêu cầu bổ sung thông tin (Request More Info)</p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Giảng viên có thể yêu cầu sinh viên làm rõ Abstract, phương pháp hoặc phạm vi đề tài trước khi quyết định.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => choose(item, "request-info")}>
                  Request More Info
                </Button>
              </div>
            )}
          </div>
        </li>
      );
    }

    const tone = mentorshipStatusTone(item);
    const statusText = t(item.kind === "RELATIONSHIP" ? (item.status === "ACTIVE" ? "Mentorship active" : "Mentorship ended") : item.status);
    const roleText = t(mentorRoleLabelKeys[item.mentorRole ?? "UNASSIGNED"]);
    const kindText = t(item.kind === "REQUEST" ? (item.direction === "LECTURER_TO_PROJECT" ? "Mentorship offer" : "Mentorship request") : "Academic Mentor");
    const isMentorSide = item.mentorUser._id === userId;
    const primaryTitle = isMentorSide ? (item.project?.title ?? t("Research project")) : item.mentorUser.fullName;
    const senderInstitution = item.kind === "REQUEST"
      ? (item.dossier?.team.representative?.institutionName || item.requestedBy.institutionName)
      : undefined;
    const senderRole = item.kind === "REQUEST"
      ? formatAcademicRoleLabel(item.requestedBy.academicRole, t)
      : undefined;
    const avatarTint = tone === "emerald"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : tone === "amber"
        ? "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300"
        : "border-border bg-muted/60 text-muted-foreground";

    return (
      <li key={`${item.kind}-${item.id}`} className="mentorship-history-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-xs font-bold ${avatarTint}`} aria-hidden="true">
              {personInitials(primaryTitle)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {isMentorSide ? (
                  <h3 className="break-words text-base font-semibold leading-snug text-foreground">{primaryTitle}</h3>
                ) : (
                  <Link
                    target="_blank"
                    rel="noopener noreferrer"
                    to={`/academics/${encodeURIComponent(item.mentorUser._id)}`}
                    className="text-base font-semibold leading-snug text-foreground hover:text-primary hover:underline"
                  >
                    {primaryTitle}
                  </Link>
                )}
                <Badge variant="outline" className={`h-5 gap-1.5 px-2 text-[11px] font-medium ${statusPillStyle(tone)}`}>
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${tone === "emerald" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : "bg-muted-foreground/60"
                      }`}
                    aria-hidden="true"
                  />
                  <span>{statusText}</span>
                </Badge>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {!isMentorSide && item.project?.title ? (
                  <span className="font-medium text-foreground/85">{item.project.title}</span>
                ) : null}
                <span className="rounded-md border border-border/70 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-foreground/80">
                  {roleText}
                </span>
                <span className="text-muted-foreground/80">{kindText}</span>
                {item.kind === "RELATIONSHIP" ? (
                  <span className="inline-flex items-center gap-1">
                    <span>·</span>
                    <Calendar size={12} aria-hidden="true" />
                    <span>
                      {t("Mentoring since")} {new Date(item.startedAt).toLocaleDateString("vi-VN")}
                    </span>
                  </span>
                ) : null}
              </div>

              {!isMentorSide && (item.mentorUser.positionTitle || item.mentorUser.institutionName) ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {[item.mentorUser.positionTitle, item.mentorUser.institutionName, item.mentorUser.verifiedLecturer ? t("Verified Lecturer") : undefined].filter(Boolean).join(" · ")}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {item.kind === "REQUEST" ? (
              <Button variant="outline" size="sm" onClick={() => setPreview(item)}>
                <FileText size={14} aria-hidden="true" />
                <span>{t("Review Invitation Dossier")}</span>
              </Button>
            ) : null}
            {item.actions.cancel ? <Button variant="ghost" size="sm" onClick={() => choose(item, "cancel")}>{t("Cancel request")}</Button> : null}
            {item.actions.decline ? <Button variant="outline" size="sm" onClick={() => choose(item, "decline")}>{t("Decline")}</Button> : null}
            {item.actions.accept ? <Button size="sm" onClick={() => choose(item, "accept")}>{t("Accept")}</Button> : null}
            {item.actions.openProject ? (
              onOpen ? (
                <Button size="sm" variant={item.kind === "REQUEST" ? "default" : "outline"} onClick={() => onOpen(item.projectId)}>
                  <span>{t("Open project")}</span>
                  <ArrowUpRight size={14} aria-hidden="true" />
                </Button>
              ) : (
                <Button size="sm" variant={item.kind === "REQUEST" ? "default" : "outline"} asChild>
                  <Link to={isMentorSide ? `/academic-support/projects/${encodeURIComponent(item.projectId)}` : `/academic-support?projectId=${encodeURIComponent(item.projectId)}`}>
                    <span>{t("Open project")}</span>
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </Link>
                </Button>
              )
            ) : null}
            {item.kind === "RELATIONSHIP" && item.status === "ACTIVE" && onOpenAccess ? (
              <Button variant="outline" size="sm" onClick={onOpenAccess}>
                <ShieldCheck size={13} className="mr-1 text-primary" aria-hidden="true" />
                {t("Configure permissions & access")}
              </Button>
            ) : null}
            {item.actions.end ? <Button variant="ghost" size="sm" onClick={() => choose(item, "end")}>{t("End mentorship")}</Button> : null}
          </div>
        </div>

        {item.kind === "REQUEST" ? (
          <div className="mt-3 space-y-2.5 border-t border-border/60 pt-3">
            {item.reviewRequired ? (
              <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                Lời mời cũ đang cần chủ dự án rà soát vị trí. Bạn chưa thể nhận cho đến khi bước này hoàn tất.
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>
                {t("Requested by")}: <strong className="font-medium text-foreground">{item.requestedBy.fullName}</strong>
              </span>
              {item.dossier?.team.representative?.affiliationVerified ? (
                <BadgeCheck size={13} className="text-emerald-600 shrink-0" aria-hidden="true" />
              ) : null}
              {senderInstitution || senderRole ? (
                <span>· {[senderInstitution, senderRole].filter(Boolean).join(" · ")}</span>
              ) : null}
              <span className="inline-flex items-center gap-1">
                <span>·</span>
                <Calendar size={12} aria-hidden="true" />
                <span>{language === "vi" ? "Gửi" : "Sent"} {new Date(item.createdAt).toLocaleDateString(language === "vi" ? "vi-VN" : "en-US")}</span>
              </span>
            </div>

            {item.infoRequest ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs space-y-1">
                <p className="font-semibold text-amber-800 dark:text-amber-300">
                  Giảng viên yêu cầu làm rõ thông tin ({new Date(item.infoRequest.requestedAt).toLocaleDateString("vi-VN")})
                </p>
                <p className="whitespace-pre-wrap text-foreground/90">{item.infoRequest.message}</p>
              </div>
            ) : null}

            {item.message || item.responseNote || Boolean(item.attachments?.length) ? (
              <div className="rounded-lg border border-border/70 bg-muted/25 p-3 space-y-2">
                {item.message ? (
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t(item.direction === "PROJECT_TO_LECTURER" ? "Guidance requested" : "Message")}
                    </p>
                    <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">
                      {item.message}
                    </p>
                  </div>
                ) : null}

                {item.responseNote ? (
                  <div className={item.message ? "border-t border-border/60 pt-2" : undefined}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {language === "vi" ? "Phản hồi ghi nhận" : "Recorded response"}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
                      {item.responseNote}
                    </p>
                  </div>
                ) : null}

                {item.attachments?.length ? (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
                      <Paperclip size={12} aria-hidden="true" />
                      <span>
                        {language === "vi"
                          ? `${item.attachments.length} tệp đính kèm trong hồ sơ`
                          : `${item.attachments.length} attachment${item.attachments.length > 1 ? "s" : ""} in dossier`}
                      </span>
                    </span>
                  </div>
                ) : null}
              </div>
            ) : null}

            {item.closeReason === "MENTOR_POSITION_FILLED" ? (
              <p className="text-xs text-muted-foreground">{t("The mentor position has been filled.")}</p>
            ) : null}
            {item.status === "PENDING" && Date.now() - new Date(item.createdAt).getTime() >= 14 * 86400000 ? (
              <p role="status" className="text-xs text-muted-foreground">{t("supervisor.unanswered")}</p>
            ) : null}
            {item.status === "PENDING" && item.expiresAt ? (
              <p className="text-xs text-muted-foreground">{t("Expires")}: {new Date(item.expiresAt).toLocaleDateString("vi-VN")}</p>
            ) : null}
          </div>
        ) : null}
      </li>
    );
  })}</ul>}
    <Dialog open={action?.open ?? false} onOpenChange={open => { if (!open && !response.isPending) closeAction(); }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl" data-no-i18n><DialogHeader><DialogTitle>{action?.kind === "request-info" ? "Yêu cầu bổ sung thông tin (Request More Info)" : t(action?.kind === "accept" ? "Accept mentorship" : action?.kind === "decline" ? "Decline mentorship" : action?.kind === "end" ? "End mentorship" : "Cancel mentorship request")}</DialogTitle><DialogDescription>{action?.kind === "request-info" ? "Giảng viên có thể yêu cầu sinh viên làm rõ Abstract, phương pháp hoặc phạm vi đề tài trước khi quyết định. Lời mời vẫn giữ trạng thái Pending." : t(action?.kind === "end" ? "Mentor access will end immediately. Previous guidance remains in project history." : "Mentorship remains separate from formal academic review.")}</DialogDescription></DialogHeader>
      {action?.kind === "accept" && reviewedItem && <>
        {acceptRequest && details.isFetching && <p role="status" className="text-sm text-muted-foreground">{t("Checking the latest invitation…")}</p>}
        {acceptRequest && details.isError && <div role="alert" className="space-y-2 text-sm"><p>{t("Could not verify the current invitation. Your note is kept.")}</p><Button variant="outline" size="sm" onClick={() => void details.refetch()}>{t("Reload invitation")}</Button></div>}
        {briefChanged && <p role="status" className="text-sm leading-6">{t("The invitation has changed. Review the updated introduction and permissions before confirming.")}</p>}
        {acceptRequest && details.isSuccess && !details.data.actions.accept && <p role="alert" className="text-sm">{t("This invitation can no longer be accepted. It may have expired, been withdrawn or lost its available position.")}</p>}
        {reviewedItem.project && <MentorPreviewContent preview={reviewedItem.project} />}
        <p className="text-sm font-medium">{t(mentorRoleLabelKeys[reviewedItem.mentorRole ?? "UNASSIGNED"])}</p>
        {reviewedItem.kind === "REQUEST" && reviewedItem.dossier?.expectations && (reviewedItem.dossier.expectations.supportAreas.length > 0 || reviewedItem.dossier.expectations.expectedPeriod || reviewedItem.dossier.expectations.meetingFrequency) && (
          <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
            <p className="font-medium text-foreground">Kỳ vọng đồng hành đề xuất</p>
            <p className="text-muted-foreground">{[reviewedItem.dossier.expectations.expectedPeriod, reviewedItem.dossier.expectations.meetingFrequency, reviewedItem.dossier.expectations.expectedMilestone].filter(Boolean).join(" · ") || "Theo nhu cầu đã nêu trong hồ sơ mời."}</p>
          </div>
        )}
        {reviewedItem.kind === "REQUEST" && <>{reviewedItem.message && <div><p className="text-xs font-medium text-muted-foreground">{t(reviewedItem.direction === "PROJECT_TO_LECTURER" ? "Guidance requested" : "Message")}</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{reviewedItem.message}</p></div>}<InvitationAttachments attachments={reviewedItem.attachments ?? []} /></>}<MentorInvitationAccessNotice /><MentorPolicySummary policy={reviewedItem.accessPolicy} />
      </>}
      <label className="space-y-1.5 text-sm"><span>{action?.kind === "request-info" ? "Nội dung cần sinh viên làm rõ (ít nhất 5 ký tự) *" : t("Optional note")}</span><textarea aria-label={t("Note")} className="min-h-20 w-full rounded-md border bg-background p-3 text-sm" value={note} maxLength={1000} disabled={response.isPending} placeholder={action?.kind === "request-info" ? "Ví dụ: Nhờ nhóm làm rõ thêm Research Abstract, cỡ mẫu hoặc phương pháp đánh giá..." : undefined} onChange={e => setNote(e.target.value)} /></label>{response.error && <p role="alert" className="text-sm text-destructive">{t(mentorshipError(response.error))}</p>}<Button disabled={response.isPending || !canConfirm} onClick={confirm}>{t("Confirm")}</Button>
    </DialogContent></Dialog>
    {preview?.kind === "REQUEST" && <MentorshipInvitationViewer projectId={preview.projectId} requestId={preview.id} currentProjectId={currentProjectId} onClose={() => setPreview(undefined)} />}

  </>;
}
function MentorSearch({
  project,
  disabled,
  canInvite,
  pendingSuggestedMentorIds,
  onSuggestionSubmitted,
  onOpenSettings,
  onOpenDossier,
}: {
  project: MentorPreview;
  disabled: boolean;
  canInvite: boolean;
  pendingSuggestedMentorIds?: Set<string>;
  onSuggestionSubmitted?: (lecturerName: string) => void;
  onOpenSettings?: () => void;
  onOpenDossier?: () => void;
}) {
  const { t, language } = useI18n(), isVi = language === "vi", [filters, setFilters] = useState<AcademicSearch>({}), deferred = useDebouncedValue(filters, 300), [page, setPage] = useState(1), [selected, setSelected] = useState<AvailableMentor>();
  const [pageSize, setPageSize] = useState(6);
  const [evidenceMentor, setEvidenceMentor] = useState<AvailableMentor>();
  const [existingRequestId, setExistingRequestId] = useState<string>();
  const resultsHeading = useRef<HTMLDivElement>(null);
  const showPage = (next: number) => { setPage(next); resultsHeading.current?.scrollIntoView?.({ block: "start" }); };
  const [showFilters, setShowFilters] = useState(false);
  const [editingPreferences, setEditingPreferences] = useState(false);
  const taxonomy = useQuery({ queryKey: ["onboarding-options"], queryFn: () => authApi.academicOnboardingOptions() });
  const userId = useAuthStore(s => s.user?.id);
  const settings = useQuery({ queryKey: ["academic-support", userId, "discovery-settings", project.id], queryFn: () => academicSupportApi.settings(project.id), enabled: canInvite });
  const preferences = settings.data ?? project;
  const terms = useMemo(() => [...new Set([...preferences.researchAreas, ...preferences.expertise])], [preferences.researchAreas, preferences.expertise]);
  const search = useQuery({ queryKey: ["academic-support", userId, "mentor-search", project.id, deferred, page, pageSize], queryFn: () => academicSupportApi.mentors(project.id, { ...deferred, page, pageSize }), placeholderData: keepPreviousData });
  const lastPage = Math.max(1, search.data?.meta.totalPages ?? 1);
  const correctingPage = search.data?.meta.page === page && page > lastPage;
  useEffect(() => { if (correctingPage) setPage(lastPage); }, [correctingPage, lastPage]);
  const change = (field: keyof AcademicSearch, value: string) => { setFilters(current => ({ ...current, [field]: value || undefined })); setPage(1); };
  const filterCount = [filters.area, filters.specialization, filters.interest, filters.technology, filters.institution, filters.position].filter(Boolean).length;
  const filtered = Boolean(filters.q?.trim() || filterCount);
  const clear = () => { setFilters({}); setPage(1); };

  // Accumulate seen lecturer facets across searches so selecting a filter does not shrink available options.
  const [knownFacets, setKnownFacets] = useState<{
    areas: string[];
    interests: string[];
    institutions: string[];
    positions: string[];
  }>({ areas: [], interests: [], institutions: [], positions: [] });

  useEffect(() => {
    const items = search.data?.items;
    if (!items?.length) return;
    setKnownFacets(prev => {
      const merge = (existing: string[], incoming: Array<string | undefined>) => {
        const map = new Map<string, string>();
        for (const item of [...existing, ...incoming]) {
          const clean = item?.trim();
          if (clean && !map.has(clean.toLowerCase())) map.set(clean.toLowerCase(), clean);
        }
        return Array.from(map.values());
      };
      const areas = merge(prev.areas, items.flatMap(m => m.expertiseAreas ?? []));
      const interests = merge(prev.interests, items.flatMap(m => m.researchInterests ?? []));
      const institutions = merge(prev.institutions, items.map(m => m.institutionName));
      const positions = merge(prev.positions, items.map(m => m.positionTitle));
      if (
        areas.length === prev.areas.length &&
        interests.length === prev.interests.length &&
        institutions.length === prev.institutions.length &&
        positions.length === prev.positions.length
      ) {
        return prev;
      }
      return { areas, interests, institutions, positions };
    });
  }, [search.data?.items]);

  const areaOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const candidate of [
      ...terms,
      ...knownFacets.areas,
      ...(taxonomy.data?.researchAreas ?? []),
      filters.area ?? "",
    ]) {
      const clean = candidate.trim();
      if (clean && !map.has(clean.toLowerCase())) map.set(clean.toLowerCase(), clean);
    }
    return Array.from(map.values());
  }, [terms, knownFacets.areas, taxonomy.data?.researchAreas, filters.area]);

  const suggestedTopics = useMemo(() => {
    const topicMap = new Map<string, { name: string; isProjectTopic: boolean }>();
    terms.forEach(term => {
      const trimmed = term.trim();
      if (trimmed) {
        topicMap.set(trimmed.toLowerCase(), { name: trimmed, isProjectTopic: true });
      }
    });

    search.data?.items?.forEach(m => {
      m.matchedTerms?.forEach(term => {
        const trimmed = term.trim();
        if (trimmed && !topicMap.has(trimmed.toLowerCase())) {
          topicMap.set(trimmed.toLowerCase(), { name: trimmed, isProjectTopic: true });
        }
      });
    });

    knownFacets.areas.forEach(area => {
      const trimmed = area.trim();
      if (trimmed && !topicMap.has(trimmed.toLowerCase()) && topicMap.size < 10) {
        topicMap.set(trimmed.toLowerCase(), { name: trimmed, isProjectTopic: false });
      }
    });

    if (topicMap.size < 6 && taxonomy.data?.researchAreas) {
      taxonomy.data.researchAreas.forEach(area => {
        const trimmed = area.trim();
        if (trimmed && !topicMap.has(trimmed.toLowerCase()) && topicMap.size < 8) {
          topicMap.set(trimmed.toLowerCase(), { name: trimmed, isProjectTopic: false });
        }
      });
    }

    if (filters.area?.trim() && !topicMap.has(filters.area.trim().toLowerCase())) {
      topicMap.set(filters.area.trim().toLowerCase(), { name: filters.area.trim(), isProjectTopic: false });
    }

    return Array.from(topicMap.values());
  }, [terms, search.data?.items, knownFacets.areas, taxonomy.data?.researchAreas, filters.area]);

  const activeFilterChips: Array<{ key: keyof AcademicSearch; label: string; value: string }> = [
    ...(filters.q?.trim() ? [{ key: "q" as const, label: isVi ? "Từ khóa" : "Keyword", value: filters.q.trim() }] : []),
    ...(filters.area ? [{ key: "area" as const, label: isVi ? "Lĩnh vực" : "Area", value: filters.area }] : []),
    ...(filters.specialization ? [{ key: "specialization" as const, label: t("Research Specializations"), value: filters.specialization }] : []),
    ...(filters.technology ? [{ key: "technology" as const, label: t("Technology or skill"), value: filters.technology }] : []),
    ...(filters.interest ? [{ key: "interest" as const, label: isVi ? "Hướng NC" : "Interest", value: filters.interest }] : []),
    ...(filters.institution ? [{ key: "institution" as const, label: isVi ? "Đơn vị" : "Institution", value: filters.institution }] : []),
    ...(filters.position ? [{ key: "position" as const, label: isVi ? "Chức danh" : "Position", value: filters.position }] : []),
  ];

  const advancedFilterCount = [filters.specialization, filters.technology, filters.interest, filters.institution, filters.position].filter(Boolean).length;
  const quickTopics = suggestedTopics.slice(0, 5);
  const projectTopicSet = new Set(terms.map(item => item.trim().toLowerCase()).filter(Boolean));
  const projectAreas = areaOptions.filter(a => projectTopicSet.has(a.toLowerCase()));
  const otherAreas = areaOptions.filter(a => !projectTopicSet.has(a.toLowerCase()));
  const isSeeking = preferences.discovery === "SEEKING_MENTOR";
  const openSettingsPanel = () => {
    if (onOpenSettings) onOpenSettings();
    else setEditingPreferences(true);
  };

  return <section aria-label={t("Discover Lecturers")} className="mentor-search space-y-3">
    {settings.isError && <p role="alert" className="text-sm text-destructive">{t("Could not load mentor discovery settings.")}</p>}

    {/* Compact Research Mentoring Needs Summary & Interactive Needs Analysis */}
    <ResearchNeedsPanel
      projectId={project.id}
      canManage={canInvite}
      isSeeking={isSeeking}
      discoveryMode={preferences.discovery}
      onOpenSettings={openSettingsPanel}
      onOpenDossier={onOpenDossier}
    />

    {/* Search & Filters */}
    <div className="rounded-xl border border-border/75 bg-muted/20 px-3 py-2.5 space-y-2">
      <div className="flex flex-col md:flex-row gap-2 items-stretch md:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
          <Input
            aria-label={t("Search available mentors")}
            placeholder={isVi ? "Tìm tên giảng viên, đơn vị hoặc chuyên môn..." : "Search by lecturer name, institution, or expertise..."}
            maxLength={160}
            className="h-8.5 pl-8 pr-7 rounded-lg bg-background text-xs sm:text-[13px]"
            value={filters.q ?? ""}
            onChange={e => change("q", e.target.value)}
          />
          {filters.q && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={t("Clear search")}
              className="h-6 w-6 absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => change("q", "")}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          )}
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 shrink-0">
          <select
            aria-label={t("Research Area")}
            value={filters.area ?? ""}
            onChange={e => change("area", e.target.value)}
            className="h-8.5 w-full sm:w-[190px] rounded-lg border border-input bg-background px-2.5 text-xs font-medium text-foreground"
          >
            <option value="">{isVi ? "Tất cả lĩnh vực" : "All research areas"}</option>
            {projectAreas.length > 0 && (
              <optgroup label={isVi ? "Lĩnh vực của đề tài" : "Project research areas"}>
                {projectAreas.map(area => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </optgroup>
            )}
            {otherAreas.length > 0 && (
              <optgroup label={projectAreas.length > 0 ? (isVi ? "Lĩnh vực khác" : "Other areas") : (isVi ? "Lĩnh vực chuyên môn" : "Research areas")}>
                {otherAreas.map(area => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </optgroup>
            )}
          </select>

          <Button
            type="button"
            variant={showFilters || advancedFilterCount > 0 ? "secondary" : "outline"}
            size="sm"
            className="h-8.5 px-2.5 rounded-lg gap-1.5 font-medium text-xs shrink-0"
            aria-expanded={showFilters}
            aria-controls={`mentor-filters-${project.id}`}
            onClick={() => setShowFilters(value => !value)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{isVi ? "Bộ lọc" : "Filters"}</span>
            {advancedFilterCount > 0 && (
              <span className="h-4 min-w-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold inline-flex items-center justify-center tabular-nums">
                {advancedFilterCount}
              </span>
            )}
            <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${showFilters ? "rotate-180" : ""}`} aria-hidden="true" />
          </Button>

          {filtered && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8.5 px-2 text-xs text-muted-foreground hover:text-foreground shrink-0"
              onClick={clear}
            >
              {t("Clear filters")}
            </Button>
          )}
        </div>
      </div>

      {/* Compact Single-Line Quick Topic Pills */}
      {quickTopics.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label={t("Suggested research topics")}>
          <span className="text-[11px] font-medium text-muted-foreground shrink-0 mr-0.5">
            {isVi ? "Chủ đề:" : "Topics:"}
          </span>
          <button
            type="button"
            onClick={() => change("area", "")}
            className={`shrink-0 rounded-md px-2 py-0.5 text-[11.5px] font-medium transition-colors ${!filters.area
              ? "bg-foreground text-background"
              : "bg-background text-muted-foreground border border-border/70 hover:bg-muted hover:text-foreground"
              }`}
          >
            {isVi ? "Tất cả" : "All"}
          </button>
          {quickTopics.map(topic => {
            const isSelected = filters.area?.toLowerCase() === topic.name.toLowerCase();
            return (
              <button
                key={topic.name}
                type="button"
                onClick={() => change("area", isSelected ? "" : topic.name)}
                title={topic.isProjectTopic ? (isVi ? "Chủ đề nghiên cứu của dự án" : "Project research topic") : undefined}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11.5px] font-medium transition-colors border ${isSelected
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border/80 hover:text-foreground hover:bg-muted/50"
                  }`}
              >
                <span>{topic.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Collapsible Advanced Filters */}
      <div id={`mentor-filters-${project.id}`} hidden={!showFilters} className="pt-2.5 border-t border-border/60">
        <div className="grid gap-2.5 sm:grid-cols-3">
          {(["specialization", "technology"] as const).map(field => <label key={field} className="space-y-1 text-xs font-medium"><span className="block text-muted-foreground">{t(field === "specialization" ? "Research Specializations" : "Technology or skill")}</span><Input className="h-8 bg-background text-xs rounded-lg" value={filters[field] ?? ""} maxLength={120} onChange={event => change(field, event.target.value)} /></label>)}
          <label className="space-y-1 text-xs font-medium">
            <span className="block text-muted-foreground">{t("Research Interest")}</span>
            <div className="relative">
              <Input
                aria-label={t("Research Interest")}
                value={filters.interest ?? ""}
                list={`mentor-interest-options-${project.id}`}
                placeholder={isVi ? "VD: Machine Learning, NLP..." : "e.g. Machine Learning, NLP..."}
                maxLength={120}
                className="h-8 pr-7 bg-background text-xs rounded-lg"
                onChange={e => change("interest", e.target.value)}
              />
              {filters.interest && (
                <button
                  type="button"
                  aria-label={isVi ? "Xóa lọc hướng nghiên cứu" : "Clear interest filter"}
                  onClick={() => change("interest", "")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          </label>

          <label className="space-y-1 text-xs font-medium">
            <span className="block text-muted-foreground">{t("Institution")}</span>
            <div className="relative">
              <Input
                aria-label={t("Institution")}
                value={filters.institution ?? ""}
                list={`mentor-institution-options-${project.id}`}
                placeholder={isVi ? "VD: ĐH FPT, ĐH Bách Khoa..." : "e.g. FPT University..."}
                maxLength={200}
                className="h-8 pr-7 bg-background text-xs rounded-lg"
                onChange={e => change("institution", e.target.value)}
              />
              {filters.institution && (
                <button
                  type="button"
                  aria-label={isVi ? "Xóa lọc đơn vị công tác" : "Clear institution filter"}
                  onClick={() => change("institution", "")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          </label>

          <label className="space-y-1 text-xs font-medium">
            <span className="block text-muted-foreground">{t("Current Position")}</span>
            <div className="relative">
              <Input
                aria-label={t("Current Position")}
                value={filters.position ?? ""}
                list={`mentor-position-options-${project.id}`}
                placeholder={isVi ? "VD: Giảng viên, PGS.TS..." : "e.g. Lecturer, Assoc. Prof..."}
                maxLength={120}
                className="h-8 pr-7 bg-background text-xs rounded-lg"
                onChange={e => change("position", e.target.value)}
              />
              {filters.position && (
                <button
                  type="button"
                  aria-label={isVi ? "Xóa lọc chức danh" : "Clear position filter"}
                  onClick={() => change("position", "")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          </label>
        </div>

        <datalist id={`mentor-interest-options-${project.id}`}>
          {knownFacets.interests.map(item => <option key={item} value={item} />)}
        </datalist>
        <datalist id={`mentor-institution-options-${project.id}`}>
          {knownFacets.institutions.map(item => <option key={item} value={item} />)}
        </datalist>
        <datalist id={`mentor-position-options-${project.id}`}>
          {knownFacets.positions.map(item => <option key={item} value={item} />)}
        </datalist>
      </div>

      {/* Active Filter Summary */}
      {activeFilterChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/60 text-xs">
          <span className="text-muted-foreground font-medium mr-0.5">{isVi ? "Đang lọc:" : "Active:"}</span>
          {activeFilterChips.map(chip => (
            <button
              key={chip.key}
              type="button"
              onClick={() => change(chip.key, "")}
              aria-label={`${t("Remove filter")}: ${chip.value}`}
              className="inline-flex items-center gap-1 rounded-md border border-border/80 bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-foreground hover:border-destructive/50 hover:text-destructive transition-colors"
            >
              <span className="text-muted-foreground">{chip.label}:</span>
              <span className="max-w-[160px] truncate">{chip.value}</span>
              <X className="h-3 w-3 shrink-0" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>

    <div className="mentor-results-heading" ref={resultsHeading}>
      <div>
        <h3>
          {filtered
            ? t("Search results")
            : search.data?.items.some(m => m.recommendation?.tier === "RECOMMENDED")
              ? (isVi ? "Giảng viên được đề xuất" : "Recommended Lecturers")
              : t("Lecturers for your project")}
          {search.data && <span> ({search.data.meta.total})</span>}
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {isVi
            ? "Dựa trên nhu cầu nghiên cứu của nhóm và thông tin học thuật hiện có. Đề xuất giúp nhóm dễ tìm hiểu hơn, không phải đánh giá năng lực giảng viên."
            : "Based on your team's research needs and available academic information. Recommendations guide exploration rather than grading lecturers."}
        </p>
      </div>
    </div>

    {search.data && !filtered && search.data.items.length > 0 && !search.data.items.some(m => m.recommendation?.tier === "RECOMMENDED") && (
      <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/[0.05] px-3.5 py-2.5 text-xs leading-5 text-amber-900 dark:text-amber-200">
        {isVi
          ? "Chưa đủ thông tin để đề xuất ưu tiên giảng viên cụ thể. Hãy phân tích và xác nhận nhu cầu hướng dẫn ở khung phía trên hoặc khám phá trực tiếp danh sách giảng viên bên dưới."
          : "Not enough overlapping evidence to highlight prioritized recommendations yet. Analyze and confirm your research needs above or explore eligible lecturers below."}
      </div>
    )}

    {disabled && <p role="status" className="mentor-ranking-note">{t("The project has reached its mentor or pending request limit.")}</p>}
    {editingPreferences && <p role="status" className="mentor-ranking-note">{t("Save or cancel your preference changes before choosing a lecturer.")}</p>}
    {!canInvite && <p className="mentor-ranking-note">{t("Members can suggest lecturers. The project owner sends invitations.")}</p>}

    <div className="mentor-results" aria-busy={search.isFetching}>
      {search.isLoading && <div role="status" aria-label={t("Loading…")}>{[1, 2, 3].map(key => <div key={key} className="flex gap-4 py-4"><Skeleton className="h-12 w-12 shrink-0 rounded-full" /><div className="flex-1 space-y-2.5"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3.5 w-2/3" /><Skeleton className="h-3.5 w-1/2" /></div></div>)}</div>}
      {search.isError && <div role="alert" className="mentor-empty-state"><p className="text-sm text-destructive">{t(mentorshipError(search.error))}</p><Button variant="outline" size="sm" onClick={() => void search.refetch()}>{t("Try again")}</Button></div>}
      {search.data?.items.map(mentor => {
        const cleanName = mentor.fullName?.replace(/\([^)]*\)/g, "").replace(/\b(TS|ThS|GS|PGS|Dr|Prof)\b\.?/gi, "").trim() || mentor.fullName || "";
        const nameParts = cleanName.split(/\s+/).filter(Boolean);
        const p1 = nameParts[nameParts.length - 2] ?? "";
        const p2 = nameParts[nameParts.length - 1] ?? "";
        const initials = nameParts.length >= 2
          ? `${p1[0] ?? ""}${p2[0] ?? ""}`.toUpperCase() || "?"
          : nameParts[0]?.slice(0, 2).toUpperCase() || "?";
        const colorThemes = ["avatar-theme-indigo", "avatar-theme-emerald", "avatar-theme-amber", "avatar-theme-sky", "avatar-theme-rose", "avatar-theme-purple"];
        const themeIndex = Math.abs((mentor._id || mentor.fullName || "").split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)) % colorThemes.length;
        const avatarThemeClass = colorThemes[themeIndex];
        const isAlreadySuggested = Boolean(pendingSuggestedMentorIds?.has(mentor._id));
        const rec = mentor.recommendation;
        const isCapacityReached = Boolean(mentor.capacityReached || rec?.eligibility.currentAvailability === "CAPACITY_REACHED");
        const isRecommended = rec?.tier === "RECOMMENDED";
        const inviteDisabled = disabled || editingPreferences || search.isFetching || Boolean(mentor.mentorshipStatus) || isCapacityReached || (!canInvite && isAlreadySuggested);
        const secondaryActionLabel = isCapacityReached
          ? (isVi ? "Đã đủ chỉ tiêu" : "Capacity full")
          : canInvite
            ? t(mentor.mentorshipStatus === "PENDING" ? "supervisor.pending" : mentor.mentorshipStatus === "ACTIVE" ? "supervisor.active" : "supervisor.invite")
            : isAlreadySuggested
              ? (isVi ? "Đã đề xuất" : "Suggested")
              : t("Suggest Mentor");
        const availabilityText = isCapacityReached
          ? (isVi
              ? `Đã đủ chỉ tiêu (${mentor.activeProjectCount ?? rec?.eligibility.activeProjectCount ?? 0}/${mentor.maxActiveProjects ?? rec?.eligibility.maxActiveProjects ?? 0})`
              : "Capacity reached")
          : mentor.remainingSlots !== null && mentor.remainingSlots !== undefined
            ? (isVi ? `Đang nhận nhóm mới · còn ${mentor.remainingSlots} suất` : `Accepting teams · ${mentor.remainingSlots} left`)
            : t("supervisor.accepting");
        return (
          <article key={mentor._id} className="mentor-result">
            <div className={`mentor-avatar ${avatarThemeClass}`} aria-hidden="true">{mentor.avatarUrl ? <img src={mentor.avatarUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : initials}</div>
            <div className="mentor-result-body">
              <div className="mentor-result-header">
                <div className="mentor-result-name">
                  <Link target="_blank" rel="noopener noreferrer" to={`/academics/${encodeURIComponent(mentor._id)}`}>{mentor.fullName}</Link>
                  {Boolean(mentor.isDemo || /\bdemo\b/i.test(mentor.fullName ?? "")) && <Badge variant="outline" className="text-[11px] font-medium">{t("supervisor.demo")}</Badge>}
                  {Boolean(mentor.verifiedLecturer && !mentor.isDemo && !/\bdemo\b/i.test(mentor.fullName ?? "")) && (
                    <BadgeCheck size={16} className="text-blue-600 dark:text-blue-400 shrink-0" aria-label={t("Verified Lecturer")} />
                  )}
                  {isRecommended && (
                    <Badge variant="secondary" className="text-[10.5px] font-medium border border-primary/25 bg-primary/10 text-primary">
                      {isVi ? "Được đề xuất" : "Recommended"}
                    </Badge>
                  )}
                  {isAlreadySuggested && (
                    <Badge variant="outline" className="text-[11px] border-amber-300 bg-amber-50/70 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                      {canInvite ? (isVi ? "Thành viên đã đề xuất" : "Suggested by member") : (isVi ? "Đã đề xuất" : "Suggested")}
                    </Badge>
                  )}
                </div>
              </div>

              {(mentor.positionTitle || mentor.institutionName) && (
                <p className="mentor-academic-meta">
                  <Building2 size={13} className="text-muted-foreground shrink-0" aria-hidden="true" />
                  <span>
                    {mentor.positionTitle ? `${mentor.positionTitle} · ` : ""}
                    {mentor.institutionName}
                  </span>
                  {mentor.sameInstitution && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground/80">
                      {isVi ? "Cùng đơn vị" : "Same institution"}
                    </span>
                  )}
                </p>
              )}

              {/* Explainable Recommendation Decision-Support Summary */}
              {rec ? (
                <div className="mt-2 space-y-1 text-xs leading-5">
                  <p className="font-medium text-foreground">{rec.primaryHeadline}</p>
                  {rec.academicEvidenceHighlight && (
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground/80">{isVi ? "Căn cứ học thuật: " : "Academic evidence: "}</span>
                      {rec.academicEvidenceHighlight}
                    </p>
                  )}
                  {rec.declaredSupportHighlight && (
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground/80">{isVi ? "Phạm vi khai báo: " : "Declared support: "}</span>
                      {rec.declaredSupportHighlight}
                    </p>
                  )}
                  {rec.remainingDiscussionHighlight && (
                    <p className="text-amber-800 dark:text-amber-300/90">
                      {rec.remainingDiscussionHighlight}
                    </p>
                  )}
                  {rec.complementaryNote && (
                    <p className="text-blue-700 dark:text-blue-300">{rec.complementaryNote}</p>
                  )}
                </div>
              ) : (
                <div className="mentor-expertise-clean">
                  {mentor.expertiseAreas.length > 0 && (
                    <div className="mentor-field-group">
                      <span className="mentor-field-label-sub">{t("Areas of expertise")}:</span>
                      <div className="mentor-chips-wrap">
                        {mentor.expertiseAreas.slice(0, 4).map(term => (
                          <span key={term} className="mentor-tag-neutral">{term}</span>
                        ))}
                        {mentor.expertiseAreas.length > 4 && (
                          <span className="mentor-tag-more" title={mentor.expertiseAreas.slice(4).join(" · ")}>
                            +{mentor.expertiseAreas.length - 4}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {mentor.pendingRequestDirection === "LECTURER_TO_PROJECT" && mentor.pendingRequestId && (
                <div role="status" className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/35 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-900 dark:text-amber-200">
                  <span>
                    {isVi
                      ? "Giảng viên này đã gửi đề nghị hướng dẫn nhóm của bạn."
                      : "This lecturer has already sent a mentorship proposal to your team."}
                  </span>
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setExistingRequestId(mentor.pendingRequestId)}>
                    {isVi ? "Xem đề nghị" : "View proposal"}
                  </Button>
                </div>
              )}
            </div>

            <div className="mentor-result-actions">
              <span className={`mentor-available ${isCapacityReached ? "text-amber-700 dark:text-amber-300" : ""}`}>
                <span className={`mentor-avail-dot ${isCapacityReached ? "!bg-amber-500" : ""}`} aria-hidden="true" />
                <span>{availabilityText}</span>
              </span>
              <div className="mentor-card-cta-group">
                <Button variant="outline" size="sm" className="mentor-profile-primary" onClick={() => setEvidenceMentor(mentor)}>
                  <span>{rec ? (isVi ? "Xem phân tích đề xuất" : "Recommendation analysis") : t("View matching evidence")}</span>
                </Button>
                <Button size="sm" variant="secondary" className="mentor-action-cta" disabled={inviteDisabled} onClick={() => setSelected(mentor)}>
                  {secondaryActionLabel}
                </Button>
              </div>
              <div className="mentor-secondary-actions">
                <Button variant="ghost" size="sm" className="mentor-evidence-btn gap-1" asChild>
                  <Link target="_blank" rel="noopener noreferrer" to={`/academics/${encodeURIComponent(mentor._id)}`}>
                    <span>{t("View profile")}</span>
                    <ArrowUpRight size={13} aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </div>
          </article>
        );
      })}
      {search.data && !search.isError && !correctingPage && !search.data.items.length && (
        <div className="mentor-empty-state">
          <span className="mentor-empty-state-icon" aria-hidden="true"><Search size={20} /></span>
          <h4 className="text-sm font-semibold text-foreground">{t(filtered ? "No available Mentors match these filters." : "No lecturers are available right now.")}</h4>
          <p className="max-w-md text-xs leading-5 text-muted-foreground">{t(filtered ? "Try a broader search or remove a filter." : "Lecturers appear here when they are verified and accepting new teams.")}</p>
          {filtered && <Button variant="outline" size="sm" onClick={clear}>{t("Clear filters")}</Button>}
        </div>
      )}
    </div>
    {Boolean(search.data?.items.length) && <p className="text-xs text-muted-foreground pt-1">{t("Shared terms explain relevance, not verified expertise or mentoring quality.")}</p>}
    {search.data && !search.isError && !correctingPage && <MentorSearchPagination meta={search.data.meta} busy={search.isFetching} onPage={showPage} onPageSize={size => { setPageSize(size); showPage(1); }} />}
    {evidenceMentor && (
      <MentorMatchEvidenceDialog
        projectId={project.id}
        mentor={evidenceMentor}
        canInvite={canInvite && !disabled && !editingPreferences}
        onInvite={m => setSelected(m)}
        onClose={() => setEvidenceMentor(undefined)}
      />
    )}
    {existingRequestId && <MentorshipInvitationViewer projectId={project.id} requestId={existingRequestId} currentProjectId={project.id} onClose={() => setExistingRequestId(undefined)} />}
    {selected && (canInvite ? <SupervisorInvitationForm project={project} mentor={selected} onClose={() => setSelected(undefined)} /> : <SuggestMentorDialog project={project} mentor={selected} onClose={() => setSelected(undefined)} onSubmitted={name => onSuggestionSubmitted?.(name)} />)}
    <Dialog open={editingPreferences} onOpenChange={async open => { if (open || await canLeaveWorkspace()) setEditingPreferences(open); }}><DialogContent className="mentor-preferences-dialog max-h-[88dvh] overflow-y-auto sm:max-w-2xl" data-no-i18n><DialogHeader className="pr-6 text-left"><DialogTitle>{t("Mentoring Settings")}</DialogTitle><DialogDescription>{t("Saved fields and expertise are used to rank lecturers. Describe the support you need in your invitation.")}</DialogDescription></DialogHeader>{editingPreferences && <MentorDiscoverySettings projectId={project.id} startEditing onDone={() => setEditingPreferences(false)} />}</DialogContent></Dialog>
  </section>;
}
type SupportPanelTab = "find" | "requests" | "mentors";
type RequestSubTab = "incoming" | "outgoing" | "suggestions" | "history";
type HistoryStatusFilter = "all" | "accepted" | "declined" | "closed";

function resolveSupportPanelTab(value: string | null): SupportPanelTab {
  if (value === "mentors" || value === "access" || value === "permissions") return "mentors";
  if (value === "requests") return "requests";
  return "find";
}

export function MentorProjectPanel({ projectId }: { projectId: string }) {
  const userId = useAuthStore(s => s.user?.id), { t, language } = useI18n();
  const isVi = language === "vi";
  const [params, setParams] = useSearchParams();
  const initialView = params.get("view");
  const [tab, setTab] = useState<SupportPanelTab>(() => resolveSupportPanelTab(initialView));
  const [requestSubTab, setRequestSubTab] = useState<RequestSubTab>("incoming");
  const [historyFilter, setHistoryFilter] = useState<HistoryStatusFilter>("all");
  const [historyPage, setHistoryPage] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dossierOpen, setDossierOpen] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [sharingDialogOpen, setSharingDialogOpen] = useState(initialView === "access" || initialView === "permissions");
  const [focusedAccessMentorId, setFocusedAccessMentorId] = useState<string>();
  const [rolesDialogOpen, setRolesDialogOpen] = useState(false);
  const [suggestedMentor, setSuggestedMentor] = useState<AvailableMentor>();
  const [selectedApplicant, setSelectedApplicant] = useState<MentorshipApplicationView>();
  const [planned, setPlanned] = useState<{ candidate: MentorPlanCandidate; version: number }>();
  const [openInitialInvite, setOpenInitialInvite] = useState(true);
  const initialMentorId = params.get("inviteMentor");
  const initialMentor = useQuery({ queryKey: ["academic-profile", userId, "invitation-recipient", initialMentorId], queryFn: () => academicProfileApi.publicProfile(initialMentorId!), enabled: Boolean(initialMentorId && openInitialInvite), retry: false });
  const [recentSuggestionNotice, setRecentSuggestionNotice] = useState<string | null>(null);
  const workspace = useQuery({ queryKey: ["academic-support", userId, "workspace", projectId], queryFn: () => academicSupportApi.workspace(projectId) });
  const list = useQuery({ queryKey: ["academic-support", userId, "project", projectId, 1], queryFn: () => academicSupportApi.list(projectId, { page: 1, pageSize: 30 }) });
  const historyList = useQuery({
    queryKey: ["academic-support", userId, "project-history", projectId, historyPage],
    queryFn: () => academicSupportApi.list(projectId, { page: historyPage, view: "history" }),
    enabled: Boolean(userId && tab === "requests" && requestSubTab === "history"),
    placeholderData: historyPage > 1 ? keepPreviousData : undefined,
  });
  const applicantsQuery = useQuery({
    queryKey: ["academic-support", userId, "project-applicants-count", projectId],
    queryFn: () => mentorshipApplicationsApi.list(projectId, 1),
    enabled: Boolean(userId && workspace.data?.canManage),
    retry: false,
  });
  const pendingSuggestionsQuery = useQuery({
    queryKey: ["academic-support", userId, "pending-suggestions-lookup", projectId],
    queryFn: () => academicSupportApi.suggestions?.(projectId, 1, "pending") ?? Promise.resolve({ items: [], meta: { page: 1, pageSize: 30, total: 0, totalPages: 0 } }),
    enabled: Boolean(userId && workspace.data?.accessRole === "TEAM" && workspace.data?.canProvideFeedback && academicSupportApi.suggestions),
  });
  const pendingSuggestedMentorIds = useMemo(
    () => new Set((pendingSuggestionsQuery.data?.items ?? []).map(item => item.mentorUser._id)),
    [pendingSuggestionsQuery.data?.items],
  );
  useEffect(() => {
    const v = params.get("view");
    setTab(resolveSupportPanelTab(v));
    if (v === "access" || v === "permissions") {
      setSharingDialogOpen(true);
    }
    setHistoryPage(1);
  }, [projectId, params]);

  if (workspace.isLoading) {
    return (
      <div className="mentor-workspace space-y-5" role="status" aria-label={t("Loading academic support…")}>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-10 w-96" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
    );
  }
  if (!workspace.data) {
    return (
      <div role="alert" className="mentor-workspace space-y-3 text-sm text-muted-foreground">
        <p>{t("Academic Support is available to the project team and active verified mentors.")}</p>
        <Button variant="outline" size="sm" onClick={() => void workspace.refetch()}>{t("Try again")}</Button>
      </div>
    );
  }

  const data = workspace.data;
  const canFind = data.accessRole === "TEAM" && data.canProvideFeedback;
  const activeTab: SupportPanelTab = canFind ? tab : tab === "requests" ? "requests" : "mentors";
  const unavailable = !list.data || list.isError || !data.canProvideFeedback;

  const activeRelationships = (list.data?.relationships ?? []).filter(item => item.status === "ACTIVE");
  const endedRelationships = (list.data?.relationships ?? []).filter(item => item.status !== "ACTIVE");
  const pendingRequests = (list.data?.requests ?? []).filter(item => item.status === "PENDING");
  const incomingProposals = pendingRequests.filter(item => item.direction === "LECTURER_TO_PROJECT");
  const outgoingInvitations = pendingRequests.filter(item => item.direction === "PROJECT_TO_LECTURER");
  const pendingApplicantsCount = (applicantsQuery.data?.items ?? []).filter(item => ["APPLIED", "SHORTLISTED"].includes(item.status)).length;
  const pendingSuggestionsCount = pendingSuggestionsQuery.data?.counts?.pending ?? pendingSuggestionsQuery.data?.items.length ?? 0;

  const incomingActionCount = incomingProposals.length + (data.canManage ? pendingApplicantsCount : 0);
  const outgoingPendingCount = outgoingInvitations.length;
  const requestsTabCount = incomingActionCount + outgoingPendingCount + (data.canManage ? pendingSuggestionsCount : 0);
  const activeMentorsCount = list.data?.counts.active ?? activeRelationships.length;

  const rawHistoryRequests = (historyList.data?.requests ?? list.data?.requests ?? []).filter(item => item.status !== "PENDING");
  const filteredHistoryRequests = rawHistoryRequests.filter(item => {
    if (historyFilter === "accepted") return item.status === "ACCEPTED";
    if (historyFilter === "declined") return item.status === "DECLINED";
    if (historyFilter === "closed") return !["ACCEPTED", "DECLINED"].includes(item.status);
    return true;
  });

  const focusedMentorName = activeRelationships.find(r => r.mentorUser._id === focusedAccessMentorId)?.mentorUser.fullName;

  const changeTab = async (next: SupportPanelTab, focus = false) => {
    if (next !== activeTab && !await canLeaveWorkspace()) return;
    setTab(next);
    setParams(current => {
      const nextParams = new URLSearchParams(current);
      nextParams.set("view", next);
      return nextParams;
    }, { replace: true });
    if (focus) document.getElementById(`mentor-${next}-tab-${projectId}`)?.focus();
  };

  const visibleTabs: SupportPanelTab[] = canFind ? ["find", "requests", "mentors"] : ["mentors", "requests"];

  return <TooltipProvider delayDuration={200}><section className="mentor-workspace space-y-4" data-no-i18n>
    {workspace.isError && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive flex flex-wrap items-center justify-between gap-2"><p>{t("Academic Support is available to the project team and active verified mentors.")}</p><Button variant="outline" size="sm" onClick={() => void workspace.refetch()}>{t("Try again")}</Button></div>}

    {/* Persistent Shared Header & 3-Tab Shell */}
    <header className="border-b border-border/70 pb-3.5 space-y-3">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <GraduationCap className="h-4.5 w-4.5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold tracking-tight text-foreground leading-tight truncate">
              {t("Research Mentoring")}
            </h2>
            <p className="text-xs text-muted-foreground leading-snug truncate">
              {t("Research mentoring subtitle")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {data.accessRole === "MENTOR" && (
            <Button asChild variant="outline" size="sm" className="h-8 text-xs font-medium">
              <Link to={`/projects/${encodeURIComponent(projectId)}/plan-review`}>{t("Open shared plan and questions")}</Link>
            </Button>
          )}
          {data.accessRole === "TEAM" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs font-medium"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t("Mentoring Settings")}</span>
            </Button>
          )}
          {data.canManage && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setShowPlan(true)}
            >
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t("Recruitment Plan")}</span>
            </Button>
          )}
        </div>
      </div>

      <div
        role="tablist"
        aria-label={t("Project mentorship")}
        className="mentor-workspace-tabs"
        onKeyDown={event => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const curIdx = visibleTabs.indexOf(activeTab);
          const nextIdx = event.key === "Home"
            ? 0
            : event.key === "End"
              ? visibleTabs.length - 1
              : event.key === "ArrowLeft"
                ? (curIdx - 1 + visibleTabs.length) % visibleTabs.length
                : (curIdx + 1) % visibleTabs.length;
          const targetTab = visibleTabs[nextIdx];
          if (targetTab) void changeTab(targetTab, true);
        }}
      >
        {canFind && (
          <button
            type="button"
            role="tab"
            id={`mentor-find-tab-${projectId}`}
            aria-selected={activeTab === "find"}
            aria-controls={`mentor-find-panel-${projectId}`}
            tabIndex={activeTab === "find" ? 0 : -1}
            onClick={() => void changeTab("find")}
          >
            <Search size={14} aria-hidden="true" />
            <span>{t("Discover Lecturers")}</span>
          </button>
        )}
        <button
          type="button"
          role="tab"
          id={`mentor-requests-tab-${projectId}`}
          aria-selected={activeTab === "requests"}
          aria-controls={`mentor-requests-panel-${projectId}`}
          tabIndex={activeTab === "requests" ? 0 : -1}
          onClick={() => void changeTab("requests")}
        >
          <Mail size={14} aria-hidden="true" />
          <span>{t("Invitations & Proposals")}</span>
          {requestsTabCount > 0 && <span className="mentor-tab-count">{requestsTabCount}</span>}
        </button>
        <button
          type="button"
          role="tab"
          id={`mentor-mentors-tab-${projectId}`}
          aria-selected={activeTab === "mentors"}
          aria-controls={`mentor-mentors-panel-${projectId}`}
          tabIndex={activeTab === "mentors" ? 0 : -1}
          onClick={() => void changeTab("mentors")}
        >
          <Users size={14} aria-hidden="true" />
          <span>{t("Team Mentors")}</span>
          {activeMentorsCount > 0 && <span className="mentor-tab-count">{activeMentorsCount}</span>}
        </button>
      </div>
    </header>

    {initialMentorId && openInitialInvite && initialMentor.isError && <p role="alert">{t("supervisor.loadError")}</p>}
    {initialMentorId && openInitialInvite && data.canManage && initialMentor.data && (
      <SupervisorInvitationForm
        project={data.project}
        mentor={{ _id: initialMentorId, fullName: initialMentor.data.displayName, avatarUrl: initialMentor.data.avatarUrl, institutionName: initialMentor.data.affiliation.institutionName, expertiseAreas: initialMentor.data.expertiseAreas }}
        onClose={() => { setOpenInitialInvite(false); setParams(current => { const next = new URLSearchParams(current); next.delete("inviteMentor"); return next; }, { replace: true }); }}
      />
    )}
    {suggestedMentor && <SupervisorInvitationForm project={data.project} mentor={suggestedMentor} onClose={() => setSuggestedMentor(undefined)} />}
    {planned && <ConsentComposer project={data.project} mentor={{ _id: planned.candidate.mentorUserId, fullName: planned.candidate.fullName }} planned={planned} onClose={() => setPlanned(undefined)} />}
    {selectedApplicant && (
      <ConsentComposer
        project={data.project}
        mentor={{ _id: selectedApplicant.lecturer.id, fullName: selectedApplicant.lecturer.name, verifiedLecturer: selectedApplicant.lecturer.verifiedLecturer }}
        application={{ id: selectedApplicant.id, version: selectedApplicant.version }}
        onClose={() => setSelectedApplicant(undefined)}
      />
    )}

    {/* TAB 1: Khám phá giảng viên (Discover Lecturers) */}
    {canFind && (
      <div role="tabpanel" id={`mentor-find-panel-${projectId}`} aria-labelledby={`mentor-find-tab-${projectId}`} hidden={activeTab !== "find"} className="space-y-3">
        {recentSuggestionNotice && !data.canManage && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/30 px-4 py-2.5 text-xs sm:text-sm text-emerald-900 dark:text-emerald-200">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <span>
                {isVi
                  ? <>Đã gửi đề xuất <strong>{recentSuggestionNotice}</strong> đến chủ dự án. Giảng viên chưa nhận được lời mời.</>
                  : <>Suggested <strong>{recentSuggestionNotice}</strong> to the project owner. No invitation has been sent to the lecturer.</>}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => { setRequestSubTab("suggestions"); void changeTab("requests"); }}
              >
                {isVi ? "Xem đề xuất của tôi" : "View my suggestions"}
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" aria-label={isVi ? "Đóng thông báo" : "Dismiss"} onClick={() => setRecentSuggestionNotice(null)}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
        <MentorSearch
          key={projectId}
          project={data.project}
          canInvite={data.canManage}
          disabled={unavailable}
          pendingSuggestedMentorIds={pendingSuggestedMentorIds}
          onSuggestionSubmitted={name => setRecentSuggestionNotice(name)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenDossier={data.canManage ? () => setDossierOpen(true) : undefined}
        />
      </div>
    )}

    {/* TAB 2: Lời mời & đề nghị (Invitations & Proposals) */}
    <div role="tabpanel" id={`mentor-requests-panel-${projectId}`} aria-labelledby={`mentor-requests-tab-${projectId}`} hidden={activeTab !== "requests"} className="mentor-requests-panel space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label={t("Invitations & Proposals")} className="mentor-subtabs">
          <button
            type="button"
            role="tab"
            aria-selected={requestSubTab === "incoming"}
            onClick={() => setRequestSubTab("incoming")}
          >
            <Inbox size={13} aria-hidden="true" />
            <span>{isVi ? "Đề nghị đến" : "Incoming Proposals"}</span>
            {incomingActionCount > 0 && <span className="mentor-tab-count">{incomingActionCount}</span>}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={requestSubTab === "outgoing"}
            onClick={() => setRequestSubTab("outgoing")}
          >
            <Send size={13} aria-hidden="true" />
            <span>{isVi ? "Lời mời đã gửi" : "Sent Invitations"}</span>
            {outgoingPendingCount > 0 && <span className="mentor-tab-count">{outgoingPendingCount}</span>}
          </button>
          {data.accessRole === "TEAM" && (
            <button
              type="button"
              role="tab"
              aria-selected={requestSubTab === "suggestions"}
              onClick={() => setRequestSubTab("suggestions")}
            >
              <Sparkles size={13} aria-hidden="true" />
              <span>{isVi ? "Đề xuất nội bộ" : "Team Suggestions"}</span>
              {pendingSuggestionsCount > 0 && <span className="mentor-tab-count">{pendingSuggestionsCount}</span>}
            </button>
          )}
          <button
            type="button"
            role="tab"
            aria-selected={requestSubTab === "history"}
            onClick={() => setRequestSubTab("history")}
          >
            <History size={13} aria-hidden="true" />
            <span>{isVi ? "Lịch sử" : "History"}</span>
          </button>
        </div>
      </div>

      {list.isLoading && <Skeleton className="h-36 w-full rounded-xl" />}
      {list.isError && (
        <div role="alert" className="mentor-empty-state">
          <p className="text-sm text-destructive">{t("Unable to load mentorship requests.")}</p>
          <Button size="sm" variant="outline" onClick={() => void list.refetch()}>{t("Try again")}</Button>
        </div>
      )}

      {!list.isLoading && !list.isError && requestSubTab === "incoming" && (
        <div className="space-y-4">
          {incomingProposals.length > 0 && (
            <MentorshipList items={incomingProposals} currentProjectId={projectId} variant="pending" showEmpty={false} />
          )}
          {data.canManage && pendingApplicantsCount > 0 && (
            <MentorshipApplicantPool projectId={projectId} onInvite={setSelectedApplicant} />
          )}
          {incomingProposals.length === 0 && (!data.canManage || pendingApplicantsCount === 0) && (
            <div className="mentor-empty-state">
              <span className="mentor-empty-state-icon" aria-hidden="true"><Inbox size={20} /></span>
              <h3 className="text-sm font-semibold text-foreground">
                {isVi ? "Chưa có đề nghị hướng dẫn từ giảng viên" : "No incoming lecturer proposals yet"}
              </h3>
              <p className="max-w-md text-xs leading-5 text-muted-foreground">
                {isVi
                  ? "Khi bạn bật chế độ tìm cố vấn, giảng viên đã xác minh có thể xem hồ sơ nhóm và chủ động gửi đề nghị hướng dẫn tại đây."
                  : "When mentor discovery is enabled, verified lecturers can review your team dossier and send mentorship proposals here."}
              </p>
              {data.accessRole === "TEAM" && (
                <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setSettingsOpen(true)}>
                    {t("Mentoring Settings")}
                  </Button>
                  {canFind && (
                    <Button type="button" size="sm" variant="ghost" onClick={() => void changeTab("find")}>
                      {t("Discover Lecturers")}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!list.isLoading && !list.isError && requestSubTab === "outgoing" && (
        <div className="space-y-3">
          {outgoingInvitations.length > 0 ? (
            <MentorshipList items={outgoingInvitations} currentProjectId={projectId} variant="pending" showEmpty={false} />
          ) : (
            <div className="mentor-empty-state">
              <span className="mentor-empty-state-icon" aria-hidden="true"><Send size={20} /></span>
              <h3 className="text-sm font-semibold text-foreground">
                {isVi ? "Chưa có lời mời hướng dẫn đang chờ" : "No pending outgoing invitations"}
              </h3>
              <p className="max-w-md text-xs leading-5 text-muted-foreground">
                {isVi
                  ? "Các lời mời chính thức nhóm đã gửi tới giảng viên và đang chờ phản hồi sẽ hiển thị tại đây."
                  : "Official invitations sent by your project owner that are awaiting a lecturer response appear here."}
              </p>
              {canFind && (
                <Button type="button" size="sm" variant="outline" onClick={() => void changeTab("find")}>
                  {t("Discover Lecturers")}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {!list.isLoading && !list.isError && requestSubTab === "suggestions" && data.accessRole === "TEAM" && (
        <div className="space-y-3">
          {data.canManage ? (
            pendingSuggestionsCount > 0 || (pendingSuggestionsQuery.data?.counts?.total ?? 0) > 0 ? (
              <OwnerMentorSuggestionsInbox
                projectId={projectId}
                disabled={unavailable}
                onOpenPlan={() => setShowPlan(true)}
                onInvite={setSuggestedMentor}
              />
            ) : (
              <div className="mentor-empty-state">
                <span className="mentor-empty-state-icon" aria-hidden="true"><Sparkles size={20} /></span>
                <h3 className="text-sm font-semibold text-foreground">
                  {isVi ? "Chưa có đề xuất nội bộ từ thành viên" : "No internal team suggestions yet"}
                </h3>
                <p className="max-w-md text-xs leading-5 text-muted-foreground">
                  {isVi
                    ? "Các thành viên trong nhóm có thể đề xuất giảng viên phù hợp để chủ dự án xem xét trước khi gửi lời mời chính thức."
                    : "Project members can suggest lecturers here for the project owner to review before sending an official invitation."}
                </p>
              </div>
            )
          ) : (
            <MemberMentorSuggestionsList projectId={projectId} />
          )}
        </div>
      )}

      {!list.isLoading && !list.isError && requestSubTab === "history" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {([
              { key: "all", label: isVi ? "Tất cả" : "All" },
              { key: "accepted", label: isVi ? "Đã chấp thuận" : "Accepted" },
              { key: "declined", label: isVi ? "Đã từ chối" : "Declined" },
              { key: "closed", label: isVi ? "Thu hồi / Hết hạn" : "Withdrawn / Closed" },
            ] as const).map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setHistoryFilter(opt.key)}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors border ${historyFilter === opt.key
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-muted-foreground border-border/80 hover:text-foreground"
                  }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {historyList.isLoading ? (
            <Skeleton className="h-28 w-full rounded-xl" />
          ) : historyList.isError ? (
            <div role="alert" className="mentor-empty-state">
              <p className="text-sm text-destructive">{t("Unable to load mentorship requests.")}</p>
              <Button size="sm" variant="outline" onClick={() => void historyList.refetch()}>{t("Try again")}</Button>
            </div>
          ) : filteredHistoryRequests.length > 0 ? (
            <div className="rounded-xl border border-border/80 bg-card overflow-hidden">
              <MentorshipList items={filteredHistoryRequests} currentProjectId={projectId} variant="history" showEmpty={false} />
            </div>
          ) : (
            <div className="mentor-empty-state">
              <span className="mentor-empty-state-icon" aria-hidden="true"><History size={20} /></span>
              <h3 className="text-sm font-semibold text-foreground">
                {isVi ? "Chưa có lịch sử lời mời hoặc đề nghị" : "No request history yet"}
              </h3>
              <p className="max-w-md text-xs leading-5 text-muted-foreground">
                {isVi
                  ? "Các lời mời và đề nghị đã chấp thuận, từ chối, thu hồi hoặc hết hạn sẽ được lưu tại đây."
                  : "Accepted, declined, withdrawn, and expired invitations or proposals are recorded here."}
              </p>
            </div>
          )}

          <Pager meta={historyList.data?.requestMeta} onPage={setHistoryPage} />
        </div>
      )}
    </div>

    {/* TAB 3: Cố vấn của nhóm (Team Mentors) */}
    <div role="tabpanel" id={`mentor-mentors-panel-${projectId}`} aria-labelledby={`mentor-mentors-tab-${projectId}`} hidden={activeTab !== "mentors"} className="space-y-4">
      {list.isLoading && <Skeleton className="h-36 w-full rounded-xl" />}
      {list.isError && (
        <div role="alert" className="mentor-empty-state">
          <p className="text-sm text-destructive">{t("Unable to load mentorship requests.")}</p>
          <Button size="sm" variant="outline" onClick={() => void list.refetch()}>{t("Try again")}</Button>
        </div>
      )}

      {!list.isLoading && !list.isError && (
        <>
          {activeRelationships.length === 0 ? (
            <div className="mentor-empty-state">
              <span className="mentor-empty-state-icon" aria-hidden="true"><GraduationCap size={22} /></span>
              <h3 className="text-sm font-semibold text-foreground">
                {isVi ? "Chưa có cố vấn đang hướng dẫn" : "No active mentors yet"}
              </h3>
              <p className="max-w-md text-xs leading-5 text-muted-foreground">
                {isVi
                  ? "Khi lời mời hoặc đề nghị hướng dẫn được hai bên chấp thuận, cố vấn sẽ hiển thị tại đây để nhóm trao đổi và quản lý tài liệu chia sẻ."
                  : "Once an invitation or proposal is accepted by both sides, active mentors appear here for messaging and shared resource management."}
              </p>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                {canFind && (
                  <Button type="button" size="sm" onClick={() => void changeTab("find")}>
                    {t("Discover Lecturers")}
                  </Button>
                )}
                {requestsTabCount > 0 && (
                  <Button type="button" size="sm" variant="outline" onClick={() => void changeTab("requests")}>
                    {isVi ? `Xem lời mời đang chờ (${requestsTabCount})` : `View pending requests (${requestsTabCount})`}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/85">
                    {isVi ? `Cố vấn đang hướng dẫn (${activeRelationships.length})` : `Active Mentors (${activeRelationships.length})`}
                  </h3>
                </div>
                {data.canManage && activeRelationships.length >= 2 && (
                  <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => setRolesDialogOpen(true)}>
                    {isVi ? "Phân vai hướng dẫn" : "Manage mentoring roles"}
                  </Button>
                )}
              </div>

              <MentorshipList
                items={activeRelationships}
                currentProjectId={projectId}
                variant="active"
                showEmpty={false}
                showRolesMenu={data.canManage && activeRelationships.length >= 2}
                onManageRoles={() => setRolesDialogOpen(true)}
                onManageAccess={data.canManage ? mentorUserId => {
                  setFocusedAccessMentorId(mentorUserId);
                  setSharingDialogOpen(true);
                } : undefined}
              />
            </div>
          )}

          {(endedRelationships.length > 0 || data.guidance.length > 0) && (
            <details className="group rounded-xl border border-border/80 bg-muted/15 overflow-hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-xs font-semibold text-foreground/90 hover:bg-muted/35 transition-colors">
                <span className="inline-flex items-center gap-2">
                  <History className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  <span>{isVi ? "Lịch sử hướng dẫn" : "Mentoring history"}</span>
                  {endedRelationships.length > 0 && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                      {endedRelationships.length}
                    </span>
                  )}
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="border-t border-border/70 bg-card space-y-3">
                {endedRelationships.length > 0 && (
                  <MentorshipList items={endedRelationships} currentProjectId={projectId} variant="history" showEmpty={false} />
                )}
                {data.guidance.length > 0 && (
                  <div className="px-4 py-3 border-t border-border/60">
                    <MentorGuidance projectId={projectId} data={{ ...data, canProvideFeedback: false }} />
                  </div>
                )}
              </div>
            </details>
          )}
        </>
      )}
    </div>

    {/* Unified Mentoring Settings, Team Dossier & Personal Consent Dialog */}
    <Dialog open={settingsOpen} onOpenChange={async open => { if (open || await canLeaveWorkspace()) setSettingsOpen(open); }}>
      <DialogContent className="mentor-preferences-dialog max-h-[90dvh] overflow-y-auto sm:max-w-2xl" data-no-i18n>
        <DialogHeader className="pr-6 text-left">
          <DialogTitle>{t("Mentoring Settings")}</DialogTitle>
          <DialogDescription>
            {data.canManage
              ? (isVi
                ? "Thiết lập nhu cầu hướng dẫn, chế độ hiển thị với giảng viên và quyền chia sẻ hồ sơ cá nhân của bạn."
                : "Configure mentoring needs, team discovery visibility, and your personal profile sharing consent.")
              : (isVi
                ? "Quản lý quyền chia sẻ hồ sơ học thuật cá nhân của bạn khi nhóm tìm cố vấn."
                : "Manage your personal Academic Profile sharing consent for mentor discovery.")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {data.canManage && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/25 px-3.5 py-2.5 text-xs">
              <span className="text-muted-foreground">
                {isVi ? "Kiểm tra chính xác nội dung giảng viên sẽ nhìn thấy về nhóm." : "Preview exactly what eligible lecturers will see about your team."}
              </span>
              <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5 text-xs shrink-0" onClick={() => setDossierOpen(true)}>
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{isVi ? "Xem hồ sơ nhóm" : "Preview team dossier"}</span>
              </Button>
            </div>
          )}
          {data.canManage && (
            <MentorDiscoverySettings projectId={projectId} startEditing onDone={() => setSettingsOpen(false)} />
          )}
          {data.accessRole === "TEAM" && (
            <MemberProfileConsentCard projectId={projectId} />
          )}
        </div>
      </DialogContent>
    </Dialog>

    {dossierOpen && data.canManage && (
      <ResearchTeamDossierSheet
        projectId={projectId}
        mode="owner-preview"
        onClose={() => setDossierOpen(false)}
      />
    )}

    {/* Recruitment Plan Dialog */}
    {showPlan && (
      <Dialog open onOpenChange={setShowPlan}>
        <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto" data-no-i18n>
          <DialogHeader>
            <DialogTitle>{t("Recruitment Plan")}</DialogTitle>
            <DialogDescription>
              {isVi
                ? "Quản lý danh sách ứng viên và thứ tự mời giảng viên hướng dẫn cho đề tài."
                : "Manage shortlisted lecturer candidates and invitation order for this project."}
            </DialogDescription>
          </DialogHeader>
          <MentorRecruitmentPlan
            projectId={projectId}
            onSend={(candidate, version) => {
              setShowPlan(false);
              setPlanned({ candidate, version });
            }}
          />
        </DialogContent>
      </Dialog>
    )}

    {/* Focused Resource Sharing & Permissions Dialog */}
    {data.canManage && (
      <Dialog open={sharingDialogOpen} onOpenChange={setSharingDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto" data-no-i18n>
          <DialogHeader>
            <DialogTitle>
              {focusedMentorName
                ? (isVi ? `Tài liệu & quyền chia sẻ · ${focusedMentorName}` : `Shared resources · ${focusedMentorName}`)
                : (isVi ? "Tài liệu & quyền chia sẻ" : "Shared resources & permissions")}
            </DialogTitle>
            <DialogDescription>
              {isVi
                ? "Theo dõi bài báo và phiên bản bản thảo đã chia sẻ với cố vấn. Bạn có thể thu hồi chia sẻ bất kỳ lúc nào."
                : "Review papers and manuscript versions shared with this mentor. You can revoke access at any time."}
            </DialogDescription>
          </DialogHeader>
          {sharingDialogOpen && (
            <MentorAccessWorkspace
              projectId={projectId}
              focusMentorId={focusedAccessMentorId}
              embedded
              hideMentorHeader={Boolean(focusedAccessMentorId)}
            />
          )}
        </DialogContent>
      </Dialog>
    )}

    {/* Mentor Role Assignments Dialog */}
    {data.canManage && rolesDialogOpen && (
      <Dialog open onOpenChange={setRolesDialogOpen}>
        <DialogContent className="max-w-xl max-h-[85dvh] overflow-y-auto" data-no-i18n>
          <DialogHeader>
            <DialogTitle>{isVi ? "Phân vai hướng dẫn" : "Manage mentoring roles"}</DialogTitle>
            <DialogDescription>
              {t("mentorRoles.explanation")}
            </DialogDescription>
          </DialogHeader>
          <MentorRoleAssignments projectId={projectId} />
        </DialogContent>
      </Dialog>
    )}
  </section></TooltipProvider>;
}
