import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ForumCard } from "@/features/forum/components/forum-card";
import { useJoinCommunity } from "@/features/forum/hooks/use-forum";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import type { ForYouCommunityView, ForYouPostView } from "../api/personalization.api";
import { PERSONALIZATION_KEY, useDelayedFlag, useForYou, useForYouCommunities } from "../hooks/use-personalization";

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
 * The only personalised block on the Communities list: one "For you" title and up to three blocks (discussions,
 * papers, communities), each hidden when empty and the whole section hidden when all are. While the answer is slow
 * the reserved aria-busy block keeps the layout still, and the skeleton only appears after a short delay.
 */
export function ForYouSection() {
  const { t, language } = useI18n();
  const queryClient = useQueryClient();
  const query = useForYou(true);
  const suggestions = useForYouCommunities(true);
  const join = useJoinCommunity();
  const showSkeleton = useDelayedFlag(query.isLoading);

  if (query.isLoading) {
    return <section className="mt-7 min-h-72" aria-busy="true" aria-label={t("For you")}>
      {showSkeleton ? <div className="grid items-start gap-4 lg:grid-cols-2" aria-hidden="true">
        <div className="h-72 animate-pulse rounded-xl bg-muted/50" />
        <div className="hidden h-72 animate-pulse rounded-xl bg-muted/50 lg:block" />
      </div> : null}
    </section>;
  }
  const data = query.error ? undefined : query.data;
  const hasPosts = Boolean(data && data.postsBasis !== "none" && data.posts.length > 0);
  const hasPapers = Boolean(data && data.papersBasis !== "none" && data.papers.length > 0);
  const communities = suggestions.data ?? [];
  if (!hasPosts && !hasPapers && communities.length === 0) return null;

  const joinCommunity = (community: ForYouCommunityView) => join.mutate(community.id, {
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PERSONALIZATION_KEY });
      void queryClient.invalidateQueries({ queryKey: ["communities"] });
    },
  });

  return <section className="mt-7" aria-labelledby="for-you-heading" aria-busy="false">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id="for-you-heading" className="flex items-center gap-2 text-base font-semibold"><Sparkles aria-hidden="true" className="h-4 w-4 text-blue-700" />{t("For you")}</h2>
      <Link to="/settings/interests" className="inline-flex min-h-6 items-center rounded text-sm font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("Manage interests")}</Link>
    </div>
    {hasPosts || hasPapers ? <div className={cn("mt-3 grid items-start gap-4", hasPosts && hasPapers && "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]")}>
      {hasPosts && data ? <div role="region" aria-labelledby="for-you-discussions" className="overflow-hidden rounded-xl border bg-card">
        <h3 id="for-you-discussions" className="border-b px-4 py-3 text-sm font-semibold">{t(data.postsBasis === "personal" ? "Discussions for you" : "Discussions to explore")}</h3>
        <ul className="divide-y">
          {data.posts.map((item) => <li key={item.post.id}>
            <ForumCard post={item.post} locale={language} />
            <p className="px-4 pb-3 text-xs text-muted-foreground" data-testid="for-you-reason">{forYouReasonText(item, t)}</p>
          </li>)}
        </ul>
      </div> : null}
      {hasPapers && data ? <div role="region" aria-labelledby="for-you-papers" className="rounded-xl border bg-card p-4">
        <h3 id="for-you-papers" className="text-sm font-semibold">{t(data.papersBasis === "personal" ? "Papers for you" : "Papers on topics people are discussing")}</h3>
        <ul className="mt-3 space-y-3">
          {data.papers.map((paper) => <li key={paper.id}>
            <Link to={`/papers/${paper.id}`} className="text-sm font-medium leading-5 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{paper.title}</Link>
            <p className="mt-0.5 text-xs text-muted-foreground">{paper.publicationYear} · {paper.citationCount === 1 ? t("1 citation") : t("{{count}} citations", { count: paper.citationCount })}</p>
          </li>)}
        </ul>
      </div> : null}
    </div> : null}
    {communities.length > 0 ? <div className="mt-4" role="region" aria-labelledby="for-you-communities">
      <h3 id="for-you-communities" className="text-sm font-semibold">{t("Communities you may like")}</h3>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {communities.map((community) => <li key={community.id} className="flex flex-col justify-between gap-3 rounded-xl border bg-card p-4">
          <div className="min-w-0">
            <Link to={`/communities/${community.slug}`} className="font-semibold hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{community.name}</Link>
            {community.researchField ? <p className="mt-1 text-xs font-medium text-blue-700">{community.researchField}</p> : null}
            {community.matchReason === "semantic"
              ? <p className="mt-3 text-xs text-muted-foreground">{t("Close to your interests")}</p>
              : <div className="mt-3 flex flex-wrap gap-1.5">{community.matchedTopics.slice(0, 3).map((topic) => <Badge key={topic.key} variant="secondary" className="font-normal">{topic.label}</Badge>)}</div>}
          </div>
          <Button type="button" size="sm" variant="outline" className="min-h-8 self-start" disabled={join.isPending} aria-label={t("Join {{community}}", { community: community.name })} onClick={() => joinCommunity(community)}>{t("Join")}</Button>
        </li>)}
      </ul>
    </div> : null}
  </section>;
}
