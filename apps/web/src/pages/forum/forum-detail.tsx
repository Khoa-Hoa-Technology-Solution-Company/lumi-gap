import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Bell, BellOff, EyeOff, Flag, Link2, Lock, MessageSquare, Pencil, Pin, Reply, ThumbsUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  forumApi,
  ForumAuthorAvatar,
  ForumComposer,
  ForumMarkdown,
  ForumReferenceItem,
  ForumResponseItem,
  ForumSidebar,
  ForumLayout,
  ForumSurface,
  useAcceptAnswer,
  useAddForumComment,
  useDeleteForumComment,
  useDeleteForumPost,
  useFollowThread,
  useForumComments,
  useForumContext,
  useCommunities,
  useForumPost,
  useForumVote,
  useModerateForumContent,
  useUnacceptAnswer,
  useUpdateForumComment,
  useUpdateForumPost,
  type ForumCommentView,
  type ForumReferenceView,
  forumGapCopy,
} from "@/features/forum";
import { formatForumNumber, formatForumRelativeTime, forumPostHref } from "@/features/forum/utils/forum-helpers";
import {
  useForumCitationEvidenceOptions,
  useReviewForumCitationAsEvidence,
} from "@/features/gaps/hooks/use-gaps";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/utils/cn";
import { ForumAuthorByline } from "@/features/forum/components/forum-author-byline";
import { ForumThreadTimeline } from "@/features/forum/components/forum-thread-timeline";

export function ForumDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { t, language } = useI18n();

  const postQuery = useForumPost(id);
  const commentsQuery = useForumComments(id);

  const add = useAddForumComment();
  const vote = useForumVote();
  const accept = useAcceptAnswer();
  const unaccept = useUnacceptAnswer();
  const follow = useFollowThread();
  const moderate = useModerateForumContent();
  const reviewCitation = useReviewForumCitationAsEvidence();
  const updatePost = useUpdateForumPost();
  const deletePost = useDeleteForumPost();
  const updateComment = useUpdateForumComment();
  const deleteComment = useDeleteForumComment();

  const currentUser = useAuthStore((state) => state.user);
  const isAuthed = useAuthStore((state) => Boolean(state.tokens?.accessToken));

  const [replyTo, setReplyTo] = useState<ForumCommentView>();
  const [reportTarget, setReportTarget] = useState<{ type: "post" | "comment"; id: string }>();
  const [reportReason, setReportReason] = useState("OFF_TOPIC");
  const [reportDescription, setReportDescription] = useState("");
  const [focusRequest, setFocusRequest] = useState(0);
  const [postedComments, setPostedComments] = useState<Array<{ postId: string; comment: ForumCommentView }>>([]);
  const [focusCommentId, setFocusCommentId] = useState<string>();

  const [moderationTarget, setModerationTarget] = useState<{
    type: "post" | "comment";
    id: string;
    action: "THREAD_HIDDEN" | "RESPONSE_HIDDEN";
  }>();
  const [moderationReason, setModerationReason] = useState("");

  const [postEditorOpen, setPostEditorOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editTags, setEditTags] = useState("");

  const [editComment, setEditComment] = useState<ForumCommentView>();
  const [editCommentContent, setEditCommentContent] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<{ type: "post" | "comment"; id: string }>();

  const [reviewTarget, setReviewTarget] = useState<ForumReferenceView>();
  const [reviewRelation, setReviewRelation] = useState<"SUPPORTING" | "COUNTER" | "RELATED">(
    "COUNTER"
  );
  const [reviewExplanation, setReviewExplanation] = useState("");
  const [selectedEvidenceTypes, setSelectedEvidenceTypes] = useState<string[]>([]);

  const { data: context } = useForumContext(undefined, isAuthed);
  const { data: communities, isLoading: communitiesLoading, isError: communitiesError, refetch: retryCommunities } = useCommunities();

  const post = postQuery.data;
  const comments = useMemo(() => {
    const byId = new Map<string, ForumCommentView>();
    for (const row of postedComments) if (row.postId === id) byId.set(row.comment.id, row.comment);
    for (const page of commentsQuery.data?.pages ?? []) for (const comment of page.data) byId.set(comment.id, comment);
    return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }, [commentsQuery.data, postedComments, id]);
  const timelineIds = useMemo(() => ["opening-post", ...comments.map((comment) => `comment-${comment.id}`)], [comments]);
  useEffect(() => {
    const fetchedIds = new Set(commentsQuery.data?.pages.flatMap((page) => page.data.map((comment) => comment.id)));
    setPostedComments((previous) => previous.some((row) => row.postId === id && fetchedIds.has(row.comment.id)) ? previous.filter((row) => row.postId !== id || !fetchedIds.has(row.comment.id)) : previous);
  }, [commentsQuery.data, id]);
  useEffect(() => { setReplyTo(undefined); setFocusCommentId(undefined); }, [id]);
  useEffect(() => {
    if (post?.publicSlug && id !== post.publicSlug) navigate(`${forumPostHref(post)}${window.location.hash}`, { replace: true });
  }, [id, navigate, post?.publicSlug]);
  useEffect(() => {
    if (!focusCommentId) return;
    const element = document.getElementById(`comment-${focusCommentId}`);
    if (element) {
      element.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      element.focus({ preventScroll: true });
      setFocusCommentId(undefined);
    }
  }, [focusCommentId, comments]);
  const evidenceOptions = useForumCitationEvidenceOptions(
    post?.linkedResearchGapId,
    reviewTarget?.id
  );

  if (postQuery.isLoading) {
    return (
      <ForumLayout sidebar={<ForumSidebar communities={communities} isAuthed={isAuthed} />}><ForumSurface className="p-6">
        <div className="h-6 w-48 animate-pulse rounded bg-muted" />
        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(0,820px)_240px]">
          <div className="space-y-6">
            <div className="h-48 animate-pulse rounded-xl bg-muted/50" />
            <div className="h-32 animate-pulse rounded-xl bg-muted/40" />
          </div>
          <div className="h-64 animate-pulse rounded-xl bg-muted/40" />
        </div>
      </ForumSurface></ForumLayout>
    );
  }

  if (!post) {
    return (
      <ForumLayout sidebar={<ForumSidebar communities={communities} isAuthed={isAuthed} />}><ForumSurface className="px-4 py-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <MessageSquare className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
          {t("Discussion unavailable")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("This discussion may be private, hidden, or no longer available.")}
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/forum">{t("Back to Forum")}</Link>
        </Button>
      </ForumSurface></ForumLayout>
    );
  }

  const isOwner = currentUser?.id === post.author.id;
  const locked = post.status === "locked";
  const removed = post.status === "deleted";
  const isPostUpvoted = post.viewerVote === 1;
  const canReply = isAuthed && post.canReply && !locked && !removed && post.status === "active";

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(t("Copied link to clipboard"));
    } catch {
      toast.info(window.location.href);
    }
  };

  const openComposer = (target?: ForumCommentView) => {
    if (!canReply || add.isPending) return;
    setReplyTo(target);
    setFocusRequest((value) => value + 1);
    document.getElementById("response-composer")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  };

  const handleCreateComment = async (data: { content: string; parentCommentId?: string; references: ForumReferenceView[] }) => {
    // Do not catch here: the shared composer owns inline errors and draft retention.
    const created = await add.mutateAsync({ postId: post.id, ...data });
    setPostedComments((previous) => [...previous, { postId: id, comment: created }]);
    setReplyTo(undefined);
    setFocusCommentId(created.id);
    toast.success(t("Response posted"));
  };

  async function submitReport() {
    if (!reportTarget) return;
    try {
      await forumApi.report(
        reportTarget.type,
        reportTarget.id,
        reportReason,
        reportDescription || undefined
      );
      toast.success(t("Report submitted for moderator review."));
      setReportTarget(undefined);
      setReportDescription("");
    } catch {
      toast.error(t("This content could not be reported, or you already reported it."));
    }
  }

  async function submitModeration() {
    if (!moderationTarget || moderationReason.trim().length < 3) return;
    try {
      await moderate.mutateAsync({
        targetType: moderationTarget.type,
        targetId: moderationTarget.id,
        action: moderationTarget.action,
        reason: moderationReason.trim(),
      });
      toast.success(t("Content hidden from the forum"));
      setModerationTarget(undefined);
      setModerationReason("");
    } catch {
      toast.error(t("Could not complete the moderation action."));
    }
  }

  async function savePostEdit() {
    if (!post || editTitle.trim().length < 3 || !editContent.trim()) return;
    try {
      await updatePost.mutateAsync({
        postId: post.id,
        input: {
          title: editTitle.trim(),
          content: editContent.trim(),
          tags: editTags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        },
      });
      setPostEditorOpen(false);
      toast.success(t("Discussion updated"));
    } catch {
      toast.error(t("Could not update this discussion."));
    }
  }

  async function saveCommentEdit() {
    if (!post || !editComment || !editCommentContent.trim()) return;
    try {
      await updateComment.mutateAsync({
        postId: post.id,
        commentId: editComment.id,
        content: editCommentContent.trim(),
      });
      setEditComment(undefined);
      toast.success(t("Response updated"));
    } catch {
      toast.error(t("Could not update this response."));
    }
  }

  async function confirmDelete() {
    if (!post || !deleteTarget) return;
    try {
      if (deleteTarget.type === "post") {
        await deletePost.mutateAsync(post.id);
        toast.success(t("Discussion removed"));
        navigate("/forum", { replace: true });
      } else {
        await deleteComment.mutateAsync({ postId: post.id, commentId: deleteTarget.id });
        toast.success(t("Response removed"));
        setDeleteTarget(undefined);
      }
    } catch {
      toast.error(t("Could not remove this content."));
    }
  }

  async function submitEvidenceReview() {
    if (!post?.linkedResearchGapId || !reviewTarget?.id) return;
    try {
      const result = await reviewCitation.mutateAsync({
        gapId: post.linkedResearchGapId,
        referenceId: reviewTarget.id,
        payload: {
          screeningStatus: "INCLUDED",
          relation: reviewRelation,
          evidenceSelections: (evidenceOptions.data?.extractedEvidence ?? [])
            .filter((item) => selectedEvidenceTypes.includes(item.evidenceType))
            .map((item) => ({
              evidenceType: item.evidenceType,
              excerpt: item.excerpt,
            })),
          explanation: reviewExplanation.trim() || undefined,
          confirmRelation: true,
        },
      });
      toast.success(t(result?.message ?? "Citation reviewed through the formal evidence workflow."));
      setReviewTarget(undefined);
      setSelectedEvidenceTypes([]);
      setReviewExplanation("");
    } catch (error: any) {
      toast.error(
        error.response?.data?.error?.message ?? t("Could not review this citation as evidence.")
      );
    }
  }

  return (
    <ForumLayout
      sidebar={<ForumSidebar communities={communities} communitiesLoading={communitiesLoading} communitiesError={communitiesError} onRetryCommunities={() => void retryCommunities()} isAuthed={isAuthed} />}
    >
        <ForumSurface className="px-5 pb-8 pt-5 sm:px-7 sm:pt-6">
          <div className="mx-auto grid max-w-[1060px] grid-cols-[minmax(0,1fr)] gap-8 xl:grid-cols-[minmax(0,900px)_112px]">
            <div className="min-w-0">
              <nav aria-label={t("Breadcrumb")} className="mb-5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Link to="/forum" className="inline-flex items-center gap-1.5 hover:text-primary"><ArrowLeft className="h-3.5 w-3.5" />{t("Forum")}</Link>
                {post.community ? <><span aria-hidden="true">/</span><Link to={`/forum?community=${post.community.id}`} className="hover:text-primary">{post.community.name}</Link></> : null}
              </nav>
              <header className="pb-7">
                <h1 className="max-w-full break-words text-[26px] font-bold leading-[1.24] tracking-[-0.025em] text-foreground sm:text-[32px]">{post.title}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-muted-foreground">
                  <span>{t(post.type === "QUESTION" ? "Question" : post.type === "PAPER_DISCUSSION" ? "Paper Discussion" : post.type === "RESEARCH_GAP_DISCUSSION" ? "Research Gap Discussion" : "Discussion")}</span>
                  {post.community ? <><span>·</span><Link to={`/forum?community=${post.community.id}`} className="hover:text-primary">{post.community.name}</Link></> : null}
                  {post.isPinned ? <span className="inline-flex items-center gap-1"><Pin className="h-3.5 w-3.5" />{t("Pinned")}</span> : null}
                  {locked ? <span className="inline-flex items-center gap-1"><Lock className="h-3.5 w-3.5" />{t("Locked")}</span> : null}
                </div>
                <p className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-sm text-muted-foreground tabular-nums">
                  <span>{formatForumNumber(post.replyCount, language)} {t("replies")}</span><span>·</span><span>{formatForumNumber(post.viewCount, language)} {t("views")}</span><span>·</span><span>{formatForumNumber(post.helpfulCount, language)} {t("helpful")}</span><span>·</span><span>{t("active")} {formatForumRelativeTime(post.lastActivityAt ?? post.createdAt, language)}</span>
                </p>
              </header>
              {locked ? <div role="status" className="mb-6 flex gap-3 rounded-md border border-border bg-muted/30 p-4"><Lock className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="text-sm font-semibold">{t("This discussion is locked.")}</p><p className="mt-1 text-sm text-muted-foreground">{t("Existing responses remain visible, but new replies cannot be added.")}</p></div></div> : null}
              {removed || post.status === "hidden" ? <p role="status" className="mb-5 text-sm text-muted-foreground">{t(removed ? "This discussion was removed. Existing responses remain visible." : "This discussion is hidden from the forum.")}</p> : null}
              <article id="opening-post" data-thread-post tabIndex={-1} className="scroll-mt-[calc(var(--app-header-height)+1rem)] border-t border-border py-7 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:py-8">
                <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-3 sm:grid-cols-[44px_minmax(0,1fr)] sm:gap-x-4">
                  <ForumAuthorAvatar author={post.author} size="md" />
                  <div className="min-w-0">
                    <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                      <ForumAuthorByline author={post.author} />
                      <time dateTime={post.createdAt} title={new Date(post.createdAt).toLocaleString(language)} className="py-1 text-sm text-muted-foreground">{formatForumRelativeTime(post.createdAt, language)} · #1{post.editedAt ? " · " + t("Edited") : ""}</time>
                    </header>
                    <div className="mt-5"><ForumMarkdown content={post.content} /></div>
                    {post.linkedPaper || post.linkedResearchGap || post.linkedProject ? <section aria-label={t("Linked research context")} className="mt-6 space-y-4 rounded-md border border-border bg-muted/20 px-4 py-4">
                      {post.linkedPaper ? <div><p className="mb-1 text-[13px] font-medium text-muted-foreground">{t("Linked Paper")}</p><Link to={`/papers/${post.linkedPaper.id}`} className="text-[15px] font-medium text-foreground hover:text-primary">{post.linkedPaper.title}</Link><div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">{post.linkedPaper.publicationYear ? <span>{post.linkedPaper.publicationYear}</span> : null}{post.linkedPaper.doi ? <span className="break-all">DOI: {post.linkedPaper.doi}</span> : null}<Link to={`/papers/${post.linkedPaper.id}`} className="text-primary hover:underline">{t("View paper")}</Link></div></div> : null}
                      {post.linkedResearchGap ? <div><p className="mb-1 text-xs font-medium text-muted-foreground">{t("Linked Candidate Research Gap")}</p><p className="text-[15px] font-medium">{post.linkedResearchGap.title}</p><Link to={`/research-gaps?gapId=${post.linkedResearchGap.id}`} className="mt-1 inline-block text-[13px] text-primary hover:underline">{t("View gap")}</Link></div> : null}
                      {post.linkedProject ? <div><p className="mb-1 text-xs text-muted-foreground">{t("Linked Project")}</p><Link to={`/projects/${post.linkedProject.id}`} className="text-sm font-medium hover:text-primary">{post.linkedProject.title}</Link></div> : null}
                    </section> : null}
                    {post.references.length ? <section aria-label={t("References")} className="mt-6"><h2 className="mb-3 text-[13px] font-semibold text-muted-foreground">{t("References")}</h2><ol className="space-y-3">{post.references.map((reference, index) => <li key={reference.id || index}><ForumReferenceItem reference={reference} index={index + 1} linkedGapId={isAuthed ? post.linkedResearchGapId : undefined} onReviewEvidence={setReviewTarget} /></li>)}</ol></section> : null}
                    {post.tags.length ? <div className="mt-5 flex flex-wrap gap-x-3 gap-y-2">{post.tags.map((tag) => <Link key={tag} to={`/forum?tag=${encodeURIComponent(tag)}`} className="text-sm text-muted-foreground hover:text-primary">#{tag}</Link>)}</div> : null}
                    <div className="forum-post-actions mt-6 flex flex-wrap items-center gap-1">
                      <Button type="button" variant="ghost" size="sm" disabled={!isAuthed || removed} aria-pressed={isPostUpvoted} onClick={() => vote.mutate({ kind: "post", id: post.id, value: isPostUpvoted ? 0 : 1 })} className={cn("-ml-2 gap-1.5 text-muted-foreground", isPostUpvoted && "text-primary")} title={t("Helpful reflects community usefulness, not scientific validation.")}><ThumbsUp className="h-4 w-4" />{t("Helpful")} {post.helpfulCount}</Button>
                      <Button type="button" variant="ghost" size="sm" disabled={!canReply} onClick={() => openComposer()} className="gap-1.5 text-muted-foreground"><Reply className="h-4 w-4" />{t("Reply")}</Button>
                      {isAuthed ? <Button type="button" variant="ghost" size="sm" disabled={follow.isPending || removed} aria-pressed={post.isFollowing} onClick={() => follow.mutate({ postId: post.id, following: !post.isFollowing }, { onError: () => toast.error(t("Could not update follow state.")) })} className="gap-1.5 text-muted-foreground">{post.isFollowing ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}{t(post.isFollowing ? "Following" : "Follow")}</Button> : !removed ? <Button asChild variant="ghost" size="sm" className="gap-1.5 text-muted-foreground"><Link to={`/login?returnTo=${encodeURIComponent(`/forum/${post.id}`)}`}><Bell className="h-4 w-4" />{t("Follow")}</Link></Button> : null}
                      <Button type="button" variant="ghost" size="sm" onClick={handleShare} className="gap-1.5 text-muted-foreground"><Link2 className="h-4 w-4" />{t("Share")}</Button>
                      {isOwner && !locked && !removed ? <><Button type="button" variant="ghost" size="sm" aria-label={t("Edit discussion")} title={t("Edit discussion")} onClick={() => { setEditTitle(post.title); setEditContent(post.content); setEditTags(post.tags.join(", ")); setPostEditorOpen(true); }}><Pencil className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="sm" aria-label={t("Delete discussion")} title={t("Delete discussion")} onClick={() => setDeleteTarget({ type: "post", id: post.id })}><Trash2 className="h-4 w-4" /></Button></> : null}
                      {isAuthed && !removed ? <Button type="button" variant="ghost" size="sm" aria-label={t("Report content")} title={t("Report content")} onClick={() => setReportTarget({ type: "post", id: post.id })}><Flag className="h-4 w-4" /></Button> : null}
                    </div>
                    {post.canModerate && !removed ? <div className="mt-3 flex flex-wrap gap-1 border-t border-border pt-3">
                      <Button variant="ghost" size="sm" disabled={moderate.isPending} onClick={() => moderate.mutate({ targetType: "post", targetId: post.id, action: post.isPinned ? "THREAD_UNPINNED" : "THREAD_PINNED" }, { onError: () => toast.error(t("Could not complete the moderation action.")) })}><Pin className="mr-1.5 h-3.5 w-3.5" />{t(post.isPinned ? "Unpin" : "Pin")}</Button>
                      <Button variant="ghost" size="sm" disabled={moderate.isPending} onClick={() => moderate.mutate({ targetType: "post", targetId: post.id, action: locked ? "THREAD_UNLOCKED" : "THREAD_LOCKED" }, { onError: () => toast.error(t("Could not complete the moderation action.")) })}><Lock className="mr-1.5 h-3.5 w-3.5" />{t(locked ? "Unlock" : "Lock")}</Button>
                      <Button variant="ghost" size="sm" onClick={() => post.status === "hidden" ? moderate.mutate({ targetType: "post", targetId: post.id, action: "THREAD_RESTORED" }, { onError: () => toast.error(t("Could not complete the moderation action.")) }) : setModerationTarget({ type: "post", id: post.id, action: "THREAD_HIDDEN" })}><EyeOff className="mr-1.5 h-3.5 w-3.5" />{t(post.status === "hidden" ? "Restore discussion" : "Hide discussion")}</Button>
                    </div> : null}
                  </div>
                </div>
              </article>
              <section id="responses-section" aria-label={t("Replies")}>
                <h2 className="sr-only">{t("Replies")}</h2>
                {commentsQuery.isLoading ? <div className="h-32 animate-pulse border-t bg-muted/30" aria-label={t("Loading replies")} /> : null}
                {commentsQuery.isError ? <div role="alert" className="border-t py-6 text-sm"><p>{t("Could not load replies.")}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => commentsQuery.refetch()}>{t("Try again")}</Button></div> : null}
                {comments.map((comment, index) => <ForumResponseItem key={comment.id} comment={comment} ordinal={index + 2} isQuestion={post.type === "QUESTION"} isPostOwner={isOwner} isCommentOwner={currentUser?.id === comment.author.id} isAuthed={isAuthed} canReply={canReply} readOnly={locked || removed || post.status === "hidden"} isOP={comment.author.id === post.author.id} linkedGapId={isAuthed ? post.linkedResearchGapId : undefined} onReviewCitation={setReviewTarget} onReply={openComposer} onEdit={(target) => { setEditComment(target); setEditCommentContent(target.content); }} onDelete={(commentId) => setDeleteTarget({ type: "comment", id: commentId })} onReport={(commentId) => setReportTarget({ type: "comment", id: commentId })} onModerate={post.canModerate ? (commentId) => setModerationTarget({ type: "comment", id: commentId, action: "RESPONSE_HIDDEN" }) : undefined} onVote={(value) => vote.mutate({ kind: "comment", id: comment.id, value }, { onError: () => toast.error(t("Could not update Helpful.")) })} onAccept={() => comment.isAccepted ? unaccept.mutate(post.id, { onError: () => toast.error(t("Could not update accepted response.")) }) : accept.mutate({ postId: post.id, commentId: comment.id }, { onError: () => toast.error(t("Could not update accepted response.")) })} />)}
                {commentsQuery.hasNextPage ? <div className="border-t py-5"><Button variant="outline" disabled={commentsQuery.isFetchingNextPage} onClick={() => commentsQuery.fetchNextPage()}>{t(commentsQuery.isFetchingNextPage ? "Loading…" : "Load more replies")}</Button></div> : null}
                {!commentsQuery.isLoading && !commentsQuery.isError && !post.replyCount && !comments.length ? <p className="border-t py-8 text-sm text-muted-foreground">{t("No replies yet. Start the conversation with a question or a reference.")}</p> : null}
              </section>
              <div id="thread-end" tabIndex={-1} className="scroll-mt-24 outline-none">
                <div id="response-composer" className="scroll-mt-24 pt-2">
                  {isAuthed && !removed && post.status !== "hidden" ? <>
                    {canReply ? <ForumComposer key={id} onSubmit={handleCreateComment} replyTo={replyTo} postContent={post.content} onCancelReply={() => setReplyTo(undefined)} availablePapers={context?.papers} isSubmitting={add.isPending} focusRequest={focusRequest} /> : !locked ? <p className="border-t py-6 text-sm text-muted-foreground">{t("Active community membership is required to reply.")} {post.community ? <Link to={`/communities/${post.community.slug}`} className="text-primary hover:underline">{t("View community")}</Link> : null}</p> : null}
                  </> : !isAuthed && !locked && !removed ? <div className="border-t py-7"><p className="text-sm text-muted-foreground">{t("Sign in to join the discussion.")}</p><Button asChild size="sm" className="mt-3"><Link to="/login">{t("Sign in")}</Link></Button></div> : null}
                </div>
              </div>
            </div>
            <ForumThreadTimeline postIds={timelineIds} total={(commentsQuery.data?.pages[0]?.meta.total ?? post.replyCount) + 1} createdAt={post.createdAt} lastActivityAt={post.lastActivityAt ?? post.createdAt} />
          </div>
        </ForumSurface>

      {/* Modal Dialogs */}
      {/* Report Dialog */}
      <Dialog
        open={Boolean(reportTarget)}
        onOpenChange={(open) => {
          if (!open) setReportTarget(undefined);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Report content")}</DialogTitle>
            <DialogDescription>
              {t(
                "Reports are for policy or community-rule issues, not ordinary academic disagreement."
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="block space-y-1.5 text-xs font-semibold">
              <span>{t("Reason")}</span>
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs"
              >
                <option value="SPAM">{t("Spam")}</option>
                <option value="OFF_TOPIC">{t("Off topic")}</option>
                <option value="HARASSMENT">{t("Harassment")}</option>
                <option value="PLAGIARISM_OR_COPYRIGHT">{t("Plagiarism or copyright")}</option>
                <option value="INAPPROPRIATE_CONTENT">{t("Inappropriate content")}</option>
                <option value="OTHER">{t("Other")}</option>
              </select>
            </label>

            <label className="block space-y-1.5 text-xs font-semibold">
              <span>{t("Optional context for moderators")}</span>
              <textarea
                value={reportDescription}
                onChange={(e) => setReportDescription(e.target.value)}
                maxLength={2000}
                rows={3}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs leading-relaxed"
                placeholder={t("Explain why this violates policy...")}
              />
            </label>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setReportTarget(undefined)}>
              {t("Cancel")}
            </Button>
            <Button size="sm" onClick={submitReport}>
              {t("Submit report")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Moderation Dialog */}
      <Dialog
        open={Boolean(moderationTarget)}
        onOpenChange={(open) => {
          if (!open) setModerationTarget(undefined);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Hide this forum content?")}</DialogTitle>
            <DialogDescription>
              {t(
                "The content will leave normal forum views and this decision will be recorded in moderation history."
              )}
            </DialogDescription>
          </DialogHeader>
          <label className="space-y-1.5 text-xs font-semibold">
            <span>{t("Moderation reason")}</span>
            <textarea
              value={moderationReason}
              onChange={(e) => setModerationReason(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder={t("Explain the policy violation...")}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
            />
          </label>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setModerationTarget(undefined)}>
              {t("Cancel")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={moderationReason.trim().length < 3 || moderate.isPending}
              onClick={submitModeration}
            >
              {t("Hide content")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Post Editor Dialog */}
      <Dialog open={postEditorOpen} onOpenChange={setPostEditorOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("Edit discussion")}</DialogTitle>
            <DialogDescription>{t("Your changes will be visible in this discussion.")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <label className="block space-y-1.5 text-xs font-semibold">
              <span>{t("Title")}</span>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                minLength={3}
                maxLength={180}
              />
            </label>
            <label className="block space-y-1.5 text-xs font-semibold">
              <span>{t("Body")}</span>
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                minLength={1}
                maxLength={20000}
                rows={8}
                className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-xs leading-relaxed"
              />
            </label>
            <label className="block space-y-1.5 text-xs font-semibold">
              <span>{t("Tags")}</span>
              <Input
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder={t("Separate tags with commas")}
              />
            </label>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPostEditorOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button
              size="sm"
              disabled={
                editTitle.trim().length < 3 || !editContent.trim() || updatePost.isPending
              }
              onClick={savePostEdit}
            >
              {t("Save changes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Comment Dialog */}
      <Dialog
        open={Boolean(editComment)}
        onOpenChange={(open) => {
          if (!open) setEditComment(undefined);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Edit response")}</DialogTitle>
            <DialogDescription>{t("Your changes will be visible in this discussion.")}</DialogDescription>
          </DialogHeader>
          <label className="block space-y-1.5 text-xs font-semibold py-2">
            <span>{t("Response")}</span>
            <textarea
              value={editCommentContent}
              onChange={(e) => setEditCommentContent(e.target.value)}
              minLength={1}
              maxLength={10000}
              rows={6}
              className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-xs leading-relaxed"
            />
          </label>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditComment(undefined)}>
              {t("Cancel")}
            </Button>
            <Button
              size="sm"
              disabled={!editCommentContent.trim() || updateComment.isPending}
              onClick={saveCommentEdit}
            >
              {t("Save changes")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(undefined);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {t(
                deleteTarget?.type === "post"
                  ? "Remove this discussion?"
                  : "Remove this response?"
              )}
            </DialogTitle>
            <DialogDescription>{t("This action cannot be undone.")}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(undefined)}>
              {t("Cancel")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deletePost.isPending || deleteComment.isPending}
              onClick={confirmDelete}
            >
              {t("Remove")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Evidence Review Dialog */}
      <Dialog
        open={Boolean(reviewTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setReviewTarget(undefined);
            setSelectedEvidenceTypes([]);
          }
        }}
      >
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t(forumGapCopy.reviewTitle)}</DialogTitle>
            <DialogDescription>{t(forumGapCopy.reviewDescription)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5 text-xs">
              <p className="font-semibold text-foreground">
                {reviewTarget?.title || reviewTarget?.doi || t("References")}
              </p>
              <p className="mt-1 text-muted-foreground">{t(forumGapCopy.confirmHuman)}</p>
            </div>

            {evidenceOptions.isLoading ? (
              <div className="h-24 animate-pulse rounded-xl bg-muted" />
            ) : evidenceOptions.data?.status === "EVIDENCE_EXTRACTION_REQUIRED" ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <p className="font-semibold">
                  {t("Extract evidence from this paper before linking it to the candidate gap.")}
                </p>
                <p className="mt-1">
                  {t("Use the existing literature corpus evidence workflow, then return here to select the extracted item.")}
                </p>
                {evidenceOptions.data.corpusId && (
                  <Link
                    className="mt-3 inline-flex font-bold text-blue-600 underline"
                    to={`/research-gap-discover?corpus=${evidenceOptions.data.corpusId}&paper=${evidenceOptions.data.paper.id}`}
                  >
                    {t("Open evidence extraction workflow")}
                  </Link>
                )}
              </div>
            ) : evidenceOptions.data?.status === "SCREENING_REQUIRED" ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                {t("Include this paper in project screening before extracting structured evidence.")}
              </div>
            ) : (
              <>
                <fieldset className="space-y-2">
                  <legend className="text-xs font-semibold">
                    {t("Extracted evidence: select one or more")}
                  </legend>
                  {(evidenceOptions.data?.extractedEvidence ?? []).map((item) => (
                    <label
                      key={item.evidenceType}
                      className="flex cursor-pointer gap-3 rounded-xl border border-border/80 p-3 text-xs transition-colors hover:bg-muted/30"
                    >
                      <input
                        type="checkbox"
                        checked={selectedEvidenceTypes.includes(item.evidenceType)}
                        onChange={(e) =>
                          setSelectedEvidenceTypes((current) =>
                            e.target.checked
                              ? [...current, item.evidenceType]
                              : current.filter((v) => v !== item.evidenceType)
                          )
                        }
                      />
                      <span>
                        <span className="font-bold text-foreground">{item.evidenceType}</span>
                        <span className="mt-1 block text-muted-foreground">{item.excerpt}</span>
                        <span className="mt-1 block text-[10px] text-muted-foreground/80 font-mono">
                          {item.sourceLocation}
                        </span>
                      </span>
                    </label>
                  ))}
                </fieldset>

                <label className="block space-y-1.5 text-xs font-semibold">
                  <span>{t(forumGapCopy.evidenceRelation)}</span>
                  <select
                    value={reviewRelation}
                    onChange={(e) =>
                      setReviewRelation(
                        e.target.value as "SUPPORTING" | "COUNTER" | "RELATED"
                      )
                    }
                    className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs"
                  >
                    <option value="SUPPORTING">{t(forumGapCopy.supporting)}</option>
                    <option value="COUNTER">{t(forumGapCopy.counter)}</option>
                    <option value="RELATED">{t(forumGapCopy.related)}</option>
                  </select>
                </label>

                {reviewRelation !== "RELATED" && (
                  <label className="block space-y-1.5 text-xs font-semibold">
                    <span>{t(forumGapCopy.evidenceExplanation)}</span>
                    <textarea
                      value={reviewExplanation}
                      onChange={(e) => setReviewExplanation(e.target.value)}
                      minLength={10}
                      maxLength={5000}
                      rows={4}
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs leading-relaxed"
                      placeholder={t(
                        "Explain the finding, limitation, or result from the paper and why it relates to this candidate gap."
                      )}
                    />
                  </label>
                )}
              </>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setReviewTarget(undefined)}>
              {t("Cancel")}
            </Button>
            <Button
              size="sm"
              disabled={
                reviewCitation.isPending ||
                evidenceOptions.data?.status !== "EVIDENCE_SELECTION_REQUIRED" ||
                selectedEvidenceTypes.length === 0 ||
                (reviewRelation !== "RELATED" && reviewExplanation.trim().length < 10)
              }
              onClick={submitEvidenceReview}
            >
              {reviewCitation.isPending ? t("Working…") : t("Confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ForumLayout>
  );
}
