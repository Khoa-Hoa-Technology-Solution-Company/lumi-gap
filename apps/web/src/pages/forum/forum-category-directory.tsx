import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, SquarePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ForumLayout, ForumSurface } from "@/features/forum/components/forum-layout";
import { ForumSidebar } from "@/features/forum/components/forum-sidebar";
import { useForumCategories } from "@/features/forum/hooks/use-forum-categories";
import { useForumFeedVisibility } from "@/features/forum/hooks/use-forum-feed-visibility";
import { getForumCategoryPresentation } from "@/features/forum/utils/forum-category-presentation";
import { FORUM_FEEDS } from "@/features/forum/utils/forum-navigation";
import { formatForumNumber } from "@/features/forum/utils/forum-helpers";
import { useAuthStore } from "@/stores/auth-store";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";

export function ForumCategoryDirectoryPage() {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const isAuthed = useAuthStore((state) => Boolean(state.tokens?.accessToken));
  const isAdmin = useAuthStore((state) => state.user?.role === "admin");
  const categories = useForumCategories();
  const initialError = categories.isError && !categories.data;
  const feedNavigation = useForumFeedVisibility(`categories:${language}`);
  const createHref = isAuthed ? "/forum/new" : "/login?returnTo=%2Fforum%2Fnew";

  return (
    <ForumLayout className="forum-feed-workspace forum-directory-workspace" contentClassName="forum-feed-content" sidebar={
      <ForumSidebar communities={categories.data} communitiesLoading={categories.isLoading} communitiesError={initialError} onRetryCommunities={() => void categories.refetch()} isAuthed={isAuthed} />
    }>
      <section className="min-w-0" aria-label={t("All research categories")}>
        <header className="forum-directory-header">
          <h1>{t("All categories")}</h1>
        </header>
        <ForumSurface className="forum-topics forum-directory-surface">
          <div className="forum-topic-toolbar border-b border-border">
            <div className="forum-topic-toolbar-row flex min-w-0 flex-wrap items-center gap-2 px-4 py-2">
              <div className="forum-topic-filter-group flex min-w-0 items-center">
                <label className="forum-topic-filter-control">
                  <span className="forum-topic-filter-shell" aria-hidden="true"><span className="forum-topic-filter-label">{t("Categories")}</span><ChevronDown className="forum-topic-filter-chevron" /></span>
                  <select value="" aria-label={t("Category")} disabled={categories.isLoading || initialError} className="forum-topic-filter forum-topic-filter-select" onChange={(event) => { if (event.target.value) navigate(`/forum?category=${encodeURIComponent(event.target.value)}`); }}>
                    <option value="">{t("All categories")}</option>
                    {categories.data?.map((category) => <option key={category.id} value={category.slug}>{t(category.name)}</option>)}
                  </select>
                </label>
              </div>
              <nav ref={feedNavigation} className="forum-topic-feeds flex min-w-0 flex-1 flex-nowrap items-center gap-0.5 overflow-x-auto" aria-label={t("Forum feeds")}>
                {FORUM_FEEDS.map((feed) => {
                  const href = `/forum?feed=${feed.value}`;
                  return <Link key={feed.value} to={feed.value === "following" && !isAuthed ? `/login?returnTo=${encodeURIComponent(href)}` : href} title={t(feed.description)} className="forum-topic-feed relative min-h-10 min-w-max rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t(feed.label)}</Link>;
                })}
                <Link to="/forum/categories" aria-current="page" className="forum-topic-feed is-active relative min-h-10 min-w-max rounded-md px-3 py-2 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("Categories")}<span className="forum-topic-feed-indicator absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" /></Link>
              </nav>
              <div className="forum-topic-toolbar-actions ml-auto flex shrink-0 items-center gap-2">
                <Button asChild variant="discussion" className="forum-new-discussion gap-1.5 rounded-full px-3" aria-label={t("New discussion")}><Link to={createHref}><SquarePen className="h-4 w-4" aria-hidden="true" /><span>{t("New discussion")}</span></Link></Button>
              </div>
            </div>
          </div>
          {categories.isError && categories.data ? <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 text-sm text-muted-foreground"><p>{t("Could not refresh categories. Showing the last loaded list.")}</p><Button variant="outline" size="sm" disabled={categories.isFetching} onClick={() => void categories.refetch()}>{t("Retry")}</Button></div> : null}
          {initialError ? <div role="alert" className="py-12 text-center"><p>{t("Could not load categories.")}</p><Button variant="outline" className="mt-3" onClick={() => void categories.refetch()}>{t("Retry")}</Button></div> : (
            <table className="forum-category-directory-table" aria-busy={categories.isFetching}>
              <caption className="sr-only">{t("All research categories")}</caption>
              <thead><tr><th scope="col">{t("Category")}</th><th scope="col">{t("Topics")}</th></tr></thead>
              <tbody>
                {categories.isLoading ? Array.from({ length: 7 }, (_, index) => <tr key={index} aria-label={t("Loading categories")}><td><div className="h-5 w-44 rounded bg-muted/60" /><div className="mt-3 h-4 w-3/4 rounded bg-muted/40" /></td><td><div className="ml-auto h-5 w-12 rounded bg-muted/40" /></td></tr>) : categories.data?.length ? categories.data.map((category) => {
                  const visual = getForumCategoryPresentation(category.slug);
                  const recentCount = category.topicsThisWeek ?? 0;
                  return <tr key={category.id} className={cn("forum-category-directory-row", visual.accentClassName)}>
                    <td>
                      <h2 className="forum-category-directory-title"><Link to={`/forum?category=${encodeURIComponent(category.slug)}`}><span className={cn("forum-category-marker", visual.markerClassName)} aria-hidden="true" />{t(category.name)}</Link></h2>
                      {category.description ? <p>{t(category.description)}</p> : null}
                    </td>
                    <td className="forum-category-directory-count" title={typeof category.topicCount === "number" ? `${t("Topics")}: ${formatForumNumber(category.topicCount, language)}` : undefined}>
                      {recentCount > 0 ? <span aria-label={`${formatForumNumber(recentCount, language)} ${t("New topics in the past week")}`}><strong>{formatForumNumber(recentCount, language)}</strong><span className="forum-category-directory-period">{t("/ week")}</span></span> : <strong>{typeof category.topicCount === "number" ? formatForumNumber(category.topicCount, language) : "—"}</strong>}
                    </td>
                  </tr>;
                }) : <tr><td colSpan={2} className="py-12 text-center text-muted-foreground">{t("No forum categories available.")}</td></tr>}
              </tbody>
            </table>
          )}
          {isAdmin ? <div className="border-t border-border px-4 py-3 text-right text-sm"><Link to="/forum/categories/manage" className="text-muted-foreground hover:text-primary hover:underline">{t("Manage categories")}</Link></div> : null}
        </ForumSurface>
      </section>
    </ForumLayout>
  );
}
