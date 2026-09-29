import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { AcademicProfile, AcademicTitle, PublicAcademicProfile } from "@trend/shared-types";
import {
  ACADEMIC_BIOGRAPHY_MAX_CHARACTERS,
  ACADEMIC_BIOGRAPHY_MAX_WORDS,
  countAcademicBiographyWords,
} from "@trend/shared-types";
import {
  ArrowRight,
  Award,
  BadgeCheck,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  Compass,
  Copy,
  ExternalLink,
  Eye,
  FileText,
  Fingerprint,
  Globe,
  GraduationCap,
  HandHeart,
  Layers,
  Link2,
  Lock,
  LockKeyhole,
  MailCheck,
  MapPin,
  MessageSquareQuote,
  Pencil,
  Plus,
  Search,
  Settings2,
  Share2,
  ShieldCheck,
  Sparkles,
  Tag,
  University,
  UserCheck,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n";
import { toast } from "sonner";
import { cn } from "@/utils/cn";
import {
  useAcademicAvatar,
  useAcademicCover,
  useUpdateAcademicProfile,
} from "../hooks/use-academic-profile";
import type { EditSection } from "./academic-profile-inline-editor";
import { AcademicIdentityManager } from "./academic-identity-manager";
import { ProfileAvatarDialog } from "./profile-avatar-dialog";
import { ProfileCoverDialog } from "./profile-cover-dialog";
import { PositionVerificationPanel } from "./position-verification-panel";
import { combineAcademicBio } from "../utils/academic-bio";

const AcademicProfileInlineEditor = lazy(() =>
  import("./academic-profile-inline-editor").then((module) => ({
    default: module.AcademicProfileInlineEditor,
  })),
);

type VisibleProfile = PublicAcademicProfile | AcademicProfile;

export type ProfileTab = "overview" | "affiliation" | "identities" | "collaboration" | "settings";

const supportLabels: Record<string, string> = {
  RESEARCH_DIRECTION: "Research direction",
  LITERATURE_REVIEW: "Literature review",
  RESEARCH_GAP_VALIDATION: "Research gap validation",
  RESEARCH_METHODOLOGY: "Research methodology",
  EXPERIMENT_DESIGN: "Experiment design",
  DATA_ANALYSIS: "Data analysis",
  ACADEMIC_WRITING: "Academic writing",
  SOFTWARE_TECHNICAL_GUIDANCE: "Software guidance",
  RESEARCH_PROPOSAL: "Research proposal",
  RESEARCH_GAP: "Research gap",
  METHODOLOGY: "Methodology",
  EXPERIMENTAL_RESULTS: "Experimental results",
  RESEARCH_PAPER: "Research paper",
  SOFTWARE_RESEARCH_PROJECT: "Software research project",
};

const academicTitleOptions: AcademicTitle[] = [
  "Lecturer",
  "Senior Lecturer",
  "Assistant Professor",
  "Associate Professor",
  "Professor",
  "Research Fellow",
  "Other",
];

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

function parseCsv(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => {
      if (!item) return false;
      const key = item.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function csvMatches(value: string, items: string[]): boolean {
  return JSON.stringify(parseCsv(value)) === JSON.stringify(items);
}

function profileSaveError(
  error: unknown,
  translate: (key: string, values?: Record<string, string | number>) => string,
  locale: string,
): string {
  const response = error as {
    response?: {
      data?: {
        error?: {
          message?: string;
          details?: { nextAvailableAt?: string };
        };
      };
    };
  };
  const apiError = response.response?.data?.error;
  if (apiError?.details?.nextAvailableAt) {
    const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
      new Date(apiError.details.nextAvailableAt),
    );
    return translate(
      "Display name change limit reached. You can change it again on {{date}}.",
      { date },
    );
  }
  return translate(apiError?.message ?? "Could not save your profile changes.");
}

function safeExternalUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
    )
      return url.toString();
  } catch {
    return undefined;
  }
  return undefined;
}

export function AcademicProfileView({
  profile,
  editableProfile,
  editingSection,
  onEdit,
  onCloseEdit,
}: {
  profile: VisibleProfile;
  editableProfile?: AcademicProfile;
  editingSection?: EditSection | null;
  onEdit?: (section: EditSection) => void;
  onCloseEdit?: () => void;
}) {
  const { t, language } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();

  const academicBio = combineAcademicBio(profile.headline, profile.biography, profile.bio);
  const researchInterestsValue = profile.researchInterests.join(", ");
  const expertiseAreasValue = profile.expertiseAreas.join(", ");
  const skillsValue = profile.skills.join(", ");
  const researchKeywordsValue = profile.researchKeywords.join(", ");

  const [activeTab, setActiveTab] = useState<ProfileTab>(() => {
    const tabParam = searchParams.get("tab");
    if (
      tabParam === "affiliation" ||
      tabParam === "identities" ||
      tabParam === "collaboration" ||
      tabParam === "settings"
    ) {
      return tabParam;
    }
    if (editingSection === "affiliation") return "affiliation";
    if (editingSection === "works") return "overview";
    if (editingSection === "availability") return "collaboration";
    if (editingSection === "link") return "settings";
    return "overview";
  });

  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [coverDialogOpen, setCoverDialogOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editModalTab, setEditModalTab] = useState<"general" | "research" | "privacy">("general");

  // Edit draft states
  const [displayNameDraft, setDisplayNameDraft] = useState(profile.displayName);
  const [biographyDraft, setBiographyDraft] = useState(academicBio);
  const [academicTitleDraft, setAcademicTitleDraft] = useState(profile.academicTitle ?? "");
  const [profileVisibilityDraft, setProfileVisibilityDraft] = useState(profile.profileVisibility);
  const [showInResearcherSearchDraft, setShowInResearcherSearchDraft] = useState(
    profile.discoverability.showInResearcherSearch,
  );
  const [allowCollaborationRequestsDraft, setAllowCollaborationRequestsDraft] = useState(
    profile.discoverability.allowCollaborationRequests,
  );
  const [researchInterestsDraft, setResearchInterestsDraft] = useState(researchInterestsValue);
  const [expertiseAreasDraft, setExpertiseAreasDraft] = useState(expertiseAreasValue);
  const [skillsDraft, setSkillsDraft] = useState(skillsValue);
  const [researchKeywordsDraft, setResearchKeywordsDraft] = useState(researchKeywordsValue);
  const [introSaveError, setIntroSaveError] = useState<string | null>(null);

  const authenticatedCoverSrc = useAcademicCover(profile.coverUrl);
  const avatarSrc = useAcademicAvatar(profile.avatarUrl);
  const updateProfile = useUpdateAcademicProfile();

  const owner = Boolean(editableProfile);
  const isLecturer = profile.primaryPosition === "LECTURER";
  const isStudent = profile.academicType === "student" || profile.primaryPosition === "STUDENT";
  const institution = profile.affiliation.institutionName;

  const namePolicy = editableProfile?.displayNamePolicy;
  const nameChangesRemaining = namePolicy?.remainingChanges ?? 2;
  const nextNameChangeDate = namePolicy?.nextAvailableAt
    ? new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(
        new Date(namePolicy.nextAvailableAt),
      )
    : undefined;

  const namePolicyMessage =
    nameChangesRemaining === 0
      ? nextNameChangeDate
        ? t(
            "Display name change limit reached. You can change it again on {{date}}.",
            { date: nextNameChangeDate },
          )
        : t(
            "Display name change limit reached. You can change it again after the 30-day window.",
          )
      : t(
          "{{remaining}} of {{max}} display name changes available in the last {{days}} days.",
          {
            remaining: nameChangesRemaining,
            max: namePolicy?.maxChanges ?? 2,
            days: namePolicy?.windowDays ?? 30,
          },
        );

  const biographyWordCount = countAcademicBiographyWords(biographyDraft);
  const isIntroDirty =
    displayNameDraft.trim() !== profile.displayName ||
    biographyDraft.trim() !== academicBio ||
    academicTitleDraft !== (profile.academicTitle ?? "") ||
    profileVisibilityDraft !== profile.profileVisibility ||
    showInResearcherSearchDraft !== profile.discoverability.showInResearcherSearch ||
    allowCollaborationRequestsDraft !== profile.discoverability.allowCollaborationRequests ||
    !csvMatches(researchInterestsDraft, profile.researchInterests) ||
    !csvMatches(expertiseAreasDraft, profile.expertiseAreas) ||
    !csvMatches(skillsDraft, profile.skills) ||
    !csvMatches(researchKeywordsDraft, profile.researchKeywords);

  const showAvailability =
    profile.supportAvailability.enabled || profile.reviewAvailability.enabled;

  const primaryAreas = useMemo(() => {
    return Array.from(new Set(profile.expertiseAreas.map((s) => s.trim()))).filter(Boolean);
  }, [profile.expertiseAreas]);

  const specificInterests = useMemo(() => {
    const primaryLower = new Set(primaryAreas.map((s) => s.toLowerCase()));
    return Array.from(new Set(profile.researchInterests.map((s) => s.trim())))
      .filter((s) => Boolean(s) && !primaryLower.has(s.toLowerCase()));
  }, [primaryAreas, profile.researchInterests]);

  const uniqueKeywords = useMemo(() => {
    const existing = new Set([
      ...primaryAreas.map((s) => s.toLowerCase()),
      ...specificInterests.map((s) => s.toLowerCase()),
      ...profile.skills.map((s) => s.toLowerCase()),
    ]);
    return Array.from(new Set(profile.researchKeywords.map((s) => s.trim())))
      .filter((kw) => Boolean(kw) && !existing.has(kw.toLowerCase()));
  }, [primaryAreas, specificInterests, profile.skills, profile.researchKeywords]);

  const hasResearch =
    primaryAreas.length > 0 ||
    specificInterests.length > 0 ||
    profile.skills.length > 0 ||
    uniqueKeywords.length > 0;

  const professionalLinks = profile.externalIdentities.filter(
    (identity) => identity.provider === "GITHUB" && safeExternalUrl(identity.profileUrl),
  );

  const roleTitle = isStudent
    ? t("Student")
    : isLecturer
      ? t("Lecturer")
      : t("Researcher");

  const title = isStudent
    ? t("Student")
    : profile.positionTitle ||
      profile.affiliation.positionTitle ||
      profile.affiliation.position ||
      profile.academicTitle ||
      roleTitle;

  const coverSrc = authenticatedCoverSrc;
  const publicPath = `/academics/${profile.userId}`;
  const publicUrl =
    typeof window === "undefined"
      ? publicPath
      : `${window.location.origin}${publicPath}`;

  const isVerifiedAffiliation =
    profile.verificationStatuses?.affiliation === "VERIFIED" ||
    profile.verificationStatuses?.position === "VERIFIED" ||
    profile.verificationStatuses?.email === "VERIFIED";

  // Sync state with incoming profile props
  useEffect(() => {
    if (isEditModalOpen) return;
    setDisplayNameDraft(profile.displayName);
    setBiographyDraft(academicBio);
    setAcademicTitleDraft(profile.academicTitle ?? "");
    setProfileVisibilityDraft(profile.profileVisibility);
    setShowInResearcherSearchDraft(profile.discoverability.showInResearcherSearch);
    setAllowCollaborationRequestsDraft(profile.discoverability.allowCollaborationRequests);
    setResearchInterestsDraft(researchInterestsValue);
    setExpertiseAreasDraft(expertiseAreasValue);
    setSkillsDraft(skillsValue);
    setResearchKeywordsDraft(researchKeywordsValue);
  }, [
    profile.displayName,
    academicBio,
    profile.academicTitle,
    profile.profileVisibility,
    profile.discoverability.showInResearcherSearch,
    profile.discoverability.allowCollaborationRequests,
    researchInterestsValue,
    expertiseAreasValue,
    skillsValue,
    researchKeywordsValue,
    isEditModalOpen,
  ]);

  // Sync active tab with searchParams or editingSection
  useEffect(() => {
    if (editingSection === "affiliation") setActiveTab("affiliation");
    else if (editingSection === "works") setActiveTab("overview");
    else if (editingSection === "availability") setActiveTab("collaboration");
    else if (editingSection === "link") setActiveTab("settings");
  }, [editingSection]);

  const handleTabChange = (tab: ProfileTab) => {
    setActiveTab(tab);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", tab);
        return next;
      },
      { replace: true },
    );
  };

  async function saveProfileModal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIntroSaveError(null);
    const nextName = displayNameDraft.trim();
    const nextBiography = biographyDraft.trim();
    if (!nextName) {
      setIntroSaveError(t("Display name is required."));
      return;
    }
    if (
      nextBiography.length > ACADEMIC_BIOGRAPHY_MAX_CHARACTERS ||
      countAcademicBiographyWords(nextBiography) > ACADEMIC_BIOGRAPHY_MAX_WORDS
    ) {
      setIntroSaveError(
        `Academic Bio must be ${ACADEMIC_BIOGRAPHY_MAX_WORDS} words or fewer.`,
      );
      return;
    }

    const researchLists = [
      { values: parseCsv(researchInterestsDraft), maxItems: 30 },
      { values: parseCsv(expertiseAreasDraft), maxItems: 30 },
      { values: parseCsv(skillsDraft), maxItems: 40 },
      { values: parseCsv(researchKeywordsDraft), maxItems: 40 },
    ];
    if (researchLists.some(({ values }) => values.some((value) => value.length > 120))) {
      setIntroSaveError(t("Each research topic must be 120 characters or fewer."));
      return;
    }
    const overLimitList = researchLists.find(({ values, maxItems }) => values.length > maxItems);
    if (overLimitList) {
      setIntroSaveError(
        t("Use no more than {{max}} entries in this field.", {
          max: overLimitList.maxItems,
        }),
      );
      return;
    }

    try {
      const updated = await updateProfile.mutateAsync({
        ...(nextName !== profile.displayName ? { displayName: nextName } : {}),
        headline: "",
        biography: nextBiography,
        profileVisibility: profileVisibilityDraft,
        discoverability: {
          showInResearcherSearch: showInResearcherSearchDraft,
          allowCollaborationRequests: allowCollaborationRequestsDraft,
        },
        researchInterests: parseCsv(researchInterestsDraft),
        expertiseAreas: parseCsv(expertiseAreasDraft),
        skills: parseCsv(skillsDraft),
        researchKeywords: parseCsv(researchKeywordsDraft),
        ...(!isStudent
          ? {
              academicTitle: academicTitleDraft
                ? (academicTitleDraft as AcademicTitle)
                : null,
            }
          : {}),
      });
      setDisplayNameDraft(updated.displayName);
      setBiographyDraft(
        combineAcademicBio(updated.headline, updated.biography, updated.bio),
      );
      setResearchInterestsDraft(updated.researchInterests.join(", "));
      setExpertiseAreasDraft(updated.expertiseAreas.join(", "));
      setSkillsDraft(updated.skills.join(", "));
      setResearchKeywordsDraft(updated.researchKeywords.join(", "));
      setIsEditModalOpen(false);
      onCloseEdit?.();
      toast.success(t("Academic profile saved. Welcome to LumiGap!"));
    } catch (error) {
      setIntroSaveError(profileSaveError(error, t, language));
    }
  }

  async function copyPublicUrl() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopyState("copied");
      toast.success(t("Public profile link copied to clipboard!"));
      setTimeout(() => setCopyState("idle"), 2500);
    } catch {
      setCopyState("failed");
      toast.error(t("Could not copy link."));
    }
  }

  const editor = (section: Exclude<EditSection, "intro">) =>
    editingSection === section && editableProfile ? (
      <Suspense
        fallback={
          <div className="mt-5 h-28 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
        }
      >
        <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/40 p-5 dark:border-blue-900/60 dark:bg-blue-950/20">
          <AcademicProfileInlineEditor
            key={section}
            section={section}
            profile={editableProfile}
            onClose={() => onCloseEdit?.()}
          />
        </div>
      </Suspense>
    ) : null;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-4 sm:px-6 sm:pt-6 lg:px-8">
      {/* 1. Hero Card: Cover + Avatar + Scholar Identity Header */}
      <header className="group/hero relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm transition-all dark:border-white/10 dark:bg-[#11131a]">
        {/* Banner Cover Area */}
        <div
          onClick={() => owner && setCoverDialogOpen(true)}
          className={cn(
            "relative h-44 w-full overflow-hidden bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-950 sm:h-52 lg:h-60",
            owner && "cursor-pointer group/banner",
          )}
        >
          {coverSrc && failedCover !== profile.coverUrl ? (
            <img
              src={coverSrc}
              alt=""
              onError={() => setFailedCover(profile.coverUrl ?? null)}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover/banner:scale-105"
            />
          ) : (
            <div
              aria-hidden="true"
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 15% 30%, rgba(59, 130, 246, 0.45), transparent 45%), radial-gradient(circle at 85% 70%, rgba(99, 102, 241, 0.35), transparent 45%), linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
                backgroundSize: "100% 100%, 100% 100%, 32px 32px, 32px 32px",
              }}
            />
          )}
          {coverSrc && failedCover !== profile.coverUrl && (
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
          )}

          {/* Academic Network Branding */}
          <div className="absolute right-6 top-6 hidden items-center gap-2 rounded-full border border-white/15 bg-slate-950/40 px-3.5 py-1 text-[11px] font-semibold tracking-wider text-blue-200/90 backdrop-blur-md sm:flex z-10">
            <Sparkles className="h-3 w-3 text-blue-400" />
            <span>{t("LumiGap Academic Network")}</span>
          </div>

          {/* Owner: Change Cover Action */}
          {owner && (
            <button
              type="button"
              aria-label={profile.coverUrl ? t("Change cover image") : t("Add cover image")}
              onClick={(e) => {
                e.stopPropagation();
                setCoverDialogOpen(true);
              }}
              className="absolute bottom-4 right-4 z-30 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/25 bg-slate-950/70 px-3.5 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-md transition-all hover:bg-slate-900 hover:scale-105 active:scale-95 focus-visible:ring-2 focus-visible:ring-blue-500 sm:bottom-5 sm:right-6"
            >
              <Camera className="h-3.5 w-3.5 text-blue-300" />
              <span>{profile.coverUrl ? t("Change cover") : t("Add cover")}</span>
            </button>
          )}
        </div>

        {/* Floating Identity & Info Row */}
        <div className="relative px-5 pb-6 sm:px-8 sm:pb-8">
          {/* Top Avatar & Actions Row */}
          <div className="-mt-16 sm:-mt-20 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            {/* Avatar */}
            <div className="relative">
              <button
                type="button"
                disabled={!owner}
                aria-label={owner ? t("Change profile photo") : undefined}
                onClick={() => owner && setAvatarDialogOpen(true)}
                className={cn(
                  "group relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-700 text-3xl font-extrabold text-white shadow-xl ring-2 ring-slate-200/60 transition-all dark:border-[#11131a] dark:ring-white/10 sm:h-36 sm:w-36",
                  owner && "cursor-pointer hover:ring-blue-500",
                )}
              >
                {avatarSrc ? (
                  <img
                    src={avatarSrc}
                    alt={`${profile.displayName} avatar`}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <span className="tracking-wider">{initials(profile.displayName)}</span>
                )}
                {owner && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/60 text-white opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-hover:opacity-100">
                    <Camera className="h-5 w-5" />
                    <span className="mt-1 text-[10px] font-bold">{t("Update")}</span>
                  </div>
                )}
              </button>
            </div>

            {/* Quick Action Toolbar */}
            <div className="flex flex-wrap items-center gap-2 sm:pb-1">
              {owner ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setEditModalTab("general");
                      setIsEditModalOpen(true);
                    }}
                    className="h-9 gap-1.5 rounded-xl bg-blue-600 px-4 text-xs font-bold text-white shadow-sm shadow-blue-600/25 transition-all hover:bg-blue-700 active:scale-95"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    <span>{t("Edit profile")}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void copyPublicUrl()}
                    className="h-9 gap-1.5 rounded-xl border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200"
                  >
                    <Share2 className="h-3.5 w-3.5 text-slate-500" />
                    <span>{copyState === "copied" ? t("Copied!") : t("Share profile")}</span>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 rounded-xl border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-200"
                  >
                    <Link to={publicPath}>
                      <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
                      <span>{t("Public view")}</span>
                    </Link>
                  </Button>
                </>
              ) : (
                profile.discoverability.allowCollaborationRequests && (
                  <>
                    <Button asChild size="sm" variant="outline" className="h-9 rounded-xl">
                      <Link to="/communities">{t("Connect")}</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="h-9 rounded-xl">
                      <Link to="/projects">{t("Invite to project")}</Link>
                    </Button>
                    {profile.supportAvailability.enabled && (
                      <Button asChild size="sm" className="h-9 rounded-xl bg-blue-600 text-white hover:bg-blue-700">
                        <Link to="/communities">{t("Request support")}</Link>
                      </Button>
                    )}
                  </>
                )
              )}
            </div>
          </div>

          {/* Scholar Persona Information with Proper Top Spacing */}
          <div className="mt-4 sm:mt-5 space-y-2">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white">
                {profile.displayName}
              </h1>
              {isVerifiedAffiliation && (
                <BadgeCheck
                  className="h-5 w-5 text-blue-600 dark:text-blue-400"
                  aria-label={t("Verified")}
                />
              )}
            </div>

            {/* Role, Title & Institution Row */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
              {/* Role Badge */}
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-0.5 font-bold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                {isStudent ? (
                  <GraduationCap className="h-4 w-4" />
                ) : isLecturer ? (
                  <Award className="h-4 w-4" />
                ) : (
                  <BookOpen className="h-4 w-4" />
                )}
                <span>{title}</span>
              </span>

              {/* Institution and Department */}
              {institution && (
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                  <University className="h-4 w-4 text-slate-400" />
                  <span>{institution}</span>
                  {profile.affiliation.department && (
                    <span className="text-slate-400">· {profile.affiliation.department}</span>
                  )}
                </span>
              )}

              {/* Public handle */}
              {profile.publicHandle && (
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-600 dark:bg-white/5 dark:text-slate-400">
                  <span>@{profile.publicHandle}</span>
                </span>
              )}
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="mt-5 flex flex-wrap items-center gap-2.5 border-t border-slate-100 pt-4 dark:border-white/5">
            <div className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100/80 px-3 py-1 text-xs text-slate-700 dark:bg-white/[0.04] dark:text-slate-300">
              <span className="font-bold text-slate-900 dark:text-white">
                {primaryAreas.length}
              </span>
              <span className="text-slate-500 dark:text-slate-400">{t("Research areas")}</span>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100/80 px-3 py-1 text-xs text-slate-700 dark:bg-white/[0.04] dark:text-slate-300">
              <span className="font-bold text-slate-900 dark:text-white">
                {profile.externalIdentities.length}
              </span>
              <span className="text-slate-500 dark:text-slate-400">{t("Scholarly IDs")}</span>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100/80 px-3 py-1 text-xs text-slate-700 dark:bg-white/[0.04] dark:text-slate-300">
              <span className="font-bold text-slate-900 dark:text-white">
                {profile.featuredWorks.length}
              </span>
              <span className="text-slate-500 dark:text-slate-400">{t("Featured works")}</span>
            </div>
            {showAvailability && (
              <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>{t("Open for collaboration")}</span>
              </div>
            )}
          </div>
          {editor("cover")}
        </div>

        {/* Modern Segmented Navigation Tabs */}
        <nav
          aria-label={t("Profile navigation tabs")}
          className="flex overflow-x-auto border-t border-slate-200/80 bg-slate-50/60 p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden dark:border-white/5 dark:bg-white/[0.02] sm:px-6"
        >
          <div className="flex min-w-max gap-1.5">
            {[
              {
                id: "overview" as ProfileTab,
                label: t("Overview & Research"),
                icon: BookOpen,
              },
              {
                id: "affiliation" as ProfileTab,
                label: isStudent ? t("Academic Affiliation") : t("Affiliation & Verification"),
                icon: Building2,
              },
              {
                id: "identities" as ProfileTab,
                label: t("Scholarly Identities"),
                icon: Link2,
                badge: profile.externalIdentities.length,
              },
              {
                id: "collaboration" as ProfileTab,
                label: t("Collaboration & Review"),
                icon: HandHeart,
              },
              {
                id: "settings" as ProfileTab,
                label: t("Privacy & Settings"),
                icon: Settings2,
              },
            ].map(({ id, label, icon: Icon, badge }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleTabChange(id)}
                  aria-selected={active}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all sm:text-sm",
                    active
                      ? "bg-white text-blue-600 shadow-sm shadow-slate-900/5 dark:bg-slate-800 dark:text-white"
                      : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white",
                  )}
                >
                  <Icon className={cn("h-4 w-4", active ? "text-blue-600 dark:text-blue-400" : "text-slate-400")} />
                  <span>{label}</span>
                  {typeof badge === "number" && badge > 0 && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.2 text-[10px] font-bold leading-none",
                        active
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                          : "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-slate-300",
                      )}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      {/* 2. Main Tabbed Content Panels */}
      <div className="mt-8">
        {/* TAB 1: OVERVIEW & RESEARCH */}
        {activeTab === "overview" && (
          <div className="grid items-start gap-6 lg:grid-cols-12">
            {/* Left Col (8-col): Bio + Research Topics + Works */}
            <div className="space-y-6 lg:col-span-8">
              {/* Academic Bio Card */}
              <section className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#11131a] sm:p-7">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                      <MessageSquareQuote className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white">
                        {t("Academic Biography")}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t("Short academic statement & research focus")}
                      </p>
                    </div>
                  </div>
                  {owner && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditModalTab("general");
                        setIsEditModalOpen(true);
                      }}
                      className="gap-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span>{t("Edit")}</span>
                    </Button>
                  )}
                </div>

                {academicBio ? (
                  <div className="relative rounded-2xl bg-slate-50/70 p-5 leading-relaxed text-slate-700 dark:bg-white/[0.02] dark:text-slate-300">
                    <p className="whitespace-pre-wrap text-sm sm:text-[15px] leading-7">
                      {academicBio}
                    </p>
                  </div>
                ) : (
                  <EmptyCard
                    owner={owner}
                    text={t("Introduce yourself with a concise research bio.")}
                    action={t("Add academic bio")}
                    onAction={() => {
                      setEditModalTab("general");
                      setIsEditModalOpen(true);
                    }}
                  />
                )}
              </section>

              {/* Research Scope & Tags Card */}
              <section className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#11131a] sm:p-7">
                <div className="mb-6 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                      <GraduationCap className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white">
                        {t("Research Focus & Expertise")}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t("Disciplines, specific interests, and research skills")}
                      </p>
                    </div>
                  </div>
                  {owner && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditModalTab("research");
                        setIsEditModalOpen(true);
                      }}
                      className="gap-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span>{t("Edit topics")}</span>
                    </Button>
                  )}
                </div>

                {hasResearch ? (
                  <div className="space-y-5">
                    {/* 1. Primary Research Areas */}
                    {primaryAreas.length > 0 && (
                      <div>
                        <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          <Compass className="h-3.5 w-3.5 text-blue-500" />
                          <span>{t("Research areas")}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {primaryAreas.map((area) => (
                            <span
                              key={area}
                              className="inline-flex items-center gap-1.5 rounded-full border border-blue-200/80 bg-blue-50/80 px-3.5 py-1 text-xs font-semibold text-blue-700 shadow-2xs transition-colors hover:bg-blue-100/70 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-300"
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                              {area}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 2. Specific Research Interests */}
                    {specificInterests.length > 0 && (
                      <div>
                        <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                          <span>{t("Research interests")}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {specificInterests.map((interest) => (
                            <span
                              key={interest}
                              className="inline-flex items-center rounded-lg border border-slate-200/70 bg-slate-50/80 px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:bg-white/[0.06]"
                            >
                              {interest}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 3. Research Skills & Methodologies */}
                    {profile.skills.length > 0 && (
                      <div>
                        <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          <Wrench className="h-3.5 w-3.5 text-emerald-500" />
                          <span>{t("Research skills")}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {profile.skills.map((skill) => (
                            <span
                              key={skill}
                              className="inline-flex items-center rounded-lg border border-emerald-200/70 bg-emerald-50/60 px-3 py-0.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100/60 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 4. Keywords (distinct only) */}
                    {uniqueKeywords.length > 0 && (
                      <div>
                        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-400 dark:text-slate-500">
                          <Tag className="h-3 w-3" />
                          <span>{t("Keywords")}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {uniqueKeywords.map((kw) => (
                            <span
                              key={kw}
                              className="inline-flex items-center rounded-md border border-slate-200/50 bg-slate-50 px-2 py-0.5 text-[11px] font-mono text-slate-500 dark:border-white/5 dark:bg-slate-900/50 dark:text-slate-400"
                            >
                              #{kw.replace(/^#/, "")}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <EmptyCard
                    owner={owner}
                    text={t("Add research topics to help collaborators understand your academic focus.")}
                    action={t("Add research topics")}
                    onAction={() => {
                      setEditModalTab("research");
                      setIsEditModalOpen(true);
                    }}
                  />
                )}
              </section>

              {/* Featured Works & Contributions */}
              <section className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#11131a] sm:p-7">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                      <BriefcaseBusiness className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white">
                        {t("Featured Works & Contributions")}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t("Selected research papers and peer contributions")}
                      </p>
                    </div>
                  </div>
                  {owner && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit?.("works")}
                      className="gap-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>{t("Add work")}</span>
                    </Button>
                  )}
                </div>

                {editor("works") ?? (
                  profile.featuredWorks.length > 0 ? (
                    <div className="space-y-3">
                      {profile.featuredWorks.map((work, index) => (
                        <div
                          key={`${work.paperId ?? work.doi ?? work.title}-${index}`}
                          className="group relative flex items-start gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 transition-all hover:border-blue-200 hover:bg-blue-50/20 dark:border-white/5 dark:bg-white/[0.02] dark:hover:border-blue-900/50"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <h3 className="text-sm font-bold text-slate-900 transition-colors group-hover:text-blue-600 dark:text-white dark:group-hover:text-blue-300">
                                {work.title || work.doi || t("Research work")}
                              </h3>
                              {work.year && (
                                <span className="rounded-md bg-slate-200/80 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-300">
                                  {work.year}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {work.canonical
                                ? t("LumiGap Verified Paper")
                                : t("Self-declared research contribution")}
                              {work.doi ? <span> · DOI: {work.doi}</span> : null}
                            </p>
                            {work.paperId && work.canonical && (
                              <Link
                                to={`/papers/${work.paperId}`}
                                className="mt-2.5 inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline dark:text-blue-400"
                              >
                                <span>{t("View paper in repository")}</span>
                                <ArrowRight className="h-3 w-3" />
                              </Link>
                            )}
                          </div>
                        </div>
                      ))}

                      {profile.publicHandle && (
                        <div className="pt-2">
                          <Link
                            to={`/profile/${profile.publicHandle}/contributions`}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline dark:text-blue-400"
                          >
                            <span>{t("View contribution archive")}</span>
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      )}
                    </div>
                  ) : (
                    <EmptyCard
                      owner={owner}
                      text={t("Add papers, projects, or evidence to showcase your research contributions.")}
                      action={t("Add contribution")}
                      onAction={() => onEdit?.("works")}
                    />
                  )
                )}
              </section>
            </div>

            {/* Right Col (4-col): Affiliation & Collaboration Widgets */}
            <div className="space-y-6 lg:col-span-4">
              {/* Quick Affiliation Card */}
              <section className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#11131a]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <University className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {t("Affiliation")}
                    </h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleTabChange("affiliation")}
                    className="h-8 text-xs font-bold text-blue-600"
                  >
                    {t("View details")}
                  </Button>
                </div>
                <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-white/5 dark:bg-white/[0.02]">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {t("Institution")}
                  </p>
                  <p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
                    {institution || t("Independent")}
                  </p>
                  {profile.affiliation.department && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {profile.affiliation.department}
                    </p>
                  )}
                  {isVerifiedAffiliation && (
                    <div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                      <BadgeCheck className="h-3.5 w-3.5" />
                      <span>{t("Verified institutional domain")}</span>
                    </div>
                  )}
                </div>
              </section>

              {/* Collaboration Preview */}
              <section className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#11131a]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HandHeart className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {t("Collaboration")}
                    </h3>
                  </div>
                  {owner && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTabChange("collaboration")}
                      className="h-8 text-xs font-bold text-blue-600"
                    >
                      {t("Configure")}
                    </Button>
                  )}
                </div>

                {showAvailability ? (
                  <div className="mt-4 space-y-3">
                    {profile.supportAvailability.enabled && (
                      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3.5 text-xs dark:border-emerald-950 dark:bg-emerald-950/20">
                        <p className="font-bold text-emerald-800 dark:text-emerald-300">
                          {t("Research Support Available")}
                        </p>
                        <p className="mt-1 text-slate-600 dark:text-emerald-200/70">
                          {profile.supportAvailability.types.length} {t("support areas")}
                        </p>
                      </div>
                    )}
                    {profile.reviewAvailability.enabled && (
                      <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-3.5 text-xs dark:border-blue-950 dark:bg-blue-950/20">
                        <p className="font-bold text-blue-800 dark:text-blue-300">
                          {t("Academic Review Open")}
                        </p>
                        <p className="mt-1 text-slate-600 dark:text-blue-200/70">
                          {profile.reviewAvailability.types.length} {t("review types")}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    {t("Not currently accepting direct mentoring or review requests.")}
                  </p>
                )}
              </section>

              {/* External Professional Links */}
              {professionalLinks.length > 0 && (
                <section className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#11131a]">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {t("Professional Links")}
                  </h3>
                  <div className="mt-3 space-y-2">
                    {professionalLinks.map((identity) => {
                      const url = safeExternalUrl(identity.profileUrl);
                      return url ? (
                        <a
                          key={`${identity.provider}-${url}`}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-2.5 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-100 dark:border-white/5 dark:bg-white/[0.02] dark:text-slate-200"
                        >
                          <span>GitHub</span>
                          <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                        </a>
                      ) : null;
                    })}
                  </div>
                </section>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: AFFILIATION & VERIFICATION (TAILORED FOR STUDENT VS FACULTY) */}
        {activeTab === "affiliation" && (
          <div className="space-y-6">
            {isStudent ? (
              /* Dedicated Student Affiliation & Program View */
              <section className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#11131a] sm:p-8">
                <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-5 dark:border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                      <GraduationCap className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                        {t("Academic Affiliation & Program")}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t("Current student standing and institutional details")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  {/* Institution & Campus Details */}
                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-5 dark:border-white/10 dark:bg-white/[0.02] space-y-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {t("Current affiliation")}
                      </p>
                      <h3 className="mt-1 text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span>{institution || t("FPT University")}</span>
                      </h3>
                      {profile.affiliation.department && (
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {profile.affiliation.department}
                        </p>
                      )}
                    </div>

                    <div className="border-t border-slate-100 pt-3 dark:border-white/5">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {t("Academic status")}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                        >
                          <BadgeCheck className="mr-1 h-3.5 w-3.5 text-emerald-600" />
                          {t("Verified student member")}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Verification Evidence Info */}
                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-5 dark:border-white/10 dark:bg-white/[0.02] space-y-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {t("Institutional authentication")}
                      </p>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        {t("Your student affiliation is verified through institutional single sign-on.")}
                      </p>
                    </div>

                    <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-white/5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">{t("Affiliation")}</span>
                        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 font-semibold">
                          {t("Verified")}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">{t("Institutional email")}</span>
                        <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 font-semibold">
                          {t("Verified")}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>

                {editor("affiliation")}
              </section>
            ) : (
              /* Faculty Position & Evidence Verification for Lecturers / Researchers */
              <section className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#11131a] sm:p-8">
                <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-5 dark:border-white/5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                        {t("Academic Position & Verification")}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t("Institutional affiliation, verified credentials, and evidence")}
                      </p>
                    </div>
                  </div>
                </div>

                <div id="affiliation" className="scroll-mt-24">
                  <PositionVerificationPanel
                    profile={profile}
                    editable={owner}
                    onEditPosition={() => onEdit?.("affiliation")}
                  />
                  {editor("affiliation")}
                </div>
              </section>
            )}
          </div>
        )}

        {/* TAB 3: SCHOLARLY IDENTITIES */}
        {activeTab === "identities" && (
          <div className="space-y-6">
            <section className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#11131a] sm:p-8">
              <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-5 dark:border-white/5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                    <Link2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      {t("Scholarly Identity Hub")}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t("Connect persistent scholarly IDs: ORCID, Google Scholar, OpenAlex, Semantic Scholar")}
                    </p>
                  </div>
                </div>
              </div>

              <AcademicIdentityManager profile={profile} editable={owner} />

              <div className="mt-8 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 text-xs text-slate-500 dark:border-white/5 dark:bg-white/[0.02] dark:text-slate-400 leading-relaxed">
                {t("Scholarly profile links help people discover your work. They do not verify your academic position, affiliation, or expertise.")}
              </div>
            </section>
          </div>
        )}

        {/* TAB 4: COLLABORATION & REVIEW */}
        {activeTab === "collaboration" && (
          <div className="space-y-6">
            <section className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#11131a] sm:p-8">
              <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-5 dark:border-white/5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                    <HandHeart className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      {t("Mentorship & Peer Review Availability")}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t("Declare your availability for student guidance and paper review")}
                    </p>
                  </div>
                </div>
                {owner && (
                  <Button
                    size="sm"
                    variant={editingSection === "availability" ? "default" : "outline"}
                    onClick={() =>
                      editingSection === "availability"
                        ? onCloseEdit?.()
                        : onEdit?.("availability")
                    }
                    className="gap-1.5 text-xs font-bold"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    <span>
                      {editingSection === "availability"
                        ? t("Close editor")
                        : t("Configure availability")}
                    </span>
                  </Button>
                )}
              </div>

              {editor("availability") ?? (
                <div className="grid gap-6 sm:grid-cols-2">
                  {/* Research Support Card */}
                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-5 dark:border-white/10 dark:bg-white/[0.02]">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "h-2.5 w-2.5 rounded-full",
                          profile.supportAvailability.enabled
                            ? "bg-emerald-500"
                            : "bg-slate-300 dark:bg-slate-600",
                        )}
                      />
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {t("Research Support (Mentorship)")}
                      </h3>
                    </div>

                    {profile.supportAvailability.enabled ? (
                      <div className="mt-4 space-y-3 text-xs">
                        <div>
                          <p className="font-semibold text-slate-700 dark:text-slate-300">
                            {t("Supported areas")}:
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {profile.supportAvailability.types.map((type) => (
                              <Badge
                                key={type}
                                variant="outline"
                                className="border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300"
                              >
                                {supportLabels[type] ?? type.replaceAll("_", " ")}
                              </Badge>
                            ))}
                          </div>
                        </div>

                        {profile.supportAvailability.preferredTopics.length > 0 && (
                          <div>
                            <p className="font-semibold text-slate-700 dark:text-slate-300">
                              {t("Preferred topics")}:
                            </p>
                            <p className="mt-1 text-slate-600 dark:text-slate-400">
                              {profile.supportAvailability.preferredTopics.join(", ")}
                            </p>
                          </div>
                        )}

                        {profile.supportAvailability.note && (
                          <div className="rounded-xl bg-white p-3 dark:bg-slate-900">
                            <p className="italic text-slate-600 dark:text-slate-400">
                              &ldquo;{profile.supportAvailability.note}&rdquo;
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                        {t("Not currently open for mentorship or research support.")}
                      </p>
                    )}
                  </div>

                  {/* Academic Peer Review Card */}
                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-5 dark:border-white/10 dark:bg-white/[0.02]">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "h-2.5 w-2.5 rounded-full",
                          profile.reviewAvailability.enabled
                            ? "bg-blue-500"
                            : "bg-slate-300 dark:bg-slate-600",
                        )}
                      />
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {t("Academic Peer Review")}
                      </h3>
                    </div>

                    {profile.reviewAvailability.enabled ? (
                      <div className="mt-4 space-y-3 text-xs">
                        <div>
                          <p className="font-semibold text-slate-700 dark:text-slate-300">
                            {t("Review types")}:
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {profile.reviewAvailability.types.map((type) => (
                              <Badge
                                key={type}
                                variant="outline"
                                className="border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300"
                              >
                                {type.replaceAll("_", " ")}
                              </Badge>
                            ))}
                          </div>
                        </div>

                        {profile.reviewAvailability.preferredTopics.length > 0 && (
                          <div>
                            <p className="font-semibold text-slate-700 dark:text-slate-300">
                              {t("Preferred review topics")}:
                            </p>
                            <p className="mt-1 text-slate-600 dark:text-slate-400">
                              {profile.reviewAvailability.preferredTopics.join(", ")}
                            </p>
                          </div>
                        )}

                        {profile.reviewAvailability.note && (
                          <div className="rounded-xl bg-white p-3 dark:bg-slate-900">
                            <p className="italic text-slate-600 dark:text-slate-400">
                              &ldquo;{profile.reviewAvailability.note}&rdquo;
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                        {t("Not currently accepting peer review requests.")}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB 5: PRIVACY & SETTINGS */}
        {activeTab === "settings" && (
          <div className="space-y-6">
            <section className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#11131a] sm:p-8">
              <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-5 dark:border-white/5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                    <Settings2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      {t("Profile Visibility & Public URL")}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t("Custom handle, public profile link, and discovery permissions")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {/* Public Handle Box */}
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-5 dark:border-white/10 dark:bg-white/[0.02]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {t("Custom Public Profile URL")}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {t("Share this URL in publications, presentations, and CVs")}
                      </p>
                    </div>
                    {owner && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onEdit?.("link")}
                        className="text-xs font-bold"
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        {t("Edit handle")}
                      </Button>
                    )}
                  </div>

                  {editor("link") ?? (
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <div className="flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 font-mono text-xs text-slate-800 dark:border-white/10 dark:bg-slate-900 dark:text-slate-200">
                        {publicUrl}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void copyPublicUrl()}
                        className="h-10 gap-1.5 rounded-xl bg-blue-600 text-xs font-bold text-white hover:bg-blue-700"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        <span>{copyState === "copied" ? t("Copied!") : t("Copy link")}</span>
                      </Button>
                    </div>
                  )}
                </div>

                {/* Visibility Mode Display */}
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-5 dark:border-white/10 dark:bg-white/[0.02]">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {t("Profile Visibility")}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {profile.profileVisibility === "PUBLIC"
                          ? t("Public — Visible to everyone on the web")
                          : profile.profileVisibility === "MEMBERS_ONLY"
                            ? t("Members only — Visible to authenticated scholars")
                            : t("Private — Only you can view your profile")}
                      </p>
                    </div>
                    {owner && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditModalTab("privacy");
                          setIsEditModalOpen(true);
                        }}
                        className="text-xs font-bold"
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        {t("Change")}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Discoverability Toggles Display */}
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-5 dark:border-white/10 dark:bg-white/[0.02]">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {t("Search & Discoverability")}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {profile.discoverability.showInResearcherSearch
                          ? t("Included in scholar search")
                          : t("Hidden from scholar search")}
                        {" · "}
                        {profile.discoverability.allowCollaborationRequests
                          ? t("Collaboration requests enabled")
                          : t("Collaboration requests disabled")}
                      </p>
                    </div>
                    {owner && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditModalTab("privacy");
                          setIsEditModalOpen(true);
                        }}
                        className="text-xs font-bold"
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        {t("Configure")}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>

      {/* 3. Comprehensive Multi-Tab "Edit Profile Dialog" */}
      {owner && (
        <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
          <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl rounded-3xl p-6 sm:p-8">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-slate-950 dark:text-white">
                {t("Edit Academic Profile")}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
                {t("Update your public bio, research areas, skills, and privacy preferences.")}
              </DialogDescription>
            </DialogHeader>

            {/* Modal Internal Tabs */}
            <div className="mt-2 flex gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-white/5">
              {[
                { id: "general" as const, label: t("General Info"), icon: UserCheck },
                { id: "research" as const, label: t("Research Focus"), icon: GraduationCap },
                { id: "privacy" as const, label: t("Privacy & Search"), icon: ShieldCheck },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setEditModalTab(id)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-all",
                    editModalTab === id
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            <form onSubmit={(e) => void saveProfileModal(e)} className="mt-5 space-y-5">
              {/* TAB: GENERAL INFO */}
              {editModalTab === "general" && (
                <div className="space-y-4">
                  {/* Display Name */}
                  <div>
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      {t("Display Name")}
                    </Label>
                    <Input
                      value={displayNameDraft}
                      maxLength={120}
                      required
                      disabled={nameChangesRemaining === 0}
                      onChange={(e) => {
                        setDisplayNameDraft(e.target.value);
                        setIntroSaveError(null);
                      }}
                      className="mt-1.5 h-11 rounded-xl text-sm font-semibold"
                    />
                    <p
                      className={cn(
                        "mt-1 text-[11px]",
                        nameChangesRemaining === 0
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-slate-500",
                      )}
                    >
                      {namePolicyMessage}
                    </p>
                  </div>

                  {/* Academic Title */}
                  {!isStudent && (
                    <div>
                      <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        {t("Academic Title")}
                      </Label>
                      <select
                        value={academicTitleDraft}
                        onChange={(e) =>
                          setAcademicTitleDraft(e.target.value as AcademicTitle | "")
                        }
                        className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium dark:border-white/10 dark:bg-slate-900"
                      >
                        <option value="">{t("Select title")}</option>
                        {academicTitleOptions.map((titleOption) => (
                          <option key={titleOption} value={titleOption}>
                            {titleOption}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Academic Bio */}
                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        {t("Academic Bio")}
                      </Label>
                      <span
                        className={cn(
                          "text-[11px] font-semibold",
                          biographyWordCount > ACADEMIC_BIOGRAPHY_MAX_WORDS
                            ? "text-red-600"
                            : "text-slate-500",
                        )}
                      >
                        {biographyWordCount}/{ACADEMIC_BIOGRAPHY_MAX_WORDS} {t("words")}
                      </span>
                    </div>
                    <textarea
                      rows={4}
                      maxLength={ACADEMIC_BIOGRAPHY_MAX_CHARACTERS}
                      value={biographyDraft}
                      onChange={(e) => {
                        setBiographyDraft(e.target.value);
                        setIntroSaveError(null);
                      }}
                      placeholder={t("Briefly describe your scholarly background and research focus...")}
                      className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-transparent p-3.5 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-white/10"
                    />
                  </div>
                </div>
              )}

              {/* TAB: RESEARCH FOCUS */}
              {editModalTab === "research" && (
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      {t("Research topics & fields")}
                    </Label>
                    <Input
                      value={researchInterestsDraft}
                      onChange={(e) => setResearchInterestsDraft(e.target.value)}
                      placeholder={t("AI safety, Human-Computer Interaction, Educational Tech")}
                      className="mt-1.5 h-11 rounded-xl text-sm"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      {t("Separate topics with commas.")}
                    </p>
                  </div>

                  <div>
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      {t("Research areas")}
                    </Label>
                    <Input
                      value={expertiseAreasDraft}
                      onChange={(e) => setExpertiseAreasDraft(e.target.value)}
                      placeholder={t("Software Engineering, Artificial Intelligence, Data Science")}
                      className="mt-1.5 h-11 rounded-xl text-sm"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      {t("Separate topics with commas.")}
                    </p>
                  </div>

                  <div>
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      {t("Research skills")}
                    </Label>
                    <Input
                      value={skillsDraft}
                      onChange={(e) => setSkillsDraft(e.target.value)}
                      placeholder={t("Literature screening, Qualitative coding, Python, R")}
                      className="mt-1.5 h-11 rounded-xl text-sm"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      {t("Separate skills with commas.")}
                    </p>
                  </div>

                  <div>
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      {t("Keywords")}
                    </Label>
                    <Input
                      value={researchKeywordsDraft}
                      onChange={(e) => setResearchKeywordsDraft(e.target.value)}
                      placeholder={t("Systematic reviews, Empirical studies, LLMs")}
                      className="mt-1.5 h-11 rounded-xl text-sm"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      {t("Separate keywords with commas.")}
                    </p>
                  </div>
                </div>
              )}

              {/* TAB: PRIVACY & DISCOVERABILITY */}
              {editModalTab === "privacy" && (
                <div className="space-y-5">
                  <div>
                    <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      {t("Profile Visibility")}
                    </Label>
                    <div className="mt-2 space-y-2">
                      {[
                        {
                          val: "PUBLIC",
                          title: t("Public"),
                          desc: t("Anyone on the internet can view your academic profile."),
                        },
                        {
                          val: "MEMBERS_ONLY",
                          title: t("Members only"),
                          desc: t("Only verified & signed-in scholars can view your profile."),
                        },
                        {
                          val: "PRIVATE",
                          title: t("Private"),
                          desc: t("Only you can view your profile details."),
                        },
                      ].map(({ val, title: valTitle, desc }) => {
                        const sel = profileVisibilityDraft === val;
                        return (
                          <label
                            key={val}
                            className={cn(
                              "flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition-all",
                              sel
                                ? "border-blue-600 bg-blue-50/70 dark:border-blue-500 dark:bg-blue-950/40"
                                : "border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5",
                            )}
                          >
                            <input
                              type="radio"
                              name="modal-visibility"
                              value={val}
                              checked={sel}
                              onChange={() => setProfileVisibilityDraft(val as any)}
                              className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500"
                            />
                            <div>
                              <p className="text-xs font-bold text-slate-900 dark:text-white">
                                {valTitle}
                              </p>
                              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                {desc}
                              </p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-3 border-t border-slate-100 pt-4 dark:border-white/5">
                    <label className="flex items-start gap-3 text-xs">
                      <input
                        type="checkbox"
                        checked={showInResearcherSearchDraft}
                        onChange={(e) => setShowInResearcherSearchDraft(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {t("Show profile in researcher search")}
                        </span>
                        <p className="text-slate-500 dark:text-slate-400">
                          {t("Let other scholars discover you in directory searches.")}
                        </p>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 text-xs">
                      <input
                        type="checkbox"
                        checked={allowCollaborationRequestsDraft}
                        onChange={(e) => setAllowCollaborationRequestsDraft(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {t("Allow collaboration & mentorship requests")}
                        </span>
                        <p className="text-slate-500 dark:text-slate-400">
                          {t("Enable direct contact buttons on your public profile.")}
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {introSaveError && (
                <p role="alert" className="text-xs font-bold text-red-600 dark:text-red-400">
                  {introSaveError}
                </p>
              )}

              <DialogFooter className="gap-2 pt-3 border-t border-slate-100 dark:border-white/5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditModalOpen(false)}
                  className="rounded-xl text-xs font-semibold"
                >
                  {t("Cancel")}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={
                    updateProfile.isPending ||
                    !isIntroDirty ||
                    !displayNameDraft.trim() ||
                    biographyWordCount > ACADEMIC_BIOGRAPHY_MAX_WORDS
                  }
                  className="rounded-xl bg-blue-600 text-xs font-bold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700"
                >
                  {updateProfile.isPending ? t("Saving…") : t("Save changes")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Avatar Dialog */}
      {owner && (
        <ProfileAvatarDialog
          open={avatarDialogOpen}
          currentAvatar={avatarSrc}
          onOpenChange={setAvatarDialogOpen}
        />
      )}

      {/* Cover Photo Dialog */}
      {owner && (
        <ProfileCoverDialog
          open={coverDialogOpen}
          currentCover={coverSrc}
          onOpenChange={setCoverDialogOpen}
        />
      )}
    </main>
  );
}

function EmptyCard({
  owner,
  text,
  action,
  onAction,
}: {
  owner: boolean;
  text: string;
  action: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 p-6 text-center dark:border-white/10 dark:bg-white/[0.02]">
      <p className="text-xs text-slate-500 dark:text-slate-400">{text}</p>
      {owner && onAction && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAction}
          className="mt-3.5 h-8 gap-1 rounded-xl text-xs font-bold text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/30"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{action}</span>
        </Button>
      )}
    </div>
  );
}
