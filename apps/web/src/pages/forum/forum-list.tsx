import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { ForumPostType } from "@trend/shared-types";
import { ArrowDown, ChevronDown, List, MessageSquare, PanelTop, SquarePen, Search, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ForumCard, ForumLayout, ForumSurface, ForumSidebar, useForumCategories, useForumPosts } from "@/features/forum";
import { ForumPagination } from "@/features/forum/components/forum-pagination";
import { useForumFeedVisibility } from "@/features/forum/hooks/use-forum-feed-visibility";
import { parseForumListParams, updateForumListParam } from "@/features/forum/utils/forum-pagination";
import { forumListHref } from "@/features/forum/utils/forum-pagination";
import { FORUM_FEEDS } from "@/features/forum/utils/forum-navigation";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/utils/cn";
import { getForumCategoryPresentation } from "@/features/forum/utils/forum-category-presentation";

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
  const [routeSearchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { categorySlug } = useParams<{ categorySlug?: string }>();
  const searchParams = useMemo(() => {
    const params = new URLSearchParams(routeSearchParams);
    if (categorySlug) params.set("category", categorySlug);
    return params;
  }, [routeSearchParams, categorySlug]);
  const navigate = useNavigate();
  const [composerOpen, setComposerOpen] = useState(false);
  const [closeRequest, setCloseRequest] = useState(0);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<"compact" | "expanded">(() => {
    try { return localStorage.getItem("lumigap.forum.topic-view") === "expanded" ? "expanded" : "compact"; }
    catch { return "compact"; }
  });
  useEffect(() => {
    try { localStorage.setItem("lumigap.forum.topic-view", viewMode); }
    catch { /* The view toggle also works when browser storage is unavailable. */ }
  }, [viewMode]);
  const [searchOpen, setSearchOpen] = useState(() => Boolean(searchParams.get("q")));
  const searchField = useRef<HTMLInputElement>(null);
  const { page, pageSize, sort, type, query } = parseForumListParams(searchParams);
  const feedNavigation = useForumFeedVisibility(`${sort}:${language}`);
  // A draft belongs to one history entry. Back/forward immediately restores the URL's search.
  const [searchDraft, setSearchDraft] = useState({ value: query, locationKey: location.key });
  const searchInput = searchDraft.locationKey === location.key ? searchDraft.value : query;
  const setSearchInput = (value: string) => setSearchDraft({ value, locationKey: location.key });
  useEffect(() => { if (searchOpen) searchField.current?.focus({ preventScroll: true }); }, [searchOpen]);
  const contentTop = useRef<HTMLElement>(null);
  const previousSearch = useRef(location.search);
  const communityId = categorySlug ?? searchParams.get("category") ?? searchParams.get("community") ?? "";
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

  const { data, isLoading, isFetching, isPlaceholderData, isError, refetch } = useForumPosts({
    page, pageSize, query: query.trim() || undefined, sort,
    type: type || undefined, category: communityId || undefined,
    tag: tag || undefined, linkedResearchGapId,
  }, sort !== "following" || isAuthed);
  const { data: communities, isLoading: communitiesLoading, isError: communitiesError, refetch: retryCommunities } = useForumCategories();
  const selectedCommunity = communities?.find((item) => item.id === communityId || item.slug === communityId);
  const categoryContext = Boolean(communityId);
  const categoryPresentation = getForumCategoryPresentation(selectedCommunity?.slug ?? communityId);
  const CategoryIcon = categoryPresentation.icon;
  const selectedType = TYPES.find((item) => item.value === type);
  const communityFilterLabel = selectedCommunity ? t(selectedCommunity.name) : t("Category");
  const typeFilterLabel = type ? t(selectedType?.label ?? type) : t("Type");
  // A selected category is page context, not a transient filter chip. The
  // compact category banner and dropdown already communicate that scope.
  const hasFilters = Boolean(searchInput || type || tag || linkedResearchGapId);
  const updating = isFetching || searchInput.trim() !== query.trim();

  useEffect(() => {
    let next = new URLSearchParams(searchParams);
    if (searchParams.has("page") && searchParams.get("page") !== String(page)) next = updateForumListParam(next, "page", String(page));
    if (data && !isPlaceholderData && page > data.meta.totalPages) next = updateForumListParam(next, "page", String(data.meta.totalPages));
    if (searchParams.has("pageSize") && searchParams.get("pageSize") !== String(pageSize)) next.set("pageSize", String(pageSize));
    if (searchParams.has("sort") && searchParams.get("sort") !== sort) next.delete("sort");
    if (searchParams.has("feed") && searchParams.get("feed") !== sort) next.delete("feed");
    if (searchParams.has("type") && searchParams.get("type") !== type) next.delete("type");
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [data, isPlaceholderData, page, pageSize, sort, type, searchParams, setSearchParams]);

  const setParam = (key: string, value?: string) => {
    const next = updateForumListParam(searchParams, key, value);
    if (categorySlug && key === "category") {
      navigate(`/forum${next.size ? `?${next}` : ""}`);
      return;
    }
    setSearchParams(next);
  };
  const clearFilters = () => {
    setSearchInput("");
    const next = new URLSearchParams();
    if (communityId) next.set("category", communityId);
    if (sort !== "latest") next.set("feed", sort);
    if (pageSize !== 20) next.set("pageSize", String(pageSize));
    setSearchParams(next);
  };

  return (
      <ForumLayout
        className={cn("forum-feed-workspace", categoryContext && "forum-category-workspace", categoryContext && categoryPresentation.accentClassName)}
        contentClassName="forum-feed-content"
        sidebar={
          <ForumSidebar
            communities={communities}
            communitiesLoading={communitiesLoading}
            communitiesError={communitiesError}
            onRetryCommunities={() => void retryCommunities()}
            isAuthed={isAuthed}
            onNewDiscussion={() => { setCloseRequest(0); setComposerExpanded(false); setComposerOpen(true); }}
            composerOpen={composerOpen}
          />
        }
      >
        <section ref={contentTop} className="min-w-0 scroll-mt-[calc(var(--app-header-height)+1rem)]" aria-label={t("Forum discussions")}>
          <header className={cn("forum-list-header relative border-b border-border/70 px-4 py-3.5 sm:px-6", categoryContext && categoryPresentation.accentClassName)}>
            {categoryContext ? <span aria-hidden="true" className={cn("forum-category-context-icon", categoryPresentation.iconClassName)}><CategoryIcon className="h-5 w-5" /></span> : null}
            <h1 className="text-xl font-semibold tracking-tight">{selectedCommunity ? t(selectedCommunity.name) : t("Research Forum")}</h1>
            <p className="mt-1 max-w-3xl text-sm leading-5 text-muted-foreground">{t(selectedCommunity?.description || "Discuss research questions, papers, methods, and emerging research gaps.")}</p>
            {updating && !isLoading ? <div role="status" className="absolute inset-x-0 bottom-0 h-0.5 animate-pulse bg-primary/60 motion-reduce:animate-none"><span className="sr-only">{t("Updating discussions…")}</span></div> : null}
          </header>
          <ForumSurface data-view-mode={viewMode} className={cn("forum-topics overflow-hidden", categoryContext && "forum-category-topics")}>
          <div className="forum-topic-toolbar border-b border-slate-200 dark:border-slate-800">
            <div className="forum-topic-toolbar-row flex min-w-0 flex-wrap items-center gap-2 px-4 py-2 sm:px-6">
              <div className="forum-topic-filter-group flex min-w-0 items-center gap-2">
                <label className="forum-topic-filter-control">
                  <span className="sr-only">{t("Category")}</span>
                  <span className="forum-topic-filter-shell" aria-hidden="true">
                    <span className="forum-topic-filter-label">{communityFilterLabel}</span>
                    <ChevronDown className="forum-topic-filter-chevron" />
                  </span>
                  <select
                    value={selectedCommunity?.slug ?? communityId}
                    onChange={(event) => setParam("category", event.target.value)}
                    aria-label={t("Category")}
                    className="forum-topic-filter forum-topic-filter-select"
                  >
                    <option value="">{t("All categories")}</option>
                    {(communities ?? []).map((community) => (
                      <option key={community.id} value={community.slug}>{t(community.name)}</option>
                    ))}
                  </select>
                </label>
                <label className="forum-topic-filter-control">
                  <span className="sr-only">{t("Thread type")}</span>
                  <span className="forum-topic-filter-shell" aria-hidden="true">
                    <span className="forum-topic-filter-label">{typeFilterLabel}</span>
                    <ChevronDown className="forum-topic-filter-chevron" />
                  </span>
                  <select
                    value={type}
                    onChange={(event) => setParam("type", event.target.value)}
                    aria-label={t("Thread type")}
                    className="forum-topic-filter forum-topic-filter-select"
                  >
                    {TYPES.map((item) => (
                      <option key={item.value} value={item.value}>{t(item.label)}</option>
                    ))}
                  </select>
                </label>
              </div>

              <nav ref={feedNavigation} className="forum-topic-feeds flex min-w-0 flex-1 flex-nowrap items-center gap-0.5 overflow-x-auto" aria-label={t("Forum feeds")}>
              {FORUM_FEEDS.map((feed) => (
                <Link
                  key={feed.value}
                  to={feed.value === "following" && !isAuthed ? `/login?returnTo=${encodeURIComponent(forumListHref(searchParams, "feed", feed.value))}` : forumListHref(searchParams, "feed", feed.value)}
                  title={t(feed.description)}
                  aria-current={sort === feed.value ? "page" : undefined}
                  className={`forum-topic-feed relative min-h-10 min-w-max rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-base ${sort === feed.value ? "is-active text-primary" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"}`}
                >
                  {t(feed.label)}
                  {sort === feed.value ? <span className="forum-topic-feed-indicator absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" /> : null}
                </Link>
              ))}
                <Link to="/forum/categories" className="forum-topic-feed relative min-h-10 min-w-max rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("Categories")}</Link>
              </nav>
              <div className="forum-topic-toolbar-actions ml-auto flex shrink-0 items-center gap-2">
                <Button type="button" variant="outline" size="icon" aria-label={t(searchOpen ? "Hide search" : "Show search")} aria-expanded={searchOpen} aria-controls="forum-list-search" className="forum-search-toggle h-9 w-9 rounded-full" onClick={() => setSearchOpen((open) => !open)}>
                  {searchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                </Button>
                <div className="forum-topic-create-group inline-flex items-center">
                  {isAuthed ? (
                    <Button variant="discussion" type="button" aria-label={t("New discussion")} title={t("New discussion")} aria-haspopup="dialog" aria-expanded={composerOpen} className="forum-new-discussion shrink-0 gap-1.5 px-3 text-sm" onClick={() => { setCloseRequest(0); setComposerExpanded(false); setComposerOpen(true); }}>
                      <SquarePen className="h-4 w-4" aria-hidden="true" />
                      <span>{t("New discussion")}</span>
                    </Button>
                  ) : <Button asChild variant="discussion" aria-label={t("New discussion")} title={t("New discussion")} className="forum-new-discussion gap-1.5 px-3"><Link to={`/login?returnTo=${encodeURIComponent(`/forum/new${communityId ? `?category=${encodeURIComponent(communityId)}` : ""}`)}`}><SquarePen className="h-4 w-4" aria-hidden="true" /><span>{t("New discussion")}</span></Link></Button>}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="discussion" size="icon" className="forum-topic-view-toggle h-9 w-9 rounded-l-none rounded-r-full max-sm:h-11 max-sm:w-8" aria-label={t("Discussion display")} title={t(viewMode === "compact" ? "Compact" : "Expanded")}>
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 rounded-xl p-1.5">
                      <DropdownMenuRadioGroup value={viewMode} onValueChange={(value) => { if (value === "compact" || value === "expanded") setViewMode(value); }} aria-label={t("Discussion display")}>
                        <DropdownMenuRadioItem value="compact" className="min-h-10 gap-2 rounded-lg"><List className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{t("Compact")}</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="expanded" className="min-h-10 gap-2 rounded-lg"><PanelTop className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{t("Expanded")}</DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
            <div id="forum-list-search" data-expanded={searchOpen} className="forum-list-search relative mx-4 max-w-2xl pb-3 sm:mx-6" role="search">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-[calc(50%+0.375rem)] text-sky-600 dark:text-sky-300" />
              <Input ref={searchField} value={searchInput} onChange={(event) => setSearchInput(event.target.value)} aria-label={t("Search discussions")} placeholder={t("Search discussions, papers, DOI, topics...")} className="h-10 rounded-lg border-slate-300 bg-white/80 pl-10 text-sm shadow-sm ring-1 ring-white/60 placeholder:text-slate-400 focus-visible:border-violet-400 focus-visible:ring-violet-400/30 dark:border-slate-700 dark:bg-slate-950/60 dark:ring-slate-800/60" />
            </div>
            <p className="sr-only">{t(FORUM_FEEDS.find((feed) => feed.value === sort)!.description)}</p>
          </div>

          {/* Active filters */}
          {hasFilters ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3 text-sm sm:px-6">
              <span className="font-medium text-muted-foreground">{t("Showing:")}</span>
              {searchInput ? <FilterChip label={`"${searchInput}"`} onClear={() => setSearchInput("")} /> : null}
              {type ? <FilterChip label={t(TYPES.find((item) => item.value === type)?.label ?? type)} onClear={() => setParam("type")} /> : null}
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
          <div aria-live="polite" aria-busy={updating}>
            {sort === "following" && !isAuthed ? (
              <div className="p-10 text-center"><h2 className="font-semibold">{t("Sign in to see followed discussions.")}</h2><Button asChild size="sm" className="mt-4"><Link to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}>{t("Sign in")}</Link></Button></div>
            ) : isLoading ? (
              <div className="divide-y divide-border/60">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="forum-topic-row" aria-label={t("Loading discussions")}>
                    <div className="forum-topic-mobile-avatar h-7 w-7 rounded-full bg-muted/60" aria-hidden="true" />
                    <div className="forum-topic-copy space-y-2" aria-hidden="true">
                      <div className="h-5 w-3/4 rounded bg-muted/60" />
                      <div className="h-3 w-1/2 rounded bg-muted/40" />
                    </div>
                    <div className="forum-topic-metrics h-6 rounded bg-muted/30" aria-hidden="true" />
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
                      categoryContext={categoryContext}
                      viewMode={viewMode}
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
        {isAuthed ? <Button variant="discussion" type="button" aria-haspopup="dialog" size="sm" onClick={onNewDiscussion}><SquarePen className="h-4 w-4" />{t("Start discussion")}</Button> : null}
      </div>
    </div>
  );
}
