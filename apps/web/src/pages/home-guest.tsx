import { BookOpen } from "lucide-react";
import { ResearchSearch } from "@/features/home/components/research-search";
import { HomeDiscovery } from "@/features/home/components/home-discovery";
import { useI18n } from "@/i18n";

export function GuestHomePage() {
  const { t } = useI18n();

  return <div className="guest-home" data-no-i18n>
    <section className="home-hero home-width home-hero-centered" aria-labelledby="home-intro">
      <div className="home-hero-copy">
        <p className="home-intro-label"><BookOpen aria-hidden="true" />{t("A little curiosity. A new possibility.")}</p>
        <h1 id="home-intro"><span>{t("Good questions.")}</span><span className="home-headline-accent">{t("Great discoveries.")}</span></h1>
        <p className="home-hero-description">{t("Find the right papers. Connect the evidence. Discover where your research can go.")}</p>
        <div id="home-research-heading"><ResearchSearch id="guest-literature-search" /></div>
      </div>
    </section>
    <HomeDiscovery />
  </div>;
}
