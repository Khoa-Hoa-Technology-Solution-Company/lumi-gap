import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { ResearchComposer } from "@/features/home/components/research-composer";
import { HomeSearchResults } from "@/features/home/components/home-search-results";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import "@/features/home/home.css";

export function LiteraturePage() {
  const authenticated = useAuthStore((state) => Boolean(state.tokens?.accessToken));
  const { t } = useI18n();

  return <div className="research-home literature-page" data-no-i18n>
    <div className="home-width literature-search-entry">
      <Link className="literature-home-link" to="/home"><ChevronLeft aria-hidden="true" />{t("Home")}</Link>
      <ResearchComposer id="literature-search" canRerank={authenticated} />
    </div>
    <HomeSearchResults />
  </div>;
}
