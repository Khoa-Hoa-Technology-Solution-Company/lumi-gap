import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { ForumPostType } from "@trend/shared-types";
import { ArrowDown, MessageSquare, Plus, Search, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ForumCard, ForumLayout, ForumSurface, ForumSidebar, useCommunities, useForumPosts } from "@/features/forum";
import { ForumPagination } from "@/features/forum/components/forum-pagination";
import { parseForumListParams, updateForumListParam } from "@/features/forum/utils/forum-pagination";
import { forumListHref } from "@/features/forum/utils/forum-pagination";
import { FORUM_FEEDS } from "@/features/forum/utils/forum-navigation";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/utils/cn";

const ForumDiscussionComposer = lazy(() => import("@/pages/forum/forum-new").then((module) => ({ default: module.ForumDiscussionComposer })));

const TYPES: Array<{ value: ForumPostType | ""; label: string }> = [
  { value: "", label: "All thread types" },
  { value: "QUESTION", label: "Questions" },
  { value: "DISCUSSION", label: "Discussions" },
  { value: "PAPER_DISCUSSION", label: "Paper Discussions" },
  { value: "RESEARCH_GAP_DISCUSSION", label: "Research Gap Discussions" },
];

export function ForumListPage() {
  const { t, language } = useI18n();
  const isAuthed = useAuthStore((state) => Boolean(state.tokens?.accessToken));
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [composerOpen, setComposerOpen] = useState(false);
  const [closeRequest, setCloseRequest] = useState(0);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const { page, pageSize, sort, type, query } = parseForumListParams(searchParams);
  // A draft belongs to one history entry. Back/forward immediately restores the URL's search.
  const [searchDraft, setSearchDraft] = useState({ value: query, locationKey: location.key });
  const searchInput = searchDraft.locationKey === location.key ? searchDraft.value : query;
  const setSearchInput = (value: string) => setSearchDraft({ value, locationKey: location.key });
  const contentTop = useRef<HTMLElement>(null);
  const previousSearch = useRef(location.search);
  const communityId = searchParams.get("community") ?? "";
  const tag = searchParams.get("tag") ?? "";
  const linkedResearchGapId = searchParams.get("linkedResearchGapId") ?? undefined;

  useEffect(() => {
    // Clear a committed draft as well: returning to its original history entry
    // must not resurrect text that was subsequently committed on another entry.
    setSearchDraft({ value: query, locationKey: location.key });
  }, [location.key, query]);

  useEffect(() => {
    if (searchDraft.locationKey !== location.key || query === searchDraft.value) return;
    const timeout = window.setTimeout(() => {
      setSearchParams(updateForumListParam(searchParams, "q", searchDraft.value || undefined));
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [searchDraft, location.key, query, searchParams, setSearchParams]);

  useEffect(() => {
    if (previousSearch.current !== location.search) {
      contentTop.current?.scrollIntoView({ block: "start", behavior: "auto" });
      previousSearch.current = location.search;
    }
  }, [location.search]);

  const { data, isLoading, isError, refetch } = useForumPosts({
    page, pageSize, query: query.trim() || undefined, sort,
    type: type || undefined, communityId: communityId || undefined,
    tag: tag || undefined, linkedResearchGapId,
  }, sort !== "following" || isAuthed);
  const { data: communities, isLoading: communitiesLoading, isError: communitiesError, refetch: retryCommunities } = useCommunities();
  const selectedCommunity = communities?.find((item) => item.id === communityId || item.slug === communityId);
  const hasFilters = Boolean(searchInput || type || communityId || tag || linkedResearchGapId);

  useEffect(() => {
    let next = new URLSearchParams(searchParams);
    if (searchParams.has("page") && searchParams.get("page") !== String(page)) next = updateForumListParam(next, "page", String(page));
    if (data && page > data.meta.totalPages) next = updateForumListParam(next, "page", String(data.meta.totalPages));
    if (searchParams.has("pageSize") && searchParams.get("pageSize") !== String(pageSize)) next.set("pageSize", String(pageSize));
    if (searchParams.has("sort") && searchParams.get("sort") !== sort) next.delete("sort");
    if (searchParams.has("feed") && searchParams.get("feed") !== sort) next.delete("feed");
    if (searchParams.has("type") && searchParams.get("type") !== type) next.delete("type");
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [data, page, pageSize, sort, type, searchParams, setSearchParams]);

  const setParam = (key: string, value?: string) => {
    const next = updateForumListParam(searchParams, key, value);
    setSearchParams(next);
  };
  const clearFilters = () => {
    setSearchInput("");
    const next = new URLSearchParams();
    if (sort !== "latest") next.set("feed", sort);
    if (pageSize !== 20) next.set("pageSize", String(pageSize));
    setSearchParams(next);
  };

  return (
      <ForumLayout
        sidebar={
          <ForumSidebar
            communities={communities}
            communitiesLoading={communitiesLoading}
            communitiesError={communitiesError}
            onRetryCommunities={() => void retryCommunities()}
            isAuthed={isAuthed}
          />
        }
      >
        <section ref={contentTop} className="min-w-0 scroll-mt-[calc(var(--app-header-height)+1rem)]" aria-label={t("Forum discussions")}>
          <ForumSurface className="forum-topics overflow-hidden">
          <header className="border-b border-slate-200 px-5 pb-5 pt-6 dark:border-slate-800 sm:px-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1 basis-72">
                <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-foreground">{t("Research Forum")}</h1>
                <p className="mt-1.5 max-w-[70ch] text-sm leading-6 text-muted-foreground sm:text-base">
                  {t("Discuss research questions, papers, methods, and emerging research gaps.")}
                </p>
              </div>
              {isAuthed ? (
                <Button type="button" aria-haspopup="dialog" aria-expanded={composerOpen} className="h-11 shrink-0 px-5 text-base" onClick={() => { setCloseRequest(0); setComposerExpanded(false); setComposerOpen(true); }}>
                    <Plus className="h-4 w-4" />
                    {t("New discussion")}
                </Button>
              ) : null}
            </div>
            <div className="relative mt-5 max-w-2xl" role="search">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} aria-label={t("Search discussions")} placeholder={t("Search discussions, papers, DOI, topics...")} className="h-12 rounded-lg border-slate-300 bg-slate-50 pl-10 text-base dark:border-slate-700 dark:bg-slate-900 md:text-base" />
            </div>
          </header>
          <div className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
            <div className="forum-topic-toolbar flex flex-wrap items-center gap-2 px-5 py-3 sm:px-6">
            <select
              value={selectedCommunity?.slug ?? communityId}
              onChange={(event) => setParam("community", event.target.value)}
              aria-label={t("Community")}
                className="forum-topic-filter h-11 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">{t("All communities")}</option>
              {(communities ?? []).map((community) => (
                <option key={community.id} value={community.slug}>{community.name}</option>
              ))}
            </select>
            <select
              value={type}
              onChange={(event) => setParam("type", event.target.value)}
              aria-label={t("Thread type")}
                className="forum-topic-filter h-11 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {TYPES.map((item) => (
                <option key={item.value} value={item.value}>{t(item.label)}</option>
              ))}
            </select>

            <nav className="forum-topic-feeds flex flex-wrap items-end gap-1" aria-label={t("Forum feeds")}>
              {FORUM_FEEDS.map((feed) => (
                <Link
                  key={feed.value}
                  to={feed.value === "following" && !isAuthed ? `/login?returnTo=${encodeURIComponent(forumListHref(searchParams, "feed", feed.value))}` : forumListHref(searchParams, "feed", feed.value)}
                  title={t(feed.description)}
                  aria-current={sort === feed.value ? "page" : undefined}
                  className={`relative min-w-max rounded-sm px-2 py-3 text-base font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3 ${sort === feed.value ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {t(feed.label)}
                  {sort === feed.value ? <span className="absolute inset-x-2 bottom-0 h-0.5 bg-primary" /> : null}
                </Link>
              ))}
            </nav>
            </div>
            <p className="px-5 pb-3 text-sm leading-5 text-muted-foreground sm:px-6">{t(FORUM_FEEDS.find((feed) => feed.value === sort)!.description)}</p>
          </div>

          {/* Active filters */}
          {hasFilters ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3 text-sm sm:px-6">
              <span className="font-medium text-muted-foreground">{t("Showing:")}</span>
              {searchInput ? <FilterChip label={`"${searchInput}"`} onClear={() => setSearchInput("")} /> : null}
              {type ? <FilterChip label={t(TYPES.find((item) => item.value === type)?.label ?? type)} onClear={() => setParam("type")} /> : null}
              {communityId ? <FilterChip label={selectedCommunity?.name ?? t("Community")} onClear={() => setParam("community")} /> : null}
              {tag ? <FilterChip label={`#${tag}`} onClear={() => setParam("tag")} /> : null}
              {linkedResearchGapId ? <FilterChip label={t("Linked research gap")} onClear={() => setParam("linkedResearchGapId")} /> : null}
              <button type="button" onClick={clearFilters} className="ml-auto font-medium text-blue-700 hover:underline dark:text-blue-300">{t("Clear filters")}</button>
            </div>
          ) : null}

          <div className="forum-topic-head items-center gap-4 border-b border-border px-6 py-4 text-base font-medium text-muted-foreground">
            <span>{t("Topic")}</span>
            <span className="forum-topic-head-metrics grid items-center gap-2">
              <span className="forum-topic-head-participants text-left">{t("Participants")}</span>
              <span className="text-center">{t("Replies")}</span>
              <span className="forum-topic-head-views text-center">{t("Views")}</span>
              <button type="button" onClick={() => setParam("feed", "popular")} title={t(FORUM_FEEDS[2]!.description)} className="forum-topic-head-helpful items-center justify-center gap-1 rounded focus-visible:ring-2 focus-visible:ring-ring hover:text-slate-900 dark:hover:text-white">
                {t("Helpful")}{sort === "popular" ? <ArrowDown aria-hidden="true" className="h-3.5 w-3.5" /> : null}
              </button>
              <button type="button" onClick={() => setParam("feed", "latest")} title={t(FORUM_FEEDS[0]!.description)} className="flex items-center justify-end gap-1 rounded text-right focus-visible:ring-2 focus-visible:ring-ring">{t("Activity")}{sort === "latest" ? <ArrowDown aria-hidden="true" className="h-3.5 w-3.5" /> : null}</button>
            </span>
          </div>

          {/* Topic list */}
          <div aria-live="polite">
            {sort === "following" && !isAuthed ? (
              <div className="p-10 text-center"><h2 className="font-semibold">{t("Sign in to see followed discussions.")}</h2><Button asChild size="sm" className="mt-4"><Link to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}>{t("Sign in")}</Link></Button></div>
            ) : isLoading ? (
              <div className="divide-y divide-border/60">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="flex min-h-[136px] gap-4 px-6 py-5" aria-label={t("Loading discussions")}>
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                      <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                    </div>
                    <div className="h-4 w-12 animate-pulse rounded bg-muted" />
                  </div>
                ))}
              </div>
            ) : isError ? (
              <div className="border-b border-border/70 p-10 text-center">
                <ShieldAlert className="mx-auto h-7 w-7 text-destructive" />
                <h2 className="mt-3 font-semibold">{t("Could not load discussions.")}</h2>
                <p className="mt-1 text-base text-muted-foreground">{t("Please try again in a moment.")}</p>
                <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-4">{t("Retry")}</Button>
              </div>
            ) : data?.data.length ? (
              <>
                <div className="bg-white dark:bg-slate-950">
                  <div className="divide-y divide-slate-200 border-b border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                  {data.data.map((post) => (
                    <ForumCard
                      key={post.id}
                      post={post}
                      locale={language}
                      isAuthed={isAuthed}
                    />
                  ))}
                  </div>
                </div>
                <ForumPagination page={page} pageSize={pageSize} total={data.meta.total} totalPages={data.meta.totalPages} onPageChange={(next) => setParam("page", String(next))} onPageSizeChange={(size) => setParam("pageSize", size === 20 ? undefined : String(size))} />
              </>
            ) : (
              <EmptyState hasFilters={hasFilters} isAuthed={isAuthed} following={sort === "following"} onClear={clearFilters} onNewDiscussion={() => { setCloseRequest(0); setComposerExpanded(false); setComposerOpen(true); }} t={t} />
            )}
          </div>
          </ForumSurface>
        </section>
        <Dialog open={composerOpen} onOpenChange={(open) => { if (open) setComposerOpen(true); }}>
          <DialogContent
            showClose={false}
            overlayClassName="bg-black/25 backdrop-blur-[1px]"
            className={cn(
              "inset-0 h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-0 p-0",
              "sm:bottom-4 sm:left-1/2 sm:right-auto sm:top-auto sm:h-auto sm:max-h-[min(78vh,58rem)] sm:w-[min(54rem,calc(100%-2rem))] sm:translate-x-[-50%] sm:translate-y-0 sm:rounded-xl sm:border",
              composerExpanded && "sm:bottom-4 sm:left-4 sm:right-4 sm:top-4 sm:h-auto sm:max-h-none sm:w-auto sm:translate-x-0 sm:rounded-xl",
            )}
            onEscapeKeyDown={(event) => { event.preventDefault(); setCloseRequest((value) => value + 1); }}
            onPointerDownOutside={(event) => { event.preventDefault(); setCloseRequest((value) => value + 1); }}
          >
            <DialogHeader className="sr-only">
              <DialogTitle>{t("New discussion")}</DialogTitle>
              <DialogDescription>{t("Compose a research forum discussion without leaving the current feed.")}</DialogDescription>
            </DialogHeader>
            <Suspense fallback={<div className="flex min-h-[22rem] items-center justify-center text-sm text-muted-foreground" role="status">{t("Loading discussion editor")}</div>}>
              <ForumDiscussionComposer
                embedded
                closeRequest={closeRequest}
                expanded={composerExpanded}
                onToggleExpand={() => setComposerExpanded((value) => !value)}
                onClose={() => { setCloseRequest(0); setComposerExpanded(false); setComposerOpen(false); }}
                onPublished={(postId) => { setCloseRequest(0); setComposerExpanded(false); setComposerOpen(false); navigate(`/forum/${postId}`); }}
              />
            </Suspense>
          </DialogContent>
        </Dialog>
      </ForumLayout>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-2 py-0.5 text-foreground">
      {label}
      <button type="button" onClick={onClear} className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground" aria-label={`${t("Remove")} ${label}`}>
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function EmptyState({ hasFilters, isAuthed, following, onClear, onNewDiscussion, t }: { hasFilters: boolean; isAuthed: boolean; following: boolean; onClear: () => void; onNewDiscussion: () => void; t: (key: string) => string }) {
  return (
    <div className="border-b border-border/70 p-12 text-center">
      <MessageSquare className="mx-auto h-7 w-7 text-muted-foreground" />
      <h2 className="mt-3 font-semibold">{t(hasFilters ? "No discussions match these filters." : following ? "No followed discussions yet." : "No discussions yet in this community.")}</h2>
      <p className="mx-auto mt-2 max-w-md text-base text-muted-foreground">{t(hasFilters ? "Try a broader keyword or clear one of the filters." : following ? "Follow a discussion to find it here." : "Start an academic discussion with a question, paper, method, or research gap.")}</p>
      <div className="mt-5 flex justify-center gap-2">
        {hasFilters ? <Button variant="outline" size="sm" onClick={onClear}>{t("Clear filters")}</Button> : null}
        {isAuthed ? <Button type="button" aria-haspopup="dialog" size="sm" onClick={onNewDiscussion}><Plus className="h-4 w-4" />{t("Start discussion")}</Button> : null}
      </div>
    </div>
  );
}
