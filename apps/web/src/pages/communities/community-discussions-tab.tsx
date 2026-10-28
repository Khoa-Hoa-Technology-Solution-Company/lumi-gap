import { Link } from "react-router-dom";
import { LockKeyhole, MessageSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ForumCard, useCommunitySummary, useForumPosts, useRequestCommunitySummary, type CommunityView } from "@/features/forum";
import { useI18n } from "@/i18n";

/** Posts scoped to this research community. A private community's feed is members-only (the API answers 403 otherwise). */
export function CommunityDiscussionsTab({ community }: { community: CommunityView }) {
  const { t, language } = useI18n();
  const isMember = community.viewerMembership?.status === "active";
  const posts = useForumPosts({ researchCommunityId: community.id, pageSize: 20, sort: "latest" }, !community.contentRestricted);
  const canSummarize = (isMember || community.isAdmin) && community.status === "ACTIVE";
  const summary = useCommunitySummary(community.id, canSummarize);
  const requestSummary = useRequestCommunitySummary();
  const rows = posts.data?.data ?? [];

  if (community.contentRestricted) return <div className="rounded-xl border border-dashed px-6 py-12 text-center"><LockKeyhole className="mx-auto h-6 w-6 text-muted-foreground" /><h3 className="mt-3 font-semibold">{t("This community is private")}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{t("Request membership to read this community's discussions.")}</p></div>;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground"><span className="tabular-nums">{community.threadCount}</span> {t(community.threadCount === 1 ? "discussion" : "discussions")}</p>
      {isMember && community.status === "ACTIVE" ? <Button asChild variant="discussion"><Link to={`/forum/new?community=${encodeURIComponent(community.slug)}`}><MessageSquare className="h-4 w-4" />{t("New discussion")}</Link></Button> : null}
    </div>
    {canSummarize ? <section className="rounded-xl border bg-card p-5" aria-label={t("AI summary")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-blue-700" />{t("Recent discussions summary")}</h3>
        <Button size="sm" variant="outline" disabled={requestSummary.isPending || summary.data?.status === "pending"} onClick={() => requestSummary.mutate(community.id)}>{t(summary.data?.status === "pending" ? "Summarizing…" : "Summarize recent discussions")}</Button>
      </div>
      {summary.data?.status === "completed" ? <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{summary.data.summary}</p>
        : summary.data?.status === "failed" ? <p role="alert" className="mt-3 text-sm text-red-600">{summary.data.message}</p>
          : <p className="mt-3 text-sm text-muted-foreground">{t("Generated on request from the last 30 days of discussions in this community.")}</p>}
    </section> : null}
    {posts.isLoading ? <div className="space-y-2">{[0, 1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-lg bg-muted" />)}</div>
      : posts.error ? <p role="alert" className="text-sm text-red-600">{t("Could not load this community's discussions.")}</p>
        : rows.length === 0 ? <p className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">{t("No discussions in this community yet.")}</p>
          : <div className="divide-y overflow-hidden rounded-xl border bg-card">{rows.map((post) => <ForumCard key={post.id} post={post} locale={language} />)}</div>}
  </div>;
}
