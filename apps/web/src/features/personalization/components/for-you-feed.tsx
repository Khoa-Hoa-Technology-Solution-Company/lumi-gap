import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ForumCard } from "@/features/forum/components/forum-card";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import type { ForYouPostView } from "../api/personalization.api";
import { FOR_YOU_FEED_LIMIT, useDelayedFlag, useForYou, useForYouCommunities } from "../hooks/use-personalization";
import { CommunitySuggestions } from "./community-suggestions";

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** "1 reader" / "3 readers": the singular and the plural are separate dictionary keys so every language can inflect. */
const readersText = (count: number, t: Translate) => (count === 1 ? t("1 reader") : t("{{count}} readers", { count }));
const repliesText = (count: number, t: Translate) => (count === 1 ? t("1 reply") : t("{{count}} replies", { count }));

/** One-line reason under a post. Always text, never an icon alone. A zero part of the trending stats is left out. */
export function forYouReasonText(item: Pick<ForYouPostView, "reasonKind" | "reasonTopic" | "reasonSource" | "reasonCommunity" | "reasonStats">, t: Translate): string {
  const topic = item.reasonTopic.label;
  switch (item.reasonKind) {
    case "followed": return item.reasonSource === "profile" ? t("Because {{topic}} is in your research interests", { topic }) : t("Because you follow {{topic}}", { topic });
    case "joined": return t("Because you joined {{community}}", { community: item.reasonCommunity?.name ?? topic });
    case "inferred": return t("Because you often read about {{topic}}", { topic });
    case "lowConfidence": return t("Based on posts you've read");
    case "new": return t("New in {{community}}", { community: topic });
    case "trending": {
      const readers = item.reasonStats?.readers ?? 0;
      const replies = item.reasonStats?.replies ?? 0;
      if (readers > 0 && replies > 0) return t("Trending in {{community}} · {{readers}}, {{replies}} in the last 2 weeks", { community: topic, readers: readersText(readers, t), replies: repliesText(replies, t) });
      if (readers > 0) return t("Trending in {{community}} · {{readers}} in the last 2 weeks", { community: topic, readers: readersText(readers, t) });
      if (replies > 0) return t("Trending in {{community}} · {{replies}} in the last 2 weeks", { community: topic, replies: repliesText(replies, t) });
      return t("Trending in {{community}}", { community: topic });
    }
  }
}

/**
 * The forum "For you" feed: up to 20 unread discussions (reason under each), papers in the side column and
 * suggested communities below. Every state renders something: a reserved loading block, an error with Retry, or an
 * empty state with the two ways to get suggestions.
 */
export function ForYouFeed() {
  const { t, language } = useI18n();
  const query = useForYou({ limit: FOR_YOU_FEED_LIMIT });
  const suggestions = useForYouCommunities(true);
  const showSkeleton = useDelayedFlag(query.isLoading);

  if (query.isLoading) {
    return <section className="min-h-72 p-4 sm:p-6" aria-busy="true" aria-label={t("For you")}>
      <span className="sr-only" role="status">{t("Loading discussions")}</span>
      {showSkeleton ? <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" aria-hidden="true">
        <div className="h-72 animate-pulse rounded-xl bg-muted/50" />
        <div className="hidden h-72 animate-pulse rounded-xl bg-muted/50 lg:block" />
      </div> : null}
    </section>;
  }

  if (query.error || !query.data) {
    return <section className="p-4 sm:p-6" aria-label={t("For you")}>
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
        <h2 className="font-semibold">{t("Could not load discussions for you.")}</h2>
        <p className="mt-1 text-sm">{t("Please try again in a moment.")}</p>
        <Button type="button" variant="outline" size="sm" className="mt-4" disabled={query.isFetching} onClick={() => void query.refetch()}>{t("Retry")}</Button>
      </div>
    </section>;
  }

  const data = query.data;
  const hasPosts = data.postsBasis !== "none" && data.posts.length > 0;
  const hasPapers = data.papersBasis !== "none" && data.papers.length > 0;
  const hasCommunities = (suggestions.data ?? []).length > 0;
  const stillLoadingCommunities = suggestions.isLoading === true;

  return <section className="p-4 sm:p-6" aria-label={t("For you")} aria-busy={query.isFetching}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">{t("Unread discussions picked from your interests and the communities you joined.")}</p>
      <Link to="/settings/interests" className="inline-flex min-h-6 items-center rounded text-sm font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("Manage interests")}</Link>
    </div>

    {hasPosts || hasPapers ? <div className={cn("mt-4 grid items-start gap-4", hasPosts && hasPapers && "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]")}>
      {hasPosts ? <div role="region" aria-labelledby="for-you-discussions" className="overflow-hidden rounded-xl border bg-card">
        <h2 id="for-you-discussions" className="border-b px-4 py-3 text-sm font-semibold">{t(data.postsBasis === "personal" ? "Discussions for you" : "Discussions to explore")}</h2>
        <ul className="divide-y">
          {data.posts.map((item) => <li key={item.post.id}>
            <ForumCard post={item.post} locale={language} layout="stacked" kicker={
              <p className="mb-1 text-xs font-medium text-blue-700 dark:text-blue-300" data-testid="for-you-reason">{forYouReasonText(item, t)}</p>} />
          </li>)}
        </ul>
      </div> : null}
      {hasPapers ? <div role="region" aria-labelledby="for-you-papers" className="rounded-xl border bg-card p-4">
        <h2 id="for-you-papers" className="text-sm font-semibold">{t(data.papersBasis === "personal" ? "Papers for you" : "Papers on topics people are discussing")}</h2>
        <ul className="mt-3 space-y-3">
          {data.papers.map((paper) => <li key={paper.id}>
            <Link to={`/papers/${paper.id}`} className="text-sm font-medium leading-5 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{paper.title}</Link>
            <p className="mt-0.5 text-xs text-muted-foreground">{paper.publicationYear} · {paper.citationCount === 1 ? t("1 citation") : t("{{count}} citations", { count: paper.citationCount })}</p>
          </li>)}
        </ul>
      </div> : null}
    </div> : !hasCommunities && !stillLoadingCommunities ? <div className="mt-4 rounded-xl border border-dashed px-6 py-12 text-center" data-testid="for-you-empty">
      <h2 className="mt-3 font-semibold">{t("No suggestions yet")}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{t("Follow a topic, read a few discussions or join a community, and unread discussions will be picked for you here.")}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button asChild size="sm" variant="outline"><Link to="/settings/interests">{t("Manage interests")}</Link></Button>
        <Button asChild size="sm" variant="outline"><Link to="/communities">{t("Explore communities")}</Link></Button>
      </div>
    </div> : null}

    <CommunitySuggestions className="mt-6" />
  </section>;
}
