import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import type { ForumDiscovery, ForumDiscoveryReason } from "../api/forum.api";
import { useForumDiscovery } from "../hooks/use-forum";
import { formatForumActivityTime, formatForumNumber, forumPostHref } from "../utils/forum-helpers";

const reasonLabels: Record<ForumDiscoveryReason, string> = {
  SAME_PAPER: "Same paper", SAME_GAP: "Same candidate gap", SHARED_TAGS: "Shared research tags", SIMILAR_TOPIC: "Similar topic", SAME_COMMUNITY: "In this community", RECENT_DISCUSSION: "Recent discussion",
};

export function ForumThreadDiscovery({ postId }: { postId: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  useEffect(() => {
    if (nearViewport || !container.current) return;
    if (typeof IntersectionObserver === "undefined") { setNearViewport(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setNearViewport(true); observer.disconnect(); }
    }, { rootMargin: "400px" });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [nearViewport]);
  const query = useForumDiscovery(postId, nearViewport);
  return <div ref={container}><ForumThreadDiscoveryView data={query.data} loading={!nearViewport || query.isPending} error={query.isError} onRetry={() => void query.refetch()} /></div>;
}

export function ForumThreadDiscoveryView({ data, loading, error, onRetry }: { data?: ForumDiscovery; loading?: boolean; error?: boolean; onRetry: () => void }) {
  const { t, language } = useI18n();
  const [tab, setTab] = useState<"suggested" | "related">("suggested");
  const id = useId();
  const topics = data?.[tab] ?? [];
  const tabs = ["suggested", "related"] as const;
  return (
    <section aria-label={t("More discussions")} className="mt-10 border-t border-border pt-5">
      <div role="tablist" aria-label={t("Discover discussions")} className="flex gap-5 border-b border-border">
        {tabs.map((value) => <button key={value} id={`${id}-${value}`} type="button" role="tab" aria-label={`${t(value === "suggested" ? "Suggested" : "Related")}${data ? ` (${formatForumNumber(data[value].length, language)})` : ""}`} aria-selected={tab === value} aria-controls={`${id}-panel`} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)} onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" ? "suggested" : event.key === "End" ? "related" : value === "suggested" ? "related" : "suggested";
          setTab(next); document.getElementById(`${id}-${next}`)?.focus();
        }} className={cn("relative -mb-px min-h-11 border-b-2 border-transparent px-1 pb-3 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring", tab === value && "border-primary text-foreground")}>
          {t(value === "suggested" ? "Suggested" : "Related")}<span className="ml-2 text-xs tabular-nums text-muted-foreground">{data ? formatForumNumber(data[value].length, language) : ""}</span>
        </button>)}
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`} tabIndex={0} className="outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <p className="py-3 text-xs leading-relaxed text-muted-foreground">{t(tab === "suggested" ? "Other recent discussions you can access." : "Discussions with shared research context, tags or topic.")}</p>
        {loading ? <div role="status" aria-label={t("Loading discussions")} className="space-y-3 py-3">{[1, 2, 3].map((row) => <div key={row} className="h-12 animate-pulse rounded bg-muted/50" />)}</div> : error ? <div role="status" className="py-5 text-sm text-muted-foreground"><p>{t("Could not load more discussions.")}</p><Button type="button" variant="outline" size="sm" onClick={onRetry} className="mt-3">{t("Try again")}</Button></div> : topics.length ? <table className="w-full table-fixed text-sm">
          <caption className="sr-only">{t(tab === "suggested" ? "Suggested discussions" : "Related discussions")}</caption>
          <thead className="text-xs text-muted-foreground"><tr><th scope="col" className="pb-2 text-left font-medium">{t("Topic")}</th><th scope="col" className="w-14 pb-2 text-right font-medium sm:w-16">{t("Replies")}</th><th scope="col" className="hidden w-16 pb-2 text-right font-medium sm:table-cell">{t("Views")}</th><th scope="col" className="w-14 pb-2 text-right font-medium sm:w-20">{t("Activity")}</th></tr></thead>
          <tbody className="divide-y divide-border">{topics.map((topic) => <tr key={topic.id}>
            <td className="py-4 pr-3 align-top"><Link to={forumPostHref(topic)} className="break-words font-medium leading-snug text-foreground hover:text-primary hover:underline focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ring">{topic.title}</Link><div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">{topic.community ? <Link to={`/forum?community=${encodeURIComponent(topic.community.slug)}`} className="hover:text-primary hover:underline">{topic.community.name}</Link> : null}{topic.reason !== "SAME_COMMUNITY" || !topic.community ? <span>{t(reasonLabels[topic.reason] ?? "Similar topic")}</span> : null}</div></td>
            <td className="py-4 text-right align-top tabular-nums">{formatForumNumber(topic.replyCount, language)}</td><td className="hidden py-4 text-right align-top tabular-nums text-muted-foreground sm:table-cell">{formatForumNumber(topic.viewCount, language)}</td><td className="py-4 text-right align-top text-muted-foreground"><time dateTime={topic.lastActivityAt ?? topic.createdAt} title={new Date(topic.lastActivityAt ?? topic.createdAt).toLocaleString(language)}>{formatForumActivityTime(topic.lastActivityAt ?? topic.createdAt, language)}</time></td>
          </tr>)}</tbody>
        </table> : <p className="py-6 text-sm text-muted-foreground">{t(tab === "suggested" ? "No other discussions in this community yet." : "No related discussions found yet.")}</p>}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t("Discussion suggestions are for discovery, not scientific evidence.")}</p>
    </section>
  );
}
