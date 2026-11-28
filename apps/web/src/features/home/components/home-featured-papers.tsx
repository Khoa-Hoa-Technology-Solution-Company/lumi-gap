import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, ArrowUpRight, Pause, Play } from "lucide-react";
import { useHomeFeaturedPapers } from "../hooks/use-home-featured-papers";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/i18n";
import { formatNumber } from "@/utils";
import "../home-featured-papers.css";

export function HomeFeaturedPapers() {
  const { t, language } = useI18n();
  const year = new Date().getFullYear();
  const query = useHomeFeaturedPapers();
  const papers = query.data?.papers ?? [];
  const rail = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLUListElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const scrollDirection = useRef(1);
  const resumeTimer = useRef<number>();
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(false);
  const [temporarilyPaused, setTemporarilyPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(!document.hidden);
  const [scrollDistance, setScrollDistance] = useState(0);
  const overflow = scrollDistance > 1;
  const canAutoScroll = autoScrollEnabled && !reducedMotion && overflow;

  useEffect(() => {
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!preference) return;
    const update = () => setReducedMotion(preference.matches);
    update(); preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useLayoutEffect(() => {
    const element = rail.current;
    const content = track.current;
    const spacer = stage.current;
    if (!element || !content || !spacer) return;
    const measure = () => {
      const width = element.clientWidth;
      element.style.setProperty("--home-featured-viewport-width", `${width}px`);
      const contentWidth = Math.max(width, content.scrollWidth);
      // Reserve the native scroll range while the inner list moves independently.
      spacer.style.width = `${contentWidth}px`;
      setScrollDistance(contentWidth - width);
    };
    measure();
    const resize = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : undefined;
    resize?.observe(element);
    resize?.observe(content);
    const observer = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? false), { threshold: .2 }) : undefined;
    observer?.observe(element);
    if (!observer) setVisible(true);
    const updateVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", updateVisibility);
    window.addEventListener("resize", measure);
    return () => { resize?.disconnect(); observer?.disconnect(); document.removeEventListener("visibilitychange", updateVisibility); window.removeEventListener("resize", measure); };
  }, [papers.length]);

  useEffect(() => () => window.clearTimeout(resumeTimer.current), []);

  const pauseTemporarily = () => {
    window.clearTimeout(resumeTimer.current);
    setTemporarilyPaused(true);
  };
  const resumeAutoScrollLater = () => {
    window.clearTimeout(resumeTimer.current);
    if (!autoScrollEnabled) return;
    resumeTimer.current = window.setTimeout(() => setTemporarilyPaused(false), 5000);
  };
  const toggleAutoScroll = () => {
    window.clearTimeout(resumeTimer.current);
    setTemporarilyPaused(false);
    setAutoScrollEnabled((previous) => !previous);
  };

  useLayoutEffect(() => {
    const element = rail.current;
    const content = track.current;
    if (!element || !content?.animate || !canAutoScroll || temporarilyPaused || hovered || focused || !visible || !pageVisible) return;
    const position = Math.min(scrollDistance, element.scrollLeft);
    const duration = scrollDistance / 18 * 1000;
    const animation = content.animate([
      { transform: "translate3d(0, 0, 0)" },
      { transform: `translate3d(${-scrollDistance}px, 0, 0)` },
    ], { duration, easing: "linear", iterations: Infinity, direction: "alternate", fill: "both" });
    animation.currentTime = (scrollDirection.current === 1 ? position : 2 * scrollDistance - position) / 18 * 1000;
    element.scrollLeft = 0;
    content.dataset.autoScrolling = "true";
    return () => {
      const progress = animation.effect?.getComputedTiming().progress ?? 0;
      const time = typeof animation.currentTime === "number" ? animation.currentTime : 0;
      scrollDirection.current = Math.floor(time / duration) % 2 === 0 ? 1 : -1;
      animation.cancel();
      delete content.dataset.autoScrolling;
      // Hand the same visual position back to native scrolling before the next paint.
      element.scrollLeft = Math.min(scrollDistance, element.scrollLeft + progress * scrollDistance);
    };
  }, [canAutoScroll, temporarilyPaused, hovered, focused, visible, pageVisible, scrollDistance]);

  const move = (direction: number) => {
    if (autoScrollEnabled) {
      flushSync(pauseTemporarily);
      resumeAutoScrollLater();
    }
    const element = rail.current;
    if (!element) return;
    const step = (track.current?.firstElementChild as HTMLElement | null)?.offsetWidth ?? 360;
    element.scrollBy({ left: direction * (step + 20), behavior: reducedMotion ? "instant" : "smooth" });
  };

  return <section id="home-workflow" className="home-featured" aria-labelledby="home-featured-heading" data-home-reveal>
    <div className="home-featured-heading home-width" data-home-animate>
      <div><h2 id="home-featured-heading">{t("Most cited papers")}</h2><p>{t("LumiGap library · {{from}}–{{to}}", { from: year - 1, to: year })}</p></div>
      <Link to="/literature?sort=citations" className="academic-text-link">{t("Browse literature")}<ArrowUpRight aria-hidden="true" /></Link>
    </div>
    <div className="home-featured-content home-width" data-home-animate>
      {query.isLoading ? <div className="home-featured-loading" role="status" aria-label={t("Loading featured papers")}><Skeleton /><Skeleton /><Skeleton /></div>
        : !papers.length ? <div className="home-featured-empty"><p>{t(query.isError ? "Featured papers are temporarily unavailable." : "Your next read will appear as the library grows.")}</p>{query.isError ? <button type="button" className="academic-text-link" onClick={() => { void query.refetch(); }}>{t("Reload featured papers")}<ArrowRight aria-hidden="true" /></button> : <Link to="/literature" className="academic-text-link">{t("Browse literature")}<ArrowRight aria-hidden="true" /></Link>}</div>
          : <>
            <div
              id="home-featured-rail"
              ref={rail}
              className="home-featured-viewport"
              tabIndex={0}
              role="region"
              aria-label={t("Most cited papers")}
              aria-describedby="home-featured-keyboard-hint"
              onPointerEnter={(event) => { if (event.pointerType === "mouse") setHovered(true); }}
              onPointerLeave={() => setHovered(false)}
              onTouchStart={() => { if (autoScrollEnabled) pauseTemporarily(); }}
              onTouchEnd={() => { if (autoScrollEnabled) resumeAutoScrollLater(); }}
              onTouchCancel={() => { if (autoScrollEnabled) resumeAutoScrollLater(); }}
              onWheel={() => { if (autoScrollEnabled) { pauseTemporarily(); resumeAutoScrollLater(); } }}
              onFocusCapture={() => setFocused(true)}
              onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
                else if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
              }}
            >
            <div ref={stage} className="home-featured-stage">
            <ul ref={track} className="home-featured-rail" aria-label={t("Featured papers")}>
              {papers.map((paper) => <li key={paper.id}>
                <Link className="home-featured-paper" to={`/papers/${encodeURIComponent(paper.id)}`}>
                  <p className="home-featured-source">{paper.journalName ?? paper.primaryProvider}</p>
                  <h3>{paper.title}</h3>
                  <p className="home-featured-authors">{paper.authors.slice(0, 2).map((author) => author.displayName).join(", ") || t("Authors unavailable")}{paper.authors.length > 2 ? ` ${t("and others")}` : ""}</p>
                  <div className="home-featured-paper-bottom"><span className="home-featured-meta"><span>{paper.publicationYear ?? t("Unknown")}</span><span aria-hidden="true">·</span><span>{t("{{count}} citations", { count: formatNumber(paper.citationCount) })}</span></span><span className="home-featured-read">{t("View paper")}<ArrowUpRight aria-hidden="true" /></span></div>
                </Link>
              </li>)}
            </ul>
            </div>
            </div>
            <span id="home-featured-keyboard-hint" className="sr-only">{t("Use Left and Right arrow keys to browse papers.")}</span>
            <div className="home-featured-footer"><span>{t("{{count}} papers", { count: new Intl.NumberFormat(language).format(papers.length) })}</span><div role="group" aria-label={t("Featured paper controls")}>
              <button
                type="button"
                className="home-featured-autoplay-btn"
                aria-controls="home-featured-rail"
                aria-pressed={canAutoScroll}
                aria-label={canAutoScroll ? t("Pause automatic scrolling") : t("Start automatic scrolling")}
                disabled={!overflow || reducedMotion}
                onClick={toggleAutoScroll}
              >
                {canAutoScroll ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
                <span>{canAutoScroll ? t("Pause") : t("Auto scroll")}</span>
              </button>
              <button type="button" className="home-featured-nav-btn" aria-controls="home-featured-rail" aria-label={t("Previous papers")} disabled={!overflow} onClick={() => move(-1)}><ArrowLeft aria-hidden="true" /></button>
              <button type="button" className="home-featured-nav-btn" aria-controls="home-featured-rail" aria-label={t("Next papers")} disabled={!overflow} onClick={() => move(1)}><ArrowRight aria-hidden="true" /></button>
            </div></div>
          </>}
    </div>
  </section>;
}
