import { classificationInput } from "@/features/academic-profile/utils/research-classification";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ACADEMIC_BIOGRAPHY_MAX_CHARACTERS,
  ACADEMIC_BIOGRAPHY_MAX_WORDS,
  ACADEMIC_POSITION_OPTIONS,
  countAcademicBiographyWords,
  TECHNICAL_SKILLS,
  type AcademicAvailability,
  type AcademicProfile,
  type AcademicReviewType,
  type AcademicTitle,
  type ResearchSupportType,
  type UpdateAcademicProfileDetailsRequest,
} from "@trend/shared-types";
import { dedupeAcademicTerms, normalizeAcademicExpertise } from "../utils/expertise-normalization";
import { BookOpen, Building2, Camera, Link2, Sparkles, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";
import { authApi } from "@/features/auth/api/auth.api";
import { toast } from "sonner";
import { cn } from "@/utils/cn";
import {
  useRemoveAcademicCover,
  useSetPublicHandle,
  useUpdateAcademicProfile,
  useUploadAcademicCover,
} from "../hooks/use-academic-profile";
import { ResearchClassificationFields, SupervisionTopicFields } from "./research-classification-fields";
import { ResearchTagField } from "./research-focus-fields";
import { FeaturedWorksEditor, editableWork } from "./featured-works-editor";
import { AcademicIdentityManager } from "./academic-identity-manager";
import { combineAcademicBio } from "../utils/academic-bio";
import { getResearchSuggestions, researchSkillGroups } from "../utils/research-suggestions";

export type UnifiedEditorTab = "basic" | "academic" | "research" | "links";
export type EditSection =
  | UnifiedEditorTab
  | "intro"
  | "cover"
  | "works"
  | "affiliation"
  | "availability"
  | "link";

type WorkInput = NonNullable<UpdateAcademicProfileDetailsRequest["featuredWorks"]>[number];
const PRIVACY_FIELDS = ["expertise", "researchInterests", "orcid"] as const;
const ACADEMIC_TITLE_OPTIONS: AcademicTitle[] = [
  "Lecturer",
  "Senior Lecturer",
  "Assistant Professor",
  "Associate Professor",
  "Professor",
  "Research Fellow",
  "Other",
];

const METHOD_SUGGESTIONS = [
  "Systematic Literature Review",
  "Experimental Research",
  "Experimental Design",
  "Survey Research",
  "Qualitative Analysis",
  "Statistical Analysis",
  "Literature Screening",
  "Evidence Extraction",
  "Interview Analysis",
  "Qualitative Coding",
  "Case Study",
  "Mixed Methods",
];

const SKILL_SUGGESTIONS = [
  "Python",
  "TypeScript",
  "R",
  "SQL",
  "PyTorch",
  "TensorFlow",
  "Secure Coding",
  "Static Analysis",
  "Data Analysis",
  "Data Visualization",
  "Machine Learning",
  "Model Evaluation",
  "Test Automation",
  "Security Testing",
  "SPSS",
  "Stata",
  "MATLAB",
  "Academic Writing",
];

export function suggestPublicHandle(name: string): string {
  return name
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function errorMessage(error: unknown): string {
  return (
    (error as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message ??
    "Could not save these changes."
  );
}

const supportOptions: Array<{ value: ResearchSupportType; label: string }> = [
  { value: "RESEARCH_DIRECTION", label: "Research direction" },
  { value: "LITERATURE_REVIEW", label: "Literature review" },
  { value: "RESEARCH_GAP_VALIDATION", label: "Research gap validation" },
  { value: "RESEARCH_METHODOLOGY", label: "Research methodology" },
  { value: "EXPERIMENT_DESIGN", label: "Experiment design" },
  { value: "DATA_ANALYSIS", label: "Data analysis" },
  { value: "ACADEMIC_WRITING", label: "Academic writing" },
  { value: "SOFTWARE_TECHNICAL_GUIDANCE", label: "Software guidance" },
];

const reviewOptions: Array<{ value: AcademicReviewType; label: string }> = [
  { value: "RESEARCH_PROPOSAL", label: "Research proposal" },
  { value: "LITERATURE_REVIEW", label: "Literature review" },
  { value: "THESIS_DRAFT", label: "Thesis draft" },
  { value: "RESEARCH_GAP", label: "Research gap" },
  { value: "METHODOLOGY", label: "Methodology" },
  { value: "EXPERIMENTAL_RESULTS", label: "Experimental results" },
  { value: "RESEARCH_PAPER", label: "Research paper" },
  { value: "SOFTWARE_RESEARCH_PROJECT", label: "Software research project" },
];

function mapSectionToTab(section: EditSection): UnifiedEditorTab | "works" | "availability" {
  if (section === "works") return "works";
  if (section === "availability") return "availability";
  if (section === "academic" || section === "affiliation") return "academic";
  if (section === "research") return "research";
  if (section === "links") return "links";
  return "basic";
}

export function AcademicProfileInlineEditor({
  section,
  profile,
  onClose,
  onOpenAvatar,
}: {
  section: EditSection;
  profile: AcademicProfile;
  onClose: () => void;
  onOpenAvatar?: () => void;
}) {
  const { t } = useI18n();
  const update = useUpdateAcademicProfile();
  const setHandle = useSetPublicHandle();
  const uploadCover = useUploadAcademicCover();
  const removeCover = useRemoveAcademicCover();

  const initialMode = mapSectionToTab(section);
  const isStandaloneSection = initialMode === "works" || initialMode === "availability";
  const [activeTab, setActiveTab] = useState<UnifiedEditorTab>(
    isStandaloneSection ? "basic" : initialMode,
  );
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);

  // Normalized 3-group research expertise
  const normalizedInitial = useMemo(
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

  // Basic Info state
  const [name, setName] = useState(profile.displayName);
  const [bio, setBio] = useState(combineAcademicBio(profile.headline, profile.biography, profile.bio));
  const [handle, setHandleInput] = useState(profile.publicHandle ?? suggestPublicHandle(profile.displayName));
  const [visibility, setVisibility] = useState(profile.profileVisibility);
  const [privacy, setPrivacy] = useState(profile.privacy);
  const [discoverable, setDiscoverable] = useState(profile.discoverability.showInResearcherSearch);
  const [collaboration, setCollaboration] = useState(profile.discoverability.allowCollaborationRequests);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  // Academic Info state
  const [academicRole, setAcademicRole] = useState<"STUDENT" | "RESEARCHER" | "LECTURER">(
    profile.academicRole ??
      (profile.academicType === "student"
        ? "STUDENT"
        : profile.academicType === "lecturer"
          ? "LECTURER"
          : "RESEARCHER"),
  );
  const [institutionName, setInstitutionName] = useState(profile.affiliation.institutionName ?? "");
  const [programName, setProgramName] = useState(profile.affiliation.programName ?? "");
  const [position, setPosition] = useState(profile.positionTitle ?? "");
  const [department, setDepartment] = useState(profile.affiliation.department ?? "");
  const [academicTitle, setAcademicTitle] = useState<AcademicTitle | "">(profile.academicTitle ?? "");
  const [institutionQuery, setInstitutionQuery] = useState(institutionName);

  // Research & Expertise state (Canonical 3 groups + optional catalogue)
  const [researchClassification, setResearchClassification] = useState(() =>
    classificationInput(profile.researchClassification),
  );
  const [researchAreas, setResearchAreas] = useState<string[]>(normalizedInitial.researchAreas);
  const [skills, setSkills] = useState<string[]>(normalizedInitial.skills);
  const [researchMethods, setResearchMethods] = useState<string[]>(normalizedInitial.researchMethods);

  // Links state (GitHub via externalIdentities; scholarly links managed via AcademicIdentityManager)
  const existingGithub = profile.externalIdentities.find(item => item.provider === "GITHUB")?.profileUrl ?? "";
  const [githubUrl, setGithubUrl] = useState(existingGithub);

  // Works & Availability state
  const [works, setWorks] = useState<WorkInput[]>(() => profile.featuredWorks.map(editableWork));
  const [support, setSupport] = useState(profile.supportAvailability);
  const [review, setReview] = useState(profile.reviewAvailability);

  useEffect(() => {
    const timer = setTimeout(() => setInstitutionQuery(institutionName), 200);
    return () => clearTimeout(timer);
  }, [institutionName]);

  const institutions = useQuery({
    queryKey: ["academic-profile", "institutions", institutionQuery],
    queryFn: () => authApi.academicOnboardingOptions({ q: institutionQuery }),
    enabled: !isStandaloneSection && activeTab === "academic",
    staleTime: 60_000,
  });

  const taxonomy = useQuery({
    queryKey: ["academic-profile", "research-taxonomy"],
    queryFn: () => authApi.academicOnboardingOptions(),
    enabled: !isStandaloneSection && activeTab === "research",
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!coverFile) {
      setCoverPreview(null);
      return;
    }
    const url = URL.createObjectURL(coverFile);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  const busy = update.isPending || setHandle.isPending || uploadCover.isPending || removeCover.isPending;

  const domainSuggestions = useMemo(
    () => getResearchSuggestions(researchAreas, []),
    [researchAreas],
  );

  const areaOptions = useMemo(
    () =>
      dedupeAcademicTerms([
        ...(taxonomy.data?.researchAreas ?? []),
        ...(taxonomy.data?.researchSpecializations ?? []),
        ...(taxonomy.data?.researchTopics ?? []),
        ...domainSuggestions.interests,
      ], 60),
    [taxonomy.data, domainSuggestions.interests],
  );

  const skillOptions = useMemo(
    () =>
      dedupeAcademicTerms([
        ...SKILL_SUGGESTIONS,
        ...domainSuggestions.skillGroups
          .filter(g => g.label !== "Research methods")
          .flatMap(g => g.options),
      ], 50),
    [domainSuggestions.skillGroups],
  );

  const methodOptions = useMemo(
    () =>
      dedupeAcademicTerms([
        ...METHOD_SUGGESTIONS,
        ...(researchSkillGroups.find(g => g.label === "Research methods")?.options ?? []),
      ], 40),
    [],
  );

  function handleSafeClose() {
    if (dirty && !window.confirm(t("profileRedesign.editor.unsavedConfirm"))) return;
    onClose();
  }

  function buildPayload(): UpdateAcademicProfileDetailsRequest {
    if (initialMode === "works") {
      return { featuredWorks: works };
    }
    if (initialMode === "availability") {
      const { updatedAt: _s, ...supportInput } = support;
      const { updatedAt: _r, ...reviewInput } = review;
      return {
        supportAvailability: supportInput,
        ...(academicRole === "LECTURER" ? { reviewAvailability: reviewInput } : {}),
      };
    }

    if (activeTab === "basic") {
      return {
        displayName: name.trim(),
        biography: bio.trim(),
        headline: "",
        profileVisibility: visibility,
        privacy,
        discoverability: {
          showInResearcherSearch: discoverable,
          allowCollaborationRequests: collaboration,
        },
      };
    }

    if (activeTab === "academic") {
      const selected = institutions.data?.institutions?.find(
        item => item.name.toLocaleLowerCase() === institutionName.trim().toLocaleLowerCase(),
      );
      const sameInstitution =
        institutionName.trim().toLocaleLowerCase() ===
        profile.affiliation.institutionName?.trim().toLocaleLowerCase();
      const institutionId = selected?.id ?? (sameInstitution ? profile.affiliation.institutionId : undefined);
      return {
        academicRole,
        ...(academicRole !== "STUDENT" ? { positionTitle: position.trim() } : {}),
        ...(academicRole !== "STUDENT" ? { academicTitle: academicTitle || null } : {}),
        affiliation: {
          ...(institutionId ? { institutionId } : {}),
          institutionName: institutionName.trim(),
          department: department.trim(),
          ...(academicRole === "STUDENT" ? { programName: programName.trim() } : {}),
        },
      };
    }

    if (activeTab === "research") {
      const cleanAreas = dedupeAcademicTerms(researchAreas, 30);
      const cleanSkills = dedupeAcademicTerms(skills, 40);
      const cleanMethods = dedupeAcademicTerms(researchMethods, 30);
      // Auto-derive keywords & keep researchInterests synced for Matching Engine compatibility
      const derivedKeywords = dedupeAcademicTerms([...cleanAreas, ...cleanSkills, ...cleanMethods], 40);
      return {
        researchClassification,
        expertiseAreas: cleanAreas,
        researchSpecializations: [],
        researchInterests: cleanAreas,
        skills: cleanSkills,
        researchMethods: cleanMethods,
        researchKeywords: derivedKeywords,
      };
    }

    if (activeTab === "links") {
      const trimmedGithub = githubUrl.trim();
      const preservedNonGithub = profile.externalIdentities
        .filter(item => item.provider !== "GITHUB")
        .map(item => ({
          provider: item.provider,
          ...(item.externalId ? { externalId: item.externalId } : {}),
          ...(item.profileUrl ? { profileUrl: item.profileUrl } : {}),
        }));
      return {
        externalIdentities: trimmedGithub
          ? [...preservedNonGithub, { provider: "GITHUB", profileUrl: trimmedGithub }]
          : preservedNonGithub,
      };
    }

    return {};
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage("");

    if (!isStandaloneSection && activeTab === "academic") {
      if (!institutionName.trim() || (academicRole === "STUDENT" ? !programName.trim() : !position.trim())) {
        setMessage(
          t(
            academicRole === "STUDENT"
              ? "Institution and program / major are required."
              : "Institution / organization and current position are required.",
          ),
        );
        return;
      }
    }

    if (!isStandaloneSection && activeTab === "basic") {
      if (bio.length > ACADEMIC_BIOGRAPHY_MAX_CHARACTERS || countAcademicBiographyWords(bio) > ACADEMIC_BIOGRAPHY_MAX_WORDS) {
        setMessage(t("Biography is too long."));
        return;
      }
    }

    try {
      if (section === "link") {
        await setHandle.mutateAsync(handle.trim().toLowerCase());
      } else if (section === "cover") {
        if (!coverFile) return;
        await uploadCover.mutateAsync(coverFile);
      } else if (!isStandaloneSection && activeTab === "basic") {
        const cleanHandle = handle.trim().toLowerCase();
        if (cleanHandle && cleanHandle !== (profile.publicHandle ?? "")) {
          await setHandle.mutateAsync(cleanHandle);
        }
        if (coverFile) {
          await uploadCover.mutateAsync(coverFile);
        }
        await update.mutateAsync(buildPayload());
      } else {
        await update.mutateAsync(buildPayload());
      }

      setDirty(false);
      toast.success(t("Profile changes saved"));
      onClose();
    } catch (error) {
      setMessage(t(errorMessage(error)));
    }
  }

  const student = academicRole === "STUDENT";
  const unifiedTabs: Array<{ id: UnifiedEditorTab; label: string; icon: typeof User }> = [
    { id: "basic", label: t("profileRedesign.editor.tab.basic"), icon: User },
    { id: "academic", label: t("profileRedesign.editor.tab.academic"), icon: Building2 },
    { id: "research", label: t("profileRedesign.editor.tab.research"), icon: Sparkles },
    { id: "links", label: t("profileRedesign.editor.tab.links"), icon: Link2 },
  ];

  // Keep dedicated compact handle/cover modal flow if directly invoked via ?edit=link or ?edit=cover
  const compactOnly = section === "link" || section === "cover";

  return (
    <form onSubmit={save} className="space-y-5" data-no-i18n>
      {!isStandaloneSection && !compactOnly ? (
        <div
          role="tablist"
          aria-label={t("profileRedesign.editor.title")}
          className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted/40 p-1 sm:grid-cols-4"
        >
          {unifiedTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              onClick={() => {
                setActiveTab(id);
                setMessage("");
              }}
              className={cn(
                "inline-flex min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[11.5px] font-semibold transition-colors",
                activeTab === id
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
      ) : null}

      {/* SECTION: BASIC INFO */}
      {!isStandaloneSection && !compactOnly && activeTab === "basic" ? (
        <div className="space-y-4">
          <div className="grid gap-3 rounded-xl border border-border/80 bg-muted/20 p-3.5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-foreground">
                {t("profileRedesign.editor.avatarTitle")}
              </span>
              {onOpenAvatar ? (
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onOpenAvatar}>
                  <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t("Change profile photo")}</span>
                </Button>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-foreground">
                {t("profileRedesign.editor.coverTitle")}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label={t("Cover image")}
                  className="h-8 text-xs"
                  onChange={event => {
                    setCoverFile(event.target.files?.[0] ?? null);
                    setDirty(true);
                  }}
                />
                {profile.coverUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        await removeCover.mutateAsync();
                        toast.success(t("Profile changes saved"));
                      } catch (error) {
                        setMessage(t(errorMessage(error)));
                      }
                    }}
                  >
                    <Trash2 className="h-3 w-3" aria-hidden="true" />
                    <span>{t("Remove cover")}</span>
                  </Button>
                ) : null}
              </div>
              {coverPreview ? (
                <img src={coverPreview} alt={t("Cover preview")} className="h-16 w-full rounded-md object-cover" />
              ) : null}
            </div>
          </div>

          <Field label={t("Full name")}>
            <Input
              value={name}
              maxLength={120}
              required
              disabled={profile.displayNamePolicy?.remainingChanges === 0}
              onChange={event => {
                setName(event.target.value);
                setDirty(true);
              }}
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            {t("{{remaining}} of {{max}} display name changes available in the last {{days}} days.", {
              remaining: profile.displayNamePolicy?.remainingChanges ?? 2,
              max: profile.displayNamePolicy?.maxChanges ?? 2,
              days: profile.displayNamePolicy?.windowDays ?? 30,
            })}
          </p>

          <Field label={t("profileRedesign.editor.usernameLabel")}>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground font-mono">/u/</span>
              <Input
                value={handle}
                maxLength={40}
                onChange={event => {
                  setHandleInput(event.target.value.toLowerCase());
                  setDirty(true);
                }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t("3–40 letters, numbers or single hyphens. Previous links continue to work.")}
            </p>
          </Field>

          <Field label={`${t("Academic Biography")} (${t("Optional")})`}>
            <textarea
              className="min-h-28 w-full rounded-lg border border-input bg-background p-3 text-sm leading-6 focus:outline-none focus:ring-2 focus:ring-ring"
              maxLength={ACADEMIC_BIOGRAPHY_MAX_CHARACTERS}
              value={bio}
              onChange={event => {
                setBio(event.target.value);
                setDirty(true);
              }}
            />
            <span className="block text-xs text-muted-foreground">
              {countAcademicBiographyWords(bio)} / {ACADEMIC_BIOGRAPHY_MAX_WORDS} {t("words")}
            </span>
          </Field>

          <details className="rounded-xl border border-border/80 bg-muted/15 p-3.5">
            <summary className="cursor-pointer text-xs font-semibold text-foreground">
              {t("profileRedesign.collab.editPrivacyInline")}
            </summary>
            <div className="mt-3 space-y-3">
              <Field label={t("Profile visibility")}>
                <select
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={visibility}
                  onChange={event => {
                    setVisibility(event.target.value as typeof visibility);
                    setDirty(true);
                  }}
                >
                  <option value="PUBLIC">{t("Public")}</option>
                  <option value="MEMBERS_ONLY">{t("LumiGap members")}</option>
                  <option value="PRIVATE">{t("Private")}</option>
                </select>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                {PRIVACY_FIELDS.map(key => (
                  <Field
                    key={key}
                    label={t(
                      key === "expertise"
                        ? "Research focus visibility"
                        : key === "researchInterests"
                          ? "Research interests visibility"
                          : "Legacy ORCID visibility",
                    )}
                  >
                    <select
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                      value={privacy[key]}
                      onChange={event => {
                        setPrivacy(current => ({ ...current, [key]: event.target.value }));
                        setDirty(true);
                      }}
                    >
                      <option value="PUBLIC">{t("Public")}</option>
                      <option value="REGISTERED_USERS">{t("LumiGap members")}</option>
                      <option value="PRIVATE">{t("Private")}</option>
                    </select>
                  </Field>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={discoverable}
                  onChange={event => {
                    setDiscoverable(event.target.checked);
                    setDirty(true);
                  }}
                />
                <span>{t("Show in researcher search")}</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={collaboration}
                  onChange={event => {
                    setCollaboration(event.target.checked);
                    setDirty(true);
                  }}
                />
                <span>{t("Allow collaboration requests")}</span>
              </label>
            </div>
          </details>
        </div>
      ) : null}

      {/* SECTION: ACADEMIC INFO */}
      {!isStandaloneSection && !compactOnly && activeTab === "academic" ? (
        <div className="space-y-4">
          <Field label={t("Academic Role")}>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={academicRole}
              onChange={event => {
                const role = event.target.value as typeof academicRole;
                setAcademicRole(role);
                setPosition(role === "LECTURER" ? "Lecturer" : role === "RESEARCHER" ? "Research Staff" : "Student");
                setDirty(true);
              }}
            >
              <option value="STUDENT">{t("Student")}</option>
              <option value="RESEARCHER">{t("Researcher")}</option>
              <option value="LECTURER">{t("Lecturer")}</option>
            </select>
          </Field>

          <Field label={`${t("Institution / organization")} *`}>
            <Input
              list="profile-institutions"
              value={institutionName}
              maxLength={200}
              required
              onChange={event => {
                setInstitutionName(event.target.value);
                setDirty(true);
              }}
            />
            <datalist id="profile-institutions">
              {institutions.data?.institutions?.map(item => (
                <option key={item.id} value={item.name} />
              ))}
            </datalist>
          </Field>

          {student ? (
            <Field label={`${t("Program / Major / Field of Study")} *`}>
              <Input
                value={programName}
                maxLength={160}
                required
                onChange={event => {
                  setProgramName(event.target.value);
                  setDirty(true);
                }}
              />
            </Field>
          ) : (
            <>
              <Field label={`${t("Current Position")} *`}>
                <Input
                  list="profile-position-options"
                  value={position}
                  maxLength={160}
                  required
                  onChange={event => {
                    setPosition(event.target.value);
                    setDirty(true);
                  }}
                />
                <datalist id="profile-position-options">
                  {ACADEMIC_POSITION_OPTIONS.filter(
                    option =>
                      option.category === (academicRole === "LECTURER" ? "LECTURER" : "RESEARCH_STAFF") ||
                      option.title === "Independent Researcher",
                  ).map(option => (
                    <option key={option.title} value={option.title} />
                  ))}
                </datalist>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={`${t("Department")} (${t("Optional")})`}>
                  <Input
                    value={department}
                    maxLength={200}
                    onChange={event => {
                      setDepartment(event.target.value);
                      setDirty(true);
                    }}
                  />
                </Field>
                <Field label={t("Additional academic title")}>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    value={academicTitle}
                    onChange={event => {
                      setAcademicTitle(event.target.value as AcademicTitle | "");
                      setDirty(true);
                    }}
                  >
                    <option value="">{t("No additional title")}</option>
                    {ACADEMIC_TITLE_OPTIONS.map(opt => (
                      <option key={opt} value={opt}>
                        {t(opt)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </>
          )}

          <p className="rounded-lg border border-border/70 bg-muted/25 p-3 text-xs leading-5 text-muted-foreground">
            {t("Academic identity is self-declared. Changes may require verification again.")}
          </p>
        </div>
      ) : null}

      {/* SECTION: RESEARCH & EXPERTISE (3 CANONICAL GROUPS) */}
      {!isStandaloneSection && !compactOnly && activeTab === "research" ? (
        <div className="space-y-5">
          <div className="space-y-1">
            <ResearchTagField
              label={t("profileRedesign.group.areas")}
              values={researchAreas}
              onChange={vals => {
                setResearchAreas(vals);
                setDirty(true);
              }}
              options={areaOptions}
              allowCustom
              max={30}
            />
            <p className="text-[11px] text-muted-foreground">{t("profileRedesign.group.areasHint")}</p>
          </div>

          <div className="space-y-1">
            <ResearchTagField
              label={t("profileRedesign.group.skills")}
              values={skills}
              onChange={vals => {
                setSkills(vals);
                setDirty(true);
              }}
              options={skillOptions}
              allowCustom
              max={40}
            />
            <p className="text-[11px] text-muted-foreground">{t("profileRedesign.group.skillsHint")}</p>
          </div>

          <div className="space-y-1">
            <ResearchTagField
              label={t("profileRedesign.group.methods")}
              values={researchMethods}
              onChange={vals => {
                setResearchMethods(vals);
                setDirty(true);
              }}
              options={methodOptions}
              allowCustom
              max={30}
            />
            <p className="text-[11px] text-muted-foreground">{t("profileRedesign.group.methodsHint")}</p>
          </div>

          <p className="text-xs text-muted-foreground">
            {t("profileRedesign.editor.autoKeywordsHint")}
          </p>

          <details className="rounded-xl border border-border/80 bg-muted/15 p-3.5">
            <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
              {t("profileRedesign.editor.advancedCatalogue")}
            </summary>
            <div className="pt-3">
              <ResearchClassificationFields
                value={researchClassification}
                onChange={next => {
                  setResearchClassification(next);
                  setDirty(true);
                }}
              />
            </div>
          </details>
        </div>
      ) : null}

      {/* SECTION: ACADEMIC LINKS */}
      {!isStandaloneSection && !compactOnly && activeTab === "links" ? (
        <div className="space-y-4">
          <Field label={t("profileRedesign.editor.githubLabel")}>
            <Input
              type="url"
              placeholder="https://github.com/username"
              value={githubUrl}
              maxLength={500}
              onChange={event => {
                setGithubUrl(event.target.value);
                setDirty(true);
              }}
            />
          </Field>
          <div className="border-t border-border pt-4 space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t("profileRedesign.editor.otherLinksHint")}</span>
            </p>
            <AcademicIdentityManager profile={profile} editable />
          </div>
        </div>
      ) : null}

      {/* STANDALONE: WORKS */}
      {initialMode === "works" ? (
        <FeaturedWorksEditor
          original={profile.featuredWorks}
          values={works}
          onChange={vals => {
            setWorks(vals);
            setDirty(true);
          }}
        />
      ) : null}

      {/* STANDALONE: AVAILABILITY */}
      {initialMode === "availability" ? (
        <>
          <Availability
            supervision={academicRole === "LECTURER"}
            title={t(academicRole === "LECTURER" ? "Open to Mentoring" : "Research support")}
            disabledEnable={
              academicRole === "LECTURER" &&
              (profile.academicRoleVerificationStatus !== "VERIFIED" ||
                profile.verificationStatuses?.position !== "VERIFIED")
            }
            value={support}
            onChange={next => {
              setSupport(next);
              setDirty(true);
            }}
            options={supportOptions}
          />
          {academicRole === "LECTURER" ? (
            <>
              <Availability
                title={t("Academic review")}
                value={review}
                onChange={next => {
                  setReview(next);
                  setDirty(true);
                }}
                options={reviewOptions}
              />
              <p className="text-xs text-muted-foreground">
                {t("Mentoring requires verified Lecturer status and mutual consent. Formal review requires a separate artifact assignment.")}
              </p>
            </>
          ) : null}
        </>
      ) : null}

      {/* COMPACT LEGACY: LINK OR COVER */}
      {section === "link" ? (
        <Field label={t("Your public URL")}>
          <Input
            value={handle}
            maxLength={40}
            required
            onChange={event => {
              setHandleInput(event.target.value.toLowerCase());
              setDirty(true);
            }}
          />
          <p className="text-xs text-muted-foreground">
            {t("3–40 letters, numbers or single hyphens. Previous links continue to work.")}
          </p>
        </Field>
      ) : null}

      {section === "cover" ? (
        <>
          <Field label={t("Cover image")}>
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={event => {
                setCoverFile(event.target.files?.[0] ?? null);
                setDirty(true);
              }}
            />
          </Field>
          {coverPreview ? (
            <img src={coverPreview} alt={t("Cover preview")} className="h-32 w-full rounded-md object-cover" />
          ) : null}
          {profile.coverUrl ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                try {
                  await removeCover.mutateAsync();
                  onClose();
                } catch (error) {
                  setMessage(t(errorMessage(error)));
                }
              }}
            >
              {t("Remove cover")}
            </Button>
          ) : null}
        </>
      ) : null}

      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="ghost" onClick={handleSafeClose}>
          {t("Cancel")}
        </Button>
        <Button
          type="submit"
          disabled={busy || (section === "cover" && (!coverFile || coverFile.size > 5 * 1024 * 1024))}
        >
          {busy ? t("Saving…") : t("Save changes")}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function Availability<T extends string>({
  title,
  value,
  onChange,
  options,
  disabledEnable,
  supervision,
}: {
  supervision?: boolean;
  disabledEnable?: boolean;
  title: string;
  value: AcademicAvailability<T>;
  onChange: (value: AcademicAvailability<T>) => void;
  options: Array<{ value: T; label: string }>;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.enabled}
          disabled={disabledEnable && !value.enabled}
          onChange={event => onChange({ ...value, enabled: event.target.checked })}
        />
        {title}: {t("open to requests")}
      </label>
      {disabledEnable ? (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.requestedEnabled === true}
            onChange={event => onChange({ ...value, requestedEnabled: event.target.checked })}
          />
          {t("I am interested in mentoring after verification")}
        </label>
      ) : null}
      {value.enabled || disabledEnable ? (
        <>
          <div className="flex flex-wrap gap-3">
            {options.map(option => (
              <label key={option.value} className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={value.types.includes(option.value)}
                  onChange={() =>
                    onChange({
                      ...value,
                      types: value.types.includes(option.value)
                        ? value.types.filter(item => item !== option.value)
                        : [...value.types, option.value],
                    })
                  }
                />
                {t(option.label)}
              </label>
            ))}
          </div>
          {supervision ? (
            <SupervisionTopicFields
              ids={value.preferredTopicIds ?? []}
              onChange={preferredTopicIds => onChange({ ...value, preferredTopicIds })}
            />
          ) : null}
          <ResearchTagField
            label={t("Preferred topics")}
            values={value.preferredTopics}
            onChange={preferredTopics => onChange({ ...value, preferredTopics })}
          />
          <Field label={t("Note")}>
            <Input
              value={value.note ?? ""}
              maxLength={1000}
              onChange={event => onChange({ ...value, note: event.target.value })}
            />
          </Field>
        </>
      ) : null}
    </div>
  );
}
