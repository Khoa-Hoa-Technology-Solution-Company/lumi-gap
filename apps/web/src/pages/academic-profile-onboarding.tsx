import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, LogOut, Search, University, UserCheck } from "lucide-react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import logoImage from "@/assets/logo.png";
import logoDarkImage from "@/assets/logo-dark.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

interface PositionGroup {
  category: string;
  options: string[];
}

const POSITION_GROUPS: PositionGroup[] = [
  {
    category: "Student",
    options: [
      "Student",
      "Undergraduate Student",
      "Master's Student",
      "PhD Student / Candidate",
    ],
  },
  {
    category: "Lecturer / Faculty",
    options: [
      "Lecturer",
      "Senior Lecturer",
      "Professor / Faculty",
    ],
  },
  {
    category: "Research",
    options: [
      "Research Assistant",
      "Research Associate",
      "Research Scientist",
      "Postdoctoral Researcher",
    ],
  },
  {
    category: "Other & Industry",
    options: [
      "Independent Researcher",
      "Research Software Engineer",
      "Industry Researcher / Practitioner",
      "Other",
    ],
  },
];

const POPULAR_INSTITUTIONS = [
  "FPT University",
  "Vietnam National University, Hanoi",
  "Vietnam National University, Ho Chi Minh City",
  "Hanoi University of Science and Technology",
  "Ho Chi Minh City University of Technology",
  "Ton Duc Thang University",
  "Duy Tan University",
  "Foreign Trade University",
  "National Economics University",
  "Can Tho University",
  "Hue University",
  "Massachusetts Institute of Technology (MIT)",
  "Stanford University",
  "Harvard University",
  "University of Oxford",
  "University of Cambridge",
  "National University of Singapore (NUS)",
  "Nanyang Technological University (NTU)",
];

export function AcademicProfileOnboardingPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const accessToken = useAuthStore((state) => state.tokens?.accessToken);
  const storedUser = useAuthStore((state) => state.user);
  const { data, isLoading } = useCurrentUser();
  const updateProfile = useUpdateAcademicProfile();
  const logout = useLogout();
  const user = data?.user ?? storedUser;

  const [positionTitle, setPositionTitle] = useState("");
  const [isPositionDropdownOpen, setIsPositionDropdownOpen] = useState(false);
  const positionDropdownRef = useRef<HTMLDivElement>(null);

  const [institutionName, setInstitutionName] = useState(user?.institution ?? "FPT University");
  const [isInstDropdownOpen, setIsInstDropdownOpen] = useState(false);
  const instDropdownRef = useRef<HTMLDivElement>(null);

  const [noAffiliation, setNoAffiliation] = useState(false);
  const [department, setDepartment] = useState("");

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        positionDropdownRef.current &&
        !positionDropdownRef.current.contains(event.target as Node)
      ) {
        setIsPositionDropdownOpen(false);
      }
      if (
        instDropdownRef.current &&
        !instDropdownRef.current.contains(event.target as Node)
      ) {
        setIsInstDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredGroups = useMemo(() => {
    const query = positionTitle.trim().toLowerCase();
    if (!query) return POSITION_GROUPS;

    return POSITION_GROUPS.map((group) => ({
      ...group,
      options: group.options.filter((opt) => opt.toLowerCase().includes(query)),
    })).filter((group) => group.options.length > 0);
  }, [positionTitle]);

  const filteredInstitutions = useMemo(() => {
    const query = institutionName.trim().toLowerCase();
    if (!query) return POPULAR_INSTITUTIONS.slice(0, 6);
    return POPULAR_INSTITUTIONS.filter((inst) => inst.toLowerCase().includes(query)).slice(0, 6);
  }, [institutionName]);

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

  const isPositionValid = positionTitle.trim().length >= 2;
  const isInstitutionValid = noAffiliation || institutionName.trim().length >= 2;
  const canSubmit = isPositionValid && isInstitutionValid && !updateProfile.isPending;

  const submit = () => {
    if (!canSubmit) return;
    updateProfile.mutate(
      {
        positionTitle: positionTitle.trim(),
        institutionName: noAffiliation ? undefined : institutionName.trim(),
        noAffiliation,
        department: noAffiliation ? undefined : (department.trim() || undefined),
      },
      {
        onSuccess: ({ user: updatedUser }) => {
          toast.success("Academic profile saved. Welcome to LiemResearch!");
          navigate(resolvePostAuthPath(updatedUser), { replace: true });
        },
        onError: () => toast.error("Could not save your profile. Please try again."),
      },
    );
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-50 px-4 py-8 text-slate-950 dark:bg-[#09090b] dark:text-white sm:px-6 lg:py-12">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-32 top-[-12rem] h-[30rem] w-[30rem] rounded-full bg-blue-300/25 blur-3xl dark:bg-blue-600/10" />
        <div className="absolute -right-40 bottom-[-15rem] h-[34rem] w-[34rem] rounded-full bg-indigo-300/25 blur-3xl dark:bg-indigo-600/10" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl flex-col">
        <header className="flex items-center justify-between">
          <Link to="/" className="flex items-center shrink-0">
            <img src={logoImage} alt="LumiGap" className="h-10 w-auto object-contain sm:h-12 dark:hidden" />
            <img src={logoDarkImage} alt="LumiGap" className="hidden h-10 w-auto object-contain sm:h-12 dark:block" />
          </Link>
          <Button
            type="button"
            variant="ghost"
            className="gap-2 text-slate-600 dark:text-slate-300"
            disabled={logout.isPending}
            onClick={() => logout.mutate(undefined, { onSettled: () => navigate("/login", { replace: true }) })}
          >
            <LogOut className="h-4 w-4" />
            {t("Sign out")}
          </Button>
        </header>

        <section className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center py-8 sm:py-12">
          <div className="mb-8 text-center">
            <div className="mb-3 inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-300">
              {t("One last step")}
            </div>
            <h1 className="text-balance text-2xl font-black tracking-tight sm:text-4xl text-slate-900 dark:text-white">
              {t("Tell us about your current academic profile")}
            </h1>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600 dark:text-slate-400 sm:text-base">
              {t("We’ll use this to tailor recommendations and research tools to your work. You can update it later in your profile.")}
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-[#12131a]/90 sm:p-8 space-y-6">
            {/* Field 1: Current position */}
            <div ref={positionDropdownRef} className="relative">
              <label className="mb-2 flex items-center justify-between text-sm font-bold text-slate-900 dark:text-white" htmlFor="position-input">
                <span>
                  {t("What is your current academic or professional position?")} <span className="text-red-500">*</span>
                </span>
              </label>

              <div className="relative">
                <Input
                  id="position-input"
                  value={positionTitle}
                  onChange={(e) => {
                    setPositionTitle(e.target.value);
                    setIsPositionDropdownOpen(true);
                  }}
                  onFocus={() => setIsPositionDropdownOpen(true)}
                  placeholder={t("Search or enter your position...")}
                  className="h-12 rounded-xl pr-10 text-base shadow-sm focus-visible:ring-blue-500 dark:bg-[#1a1c24] dark:border-slate-700"
                  autoComplete="off"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setIsPositionDropdownOpen((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  aria-label="Toggle suggestions"
                >
                  <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", isPositionDropdownOpen && "rotate-180")} />
                </button>
              </div>

              {/* Suggestions Dropdown */}
              {isPositionDropdownOpen && (
                <div className="absolute z-50 mt-2 max-h-72 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl dark:border-slate-800 dark:bg-[#161822] animate-in fade-in slide-in-from-top-2 duration-150">
                  {filteredGroups.length > 0 ? (
                    filteredGroups.map((group) => (
                      <div key={group.category} className="mb-2 last:mb-0">
                        <div className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          {group.category}
                        </div>
                        <div className="space-y-0.5">
                          {group.options.map((option) => {
                            const isSelected = positionTitle.trim().toLowerCase() === option.toLowerCase();
                            return (
                              <button
                                key={option}
                                type="button"
                                onClick={() => {
                                  setPositionTitle(option);
                                  setIsPositionDropdownOpen(false);
                                }}
                                className={cn(
                                  "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors",
                                  isSelected
                                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5",
                                )}
                              >
                                <span>{t(option)}</span>
                                {isSelected && <Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 text-center">
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Press Enter or Continue to use <span className="font-semibold text-slate-900 dark:text-white">"{positionTitle}"</span>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Field 2: Current institution or organization */}
            <div ref={instDropdownRef} className="relative">
              <label className="mb-2 block text-sm font-bold text-slate-900 dark:text-white" htmlFor="institution-input">
                {t("Current institution or organization")}
                {!noAffiliation && <span className="text-red-500"> *</span>}
              </label>

              <div className="relative">
                <Input
                  id="institution-input"
                  value={institutionName}
                  disabled={noAffiliation}
                  onChange={(e) => {
                    setInstitutionName(e.target.value);
                    setIsInstDropdownOpen(true);
                  }}
                  onFocus={() => {
                    if (!noAffiliation) setIsInstDropdownOpen(true);
                  }}
                  placeholder={noAffiliation ? t("No institutional affiliation (Independent)") : t("Search or enter institution...")}
                  className={cn(
                    "h-12 rounded-xl text-base shadow-sm focus-visible:ring-blue-500 dark:bg-[#1a1c24] dark:border-slate-700",
                    noAffiliation && "bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-slate-500 cursor-not-allowed",
                  )}
                  autoComplete="off"
                />
                {!noAffiliation && (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setIsInstDropdownOpen((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    aria-label="Toggle institution suggestions"
                  >
                    <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", isInstDropdownOpen && "rotate-180")} />
                  </button>
                )}
              </div>

              {/* Institution Suggestions Dropdown */}
              {!noAffiliation && isInstDropdownOpen && filteredInstitutions.length > 0 && (
                <div className="absolute z-50 mt-2 max-h-56 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl dark:border-slate-800 dark:bg-[#161822] animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Suggested Institutions
                  </div>
                  <div className="space-y-0.5">
                    {filteredInstitutions.map((inst) => {
                      const isSelected = institutionName.trim().toLowerCase() === inst.toLowerCase();
                      return (
                        <button
                          key={inst}
                          type="button"
                          onClick={() => {
                            setInstitutionName(inst);
                            setIsInstDropdownOpen(false);
                          }}
                          className={cn(
                            "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors",
                            isSelected
                              ? "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                              : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5",
                          )}
                        >
                          <span className="truncate">{inst}</span>
                          {isSelected && <Check className="h-4 w-4 flex-shrink-0 text-blue-600 dark:text-blue-400" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Checkbox: No Affiliation */}
              <label className="mt-3 flex items-center gap-2.5 cursor-pointer text-sm text-slate-700 dark:text-slate-300 select-none">
                <input
                  type="checkbox"
                  checked={noAffiliation}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setNoAffiliation(checked);
                    if (checked) {
                      setIsInstDropdownOpen(false);
                    }
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-[#1a1c24]"
                />
                <span className="font-medium">{t("I don't currently have an institutional affiliation")}</span>
              </label>
            </div>

            {/* Field 3: Department / School (Optional) */}
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-900 dark:text-white" htmlFor="department-input">
                {t("Department / School (Optional)")}
              </label>
              <Input
                id="department-input"
                value={department}
                disabled={noAffiliation}
                onChange={(e) => setDepartment(e.target.value)}
                maxLength={200}
                placeholder={t("e.g. Department of Computer Science, School of Information Technology...")}
                className={cn(
                  "h-12 rounded-xl text-base shadow-sm focus-visible:ring-blue-500 dark:bg-[#1a1c24] dark:border-slate-700",
                  noAffiliation && "bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-slate-500 cursor-not-allowed",
                )}
              />
            </div>

            {/* Action Button */}
            <div className="pt-2">
              <Button
                type="button"
                size="lg"
                className="h-12 w-full rounded-xl bg-blue-600 text-base font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all disabled:opacity-50"
                disabled={!canSubmit}
                onClick={submit}
              >
                {updateProfile.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("Saving profile…")}
                  </>
                ) : (
                  t("Continue to LiemResearch")
                )}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
