import { useState } from "react";
import type { AcademicProfileType } from "@trend/shared-types";
import { BookOpen, GraduationCap, Loader2, LogOut, Microscope } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import logoImage from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
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

const profileOptions: ReadonlyArray<{
  value: AcademicProfileType;
  title: string;
  description: string;
  icon: typeof GraduationCap;
}> = [
  {
    value: "student",
    title: "Student",
    description: "I’m learning, exploring literature, and building my research skills.",
    icon: GraduationCap,
  },
  {
    value: "researcher",
    title: "Researcher",
    description: "I conduct research, collaborate on projects, and publish findings.",
    icon: Microscope,
  },
  {
    value: "lecturer",
    title: "Lecturer",
    description: "I teach, mentor students, and contribute to academic research.",
    icon: BookOpen,
  },
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
  const [selection, setSelection] = useState<AcademicProfileType | null>(
    user?.academicProfileType ?? null,
  );

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

  const submit = () => {
    if (!selection) return;
    updateProfile.mutate(
      { academicProfileType: selection },
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
          <img src={logoImage} alt={t("LiemResearch")} className="h-14 w-auto object-contain sm:h-16" />
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

        <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center py-10 sm:py-14">
          <div className="mb-9 text-center">
            <div className="mb-4 inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-blue-700 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-300">
              {t("One last step")}
            </div>
            <h1 className="text-balance text-3xl font-black tracking-tight sm:text-5xl">
              {t("Which best describes your academic profile?")}
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-400 sm:text-lg">
              {t("We’ll use this to tailor recommendations and research tools to your work. You can update it later in your profile.")}
            </p>
          </div>

          <fieldset>
            <legend className="sr-only">{t("Choose your academic profile")}</legend>
            <div className="grid gap-4 md:grid-cols-3">
              {profileOptions.map((option) => {
                const Icon = option.icon;
                const isSelected = selection === option.value;
                return (
                  <label
                    key={option.value}
                    className={cn(
                      "group relative flex min-h-56 cursor-pointer flex-col rounded-3xl border bg-white p-6 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-blue-300 hover:shadow-xl hover:shadow-blue-900/5 focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 dark:bg-[#111217] dark:focus-within:ring-offset-[#09090b]",
                      isSelected
                        ? "border-blue-500 ring-2 ring-blue-500 shadow-xl shadow-blue-900/10 dark:border-blue-400"
                        : "border-slate-200 dark:border-white/10 dark:hover:border-blue-500/60",
                    )}
                  >
                    <input
                      className="sr-only"
                      type="radio"
                      name="academic-profile"
                      value={option.value}
                      checked={isSelected}
                      onChange={() => setSelection(option.value)}
                    />
                    <span
                      className={cn(
                        "mb-8 flex h-12 w-12 items-center justify-center rounded-2xl transition-colors",
                        isSelected
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-600 dark:bg-white/5 dark:text-slate-300 dark:group-hover:bg-blue-950/50",
                      )}
                    >
                      <Icon className="h-6 w-6" />
                    </span>
                    <span className="text-xl font-black">{t(option.title)}</span>
                    <span className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
                      {t(option.description)}
                    </span>
                    <span
                      className={cn(
                        "absolute right-5 top-5 flex h-5 w-5 items-center justify-center rounded-full border-2",
                        isSelected ? "border-blue-600" : "border-slate-300 dark:border-slate-600",
                      )}
                      aria-hidden="true"
                    >
                      {isSelected && <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="mx-auto mt-8 w-full max-w-sm">
            <Button
              type="button"
              size="lg"
              className="h-12 w-full rounded-xl bg-blue-600 text-base font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
              disabled={!selection || updateProfile.isPending}
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
            <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-500">
              {t("A selection is required to continue.")}
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
