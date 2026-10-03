import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronDown, FileCheck2, FileText, FolderOpen, Lightbulb, MessageSquare, Network, Search, TrendingUp } from "lucide-react";
import type { HomeOverview } from "@trend/shared-types";
import { Skeleton } from "@/components/ui/skeleton";
import { useHomeOverview } from "@/features/home/hooks/use-home-overview";
import { useI18n } from "@/i18n";
import { formatNumber } from "@/utils";
import { HomeReadingLens } from "./home-reading-lens";
import { LITERATURE_PATH } from "../utils/home-search";

const homeSections = [
  { id: "workflow", label: "Workflow", href: "#home-workflow" },
  { id: "reading", label: "Read closely", href: "#home-reading" },
  { id: "landscape", label: "Landscape", href: "#home-landscape" },
  { id: "toolkit", label: "Toolkit", href: "#home-toolkit" },
] as const;

const journey = [
  {
    id: "discover", icon: Search, label: "Discover literature", title: "Follow the question, then the papers.",
    description: "Search a research question, a topic or a DOI. Use semantic search to explore meaning, or keywords to find a precise phrase.",
    benefits: ["Choose scholarly sources", "Narrow by year and open access", "Save papers to your reading library"],
    flow: ["Your research question", "Relevant literature", "Your reading library"],
    flowDetails: ["Start with what you want to understand.", "Compare titles, abstracts and source metadata.", "Keep the papers worth returning to."],
    href: "/home#home-research-heading", action: "Start exploring",
  },
  {
    id: "connect", icon: Network, label: "Connect evidence", title: "Give your reading a structure.",
    description: "Bring papers into a research project. Screen the sources, record decisions and link supporting evidence to the question you are investigating.",
    benefits: ["Collect literature in a project", "Record screening decisions", "Build evidence with collaborators"],
    flow: ["Collected papers", "Screened sources", "Connected evidence"],
    flowDetails: ["Organise literature around one question.", "Decide what belongs in your research.", "Keep each observation linked to its source."],
    href: "/projects?create=1", action: "Build a research project",
  },
  {
    id: "develop", icon: Lightbulb, label: "Explore new directions", title: "Find the question still worth asking.",
    description: "Explore candidate gaps alongside their supporting literature. Compare contexts, methods and findings before choosing the direction to investigate.",
    benefits: ["Inspect supporting papers", "Compare methods and contexts", "Refine a candidate research question"],
    flow: ["What the papers show", "What remains unclear", "Your next research question"],
    flowDetails: ["Read the evidence in context.", "Examine limitations and missing connections.", "Choose a direction to validate."],
    href: "/research-gaps", action: "Explore candidate gaps",
  },
] as const;

const questions = [
  { question: "When should I use semantic or keyword search?", answer: "Use semantic search for a question or an idea. Use keyword search for exact terms, names or phrases. You can choose the mode in the search toolbar." },
  { question: "What does the publication chart represent?", answer: "The chart shows papers currently indexed in LumiGap, grouped by publication year. It describes this library, rather than all published research. The current year is still accumulating papers." },
  { question: "Is a suggested gap already a research finding?", answer: "A candidate gap is a starting point for investigation. Read the supporting papers, check the context and validate the question before treating it as a research conclusion." },
  { question: "Can I work with other researchers?", answer: "Create a project to organise papers and evidence with collaborators. Communities and the Research Forum offer a place to discuss methods, questions and findings." },
] as const;

export function HomeDiscovery() {
  const { t } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const [currentSection, setCurrentSection] = useState<string>("workflow");

  useEffect(() => {
    if (!root.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries.find((item) => item.isIntersecting);
      if (entry) setCurrentSection((entry.target as HTMLElement).dataset.homeSection!);
    }, { rootMargin: "-20% 0px -55% 0px" });
    root.current.querySelectorAll("[data-home-section]").forEach((section) => observer.observe(section));
    return () => observer.disconnect();
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
      }, { threshold: 0.08, rootMargin: "0px 0px -32px 0px" });
      element.querySelectorAll("[data-home-reveal]").forEach((section) => observer?.observe(section));
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
    destination.closest("[data-home-reveal]")?.classList.add("is-home-visible");
    destination.scrollIntoView({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    if (destination.id === "home-research-heading") destination.querySelector<HTMLInputElement>('input[type="search"]')?.focus({ preventScroll: true });
    window.history.replaceState(window.history.state, "", anchor.hash);
  }} onFocusCapture={(event) => {
    // Keyboard navigation should never focus a visually unrevealed section.
    (event.target as HTMLElement).closest("[data-home-reveal]")?.classList.add("is-home-visible");
  }}>
    <nav className="home-explore-nav" aria-label={t("Explore LumiGap")}><div className="home-width home-explore-nav-inner"><span className="home-explore-nav-label">{t("A place for your curiosity")}</span><div>{homeSections.map((section, index) => <a key={section.id} href={section.href} aria-current={currentSection === section.id ? "location" : undefined} onClick={() => setCurrentSection(section.id)}><span aria-hidden="true">0{index + 1}</span>{t(section.label)}</a>)}</div><a href="#home-research-heading" className="home-explore-search" aria-label={t("Back to search")}><Search aria-hidden="true" /></a></div></nav>
    <section id="home-workflow" className="home-journey-section home-width" aria-labelledby="home-journey-heading" data-home-reveal data-home-section="workflow">
      <div className="home-discovery-heading">
        <p className="home-section-kicker">{t("A connected research workflow")}</p>
        <h2 id="home-journey-heading">{t("Go further with every question.")}</h2>
        <p>{t("From a first search to a direction worth investigating, keep your research connected.")}</p>
      </div>
      <JourneyExplorer />
    </section>

    <HomeReadingLens />

    <section id="home-landscape" className="home-insights-section" aria-labelledby="home-insights-heading" data-home-section="landscape">
      <div className="home-insights-inner home-width" data-home-reveal>
        <div className="home-insights-copy">
          <p className="home-section-kicker">{t("See the research landscape")}</p>
          <h2 id="home-insights-heading">{t("A field never stands still.")}</h2>
          <p>{t("Look beyond one paper. Explore publication patterns, compare topics and place your question in a wider context.")}</p>
          <Link to="/trends" className="home-text-link">{t("Explore publication trends")}<ArrowUpRight aria-hidden="true" /></Link>
        </div>
        <LibraryInsights />
      </div>
    </section>

    <section id="home-toolkit" className="home-tools-section home-width" aria-labelledby="home-tools-heading" data-home-reveal data-home-section="toolkit">
      <div className="home-discovery-heading">
        <h2 id="home-tools-heading">{t("Make room for the whole process.")}</h2>
        <p>{t("Read closely, prepare your work and bring other perspectives into the conversation.")}</p>
      </div>
      <div className="home-tools-layout">
        <div className="home-paper-tools">
          <div className="home-paper-tools-symbol" aria-hidden="true"><FileText /><span><Check /></span></div>
          <h3>{t("A closer look at your paper.")}</h3>
          <p>{t("Use AI-assisted review to examine a manuscript, or check its format before the next submission.")}</p>
          <div className="home-paper-tool-links">
            <Link to="/papers/review"><FileCheck2 aria-hidden="true" /><span>{t("AI paper review")}</span><ArrowUpRight aria-hidden="true" /></Link>
            <Link to="/papers/format-check"><FileText aria-hidden="true" /><span>{t("Check paper format")}</span><ArrowUpRight aria-hidden="true" /></Link>
          </div>
        </div>
        <div className="home-support-tools">
          <Link to="/reports" className="home-support-tool"><FileText aria-hidden="true" /><div><h3>{t("Bring the findings together.")}</h3><p>{t("Open your reports to revisit analyses and organise the next stage of your research.")}</p><span>{t("View your reports")}<ArrowRight aria-hidden="true" /></span></div></Link>
          <Link to="/communities" className="home-support-tool"><MessageSquare aria-hidden="true" /><div><h3>{t("Think alongside other researchers.")}</h3><p>{t("Join a research community to exchange questions, discuss methods and find a different perspective.")}</p><span>{t("Explore research communities")}<ArrowRight aria-hidden="true" /></span></div></Link>
        </div>
      </div>
    </section>

    <section className="home-faq-section home-width" aria-labelledby="home-faq-heading" data-home-reveal>
      <div className="home-faq-intro"><h2 id="home-faq-heading">{t("A few things to know.")}</h2><p>{t("A clearer starting point for your next session.")}</p><Link to="/forum" className="home-text-link">{t("Visit the Research Forum")}<ArrowUpRight aria-hidden="true" /></Link></div>
      <div className="home-faq-list">{questions.map((item) => <details key={item.question}><summary>{t(item.question)}<ChevronDown aria-hidden="true" /></summary><p>{t(item.answer)}</p></details>)}</div>
    </section>
    <section className="home-closing home-width" aria-label={t("Start your next research question")} data-home-reveal>
      <div><p className="home-section-kicker">{t("Your next chapter")}</p><p className="home-closing-title">{t("Curiosity looks good on you.")}</p><p>{t("Bring a question. Leave with a direction.")}</p></div>
      <a className="home-closing-action" href="#home-research-heading">{t("Start with a question")}<ArrowUpRight aria-hidden="true" /></a>
    </section>
  </div>;
}

function JourneyExplorer() {
  const { t } = useI18n();
  const [active, setActive] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const navigate = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number;
    if (event.key === "ArrowRight") next = (index + 1) % journey.length;
    else if (event.key === "ArrowLeft") next = (index + journey.length - 1) % journey.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = journey.length - 1;
    else return;
    event.preventDefault(); setActive(next); tabs.current[next]?.focus();
  };

  return <div className="home-journey-explorer">
    <div className="home-journey-tabs" role="tablist" aria-label={t("Explore the research workflow")}>
      {journey.map((step, index) => <button key={step.id} ref={(element) => { tabs.current[index] = element; }} type="button" role="tab" id={`journey-tab-${step.id}`} aria-controls={`journey-panel-${step.id}`} aria-selected={active === index} tabIndex={active === index ? 0 : -1} onClick={() => setActive(index)} onKeyDown={(event) => navigate(event, index)}><span className="home-journey-tab-number" aria-hidden="true">0{index + 1}</span><span>{t(step.label)}</span><ArrowRight className="home-journey-tab-arrow" aria-hidden="true" /></button>)}
    </div>
    {journey.map((step, index) => <div key={step.id} id={`journey-panel-${step.id}`} role="tabpanel" aria-labelledby={`journey-tab-${step.id}`} tabIndex={0} className="home-journey-panel" hidden={active !== index}>
      {active === index ? <><div className="home-journey-copy"><h3>{t(step.title)}</h3><p>{t(step.description)}</p><ul>{step.benefits.map((benefit) => <li key={benefit}><Check aria-hidden="true" />{t(benefit)}</li>)}</ul><Link to={step.href} className="home-text-link">{t(step.action)}<ArrowUpRight aria-hidden="true" /></Link></div>
        <div className="home-journey-visual"><div className="home-journey-visual-header"><span><step.icon aria-hidden="true" />{t(step.label)}</span><span aria-hidden="true">0{index + 1} / 03</span></div><ol className="home-journey-flow" aria-label={t("How this stage works")}>
          {step.flow.map((label, flowIndex) => <li key={label} style={{ "--flow-delay": `${flowIndex * 75}ms` } as CSSProperties}><span className="home-flow-symbol">{flowIndex === 0 ? <step.icon aria-hidden="true" /> : flowIndex === 1 ? <BookOpen aria-hidden="true" /> : <FolderOpen aria-hidden="true" />}</span><div><h4>{t(label)}</h4><p>{t(step.flowDetails[flowIndex] ?? "")}</p></div>{flowIndex < 2 ? <ArrowDown className="home-flow-connector" aria-hidden="true" /> : null}</li>)}
        </ol><div className="home-journey-visual-footer"><span aria-hidden="true" className="home-note-dot" />{t("Every step stays connected.")}</div></div></> : null}
    </div>)}
  </div>;
}

function LibraryInsights() {
  const { t } = useI18n();
  const query = useHomeOverview();
  const [metric, setMetric] = useState<"papers" | "citations">("papers");
  const data = query.data;

  return <div className="home-library-insights">
    <div className="home-library-heading"><span><TrendingUp aria-hidden="true" />{t("Inside the LumiGap library")}</span><div role="group" aria-label={t("Chart metric")}><button type="button" aria-pressed={metric === "papers"} onClick={() => setMetric("papers")}>{t("Publications")}</button><button type="button" aria-pressed={metric === "citations"} onClick={() => setMetric("citations")}>{t("Citations")}</button></div></div>
    {query.isLoading ? <div role="status" className="home-insights-state" aria-label={t("Loading library trends")}><Skeleton className="h-6 w-48" /><Skeleton className="h-44 w-full" /></div>
      : query.isError || !data ? <div role="alert" className="home-insights-state"><p>{t("The library is taking a moment.")}</p><span>{t("You can still search while we reconnect to the latest literature.")}</span><button type="button" onClick={() => { void query.refetch(); }}>{t("Retry")}</button></div>
      : <PublicationChart data={data} metric={metric} />}
    <p className="home-library-note">{t("Based on indexed literature. The current year is incomplete.")}</p>
  </div>;
}

function PublicationChart({ data, metric }: { data: HomeOverview; metric: "papers" | "citations" }) {
  const { t } = useI18n();
  const [selectedYear, setSelectedYear] = useState<number>();
  const series = metric === "papers" ? data.trends.yearlyTotalPapers : data.trends.citationTrend.map((entry) => ({ year: entry.year, count: entry.totalCitations }));
  const years = series.slice(-6);
  const selected = years.find((entry) => entry.year === selectedYear) ?? years.at(-1);
  const maximum = Math.max(1, ...years.map((entry) => entry.count));

  if (!years.length) return <div className="home-insights-state"><p>{t("Publication trends will appear as the library grows.")}</p><Link to="/trends">{t("Explore Trends")}<ArrowUpRight aria-hidden="true" /></Link></div>;

  return <>
    <div className="home-chart-selection" aria-live="polite" aria-atomic="true"><strong>{formatNumber(selected?.count ?? 0)}</strong><span>{t(metric === "papers" ? "papers published in {{year}}" : "citations to papers published in {{year}}", { year: selected?.year ?? "" })}</span></div>
    <figure className="home-library-chart">
      <figcaption className="sr-only">{t(metric === "papers" ? "Papers by publication year" : "Citations by publication year")}</figcaption>
      <div className="home-chart-bars">{years.map((entry, index) => <button key={entry.year} type="button" aria-pressed={selected?.year === entry.year} aria-label={t(metric === "papers" ? "{{year}}: {{count}} papers" : "{{year}}: {{count}} citations", { year: entry.year, count: entry.count })} onClick={() => setSelectedYear(entry.year)} style={{ "--bar-height": `${entry.count / maximum * 100}%`, "--bar-delay": `${index * 55}ms` } as CSSProperties}><span className="home-chart-bar-space"><span className={`home-chart-bar${entry.year > data.trends.lastCompleteYear ? " is-incomplete" : ""}`} /></span><span>{entry.year}{entry.year > data.trends.lastCompleteYear ? <small>{t("Year to date")}</small> : null}</span></button>)}</div>
    </figure>
    <div className="home-chart-footer"><span>{t("Select a year to explore")}</span><Link to={`${LITERATURE_PATH}?yearFrom=${selected?.year}&yearTo=${selected?.year}`}>{t("View papers from {{year}}", { year: selected?.year ?? "" })}<ArrowUpRight aria-hidden="true" /></Link></div>
  </>;
}
