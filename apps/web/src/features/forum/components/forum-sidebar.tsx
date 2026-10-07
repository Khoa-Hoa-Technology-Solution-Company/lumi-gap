import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Layers, Menu, SquarePen, Shield } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { ForumCategoryView } from "../api/forum.api";
import type { ForumPostType } from "@trend/shared-types";
import { forumListHref, parseForumListParams } from "../utils/forum-pagination";
import { FORUM_FEEDS } from "../utils/forum-navigation";
import { getForumCategoryPresentation } from "../utils/forum-category-presentation";
import { FORUM_TYPE_CONFIG } from "./forum-post-type-badge";
import { cn } from "@/utils/cn";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";

type ForumSidebarProps = {
  communities?: ForumCategoryView[];
  communitiesLoading?: boolean;
  communitiesError?: boolean;
  onRetryCommunities?: () => void;
  isAuthed?: boolean;
  onNewDiscussion?: () => void;
  composerOpen?: boolean;
};

const types: Array<{ value: ForumPostType; label: string }> = [
  { value: "QUESTION", label: "Questions" },
  { value: "DISCUSSION", label: "Discussions" },
  { value: "PAPER_DISCUSSION", label: "Paper Discussions" },
  { value: "RESEARCH_GAP_DISCUSSION", label: "Research Gap Discussions" },
];

/**
 * Forum-local navigation. It deliberately stays compact and low chrome: the
 * topic list is the workspace surface, while this column only provides scope.
 */
export function ForumSidebar({
  communities = [],
  communitiesLoading = false,
  communitiesError = false,
  onRetryCommunities,
  isAuthed = false,
  onNewDiscussion,
  composerOpen = false,
}: ForumSidebarProps) {
  const { t } = useI18n();
  const isAdmin = useAuthStore((state) => state.user?.role === "admin");
  const location = useLocation();
  const categoryRouteSlug = location.pathname.match(/^\/forum\/category\/([^/]+)/)?.[1];
  const onList = location.pathname === "/forum" || Boolean(categoryRouteSlug);
  const params = new URLSearchParams(onList ? location.search : "");
  if (categoryRouteSlug && !params.has("category")) params.set("category", decodeURIComponent(categoryRouteSlug));
  const { sort, type } = parseForumListParams(params);
  const categoryFilter = params.get("category") ?? params.get("community") ?? "";
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const newDiscussionHref = `/forum/new${categoryFilter ? `?category=${encodeURIComponent(categoryFilter)}` : ""}`;

  const itemClass =
    "forum-sidebar-item group flex min-h-9 w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-sm leading-5 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  const selectedClass = "forum-sidebar-item--active bg-muted/80 font-medium text-foreground";
  const iconClass = "forum-sidebar-item__icon h-4 w-4 shrink-0 text-muted-foreground transition-colors";

  const navigation = (
    <nav className="forum-sidebar-nav" aria-label={t("Forum navigation")}>
      {isAuthed && onNewDiscussion ? (
        <Button
          variant="discussion"
          type="button"
          className="forum-new-discussion forum-sidebar-new-discussion mb-4 w-full gap-2 rounded-full"
          aria-haspopup="dialog"
          aria-expanded={composerOpen}
          onClick={() => { close(); onNewDiscussion(); }}
        >
          <SquarePen aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>{t("New discussion")}</span>
        </Button>
      ) : (
        <Button asChild variant="discussion" className="forum-new-discussion forum-sidebar-new-discussion mb-4 w-full gap-2 rounded-full">
          <Link to={isAuthed ? newDiscussionHref : `/login?returnTo=${encodeURIComponent(newDiscussionHref)}`} onClick={close}>
            <SquarePen aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>{t("New discussion")}</span>
          </Link>
        </Button>
      )}

      <div className="forum-sidebar-section forum-sidebar-section--feeds space-y-0.5">
        {FORUM_FEEDS.map(({ value, label, description, icon: Icon }) => {
          const active = onList && sort === value;
          const target = forumListHref(params, "feed", value);
          return (
            <Link
              key={value}
              to={value === "following" && !isAuthed ? `/login?returnTo=${encodeURIComponent(target)}` : target}
              title={t(description)}
              className={cn(itemClass, active && selectedClass)}
              aria-current={active ? "page" : undefined}
              onClick={close}
            >
              <Icon aria-hidden="true" data-sidebar-icon={value} className={iconClass} />
              <span>{t(label)}</span>
            </Link>
          );
        })}
      </div>

      <div className="forum-sidebar-section forum-sidebar-section--categories mt-4 border-t border-border/70 pt-3">
        <div className="forum-sidebar-section__header mb-1 flex items-center justify-between px-3">
          <p className="forum-sidebar-section__label text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("Categories")}</p>
        </div>
        <Link to="/forum/categories" onClick={close} className={cn(itemClass, location.pathname === "/forum/categories" && selectedClass)} aria-current={location.pathname === "/forum/categories" ? "page" : undefined}>
          <Layers aria-hidden="true" data-sidebar-icon="all" className={iconClass} />
          <span>{t("All categories")}</span>
        </Link>
        {communitiesLoading ? (
          <div role="status" aria-label={t("Loading categories")} className="forum-sidebar-loading space-y-2 px-3 py-2">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="h-3 animate-pulse rounded bg-muted motion-reduce:animate-none" style={{ width: `${68 + (index % 2) * 22}%` }} />
            ))}
          </div>
        ) : communitiesError ? (
          <div role="alert" className="forum-sidebar-feedback px-3 py-2 text-sm text-muted-foreground">
            <p>{t("Could not load categories.")}</p>
            <button type="button" onClick={onRetryCommunities} className="mt-1.5 rounded text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {t("Retry")}
            </button>
          </div>
        ) : communities.length ? (
          communities.map((category) => {
            const active = onList && (category.slug === categoryFilter || category.id === categoryFilter);
            const visual = getForumCategoryPresentation(category.slug);
            const Icon = visual.icon;
            return (
              <Link
                key={category.id}
                to={forumListHref(params, "category", category.slug)}
                className={cn(itemClass, active && selectedClass)}
                aria-current={active ? "page" : undefined}
                onClick={close}
              >
                <Icon aria-hidden="true" className={cn(iconClass, visual.iconClassName)} />
                <span>{t(category.name)}</span>
              </Link>
            );
          })
        ) : (
          <p className="forum-sidebar-feedback px-3 py-2 text-sm text-muted-foreground">{t("No forum categories available.")}</p>
        )}
      </div>

      <div className="forum-sidebar-section forum-sidebar-section--types mt-4 border-t border-border/70 pt-3">
        <p className="forum-sidebar-section__label mb-1 px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("Thread types")}</p>
        <Link to={forumListHref(params, "type")} onClick={close} className={itemClass}>
          <Layers aria-hidden="true" data-sidebar-icon="all" className={iconClass} />
          <span>{t("All thread types")}</span>
        </Link>
        {types.map(({ value, label }) => {
          const active = onList && type === value;
          const Icon = FORUM_TYPE_CONFIG[value].icon;
          return (
            <Link
              key={value}
              to={forumListHref(params, "type", value)}
              title={t(FORUM_TYPE_CONFIG[value].description)}
              onClick={close}
              className={cn(itemClass, active && selectedClass)}
              aria-current={active ? "page" : undefined}
            >
              <Icon aria-hidden="true" data-sidebar-icon={value} className={iconClass} />
              <span>{t(label)}</span>
            </Link>
          );
        })}
      </div>

      <div className="forum-sidebar-section forum-sidebar-section--secondary mt-4 border-t border-border/70 pt-3">
        {isAdmin ? (
          <Link to="/forum/categories/manage" onClick={close} className={itemClass}>
            <span>{t("Manage categories")}</span>
          </Link>
        ) : null}
        {isAuthed ? (
          <Link to="/forum/moderation" onClick={close} className={cn(itemClass, location.pathname === "/forum/moderation" && selectedClass)} aria-current={location.pathname === "/forum/moderation" ? "page" : undefined}>
            <Shield aria-hidden="true" data-sidebar-icon="moderation" className={iconClass} />
            <span>{t("My moderation decisions")}</span>
          </Link>
        ) : null}
        <Link to="/forum/copyright" onClick={close} className={itemClass}>
          <span>{t("Submit a copyright claim")}</span>
        </Link>
      </div>
    </nav>
  );

  return (
    <>
      <aside className="forum-sidebar-shell hidden w-[var(--forum-sidebar-width)] shrink-0 border-r border-border/70 bg-background lg:block">
        <div className="forum-sidebar-panel sticky top-[var(--app-header-height)] max-h-[calc(100dvh-var(--app-header-height))] overflow-y-auto overscroll-y-contain px-2.5 pb-6 pt-5">
          {navigation}
        </div>
      </aside>
      <div className="forum-navigation-mobile absolute left-6 top-6 z-10 sm:left-9 sm:top-8 lg:hidden">
        <Button type="button" variant="ghost" size="icon" className="h-11 w-11" onClick={() => setOpen(true)} aria-label={t("Open forum navigation")} aria-expanded={open} aria-haspopup="dialog">
          <Menu aria-hidden="true" className="h-[18px] w-[18px] text-muted-foreground" />
        </Button>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent closeLabel={t("Close forum navigation")} className="forum-sidebar-sheet left-0 right-auto w-[min(20rem,90vw)] overflow-y-auto overscroll-y-contain border-l-0 border-r p-4 data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left">
          <SheetTitle className="mb-1">{t("Forum navigation")}</SheetTitle>
          <SheetDescription className="mb-5">{t("Feeds, categories and thread types")}</SheetDescription>
          {navigation}
        </SheetContent>
      </Sheet>
    </>
  );
}
