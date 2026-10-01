import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AcademicOnboardingOptions, AcademicRole, User } from "@trend/shared-types";
import {
  Award,
  BookOpen,
  GraduationCap,
  Loader2,
  Lock,
  LogOut,
  ShieldCheck,
  University,
} from "lucide-react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import logoImage from "@/assets/logo.png";
import logoDarkImage from "@/assets/logo-dark.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authApi } from "@/features/auth/api/auth.api";
import {
  requiresAcademicProfile,
  resolvePostAuthPath,
  useCurrentUser,
  useLogout,
  useUpdateAcademicProfile,
} from "@/features/auth";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/utils/cn";
import { useI18n } from "@/i18n";

const ROLE_OPTIONS: Array<{
  role: AcademicRole;
  label: string;
  description: string;
  icon: typeof GraduationCap;
}> = [
  {
    role: "STUDENT",
    label: "Student",
    description: "I am currently studying and contributing to research under academic guidance.",
    icon: GraduationCap,
  },
  {
    role: "LECTURER",
    label: "Lecturer",
    description: "I teach, supervise, or review academic work. Verification is required for privileged actions.",
    icon: Award,
  },
  {
    role: "RESEARCHER",
    label: "Researcher",
    description: "I conduct research independently or as part of a lab, team, or organization.",
    icon: BookOpen,
  },
];

type CampusOption = AcademicOnboardingOptions["campuses"][number];
type ProgramOption = AcademicOnboardingOptions["programs"][number];

const DEFAULT_FPT_CAMPUSES: CampusOption[] = [
  { id: "00000000-0000-4000-8000-000000000101", code: "HN", name: "FPT University Hà Nội", city: "Hà Nội" },
  { id: "00000000-0000-4000-8000-000000000102", code: "HCM", name: "FPT University Hồ Chí Minh", city: "Hồ Chí Minh" },
  { id: "00000000-0000-4000-8000-000000000103", code: "DN", name: "FPT University Đà Nẵng", city: "Đà Nẵng" },
  { id: "00000000-0000-4000-8000-000000000104", code: "CT", name: "FPT University Cần Thơ", city: "Cần Thơ" },
  { id: "00000000-0000-4000-8000-000000000105", code: "QN", name: "FPT University Quy Nhơn", city: "Quy Nhơn" },
];

const DEFAULT_FPT_PROGRAMS: ProgramOption[] = [
  { id: "00000000-0000-4000-8000-000000000201", code: "SE", name: "Software Engineering", campusId: null },
  { id: "00000000-0000-4000-8000-000000000202", code: "AI", name: "Artificial Intelligence", campusId: null },
  { id: "00000000-0000-4000-8000-000000000203", code: "IA", name: "Information Assurance", campusId: null },
  { id: "00000000-0000-4000-8000-000000000204", code: "IS", name: "Information Systems", campusId: null },
  { id: "00000000-0000-4000-8000-000000000205", code: "GD", name: "Graphic Design", campusId: null },
  { id: "00000000-0000-4000-8000-000000000206", code: "DM", name: "Digital Marketing", campusId: null },
  { id: "00000000-0000-4000-8000-000000000207", code: "IB", name: "International Business", campusId: null },
  { id: "00000000-0000-4000-8000-000000000208", code: "BA", name: "Business Administration", campusId: null },
  { id: "00000000-0000-4000-8000-000000000209", code: "HM", name: "Hotel Management", campusId: null },
  { id: "00000000-0000-4000-8000-000000000210", code: "MC", name: "Multimedia Communications", campusId: null },
  { id: "00000000-0000-4000-8000-000000000211", code: "EL", name: "English Language", campusId: null },
  { id: "00000000-0000-4000-8000-000000000212", code: "JL", name: "Japanese Language", campusId: null },
  { id: "00000000-0000-4000-8000-000000000213", code: "KL", name: "Korean Language", campusId: null },
  { id: "00000000-0000-4000-8000-000000000214", code: "AT", name: "Automotive Engineering Technology", campusId: null },
  { id: "00000000-0000-4000-8000-000000000215", code: "SCD", name: "Semiconductor Circuit Design", campusId: null },
];

const RESEARCH_AREA_OPTIONS = [
  "Software Engineering",
  "Artificial Intelligence",
  "Information Systems",
  "Information Security",
  "Data Science",
  "Human-Computer Interaction",
  "Business and Management",
  "Education Technology",
  "Communications and Media",
  "Languages and Culture",
  "Other",
];

const RESEARCH_INTEREST_OPTIONS = [
  "AI in education",
  "Systematic literature reviews",
  "Natural language processing",
  "Software testing",
  "Requirements engineering",
  "Cybersecurity",
  "Learning analytics",
  "Digital transformation",
  "User experience research",
  "Research methodology",
  "Other",
];

function splitTags(value: string): string[] {
  return Array.from(new Set(value.split(",").map((item) => item.trim()).filter(Boolean)));
}

function mergeTags(...groups: Array<string[] | undefined>): string[] {
  return Array.from(new Set(groups.flatMap((group) => group ?? []).map((item) => item.trim()).filter(Boolean)));
}

function hasFptVerifiedEmail(user: User | null | undefined): boolean {
  return Boolean(user?.verifiedEmails?.some((email) => /@(fpt\.edu\.vn|fe\.edu\.vn)$/i.test(email.email)));
}

function hasFptAccountEmail(user: User | null | undefined): boolean {
  return Boolean(user && /@(fpt\.edu\.vn|fe\.edu\.vn)$/i.test(user.email));
}

export function AcademicProfileOnboardingPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const accessToken = useAuthStore((state) => state.tokens?.accessToken);
  const storedUser = useAuthStore((state) => state.user);
  const { data, isLoading } = useCurrentUser();
  const updateProfile = useUpdateAcademicProfile();
  const logout = useLogout();
  const user = data?.user ?? storedUser;

  const step1Ref = useRef<HTMLDivElement>(null);
  const step2Ref = useRef<HTMLDivElement>(null);
  const step3Ref = useRef<HTMLDivElement>(null);

  const [academicRole, setAcademicRole] = useState<AcademicRole>(() => {
    if (storedUser?.academicRole) return storedUser.academicRole;
    if (storedUser?.role === "lecturer" || storedUser?.primaryPosition === "LECTURER") return "LECTURER";
    if (storedUser?.admissionBasis === "INVITATION" && storedUser.participantScope !== "INTERNAL") return "RESEARCHER";
    return "STUDENT";
  });

  const [currentPosition, setCurrentPosition] = useState("");
  const [institutionName, setInstitutionName] = useState(
    storedUser?.admissionBasis === "INVITATION" && storedUser.participantScope !== "INTERNAL"
      ? storedUser.institution ?? ""
      : storedUser?.institution ?? "FPT University",
  );
  const [noAffiliation, setNoAffiliation] = useState(false);
  const [campusId, setCampusId] = useState("");
  const [programId, setProgramId] = useState("");
  const [selectedResearchAreas, setSelectedResearchAreas] = useState<string[]>([]);
  const [otherResearchAreas, setOtherResearchAreas] = useState("");
  const [selectedResearchInterests, setSelectedResearchInterests] = useState<string[]>([]);
  const [otherResearchInterests, setOtherResearchInterests] = useState("");
  const [skills, setSkills] = useState("");

  const optionsQuery = useQuery({
    queryKey: ["academic-onboarding-options"],
    queryFn: authApi.academicOnboardingOptions,
    enabled: Boolean(accessToken),
    staleTime: 5 * 60_000,
  });

  const options = optionsQuery.data;
  const hostInstitutionName = options?.hostInstitution?.name ?? "FPT University";
  const isInvitedExternal = user?.admissionBasis === "INVITATION" && user.participantScope !== "INTERNAL";
  const roleCopy = ROLE_OPTIONS.find((option) => option.role === academicRole) ?? ROLE_OPTIONS[0]!;
  const RoleIcon = roleCopy.icon;
  const isStudent = academicRole === "STUDENT";
  const isResearcher = academicRole === "RESEARCHER";
  const isLecturer = academicRole === "LECTURER";
  const hasTrustedEmail = hasFptVerifiedEmail(user);
  const hasFptEmail = hasFptAccountEmail(user);
  const isFptAffiliatedAccount = !isInvitedExternal && (hasFptEmail || hasTrustedEmail || user?.participantScope === "INTERNAL");
  const requiresFptAffiliation = isStudent || (isResearcher && !isInvitedExternal) || (isLecturer && isFptAffiliatedAccount);

  useEffect(() => {
    if (isInvitedExternal && academicRole === "STUDENT") setAcademicRole("RESEARCHER");
  }, [academicRole, isInvitedExternal]);

  useEffect(() => {
    if (isInvitedExternal && institutionName === "FPT University") setInstitutionName(user?.institution ?? "");
  }, [institutionName, isInvitedExternal, user?.institution]);

  useEffect(() => {
    if (isFptAffiliatedAccount) setInstitutionName(hostInstitutionName);
  }, [hostInstitutionName, isFptAffiliatedAccount]);

  const availableCampuses = useMemo(() => {
    const list = options?.campuses ?? [];
    return list.length > 0 ? list : DEFAULT_FPT_CAMPUSES;
  }, [options?.campuses]);

  const selectedCampus = useMemo(
    () => availableCampuses.find((campus) => campus.id === campusId),
    [availableCampuses, campusId],
  );

  const availablePrograms = useMemo(() => {
    const list = options?.programs ?? [];
    const source = list.length > 0 ? list : DEFAULT_FPT_PROGRAMS;
    if (!campusId) return source;
    return source.filter((program) => !program.campusId || program.campusId === campusId);
  }, [campusId, options?.programs]);

  const selectedProgram = useMemo(
    () => availablePrograms.find((program) => program.id === programId),
    [availablePrograms, programId],
  );

  const selectedResearchAreaValues = mergeTags(
    selectedResearchAreas.filter((item) => item !== "Other"),
    selectedResearchAreas.includes("Other") ? splitTags(otherResearchAreas) : [],
  );

  const selectedResearchInterestValues = mergeTags(
    selectedResearchInterests.filter((item) => item !== "Other"),
    selectedResearchInterests.includes("Other") ? splitTags(otherResearchInterests) : [],
  );

  const positionValue = currentPosition.trim() || (isStudent || (isLecturer && requiresFptAffiliation) ? roleCopy.label : "");
  const isPositionValid = isStudent || positionValue.length >= 2;
  const isInstitutionValid = requiresFptAffiliation || noAffiliation || institutionName.trim().length >= 2;
  const isProgramValid = !isStudent || Boolean(programId);
  const isResearchMinimumValid = selectedResearchAreaValues.length > 0 && selectedResearchInterestValues.length > 0;
  const canSubmit = isPositionValid && isInstitutionValid && isProgramValid && isResearchMinimumValid && !updateProfile.isPending;

  const isStep1Complete = Boolean(academicRole);
  const isStep2Complete = isInstitutionValid && isProgramValid;
  const isStep3Complete = isResearchMinimumValid;

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  if (isLoading && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#09090b]">
        <Loader2 className="h-7 w-7 animate-spin text-blue-600" aria-label={t("Loading account")} />
      </div>
    );
  }

  if (user && !requiresAcademicProfile(user)) {
    return <Navigate to={resolvePostAuthPath(user)} replace />;
  }

  const handleRoleSelect = (role: AcademicRole) => {
    setAcademicRole(role);
    setTimeout(() => {
      step2Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  };

  const handleCampusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCampusId = e.target.value;
    setCampusId(newCampusId);
    if (selectedProgram?.campusId && selectedProgram.campusId !== newCampusId) {
      setProgramId("");
    }
    if (isLecturer && newCampusId) {
      setTimeout(() => {
        step3Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    }
  };

  const handleProgramChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newProgramId = e.target.value;
    setProgramId(newProgramId);
    if (newProgramId) {
      setTimeout(() => {
        step3Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    }
  };

  const toggleResearchArea = (option: string) => {
    if (selectedResearchAreas.includes(option)) {
      setSelectedResearchAreas((prev) => prev.filter((item) => item !== option));
      return;
    }
    if (selectedResearchAreas.length >= 3) {
      toast.info(t("You can select up to 3 research areas."), { id: "max-research-areas" });
      return;
    }
    setSelectedResearchAreas((prev) => (prev.includes(option) ? prev : [...prev, option]));
  };

  const toggleResearchInterest = (option: string) => {
    if (selectedResearchInterests.includes(option)) {
      setSelectedResearchInterests((prev) => prev.filter((item) => item !== option));
      return;
    }
    if (selectedResearchInterests.length >= 5) {
      toast.info(t("You can select up to 5 research interests."), { id: "max-research-interests" });
      return;
    }
    setSelectedResearchInterests((prev) => (prev.includes(option) ? prev : [...prev, option]));
  };

  const submit = () => {
    if (!canSubmit) return;
    const nextInstitutionName = requiresFptAffiliation ? hostInstitutionName : institutionName.trim();
    updateProfile.mutate(
      {
        academicRole,
        positionTitle: positionValue || roleCopy.label,
        institutionName: noAffiliation && !requiresFptAffiliation ? undefined : nextInstitutionName,
        noAffiliation: noAffiliation && !requiresFptAffiliation,
        campusId: requiresFptAffiliation && campusId ? campusId : undefined,
        programId: isStudent && programId ? programId : undefined,
        researchAreas: selectedResearchAreaValues.slice(0, 5),
        researchInterests: selectedResearchInterestValues.slice(0, 10),
        skills: splitTags(skills),
        researchKeywords: selectedResearchAreaValues.slice(0, 5),
      },
      {
        onSuccess: ({ user: updatedUser }) => {
          toast.success(t("Academic profile saved. Welcome to LumiGap!"));
          navigate(resolvePostAuthPath(updatedUser), { replace: true });
        },
        onError: () => toast.error(t("Could not save your profile. Please try again.")),
      },
    );
  };

  return (
    <main className="relative min-h-screen bg-slate-50/80 px-4 py-8 text-slate-950 dark:bg-[#09090b] dark:text-white sm:px-6 lg:py-12">
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl flex-col">
        {/* Top Header */}
        <header className="flex items-center justify-between pb-8">
          <Link to="/" className="flex shrink-0 items-center">
            <img src={logoImage} alt="LumiGap" className="h-9 w-auto object-contain dark:hidden" />
            <img src={logoDarkImage} alt="LumiGap" className="hidden h-9 w-auto object-contain dark:block" />
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-2 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            disabled={logout.isPending}
            onClick={() => logout.mutate(undefined, { onSettled: () => navigate("/login", { replace: true }) })}
          >
            <LogOut className="h-3.5 w-3.5" />
            {t("Sign out")}
          </Button>
        </header>

        <div className="grid flex-1 items-start gap-10 lg:grid-cols-12">
          {/* Left Column: Focused Progress Tracker & Connected Identity */}
          <aside className="space-y-6 lg:col-span-4 lg:sticky lg:top-8">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                {t("Academic onboarding")}
              </span>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                {t("Welcome to LumiGap")}
              </h1>
              <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                {t("LumiGap separates your login email from your academic affiliation. FPT affiliation is verified through trusted evidence, not by guessing from how you signed in.")}
              </p>
            </div>

            {/* Vertical Progress Stepper */}
            <nav className="relative pl-6 space-y-6 before:absolute before:bottom-3 before:left-2.5 before:top-3 before:w-0.5 before:bg-slate-200 dark:before:bg-white/10" aria-label={t("Onboarding steps")}>
              {/* Step 1 Button */}
              <button
                type="button"
                onClick={() => step1Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="group relative flex w-full items-start gap-3 text-left transition"
              >
                <div
                  className={cn(
                    "absolute -left-6 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-all",
                    isStep1Complete
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "border-2 border-blue-600 bg-white text-blue-600 dark:bg-slate-900",
                  )}
                >
                  1
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 transition-colors group-hover:text-blue-600 dark:text-white">
                    {t("Step 1: Academic Role")}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {t(roleCopy.label)}
                  </p>
                </div>
              </button>

              {/* Step 2 Button */}
              <button
                type="button"
                onClick={() => step2Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="group relative flex w-full items-start gap-3 text-left transition"
              >
                <div
                  className={cn(
                    "absolute -left-6 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-all",
                    isStep2Complete
                      ? "bg-emerald-600 text-white shadow-sm"
                      : isStep1Complete
                        ? "border-2 border-blue-600 bg-white text-blue-600 dark:bg-slate-900"
                        : "border-2 border-slate-300 bg-white text-slate-400 dark:border-white/20 dark:bg-slate-900",
                  )}
                >
                  2
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 transition-colors group-hover:text-blue-600 dark:text-white">
                    {t("Step 2: Affiliation & Program")}
                  </p>
                  <p className="mt-0.5 max-w-[220px] truncate text-xs text-slate-500 dark:text-slate-400">
                    {requiresFptAffiliation
                      ? `${hostInstitutionName}${selectedCampus ? ` · ${selectedCampus.city || selectedCampus.name}` : ""}`
                      : institutionName || t("Independent")}
                  </p>
                </div>
              </button>

              {/* Step 3 Button */}
              <button
                type="button"
                onClick={() => step3Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="group relative flex w-full items-start gap-3 text-left transition"
              >
                <div
                  className={cn(
                    "absolute -left-6 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-all",
                    isStep3Complete
                      ? "bg-emerald-600 text-white shadow-sm"
                      : isStep2Complete
                        ? "border-2 border-blue-600 bg-white text-blue-600 dark:bg-slate-900"
                        : "border-2 border-slate-300 bg-white text-slate-400 dark:border-white/20 dark:bg-slate-900",
                  )}
                >
                  3
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 transition-colors group-hover:text-blue-600 dark:text-white">
                    {t("Step 3: Research Focus")}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {isStep3Complete ? (
                      <span>
                        {selectedResearchAreaValues.length} {t("Research areas")}
                      </span>
                    ) : (
                      t("None selected")
                    )}
                  </p>
                </div>
              </button>
            </nav>

            {/* Authenticated Account Note */}
            <div className="rounded-2xl border border-slate-200/90 bg-white/70 p-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white shadow-sm">
                  {user?.fullName ? user.fullName[0]?.toUpperCase() : "U"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                    {user?.fullName || "Scholar"}
                  </p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {user?.email}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-2.5 text-[11px] font-medium text-emerald-700 dark:border-white/5 dark:text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{t("Connected via FPT institutional single sign-on")}</span>
              </div>
            </div>
          </aside>

          {/* Right Column: Progressive Stepped Form Cards */}
          <div className="space-y-8 lg:col-span-8">
            {/* Step 1 Card: Academic Role */}
            <section
              ref={step1Ref}
              className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#12131a] sm:p-8"
            >
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                    {t("Step 1 of 3")}
                  </span>
                  <h2 className="mt-2 text-lg font-bold text-slate-900 dark:text-white sm:text-xl">
                    {t("Current academic role")}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {isInvitedExternal
                      ? t("External collaborators can onboard as Researchers or Lecturers. Student access requires a verified current FPT affiliation.")
                      : t("Choose the role that describes you today. You can request a role change later.")}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {ROLE_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const selected = academicRole === option.role;
                  const disabled = isInvitedExternal && option.role === "STUDENT";
                  return (
                    <button
                      key={option.role}
                      type="button"
                      disabled={disabled}
                      onClick={() => handleRoleSelect(option.role)}
                      className={cn(
                        "group relative rounded-2xl border p-4 text-left transition-all duration-150",
                        selected
                          ? "border-blue-600 bg-blue-50/70 text-blue-950 shadow-sm ring-2 ring-blue-600/30 dark:border-blue-500 dark:bg-blue-950/30 dark:text-blue-100 dark:ring-blue-500/30"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50/60 dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-300 dark:hover:border-white/20 dark:hover:bg-white/[0.05]",
                        disabled && "cursor-not-allowed opacity-50 hover:border-slate-200 dark:hover:border-white/10",
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-xl transition-all",
                            selected
                              ? "bg-blue-600 text-white shadow-sm shadow-blue-600/25"
                              : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-400",
                          )}
                        >
                          <Icon className="h-4.5 w-4.5" />
                        </div>
                      </div>
                      <p className="mt-3 text-sm font-bold">{t(option.label)}</p>
                      <p className="mt-1 text-xs leading-4 opacity-75">{t(option.description)}</p>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Step 2 Card: Affiliation & Program */}
            <section
              ref={step2Ref}
              className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#12131a] sm:p-8"
            >
              <div className="mb-5">
                <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                  {t("Step 2 of 3")}
                </span>
                <h2 className="mt-2 text-lg font-bold text-slate-900 dark:text-white sm:text-xl">
                  {t("Step 2: Affiliation & Program")}
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {requiresFptAffiliation
                    ? t("LumiGap separates your login email from your academic affiliation. FPT affiliation is verified through trusted evidence, not by guessing from how you signed in.")
                    : t("Department or school is optional and can be completed later in Academic Profile.")}
                </p>
              </div>

              {requiresFptAffiliation ? (
                <div className="space-y-4">
                  {/* FPT Locked Card */}
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {t("Institution")}
                    </label>
                    <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-3 text-blue-950 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
                      <div className="flex items-center gap-3">
                        <University className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        <span className="font-semibold text-sm">{hostInstitutionName}</span>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/50 dark:text-blue-200">
                        <Lock className="h-3 w-3" />
                        {t("Verified institutional domain")}
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400" htmlFor="campus-select">
                        {t("Campus")}
                      </label>
                      <select
                        id="campus-select"
                        value={campusId}
                        onChange={handleCampusChange}
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-[#1a1c24]"
                      >
                        <option value="">{optionsQuery.isLoading ? t("Loading campuses…") : t("Select campus")}</option>
                        {availableCampuses.map((campus) => (
                          <option key={campus.id} value={campus.id}>
                            {[campus.name, campus.city].filter(Boolean).join(" · ")}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{t("Optional — can be completed in Academic Profile later.")}</p>
                    </div>

                    {!isStudent && !(isLecturer && requiresFptAffiliation) && (
                      <div>
                        <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400" htmlFor="researcher-position-input">
                          {t("Current position")} <span className="text-red-500">*</span>
                        </label>
                        <Input
                          id="researcher-position-input"
                          value={currentPosition}
                          onChange={(event) => setCurrentPosition(event.target.value)}
                          maxLength={160}
                          placeholder={t("e.g. Research Assistant, Research Scientist")}
                          className="h-11 rounded-xl text-sm shadow-sm focus-visible:ring-blue-500 dark:bg-[#1a1c24] dark:border-white/10"
                        />
                      </div>
                    )}

                    {isLecturer && requiresFptAffiliation && (
                      <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.02] dark:text-slate-400">
                        <p className="font-semibold text-slate-900 dark:text-white">{t("Lecturer position locked")}</p>
                        <p className="mt-1 leading-relaxed">
                          {t("Because your account is linked to FPT, this onboarding saves your current position as Lecturer. Department or school can be added later in Academic Profile.")}
                        </p>
                      </div>
                    )}
                  </div>

                  {isStudent && (
                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400" htmlFor="program-select">
                        {t("Program / Major")} <span className="text-red-500">*</span>
                      </label>
                      <select
                        id="program-select"
                        value={programId}
                        onChange={handleProgramChange}
                        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-[#1a1c24]"
                      >
                        <option value="">{optionsQuery.isLoading ? t("Loading programs…") : t("Select program")}</option>
                        {availablePrograms.map((program) => (
                          <option key={program.id} value={program.id}>
                            {[program.code, program.name].filter(Boolean).join(" · ")}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400" htmlFor="current-position-input">
                      {t("Current position")} <span className="text-red-500">*</span>
                    </label>
                    <Input
                      id="current-position-input"
                      value={currentPosition}
                      onChange={(event) => setCurrentPosition(event.target.value)}
                      maxLength={160}
                      placeholder={t("e.g. Research Scientist, Lecturer, Independent Researcher")}
                      className="h-11 rounded-xl text-sm shadow-sm focus-visible:ring-blue-500 dark:bg-[#1a1c24] dark:border-white/10"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400" htmlFor="institution-input">
                      {t("Current institution or organization")} {!noAffiliation && <span className="text-red-500">*</span>}
                    </label>
                    <Input
                      id="institution-input"
                      value={institutionName}
                      disabled={noAffiliation}
                      onChange={(event) => setInstitutionName(event.target.value)}
                      placeholder={noAffiliation ? t("Independent") : t("Institution or organization")}
                      className="h-11 rounded-xl text-sm shadow-sm focus-visible:ring-blue-500 dark:bg-[#1a1c24] dark:border-white/10"
                    />
                    <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-xs text-slate-600 select-none dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={noAffiliation}
                        onChange={(event) => setNoAffiliation(event.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-[#1a1c24]"
                      />
                      <span>{t("I don't currently have an institutional affiliation")}</span>
                    </label>
                  </div>
                </div>
              )}
            </section>

            {/* Step 3 Card: Research Focus (Fluid Chips & Tags) */}
            <section
              ref={step3Ref}
              className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#12131a] sm:p-8"
            >
              <div className="mb-5">
                <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 dark:bg-blue-950/50 dark:text-blue-300">
                  {t("Step 3 of 3")}
                </span>
                <h2 className="mt-2 text-lg font-bold text-slate-900 dark:text-white sm:text-xl">
                  {t("Step 3: Research Focus")}
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t("Choose at least one area. Use Other for custom areas.")}
                </p>
              </div>

              <div className="space-y-6">
                {/* Research Areas - Fluid Tag Chips */}
                <div>
                  <div className="mb-2.5 flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {t("Research areas")} <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {selectedResearchAreas.length}/3 {t("selected")}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2 sm:gap-2.5">
                    {RESEARCH_AREA_OPTIONS.map((option) => {
                      const selected = selectedResearchAreas.includes(option);
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => toggleResearchArea(option)}
                          className={cn(
                            "inline-flex items-center rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-150 select-none",
                            selected
                              ? "border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-600/20 dark:border-blue-500 dark:bg-blue-600"
                              : "border-slate-200 bg-slate-50/50 text-slate-700 hover:border-slate-300 hover:bg-slate-100/80 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:border-white/20 dark:hover:bg-white/[0.06]",
                          )}
                          aria-pressed={selected}
                        >
                        <span>{option}</span>
                        </button>
                      );
                    })}
                  </div>

                  {selectedResearchAreas.includes("Other") && (
                    <div className="mt-3 animate-in fade-in slide-in-from-top-1 duration-150">
                      <Input
                        value={otherResearchAreas}
                        onChange={(event) => setOtherResearchAreas(event.target.value)}
                        placeholder={t("Add other research areas")}
                        className="h-10 rounded-xl text-xs sm:text-sm bg-slate-50/60 dark:bg-white/[0.02] border-slate-200 dark:border-white/10 focus-visible:ring-blue-500"
                      />
                    </div>
                  )}
                </div>

                {/* Research Interests - Fluid Tag Chips */}
                <div>
                  <div className="mb-2.5 flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      {t("Research interests")} <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {selectedResearchInterests.length}/5 {t("selected")}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2 sm:gap-2.5">
                    {RESEARCH_INTEREST_OPTIONS.map((option) => {
                      const selected = selectedResearchInterests.includes(option);
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => toggleResearchInterest(option)}
                          className={cn(
                            "inline-flex items-center rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-150 select-none",
                            selected
                              ? "border-blue-600 bg-blue-600 text-white shadow-sm shadow-blue-600/20 dark:border-blue-500 dark:bg-blue-600"
                              : "border-slate-200 bg-slate-50/50 text-slate-700 hover:border-slate-300 hover:bg-slate-100/80 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 dark:hover:border-white/20 dark:hover:bg-white/[0.06]",
                          )}
                          aria-pressed={selected}
                        >
                        <span>{option}</span>
                        </button>
                      );
                    })}
                  </div>

                  {selectedResearchInterests.includes("Other") && (
                    <div className="mt-3 animate-in fade-in slide-in-from-top-1 duration-150">
                      <Input
                        value={otherResearchInterests}
                        onChange={(event) => setOtherResearchInterests(event.target.value)}
                        placeholder={t("Add other research interests")}
                        className="h-10 rounded-xl text-xs sm:text-sm bg-slate-50/60 dark:bg-white/[0.02] border-slate-200 dark:border-white/10 focus-visible:ring-blue-500"
                      />
                    </div>
                  )}
                </div>

                {/* Optional Skills Input */}
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400" htmlFor="skills-input">
                    {t("Research skills")}
                  </label>
                  <Input
                    id="skills-input"
                    value={skills}
                    onChange={(event) => setSkills(event.target.value)}
                    placeholder={t("Screening papers, Python, qualitative coding")}
                    className="h-11 rounded-xl text-sm shadow-sm focus-visible:ring-blue-500 dark:bg-[#1a1c24] dark:border-white/10"
                  />
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {t("Optional — separate skills with commas, or skip for now.")}
                  </p>
                </div>

                {/* Verification Notice for FPT Users */}
                {requiresFptAffiliation && (
                  <div className="rounded-2xl border border-amber-200/80 bg-amber-50/60 p-4 text-xs text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-100">
                    <p className="font-bold">{t("Verification after saving")}</p>
                    <div className="mt-1.5 space-y-1 text-slate-600 dark:text-amber-200/80 leading-relaxed">
                      {options?.verificationMethods.feid && <p>• {t("FEID verification is available for this institution.")}</p>}
                      {options?.verificationMethods.institutionalEmail && <p>• {t("Verify with an FPT institutional email to confirm your current affiliation.")}</p>}
                      {options?.verificationMethods.manualReview && <p>• {t("If automated verification is not available, submit a verification request from your Academic Profile.")}</p>}
                    </div>
                  </div>
                )}

                {/* Submit Action */}
                <div className="pt-2">
                  <Button
                    type="button"
                    size="lg"
                    className="h-12 w-full rounded-xl bg-blue-600 text-sm font-bold text-white shadow-md shadow-blue-600/20 transition-all hover:bg-blue-700 disabled:opacity-50"
                    disabled={!canSubmit}
                    onClick={submit}
                  >
                    {updateProfile.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("Saving profile…")}
                      </>
                    ) : (
                      t("Continue to LumiGap")
                    )}
                  </Button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
