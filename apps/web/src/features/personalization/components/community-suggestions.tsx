import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useForYouCommunities, useJoinSuggestion } from "../hooks/use-personalization";

/**
 * "Communities you may like": shown under the forum "For you" feed and, alone, on the communities page. Hidden
 * when there is nothing to suggest.
 */
export function CommunitySuggestions({ className = "mt-7" }: { className?: string }) {
  const { t } = useI18n();
  const suggestions = useForYouCommunities(true);
  const { joinCommunity, isJoining } = useJoinSuggestion();
  const communities = suggestions.data ?? [];
  if (communities.length === 0) return null;

  return <section className={className} aria-labelledby="for-you-communities">
    <h2 id="for-you-communities" className="text-sm font-semibold">{t("Communities you may like")}</h2>
    <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {communities.map((community) => <li key={community.id} className="flex flex-col justify-between gap-3 rounded-xl border bg-card p-4">
        <div className="min-w-0">
          <Link to={`/communities/${community.slug}`} className="font-semibold hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{community.name}</Link>
          {community.researchField ? <p className="mt-1 text-xs font-medium text-blue-700">{community.researchField}</p> : null}
          {community.matchReason === "semantic"
            ? <p className="mt-3 text-xs text-muted-foreground">{t("Close to your interests")}</p>
            : <div className="mt-3 flex flex-wrap gap-1.5">{community.matchedTopics.slice(0, 3).map((topic) => <Badge key={topic.key} variant="secondary" className="font-normal">{topic.label}</Badge>)}</div>}
        </div>
        <Button type="button" size="sm" variant="outline" className="min-h-8 self-start" disabled={isJoining(community.id)} aria-label={t("Join {{community}}", { community: community.name })} onClick={() => void joinCommunity(community)}>{t("Join")}</Button>
      </li>)}
    </ul>
  </section>;
}
