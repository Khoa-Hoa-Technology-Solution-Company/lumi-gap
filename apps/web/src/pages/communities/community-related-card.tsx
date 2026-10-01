import { Link } from "react-router-dom";
import { BookOpen, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCommunityRelatedGaps, useCommunityRelatedPapers, type CommunityView } from "@/features/forum";
import { useI18n } from "@/i18n";

/** Research data matched to the community's topics: notable papers and open, shareable research gaps. */
export function CommunityRelatedCard({ community }: { community: CommunityView }) {
  const { t } = useI18n();
  const papers = useCommunityRelatedPapers(community.id);
  const gaps = useCommunityRelatedGaps(community.id);
  const canDiscuss = community.status === "ACTIVE" && community.viewerMembership?.status === "active";

  return <>
    <section className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2"><BookOpen className="h-4 w-4 text-blue-700" /><h2 className="text-sm font-semibold">{t("Featured papers")}</h2></div>
      {papers.isLoading ? <div className="mt-3 h-16 animate-pulse rounded-md bg-muted" />
        : papers.data?.length ? <ul className="mt-3 space-y-3">{papers.data.map((paper) => <li key={paper.id}>
          <Link to={`/papers/${paper.id}`} className="text-sm font-medium leading-5 hover:text-blue-700">{paper.title}</Link>
          <p className="mt-0.5 text-xs text-muted-foreground">{paper.publicationYear} · {paper.citationCount} {t("citations")}</p>
        </li>)}</ul>
          : <p className="mt-3 text-sm text-muted-foreground">{t("No matching papers yet.")}</p>}
    </section>

    <section className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2"><Lightbulb className="h-4 w-4 text-blue-700" /><h2 className="text-sm font-semibold">{t("Open research gaps")}</h2></div>
      {gaps.isLoading ? <div className="mt-3 h-16 animate-pulse rounded-md bg-muted" />
        : gaps.data?.length ? <ul className="mt-3 space-y-4">{gaps.data.map((gap) => <li key={gap.id}>
          <p className="text-sm font-medium leading-5">{gap.title}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{gap.description}</p>
          {canDiscuss ? <Button asChild size="sm" variant="outline" className="mt-2 h-8">
            <Link to={`/forum/new?community=${community.id}&gap=${gap.id}&gapTitle=${encodeURIComponent(gap.title)}`}>{t("Discuss this gap")}</Link>
          </Button> : null}
        </li>)}</ul>
          : <p className="mt-3 text-sm text-muted-foreground">{t("No shared research gaps yet.")}</p>}
    </section>
  </>;
}
