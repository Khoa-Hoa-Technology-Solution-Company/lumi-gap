import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, ArrowUpRight, Pause, Play } from "lucide-react";
import { useHomeFeaturedPapers } from "../hooks/use-home-featured-papers";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { formatNumber } from "@/utils";
import "../home-featured-papers.css";

export function HomeFeaturedPapers() {
  const { t, language } = useI18n();
  const query = useHomeFeaturedPapers();
  const papers = query.data?.papers ?? [];
  const rail = useRef<HTMLUListElement>(null);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(!document.hidden);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!preference) return;
    const update = () => setReducedMotion(preference.matches);
    update(); preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    const measure = () => setOverflow(element.scrollWidth > element.clientWidth + 1);
    measure();
    const resize = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : undefined;
    resize?.observe(element);
    const observer = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? false), { threshold: .2 }) : undefined;
    observer?.observe(element);
    if (!observer) setVisible(true);
    const updateVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", updateVisibility);
    window.addEventListener("resize", measure);
    return () => { resize?.disconnect(); observer?.disconnect(); document.removeEventListener("visibilitychange", updateVisibility); window.removeEventListener("resize", measure); };
  }, [papers.length]);

  const stopped = paused || reducedMotion;
  useEffect(() => {
    if (stopped || hovered || focused || !visible || !pageVisible || !overflow) return;
    const timer = window.setInterval(() => {
      const element = rail.current;
      if (!element) return;
      const end = element.scrollWidth - element.clientWidth;
      const step = (element.firstElementChild as HTMLElement | null)?.offsetWidth ?? 360;
      element.scrollTo({ left: element.scrollLeft >= end - 2 ? 0 : Math.min(end, element.scrollLeft + step + 20), behavior: "smooth" });
    }, 4500);
    return () => window.clearInterval(timer);
  }, [stopped, hovered, focused, visible, pageVisible, overflow]);

  const move = (direction: number) => {
    setPaused(true);
    const element = rail.current;
    if (!element) return;
    const step = (element.firstElementChild as HTMLElement | null)?.offsetWidth ?? 360;
    element.scrollBy({ left: direction * (step + 20), behavior: reducedMotion ? "instant" : "smooth" });
  };

  return <section id="home-workflow" className="home-featured" aria-labelledby="home-featured-heading" data-home-reveal>
    <div className="home-featured-heading home-width" data-home-animate>
      <div><p className="academic-eyebrow">{t("Your next read")}</p><h2 id="home-featured-heading">{t("Papers worth exploring.")}</h2><p>{t("Highly cited papers from the last two publication years in the LumiGap library.")}</p></div>
      <Link to="/literature?sort=citations" className="academic-text-link">{t("Browse literature")}<ArrowUpRight aria-hidden="true" /></Link>
    </div>
    <div className="home-featured-content home-width" data-home-animate onPointerEnter={(event) => { if (event.pointerType === "mouse") setHovered(true); }} onPointerLeave={() => setHovered(false)} onTouchStart={() => setPaused(true)} onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}>
      {query.isLoading ? <div className="home-featured-loading" role="status" aria-label={t("Loading featured papers")}><Skeleton /><Skeleton /><Skeleton /></div>
        : !papers.length ? <div className="home-featured-empty"><p>{t(query.isError ? "Featured papers are temporarily unavailable." : "Your next read will appear as the library grows.")}</p>{query.isError ? <button type="button" className="academic-text-link" onClick={() => { void query.refetch(); }}>{t("Reload featured papers")}<ArrowRight aria-hidden="true" /></button> : <Link to="/literature" className="academic-text-link">{t("Browse literature")}<ArrowRight aria-hidden="true" /></Link>}</div>
          : <>
            <ul id="home-featured-rail" ref={rail} className="home-featured-rail" aria-label={t("Featured papers")}>
              {papers.map((paper, index) => <li key={paper.id}>
                <Link className="home-featured-paper" to={`/papers/${encodeURIComponent(paper.id)}`}>
                  <div className="home-featured-paper-top"><span>{paper.topics.find((topic) => topic.isPrimary)?.topicName ?? paper.topics[0]?.topicName ?? t("Research paper")}</span><span>{paper.publicationYear ?? t("Unknown")}</span></div>
                  <h3>{paper.title}</h3>
                  <p className="home-featured-authors">{paper.authors.slice(0, 2).map((author) => author.displayName).join(", ") || t("Authors unavailable")}{paper.authors.length > 2 ? ` ${t("and others")}` : ""}</p>
                  <p className="home-featured-source">{paper.journalName ?? paper.primaryProvider}</p>
                  <div className="home-featured-paper-bottom"><span>{t("{{count}} citations", { count: formatNumber(paper.citationCount) })}</span><span className="home-featured-paper-number">{String(index + 1).padStart(2, "0")}<ArrowUpRight aria-hidden="true" /></span></div>
                </Link>
              </li>)}
            </ul>
            <div className="home-featured-footer"><span>{new Intl.DateTimeFormat(language, { day: "numeric", month: "long", year: "numeric" }).format(new Date())}</span><div role="group" aria-label={t("Featured paper controls")}>
              <button type="button" aria-controls="home-featured-rail" aria-label={t("Previous papers")} disabled={!overflow} onClick={() => move(-1)}><ArrowLeft aria-hidden="true" /></button>
              <button type="button" className="home-featured-play" aria-controls="home-featured-rail" disabled={!overflow || reducedMotion} aria-label={t(stopped ? "Resume automatic scrolling" : "Pause automatic scrolling")} onClick={() => setPaused(!paused)}>{stopped ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}<span>{t(stopped ? "Paused" : "Auto scroll")}</span></button>
              <button type="button" aria-controls="home-featured-rail" aria-label={t("Next papers")} disabled={!overflow} onClick={() => move(1)}><ArrowRight aria-hidden="true" /></button>
            </div></div>
          </>}
    </div>
  </section>;
}
