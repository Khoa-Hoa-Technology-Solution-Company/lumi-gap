import { Link } from "react-router-dom";
import { CheckCircle2, Lock, Pin, ThumbsUp } from "lucide-react";
import type { ForumPostView } from "../api/forum.api";
import { ForumAuthorAvatar } from "./forum-author-avatar";
import { ForumPostTypeBadge } from "./forum-post-type-badge";
import { ForumAuthorPopover } from "./forum-author-popover";
import { formatForumActivityTime, formatForumCompactNumber, formatForumNumber, forumPostHref, stripMarkdown } from "../utils/forum-helpers";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import { getForumCategoryPresentation } from "../utils/forum-category-presentation";
import { preloadForumDetailPage } from "../utils/forum-page-loading";

interface ForumCardProps { post: ForumPostView; locale: string; isAuthed?: boolean; onVote?: (value: -1 | 0 | 1) => void; categoryContext?: boolean; viewMode?: "compact" | "expanded" }

/** Compact topic row; all metrics come from the server, never the loaded replies. */
export function ForumCard({ post, locale, categoryContext = false, viewMode = "compact" }: ForumCardProps) {
  const { t } = useI18n();
  const compact = (value: number) => formatForumCompactNumber(value, locale);
  const activityAt = post.lastActivityAt ?? post.createdAt;
  const categoryMarkerClass = getForumCategoryPresentation(post.community?.slug).markerClassName;
  return (
    <article className={cn("forum-topic-row group grid transition-colors hover:bg-muted/40", post.isPinned && "forum-topic-row-pinned bg-muted/20")}>
      <ForumAuthorPopover author={post.author} className="forum-topic-mobile-avatar"><ForumAuthorAvatar author={post.author} size="sm" /></ForumAuthorPopover>
      <div className="forum-topic-copy min-w-0">
        <Link to={forumPostHref(post)} onPointerEnter={preloadForumDetailPage} onFocus={preloadForumDetailPage} className="block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <h2 className="forum-topic-title break-words font-semibold leading-snug text-foreground group-hover:text-primary">
            {post.isPinned ? <Pin className="mr-1.5 inline h-3.5 w-3.5 text-muted-foreground" aria-label={t("Pinned")} /> : null}
            {post.status === "locked" ? <Lock className="mr-1.5 inline h-3.5 w-3.5 text-muted-foreground" aria-label={t("Locked")} /> : null}
            {post.title}
          </h2>
        </Link>
        <div className="forum-topic-classification mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-muted-foreground">
          {!categoryContext ? <>{post.community ? <Link to={`/forum?category=${encodeURIComponent(post.community.slug)}`} className="font-medium hover:text-primary"><span aria-hidden="true" className={cn("forum-category-marker mr-1.5 inline-block h-2 w-2 rounded-sm", categoryMarkerClass)} />{t(post.community.name)}</Link> : <span>{t("General Research")}</span>}<span aria-hidden="true">·</span></> : null}
          <ForumPostTypeBadge type={post.type} size="sm" showIcon={false} className="border-0 px-0 py-0 text-xs" />
          {post.acceptedCommentId && post.type === "QUESTION" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300" aria-label={t("Accepted by question author")} /> : null}
          {post.tags.slice(0, 3).map((tag) => <Link key={tag} to={`/forum?tag=${encodeURIComponent(tag)}`} className="forum-topic-tag rounded bg-muted/70 px-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">{tag}</Link>)}
        </div>
        {post.content && (viewMode === "expanded" || post.isPinned) ? <p className={cn("forum-topic-preview mt-1 text-sm text-muted-foreground", viewMode === "expanded" ? "line-clamp-2" : "forum-topic-pinned-preview line-clamp-1")}>{stripMarkdown(post.content).slice(0, viewMode === "expanded" ? 280 : 160)}</p> : null}
      </div>
      <div className="forum-topic-metrics text-sm">
        <div className="forum-topic-participants" aria-label={t("Participants")}>
          {post.participants.slice(0, 4).map((participant) => <ForumAuthorPopover key={participant.id} author={participant} className="rounded-full"><ForumAuthorAvatar author={participant} size="xs" /></ForumAuthorPopover>)}
        </div>
        <Link to={forumPostHref(post, "responses-section")} title={`${formatForumNumber(post.replyCount, locale)} ${t("Replies")}`} className="forum-topic-replies text-center tabular-nums hover:text-primary"><span className="font-medium">{compact(post.replyCount)}</span><span className="forum-topic-label">{t("Replies")}</span></Link>
        <span title={`${formatForumNumber(post.viewCount, locale)} ${t("Views")}`} className="forum-topic-views text-center tabular-nums text-muted-foreground"><span>{compact(post.viewCount)}</span><span className="forum-topic-label">{t("Views")}</span></span>
        <span title={t("This was useful to the community.")} className="forum-topic-helpful text-center tabular-nums text-muted-foreground"><ThumbsUp aria-hidden="true" className="mr-1 inline h-3 w-3" /><span>{compact(post.helpfulCount)}</span><span className="forum-topic-label">{t("Helpful")}</span></span>
        <time className="forum-topic-activity whitespace-nowrap text-center tabular-nums text-muted-foreground" dateTime={activityAt} title={new Date(activityAt).toLocaleString(locale)}><span>{formatForumActivityTime(activityAt, locale)}</span><span className="forum-topic-label">{t("Activity")}</span></time>
      </div>
    </article>
  );
}
