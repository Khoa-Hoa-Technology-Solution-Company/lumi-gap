import { lazy, Suspense, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { AcademicProfile, PublicAcademicProfile } from "@trend/shared-types";
import { Award, BadgeCheck, BookOpen, BriefcaseBusiness, Building2, Camera, Clock3, Copy, ExternalLink, GraduationCap, HandHeart, Link2, MessageSquareQuote, Pencil, Plus, Settings2, Share2, ShieldCheck, Sparkles, University, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/utils/cn";
import { useI18n } from "@/i18n";
import { useAcademicAvatar, useAcademicCover } from "../hooks/use-academic-profile";
import type { EditSection } from "./academic-profile-inline-editor";
import { AcademicIdentityManager } from "./academic-identity-manager";
import { AcademicIdentitySummary, profileIdentity } from "./academic-identity-summary";
import { ProfileAvatarDialog } from "./profile-avatar-dialog";
import { ProfileCoverDialog } from "./profile-cover-dialog";
import { PositionVerificationPanel } from "./position-verification-panel";
import { StudentAffiliationPanel } from "./student-affiliation-panel";
import { combineAcademicBio } from "../utils/academic-bio";
import { workKindLabels } from "./featured-works-editor";
import { MentoringPreferencesPanel } from "@/features/projects/components/mentoring-preferences";
import { InviteMentorFromProfile } from "@/features/projects/components/invite-mentor-from-profile";

const InlineEditor = lazy(() => import("./academic-profile-inline-editor").then(module => ({ default: module.AcademicProfileInlineEditor })));
const editTitles: Record<EditSection, string> = { intro: "Academic Biography & Profile", cover: "Cover image", research: "Research Focus & Expertise", works: "Featured Works & Contributions", affiliation: "Academic identity", availability: "Collaboration & Review", link: "Your public URL" };
const availabilityLabels: Record<string, string> = {
  RESEARCH_DIRECTION: "Research direction", LITERATURE_REVIEW: "Literature review", RESEARCH_GAP_VALIDATION: "Research gap validation",
  RESEARCH_METHODOLOGY: "Research methodology", EXPERIMENT_DESIGN: "Experiment design", DATA_ANALYSIS: "Data analysis",
  ACADEMIC_WRITING: "Academic writing", SOFTWARE_TECHNICAL_GUIDANCE: "Software guidance", RESEARCH_PROPOSAL: "Research proposal",
  THESIS_DRAFT: "Thesis draft", RESEARCH_GAP: "Research gap", METHODOLOGY: "Methodology", EXPERIMENTAL_RESULTS: "Experimental results",
  RESEARCH_PAPER: "Research paper", SOFTWARE_RESEARCH_PROJECT: "Software research project",
};
type VisibleProfile = PublicAcademicProfile | AcademicProfile;
type ProfileTab = "overview" | "affiliation" | "identities" | "collaboration" | "settings";
const cardClass = "rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#11131a]";
const insetClass = "rounded-2xl border border-slate-200/80 bg-slate-50/60 p-5 dark:border-white/10 dark:bg-white/[0.02]";
const toolbarClass = "h-9 gap-1.5 rounded-xl border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200";

export function AcademicProfileView({ profile, editableProfile, editingSection, onEdit, onCloseEdit, embedded = false }: {
  profile: VisibleProfile; editableProfile?: AcademicProfile; editingSection?: EditSection | null;
  onEdit?: (section: EditSection) => void; onCloseEdit?: () => void; embedded?: boolean;
}) {
  const { t } = useI18n();
  const [search, setSearch] = useSearchParams();
  const [localTab, setLocalTab] = useState<ProfileTab>("overview");
  const [localEdit, setLocalEdit] = useState<EditSection | null>(null);
  const [avatarOpen, setAvatarOpen] = useState(false), [coverOpen, setCoverOpen] = useState(false);
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null), [failedCover, setFailedCover] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [positionDialogOpen, setPositionDialogOpen] = useState(false);
  const [showVerificationStatus, setShowVerificationStatus] = useState(false);
  const positionPanel = useRef<HTMLDivElement>(null);
  const avatar = useAcademicAvatar(profile.avatarUrl), cover = useAcademicCover(profile.coverUrl);
  const owner = Boolean(editableProfile), activeEdit = onEdit ? editingSection : localEdit;
  const identity = profileIdentity(profile), student = identity.academicRole === "STUDENT", lecturer = identity.academicRole === "LECTURER";
  const RoleIcon = student ? GraduationCap : lecturer ? Award : BookOpen;
  const role = student ? "Student" : lecturer ? "Lecturer" : "Researcher";
  const detail = student ? identity.programMajor : identity.currentPosition;
  const biography = combineAcademicBio(profile.headline, profile.biography, profile.bio);
  const hasResearch = Boolean(profile.expertiseAreas.length || profile.researchInterests.length || profile.skills.length || profile.researchKeywords.length);
  const legacyLinks = profile.externalIdentities.filter(item => item.provider !== "GITHUB" && !profile.academicIdentityLinks.some(link => link.provider === item.provider));
  const professionalLinks = profile.externalIdentities.filter(item => item.provider === "GITHUB" && safeExternalUrl(item.profileUrl));
  const identityCount = profile.academicIdentityLinks.length + legacyLinks.filter(item => scholarlyUrl(item)).length;
  const publicPath = profile.publicHandle ? `/u/${profile.publicHandle}` : `/academics/${profile.userId}`;
  const publicUrl = `${window.location.origin}${publicPath}`;
  const initials = profile.displayName.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("").toUpperCase();
  const positionVerified = lecturer && profile.academicRoleVerificationStatus === "VERIFIED" && profile.verificationStatuses?.position === "VERIFIED";
  const positionStatus = profile.verificationStatuses?.position ?? "NOT_SUBMITTED";
  const reviewAvailable = positionVerified && profile.reviewAvailability.enabled;
  const showAvailability = profile.supportAvailability.enabled || reviewAvailable;
  const tabs: Array<{ id: ProfileTab; label: string; icon: LucideIcon; badge?: number }> = [
    { id: "overview", label: "Overview & Research", icon: BookOpen },
    { id: "affiliation", label: student ? "Academic Affiliation" : "Affiliation & Verification", icon: Building2 },
    { id: "identities", label: "Scholarly Identities", icon: Link2, badge: identityCount },
    { id: "collaboration", label: "Collaboration & Review", icon: HandHeart },
    ...(owner ? [{ id: "settings" as const, label: "Privacy & Settings", icon: Settings2 }] : []),
  ];
  const requestedTab = embedded ? localTab : search.get("tab");
  const activeTab = tabs.find(tab => tab.id === requestedTab)?.id ?? "overview";
  const tabId = useId();
  useEffect(() => {
    if (activeTab !== "affiliation" || !showVerificationStatus) return;
    positionPanel.current?.scrollIntoView?.({ block: "center", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    positionPanel.current?.focus({ preventScroll: true });
    setShowVerificationStatus(false);
  }, [activeTab, showVerificationStatus]);
  function changeTab(tab: ProfileTab) {
    if (embedded) setLocalTab(tab);
    else setSearch(current => { const next = new URLSearchParams(current); if (tab === "overview") next.delete("tab"); else next.set("tab", tab); return next; });
  }
  function edit(section: EditSection) { if (onEdit) onEdit(section); else setLocalEdit(section); }
  function close() { if (onCloseEdit) onCloseEdit(); else setLocalEdit(null); }
  async function copyPublicUrl() {
    try { await navigator.clipboard.writeText(publicUrl); setCopied(true); }
    catch { toast.error(t("Could not copy the profile link.")); }
  }

  return <div className={embedded ? "w-full" : "mx-auto w-full max-w-6xl pb-20 pt-4 sm:px-6 sm:pt-6 lg:px-8"} data-no-i18n>
    <header className="group/hero relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-[#11131a]">
      <div className="group/banner relative h-44 w-full overflow-hidden bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 sm:h-52 lg:h-60">
        {cover && cover !== failedCover ? <><img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" onError={() => setFailedCover(cover)} /><div aria-hidden className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" /></> : <div aria-hidden className="absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(circle at 15% 30%, rgba(59, 130, 246, 0.45), transparent 45%), radial-gradient(circle at 85% 70%, rgba(99, 102, 241, 0.35), transparent 45%), linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "100% 100%, 100% 100%, 32px 32px, 32px 32px" }} />}
        <div className="absolute right-6 top-6 hidden items-center gap-2 rounded-full border border-white/15 bg-slate-950/40 px-3.5 py-1 text-[11px] font-semibold tracking-wider text-blue-200/90 backdrop-blur-md sm:flex"><Sparkles className="h-3 w-3 text-blue-400" />{t("LumiGap Academic Network")}</div>
        {owner && <button type="button" aria-label={t(profile.coverUrl ? "Change cover" : "Add cover")} onClick={() => setCoverOpen(true)} className="absolute bottom-4 right-4 z-10 inline-flex items-center gap-2 rounded-xl border border-white/25 bg-slate-950/70 px-3.5 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-md transition-opacity hover:bg-slate-900 focus-visible:ring-2 focus-visible:ring-blue-500 sm:bottom-5 sm:right-6 sm:opacity-0 sm:group-hover/banner:opacity-100 sm:focus-visible:opacity-100"><Camera className="h-3.5 w-3.5 text-blue-300" />{t(profile.coverUrl ? "Change cover" : "Add cover")}</button>}
      </div>
      <div className="relative px-5 pb-6 sm:px-8 sm:pb-8">
        <div className="-mt-16 flex flex-col gap-4 sm:-mt-20 sm:flex-row sm:items-end sm:justify-between">
          <button type="button" disabled={!owner} onClick={() => setAvatarOpen(true)} aria-label={owner ? t("Change profile photo") : profile.displayName} className="group relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-700 text-3xl font-extrabold text-white shadow-xl ring-2 ring-slate-200/60 focus-visible:outline-none focus-visible:ring-blue-500 disabled:cursor-default dark:border-[#11131a] dark:ring-white/10 sm:h-36 sm:w-36">
            {avatar && avatar !== failedAvatar ? <img src={avatar} alt={profile.displayName} className="h-full w-full object-cover" onError={() => setFailedAvatar(avatar)} /> : <span className="tracking-wider">{initials}</span>}
            {owner && <span className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/60 text-white opacity-0 backdrop-blur-[2px] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"><Camera className="h-5 w-5" /><span className="mt-1 text-[10px] font-bold">{t("Update")}</span></span>}
          </button>
          {owner && <div className="flex flex-wrap items-center gap-2 sm:pb-1">
            <Button size="sm" onClick={() => edit("intro")} className="h-9 gap-1.5 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white shadow-sm shadow-blue-600/25 hover:bg-blue-700"><Pencil className="h-3.5 w-3.5" />{t("Edit profile")}</Button>
            <Button variant="outline" size="sm" className={toolbarClass} onClick={() => void copyPublicUrl()}><Share2 className="h-3.5 w-3.5 text-slate-500" />{t(copied ? "Copied!" : "Share profile")}</Button>
            <Button asChild variant="outline" size="sm" className={toolbarClass}><Link to={publicPath}><ExternalLink className="h-3.5 w-3.5 text-slate-500" />{t("Public view")}</Link></Button>
          </div>}
        </div>
        <div className="mt-4 space-y-2 sm:mt-5">
          <div className="flex flex-wrap items-center gap-2.5"><h1 className="break-words text-2xl font-extrabold tracking-tight text-slate-950 dark:text-white sm:text-3xl">{profile.displayName}</h1>{identity.fptAffiliationVerified && <BadgeCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" aria-label={t("FPT Education affiliation verified")} />}</div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-600 dark:text-slate-300 sm:text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-0.5 font-bold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"><RoleIcon className="h-4 w-4" />{t(role)}</span>
            {identity.institutionName && <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300"><University className="h-4 w-4 shrink-0 text-slate-400" /><span className="break-words">{identity.institutionName}{profile.affiliation.department && <span className="text-slate-400"> · {profile.affiliation.department}</span>}</span></span>}
            {profile.publicHandle && <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600 dark:bg-white/5 dark:text-slate-400">@{profile.publicHandle}</span>}
          </div>
          {detail && <p className="break-words text-sm text-slate-600 dark:text-slate-300">{t(detail)}</p>}
          {profile.affiliation.hostInstitution && !identity.fptAffiliationVerified && <p className="text-xs text-muted-foreground">{t(profile.affiliation.affiliationVerificationStatus === "PENDING" ? "Affiliation pending verification" : "Affiliation not verified")}</p>}
          {lecturer && <p className="text-xs text-muted-foreground">{t(positionVerified ? "Lecturer position verified" : profile.verificationStatuses?.position === "PENDING" ? "Lecturer position verification pending" : "Lecturer position is self-declared")}</p>}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2.5 border-t border-slate-100 pt-4 dark:border-white/5">
          <Metric value={profile.expertiseAreas.length} label={t("Research areas")} /><Metric value={identityCount} label={t("Scholarly IDs")} /><Metric value={profile.featuredWorks.length} label={t("Featured works")} />
          {showAvailability && <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{t("Open for collaboration")}</span>}
        </div>
      </div>
      {owner && lecturer && !positionVerified && <LecturerVerificationReminder status={positionStatus} onVerify={() => {
        changeTab("affiliation");
        if (positionStatus === "PENDING") setShowVerificationStatus(true);
        else setPositionDialogOpen(true);
      }} />}
      <nav aria-label={t("Profile navigation tabs")} className="overflow-x-auto border-t border-slate-200/80 bg-slate-50/60 p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-white/5 dark:bg-white/[0.02] sm:px-6">
        <div role="tablist" aria-label={t("Profile navigation tabs")} className="flex min-w-max gap-1.5">
          {tabs.map(({ id, label, icon: Icon, badge }, index) => <button key={id} id={`${tabId}-${id}`} type="button" role="tab" aria-selected={activeTab === id} aria-controls={`${tabId}-panel`} tabIndex={activeTab === id ? 0 : -1} onClick={() => changeTab(id)} onKeyDown={event => {
            const nextIndex = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index - 1 + tabs.length) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
            if (nextIndex !== null) { event.preventDefault(); changeTab(tabs[nextIndex]!.id); (event.currentTarget.parentElement?.children[nextIndex] as HTMLButtonElement | undefined)?.focus(); }
          }} className={cn("flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:text-sm", activeTab === id ? "bg-white text-blue-600 shadow-sm shadow-slate-900/5 dark:bg-slate-800 dark:text-white" : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white")}>
            <Icon className={cn("h-4 w-4", activeTab === id ? "text-blue-600 dark:text-blue-400" : "text-slate-400")} /><span>{t(label)}</span>{Boolean(badge) && <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold leading-none", activeTab === id ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-300")}>{badge}</span>}
          </button>)}
        </div>
      </nav>
    </header>

    <div id={`${tabId}-panel`} role="tabpanel" aria-labelledby={`${tabId}-${activeTab}`} className="mt-8">
      {activeTab === "overview" && <div className="grid gap-6 lg:grid-cols-12">
        <div className="min-w-0 space-y-6 lg:col-span-8">
          {(biography || owner) && <ProfileSection title={t("Academic Biography")} subtitle={t("Short academic statement & research focus")} icon={MessageSquareQuote} action={owner && <EditButton label={t("Edit biography")} onClick={() => edit("intro")} />}>
            {biography ? <div className="rounded-2xl bg-slate-50/70 p-5 dark:bg-white/[0.02]"><p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700 dark:text-slate-300 sm:text-[15px]">{biography}</p></div> : <OwnerPrompt text={t("Share a brief academic background or research goal. This is optional.")} label={t("Add biography")} onClick={() => edit("intro")} />}
          </ProfileSection>}
          {(hasResearch || owner) && <ProfileSection title={t("Research Focus & Expertise")} subtitle={t("Disciplines, specific interests, and research skills")} icon={GraduationCap} action={owner && <EditButton label={t("Edit research focus")} onClick={() => edit("research")} />}>
            {hasResearch ? <div className="space-y-5"><TagList title={t("Research Areas")} values={profile.expertiseAreas} primary /><TagList title={t("Research Interests")} values={profile.researchInterests} /><TagList title={t("Research skills")} values={profile.skills} /><TagList title={t("Keywords")} values={profile.researchKeywords} /></div> : <OwnerPrompt text={t("Add the research areas and topics you are exploring.")} label={t("Add research focus")} onClick={() => edit("research")} />}
          </ProfileSection>}
          {(profile.featuredWorks.length > 0 || owner) && <ProfileSection title={t("Featured Works & Contributions")} icon={BriefcaseBusiness} action={owner && <EditButton label={t("Edit featured works")} onClick={() => edit("works")} />}>
            {profile.featuredWorks.length ? <ul className="space-y-3">{profile.featuredWorks.map((work, index) => <li key={`${work.paperId ?? work.projectId ?? work.submissionId ?? work.reportId ?? work.gapId ?? work.title}-${index}`} className="group flex items-start gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 transition-colors hover:border-blue-200 hover:bg-blue-50/20 dark:border-white/5 dark:bg-white/[0.02] dark:hover:border-blue-900/50">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">{String(index + 1).padStart(2, "0")}</span>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="min-w-0 break-words text-sm font-bold text-slate-900 dark:text-white"><WorkTitle work={work} /></h3>{work.year && <span className="rounded-md bg-slate-200/80 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-300">{work.year}</span>}</div>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{t(workKindLabels[work.kind ?? "PAPER"])}{work.visibility === "RESTRICTED" && <> · {t("Visible to viewers with access")}</>}{!work.canonical && <> · {t("Self-declared research contribution")}</>}</p>{work.doi && <p className="mt-1 break-all text-xs text-muted-foreground">DOI: {work.doi}</p>}
              </div>
            </li>)}</ul> : <OwnerPrompt text={t("Add a research project or contribution")} label={t("Add work")} onClick={() => edit("works")} />}
          </ProfileSection>}
        </div>
        <aside className="min-w-0 space-y-6 lg:col-span-4">
          <section className={cardClass}><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><University className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />{t("Affiliation")}</h3>{owner && <EditButton label={t("Edit identity")} onClick={() => edit("affiliation")} />}</div><div className="mt-4"><AcademicIdentitySummary identity={identity} showDetails /></div><Button variant="link" size="sm" className="mt-3 h-auto p-0 text-xs" onClick={() => changeTab("affiliation")}>{t(student ? "Academic Affiliation" : "Affiliation & Verification")}</Button></section>
          {(owner || showAvailability) && <section className={cardClass}><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><HandHeart className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />{t("Collaboration")}</h3>{owner && <EditButton label={t("Configure")} onClick={() => changeTab("collaboration")} />}</div><div className="mt-4 space-y-3">
            {profile.supportAvailability.enabled && <AvailabilityPreview label={t("Research Support Available")} count={profile.supportAvailability.types.length} unit={t("support areas")} />}
            {reviewAvailable && <AvailabilityPreview label={t("Academic Review Open")} count={profile.reviewAvailability.types.length} unit={t("review types")} review />}
            {!showAvailability && <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">{t("Not currently accepting direct mentoring or review requests.")}</p>}
          </div></section>}
          {professionalLinks.length > 0 && <section className={cardClass}><h3 className="text-sm font-bold text-slate-900 dark:text-white">{t("Professional Links")}</h3><div className="mt-3 space-y-2">{professionalLinks.map(item => <a key={item.provider} href={safeExternalUrl(item.profileUrl)!} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-white/5 dark:bg-white/[0.02] dark:text-slate-200">GitHub<ExternalLink className="h-3.5 w-3.5 text-slate-400" /></a>)}</div></section>}
        </aside>
      </div>}

      {activeTab === "affiliation" && <ProfileSection title={t(student ? "Academic Affiliation & Program" : "Academic Position & Verification")} icon={student ? GraduationCap : Building2} action={owner && <EditButton label={t("Edit identity")} onClick={() => edit("affiliation")} />}>
        <dl className="grid gap-5 rounded-2xl bg-slate-50 px-5 py-5 dark:bg-white/[0.03] sm:grid-cols-[1.4fr_1fr] sm:gap-8 sm:px-6 sm:py-6">
          <div className="min-w-0"><dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("Current affiliation")}</dt><dd className="mt-2 break-words text-xl font-semibold tracking-tight text-slate-950 dark:text-white">{identity.institutionName || t("Not provided")}</dd>{profile.affiliation.department && <dd className="mt-1 break-words text-sm text-slate-600 dark:text-slate-400">{profile.affiliation.department}</dd>}</div>
          <div className="min-w-0 border-t border-slate-200/70 pt-4 dark:border-white/10 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0"><dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{t(student ? "Program / Major / Field of Study" : "Current Position")}</dt><dd className="mt-2 break-words text-base font-semibold text-slate-900 dark:text-slate-100">{detail ? localizedDetail(detail, t) : t("Not provided")}</dd>{detail && (student || positionStatus !== "VERIFIED" || (lecturer && !positionVerified)) && <dd className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{t("Self-declared")}</dd>}</div>
        </dl>
        {(owner || profile.affiliation.hostInstitution || !student) && <div className="mt-7"><h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{t("Verification status")}</h3><StudentAffiliationPanel profile={editableProfile ?? profile} editable={owner} />{!student && <div ref={positionPanel} tabIndex={-1} className="scroll-mt-24 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"><PositionVerificationPanel profile={editableProfile ?? profile} editable={owner} onEditPosition={owner ? () => edit("affiliation") : undefined} open={positionDialogOpen} onOpenChange={setPositionDialogOpen} /></div>}<p className="flex items-start gap-2 border-t border-slate-200/80 pt-4 text-xs leading-5 text-slate-500 dark:border-white/10 dark:text-slate-400"><ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{t("Email, institution membership and academic position are verified separately.")}</p></div>}
      </ProfileSection>}
      {activeTab === "identities" && <ProfileSection title={t("Scholarly Identity Hub")} icon={Link2}>
        <AcademicIdentityManager profile={profile} editable={owner} /><LegacyScholarlyLinks identities={legacyLinks} />
        <p className="mt-8 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 text-xs leading-relaxed text-slate-500 dark:border-white/5 dark:bg-white/[0.02] dark:text-slate-400">{t("Scholarly profile links help people discover your work. They do not verify your academic position, affiliation, or expertise.")}</p>
      </ProfileSection>}
      {activeTab === "collaboration" && <ProfileSection title={t("Collaboration & Review")} icon={HandHeart} action={owner && <EditButton label={t("Edit availability")} onClick={() => edit("availability")} />}>
        {lecturer && <div className="mb-5">{owner ? <MentoringPreferencesPanel /> : <div className="space-y-3 rounded-lg border p-4"><h3 className="text-sm font-semibold">{t("Mentoring")}</h3><p className="text-sm text-muted-foreground">{t(positionVerified && profile.supportAvailability.enabled ? "Accepting new teams" : "Not currently accepting new teams")}</p>{positionVerified && profile.supportAvailability.enabled && <InviteMentorFromProfile mentor={{ _id: profile.userId, fullName: profile.displayName, avatarUrl: profile.avatarUrl, institutionName: profile.affiliation.institutionName, positionTitle: profile.positionTitle, academicRole: "LECTURER", verifiedLecturer: true, acceptingMentorships: true, expertiseAreas: profile.expertiseAreas, researchInterests: profile.researchInterests, matchedTerms: [], sameInstitution: false }} />}</div>}</div>}
        <div className="grid gap-6 md:grid-cols-2"><AvailabilityCard title={t("Research support")} availability={profile.supportAvailability} />{reviewAvailable && <AvailabilityCard title={t("Open for assigned academic reviews")} availability={profile.reviewAvailability} />}</div>
        {owner && <p className="mt-6 rounded-2xl bg-slate-50/70 p-4 text-xs leading-5 text-muted-foreground dark:bg-white/[0.02]">{t("Mentoring requires verified Lecturer status and mutual consent. Formal review requires a separate artifact assignment.")}</p>}
      </ProfileSection>}
      {activeTab === "settings" && owner && <ProfileSection title={t("Profile Visibility & Public URL")} subtitle={t("Custom handle, public profile link, and discovery permissions")} icon={Settings2}>
        <div className="space-y-6"><div className={insetClass}><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-bold">{t("Custom Public Profile URL")}</h3><EditButton label={t("Edit handle")} onClick={() => edit("link")} /></div><div className="mt-4 flex flex-wrap items-center gap-3"><p className="min-w-0 flex-1 break-all rounded-xl border bg-white px-3.5 py-2.5 font-mono text-xs dark:bg-slate-900">{publicUrl}</p><Button size="sm" className="gap-1.5 rounded-xl bg-blue-600 text-xs text-white hover:bg-blue-700" onClick={() => void copyPublicUrl()}><Copy className="h-3.5 w-3.5" />{t(copied ? "Copied!" : "Copy link")}</Button></div></div>
          <div className={insetClass}><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-bold">{t("Profile Visibility")}</h3><p className="mt-1 text-xs text-muted-foreground">{t(profile.profileVisibility === "PUBLIC" ? "Public — Visible to everyone on the web" : profile.profileVisibility === "MEMBERS_ONLY" ? "Members only — Visible to authenticated scholars" : "Private — Only you can view your profile")}</p></div><EditButton label={t("Change")} onClick={() => edit("intro")} /></div></div>
          <div className={insetClass}><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-bold">{t("Search & Discoverability")}</h3><p className="mt-1 text-xs text-muted-foreground">{t(profile.discoverability.showInResearcherSearch ? "Included in scholar search" : "Hidden from scholar search")} · {t(profile.discoverability.allowCollaborationRequests ? "Collaboration requests enabled" : "Collaboration requests disabled")}</p></div><EditButton label={t("Profile visibility & preferences")} onClick={() => edit("intro")} /></div></div>
        </div>
      </ProfileSection>}
    </div>
    {owner && editableProfile && <>
      <Dialog open={Boolean(activeEdit)} onOpenChange={open => { if (!open) close(); }}><DialogContent className="flex max-h-[85dvh] max-w-xl flex-col overflow-hidden rounded-3xl"><DialogHeader><DialogTitle>{t(editTitles[activeEdit ?? "intro"])}</DialogTitle><DialogDescription>{t("Update your shared academic profile.")}</DialogDescription></DialogHeader><div className="min-h-0 overflow-y-auto pr-1"><Suspense fallback={<p role="status" className="py-5 text-sm">{t("Loading…")}</p>}>{activeEdit && <InlineEditor key={`${editableProfile.updatedAt}-${activeEdit}`} section={activeEdit} profile={editableProfile} onClose={close} />}</Suspense></div></DialogContent></Dialog>
      <ProfileAvatarDialog open={avatarOpen} currentAvatar={avatar} onOpenChange={setAvatarOpen} /><ProfileCoverDialog open={coverOpen} currentCover={cover} onOpenChange={setCoverOpen} />
    </>}
  </div>;
}

function LecturerVerificationReminder({ status, onVerify }: { status: string; onVerify: () => void }) {
  const { t } = useI18n();
  const headingId = useId();
  const pending = status === "PENDING", needsInfo = status === "NEEDS_MORE_INFORMATION";
  const Icon = pending ? Clock3 : ShieldCheck;
  const title = pending ? "Your Lecturer verification is under review" : needsInfo ? "Complete your Lecturer verification" : "Verify your Lecturer status";
  const description = pending ? "Your request has been submitted. You can keep using LumiGap while an administrator reviews it." : needsInfo ? "Additional information is needed. Review the feedback and update your verification evidence." : "Verify your academic position to join mentoring and formal academic review when assigned. Your core research tools remain available.";
  const action = pending ? "View verification status" : needsInfo ? "Update verification" : status === "REJECTED" ? "Submit new verification" : "Verify Lecturer Status";
  return <section aria-labelledby={headingId} className={cn("mx-5 mb-6 flex flex-col gap-4 rounded-2xl border p-4 sm:mx-8 sm:flex-row sm:items-center sm:justify-between", pending ? "border-sky-200/80 bg-sky-50/80 dark:border-sky-900/60 dark:bg-sky-950/30" : "border-amber-200/80 bg-amber-50/80 dark:border-amber-900/60 dark:bg-amber-950/25")}>
    <div className="flex min-w-0 items-start gap-3"><span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", pending ? "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300")}><Icon className="h-5 w-5" aria-hidden /></span><div><h2 id={headingId} className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t(title)}</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600 dark:text-slate-300">{t(description)}</p></div></div>
    <Button type="button" variant="outline" size="sm" onClick={onVerify} className="shrink-0 self-start rounded-xl border-slate-200 bg-white text-xs font-semibold text-slate-800 hover:bg-white/70 dark:border-white/15 dark:bg-white/5 dark:text-slate-100 sm:self-auto">{t(action)}</Button>
  </section>;
}

function ProfileSection({ title, subtitle, icon: Icon, action, children }: { title: string; subtitle?: string; icon: LucideIcon; action?: ReactNode; children: ReactNode }) {
  return <section className={cn(cardClass, "group/profile-section sm:p-7")}><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2.5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300"><Icon className="h-4.5 w-4.5" /></span><div><h2 className="text-base font-bold text-slate-900 dark:text-white">{title}</h2>{subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}</div></div>{action}</div>{children}</section>;
}
function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30" onClick={onClick}><Pencil className="h-3.5 w-3.5" />{label}</Button>;
}
function Metric({ value, label }: { value: number; label: string }) {
  return <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100/80 px-3 py-1 text-xs text-slate-700 dark:bg-white/[0.04] dark:text-slate-300"><span className="font-bold text-slate-900 dark:text-white">{value}</span><span className="text-slate-500 dark:text-slate-400">{label}</span></span>;
}
function TagList({ title, values, primary = false }: { title: string; values: string[]; primary?: boolean }) {
  const { t } = useI18n(); if (!values.length) return null;
  return <div><h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</h3><div className="flex flex-wrap gap-2">{values.map(value => <span key={value} className={cn("max-w-full break-words rounded-lg border px-3 py-1.5 text-xs font-medium", primary ? "border-blue-100 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200" : "border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300")}>{t(value)}</span>)}</div></div>;
}
function OwnerPrompt({ text, label, onClick }: { text: string; label: string; onClick: () => void }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-50/70 p-5 text-sm text-muted-foreground dark:bg-white/[0.02]"><p>{text}</p><Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-xl" onClick={onClick}><Plus className="h-3.5 w-3.5" />{label}</Button></div>;
}
function AvailabilityPreview({ label, count, unit, review = false }: { label: string; count: number; unit: string; review?: boolean }) {
  return <div className={cn("rounded-2xl border p-3.5 text-xs", review ? "border-blue-100 bg-blue-50/50 dark:border-blue-950 dark:bg-blue-950/20" : "border-emerald-100 bg-emerald-50/50 dark:border-emerald-950 dark:bg-emerald-950/20")}><p className={cn("font-bold", review ? "text-blue-800 dark:text-blue-300" : "text-emerald-800 dark:text-emerald-300")}>{label}</p><p className="mt-1 text-slate-600 dark:text-slate-400">{count} {unit}</p></div>;
}
function AvailabilityCard({ title, availability }: { title: string; availability: VisibleProfile["supportAvailability"] | VisibleProfile["reviewAvailability"] }) {
  const { t } = useI18n();
  return <div className={cn(insetClass, "space-y-4")}><h3 className="text-sm font-bold">{title}</h3><p className="text-sm text-muted-foreground">{t(availability.enabled ? "open to requests" : "Not currently accepting direct mentoring or review requests.")}</p>{availability.enabled && <><TagList title={t("Types")} values={availability.types.map(value => availabilityLabels[value] ?? value)} primary /><TagList title={t("Preferred topics")} values={availability.preferredTopics} />{availability.note && <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{availability.note}</p>}</>}</div>;
}
function WorkTitle({ work }: { work: VisibleProfile["featuredWorks"][number] }) {
  const { t } = useI18n(); const title = work.title ?? work.doi ?? t("Research work");
  if (work.href?.startsWith("/") && !work.href.startsWith("//") && !work.href.includes("\\")) return <Link to={work.href} className="hover:text-primary hover:underline">{title}</Link>;
  const href = safeExternalUrl(work.href); return href ? <a href={href} target="_blank" rel="noopener noreferrer" className="hover:text-primary hover:underline">{title}</a> : <>{title}</>;
}
function safeExternalUrl(value?: string) {
  try { const url = new URL(value ?? ""); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
function localizedDetail(value: string, t: (key: string) => string) {
  const translated = t(value);
  return typeof translated === "string" ? translated : value;
}
function scholarlyUrl(identity: VisibleProfile["externalIdentities"][number]) {
  let href = identity.profileUrl;
  if (!href && identity.externalId) {
    if (identity.provider === "ORCID") href = `https://orcid.org/${encodeURIComponent(identity.externalId)}`;
    if (identity.provider === "OPENALEX") href = `https://openalex.org/${encodeURIComponent(identity.externalId)}`;
    if (identity.provider === "SEMANTIC_SCHOLAR") href = `https://www.semanticscholar.org/author/${encodeURIComponent(identity.externalId)}`;
  }
  return safeExternalUrl(href);
}
function LegacyScholarlyLinks({ identities }: { identities: VisibleProfile["externalIdentities"] }) {
  const { t } = useI18n();
  const labels: Record<string, string> = { ORCID: "ORCID", OPENALEX: "OpenAlex", GOOGLE_SCHOLAR: "Google Scholar", SEMANTIC_SCHOLAR: "Semantic Scholar", OTHER: "Other academic profile" };
  return <ul className="space-y-2">{identities.map(identity => { const href = scholarlyUrl(identity); return href ? <li key={identity.provider} className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm"><a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{labels[identity.provider]}</a><span className="text-xs text-muted-foreground">{t("Self-declared")}</span></li> : null; })}</ul>;
}
