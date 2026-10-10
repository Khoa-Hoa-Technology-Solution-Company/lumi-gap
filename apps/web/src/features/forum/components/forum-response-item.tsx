import { orderForumReferences } from "@trend/shared-types";
import { lazy, Suspense, useState } from "react";
import { Check, ChevronDown, Flag, Link2, MoreHorizontal, Pencil, Reply, Shield, Trash2, CornerDownRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ForumCommentView, ForumReferenceView } from "../api/forum.api";
import { ForumAuthorAvatar } from "./forum-author-avatar";
import { ForumAuthorByline } from "./forum-author-byline";
const ForumMarkdown = lazy(() => import("./forum-markdown").then((module) => ({ default: module.ForumMarkdown })));
import { ForumReferenceItem } from "./forum-context-card";
import { formatForumRelativeTime } from "../utils/forum-helpers";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import { ForumReactionPicker } from "./forum-reaction-picker";
import { ForumAuthorPopover } from "./forum-author-popover";
import { ForumEditHistory } from "./forum-edit-history";
import { forumPostHref } from "../utils/forum-helpers";
import { ForumPostLink } from "./forum-post-link";

interface ForumResponseItemProps {
  comment: ForumCommentView;
  isQuestion: boolean;
  isPostOwner: boolean;
  isCommentOwner: boolean;
  isAuthed: boolean;
  canReply: boolean;
  readOnly?: boolean;
  reactionPending?: boolean;
  acceptancePending?: boolean;
  isOP?: boolean;
  linkedGapId?: string;
  ordinal: number;
  onReviewCitation: (reference: ForumReferenceView) => void;
  onReply: (comment: ForumCommentView) => void;
  onEdit: (comment: ForumCommentView) => void;
  onDelete: (id: string) => void;
  onReport: (id: string) => void;
  onModerate?: (id: string) => void;
  onReaction?: (reaction: import("../api/forum.api").ForumReactionName, active: boolean) => void;
  isFollowing?: boolean;
  followPending?: boolean;
  onToggleFollow?: () => void;
  onAccept: () => void;
  onFilterAuthor?: (authorId: string) => void;
  replies?: ForumCommentView[];
  post?: { id: string; publicSlug?: string };
  postNumberForComment?: (commentId: string) => number;
  authorTopicPostCount?: number;
  onJumpToPost?: (postNumber: number) => void;
}
export function ForumResponseItem({ comment, isQuestion, isPostOwner, isCommentOwner, isAuthed, canReply, readOnly, reactionPending = false, acceptancePending = false, isOP = false, linkedGapId, ordinal, onReviewCitation, onReply, onEdit, onDelete, onReport, onModerate, onReaction, onAccept, onFilterAuthor, replies = [], post, postNumberForComment, authorTopicPostCount, onJumpToPost }: ForumResponseItemProps) {
  const { t, language } = useI18n();
  const [repliesExpanded, setRepliesExpanded] = useState(false);
  const active = comment.status === "active";
  const share = async () => {
    const url = new URL(post ? forumPostHref(post, ordinal) : window.location.href, window.location.origin);
    if (!post) url.hash = `comment-${comment.id}`;
    try { await navigator.clipboard.writeText(url.href); toast.success(t("Copied link to clipboard")); } catch { toast.info(url.href); }
  };
  return (
    <article id={`comment-${comment.id}`} tabIndex={-1} data-thread-post className="forum-thread-post scroll-mt-[calc(var(--app-header-height)+1rem)] border-t border-border py-4 outline-none">
      <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-3 sm:grid-cols-[44px_minmax(0,1fr)] sm:gap-x-4">
        <ForumAuthorPopover className="forum-post-avatar" author={comment.author} authorTopicPostCount={authorTopicPostCount} canReply={!readOnly && (!isAuthed || canReply)} onReply={() => onReply(comment)} onFilterPosts={onFilterAuthor ? () => onFilterAuthor(comment.author.id) : undefined}>
          <ForumAuthorAvatar author={comment.author} size="md" />
        </ForumAuthorPopover>
        <div className="contents sm:block sm:min-w-0">
          <header className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <ForumAuthorByline author={comment.author} authorTopicPostCount={authorTopicPostCount} isOP={isOP} onReply={() => onReply(comment)} canReply={!readOnly && (!isAuthed || canReply)} onFilterPosts={onFilterAuthor ? () => onFilterAuthor(comment.author.id) : undefined} />
            <div className="inline-flex max-w-full flex-wrap items-center gap-1"><ForumPostLink post={post ?? { id: comment.postId }} postNumber={ordinal} targetId={`comment-${comment.id}`} onJump={onJumpToPost} title={`${t("Post")} #${ordinal}`} className="forum-post-date py-0.5 text-sm tabular-nums text-muted-foreground hover:text-foreground"><time dateTime={comment.createdAt} title={new Date(comment.createdAt).toLocaleString(language)}>{formatForumRelativeTime(comment.createdAt, language)}</time></ForumPostLink>{active || isCommentOwner || onModerate ? <ForumEditHistory kind="comment" id={comment.id} editedAt={comment.editedAt} /> : null}</div>
          </header>
          {comment.parentCommentId ? <ForumPostLink post={post ?? { id: comment.postId }} postNumber={comment.parentComment?.postNumber ?? postNumberForComment?.(comment.parentCommentId) ?? 2} targetId={`comment-${comment.parentCommentId}`} onJump={onJumpToPost} className="col-span-2 mt-3 inline-flex max-w-full items-center gap-1.5 rounded text-sm text-muted-foreground hover:text-primary"><CornerDownRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />{t("Replying to")} {comment.parentComment?.status === "active" ? comment.parentComment.author.fullName : t("an earlier response")}</ForumPostLink> : null}
          {comment.isAccepted && active ? <p role="status" className="col-span-2 mt-4 flex items-center gap-1.5 text-sm font-medium text-emerald-800 dark:text-emerald-300" title={t("This marks the author's accepted response, not scientific verification.")}><Check aria-hidden="true" className="h-4 w-4 shrink-0" />{t("Accepted by question author")}</p> : null}
          <div className="col-span-2 mt-4 min-w-0">{active ? <Suspense fallback={<p className="min-h-8 animate-pulse rounded bg-muted/30" aria-label={t("Loading response")} />}><ForumMarkdown content={comment.content} references={comment.references} /></Suspense> : <p className="text-sm italic text-muted-foreground">{t("This response was removed by its author.")}</p>}</div>
          {active && comment.references.length ? <section aria-label={t("References")} className="col-span-2 mt-6 min-w-0"><h3 className="mb-3 text-[13px] font-semibold text-muted-foreground">{t("References")}</h3><ol className="space-y-3">{orderForumReferences(comment.content, comment.references).map((reference, index) => <li key={reference.id || index}><ForumReferenceItem reference={reference} index={index + 1} linkedGapId={linkedGapId} onReviewEvidence={onReviewCitation} /></li>)}</ol></section> : null}
          <div role="group" aria-label={t("Response actions")} className="forum-post-actions col-span-2 mt-5 flex flex-wrap items-center gap-x-1 gap-y-2">
            {active ? <>
              {isQuestion && isPostOwner && !readOnly ? <Button type="button" variant="ghost" size="sm" disabled={acceptancePending} onClick={onAccept} className={cn("gap-1.5 text-muted-foreground", comment.isAccepted && "text-emerald-700 dark:text-emerald-300")} title={t("This marks the author's accepted response, not scientific verification.")}><Check aria-hidden="true" className="h-4 w-4" />{t(comment.isAccepted ? "Unaccept response" : "Accept response")}</Button> : null}
            </> : null}
            {active ? <ForumReactionPicker countsOnly target={{ scope: "comment", id: comment.id }} counts={comment.reactionCounts} viewerReactions={comment.viewerReactions} reactionUsers={comment.reactionUsers} isAuthed={isAuthed} disabled={readOnly} pending={reactionPending} onToggle={onReaction ?? (() => undefined)} /> : null}
            {replies.length ? <button type="button" aria-expanded={repliesExpanded} onClick={() => setRepliesExpanded((previous) => !previous)} className="forum-post-reply-count inline-flex items-center gap-1 rounded px-2 py-1 text-sm text-muted-foreground hover:text-foreground">{replies.length} {t(replies.length === 1 ? "reply" : "replies")}<ChevronDown aria-hidden="true" className={cn("h-3 w-3", repliesExpanded && "rotate-180")} /></button> : null}
            <div className="forum-post-action-links ml-auto inline-flex items-center gap-0.5">
            {active ? <ForumReactionPicker triggerOnly counts={comment.reactionCounts} viewerReactions={comment.viewerReactions} reactionUsers={comment.reactionUsers} isAuthed={isAuthed} disabled={readOnly} pending={reactionPending} onToggle={onReaction ?? (() => undefined)} /> : null}
            <Button type="button" variant="ghost" size="icon" onClick={share} aria-label={t("Share response")} title={t("Share response")} className="h-9 w-9 text-muted-foreground"><Link2 aria-hidden="true" className="h-4 w-4" /></Button>
            {active && isAuthed ? <DropdownMenu>
              <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" aria-label={t("More response actions")} title={t("More response actions")}><MoreHorizontal aria-hidden="true" className="h-4 w-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isCommentOwner && !readOnly ? <><DropdownMenuItem onSelect={() => onEdit(comment)}><Pencil aria-hidden="true" className="mr-2 h-4 w-4" />{t("Edit response")}</DropdownMenuItem><DropdownMenuSeparator /></> : null}
                <DropdownMenuItem onSelect={() => onReport(comment.id)}><Flag aria-hidden="true" className="mr-2 h-4 w-4" />{t("Report response")}</DropdownMenuItem>
                {onModerate ? <DropdownMenuItem onSelect={() => onModerate(comment.id)}><Shield aria-hidden="true" className="mr-2 h-4 w-4" />{t("Hide response")}</DropdownMenuItem> : null}
                {isCommentOwner && !readOnly ? <><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onDelete(comment.id)}><Trash2 aria-hidden="true" className="mr-2 h-4 w-4" />{t("Delete response")}</DropdownMenuItem></> : null}
              </DropdownMenuContent>
            </DropdownMenu> : null}
            {active ? <Button type="button" variant="ghost" size="sm" disabled={readOnly || (isAuthed && !canReply)} onClick={() => onReply(comment)} className="gap-1.5 text-muted-foreground"><Reply aria-hidden="true" className="h-4 w-4" />{t("Reply")}</Button> : null}
            </div>
          </div>
          {repliesExpanded ? <div className="col-span-2 mt-3 space-y-3 border-t border-border py-3" aria-label={t("Replies to this post")}>{replies.map((reply) => <ForumPostLink key={reply.id} post={post ?? { id: comment.postId }} postNumber={postNumberForComment?.(reply.id) ?? ordinal} targetId={`comment-${reply.id}`} onJump={onJumpToPost} className="flex items-start gap-2 rounded text-sm hover:bg-muted/40"><ForumAuthorAvatar author={reply.author} size="xs" /><span><strong className="font-semibold">{reply.author.fullName}</strong><span className="mt-1 block line-clamp-2 text-muted-foreground">{reply.content}</span></span></ForumPostLink>)}</div> : null}
        </div>
      </div>
    </article>
  );
}
