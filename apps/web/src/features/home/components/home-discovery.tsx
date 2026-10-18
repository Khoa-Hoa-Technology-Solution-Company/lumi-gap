import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ChevronDown, FileCheck2, FileText, MessageSquare, TrendingUp } from "lucide-react";
import type { HomeOverview, YearlyCount } from "@trend/shared-types";
import { Skeleton } from "@/components/ui/skeleton";
import { useHomeOverview } from "@/features/home/hooks/use-home-overview";
import { useI18n } from "@/i18n";
import { formatNumber } from "@/utils";
import { HomeFeaturedPapers } from "./home-featured-papers";
import { HomeQuestionSpace } from "./home-question-space";
import { HomeResearchBridge } from "./home-research-bridge";
import { HomeReadingLens } from "./home-reading-lens";
import { LITERATURE_PATH } from "../utils/home-search";
import "../home-discovery.css";
import "../home-motion.css";

function revealDestination(destination: Element) {
  const section = destination.closest("[data-home-reveal]");
  section?.classList.add("is-home-visible");
  section?.querySelectorAll("[data-home-animate]").forEach((item) => item.classList.add("is-home-visible"));
}

const questions = [
  { question: "When should I use semantic or keyword search?", answer: "Use semantic search for a question or an idea. Use keyword search for exact terms, names or phrases. You can choose the mode in the search toolbar." },
  { question: "What does the publication chart represent?", answer: "The chart shows papers currently indexed in LumiGap, grouped by publication year. It describes this library, rather than all published research. The current year is still accumulating papers." },
  { question: "Is a suggested gap already a research finding?", answer: "A candidate gap is a starting point for investigation. Read the supporting papers, check the context and validate the question before treating it as a research conclusion." },
  { question: "Can I work with other researchers?", answer: "Create a project to organise papers and evidence with collaborators. Communities and the Research Forum offer a place to discuss methods, questions and findings." },
] as const;

export function HomeDiscovery() {
  const { t } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // The route loads lazily, so a direct hash link may precede its section.
    const destination = document.getElementById(window.location.hash.slice(1));
    if (!destination || !root.current?.contains(destination)) return;
    revealDestination(destination);
    destination.scrollIntoView({ behavior: "instant", block: "start" });
  }, []);
  useEffect(() => {
    const element = root.current;
    if (!element || typeof IntersectionObserver === "undefined" || !window.matchMedia) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let observer: IntersectionObserver | undefined;
    const update = () => {
      observer?.disconnect();
      element.removeAttribute("data-home-motion");
      if (preference.matches) return;
      element.setAttribute("data-home-motion", "enabled");
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-home-visible");
            observer?.unobserve(entry.target);
          }
        });
      }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });
      element.querySelectorAll("[data-home-reveal], [data-home-animate]").forEach((item) => observer?.observe(item));
    };
    update();
    preference.addEventListener("change", update);
    return () => { observer?.disconnect(); preference.removeEventListener("change", update); };
  }, []);

  return <div ref={root} className="home-discovery" data-no-i18n onClick={(event) => {
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
    if (!anchor?.hash || anchor.origin !== window.location.origin || anchor.pathname !== window.location.pathname || anchor.search !== window.location.search) return;
    const destination = document.getElementById(anchor.hash.slice(1));
    if (!destination) return;
    event.preventDefault();
    revealDestination(destination);
    destination.scrollIntoView({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    if (destination.id === "home-research-heading") destination.closest("section")?.querySelector<HTMLInputElement>('input[type="search"]')?.focus({ preventScroll: true });
    window.history.replaceState(window.history.state, "", anchor.hash);
  }} onFocusCapture={(event) => {
    // Keyboard navigation should never focus a visually unrevealed section.
    revealDestination(event.target as HTMLElement);
  }}>
    <HomeFeaturedPapers />

    <HomeResearchBridge />

    <HomeQuestionSpace />

    <HomeReadingLens />

    <section id="home-landscape" className="academic-landscape home-width" aria-labelledby="home-insights-heading" data-home-reveal>
      <div className="academic-landscape-copy">
        <h2 id="home-insights-heading">{t("See the field.")}<br /><span>{t("Find your direction.")}</span></h2>
        <p>{t("Understand how the literature changes over time before choosing where to investigate next.")}</p>
        <Link to="/trends" className="academic-text-link">{t("Explore publication trends")}<ArrowUpRight aria-hidden="true" /></Link>
      </div>
      <LibraryInsights />
    </section>

    <section id="home-toolkit" className="academic-tools home-width" aria-labelledby="home-tools-heading" data-home-reveal>
      <div className="academic-section-heading">
        <h2 id="home-tools-heading">{t("From a first idea to your next submission.")}</h2>
        <p>{t("A workspace for the work that happens around every paper.")}</p>
      </div>
      <div className="academic-tool-grid">
        <Link to="/papers/review" className="academic-tool academic-tool-review">
          <div className="academic-tool-top"><span>{t("AI paper review")}</span><ArrowUpRight aria-hidden="true" /></div>
          <div className="academic-tool-feature"><FileCheck2 aria-hidden="true" /><span>{t("Manuscript review")}</span></div>
          <div><h3>{t("A stronger manuscript starts with a closer look.")}</h3><p>{t("Use AI-assisted review to examine a manuscript, or check its format before the next submission.")}</p></div>
        </Link>
        <Link to="/papers/format-check" className="academic-tool academic-tool-format">
          <div className="academic-tool-top"><span>{t("Check paper format")}</span><ArrowUpRight aria-hidden="true" /></div>
          <div className="academic-tool-feature"><FileText aria-hidden="true" /><span>{t("Submission readiness")}</span></div>
          <div><h3>{t("Prepare for the next submission.")}</h3><p>{t("Check the structure and formatting of your paper before submitting.")}</p></div>
        </Link>
        <Link to="/reports" className="academic-tool academic-tool-reports">
          <div className="academic-tool-top"><span>{t("View your reports")}</span><ArrowUpRight aria-hidden="true" /></div>
          <div><FileText className="academic-small-icon" aria-hidden="true" /><h3>{t("Bring the findings together.")}</h3><p>{t("Open your reports to revisit analyses and organise the next stage of your research.")}</p></div>
        </Link>
        <Link to="/communities" className="academic-tool academic-tool-community">
          <div className="academic-tool-top"><span>{t("Explore research communities")}</span><ArrowUpRight aria-hidden="true" /></div>
          <div><MessageSquare className="academic-small-icon" aria-hidden="true" /><h3>{t("Better questions come from conversation.")}</h3><p>{t("Join a research community to exchange questions, discuss methods and find a different perspective.")}</p></div>
        </Link>
      </div>
    </section>

    <section className="academic-faq home-width" aria-labelledby="home-faq-heading" data-home-reveal>
      <div className="academic-section-heading"><h2 id="home-faq-heading">{t("Before you begin.")}</h2><p>{t("A few answers for a more informed start.")}</p></div>
      <div className="academic-faq-list">{questions.map((item) => <details key={item.question}><summary>{t(item.question)}<ChevronDown aria-hidden="true" /></summary><p>{t(item.answer)}</p></details>)}</div>
      <Link to="/forum" className="academic-text-link">{t("Visit the Research Forum")}<ArrowUpRight aria-hidden="true" /></Link>
    </section>
    <section className="academic-closing" aria-label={t("Start your next research question")} data-home-reveal>
      <div className="home-width"><div><p>{t("Make space for your next idea.")}</p><span>{t("Start with a question. Build on the evidence.")}</span></div><a className="academic-button" href="#home-research-heading">{t("Start with a question")}<ArrowUpRight aria-hidden="true" /></a></div>
    </section>
  </div>;
}

function LibraryInsights() {
  const { t } = useI18n();
  const query = useHomeOverview();
  const [metric, setMetric] = useState<"papers" | "citations">("papers");
  const data = query.data;
  // Hide the citation toggle when the source reports no citation sums (null totals).
  const citationsAvailable = !data || data.trends.citationTrend.length === 0 || data.trends.citationTrend.some((entry) => entry.totalCitations !== null);
  const activeMetric = citationsAvailable ? metric : "papers";

  return <div className="home-library-insights">
    <div className="home-library-heading"><span><TrendingUp aria-hidden="true" />{t("Inside the LumiGap library")}</span><div role="group" aria-label={t("Chart metric")}><button type="button" aria-pressed={activeMetric === "papers"} onClick={() => setMetric("papers")}>{t("Publications")}</button>{citationsAvailable ? <button type="button" aria-pressed={activeMetric === "citations"} onClick={() => setMetric("citations")}>{t("Citations")}</button> : null}</div></div>
    {query.isLoading ? <div role="status" className="home-insights-state" aria-label={t("Loading library trends")}><Skeleton className="h-6 w-48" /><Skeleton className="h-44 w-full" /></div>
      : query.isError || !data ? <div role="alert" className="home-insights-state"><p>{t("The library is taking a moment.")}</p><span>{t("You can still search while we reconnect to the latest literature.")}</span><button type="button" onClick={() => { void query.refetch(); }}>{t("Retry")}</button></div>
      : <PublicationChart data={data} metric={activeMetric} />}
    <p className="home-library-note">{t("Based on indexed literature. The current year is incomplete.")}</p>
  </div>;
}

function PublicationChart({ data, metric }: { data: HomeOverview; metric: "papers" | "citations" }) {
  const { t } = useI18n();
  const [selectedYear, setSelectedYear] = useState<number>();
  // Citation totals are null when the source cannot sum citations; those years are left out, never drawn as 0.
  const series: YearlyCount[] = metric === "papers"
    ? data.trends.yearlyTotalPapers
    : data.trends.citationTrend.flatMap((entry) => (entry.totalCitations === null ? [] : [{ year: entry.year, count: entry.totalCitations }]));
  const years = series.slice(-6);
  const selected = years.find((entry) => entry.year === selectedYear) ?? years.at(-1);
  const maximum = Math.max(1, ...years.map((entry) => entry.count));

  if (!years.length) return <div className="home-insights-state"><p>{t("Publication trends will appear as the library grows.")}</p><Link to="/trends">{t("Explore Trends")}<ArrowUpRight aria-hidden="true" /></Link></div>;

  return <div className="home-chart-body">
    <div className="home-chart-selection" aria-live="polite" aria-atomic="true"><strong>{formatNumber(selected?.count ?? 0)}</strong><span>{t(metric === "papers" ? "papers published in {{year}}" : "citations to papers published in {{year}}", { year: selected?.year ?? "" })}</span></div>
    <figure className="home-library-chart">
      <figcaption className="sr-only">{t(metric === "papers" ? "Papers by publication year" : "Citations by publication year")}</figcaption>
      <div className="home-chart-bars">{years.map((entry, index) => <button key={entry.year} type="button" aria-pressed={selected?.year === entry.year} aria-label={t(metric === "papers" ? "{{year}}: {{count}} papers" : "{{year}}: {{count}} citations", { year: entry.year, count: entry.count })} onClick={() => setSelectedYear(entry.year)} style={{ "--bar-height": `${entry.count / maximum * 100}%`, "--bar-delay": `${index * 55}ms` } as CSSProperties}><span className="home-chart-bar-space"><span className={`home-chart-bar${entry.year > data.trends.lastCompleteYear ? " is-incomplete" : ""}`} /></span><span>{entry.year}{entry.year > data.trends.lastCompleteYear ? <small>{t("Year to date")}</small> : null}</span></button>)}</div>
    </figure>
    <div className="home-chart-footer"><span>{t("Select a year to explore")}</span><Link to={`${LITERATURE_PATH}?yearFrom=${selected?.year}&yearTo=${selected?.year}`}>{t("View papers from {{year}}", { year: selected?.year ?? "" })}<ArrowUpRight aria-hidden="true" /></Link></div>
  </div>;
}
