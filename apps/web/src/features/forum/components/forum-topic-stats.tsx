import { useMemo, useState } from "react";
import { ChevronDown, Clock3, Eye, Heart, Link2, MessageSquare, Sparkles, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useI18n } from "@/i18n";
import type { ForumCommentView, ForumPostView } from "../api/forum.api";
import { formatForumNumber, formatForumRelativeTime, forumPostHref } from "../utils/forum-helpers";
import { ForumAuthorAvatar } from "./forum-author-avatar";
import { ForumAuthorPopover } from "./forum-author-popover";
import { ForumPostLink } from "./forum-post-link";
import { ForumStatPopover } from "./forum-stat-popover";
import { ForumViewsPopoverContent } from "./forum-views-popover";
import { ForumReactorsPopover } from "./forum-reactors-popover";
import { FORUM_REACTIONS } from "../utils/forum-reactions";
import type { ForumReactionName } from "../api/forum.api";

function excerpt(content: string, limit = 300) {
  const text = content.replace(/```[\s\S]*?```/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[#*>`~_]/g, "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  const sentence = text.slice(0, limit).match(/^.*[.!?](?:\s|$)/)?.[0];
  return sentence?.trim() || `${text.slice(0, limit).replace(/\s\S*$/, "")}…`;
}

export function ForumTopicStats({ post, comments, hasMore, onLoadMore, loadingMore, onFilterAuthor, onJumpToPost, compact = false }: {
  post: ForumPostView;
  comments: ForumCommentView[];
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  onFilterAuthor?: (authorId: string) => void;
  onJumpToPost?: (postNumber: number) => void;
  compact?: boolean;
}) {
  const { t, language } = useI18n();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const highlights = useMemo(() => comments.filter((comment) => comment.status === "active").sort((a, b) => Object.values(b.reactionCounts ?? {}).reduce((sum, count) => sum + count, 0) - Object.values(a.reactionCounts ?? {}).reduce((sum, count) => sum + count, 0)).slice(0, 3).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [comments]);
  const reactions = post.reactionCount ?? (Object.values(post.reactionCounts ?? {}).reduce((sum, value) => sum + value, 0) + comments.filter((comment) => comment.status === "active").reduce((sum, comment) => sum + Object.values(comment.reactionCounts ?? {}).reduce((inner, value) => inner + value, 0), 0));
  const words = [post.content, ...comments.filter((comment) => comment.status === "active").map((comment) => comment.content)].join(" ").trim().split(/\s+/).length;
  const readingTime = post.readingTimeMinutes ?? Math.max(1, Math.ceil(words / 220));
  const topicReactionCounts = Object.fromEntries(FORUM_REACTIONS.map(({ value }) => [value, (post.reactionCounts?.[value] ?? 0) + comments.reduce((sum, comment) => sum + (comment.status === "active" ? comment.reactionCounts?.[value] ?? 0 : 0), 0)])) as Record<ForumReactionName, number>;
  const firstReply = comments.find((comment) => comment.status === "active");
  const participantCount = post.participantCount ?? post.participants.length;
  const linkCount = post.linkCount ?? post.references.length;
  const lastActivityAt = post.lastActivityAt ?? post.createdAt;
  const authorTopicPostCount = (authorId: string) => hasMore ? undefined : (post.author.id === authorId ? 1 : 0) + comments.filter((comment) => comment.author.id === authorId).length;

  return <section aria-label={t(compact ? "Discussion overview" : "Discussion statistics")} className="forum-topic-stats">
    <div className="forum-topic-stats-row">
      {!compact ? <ul className="forum-topic-stats-metrics">
        <li><ForumPostLink post={post} postNumber={firstReply?.postNumber ?? 1} targetId={firstReply ? `comment-${firstReply.id}` : "responses-section"} onJump={firstReply ? onJumpToPost : undefined} className="forum-topic-stat"><MessageSquare aria-hidden="true" className="h-3.5 w-3.5 text-amber-600 dark:text-amber-300" /><span><strong className="forum-topic-stat-value">{formatForumNumber(post.replyCount, language)}</strong> {t(post.replyCount === 1 ? "reply" : "replies")}</span></ForumPostLink></li>
        <li><ForumStatPopover triggerClassName="forum-topic-stat" title={t("Recent views")} label={t("Recent views")} className="forum-views-popover" trigger={<>
          <Eye aria-hidden="true" className="h-3.5 w-3.5 text-sky-600 dark:text-sky-300" /><span><strong className="forum-topic-stat-value">{formatForumNumber(post.viewCount, language)}</strong> {t("Views")}</span>
        </>}><ForumViewsPopoverContent postId={post.id} /></ForumStatPopover></li>
        <li><ForumReactorsPopover target={{ scope: "topic", id: post.id }} counts={topicReactionCounts} triggerClassName="forum-topic-stat" title={t("Who reacted")} trigger={<>
          <Heart aria-hidden="true" className="h-3.5 w-3.5 text-rose-600 dark:text-rose-300" /><span><strong className="forum-topic-stat-value">{formatForumNumber(reactions, language)}</strong> {t("Reactions")}</span>
        </>} /></li>
        {linkCount > 0 ? <li><span className="forum-topic-stat"><Link2 aria-hidden="true" className="h-3.5 w-3.5 text-violet-600 dark:text-violet-300" /><span><strong className="forum-topic-stat-value">{formatForumNumber(linkCount, language)}</strong> {t("Links")}</span></span></li> : null}
      </ul> : <span className="forum-topic-reading-time"><Clock3 aria-hidden="true" className="h-3.5 w-3.5" />{readingTime} {t("min")} {t("read")}</span>}
      <button type="button" onClick={() => setSummaryOpen((previous) => !previous)} aria-expanded={summaryOpen} className="forum-topic-summary-button"><Sparkles className="h-4 w-4" aria-hidden="true" />{t(summaryOpen ? "Show full discussion" : "Summarize")}</button>
    </div>
    {!compact ? <div className="forum-topic-stats-meta">
      <div className="forum-topic-stat-participants" aria-label={t("Participants")}>
        <span><strong className="font-medium text-foreground">{formatForumNumber(participantCount, language)}</strong> {t("Participants")}</span>
        <div className="forum-topic-participant-avatars">{post.participants.map((author) => <ForumAuthorPopover key={author.id} author={author} authorTopicPostCount={authorTopicPostCount(author.id)} onFilterPosts={onFilterAuthor ? () => onFilterAuthor(author.id) : undefined}><ForumAuthorAvatar author={author} size="xs" /></ForumAuthorPopover>)}</div>
      </div>
      <span className="forum-topic-last-activity">{t("Last activity")}: <time dateTime={lastActivityAt} title={new Date(lastActivityAt).toLocaleString(language)}>{formatForumRelativeTime(lastActivityAt, language)}</time></span>
      <span className="forum-topic-reading-time"><Clock3 aria-hidden="true" className="h-3.5 w-3.5" />{readingTime} {t("min")} {t("read")}</span>
    </div> : null}
    {summaryOpen ? <div className="forum-topic-summary" role="region" aria-label={t("Discussion summary")}>
      <div className="mb-4 flex items-start justify-between gap-3"><div><h3 className="font-semibold">{t("Discussion summary")}</h3><p className="mt-1 text-xs text-muted-foreground">{t("Excerpts from the opening post and the most reacted-to replies.")}</p></div><button type="button" aria-label={t("Close summary")} onClick={() => setSummaryOpen(false)} className="rounded p-1 hover:bg-muted"><X className="h-4 w-4" /></button></div>
      <ol className="space-y-4">{[{ id: "opening-post", number: 1, author: post.author, content: post.content }, ...highlights.map((comment) => ({ ...comment, number: comment.postNumber ?? comments.findIndex((row) => row.id === comment.id) + 2, id: `comment-${comment.id}` }))].map((item) => <li key={item.id}><ForumPostLink post={post} postNumber={item.number} targetId={item.id} onJump={onJumpToPost} className="text-sm font-semibold hover:text-primary">{item.author.fullName}</ForumPostLink><p className="mt-1 text-sm leading-relaxed">{excerpt(item.content)}</p><ForumPostLink post={post} postNumber={item.number} targetId={item.id} onJump={onJumpToPost} className="mt-1 inline-block text-xs text-primary hover:underline">{t("Read full post")}</ForumPostLink></li>)}</ol>
      {hasMore ? <button type="button" disabled={loadingMore} onClick={onLoadMore} className="mt-4 inline-flex items-center gap-1 text-sm text-primary"><ChevronDown className="h-4 w-4" />{t("Load more replies to include them in the summary")}</button> : null}
      {post.references.length ? <Link to={forumPostHref(post, 1)} className="mt-3 inline-block text-xs text-primary">{t("References")}: {post.references.length}</Link> : null}
    </div> : null}
  </section>;
}
