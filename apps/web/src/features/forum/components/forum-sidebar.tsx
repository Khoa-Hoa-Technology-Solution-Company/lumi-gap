import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { BookOpen, Compass, Flame, HelpCircle, Layers, MessageSquare, Users, Sparkles, Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { CommunityView } from "../api/forum.api";
import type { ForumPostType, ForumSort } from "@trend/shared-types";
import { forumListHref, parseForumListParams } from "../utils/forum-pagination";
import { cn } from "@/utils/cn";
import { useI18n } from "@/i18n";

type ForumSidebarProps = {
  communities?: CommunityView[];
  communitiesLoading?: boolean;
  communitiesError?: boolean;
  onRetryCommunities?: () => void;
  isAuthed?: boolean;
};
const feeds: Array<{ value: ForumSort; label: string; icon: typeof Sparkles }> = [
  { value: "latest", label: "Latest", icon: Sparkles },
  { value: "unanswered", label: "Unanswered", icon: HelpCircle },
  { value: "popular", label: "Popular", icon: Flame },
  { value: "following", label: "Following", icon: Users },
];
const types: Array<{ value: ForumPostType; label: string; icon: typeof HelpCircle }> = [
  { value: "QUESTION", label: "Questions", icon: HelpCircle },
  { value: "DISCUSSION", label: "Discussions", icon: MessageSquare },
  { value: "PAPER_DISCUSSION", label: "Paper Discussions", icon: BookOpen },
  { value: "RESEARCH_GAP_DISCUSSION", label: "Research Gap Discussions", icon: Compass },
];
export function ForumSidebar({ communities = [], communitiesLoading = false, communitiesError = false, onRetryCommunities, isAuthed = false }: ForumSidebarProps) {
  const { t } = useI18n();
  const location = useLocation();
  const onList = location.pathname === "/forum";
  const params = new URLSearchParams(onList ? location.search : "");
  const { sort, type } = parseForumListParams(params);
  const communityFilter = params.get("community") ?? "";
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const itemClass = "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-base leading-6 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";
  const selectedClass = "bg-muted font-semibold text-foreground";
  const navigation = (
    <nav aria-label={t("Forum navigation")}>
      <Link to="/forum" onClick={close} className="mb-6 flex items-center gap-3 px-3 text-lg font-semibold"><MessageSquare className="h-5 w-5 shrink-0 text-primary" />{t("Research Forum")}</Link>
      <div className="space-y-0.5">
        {feeds.map(({ value, label, icon: Icon }) => {
          const active = onList && sort === value;
          const target = forumListHref(params, "feed", value);
          return <Link key={value} to={value === "following" && !isAuthed ? `/login?returnTo=${encodeURIComponent(target)}` : target} className={cn(itemClass, active && selectedClass)} aria-current={active ? "page" : undefined} onClick={close}><Icon className="h-[18px] w-[18px] shrink-0" />{t(label)}</Link>;
        })}
      </div>
      <div className="mt-6 border-t border-border pt-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3"><p className="text-xs font-semibold uppercase text-muted-foreground">{t("Communities")}</p><Link to="/communities" className="py-1 text-sm text-primary hover:underline" onClick={close}>{t("Browse")}</Link></div>
        <Link to={forumListHref(params, "community")} onClick={close} aria-current={onList && !communityFilter ? "page" : undefined} className={cn(itemClass, onList && !communityFilter && selectedClass)}><Layers className="h-[18px] w-[18px] shrink-0" />{t("All communities")}</Link>
        {communitiesLoading ? <div role="status" aria-label={t("Loading communities")} className="space-y-3 px-3 py-3">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-4 animate-pulse rounded bg-muted motion-reduce:animate-none" style={{ width: `${70 + index % 2 * 20}%` }} />)}</div> : communitiesError ? <div role="alert" className="px-3 py-2 text-sm text-muted-foreground"><p>{t("Could not load communities.")}</p><button type="button" onClick={onRetryCommunities} className="mt-2 rounded text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring">{t("Retry")}</button></div> : communities.length ? communities.map((community) => {
          const active = onList && (community.slug === communityFilter || community.id === communityFilter);
          return <Link key={community.id} to={forumListHref(params, "community", community.slug)} className={cn(itemClass, active && selectedClass)} aria-current={active ? "page" : undefined} onClick={close}><span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50" /><span>{community.name}</span></Link>;
        }) : <p className="px-3 py-2 text-sm text-muted-foreground">{t("No academic communities available.")}</p>}
      </div>
      <div className="mt-6 border-t border-border pt-5">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Thread types")}</p>
        {types.map(({ value, label, icon: Icon }) => {
          const active = onList && type === value;
          return <Link key={value} to={forumListHref(params, "type", value)} onClick={close} className={cn(itemClass, active && selectedClass)} aria-current={active ? "page" : undefined}><Icon className="h-[18px] w-[18px] shrink-0" />{t(label)}</Link>;
        })}
      </div>
    </nav>
  );
  return (
    <>
      <aside className="hidden w-[var(--forum-sidebar-width)] shrink-0 border-r border-border bg-background md:block">
        <div className="sticky top-[var(--app-header-height)] max-h-[calc(100dvh-var(--app-header-height))] overflow-y-auto overscroll-y-contain px-3 pb-8 pt-8">{navigation}</div>
      </aside>
      <div className="px-4 pt-3 md:hidden"><Button type="button" variant="ghost" size="sm" className="h-11 text-base" onClick={() => setOpen(true)} aria-label={t("Open forum navigation")} aria-expanded={open} aria-haspopup="dialog"><Menu className="mr-2 h-[18px] w-[18px]" />{t("Forum navigation")}</Button></div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="left-0 right-auto w-[min(20rem,90vw)] overflow-y-auto overscroll-y-contain border-l-0 border-r p-5">
          <SheetTitle className="mb-1">{t("Forum navigation")}</SheetTitle>
          <SheetDescription className="mb-7">{t("Feeds, communities and thread types")}</SheetDescription>
          {navigation}
        </SheetContent>
      </Sheet>
    </>
  );
}
