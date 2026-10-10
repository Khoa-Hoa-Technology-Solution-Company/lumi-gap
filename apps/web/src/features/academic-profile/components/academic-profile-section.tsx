import { useI18n } from "@/i18n";
import { Button } from "@/components/ui/button";
import { useAcademicProfile } from "../hooks/use-academic-profile";
import { AcademicProfileView } from "./academic-profile-view";
import { Navigate, useSearchParams } from "react-router-dom";

/** Settings uses the same profile and editors as the owner/public Profile routes. */
export function AcademicProfileSection() {
  const { t } = useI18n();
  const profile = useAcademicProfile();
  const [params] = useSearchParams();
  if (params.has("requestId")) return <Navigate to={`/settings/verification/lecturer?${params.toString()}`} replace />;
  if (profile.isLoading) return <div className="h-48 animate-pulse rounded-xl bg-muted" role="status" aria-label={t("Loading profile")} />;
  if (!profile.data || profile.isError) return <div className="space-y-3"><p className="text-sm text-muted-foreground">{t("Unable to load the academic profile.")}</p><Button variant="outline" onClick={() => void profile.refetch()}>{t("Retry")}</Button></div>;
  return <AcademicProfileView profile={profile.data} editableProfile={profile.data} embedded />;
}
