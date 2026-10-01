import { useEffect, useState } from "react";
import { useI18n } from "@/i18n";
import { formatForumRelativeTime } from "../utils/forum-helpers";

export function ForumThreadTimeline({ postIds, total, createdAt, lastActivityAt }: { postIds: string[]; total: number; createdAt: string; lastActivityAt: string }) {
  const { t, language } = useI18n();
  const [current, setCurrent] = useState(1);
  useEffect(() => {
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top);
        else visible.delete(entry.target.id);
      }
      const first = [...visible].sort((a, b) => a[1] - b[1])[0];
      if (first) setCurrent(postIds.indexOf(first[0]) + 1);
    }, { rootMargin: "-100px 0px -45% 0px", threshold: 0 });
    for (const id of postIds) { const node = document.getElementById(id); if (node) observer.observe(node); }
    return () => observer.disconnect();
  }, [postIds]);
  const jump = (id?: string) => {
    const node = id ? document.getElementById(id) : null;
    node?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    node?.focus({ preventScroll: true });
  };
  const displayedTotal = Math.max(total, postIds.length);
  return (
    <aside aria-label={t("Discussion timeline")} className="hidden pt-10 xl:block">
      <div className="sticky top-[calc(var(--app-header-height)+2rem)] text-sm text-muted-foreground">
        <button type="button" onClick={() => jump(postIds[0])} className="rounded px-2 py-2 text-left hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">{new Date(createdAt).toLocaleDateString(language === "vi" ? "vi-VN" : "en-US", { month: "short", day: "numeric" })}</button>
        <div className="relative mx-3 my-2 h-52 w-px bg-border">
          <div className="absolute -left-[3px] h-9 w-[7px] rounded-full bg-primary transition-transform motion-reduce:transition-none" style={{ transform: `translateY(${displayedTotal > 1 ? ((current - 1) / (displayedTotal - 1)) * 170 : 0}px)` }} />
          <div className="absolute left-5 top-0 whitespace-nowrap"><p aria-live="polite" aria-atomic="true" className="text-lg font-semibold tabular-nums text-foreground">{current} / {displayedTotal}</p><span className="text-sm">{t("posts")}</span></div>
        </div>
        <button type="button" onClick={() => jump("thread-end")} className="rounded px-2 py-2 text-left hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">{formatForumRelativeTime(lastActivityAt, language)}</button>
      </div>
    </aside>
  );
}
