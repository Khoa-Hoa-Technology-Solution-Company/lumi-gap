import { Link, useSearchParams } from "react-router-dom";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageSkeleton, SectionErrorState } from "@/components/loading";
import { useCurrentUser } from "@/features/auth";
import { AcademicProfileView, useAcademicProfile } from "@/features/academic-profile";
import type { EditSection } from "@/features/academic-profile/components/academic-profile-inline-editor";
import { useI18n } from "@/i18n";

const editSections: EditSection[] = ["basic", "academic", "research", "links", "works", "availability", "cover", "intro", "affiliation", "link"];

export function ProfilePage() {
  const { t } = useI18n();
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = currentUser?.user;
  const hasAcademicProfile = Boolean(user?.primaryPosition || user?.onboarding?.completed);
  const {
    data: profile,
    isLoading: profileLoading,
    isFetching: profileFetching,
    error,
    refetch,
  } = useAcademicProfile(hasAcademicProfile);
  const requestedSection = searchParams.get("edit");
  const editingSection =
    requestedSection === "1" || requestedSection === "about"
      ? "basic"
      : editSections.find(section => section === requestedSection) ?? null;
  const setEditing = (section: EditSection | null) => setSearchParams(current => {
    const next = new URLSearchParams(current);
    if (section) next.set("edit", section);
    else next.delete("edit");
    return next;
  }, { replace: true });

  if (userLoading || (hasAcademicProfile && profileLoading)) {
    return (
      <main>
        <PageSkeleton variant="profile" label={t("loading.profile")} />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <SectionErrorState title={t("Unable to load your profile.")} />
      </main>
    );
  }

  if (!hasAcademicProfile) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <div className="rounded-[18px] border border-slate-200 bg-white p-7 dark:border-slate-800 dark:bg-[#101923]">
          <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">{user.fullName}</h1>
          <p className="mt-2 text-sm text-slate-500">{t("Your account does not have an academic profile yet.")}</p>
          <Button asChild variant="outline" className="mt-5 gap-2">
            <Link to="/settings/profile"><Settings2 className="h-4 w-4" />{t("Account settings")}</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <SectionErrorState
          error={error}
          title={t("Academic profile unavailable")}
          onRetry={() => void refetch()}
          retrying={profileFetching}
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/settings/profile">{t("Account settings")}</Link>
            </Button>
          }
        />
      </main>
    );
  }

  return <AcademicProfileView profile={profile} editableProfile={profile} editingSection={editingSection} onEdit={setEditing} onCloseEdit={() => setEditing(null)} />;
}
