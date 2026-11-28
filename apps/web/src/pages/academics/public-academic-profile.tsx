import { Link, Navigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Eye, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageSkeleton, SectionErrorState } from "@/components/loading";
import { AcademicProfileView, usePublicAcademicProfile, usePublicAcademicProfileByHandle } from "@/features/academic-profile";
import { useI18n } from "@/i18n";

export function PublicAcademicProfilePage() {
  const { t } = useI18n();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { userId = "", handle = "" } = useParams();
  const preview = searchParams.get("preview") === "public" ? "public" : undefined;
  const byId = usePublicAcademicProfile(handle ? "" : userId, preview);
  const byHandle = usePublicAcademicProfileByHandle(handle, preview);
  const { data: profile, isLoading, error } = handle ? byHandle : byId;

  if (isLoading) {
    return (
      <main>
        <PageSkeleton variant="profile" label={t("loading.profile")} />
      </main>
    );
  }
  if (error || !profile) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <SectionErrorState
          error={error}
          title={t("Academic profile unavailable")}
          description={t("profileRedesign.publicUnavailableHint")}
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/communities">{t("Explore academic communities")}</Link>
            </Button>
          }
        />
      </main>
    );
  }

  if (profile.publicHandle && !userId && location.pathname !== `/u/${profile.publicHandle}`) {
    return <Navigate to={`/u/${profile.publicHandle}${preview ? "?preview=public" : ""}`} replace />;
  }

  const forumProfileBase = profile.publicHandle
    ? `/u/${encodeURIComponent(profile.publicHandle)}`
    : `/academics/${encodeURIComponent(profile.userId)}`;

  return (
    <div data-no-i18n>
      {preview ? (
        <div className="border-b border-border bg-muted/40">
          <div className="mx-auto flex max-w-[1160px] flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 text-foreground">
              {profile.previewNotice ? (
                <Lock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              )}
              <span>
                {profile.previewNotice === "PRIVATE"
                  ? t("profileRedesign.previewPrivateNotice")
                  : profile.previewNotice === "MEMBERS_ONLY"
                    ? t("profileRedesign.previewMembersNotice")
                    : t("profileRedesign.previewPublicBanner")}
              </span>
            </div>
            <Button asChild variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
              <Link to="/profile">
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{t("profileRedesign.backToMyProfile")}</span>
              </Link>
            </Button>
          </div>
        </div>
      ) : null}

      <nav
        className="mx-auto flex max-w-[1160px] flex-wrap justify-end gap-2 px-4 pt-4 sm:px-6 lg:px-8"
        aria-label={t("Member profile navigation")}
      >
        <Button asChild variant="ghost" size="sm">
          <Link to={`${forumProfileBase}/summary`}>{t("Forum summary")}</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to={`${forumProfileBase}/activity`}>{t("Forum activity")}</Link>
        </Button>
      </nav>
      <AcademicProfileView profile={profile} />
    </div>
  );
}
