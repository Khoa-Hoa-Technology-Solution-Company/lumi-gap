import { Check, Flag, Link2, MoreHorizontal, Pencil, Reply, Shield, ThumbsUp, Trash2, CornerDownRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ForumCommentView, ForumReferenceView } from "../api/forum.api";
import { ForumAuthorAvatar } from "./forum-author-avatar";
import { ForumAuthorByline } from "./forum-author-byline";
import { ForumMarkdown } from "./forum-markdown";
import { ForumReferenceItem } from "./forum-context-card";
import { formatForumRelativeTime } from "../utils/forum-helpers";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";

interface ForumResponseItemProps {
  comment: ForumCommentView;
  isQuestion: boolean;
  isPostOwner: boolean;
  isCommentOwner: boolean;
  isAuthed: boolean;
  canReply: boolean;
  readOnly?: boolean;
  votePending?: boolean;
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
  onVote: (value: -1 | 0 | 1) => void;
  onAccept: () => void;
}
export function ForumResponseItem({ comment, isQuestion, isPostOwner, isCommentOwner, isAuthed, canReply, readOnly, votePending = false, acceptancePending = false, isOP = false, linkedGapId, ordinal, onReviewCitation, onReply, onEdit, onDelete, onReport, onModerate, onVote, onAccept }: ForumResponseItemProps) {
  const { t, language } = useI18n();
  const active = comment.status === "active";
  const share = async () => {
    const url = new URL(window.location.href); url.hash = `comment-${comment.id}`;
    try { await navigator.clipboard.writeText(url.href); toast.success(t("Copied link to clipboard")); } catch { toast.info(url.href); }
  };
  return (
    <article id={`comment-${comment.id}`} tabIndex={-1} data-thread-post className="scroll-mt-[calc(var(--app-header-height)+1rem)] border-t border-border py-7 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:py-8">
      <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-3 sm:grid-cols-[44px_minmax(0,1fr)] sm:gap-x-4">
        <ForumAuthorAvatar author={comment.author} size="md" />
        <div className="contents sm:block sm:min-w-0">
          <header className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <ForumAuthorByline author={comment.author} isOP={isOP} />
            <a href={`#comment-${comment.id}`} className="py-1 text-sm tabular-nums text-muted-foreground hover:text-foreground"><time dateTime={comment.createdAt} title={new Date(comment.createdAt).toLocaleString(language)}>{formatForumRelativeTime(comment.createdAt, language)}</time> · #{ordinal}{comment.editedAt ? " · " + t("Edited") : ""}</a>
          </header>
          {comment.parentCommentId ? <a href={`#comment-${comment.parentCommentId}`} className="col-span-2 mt-3 inline-flex max-w-full items-center gap-1.5 rounded text-sm text-muted-foreground hover:text-primary"><CornerDownRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />{t("Replying to")} {comment.parentComment?.status === "active" ? comment.parentComment.author.fullName : t("an earlier response")}</a> : null}
          {comment.isAccepted && active ? <p role="status" className="col-span-2 mt-4 flex items-center gap-1.5 text-sm font-medium text-emerald-800 dark:text-emerald-300" title={t("This marks the author's accepted response, not scientific verification.")}><Check aria-hidden="true" className="h-4 w-4 shrink-0" />{t("Accepted by question author")}</p> : null}
          <div className="col-span-2 mt-4 min-w-0">{active ? <ForumMarkdown content={comment.content} /> : <p className="text-sm italic text-muted-foreground">{t("This response was removed by its author.")}</p>}</div>
          {active && comment.references.length ? <section aria-label={t("References")} className="col-span-2 mt-6 min-w-0"><h3 className="mb-3 text-[13px] font-semibold text-muted-foreground">{t("References")}</h3><ol className="space-y-3">{comment.references.map((reference, index) => <li key={reference.id || index}><ForumReferenceItem reference={reference} index={index + 1} linkedGapId={linkedGapId} onReviewEvidence={onReviewCitation} /></li>)}</ol></section> : null}
          <div className="forum-post-actions col-span-2 mt-5 flex flex-wrap items-center gap-1">
            {active ? <>
              <Button type="button" variant="ghost" size="sm" disabled={!isAuthed || readOnly || votePending} aria-pressed={comment.viewerVote === 1} onClick={() => onVote(comment.viewerVote === 1 ? 0 : 1)} className={cn("-ml-2 gap-1.5 text-muted-foreground", comment.viewerVote === 1 && "text-primary")} title={t("Helpful reflects community usefulness, not scientific validation.")}><ThumbsUp aria-hidden="true" className="h-4 w-4" />{t("Helpful")} <span className="tabular-nums">{comment.helpfulCount}</span></Button>
              <Button type="button" variant="ghost" size="sm" disabled={!canReply} onClick={() => onReply(comment)} className="gap-1.5 text-muted-foreground"><Reply className="h-4 w-4" />{t("Reply")}</Button>
              {isQuestion && isPostOwner && !readOnly ? <Button type="button" variant="ghost" size="sm" disabled={acceptancePending} onClick={onAccept} className={cn("gap-1.5 text-muted-foreground", comment.isAccepted && "text-emerald-700 dark:text-emerald-300")} title={t("This marks the author's accepted response, not scientific verification.")}><Check aria-hidden="true" className="h-4 w-4" />{t(comment.isAccepted ? "Unaccept response" : "Accept response")}</Button> : null}
            </> : null}
            <Button type="button" variant="ghost" size="sm" onClick={share} aria-label={t("Share response")} title={t("Share response")} className="text-muted-foreground"><Link2 className="h-4 w-4" /></Button>
            {active && isAuthed ? <DropdownMenu>
              <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" aria-label={t("More response actions")} title={t("More response actions")}><MoreHorizontal aria-hidden="true" className="h-4 w-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isCommentOwner && !readOnly ? <><DropdownMenuItem onSelect={() => onEdit(comment)}><Pencil aria-hidden="true" className="mr-2 h-4 w-4" />{t("Edit response")}</DropdownMenuItem><DropdownMenuSeparator /></> : null}
                <DropdownMenuItem onSelect={() => onReport(comment.id)}><Flag aria-hidden="true" className="mr-2 h-4 w-4" />{t("Report response")}</DropdownMenuItem>
                {onModerate ? <DropdownMenuItem onSelect={() => onModerate(comment.id)}><Shield aria-hidden="true" className="mr-2 h-4 w-4" />{t("Hide response")}</DropdownMenuItem> : null}
                {isCommentOwner && !readOnly ? <><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onDelete(comment.id)}><Trash2 aria-hidden="true" className="mr-2 h-4 w-4" />{t("Delete response")}</DropdownMenuItem></> : null}
              </DropdownMenuContent>
            </DropdownMenu> : null}
          </div>
        </div>
      </div>
    </article>
  );
}
