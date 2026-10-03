import { lazy, Suspense } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { ResearchComposer } from "@/features/home/components/research-composer";
import { HomeDiscovery } from "@/features/home/components/home-discovery";
import { hasHomeSearch, LITERATURE_PATH } from "@/features/home/utils/home-search";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import "@/features/home/home.css";

const GuestHomePage = lazy(() => import("./home-guest").then((module) => ({ default: module.GuestHomePage })));

export function HomePage() {
  const authenticated = useAuthStore((state) => Boolean(state.tokens?.accessToken));
  const location = useLocation();
  if (hasHomeSearch(new URLSearchParams(location.search))) {
    return <Navigate to={{ pathname: LITERATURE_PATH, search: location.search, hash: location.hash }} replace />;
  }
  return authenticated ? <ResearchHome /> : <Suspense fallback={<HomeSkeleton />}><GuestHomePage /></Suspense>;
}

// Search remains usable independently of the lower section's library data.
export function ResearchEntry() {
  const { t } = useI18n();

  return <div className="research-home" data-no-i18n>
    <section className="research-home-entry home-width" aria-labelledby="home-research-heading">
      <p className="home-intro-label">{t("A little curiosity. A new possibility.")}</p>
      <h1 id="home-research-heading">{t("What are you researching today?")}</h1>
      <p className="research-home-entry-description">{t("Pick up a thought. Follow the evidence. See where it leads.")}</p>

      <ResearchComposer canRerank />
    </section>
    <HomeDiscovery />
  </div>;
}

function ResearchHome() {
  return <ResearchEntry />;
}

function HomeSkeleton() {
  const { t } = useI18n();
  return <div className="home-width research-home-skeleton" role="status" aria-label={t("Loading research workspace")}>
    <Skeleton className="h-12 w-3/4" />
    <Skeleton className="h-36 w-full" />
  </div>;
}
