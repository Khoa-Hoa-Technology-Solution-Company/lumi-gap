import { Link } from "react-router-dom";
import { CheckCircle2, Compass, FileText, Heart, Pin } from "lucide-react";
import type { ForumPostView } from "../api/forum.api";
import { ForumAuthorAvatar } from "./forum-author-avatar";
import { ForumAuthorByline } from "./forum-author-byline";
import { ForumPostTypeBadge } from "./forum-post-type-badge";
import { ForumAuthorPopover } from "./forum-author-popover";
import { formatForumActivityTime, formatForumCompactNumber, formatForumNumber, forumPostHref, stripMarkdown } from "../utils/forum-helpers";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";

interface ForumCardProps {
  post: ForumPostView;
  locale: string;
  isAuthed?: boolean;
  onVote?: (value: -1 | 0 | 1) => void;
}

export function ForumCard({ post, locale }: ForumCardProps) {
  const { t } = useI18n();
  const excerpt = stripMarkdown(post.content);
  const compact = (value: number) => formatForumCompactNumber(value, locale);
  const activityAt = post.lastActivityAt ?? post.updatedAt ?? post.createdAt;
  const reactionTotal = post.reactionCount ?? Object.values(post.reactionCounts ?? {}).reduce((sum, value) => sum + value, 0);
  const researchContext = post.linkedResearchGap?.title
    ? {
        href: `/research-gaps?gapId=${encodeURIComponent(post.linkedResearchGap.id)}`,
        label: t("Research gap"),
        title: post.linkedResearchGap.title,
        icon: Compass,
        meta: undefined,
      }
    : post.linkedPaper?.title
      ? {
          href: `/papers/${encodeURIComponent(post.linkedPaper.id)}`,
          label: t("Paper"),
          title: post.linkedPaper.title,
          icon: FileText,
          meta: post.linkedPaper.publicationYear ? String(post.linkedPaper.publicationYear) : undefined,
        }
      : undefined;

  return (
    <article className={cn("forum-topic-row group grid transition-colors hover:bg-muted/40", post.isPinned && "forum-topic-row-pinned bg-amber-50/35 dark:bg-amber-950/10")}>
      <ForumAuthorPopover author={post.author} className="forum-topic-mobile-avatar"><ForumAuthorAvatar author={post.author} size="md" /></ForumAuthorPopover>
      <div className="forum-topic-copy min-w-0">
        <Link to={forumPostHref(post)} className="block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <h2 className="forum-topic-title break-words font-semibold leading-[1.35] tracking-[-0.012em] text-foreground group-hover:text-primary">{post.title}</h2>
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-5 text-muted-foreground">
          {post.community ? <Link to={`/communities/${post.community.slug}`} onClick={(event) => event.stopPropagation()} className="font-medium text-slate-700 hover:text-blue-700 dark:text-slate-200 dark:hover:text-blue-300">{post.community.name}</Link> : <span>{t("General forum")}</span>}
          <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">·</span>
          <ForumPostTypeBadge type={post.type} size="sm" showIcon={false} className="border-0 px-0 py-0 text-sm" />
          {post.isPinned ? <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300"><Pin className="h-3 w-3" />{t("Pinned")}</span> : null}
          {post.acceptedCommentId ? <span className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-300" aria-label={t("Accepted by question author")} title={t("This marks the author's accepted response, not scientific verification.")}><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /><span className="forum-topic-accepted-label" aria-hidden="true">{t("Accepted by question author")}</span></span> : null}
        </div>

        {excerpt ? <p className="forum-topic-excerpt mt-2 line-clamp-2 text-base leading-6 text-muted-foreground">{excerpt}</p> : null}

        {researchContext ? (
          <Link
            to={researchContext.href}
            className="forum-topic-context mt-3 flex min-w-0 items-start gap-2 rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2 text-sm transition-colors hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-blue-900/70 dark:bg-blue-950/30 dark:hover:border-blue-800 dark:hover:bg-blue-950/50"
          >
            <researchContext.icon className="mt-0.5 h-4 w-4 shrink-0 text-blue-700 dark:text-blue-300" />
            <span className="min-w-0">
              <span className="mr-2 font-medium text-blue-800 dark:text-blue-200">{researchContext.label}</span>
              <span className="text-slate-700 dark:text-slate-200">{researchContext.title}</span>
              {researchContext.meta ? <span className="ml-2 whitespace-nowrap text-muted-foreground">{researchContext.meta}</span> : null}
            </span>
          </Link>
        ) : null}

        <div className="forum-topic-byline mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-center gap-2">
            <ForumAuthorPopover author={post.author}>
              <ForumAuthorAvatar author={post.author} size="xs" />
            </ForumAuthorPopover>
            <ForumAuthorByline author={post.author} compact />
          </div>
          {post.tags.length ? <span className="min-w-0 truncate text-sm text-muted-foreground">{post.tags.slice(0, 3).map((tag) => `#${tag}`).join("  ")}</span> : null}
        </div>
      </div>

      <div className="forum-topic-metrics text-base">
        <div className="forum-topic-participants -space-x-2" aria-label={t("Participants")}>
          {post.participants.slice(0, 5).map((participant) => <ForumAuthorPopover key={participant.id} author={participant}><ForumAuthorAvatar author={participant} size="sm" className="ring-2 ring-white dark:ring-slate-950" /></ForumAuthorPopover>)}
        </div>
        <Link to={forumPostHref(post, "responses-section")} title={`${formatForumNumber(post.replyCount, locale)} ${t("Replies")}`} className="forum-topic-replies text-center tabular-nums text-slate-600 hover:text-blue-700 dark:text-slate-300 dark:hover:text-blue-300"><span className="block font-medium text-slate-900 dark:text-slate-100">{compact(post.replyCount)}</span><span className="forum-topic-label text-sm">{t("Replies")}</span></Link>
        <span title={`${formatForumNumber(post.viewCount, locale)} ${t("Views")}`} className="forum-topic-views text-center tabular-nums text-slate-600 dark:text-slate-300"><span className="block font-medium text-slate-900 dark:text-slate-100">{compact(post.viewCount)}</span><span className="forum-topic-label text-sm">{t("Views")}</span></span>
        <span title={`${formatForumNumber(reactionTotal, locale)} ${t("Reactions")}`} className="forum-topic-helpful text-center tabular-nums text-slate-600 dark:text-slate-300"><span className="block font-medium text-slate-900 dark:text-slate-100"><Heart aria-hidden="true" className="mr-1 inline h-3.5 w-3.5 text-rose-500" />{compact(reactionTotal)}</span><span className="forum-topic-label text-sm">{t("Reactions")}</span></span>
        <time className="forum-topic-activity whitespace-nowrap text-center font-medium tabular-nums text-slate-600 dark:text-slate-300" dateTime={activityAt} title={new Date(activityAt).toLocaleString(locale)}><span className="block">{formatForumActivityTime(activityAt, locale)}</span><span className="forum-topic-label text-sm font-normal">{t("Activity")}</span></time>
      </div>
    </article>
  );
}
