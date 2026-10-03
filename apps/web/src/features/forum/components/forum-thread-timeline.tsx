import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Reply, Undo2 } from "lucide-react";
import { useI18n } from "@/i18n";
import { formatForumRelativeTime } from "../utils/forum-helpers";

interface ForumThreadTimelineProps {
  postIds: string[];
  postDates?: string[];
  total: number;
  createdAt: string;
  lastActivityAt: string;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onReply?: () => void;
  replyDisabled?: boolean;
  notificationControl?: ReactNode;
}

export function ForumThreadTimeline({ postIds, postDates, total, createdAt, lastActivityAt, hasMore = false, loadingMore = false, onLoadMore, onReply, replyDisabled, notificationControl }: ForumThreadTimelineProps) {
  const { t, language } = useI18n();
  const [current, setCurrent] = useState(1);
  const currentRef = useRef(1);
  const positionRef = useRef(1);
  const positionMarker = useRef<HTMLDivElement>(null);
  const desktopRange = useRef<HTMLInputElement>(null);
  const mobileRange = useRef<HTMLInputElement>(null);
  const [returnPosition, setReturnPosition] = useState<number>();
  const [returnProgress, setReturnProgress] = useState<number>();
  const dragging = useRef(false);
  const scrubFrame = useRef(0);
  const pendingPosition = useRef(1);
  const pendingLatest = useRef(false);
  const loadedBeforeRequest = useRef(0);
  const loadMoreRef = useRef(onLoadMore);
  loadMoreRef.current = onLoadMore;
  const displayedTotal = Math.max(1, total, postIds.length);
  const incomplete = hasMore || displayedTotal > postIds.length;
  const selected = Math.min(Math.max(1, current), Math.max(1, postIds.length));
  const progress = () => postIds.length > 1 ? (Math.min(positionRef.current, postIds.length) - 1) / (postIds.length - 1) : 0;
  const date = (value: string) => new Date(value).toLocaleDateString(language === "vi" ? "vi-VN" : "en-US", { month: "short", day: "numeric" });
  const paintPosition = (position: number) => {
    positionRef.current = position;
    // Fractional progress is visual feedback. React only needs the post number.
    if (desktopRange.current) desktopRange.current.value = String(position);
    if (mobileRange.current) mobileRange.current.value = String(position);
    if (positionMarker.current) positionMarker.current.style.transform = `translateY(${progress() * 234}px)`;
    const next = Math.max(1, Math.floor(position));
    if (currentRef.current !== next) { currentRef.current = next; setCurrent(next); }
  };
  const paintPositionRef = useRef(paintPosition);
  paintPositionRef.current = paintPosition;
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      if (dragging.current) return;
      const readingLine = Math.max(120, window.innerHeight * 0.2);
      // Read only O(log n) positions, even in a long discussion.
      let low = 0;
      let high = postIds.length - 1;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        const top = document.getElementById(postIds[middle]!)?.getBoundingClientRect().top;
        // Browser scrolling rounds to pixels; keep exact keyboard jumps on the
        // requested post when its top lands less than a pixel below the line.
        if (top !== undefined && top <= readingLine + 1) low = middle;
        else high = middle - 1;
      }
      const node = document.getElementById(postIds[low] ?? "");
      const next = document.getElementById(postIds[low + 1] ?? "");
      const start = node?.getBoundingClientRect().top ?? readingLine;
      const end = next?.getBoundingClientRect().top;
      const fraction = end !== undefined && end > start ? Math.min(1, Math.max(0, (readingLine - start) / (end - start))) : 0;
      paintPositionRef.current(low + 1 + fraction);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); };
  }, [postIds]);
  useEffect(() => () => window.cancelAnimationFrame(scrubFrame.current), []);
  const rememberPosition = () => { setReturnPosition((previous) => previous ?? window.scrollY); setReturnProgress((previous) => previous ?? progress()); };
  const jump = (id?: string) => {
    const node = id ? document.getElementById(id) : null;
    if (!node) return;
    rememberPosition();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({ behavior: reducedMotion ? "instant" : "smooth", block: "start" });
    node.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!pendingLatest.current || loadingMore) return;
    // Stop when a page failed or added no posts. A network failure must not
    // silently trigger an endless series of retries.
    if (postIds.length <= loadedBeforeRequest.current) { pendingLatest.current = false; return; }
    if (hasMore) { loadedBeforeRequest.current = postIds.length; loadMoreRef.current?.(); return; }
    pendingLatest.current = false;
    const node = document.getElementById(postIds.at(-1) ?? "");
    node?.scrollIntoView({ behavior: "instant", block: "start" });
    node?.focus({ preventScroll: true });
  }, [postIds, hasMore, loadingMore]);

  const scrub = (value: number) => {
    const clamped = Math.min(postIds.length, Math.max(1, value));
    rememberPosition();
    pendingPosition.current = clamped;
    paintPosition(clamped);
    if (scrubFrame.current) window.cancelAnimationFrame(scrubFrame.current);
    scrubFrame.current = window.requestAnimationFrame(() => {
      scrubFrame.current = 0;
      const index = Math.floor(pendingPosition.current) - 1;
      const fraction = pendingPosition.current - index - 1;
      const node = document.getElementById(postIds[index] ?? "");
      if (!node) return;
      const next = document.getElementById(postIds[index + 1] ?? "");
      const top = node.getBoundingClientRect().top + window.scrollY;
      const nextTop = next ? next.getBoundingClientRect().top + window.scrollY : top;
      // Instant scrolling follows the pointer without restarting an animation.
      window.scrollTo({ top: top + (nextTop - top) * fraction - Math.max(120, window.innerHeight * 0.2), behavior: "instant" });
    });
  };

  const jumpToLatest = () => {
    rememberPosition();
    if (incomplete && onLoadMore) { pendingLatest.current = true; loadedBeforeRequest.current = postIds.length; onLoadMore(); }
    else jump(postIds.at(-1));
  };
  const navigateWithKey = (event: KeyboardEvent<HTMLInputElement>) => {
    const next = event.key === "Home" ? 1 : event.key === "End" ? postIds.length : ["ArrowDown", "ArrowRight"].includes(event.key) ? selected + 1 : ["ArrowUp", "ArrowLeft"].includes(event.key) ? selected - 1 : undefined;
    if (next !== undefined) { event.preventDefault(); scrub(next); }
  };
  return (
    <><aside aria-label={t("Discussion timeline")} className="forum-thread-timeline hidden pt-4 xl:block">
      <nav className="forum-timeline-nav sticky top-[calc(var(--app-header-height)+2rem)] text-sm text-muted-foreground">
        <button type="button" onClick={() => jump(postIds[0])} title={`${t("Jump to opening post")}: ${new Date(createdAt).toLocaleString(language)}`} className="forum-timeline-date focus-visible:ring-2 focus-visible:ring-ring">
          <time dateTime={createdAt}>{date(createdAt)}</time>
        </button>
        {displayedTotal === 1 ? <div className="forum-timeline-single-post">
          <div className="forum-timeline-position">
            <p className="font-semibold tabular-nums text-foreground">1 / 1</p>
            <time dateTime={createdAt}>{date(createdAt)}</time>
            <span className="sr-only">{postIds[0] === "opening-post" ? t("Opening post") : t("Post")}</span>
          </div>
        </div> : <>
          <div className="forum-timeline-scrubber">
            <div className="forum-timeline-rail" aria-hidden="true" />
            <input ref={desktopRange} type="range" min={1} max={Math.max(1, postIds.length)} step="0.001" defaultValue={1} disabled={postIds.length < 2} aria-label={t("Navigate loaded posts")} aria-valuetext={`${t("Post")} ${selected} / ${displayedTotal}`} onPointerDown={() => { dragging.current = true; }} onPointerUp={() => { dragging.current = false; }} onPointerCancel={() => { dragging.current = false; }} onBlur={() => { dragging.current = false; }} onChange={(event) => scrub(Number(event.target.value))} onKeyDown={navigateWithKey} className="forum-timeline-range" />
            <div ref={positionMarker} className="forum-timeline-position" style={{ transform: `translateY(${progress() * 234}px)` }}>
              <p className="font-semibold tabular-nums text-foreground">{selected} / {displayedTotal}</p>
              <time dateTime={postDates?.[selected - 1] ?? createdAt}>{date(postDates?.[selected - 1] ?? createdAt)}</time>
            </div>
            {returnPosition !== undefined ? <button type="button" className="forum-timeline-back" style={{ transform: `translateY(${(returnProgress ?? 0) * 234}px)` }} onClick={() => { window.scrollTo({ top: returnPosition, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); setReturnPosition(undefined); setReturnProgress(undefined); }}><Undo2 className="h-3 w-3" aria-hidden="true" />{t("Back")}</button> : null}
          </div>
          <button type="button" disabled={loadingMore} onClick={jumpToLatest} title={`${t(incomplete ? "Load latest post" : "Jump to latest post")}: ${new Date(lastActivityAt).toLocaleString(language)}`} className="forum-timeline-date focus-visible:ring-2 focus-visible:ring-ring"><time dateTime={lastActivityAt}>{formatForumRelativeTime(lastActivityAt, language)}</time></button>
          {incomplete ? <div className="mt-2 space-y-1 text-xs"><p>{postIds.length} / {displayedTotal} {t("loaded")}</p><button type="button" disabled={loadingMore} onClick={onLoadMore} className="hover:text-foreground disabled:opacity-50">{t(loadingMore ? "Loading…" : "Load more replies")}</button></div> : null}
        </>}
        {onReply || notificationControl ? <div className="forum-timeline-controls mt-3 flex items-center gap-2">
          {onReply ? <button type="button" onClick={onReply} disabled={replyDisabled} aria-label={t("Reply to discussion")} title={t("Reply to discussion")} className="forum-timeline-control"><Reply className="h-4 w-4" aria-hidden="true" /></button> : null}
          {notificationControl}
        </div> : null}
      </nav>
    </aside>
    {displayedTotal > 1 ? <details className="forum-mobile-progress xl:hidden">
      <summary aria-label={`${t("Discussion progress")}: ${selected} / ${displayedTotal}`} className="flex min-h-11 cursor-pointer list-none items-center px-4 py-2 text-sm font-semibold tabular-nums">{selected} / {displayedTotal}</summary>
      <div className="forum-mobile-progress-panel">
        <p className="mb-3 text-sm font-semibold">{t("Discussion timeline")}</p>
        <input ref={mobileRange} type="range" min={1} max={Math.max(1, postIds.length)} step="0.001" defaultValue={1} aria-label={t("Navigate discussion")} aria-valuetext={`${t("Post")} ${selected} / ${displayedTotal}`} onPointerDown={() => { dragging.current = true; }} onPointerUp={() => { dragging.current = false; }} onPointerCancel={() => { dragging.current = false; }} onBlur={() => { dragging.current = false; }} onKeyDown={navigateWithKey} onChange={(event) => scrub(Number(event.target.value))} className="min-h-11 w-full accent-primary" />
        <div className="mt-3 flex items-center justify-between gap-3 text-sm"><button type="button" onClick={() => jump(postIds[0])} className="inline-flex items-center gap-1"><ArrowUp className="h-3.5 w-3.5" />{date(createdAt)}</button><button type="button" onClick={jumpToLatest} disabled={loadingMore} className="inline-flex items-center gap-1"><ArrowDown className="h-3.5 w-3.5" />{formatForumRelativeTime(lastActivityAt, language)}</button></div>
        {incomplete ? <button type="button" disabled={loadingMore} onClick={onLoadMore} className="mt-3 text-xs text-muted-foreground">{t(loadingMore ? "Loading…" : "Load more replies")}</button> : null}
      </div>
    </details> : null}</>
  );
}
