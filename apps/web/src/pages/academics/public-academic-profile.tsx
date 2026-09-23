import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AcademicProfileView, usePublicAcademicProfile, usePublicAcademicProfileByHandle } from "@/features/academic-profile";
import { useI18n } from "@/i18n";

export function PublicAcademicProfilePage() {
  const { t } = useI18n();
  const location = useLocation();
  const { userId = "", handle = "" } = useParams();
  const byId = usePublicAcademicProfile(handle ? "" : userId);
  const byHandle = usePublicAcademicProfileByHandle(handle);
  const { data: profile, isLoading, error } = handle ? byHandle : byId;

  if (isLoading) {
    return <main className="mx-auto max-w-[1120px] px-4 py-8" aria-label="Loading academic profile"><div className="h-80 animate-pulse rounded-[22px] bg-slate-100 dark:bg-slate-900" /><div className="mt-5 h-48 animate-pulse rounded-[18px] bg-slate-100 dark:bg-slate-900" /></main>;
  }
  if (error || !profile) {
    return <main className="mx-auto max-w-3xl px-4 py-16 text-center"><h1 className="text-2xl font-semibold text-slate-950 dark:text-white">{t("Academic profile unavailable")}</h1><Button asChild variant="outline" className="mt-5"><Link to="/communities">{t("Explore academic communities")}</Link></Button></main>;
  }

  if (profile.publicHandle && (userId || location.pathname.startsWith("/u/") || profile.publicHandle !== handle)) {
    return <Navigate to={`/${profile.publicHandle}`} replace />;
  }

  return <AcademicProfileView profile={profile} />;
}
