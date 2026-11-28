import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  TECHNICAL_SKILLS,
  type AcademicProfile,
  type PublicAcademicProfile,
} from "@trend/shared-types";
import { dedupeAcademicTerms, normalizeAcademicExpertise } from "../utils/expertise-normalization";
import {
  AlertCircle,
  ArrowRight,
  Award,
  BadgeCheck,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  Camera,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  FolderKanban,
  GraduationCap,
  HandHeart,
  Link2,
  Lock,
  MessageSquareQuote,
  Pencil,
  Plus,
  Share2,
  ShieldCheck,
  Sparkles,
  University,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/utils/cn";
import { useI18n } from "@/i18n";
import { useAcademicAvatar, useAcademicCover, useUpdateAcademicProfile } from "../hooks/use-academic-profile";
import type { EditSection } from "./academic-profile-inline-editor";
import { AcademicIdentityManager } from "./academic-identity-manager";
import { profileIdentity } from "./academic-identity-summary";
import { ProfileAvatarDialog } from "./profile-avatar-dialog";
import { PositionVerificationPanel } from "./position-verification-panel";
import { StudentAffiliationPanel } from "./student-affiliation-panel";
import { combineAcademicBio } from "../utils/academic-bio";
import { workKindLabels } from "./featured-works-editor";
import {
  mentorshipError,
  useMentoringPreferences,
  useSaveMentoringPreferences,
} from "@/features/projects/components/mentoring-preferences";
import { MentoringSettingsDrawer } from "@/features/projects/components/mentoring-settings-drawer";
import { formatSupportLabel } from "@/features/projects/components/research-team-dossier-sheet";
import { InviteMentorFromProfile } from "@/features/projects/components/invite-mentor-from-profile";
import { ReviewSettingsDrawer } from "./review-settings-drawer";
import "./academic-profile-view.css";

const InlineEditor = lazy(() =>
  import("./academic-profile-inline-editor").then(module => ({ default: module.AcademicProfileInlineEditor })),
);
const PersonalContributionProfileLazy = lazy(() =>
  import("@/features/projects/components/personal-contribution-profile").then(module => ({
    default: module.PersonalContributionProfile,
  })),
);

const availabilityLabels: Record<string, string> = {
  RESEARCH_DIRECTION: "Research direction",
  LITERATURE_REVIEW: "Literature review",
  RESEARCH_GAP_VALIDATION: "Research gap validation",
  RESEARCH_METHODOLOGY: "Research methodology",
  EXPERIMENT_DESIGN: "Experiment design",
  DATA_ANALYSIS: "Data analysis",
  ACADEMIC_WRITING: "Academic writing",
  SOFTWARE_TECHNICAL_GUIDANCE: "Software guidance",
  RESEARCH_PROPOSAL: "Research proposal",
  THESIS_DRAFT: "Thesis draft",
  RESEARCH_GAP: "Research gap",
  METHODOLOGY: "Methodology",
  EXPERIMENTAL_RESULTS: "Experimental results",
  RESEARCH_PAPER: "Research paper",
  SOFTWARE_RESEARCH_PROJECT: "Software research project",
};

type VisibleProfile = PublicAcademicProfile | AcademicProfile;
type ProfileTab = "overview" | "academic" | "portfolio" | "contributions" | "collaboration";

function resolveProfileTab(raw: string | null, owner: boolean): ProfileTab {
  if (raw === "academic" || raw === "affiliation" || raw === "identities") return "academic";
  if (raw === "portfolio" || raw === "works") return "portfolio";
  if (owner && raw === "contributions") return "contributions";
  if (raw === "collaboration" || raw === "settings") return "collaboration";
  return "overview";
}

function isDemoAccount(displayName: string, publicHandle?: string): boolean {
  return /\(demo\)/i.test(displayName) || /^demo[._-]/i.test(publicHandle ?? "");
}

function isSameRoleLabel(positionTitle: string | undefined, roleKey: string, t: (k: string) => string): boolean {
  if (!positionTitle) return true;
  const clean = positionTitle.trim().toLowerCase();
  return (
    clean === roleKey.toLowerCase() ||
    clean === t(roleKey).trim().toLowerCase() ||
    (roleKey === "Lecturer" && ["giảng viên", "lecturer"].includes(clean)) ||
    (roleKey === "Student" && ["sinh viên", "student"].includes(clean))
  );
}

const cardClass =
  "ap-card rounded-2xl border border-border/85 bg-card p-5 shadow-xs sm:p-6";

export function AcademicProfileView({
  profile,
  editableProfile,
  editingSection,
  onEdit,
  onCloseEdit,
  embedded = false,
}: {
  profile: VisibleProfile;
  editableProfile?: AcademicProfile;
  editingSection?: EditSection | null;
  onEdit?: (section: EditSection) => void;
  onCloseEdit?: () => void;
  embedded?: boolean;
}) {
  const { t, language } = useI18n();
  const [search, setSearch] = useSearchParams();
  const [localTab, setLocalTab] = useState<ProfileTab>("overview");
  const [localEdit, setLocalEdit] = useState<EditSection | null>(null);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [positionDialogOpen, setPositionDialogOpen] = useState(false);
  const [showVerificationStatus, setShowVerificationStatus] = useState(false);
  const positionPanel = useRef<HTMLDivElement>(null);

  const avatar = useAcademicAvatar(profile.avatarUrl);
  const cover = useAcademicCover(profile.coverUrl);
  const updateProfile = useUpdateAcademicProfile();

  const owner = Boolean(editableProfile);
  const activeEdit = onEdit ? editingSection : localEdit;
  const identity = profileIdentity(profile);
  const student = identity.academicRole === "STUDENT";
  const lecturer = identity.academicRole === "LECTURER";
  const RoleIcon = student ? GraduationCap : lecturer ? Award : BookOpen;
  const roleKey = student ? "Student" : lecturer ? "Lecturer" : "Researcher";
  const demoAccount = isDemoAccount(profile.displayName, profile.publicHandle);

  // Deduplicated subtitle: avoid repeating "Giảng viên · Giảng viên"
  const rawDetail = student ? identity.programMajor : identity.currentPosition;
  const distinctPosition = rawDetail && !isSameRoleLabel(rawDetail, roleKey, t) ? rawDetail : undefined;
  const headerSpecialty = student
    ? identity.programMajor
    : distinctPosition ?? profile.affiliation.department;

  const biography = combineAcademicBio(profile.headline, profile.biography, profile.bio);

  // Canonical 3-group normalized expertise (single source of truth — zero duplicates)
  const expertise = useMemo(
    () =>
      normalizeAcademicExpertise({
        expertiseAreas: profile.expertiseAreas,
        researchSpecializations: profile.researchSpecializations,
        researchInterests: profile.researchInterests,
        skills: profile.skills,
        researchMethods: profile.researchMethods,
        researchKeywords: profile.researchKeywords,
        classificationNodeNames: profile.researchClassification?.nodes.map(n => n.name),
        classificationSkillLabels: profile.researchClassification?.skillIds.map(
          id => TECHNICAL_SKILLS.find(s => s.id === id)?.label ?? id,
        ),
      }),
    [profile],
  );
  const hasResearch =
    expertise.researchAreas.length > 0 ||
    expertise.skills.length > 0 ||
    expertise.researchMethods.length > 0;
  const allProfileExpertiseTerms = useMemo(
    () => dedupeAcademicTerms([...expertise.researchAreas, ...expertise.skills, ...expertise.researchMethods], 50),
    [expertise],
  );

  // Scholarly links
  const legacyLinks = profile.externalIdentities.filter(
    item => item.provider !== "GITHUB" && !profile.academicIdentityLinks.some(link => link.provider === item.provider),
  );
  const githubLinks = profile.externalIdentities.filter(
    item => item.provider === "GITHUB" && safeExternalUrl(item.profileUrl),
  );
  const identityCount =
    profile.academicIdentityLinks.length +
    legacyLinks.filter(item => scholarlyUrl(item)).length +
    githubLinks.length;

  // Portfolio breakdown (Publications vs Projects vs Contributions)
  const publications = useMemo(
    () => profile.featuredWorks.filter(w => (w.kind ?? "PAPER") === "PAPER" || Boolean(w.doi)),
    [profile.featuredWorks],
  );
  const draftWorks = useMemo(
    () => profile.featuredWorks.filter(w => ["RESEARCH_PROPOSAL", "RESEARCH_ARTIFACT", "CANDIDATE_GAP", "DATASET"].includes(w.kind ?? "")),
    [profile.featuredWorks],
  );
  const portfolioProjects = profile.portfolio?.projects ?? [];
  const portfolioContributions = profile.portfolio?.contributions ?? [];
  const portfolioTotalCount =
    publications.length + draftWorks.length + portfolioProjects.length + portfolioContributions.length;

  // Verification & Availability states (strictly separated; configured vs effective)
  const publicPath = profile.publicHandle ? `/u/${profile.publicHandle}` : `/academics/${profile.userId}`;
  const publicPreviewPath = `${publicPath}?preview=public`;
  const publicUrl = `${window.location.origin}${publicPath}`;
  const cleanNameForInitials = profile.displayName
    .replace(/\s*\(demo\)\s*/gi, " ")
    .replace(/^(?:GS\.|PGS\.|TS\.|ThS\.|CN\.|KS\.|Dr\.|Prof\.|Assoc\.\s*Prof\.)\s*/i, "")
    .trim();
  const initials = (cleanNameForInitials || profile.displayName)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(word => word[0])
    .join("")
    .toUpperCase();
  const positionVerified =
    lecturer &&
    profile.academicRoleVerificationStatus === "VERIFIED" &&
    profile.verificationStatuses?.position === "VERIFIED";
  const positionStatus = profile.verificationStatuses?.position ?? "NOT_SUBMITTED";
  const affiliationVerified = profile.affiliation.affiliationVerificationStatus === "VERIFIED";

  const [mentoringDrawerOpen, setMentoringDrawerOpen] = useState(false);
  const [reviewDrawerOpen, setReviewDrawerOpen] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<"collab" | "mentoring" | "review" | null>(null);

  // Sync with exact same MentoringPreferences source of truth as Lecturer Workspace
  const mentoringPrefQuery = useMentoringPreferences(owner && positionVerified);
  const saveMentoringPref = useSaveMentoringPreferences();

  const openToCollaborate = profile.discoverability.allowCollaborationRequests;
  const mentoringConfigured =
    positionVerified
    && (owner && mentoringPrefQuery.data
      ? mentoringPrefQuery.data.acceptingMentorships
      : profile.supportAvailability.enabled);
  const activeMentoredCount =
    owner && mentoringPrefQuery.data?.activeProjectCount !== undefined
      ? mentoringPrefQuery.data.activeProjectCount
      : (profile.portfolio?.mentoringActivity?.activeProjectCount ?? 0);
  const maxActiveProjects =
    (owner && mentoringPrefQuery.data
      ? mentoringPrefQuery.data.maxActiveProjects
      : (profile.portfolio?.mentoringActivity?.maxActiveProjects ?? profile.supportAvailability.maxActiveProjects)) ?? null;
  const remainingMentoringSlots =
    maxActiveProjects !== null ? Math.max(0, maxActiveProjects - activeMentoredCount) : null;
  const externalGroupCount =
    owner
      ? ((mentoringPrefQuery.data
          ? mentoringPrefQuery.data.externalGroupCount
          : (profile.portfolio?.mentoringActivity?.externalGroupCount ?? profile.supportAvailability.externalGroupCount)) ?? null)
      : null;
  const mentoringCapacityReached =
    owner && mentoringPrefQuery.data?.capacityReached !== undefined
      ? mentoringPrefQuery.data.capacityReached
      : (profile.portfolio?.mentoringActivity?.capacityReached ??
        (maxActiveProjects !== null && activeMentoredCount >= maxActiveProjects));
  const mentoringActive =
    positionVerified && mentoringConfigured && !mentoringCapacityReached;
  const reviewAvailable = positionVerified && profile.reviewAvailability.enabled;

  const effectiveSupportTopics =
    owner && mentoringPrefQuery.data?.preferredTopics
      ? mentoringPrefQuery.data.preferredTopics
      : profile.supportAvailability.preferredTopics;
  const effectiveSupportTypes =
    owner && mentoringPrefQuery.data?.supportTypes
      ? mentoringPrefQuery.data.supportTypes
      : profile.supportAvailability.types;

  const savedSupportSummaryTopics = useMemo(
    () =>
      dedupeAcademicTerms(
        [
          ...effectiveSupportTopics,
          ...effectiveSupportTypes.map(code => availabilityLabels[code] ?? code),
        ],
        20,
      ),
    [effectiveSupportTopics, effectiveSupportTypes],
  );

  // Clean Main Tabs (Private Personal Contributions tab shown ONLY for profile owner — never public!)
  const tabs: Array<{ id: ProfileTab; label: string; icon: LucideIcon; badge?: number }> = [
    { id: "overview", label: t("profileRedesign.tab.overview"), icon: BookOpen },
    { id: "academic", label: t("profileRedesign.tab.academic"), icon: Building2 },
    {
      id: "portfolio",
      label: t("profileRedesign.tab.portfolio"),
      icon: BriefcaseBusiness,
      badge: portfolioTotalCount > 0 ? portfolioTotalCount : undefined,
    },
    ...(owner
      ? [
          {
            id: "contributions" as const,
            label: language === "vi" ? "Đóng góp nghiên cứu" : "Research contributions",
            icon: ShieldCheck,
          },
        ]
      : []),
    { id: "collaboration", label: t("profileRedesign.tab.collaboration"), icon: HandHeart },
  ];

  const requestedTab = embedded ? localTab : search.get("tab");
  const activeTab = resolveProfileTab(requestedTab, owner);
  const tabId = useId();

  useEffect(() => {
    if (activeTab !== "academic" || !showVerificationStatus) return;
    positionPanel.current?.scrollIntoView?.({
      block: "center",
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
    positionPanel.current?.focus({ preventScroll: true });
    setShowVerificationStatus(false);
  }, [activeTab, showVerificationStatus]);

  function changeTab(tab: ProfileTab) {
    if (embedded) {
      setLocalTab(tab);
    } else {
      setSearch(current => {
        const next = new URLSearchParams(current);
        if (tab === "overview") next.delete("tab");
        else next.set("tab", tab);
        return next;
      });
    }
  }

  function edit(section: EditSection) {
    if (onEdit) onEdit(section);
    else setLocalEdit(section);
  }

  function close() {
    if (onCloseEdit) onCloseEdit();
    else setLocalEdit(null);
  }

  async function copyPublicUrl() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast.success(t("Copied!"));
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error(t("Could not copy the profile link."));
    }
  }

  async function toggleCollaborationOpen(enabled: boolean) {
    setPendingSwitch("collab");
    try {
      await updateProfile.mutateAsync({
        discoverability: { allowCollaborationRequests: enabled },
      });
      toast.success(
        language === "vi"
          ? enabled
            ? "Đã bật trạng thái sẵn sàng cộng tác nghiên cứu"
            : "Đã tắt trạng thái nhận lời mời cộng tác nghiên cứu"
          : t("Profile changes saved"),
      );
    } catch {
      toast.error(t("Could not save these changes."));
    } finally {
      setPendingSwitch(null);
    }
  }

  async function toggleMentoringOpen(enabled: boolean) {
    setPendingSwitch("mentoring");
    try {
      await saveMentoringPref.mutateAsync({ acceptingMentorships: enabled });
      toast.success(
        language === "vi"
          ? enabled
            ? "Đã bật trạng thái nhận hướng dẫn nhóm nghiên cứu"
            : "Đã tạm ngừng nhận hướng dẫn nhóm mới"
          : t("Profile changes saved"),
      );
    } catch (error) {
      toast.error(t(mentorshipError(error)));
    } finally {
      setPendingSwitch(null);
    }
  }

  async function toggleReviewOpen(enabled: boolean) {
    setPendingSwitch("review");
    try {
      const { updatedAt: _omit, ...currentReview } = profile.reviewAvailability;
      await updateProfile.mutateAsync({
        reviewAvailability: {
          ...currentReview,
          enabled,
          types: enabled && currentReview.types.length === 0 ? ["RESEARCH_PAPER"] : currentReview.types,
        },
      });
      toast.success(
        language === "vi"
          ? enabled
            ? "Đã bật trạng thái sẵn sàng phản biện học thuật"
            : "Đã tạm ngừng nhận lời mời phản biện học thuật"
          : t("Profile changes saved"),
      );
    } catch {
      toast.error(t("Could not save these changes."));
    } finally {
      setPendingSwitch(null);
    }
  }

  const editDialogTitle =
    activeEdit === "works"
      ? t("profileRedesign.portfolio.manageFeatured")
      : activeEdit === "availability"
        ? t("profileRedesign.collab.title")
        : activeEdit === "link"
          ? t("Your public URL")
          : t("profileRedesign.editor.title");

  return (
    <div
      className={
        embedded
          ? "w-full"
          : "mx-auto w-full max-w-[1160px] px-4 pb-16 pt-4 sm:px-6 sm:pt-6 lg:px-8"
      }
      data-no-i18n
    >
      {/* ================================================================ */}
      {/* MODERN ACADEMIC SAAS HEADER (NO DUPLICATE ROLE, NO USELESS STATS)*/}
      {/* ================================================================ */}
      <header className="overflow-hidden rounded-2xl border border-border/85 bg-card shadow-xs">
        {/* Compact Optional Cover Strip */}
        <div className="relative h-24 w-full overflow-hidden bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 sm:h-32">
          {cover && cover !== failedCover ? (
            <>
              <img
                src={cover}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                onError={() => setFailedCover(cover)}
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent"
              />
            </>
          ) : (
            <div
              aria-hidden="true"
              className="absolute inset-0 opacity-35"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 18% 35%, rgba(59, 130, 246, 0.45), transparent 50%), radial-gradient(circle at 85% 65%, rgba(99, 102, 241, 0.35), transparent 50%)",
              }}
            />
          )}
        </div>

        <div className="relative px-5 pb-5 sm:px-7">
          {/* Avatar + Clean Action Row */}
          <div className="-mt-10 flex flex-col gap-3 sm:-mt-12 sm:flex-row sm:items-end sm:justify-between">
            <button
              type="button"
              disabled={!owner}
              onClick={() => setAvatarOpen(true)}
              aria-label={owner ? t("Change profile photo") : profile.displayName}
              className="group relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-card bg-gradient-to-tr from-blue-600 via-indigo-600 to-blue-700 text-2xl font-bold text-white shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default sm:h-24 sm:w-24"
            >
              {avatar && avatar !== failedAvatar ? (
                <img
                  src={avatar}
                  alt={profile.displayName}
                  className="h-full w-full object-cover"
                  onError={() => setFailedAvatar(avatar)}
                />
              ) : (
                <span className="tracking-wide">{initials}</span>
              )}
              {owner ? (
                <span className="absolute inset-0 flex items-center justify-center bg-slate-950/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  <Camera className="h-4 w-4" aria-hidden="true" />
                </span>
              ) : null}
            </button>

            {owner ? (
              <div className="flex flex-wrap items-center gap-2 sm:pb-0.5">
                <Button
                  size="sm"
                  onClick={() => edit("basic")}
                  className="h-9 gap-1.5 rounded-lg px-4 text-xs font-semibold"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t("Edit profile")}</span>
                </Button>
                <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 rounded-lg px-3 text-xs">
                  <Link to={publicPreviewPath}>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                    <span>{t("Public view")}</span>
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 rounded-lg px-3 text-xs"
                  onClick={() => void copyPublicUrl()}
                >
                  <Share2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  <span>{t(copied ? "Copied!" : "Share profile")}</span>
                </Button>
              </div>
            ) : null}
          </div>

          {/* Identity Block — Single Clear Hierarchy */}
          <div className="mt-3.5 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="break-words text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                {profile.displayName}
              </h1>
              {identity.fptAffiliationVerified ? (
                <span title={t("FPT Education affiliation verified")}>
                  <BadgeCheck
                    className="h-5 w-5 text-blue-600 dark:text-blue-400"
                    aria-label={t("FPT Education affiliation verified")}
                  />
                </span>
              ) : null}
              {demoAccount ? (
                <Badge
                  variant="outline"
                  title={t("profileRedesign.demoTooltip")}
                  className="h-5 border-amber-500/40 bg-amber-500/10 px-2 text-[11px] font-semibold text-amber-800 dark:text-amber-300"
                >
                  {t("profileRedesign.demoBadge")}
                </Badge>
              ) : null}
            </div>

            {/* Line 2: Academic Role + Specialty/Department (never repeats role!) */}
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-foreground/90">
              <span className="inline-flex items-center gap-1.5 text-primary">
                <RoleIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{t(roleKey)}</span>
              </span>
              {headerSpecialty ? (
                <>
                  <span className="text-muted-foreground/60" aria-hidden="true">·</span>
                  <span className="break-words">{t(headerSpecialty)}</span>
                </>
              ) : null}
              {!student && profile.academicTitle && !isSameRoleLabel(profile.academicTitle, roleKey, t) ? (
                <>
                  <span className="text-muted-foreground/60" aria-hidden="true">·</span>
                  <span className="text-muted-foreground">{t(profile.academicTitle)}</span>
                </>
              ) : null}
            </p>

            {/* Line 3: Institution + @handle */}
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground sm:text-sm">
              {identity.institutionName ? (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <University className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="break-words">{identity.institutionName}</span>
                </span>
              ) : null}
              {profile.publicHandle ? (
                <span className="font-mono text-xs text-muted-foreground">
                  @{profile.publicHandle}
                </span>
              ) : null}
            </div>

            {/* Line 4: Precise Verification Scope + Real Availability Statuses (No numeric vanity metrics!) */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              {lecturer ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                    positionVerified
                      ? "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300"
                      : positionStatus === "PENDING"
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                        : "border-border bg-muted/50 text-muted-foreground",
                  )}
                >
                  {positionVerified ? (
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  ) : positionStatus === "PENDING" ? (
                    <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  ) : null}
                  <span>
                    {t(
                      positionVerified
                        ? "Lecturer position verified"
                        : positionStatus === "PENDING"
                          ? "Lecturer position verification pending"
                          : "Lecturer position is self-declared",
                    )}
                  </span>
                </span>
              ) : null}

              {affiliationVerified && !lecturer ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{t("profileRedesign.academic.scope.affiliation")}: {t("profileRedesign.academic.status.VERIFIED")}</span>
                </span>
              ) : null}

              {openToCollaborate ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{t("profileRedesign.openToCollaborate")}</span>
                </span>
              ) : null}

              {mentoringActive ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-xs font-medium text-teal-800 dark:text-teal-300">
                  <HandHeart className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{t("profileRedesign.acceptingMentoring")}</span>
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Lecturer Verification Reminder (only for unverified owner lecturers) */}
        {owner && lecturer && !positionVerified ? (
          <LecturerVerificationReminder
            status={positionStatus}
            onVerify={() => {
              changeTab("academic");
              if (positionStatus === "PENDING") setShowVerificationStatus(true);
              else setPositionDialogOpen(true);
            }}
          />
        ) : null}

        {/* 4 Main Navigation Tabs */}
        <nav
          aria-label={t("Profile navigation tabs")}
          className="overflow-x-auto border-t border-border/80 bg-muted/25 px-3 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-6"
        >
          <div role="tablist" aria-label={t("Profile navigation tabs")} className="flex min-w-max gap-1">
            {tabs.map(({ id, label, icon: Icon, badge }, index) => (
              <button
                key={id}
                id={`${tabId}-${id}`}
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                aria-controls={`${tabId}-panel`}
                tabIndex={activeTab === id ? 0 : -1}
                onClick={() => changeTab(id)}
                onKeyDown={event => {
                  const nextIndex =
                    event.key === "ArrowRight"
                      ? (index + 1) % tabs.length
                      : event.key === "ArrowLeft"
                        ? (index - 1 + tabs.length) % tabs.length
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? tabs.length - 1
                            : null;
                  if (nextIndex !== null) {
                    event.preventDefault();
                    changeTab(tabs[nextIndex]!.id);
                    (event.currentTarget.parentElement?.children[nextIndex] as HTMLButtonElement | undefined)?.focus();
                  }
                }}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm",
                  activeTab === id
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <Icon
                  className={cn("h-4 w-4 shrink-0", activeTab === id ? "text-primary" : "text-muted-foreground")}
                  aria-hidden="true"
                />
                <span>{label}</span>
                {badge !== undefined ? (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
                    {badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </nav>
      </header>

      {/* ================================================================ */}
      {/* TAB PANELS                                                       */}
      {/* ================================================================ */}
      <div
        id={`${tabId}-panel`}
        role="tabpanel"
        aria-labelledby={`${tabId}-${activeTab}`}
        className="academic-profile-tabpanel mt-6"
      >
        {/* ============================================================ */}
        {/* TAB 1: TỔNG QUAN (OVERVIEW)                                  */}
        {/* ============================================================ */}
        {activeTab === "overview" ? (
          <div className="grid gap-6 lg:grid-cols-12">
            <div className="min-w-0 space-y-6 lg:col-span-8">
              {/* 1. Giới thiệu học thuật */}
              {biography || owner ? (
                <ProfileSection
                  title={t("Academic Biography")}
                  icon={MessageSquareQuote}
                  action={owner ? <CompactEditLink label={t("Edit")} onClick={() => edit("basic")} /> : undefined}
                >
                  {biography ? (
                    <p className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground/90">
                      {biography}
                    </p>
                  ) : (
                    <OwnerPrompt
                      text={t("Share a brief academic background or research goal. This is optional.")}
                      label={t("Add biography")}
                      onClick={() => edit("basic")}
                    />
                  )}
                </ProfileSection>
              ) : null}

              {/* 2. Chuyên môn & hướng nghiên cứu (3 Canonical Non-Duplicate Groups) */}
              {hasResearch || owner ? (
                <ProfileSection
                  title={t("profileRedesign.expertiseTitle")}
                  subtitle={t("profileRedesign.expertiseSubtitle")}
                  icon={Sparkles}
                  action={owner ? <CompactEditLink label={t("Edit")} onClick={() => edit("research")} /> : undefined}
                >
                  {hasResearch ? (
                    <div className="space-y-5">
                      <ExpertiseGroup
                        title={t("profileRedesign.group.areas")}
                        values={expertise.researchAreas}
                        tone="area"
                      />
                      <ExpertiseGroup
                        title={t("profileRedesign.group.skills")}
                        values={expertise.skills}
                        tone="skill"
                      />
                      <ExpertiseGroup
                        title={t("profileRedesign.group.methods")}
                        values={expertise.researchMethods}
                        tone="method"
                      />
                      <p className="border-t border-border/70 pt-3 text-xs text-muted-foreground">
                        {t("Expertise is self-declared. Lecturer verification does not certify these topics or skills.")}
                      </p>
                    </div>
                  ) : (
                    <OwnerPrompt
                      text={t("Add the research areas and topics you are exploring.")}
                      label={t("Add research focus")}
                      onClick={() => edit("research")}
                    />
                  )}
                </ProfileSection>
              ) : null}

              {/* 3. Công trình nổi bật (compact preview; full list in Tab 3) */}
              {profile.featuredWorks.length > 0 || owner ? (
                <ProfileSection
                  title={t("profileRedesign.portfolio.featured")}
                  icon={BriefcaseBusiness}
                  action={
                    profile.featuredWorks.length > 0 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs font-semibold text-primary"
                        onClick={() => changeTab("portfolio")}
                      >
                        {t("profileRedesign.portfolio.viewAll")}
                      </Button>
                    ) : undefined
                  }
                >
                  {profile.featuredWorks.length > 0 ? (
                    <ul className="divide-y divide-border/70">
                      {profile.featuredWorks.slice(0, 4).map((work, index) => (
                        <li
                          key={`${work.paperId ?? work.projectId ?? work.submissionId ?? work.reportId ?? work.gapId ?? work.title}-${index}`}
                          className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-sm font-semibold text-foreground">
                              <WorkTitle work={work} />
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {t(workKindLabels[work.kind ?? "PAPER"])}
                              {work.year ? ` · ${work.year}` : ""}
                              {work.visibility === "RESTRICTED" ? ` · ${t("Visible to viewers with access")}` : ""}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <OwnerPrompt
                      text={t("Add a research project or contribution")}
                      label={t("Add work")}
                      onClick={() => edit("works")}
                    />
                  )}
                </ProfileSection>
              ) : null}
            </div>

            {/* Right Summary Rail — NO Duplicate Affiliation Card! */}
            <aside className="min-w-0 space-y-5 lg:col-span-4">
              {/* Collaboration Status Card */}
              {owner || openToCollaborate || mentoringActive || reviewAvailable ? (
                <section className={cardClass}>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <HandHeart className="h-4 w-4 text-primary" aria-hidden="true" />
                      <span>{t("profileRedesign.tab.collaboration")}</span>
                    </h3>
                    {owner ? (
                      <CompactEditLink
                        label={t("Configure")}
                        onClick={() => changeTab("collaboration")}
                      />
                    ) : null}
                  </div>

                  <div className="mt-4 space-y-3 text-xs">
                    <div className="rounded-xl border border-border/75 bg-muted/20 p-3">
                      <p className="font-semibold text-foreground">
                        {t("profileRedesign.collab.researchTitle")}
                      </p>
                      <p className="mt-0.5 text-muted-foreground">
                        {openToCollaborate
                          ? t("profileRedesign.collab.researchEnabled")
                          : t("profileRedesign.collab.researchDisabled")}
                      </p>
                    </div>

                    {lecturer && (mentoringActive || owner) ? (
                      <div
                        className={cn(
                          "rounded-xl border p-3 space-y-2",
                          mentoringActive
                            ? "border-emerald-500/25 bg-emerald-500/[0.06]"
                            : "border-border/75 bg-muted/20",
                        )}
                      >
                        <p
                          className={cn(
                            "font-semibold",
                            mentoringActive
                              ? "text-emerald-800 dark:text-emerald-300"
                              : "text-foreground",
                          )}
                        >
                          {mentoringActive
                            ? t("profileRedesign.acceptingMentoring")
                            : t("Not currently accepting new teams")}
                        </p>
                        {savedSupportSummaryTopics.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {savedSupportSummaryTopics.slice(0, 6).map(topic => (
                              <span
                                key={topic}
                                className="rounded-md border border-border/70 bg-background px-2 py-0.5 text-[11px] font-medium text-foreground/90"
                              >
                                {t(topic)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-muted-foreground">
                            {t("profileRedesign.collab.noSupportAreasSet")}
                          </p>
                        )}
                      </div>
                    ) : null}

                    {reviewAvailable ? (
                      <div className="rounded-xl border border-blue-500/25 bg-blue-500/[0.06] p-3">
                        <p className="font-semibold text-blue-800 dark:text-blue-300">
                          {t("profileRedesign.openToReview")}
                        </p>
                        {profile.reviewAvailability.types.length > 0 ? (
                          <p className="mt-1 text-muted-foreground">
                            {profile.reviewAvailability.types
                              .slice(0, 3)
                              .map(code => t(availabilityLabels[code] ?? code))
                              .join(" · ")}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {/* Quick Scholarly Links Card */}
              {identityCount > 0 || owner ? (
                <section className={cardClass}>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <Link2 className="h-4 w-4 text-primary" aria-hidden="true" />
                      <span>{t("profileRedesign.academic.linksTitle")}</span>
                    </h3>
                    {owner ? (
                      <CompactEditLink
                        label={t("Edit")}
                        onClick={() => edit("links")}
                      />
                    ) : null}
                  </div>
                  {identityCount > 0 ? (
                    <div className="mt-3 space-y-2">
                      {profile.academicIdentityLinks.map(link => {
                        const href = safeExternalUrl(link.profileUrl);
                        return (
                          <div
                            key={link.id}
                            className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs"
                          >
                            <span className="font-semibold text-foreground truncate">
                              {link.label || link.provider.replaceAll("_", " ")}
                            </span>
                            {href ? (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline"
                              >
                                <span>{t("View")}</span>
                                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                              </a>
                            ) : (
                              <span className="font-mono text-muted-foreground truncate">
                                {link.identifier}
                              </span>
                            )}
                          </div>
                        );
                      })}
                      {githubLinks.map(item => (
                        <a
                          key={item.provider}
                          href={safeExternalUrl(item.profileUrl)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/50"
                        >
                          <span>GitHub</span>
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">
                      {t("Add ORCID, OpenAlex, Scholar profiles, or another scholarly link. These links never verify your academic position automatically.")}
                    </p>
                  )}
                </section>
              ) : null}
            </aside>
          </div>
        ) : null}

        {/* ============================================================ */}
        {/* TAB 2: HỒ SƠ HỌC THUẬT (ACADEMIC PROFILE + LINKS)            */}
        {/* ============================================================ */}
        {activeTab === "academic" ? (
          <div className="space-y-6">
            <ProfileSection
              title={t("profileRedesign.academic.title")}
              subtitle={t("profileRedesign.academic.subtitle")}
              icon={student ? GraduationCap : Building2}
              action={owner ? <CompactEditLink label={t("Edit")} onClick={() => edit("academic")} /> : undefined}
            >
              <dl className="grid gap-4 rounded-xl border border-border/75 bg-muted/20 p-5 sm:grid-cols-2 lg:grid-cols-3">
                <div className="min-w-0">
                  <dt className="text-xs font-medium text-muted-foreground">{t("Current affiliation")}</dt>
                  <dd className="mt-1.5 break-words text-base font-semibold text-foreground">
                    {identity.institutionName || t("Not provided")}
                  </dd>
                  {profile.affiliation.department ? (
                    <dd className="mt-0.5 break-words text-xs text-muted-foreground">
                      {profile.affiliation.department}
                    </dd>
                  ) : null}
                </div>

                <div className="min-w-0">
                  <dt className="text-xs font-medium text-muted-foreground">
                    {t(student ? "Program / Major / Field of Study" : "Current Position")}
                  </dt>
                  <dd className="mt-1.5 break-words text-base font-semibold text-foreground">
                    {rawDetail ? localizedDetail(rawDetail, t) : t("Not provided")}
                  </dd>
                  {profile.academicTitle && !student ? (
                    <dd className="mt-0.5 text-xs text-muted-foreground">{t(profile.academicTitle)}</dd>
                  ) : null}
                </div>

                <div className="min-w-0">
                  <dt className="text-xs font-medium text-muted-foreground">{t("Academic Role")}</dt>
                  <dd className="mt-1.5 text-base font-semibold text-foreground">{t(roleKey)}</dd>
                  {rawDetail && (student || !positionVerified) ? (
                    <dd className="mt-0.5 text-xs text-muted-foreground">{t("Self-declared")}</dd>
                  ) : null}
                </div>
              </dl>

              {/* Separated Verification Scopes Matrix (Phase 7) */}
              <div className="mt-6 space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("profileRedesign.academic.verificationMatrix")}
                </h3>

                <div className="grid gap-2.5 sm:grid-cols-2">
                  <VerificationScopePill
                    label={t("profileRedesign.academic.scope.email")}
                    status={profile.verificationStatuses?.email ?? "NOT_SUBMITTED"}
                    t={t}
                  />
                  <VerificationScopePill
                    label={t("profileRedesign.academic.scope.affiliation")}
                    status={profile.affiliation.affiliationVerificationStatus ?? "NOT_SUBMITTED"}
                    t={t}
                  />
                  {lecturer ? (
                    <VerificationScopePill
                      label={t("profileRedesign.academic.scope.position")}
                      status={positionVerified ? "VERIFIED" : positionStatus}
                      t={t}
                    />
                  ) : null}
                  <VerificationScopePill
                    label={t("profileRedesign.academic.scope.orcid")}
                    status={profile.verificationStatuses?.orcid ?? "NOT_SUBMITTED"}
                    t={t}
                  />
                </div>

                {owner || profile.affiliation.hostInstitution || !student ? (
                  <div className="space-y-3 pt-2">
                    <StudentAffiliationPanel profile={editableProfile ?? profile} editable={owner} />
                    {!student ? (
                      <div
                        ref={positionPanel}
                        tabIndex={-1}
                        className="scroll-mt-24 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <PositionVerificationPanel
                          profile={editableProfile ?? profile}
                          editable={owner}
                          onEditPosition={owner ? () => edit("academic") : undefined}
                          open={positionDialogOpen}
                          onOpenChange={setPositionDialogOpen}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <p className="flex items-start gap-2 border-t border-border/75 pt-4 text-xs leading-5 text-muted-foreground">
                  <ShieldCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{t("Email, institution membership and academic position are verified separately.")}</span>
                </p>
              </div>
            </ProfileSection>

            {/* Merged Scholarly Identity Hub */}
            <ProfileSection
              title={t("profileRedesign.academic.linksTitle")}
              subtitle={t("profileRedesign.academic.linksSubtitle")}
              icon={Link2}
            >
              <AcademicIdentityManager profile={profile} editable={owner} />
              <LegacyScholarlyLinks identities={legacyLinks} />
              {githubLinks.length > 0 ? (
                <div className="mt-4 space-y-2 border-t border-border/70 pt-4">
                  {githubLinks.map(item => (
                    <div key={item.provider} className="flex items-center justify-between text-sm">
                      <a
                        href={safeExternalUrl(item.profileUrl)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
                      >
                        <span>GitHub</span>
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                      <span className="text-xs text-muted-foreground">{t("Self-declared")}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <p className="mt-5 rounded-xl border border-border/70 bg-muted/20 p-3.5 text-xs leading-relaxed text-muted-foreground">
                {t("Scholarly profile links help people discover your work. They do not verify your academic position, affiliation, or expertise.")}
              </p>
            </ProfileSection>
          </div>
        ) : null}

        {/* ============================================================ */}
        {/* TAB 3: CÔNG TRÌNH & ĐÓNG GÓP (RESEARCH PORTFOLIO)            */}
        {/* ============================================================ */}
        {activeTab === "portfolio" ? (
          <div className="space-y-6">
            {/* Section 3.1: Công trình khoa học (Publications) */}
            <ProfileSection
              title={t("profileRedesign.portfolio.publications")}
              subtitle={t("profileRedesign.portfolio.subtitle")}
              icon={FileText}
              action={
                owner ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => edit("works")}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t("profileRedesign.portfolio.manageFeatured")}</span>
                  </Button>
                ) : undefined
              }
            >
              {publications.length > 0 || draftWorks.length > 0 ? (
                <ul className="divide-y divide-border/75">
                  {publications.map((work, index) => (
                    <li
                      key={`pub-${work.paperId ?? work.doi ?? work.title}-${index}`}
                      className="py-3.5 first:pt-0 last:pb-0 space-y-1"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="text-sm font-semibold text-foreground">
                          <WorkTitle work={work} />
                        </h3>
                        {work.year ? (
                          <Badge variant="secondary" className="h-5 text-[11px] tabular-nums">
                            {work.year}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t(workKindLabels[work.kind ?? "PAPER"])}
                        {work.doi ? ` · DOI: ${work.doi}` : ""}
                        {!work.canonical ? ` · ${t("Self-declared")}` : ""}
                      </p>
                    </li>
                  ))}
                  {draftWorks.map((work, index) => (
                    <li
                      key={`draft-${work.submissionId ?? work.reportId ?? work.gapId ?? work.title}-${index}`}
                      className="py-3.5 first:pt-0 last:pb-0 space-y-1"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-foreground">
                          <WorkTitle work={work} />
                        </h3>
                        <Badge variant="outline" className="h-5 text-[10px]">
                          {t("profileRedesign.portfolio.draftNote")}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t(workKindLabels[work.kind ?? "RESEARCH_ARTIFACT"])}
                        {work.visibility === "RESTRICTED" ? ` · ${t("Visible to viewers with access")}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("profileRedesign.portfolio.publicationsEmpty")}
                </p>
              )}
            </ProfileSection>

            {/* Section 3.2: Dự án nghiên cứu (Reusing Project Membership & Mentor Relationships) */}
            <ProfileSection
              title={t("profileRedesign.portfolio.projects")}
              icon={FolderKanban}
            >
              {portfolioProjects.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {portfolioProjects.map(project => (
                    <article
                      key={project.projectId}
                      className="flex flex-col justify-between gap-2.5 rounded-xl border border-border/80 bg-muted/15 p-4"
                    >
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Link
                            to={project.href}
                            className="text-sm font-semibold text-foreground hover:text-primary hover:underline"
                          >
                            {project.title}
                          </Link>
                          <div className="flex items-center gap-1.5">
                            <Badge variant="secondary" className="h-5 text-[10px] font-semibold">
                              {t(`profileRedesign.portfolio.role.${project.role}`)}
                            </Badge>
                            {owner ? (
                              <Badge variant="outline" className="h-5 gap-1 text-[10px]">
                                {project.visibility === "PRIVATE" ? (
                                  <>
                                    <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                                    {t("profileRedesign.portfolio.privateBadge")}
                                  </>
                                ) : (
                                  t("profileRedesign.portfolio.publicBadge")
                                )}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                        {project.description ? (
                          <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                            {project.description}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        {project.researchField ? <span>{project.researchField}</span> : null}
                        {project.joinedAt ? (
                          <span>
                            {project.researchField ? "· " : ""}
                            {new Date(project.joinedAt).toLocaleDateString(language)}
                          </span>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("profileRedesign.portfolio.projectsEmpty")}
                </p>
              )}
            </ProfileSection>

            {/* Section 3.3: Đóng góp nghiên cứu (Confirmed CRediT / Contribution Records) */}
            <ProfileSection
              title={t("profileRedesign.portfolio.contributions")}
              icon={Award}
            >
              {portfolioContributions.length > 0 ? (
                <ul className="divide-y divide-border/75">
                  {portfolioContributions.map(contrib => (
                    <li key={contrib.id} className="py-3.5 first:pt-0 last:pb-0 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">{contrib.title}</p>
                        <Badge
                          variant="outline"
                          className="h-5 gap-1 border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300"
                        >
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                          <span>{t("profileRedesign.portfolio.confirmedBadge")}</span>
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {contrib.projectTitle} · {new Date(contrib.workDate).toLocaleDateString(language)}
                      </p>
                      {contrib.roles.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {contrib.roles.map(r => (
                            <span
                              key={r}
                              className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground/85"
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("profileRedesign.portfolio.contributionsEmpty")}
                </p>
              )}
            </ProfileSection>
          </div>
        ) : null}

        {/* ============================================================ */}
        {/* TAB 4: HỢP TÁC (FOCUSED ACADEMIC COLLABORATION EXPERIENCE)   */}
        {/* ============================================================ */}
        {activeTab === "collaboration" ? (
          owner ? (
            <div className="space-y-4">
              {/* Single Dominant Collaboration Availability Surface */}
              <section
                aria-labelledby={`${tabId}-collab-heading`}
                className="overflow-hidden rounded-2xl border border-border/85 bg-card shadow-xs"
              >
                <div className="border-b border-border/75 px-5 py-4 sm:px-6">
                  <h2 id={`${tabId}-collab-heading`} className="text-base font-semibold tracking-tight text-foreground">
                    {language === "vi" ? "Khả năng hợp tác" : "Collaboration availability"}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {language === "vi"
                      ? "Thiết lập độc lập từng hình thức hợp tác nghiên cứu trên LumiGap."
                      : "Manage each research collaboration mode independently."}
                  </p>
                </div>

                <div className="divide-y divide-border/75">
                  {/* ROW 1: Cộng tác nghiên cứu (Independent — ALL roles) */}
                  <div className="px-5 py-5 sm:px-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Users className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-foreground">
                            {language === "vi" ? "Cộng tác nghiên cứu" : "Research collaboration"}
                          </h3>
                          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                            {t("profileRedesign.collab.researchDesc")}
                          </p>
                          <p
                            className={cn(
                              "mt-1.5 text-xs font-medium",
                              openToCollaborate
                                ? "text-emerald-700 dark:text-emerald-400"
                                : "text-muted-foreground",
                            )}
                          >
                            {openToCollaborate
                              ? language === "vi"
                                ? "Đang mở nhận lời mời cộng tác"
                                : "Open to collaboration invitations"
                              : language === "vi"
                                ? "Tạm tắt lời mời cộng tác"
                                : "Not currently accepting collaboration invitations"}
                          </p>
                        </div>
                      </div>
                      <Switch
                        aria-label={language === "vi" ? "Cộng tác nghiên cứu" : "Research collaboration"}
                        checked={openToCollaborate}
                        pending={pendingSwitch === "collab"}
                        disabled={pendingSwitch !== null && pendingSwitch !== "collab"}
                        onCheckedChange={checked => void toggleCollaborationOpen(checked)}
                        className="mt-0.5"
                      />
                    </div>
                  </div>

                  {/* ROW 2 (Unverified Lecturer Gate): Single clean verification prompt */}
                  {lecturer && !positionVerified ? (
                    <div className="px-5 py-5 sm:px-6">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400">
                            <HandHeart className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-sm font-semibold text-foreground">
                                {language === "vi"
                                  ? "Hướng dẫn nghiên cứu & Phản biện học thuật"
                                  : "Research mentoring & Academic peer review"}
                              </h3>
                              <Badge variant="outline" className="text-[11px] font-medium">
                                {t(`profileRedesign.academic.status.${positionStatus}`)}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              {language === "vi"
                                ? "Xác minh vị trí giảng viên để sử dụng chức năng hướng dẫn nghiên cứu và phản biện học thuật."
                                : "Verify your lecturer position to enable research mentoring and academic peer review."}
                            </p>
                          </div>
                        </div>
                        <Button asChild size="sm" variant="outline" className="h-8 shrink-0 gap-1.5 text-xs">
                          <Link to="/settings/verification/lecturer">
                            <span>{language === "vi" ? "Xác minh giảng viên" : "Verify lecturer"}</span>
                            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {/* ROW 2 (Verified Lecturer): Hướng dẫn nghiên cứu */}
                  {lecturer && positionVerified ? (
                    <div className="px-5 py-5 sm:px-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <HandHeart className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-foreground">
                              {language === "vi" ? "Hướng dẫn nghiên cứu" : "Research mentoring"}
                            </h3>
                            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                              {language === "vi"
                                ? "Đồng bộ trực tiếp với Không gian giảng viên. Tắt nhận nhóm mới không ảnh hưởng nhóm đang hướng dẫn."
                                : "Synced with your Lecturer Workspace. Pausing new teams does not affect active mentorships."}
                            </p>
                            <p
                              className={cn(
                                "mt-1.5 text-xs font-medium",
                                mentoringConfigured && mentoringCapacityReached
                                  ? "text-amber-700 dark:text-amber-400"
                                  : mentoringConfigured
                                    ? "text-emerald-700 dark:text-emerald-400"
                                    : "text-muted-foreground",
                              )}
                            >
                              {mentoringConfigured && mentoringCapacityReached
                                ? language === "vi"
                                  ? "Đã bật nhận hướng dẫn · Hiện đã đạt giới hạn tiếp nhận"
                                  : "Mentoring enabled · Currently at full mentoring capacity"
                                : mentoringConfigured
                                  ? language === "vi"
                                    ? "Đang nhận nhóm mới"
                                    : "Accepting new teams"
                                  : language === "vi"
                                    ? "Tạm ngừng nhận nhóm mới"
                                    : "Not currently accepting new teams"}
                            </p>
                          </div>
                        </div>
                        <Switch
                          aria-label={language === "vi" ? "Hướng dẫn nghiên cứu" : "Research mentoring"}
                          checked={mentoringConfigured}
                          pending={pendingSwitch === "mentoring" || saveMentoringPref.isPending}
                          disabled={pendingSwitch !== null && pendingSwitch !== "mentoring"}
                          onCheckedChange={checked => void toggleMentoringOpen(checked)}
                          className="mt-0.5"
                        />
                      </div>

                      {/* Compact Scannable Mentoring Summary + Drawer Trigger */}
                      <div className="mt-3.5 pl-11 space-y-2.5">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span className="tabular-nums">
                            {language === "vi"
                              ? `Đang hướng dẫn ${activeMentoredCount} nhóm`
                              : `Mentoring ${activeMentoredCount} team(s)`}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums">
                            {maxActiveProjects !== null
                              ? language === "vi"
                                ? `Giới hạn: ${maxActiveProjects} (còn ${remainingMentoringSlots ?? 0})`
                                : `Limit: ${maxActiveProjects} (${remainingMentoringSlots ?? 0} remaining)`
                              : language === "vi"
                                ? "Chưa cung cấp giới hạn"
                                : "Limit not provided"}
                          </span>
                          {externalGroupCount !== null ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">
                                {language === "vi"
                                  ? `Nhóm bên ngoài (tự khai báo): ${externalGroupCount}`
                                  : `External groups (self-declared): ${externalGroupCount}`}
                              </span>
                            </>
                          ) : null}
                        </div>

                        {effectiveSupportTopics.length > 0 || effectiveSupportTypes.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {effectiveSupportTopics.slice(0, 4).map(topic => (
                              <Badge key={`mt-${topic}`} variant="secondary" className="text-[11px] font-medium">
                                {topic}
                              </Badge>
                            ))}
                            {effectiveSupportTopics.length > 4 ? (
                              <span className="text-[11px] text-muted-foreground">
                                +{effectiveSupportTopics.length - 4}
                              </span>
                            ) : null}
                            {effectiveSupportTypes.slice(0, 3).map(code => (
                              <Badge key={`ms-${code}`} variant="outline" className="text-[11px] font-normal">
                                {formatSupportLabel(code, language, t)}
                              </Badge>
                            ))}
                            {effectiveSupportTypes.length > 3 ? (
                              <span className="text-[11px] text-muted-foreground">
                                +{effectiveSupportTypes.length - 3}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            {language === "vi"
                              ? "Chưa chọn chủ đề ưu tiên và nội dung hỗ trợ."
                              : "No preferred topics or support areas selected yet."}
                          </p>
                        )}

                        <div>
                          <button
                            type="button"
                            onClick={() => setMentoringDrawerOpen(true)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                          >
                            <span>{language === "vi" ? "Thiết lập hướng dẫn" : "Mentoring settings"}</span>
                            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* ROW 3 (Verified Lecturer): Phản biện học thuật */}
                  {lecturer && positionVerified ? (
                    <div className="px-5 py-5 sm:px-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-foreground">
                              {language === "vi" ? "Phản biện học thuật" : "Academic peer review"}
                            </h3>
                            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                              {t("profileRedesign.collab.reviewDesc")}
                            </p>
                            <p
                              className={cn(
                                "mt-1.5 text-xs font-medium",
                                profile.reviewAvailability.enabled
                                  ? "text-emerald-700 dark:text-emerald-400"
                                  : "text-muted-foreground",
                              )}
                            >
                              {profile.reviewAvailability.enabled
                                ? language === "vi"
                                  ? "Đang nhận lời mời phản biện"
                                  : "Open for assigned academic reviews"
                                : language === "vi"
                                  ? "Tạm ngừng nhận lời mời phản biện"
                                  : "Not currently accepting review invitations"}
                            </p>
                          </div>
                        </div>
                        <Switch
                          aria-label={language === "vi" ? "Phản biện học thuật" : "Academic peer review"}
                          checked={profile.reviewAvailability.enabled}
                          pending={pendingSwitch === "review"}
                          disabled={pendingSwitch !== null && pendingSwitch !== "review"}
                          onCheckedChange={checked => void toggleReviewOpen(checked)}
                          className="mt-0.5"
                        />
                      </div>

                      <div className="mt-3 pl-11 space-y-2">
                        {profile.reviewAvailability.enabled && profile.reviewAvailability.types.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {profile.reviewAvailability.types.slice(0, 4).map(code => (
                              <Badge key={code} variant="secondary" className="text-[11px] font-medium">
                                {t(availabilityLabels[code] ?? code)}
                              </Badge>
                            ))}
                            {profile.reviewAvailability.types.length > 4 ? (
                              <span className="text-[11px] text-muted-foreground">
                                +{profile.reviewAvailability.types.length - 4}
                              </span>
                            ) : null}
                          </div>
                        ) : null}

                        <div>
                          <button
                            type="button"
                            onClick={() => setReviewDrawerOpen(true)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                          >
                            <span>{language === "vi" ? "Thiết lập phản biện" : "Peer review settings"}</span>
                            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>

              {/* Compact Operational Link Strip (Verified Lecturer only — keeps operations in Lecturer Workspace) */}
              {lecturer && positionVerified ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/75 bg-muted/20 px-5 py-3.5">
                  <p className="text-xs text-muted-foreground">
                    {activeMentoredCount > 0
                      ? language === "vi"
                        ? `Bạn đang hướng dẫn ${activeMentoredCount} nhóm nghiên cứu trên LumiGap.`
                        : `You are currently mentoring ${activeMentoredCount} research team(s) on LumiGap.`
                      : language === "vi"
                        ? "Theo dõi lời mời, nhóm nghiên cứu và lịch sử hướng dẫn trong Không gian giảng viên."
                        : "Manage invitations, mentored teams, and supervision history in Lecturer Workspace."}
                  </p>
                  <Link
                    to="/mentor-workspace?view=projects"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                  >
                    <span>{language === "vi" ? "Quản lý nhóm hướng dẫn" : "Manage mentored teams"}</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              ) : null}

              {/* Discreet Privacy Notice ONLY when visibility/search restricts collaboration discovery */}
              {profile.profileVisibility !== "PUBLIC" || !profile.discoverability.showInResearcherSearch ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                    <span>
                      {profile.profileVisibility === "PRIVATE"
                        ? language === "vi"
                          ? "Hồ sơ đang ở chế độ riêng tư, nhóm khác sẽ không thể tìm thấy hoặc gửi yêu cầu hợp tác."
                          : "Your profile is Private; other teams cannot discover you or send collaboration requests."
                        : !profile.discoverability.showInResearcherSearch
                          ? language === "vi"
                            ? "Hồ sơ đang ẩn khỏi tìm kiếm nhà nghiên cứu, có thể hạn chế lượt khám phá."
                            : "Your profile is hidden from researcher search, which may limit discovery."
                          : language === "vi"
                            ? "Hồ sơ chỉ hiển thị với thành viên LumiGap đã đăng nhập."
                            : "Your profile is visible to signed-in LumiGap members only."}
                    </span>
                  </div>
                  <Link
                    to="/settings/profile"
                    className="inline-flex shrink-0 items-center gap-1 font-medium text-primary hover:underline"
                  >
                    <span>{language === "vi" ? "Cài đặt quyền riêng tư" : "Privacy settings"}</span>
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </div>
              ) : null}
            </div>
          ) : (
            /* VISITOR / PUBLIC VIEW: Strictly read-only, privacy-safe, zero settings controls */
            <div className="space-y-5">
              <section
                aria-labelledby={`${tabId}-public-collab-heading`}
                className="overflow-hidden rounded-2xl border border-border/85 bg-card shadow-xs"
              >
                <div className="border-b border-border/75 px-5 py-4 sm:px-6">
                  <h2 id={`${tabId}-public-collab-heading`} className="text-base font-semibold tracking-tight text-foreground">
                    {language === "vi" ? "Khả năng hợp tác" : "Collaboration availability"}
                  </h2>
                </div>

                <div className="divide-y divide-border/75">
                  {/* Visitor Row 1: Research Collaboration */}
                  <div className="flex items-start gap-3 px-5 py-4 sm:px-6">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Users className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-foreground">
                        {language === "vi" ? "Cộng tác nghiên cứu" : "Research collaboration"}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {openToCollaborate
                          ? t("profileRedesign.collab.researchEnabled")
                          : t("profileRedesign.collab.researchDisabled")}
                      </p>
                    </div>
                  </div>

                  {/* Visitor Row 2: Research Mentoring (Verified Lecturers only) */}
                  {lecturer && positionVerified ? (
                    <div className="px-5 py-4 sm:px-6 space-y-3.5">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <HandHeart className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-semibold text-foreground">
                            {language === "vi" ? "Hướng dẫn nghiên cứu" : "Research mentoring"}
                          </h3>
                          <p
                            className={cn(
                              "mt-0.5 text-xs font-medium",
                              mentoringActive
                                ? "text-emerald-700 dark:text-emerald-400"
                                : mentoringCapacityReached
                                  ? "text-amber-700 dark:text-amber-400"
                                  : "text-muted-foreground",
                            )}
                          >
                            {mentoringActive
                              ? language === "vi"
                                ? "Đang nhận hướng dẫn nhóm mới"
                                : "Accepting new research teams"
                              : mentoringCapacityReached
                                ? language === "vi"
                                  ? "Hiện đã đạt giới hạn tiếp nhận nhóm mới"
                                  : "Currently at full mentoring capacity"
                                : language === "vi"
                                  ? "Hiện tạm ngừng nhận nhóm mới"
                                  : "Not currently accepting new teams"}
                          </p>
                          {profile.portfolio?.mentoringActivity ? (
                            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                              {language === "vi"
                                ? `Đang hướng dẫn ${profile.portfolio.mentoringActivity.activeProjectCount} nhóm`
                                : `Mentoring ${profile.portfolio.mentoringActivity.activeProjectCount} active team(s)`}
                              {profile.portfolio.mentoringActivity.maxActiveProjects !== null
                                ? language === "vi"
                                  ? ` · Giới hạn ${profile.portfolio.mentoringActivity.maxActiveProjects} (còn ${profile.portfolio.mentoringActivity.remainingSlots ?? 0})`
                                  : ` · Limit ${profile.portfolio.mentoringActivity.maxActiveProjects} (${profile.portfolio.mentoringActivity.remainingSlots ?? 0} remaining)`
                                : ""}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      {effectiveSupportTopics.length > 0 || effectiveSupportTypes.length > 0 ? (
                        <div className="pl-11 flex flex-wrap gap-1.5">
                          {effectiveSupportTopics.map(topic => (
                            <Badge key={`pub-mt-${topic}`} variant="secondary" className="text-xs font-medium">
                              {topic}
                            </Badge>
                          ))}
                          {effectiveSupportTypes.map(code => (
                            <Badge key={`pub-ms-${code}`} variant="outline" className="text-xs font-normal">
                              {formatSupportLabel(code, language, t)}
                            </Badge>
                          ))}
                        </div>
                      ) : null}

                      {mentoringActive ? (
                        <div className="pl-11 pt-1">
                          <InviteMentorFromProfile
                            mentor={{
                              _id: profile.userId,
                              fullName: profile.displayName,
                              avatarUrl: profile.avatarUrl,
                              institutionName: profile.affiliation.institutionName,
                              positionTitle: profile.positionTitle,
                              academicRole: "LECTURER",
                              verifiedLecturer: true,
                              acceptingMentorships: true,
                              expertiseAreas: expertise.researchAreas,
                              researchInterests: expertise.researchAreas,
                              matchedTerms: [],
                              sameInstitution: false,
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Visitor Row 3: Academic Peer Review (only when verified & enabled) */}
                  {lecturer && reviewAvailable ? (
                    <div className="px-5 py-4 sm:px-6 space-y-2.5">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-foreground">
                            {language === "vi" ? "Phản biện học thuật" : "Academic peer review"}
                          </h3>
                          <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                            {t("Open for assigned academic reviews")}
                          </p>
                        </div>
                      </div>
                      {profile.reviewAvailability.types.length > 0 ? (
                        <div className="pl-11 flex flex-wrap gap-1.5">
                          {profile.reviewAvailability.types.map(code => (
                            <Badge key={code} variant="secondary" className="text-xs font-medium">
                              {t(availabilityLabels[code] ?? code)}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </section>

              {/* Publicly Permitted Mentoring Experience (Visitor view ONLY — no private workload or internal review statuses) */}
              {lecturer && profile.portfolio?.mentoringActivity && profile.portfolio.mentoringActivity.currentProjects.length > 0 ? (
                <section className="overflow-hidden rounded-2xl border border-border/85 bg-card shadow-xs">
                  <div className="border-b border-border/75 px-5 py-4 sm:px-6">
                    <h3 className="text-sm font-semibold text-foreground">
                      {language === "vi" ? "Dự án hướng dẫn công khai" : "Publicly shared mentored projects"}
                    </h3>
                    {profile.portfolio.mentoringActivity.completedMentorshipCount > 0 ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {language === "vi"
                          ? `${profile.portfolio.mentoringActivity.completedMentorshipCount} dự án hướng dẫn đã hoàn thành.`
                          : `${profile.portfolio.mentoringActivity.completedMentorshipCount} completed mentorship project(s).`}
                      </p>
                    ) : null}
                  </div>
                  <ul className="divide-y divide-border/75">
                    {profile.portfolio.mentoringActivity.currentProjects.map(proj => (
                      <li key={proj.projectId} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 sm:px-6 text-xs">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{proj.title}</p>
                          <p className="mt-0.5 text-muted-foreground">
                            {proj.researchField ? `${proj.researchField} · ` : ""}
                            {proj.mentorRole === "PRIMARY"
                              ? language === "vi"
                                ? "Cố vấn chính"
                                : "Primary mentor"
                              : proj.mentorRole === "SECONDARY"
                                ? language === "vi"
                                  ? "Đồng hướng dẫn"
                                  : "Co-mentor"
                                : language === "vi"
                                  ? "Cố vấn"
                                  : "Mentor"}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="text-[11px]">
                            {proj.mentorshipStatus === "ACTIVE"
                              ? language === "vi"
                                ? "Đang hướng dẫn"
                                : "Active"
                              : proj.mentorshipStatus === "COMPLETED"
                                ? language === "vi"
                                  ? "Đã hoàn thành"
                                  : "Completed"
                                : language === "vi"
                                  ? "Đã kết thúc"
                                  : "Ended"}
                          </Badge>
                          {proj.publicationStatus?.toLowerCase() === "published" ? (
                            <Badge variant="secondary" className="text-[11px]">
                              {language === "vi" ? "Đã công bố" : "Published"}
                            </Badge>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          )
        ) : null}

        {/* ============================================================ */}
        {/* OWNER-ONLY PRIVATE TAB: ĐÓNG GÓP NGHIÊN CỨU CÁ NHÂN          */}
        {/* ============================================================ */}
        {owner && activeTab === "contributions" ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2.5 rounded-xl border border-border/80 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span>
                {language === "vi"
                  ? "Hồ sơ đóng góp cá nhân này chỉ hiển thị riêng cho bạn và không tự động công khai trên hồ sơ học thuật công khai."
                  : "This personal contribution record is private to you and is never automatically published on your public academic profile."}
              </span>
            </div>
            <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-muted/40" />}>
              <PersonalContributionProfileLazy scope="global" embedded />
            </Suspense>
          </div>
        ) : null}
      </div>

      {/* Unified Edit Profile Dialog & Avatar Dialog */}
      {owner && editableProfile ? (
        <>
          <Dialog
            open={Boolean(activeEdit)}
            onOpenChange={open => {
              if (!open) close();
            }}
          >
            <DialogContent className="flex max-h-[88dvh] max-w-2xl flex-col overflow-hidden rounded-2xl">
              <DialogHeader>
                <DialogTitle>{editDialogTitle}</DialogTitle>
                <DialogDescription>{t("profileRedesign.editor.subtitle")}</DialogDescription>
              </DialogHeader>
              <div className="min-h-0 overflow-y-auto pr-1">
                <Suspense fallback={<p role="status" className="py-5 text-sm">{t("Loading…")}</p>}>
                  {activeEdit ? (
                    <InlineEditor
                      key={`${editableProfile.updatedAt}-${activeEdit}`}
                      section={activeEdit}
                      profile={editableProfile}
                      onClose={close}
                      onOpenAvatar={() => setAvatarOpen(true)}
                    />
                  ) : null}
                </Suspense>
              </div>
            </DialogContent>
          </Dialog>
          <ProfileAvatarDialog open={avatarOpen} currentAvatar={avatar} onOpenChange={setAvatarOpen} />
          {lecturer && positionVerified ? (
            <>
              <MentoringSettingsDrawer
                open={mentoringDrawerOpen}
                onOpenChange={setMentoringDrawerOpen}
                profileExpertiseTerms={allProfileExpertiseTerms}
                fallbackPreferences={{
                  acceptingMentorships: mentoringConfigured,
                  canEnable: true,
                  activeProjectCount: activeMentoredCount,
                  maxActiveProjects,
                  remainingSlots: remainingMentoringSlots,
                  externalGroupCount,
                  supportTypes: effectiveSupportTypes,
                  preferredTopics: effectiveSupportTopics,
                  preferredRoles: profile.supportAvailability.preferredRoles ?? [],
                  expectedFrequency: profile.supportAvailability.expectedFrequency,
                  expectedDuration: profile.supportAvailability.expectedDuration,
                  communicationMode: profile.supportAvailability.communicationMode,
                  note: profile.supportAvailability.note,
                }}
              />
              <ReviewSettingsDrawer
                open={reviewDrawerOpen}
                onOpenChange={setReviewDrawerOpen}
                profile={editableProfile}
                profileExpertiseTerms={allProfileExpertiseTerms}
              />
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function LecturerVerificationReminder({ status, onVerify }: { status: string; onVerify: () => void }) {
  const { t } = useI18n();
  const headingId = useId();
  const pending = status === "PENDING";
  const needsInfo = status === "NEEDS_MORE_INFORMATION";
  const Icon = pending ? Clock3 : ShieldCheck;
  const title = pending
    ? "Your Lecturer verification is under review"
    : needsInfo
      ? "Complete your Lecturer verification"
      : "Verify your Lecturer status";
  const description = pending
    ? "Your request has been submitted. You can keep using LumiGap while an administrator reviews it."
    : needsInfo
      ? "Additional information is needed. Review the feedback and update your verification evidence."
      : "Verify your academic position to join mentoring and formal academic review when assigned. Your core research tools remain available.";
  const action = pending
    ? "View verification status"
    : needsInfo
      ? "Update verification"
      : status === "REJECTED"
        ? "Submit new verification"
        : "Verify Lecturer Status";

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "mx-5 mb-5 flex flex-col gap-3 rounded-xl border p-4 sm:mx-7 sm:flex-row sm:items-center sm:justify-between",
        pending
          ? "border-sky-200/80 bg-sky-50/70 dark:border-sky-900/60 dark:bg-sky-950/30"
          : "border-amber-200/80 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/25",
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            pending
              ? "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300"
              : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h2 id={headingId} className="text-sm font-semibold text-foreground">
            {t(title)}
          </h2>
          <p className="mt-0.5 max-w-2xl text-xs leading-5 text-muted-foreground">{t(description)}</p>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onVerify}
        className="shrink-0 self-start rounded-lg text-xs font-semibold sm:self-auto"
      >
        {t(action)}
      </Button>
    </section>
  );
}

function ProfileSection({
  title,
  subtitle,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={cardClass}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-foreground">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function CompactEditLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-7 gap-1 px-2 text-xs font-medium text-muted-foreground hover:text-primary"
      onClick={onClick}
    >
      <Pencil className="h-3 w-3" aria-hidden="true" />
      <span>{label}</span>
    </Button>
  );
}

function ExpertiseGroup({
  title,
  values,
  tone,
}: {
  title: string;
  values: string[];
  tone: "area" | "skill" | "method";
}) {
  const { t } = useI18n();
  if (!values.length) return null;
  const chipClass =
    tone === "area"
      ? "border-blue-500/25 bg-blue-500/[0.08] text-blue-800 dark:text-blue-200"
      : tone === "method"
        ? "border-indigo-500/25 bg-indigo-500/[0.08] text-indigo-800 dark:text-indigo-200"
        : "border-border bg-muted/45 text-foreground/90";

  return (
    <div>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="flex flex-wrap gap-2">
        {values.map(value => (
          <span
            key={value}
            className={cn(
              "max-w-full break-words rounded-lg border px-2.5 py-1 text-xs font-medium",
              chipClass,
            )}
          >
            {t(value)}
          </span>
        ))}
      </div>
    </div>
  );
}

function VerificationScopePill({
  label,
  status,
  t,
}: {
  label: string;
  status: string;
  t: (key: string) => string;
}) {
  const verified = status === "VERIFIED";
  const pending = status === "PENDING";
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-border/75 bg-background px-3.5 py-2.5 text-xs">
      <span className="font-medium text-foreground">{label}</span>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
          verified
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : pending
              ? "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"
              : "border-border bg-muted/50 text-muted-foreground",
        )}
      >
        {verified ? (
          <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
        ) : pending ? (
          <Clock3 className="h-3 w-3 shrink-0" aria-hidden="true" />
        ) : null}
        <span>{t(`profileRedesign.academic.status.${status}`)}</span>
      </span>
    </div>
  );
}

function OwnerPrompt({ text, label, onClick }: { text: string; label: string; onClick: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-muted/15 px-4 py-3.5 text-xs text-muted-foreground">
      <p>{text}</p>
      <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={onClick}>
        <Plus className="h-3 w-3" aria-hidden="true" />
        <span>{label}</span>
      </Button>
    </div>
  );
}

function WorkTitle({ work }: { work: VisibleProfile["featuredWorks"][number] }) {
  const { t } = useI18n();
  const title = work.title ?? work.doi ?? t("Research work");
  if (work.href?.startsWith("/") && !work.href.startsWith("//") && !work.href.includes("\\")) {
    return (
      <Link to={work.href} className="hover:text-primary hover:underline">
        {title}
      </Link>
    );
  }
  const href = safeExternalUrl(work.href);
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="hover:text-primary hover:underline">
      {title}
    </a>
  ) : (
    <>{title}</>
  );
}

function safeExternalUrl(value?: string) {
  try {
    const url = new URL(value ?? "");
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
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
    if (identity.provider === "SEMANTIC_SCHOLAR") {
      href = `https://www.semanticscholar.org/author/${encodeURIComponent(identity.externalId)}`;
    }
  }
  return safeExternalUrl(href);
}

function LegacyScholarlyLinks({ identities }: { identities: VisibleProfile["externalIdentities"] }) {
  const { t } = useI18n();
  const labels: Record<string, string> = {
    ORCID: "ORCID",
    OPENALEX: "OpenAlex",
    GOOGLE_SCHOLAR: "Google Scholar",
    SEMANTIC_SCHOLAR: "Semantic Scholar",
    OTHER: "Other academic profile",
  };
  const valid = identities.filter(item => Boolean(scholarlyUrl(item)));
  if (!valid.length) return null;
  return (
    <ul className="mt-4 space-y-2 border-t border-border/70 pt-4">
      {valid.map(identity => {
        const href = scholarlyUrl(identity)!;
        return (
          <li key={identity.provider} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              {labels[identity.provider]}
            </a>
            <span className="text-xs text-muted-foreground">{t("Self-declared")}</span>
          </li>
        );
      })}
    </ul>
  );
}
