import { orderForumReferences } from "@trend/shared-types";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { isAxiosError } from "axios";
import { EyeOff, Flag, Link2, Lock, Maximize2, MessageSquare, Minimize2, Minus, MoreHorizontal, Pencil, Pin, Reply, Trash2, X } from "lucide-react";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  forumApi,
  ForumAuthorAvatar,
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
  useForumComments,
  useForumContext,
  useForumCategories,
  useFollowThread,
  useForumPost,
  useForumReaction,
  useModerateForumContent,
  useUnacceptAnswer,
  useUpdateForumComment,
  useUpdateForumPost,
  type ForumCommentView,
  type ForumReferenceView,
  type ForumReportReason,
  forumGapCopy,
} from "@/features/forum";
import { formatForumRelativeTime, forumPostHref } from "@/features/forum/utils/forum-helpers";
import {
  useForumCitationEvidenceOptions,
  useReviewForumCitationAsEvidence,
} from "@/features/gaps/hooks/use-gaps";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/utils/cn";
import { ForumAuthorByline } from "@/features/forum/components/forum-author-byline";
import { ForumThreadTimeline } from "@/features/forum/components/forum-thread-timeline";
import { ForumPostTypeBadge } from "@/features/forum/components/forum-post-type-badge";
import { ForumThreadDiscovery } from "@/features/forum/components/forum-thread-discovery";
import { ForumReactionPicker } from "@/features/forum/components/forum-reaction-picker";
import { ForumAuthorPopover } from "@/features/forum/components/forum-author-popover";
import { ForumTopicStats } from "@/features/forum/components/forum-topic-stats";
import { ForumNotificationMenu } from "@/features/forum/components/forum-notification-menu";
import { ForumEditHistory } from "@/features/forum/components/forum-edit-history";
import { ForumPostLink } from "@/features/forum/components/forum-post-link";
import { ForumLinkedPaper } from "@/features/forum/components/forum-linked-paper";
import { useForumNotificationLevel } from "@/features/forum/hooks/use-forum";

const ForumComposer = lazy(() => import("@/features/forum/components/forum-composer").then((module) => ({ default: module.ForumComposer })));
const ForumBodyEditor = lazy(() => import("@/features/forum/components/forum-body-editor").then((module) => ({ default: module.ForumBodyEditor })));

function ForumEditorLoading() {
  const { t } = useI18n();
  return <div role="status" className="min-h-24 p-4 text-sm text-muted-foreground">{t("Loading discussion editor")}</div>;
}

export function ForumDetailPage() {
  const { id = "", postNumber: postNumberParam } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, language } = useI18n();

  const postQuery = useForumPost(id);
  const post = postQuery.data;
  // Both read endpoints accept the public slug and enforce community access.
  const commentsQuery = useForumComments(id);

  const add = useAddForumComment();
  const reaction = useForumReaction();
  const accept = useAcceptAnswer();
  const unaccept = useUnacceptAnswer();
  const notification = useForumNotificationLevel();
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
  const [reportReason, setReportReason] = useState<ForumReportReason>("OFF_TOPIC");
  const [reportDescription, setReportDescription] = useState("");
  const [reportPending, setReportPending] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [replyExpanded, setReplyExpanded] = useState(false);
  const [filteredAuthorId, setFilteredAuthorId] = useState<string>();
  const [postedComments, setPostedComments] = useState<Array<{ postId: string; comment: ForumCommentView }>>([]);
  const [focusCommentId, setFocusCommentId] = useState<string>();
  const [jumpPostNumber, setJumpPostNumber] = useState<number>();
  const [deepLinkSettled, setDeepLinkSettled] = useState(!postNumberParam && !location.hash);
  const navigationKey = `${id}:${location.key}:${postNumberParam ?? ""}:${location.hash}`;
  const requestedPostNumber = useMemo(() => {
    if (!postNumberParam || !/^\d+$/.test(postNumberParam)) return undefined;
    const parsed = Number(postNumberParam);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
  }, [postNumberParam]);
  const legacyCommentId = location.hash.startsWith("#comment-") ? location.hash.slice("#comment-".length) : undefined;
  const repliesSentinel = useRef<HTMLDivElement>(null);

  const [moderationTarget, setModerationTarget] = useState<{
    type: "post" | "comment";
    id: string;
    action: "THREAD_HIDDEN" | "RESPONSE_HIDDEN";
  }>();
  const [moderationReason, setModerationReason] = useState("");

  const [postEditorOpen, setPostEditorOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editReferences, setEditReferences] = useState<ForumReferenceView[]>([]);
  const [editCommentReferences, setEditCommentReferences] = useState<ForumReferenceView[]>([]);
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

  const { data: context } = useForumContext(undefined, isAuthed && composerOpen);
  const { data: communities, isLoading: communitiesLoading, isError: communitiesError, refetch: retryCommunities } = useForumCategories();

  const comments = useMemo(() => {
    const byId = new Map<string, ForumCommentView>();
    for (const row of postedComments) if (row.postId === post?.id) byId.set(row.comment.id, row.comment);
    for (const page of commentsQuery.data?.pages ?? []) for (const comment of page.data) byId.set(comment.id, comment);
    return [...byId.values()].sort((a, b) => a.postNumber && b.postNumber ? a.postNumber - b.postNumber : a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }, [commentsQuery.data, postedComments, post?.id]);
  const visibleComments = useMemo(() => filteredAuthorId ? comments.filter((comment) => comment.author.id === filteredAuthorId) : comments, [comments, filteredAuthorId]);
  const authorPostCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (post) counts.set(post.author.id, 1);
    for (const comment of comments) counts.set(comment.author.id, (counts.get(comment.author.id) ?? 0) + 1);
    return counts;
  }, [post?.author.id, comments]);
  const authorTopicPostCount = (authorId: string) => commentsQuery.hasNextPage || commentsQuery.isLoading ? undefined : authorPostCounts.get(authorId);
  const showOpening = !filteredAuthorId || filteredAuthorId === post?.author.id;
  const timelineIds = useMemo(() => [...(showOpening ? ["opening-post"] : []), ...visibleComments.map((comment) => `comment-${comment.id}`)], [visibleComments, showOpening]);
  const timelineDates = useMemo(() => [...(showOpening && post ? [post.createdAt] : []), ...visibleComments.map((comment) => comment.createdAt)], [visibleComments, showOpening, post?.createdAt]);
  const replyLookup = useMemo(() => {
    const children = new Map<string, ForumCommentView[]>();
    const ordinals = new Map<string, number>();
    comments.forEach((comment, index) => { ordinals.set(comment.id, comment.postNumber ?? index + 2); if (comment.parentCommentId && comment.status === "active") { const rows = children.get(comment.parentCommentId) ?? []; rows.push(comment); children.set(comment.parentCommentId, rows); } });
    return { children, ordinals };
  }, [comments]);
  useEffect(() => {
    const sentinel = repliesSentinel.current;
    if (!sentinel || !commentsQuery.hasNextPage || commentsQuery.isFetchingNextPage || commentsQuery.isError) return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) void commentsQuery.fetchNextPage(); }, { rootMargin: "600px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [commentsQuery.hasNextPage, commentsQuery.isFetchingNextPage, commentsQuery.isError, commentsQuery.fetchNextPage]);
  useEffect(() => {
    if (!requestedPostNumber || requestedPostNumber === 1 || comments.some((comment) => replyLookup.ordinals.get(comment.id) === requestedPostNumber) || (comments.at(-1)?.postNumber ?? 0) > requestedPostNumber || !commentsQuery.hasNextPage || commentsQuery.isFetchingNextPage || commentsQuery.isError) return;
    void commentsQuery.fetchNextPage();
  }, [requestedPostNumber, comments, replyLookup.ordinals, commentsQuery.hasNextPage, commentsQuery.isFetchingNextPage, commentsQuery.isError, commentsQuery.fetchNextPage]);
  useEffect(() => {
    if (!legacyCommentId || comments.some((comment) => comment.id === legacyCommentId) || !commentsQuery.hasNextPage || commentsQuery.isFetchingNextPage || commentsQuery.isError) return;
    void commentsQuery.fetchNextPage();
  }, [legacyCommentId, comments, commentsQuery.hasNextPage, commentsQuery.isFetchingNextPage, commentsQuery.isError, commentsQuery.fetchNextPage]);
  useEffect(() => {
    const fetchedIds = new Set(commentsQuery.data?.pages.flatMap((page) => page.data.map((comment) => comment.id)));
    setPostedComments((previous) => previous.some((row) => row.postId === post?.id && fetchedIds.has(row.comment.id)) ? previous.filter((row) => row.postId !== post?.id || !fetchedIds.has(row.comment.id)) : previous);
  }, [commentsQuery.data, post?.id]);
  useEffect(() => { setReplyTo(undefined); setFocusCommentId(undefined); setJumpPostNumber(undefined); setFilteredAuthorId(undefined); setComposerOpen(false); setFocusRequest(0); }, [post?.id]);
  useEffect(() => { setDeepLinkSettled(!requestedPostNumber && !legacyCommentId); }, [navigationKey, requestedPostNumber, legacyCommentId]);
  useEffect(() => {
    if (!post?.publicSlug || id === post.publicSlug) return;
    navigate(`${forumPostHref(post, requestedPostNumber)}${legacyCommentId ? `#comment-${legacyCommentId}` : ""}`, { replace: true });
  }, [id, navigate, post?.publicSlug, requestedPostNumber, legacyCommentId]);
  useEffect(() => {
    if (!post || commentsQuery.isLoading || deepLinkSettled) return;
    const legacyComment = legacyCommentId ? comments.find((comment) => comment.id === legacyCommentId) : undefined;
    if (legacyCommentId && !legacyComment) {
      if (commentsQuery.hasNextPage && !commentsQuery.isError) return;
      setDeepLinkSettled(true);
      return;
    }
    const targetNumber = requestedPostNumber ?? (legacyComment ? replyLookup.ordinals.get(legacyComment.id) ?? 1 : 1);
    const target = comments.find((comment) => replyLookup.ordinals.get(comment.id) === targetNumber);
    if (targetNumber !== 1 && !target) {
      if (commentsQuery.hasNextPage && !commentsQuery.isError && (comments.at(-1)?.postNumber ?? 0) < targetNumber) return;
      toast.info(t("This post is unavailable."));
      setDeepLinkSettled(true);
      return;
    }
    const targetId = targetNumber === 1 ? "opening-post" : `comment-${target?.id}`;
    const node = document.getElementById(targetId);
    if (!node) return;
    node.scrollIntoView({ behavior: "instant", block: "start" });
    node.focus({ preventScroll: true });
    if (legacyCommentId) window.history.replaceState(window.history.state, "", `${forumPostHref(post, targetNumber)}${window.location.search}`);
    setDeepLinkSettled(true);
  }, [comments, replyLookup.ordinals, commentsQuery.hasNextPage, commentsQuery.isError, commentsQuery.isLoading, deepLinkSettled, legacyCommentId, post, requestedPostNumber, t]);
  useEffect(() => {
    if (jumpPostNumber === undefined) return;
    const comment = comments.find((row) => replyLookup.ordinals.get(row.id) === jumpPostNumber);
    const node = document.getElementById(jumpPostNumber === 1 ? "opening-post" : `comment-${comment?.id}`);
    if (node) {
      node.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
      node.focus({ preventScroll: true });
      setJumpPostNumber(undefined);
    } else if (commentsQuery.isLoading || commentsQuery.isFetchingNextPage) return;
    else if (commentsQuery.hasNextPage && !commentsQuery.isError) void commentsQuery.fetchNextPage();
    else { toast.info(t("This post is unavailable.")); setJumpPostNumber(undefined); }
  }, [jumpPostNumber, comments, replyLookup.ordinals, filteredAuthorId, commentsQuery.hasNextPage, commentsQuery.isLoading, commentsQuery.isFetchingNextPage, commentsQuery.isError, commentsQuery.fetchNextPage, t]);
  function jumpToPost(postNumber: number) { setFilteredAuthorId(undefined); setJumpPostNumber(postNumber); }
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
      <ForumLayout className="forum-conversation-workspace" contentClassName="forum-conversation-content" sidebar={<ForumSidebar communities={communities} communitiesLoading={communitiesLoading} communitiesError={communitiesError} onRetryCommunities={() => void retryCommunities()} isAuthed={isAuthed} />}><ForumSurface className="forum-detail-surface forum-detail-loading px-4 pb-8 pt-4" role="status" aria-label={t("Loading discussion")}>
        <div className="mb-3 min-h-11 lg:hidden" aria-hidden="true" />
        <div className="border-b border-border pb-4" aria-hidden="true">
          <div className="h-8 w-4/5 rounded bg-muted/70" />
          <div className="mt-2 h-4 w-40 rounded bg-muted/50" />
        </div>
        <div className="forum-detail-grid mx-auto mt-4 grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_168px] xl:gap-8" aria-hidden="true">
          <div className="flex gap-5">
            <div className="h-10 w-10 shrink-0 rounded-full bg-muted/60" />
            <div className="min-w-0 flex-1 space-y-4">
              <div className="h-5 w-40 rounded bg-muted/60" />
              <div className="h-3 w-28 rounded bg-muted/40" />
              <div className="space-y-3 pt-3">
                {["w-full", "w-11/12", "w-4/5", "w-full", "w-3/4"].map((width, index) => <div key={index} className={cn("h-4 rounded bg-muted/40", width)} />)}
              </div>
              <div className="mt-8 h-9 rounded bg-muted/30" />
              <div className="h-20 rounded bg-muted/30" />
            </div>
          </div>
          <div className="hidden space-y-4 pt-2 xl:block"><div className="h-4 w-20 rounded bg-muted/50" /><div className="h-16 w-24 rounded bg-muted/40" /></div>
        </div>
      </ForumSurface></ForumLayout>
    );
  }

  if (!post) {
    const status = isAxiosError(postQuery.error) ? postQuery.error.response?.status : undefined;
    const unavailable = status === 400 || status === 403 || status === 404;
    return (
      <ForumLayout className="forum-conversation-workspace" contentClassName="forum-conversation-content" sidebar={<ForumSidebar communities={communities} communitiesLoading={communitiesLoading} communitiesError={communitiesError} onRetryCommunities={() => void retryCommunities()} isAuthed={isAuthed} />}><ForumSurface className="forum-detail-surface px-4 py-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <MessageSquare className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
          {t(unavailable ? "Discussion unavailable" : "Could not load discussion.")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(unavailable ? "This discussion may be private, hidden, or no longer available." : "Please try again in a moment.")}
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link to="/forum">{t("Back to Forum")}</Link>
        </Button>
        {!unavailable ? <Button className="ml-3 mt-6" disabled={postQuery.isFetching} onClick={() => void postQuery.refetch()}>{t("Retry")}</Button> : null}
      </ForumSurface></ForumLayout>
    );
  }

  const isOwner = currentUser?.id === post.author.id;
  const locked = post.status === "locked";
  const removed = post.status === "deleted";
  const readOnly = locked || removed || post.status === "hidden";
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
    if (!isAuthed) { navigate(`/login?returnTo=${encodeURIComponent(forumPostHref(post))}`); return; }
    if (!canReply || add.isPending) return;
    setReplyTo(target);
    setComposerOpen(true);
    setFocusRequest((value) => value + 1);
  };
  const notificationControl = (showLabel = false) => <ForumNotificationMenu level={post.notificationLevel ?? (post.isFollowing ? "WATCHING" : "NORMAL")} isAuthed={isAuthed} pending={notification.isPending} disabled={removed || post.status === "hidden"} loginHref={`/login?returnTo=${encodeURIComponent(forumPostHref(post))}`} showLabel={showLabel} onChange={(level) => notification.mutate({ postId: post.id, level }, { onError: () => toast.error(t("Could not update notification settings.")) })} />;
  const filterAuthor = (authorId: string) => { setFilteredAuthorId(authorId); document.getElementById("thread-title")?.scrollIntoView({ behavior: "instant", block: "start" }); };

  const handleCreateComment = async (data: { content: string; parentCommentId?: string; references: ForumReferenceView[] }) => {
    // Do not catch here: the shared composer owns inline errors and draft retention.
    const created = await add.mutateAsync({ postId: post.id, ...data });
    setPostedComments((previous) => [...previous, { postId: post.id, comment: created }]);
    setReplyTo(undefined);
    setComposerOpen(false);
    setFilteredAuthorId(undefined);
    setFocusCommentId(created.id);
    toast.success(t("Response posted"));
  };

  async function submitReport() {
    if (!reportTarget || reportPending) return;
    setReportPending(true);
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
    } finally { setReportPending(false); }
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
          references: orderForumReferences(editContent, editReferences),
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
        references: orderForumReferences(editCommentContent, editCommentReferences),
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
      className="forum-conversation-workspace"
      contentClassName="forum-conversation-content"
      sidebar={<ForumSidebar communities={communities} communitiesLoading={communitiesLoading} communitiesError={communitiesError} onRetryCommunities={() => void retryCommunities()} isAuthed={isAuthed} />}
    >
        <ForumSurface className="forum-detail-surface forum-content-ready px-4 pb-8 pt-4">
              <div className="mb-3 flex min-h-11 items-center pl-12 lg:hidden"><Link to="/forum" className="rounded text-sm font-semibold text-muted-foreground hover:text-primary focus-visible:ring-2 focus-visible:ring-ring">{t("Research Forum")}</Link></div>
              <header id="thread-title" className="forum-detail-title scroll-mt-[calc(var(--app-header-height)+1rem)] pb-4">
                <h1 className="forum-thread-title max-w-full break-words">{post.title}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-muted-foreground">
                  <ForumPostTypeBadge type={post.type} size="sm" className="border-0 p-0 font-normal" />
                  {post.community ? <><span aria-hidden="true">·</span><Link to={`/forum?category=${encodeURIComponent(post.community.slug)}`} className="hover:text-primary">{t(post.community.name)}</Link></> : null}
                  {post.tags.length ? <><span aria-hidden="true">,</span>{post.tags.map((tag, index) => <span key={tag}><Link to={`/forum?tag=${encodeURIComponent(tag)}`} className="hover:text-primary">{tag}</Link>{index < post.tags.length - 1 ? "," : ""}</span>)}</> : null}
                  {post.isPinned ? <span className="inline-flex items-center gap-1"><Pin className="h-3.5 w-3.5" />{t("Pinned")}</span> : null}
                  {locked ? <span className="inline-flex items-center gap-1"><Lock className="h-3.5 w-3.5" />{t("Locked")}</span> : null}
                </div>
              </header>
          <div className="forum-detail-grid mx-auto grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_168px] xl:gap-8">
            <div className="min-w-0">
              {filteredAuthorId ? <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded border border-border bg-muted/30 p-3 text-sm"><span>{t("Showing posts by")} {post.author.id === filteredAuthorId ? post.author.fullName : comments.find((comment) => comment.author.id === filteredAuthorId)?.author.fullName}</span><button type="button" onClick={() => setFilteredAuthorId(undefined)} className="inline-flex items-center gap-1 text-primary hover:underline"><X className="h-3.5 w-3.5" />{t("Show all posts")}</button></div> : null}
              {locked ? <div role="status" className="mb-6 flex gap-3 rounded-md border border-border bg-muted/30 p-4"><Lock className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="text-sm font-semibold">{t("This discussion is locked.")}</p><p className="mt-1 text-sm text-muted-foreground">{t("Existing responses remain visible, but new replies cannot be added.")}</p></div></div> : null}
              {removed || post.status === "hidden" ? <p role="status" className="mb-5 text-sm text-muted-foreground">{t(removed ? "This discussion was removed. Existing responses remain visible." : "This discussion is hidden from the forum.")}</p> : null}
              {showOpening ? <article id="opening-post" data-thread-post tabIndex={-1} className="forum-thread-post scroll-mt-[calc(var(--app-header-height)+1rem)] border-t border-border py-4 outline-none">
                <div className="grid grid-cols-[40px_minmax(0,1fr)] gap-x-3 sm:grid-cols-[44px_minmax(0,1fr)] sm:gap-x-4">
                  <ForumAuthorPopover className="forum-post-avatar" author={post.author} canReply={!readOnly && (!isAuthed || canReply)} onReply={() => openComposer()} onFilterPosts={() => filterAuthor(post.author.id)} authorTopicPostCount={authorTopicPostCount(post.author.id)}>
                    <ForumAuthorAvatar author={post.author} size="md" />
                  </ForumAuthorPopover>
                  <div className="contents sm:block sm:min-w-0">
                    <header className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-2">
                      <ForumAuthorByline author={post.author} authorTopicPostCount={authorTopicPostCount(post.author.id)} canReply={!readOnly && (!isAuthed || canReply)} onReply={() => openComposer()} onFilterPosts={() => filterAuthor(post.author.id)} />
                      <div className="inline-flex max-w-full flex-wrap items-center gap-1"><ForumPostLink post={post} postNumber={1} targetId="opening-post" onJump={jumpToPost} title={`${t("Post")} #1`} className="forum-post-date py-0.5 text-sm text-muted-foreground"><time dateTime={post.createdAt} title={new Date(post.createdAt).toLocaleString(language)}>{formatForumRelativeTime(post.createdAt, language)}</time></ForumPostLink>{!removed || isOwner || post.canModerate ? <ForumEditHistory kind="post" id={post.id} editedAt={post.editedAt} /> : null}</div>
                    </header>
                    <div className="col-span-2 mt-4 min-w-0"><ForumMarkdown content={post.content} references={post.references} /></div>
                    {post.linkedPaper || post.linkedResearchGap || post.linkedProject ? <section aria-label={t("Linked research context")} className={cn("col-span-2 mt-6 min-w-0 space-y-4", !post.linkedPaper && "rounded-md border border-border bg-muted/20 px-4 py-4")}>
                      {post.linkedPaper ? <ForumLinkedPaper paper={post.linkedPaper} /> : null}
                      {post.linkedResearchGap ? <div><p className="mb-1 text-xs font-medium text-muted-foreground">{t("Linked Candidate Research Gap")}</p><p className="text-[15px] font-medium">{post.linkedResearchGap.title}</p><Link to={`/research-gaps?gapId=${post.linkedResearchGap.id}`} className="mt-1 inline-block text-[13px] text-primary hover:underline">{t("View gap")}</Link></div> : null}
                      {post.linkedProject ? <div><p className="mb-1 text-xs text-muted-foreground">{t("Linked Project")}</p><Link to={`/projects/${post.linkedProject.id}`} className="text-sm font-medium hover:text-primary">{post.linkedProject.title}</Link></div> : null}
                    </section> : null}
                    {post.references.length ? <section aria-label={t("References")} className="col-span-2 mt-6 min-w-0"><h2 className="forum-post-section-title mb-3">{t("References")}</h2><ol className="space-y-3">{orderForumReferences(post.content, post.references).map((reference, index) => <li key={reference.id || index}><ForumReferenceItem reference={reference} index={index + 1} linkedGapId={isAuthed ? post.linkedResearchGapId : undefined} onReviewEvidence={setReviewTarget} /></li>)}</ol></section> : null}
                    <div role="group" aria-label={t("Discussion actions")} className="forum-post-actions col-span-2 mt-5 flex flex-wrap items-center gap-x-1 gap-y-2">
                      <ForumReactionPicker countsOnly target={{ scope: "post", id: post.id }} counts={post.reactionCounts} viewerReactions={post.viewerReactions} reactionUsers={post.reactionUsers} isAuthed={isAuthed} disabled={readOnly} pending={reaction.isPending} onToggle={(reactionName, active) => reaction.mutate({ kind: "post", id: post.id, reaction: reactionName, active }, { onError: () => toast.error(t("Could not update reaction.")) })} />
                      <div className="forum-post-action-links ml-auto inline-flex items-center gap-0.5">
                      <ForumReactionPicker triggerOnly counts={post.reactionCounts} viewerReactions={post.viewerReactions} reactionUsers={post.reactionUsers} isAuthed={isAuthed} disabled={readOnly} pending={reaction.isPending} onToggle={(reactionName, active) => reaction.mutate({ kind: "post", id: post.id, reaction: reactionName, active }, { onError: () => toast.error(t("Could not update reaction.")) })} />
                      <Button type="button" variant="ghost" size="icon" onClick={handleShare} aria-label={t("Share")} title={t("Share")} className="h-9 w-9 text-muted-foreground"><Link2 aria-hidden="true" className="h-4 w-4" /></Button>
                      {isAuthed && !removed ? <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" aria-label={t("More discussion actions")} title={t("More discussion actions")}><MoreHorizontal aria-hidden="true" className="h-4 w-4" /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {isOwner && !readOnly ? <><DropdownMenuItem onSelect={() => { setEditTitle(post.title); setEditContent(post.content); setEditReferences(post.references); setEditTags(post.tags.join(", ")); setPostEditorOpen(true); }}><Pencil aria-hidden="true" className="mr-2 h-4 w-4" />{t("Edit discussion")}</DropdownMenuItem><DropdownMenuSeparator /></> : null}
                          <DropdownMenuItem onSelect={() => setReportTarget({ type: "post", id: post.id })}><Flag aria-hidden="true" className="mr-2 h-4 w-4" />{t("Report content")}</DropdownMenuItem>
                          {isOwner && !readOnly ? <><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteTarget({ type: "post", id: post.id })}><Trash2 aria-hidden="true" className="mr-2 h-4 w-4" />{t("Delete discussion")}</DropdownMenuItem></> : null}
                        </DropdownMenuContent>
                      </DropdownMenu> : null}
                      <Button type="button" variant="ghost" size="sm" disabled={readOnly || (isAuthed && !canReply)} onClick={() => openComposer()} title={!canReply ? t(isAuthed ? readOnly ? "This discussion is read-only." : "This category is read-only or replying is unavailable." : "Sign in to join the discussion.") : undefined} className="gap-1.5 text-muted-foreground"><Reply aria-hidden="true" className="h-4 w-4" />{t("Reply")}</Button>
                      </div>
                    </div>
                    {post.canModerate && !removed ? <div className="col-span-2 mt-3 flex flex-wrap gap-1 border-t border-border pt-3">
                      <Button variant="ghost" size="sm" disabled={moderate.isPending} onClick={() => moderate.mutate({ targetType: "post", targetId: post.id, action: post.isPinned ? "THREAD_UNPINNED" : "THREAD_PINNED" }, { onError: () => toast.error(t("Could not complete the moderation action.")) })}><Pin className="mr-1.5 h-3.5 w-3.5" />{t(post.isPinned ? "Unpin" : "Pin")}</Button>
                      <Button variant="ghost" size="sm" disabled={moderate.isPending} onClick={() => moderate.mutate({ targetType: "post", targetId: post.id, action: locked ? "THREAD_UNLOCKED" : "THREAD_LOCKED" }, { onError: () => toast.error(t("Could not complete the moderation action.")) })}><Lock className="mr-1.5 h-3.5 w-3.5" />{t(locked ? "Unlock" : "Lock")}</Button>
                      <Button variant="ghost" size="sm" disabled={moderate.isPending} onClick={() => post.status === "hidden" ? moderate.mutate({ targetType: "post", targetId: post.id, action: "THREAD_RESTORED" }, { onError: () => toast.error(t("Could not complete the moderation action.")) }) : setModerationTarget({ type: "post", id: post.id, action: "THREAD_HIDDEN" })}><EyeOff className="mr-1.5 h-3.5 w-3.5" />{t(post.status === "hidden" ? "Restore discussion" : "Hide discussion")}</Button>
                    </div> : null}
                  </div>
                </div>
              </article> : null}
              {!filteredAuthorId ? <ForumTopicStats key={`${post.id}-opening`} post={post} comments={comments} hasMore={commentsQuery.hasNextPage} loadingMore={commentsQuery.isFetchingNextPage} onLoadMore={() => void commentsQuery.fetchNextPage()} onFilterAuthor={filterAuthor} onJumpToPost={jumpToPost} /> : null}
              <section id="responses-section" tabIndex={-1} className="scroll-mt-[calc(var(--app-header-height)+1rem)] outline-none" aria-label={t("Replies")}>
                <h2 className="sr-only">{t("Replies")}</h2>
                {commentsQuery.isLoading ? <div className="h-32 animate-pulse border-t bg-muted/30" aria-label={t("Loading replies")} /> : null}
                {commentsQuery.isError ? <div role="alert" className="border-t py-6 text-sm"><p>{t("Could not load replies.")}</p><Button variant="outline" size="sm" className="mt-3" onClick={() => commentsQuery.refetch()}>{t("Try again")}</Button></div> : null}
                {visibleComments.map((comment) => <ForumResponseItem key={comment.id}
                  post={post} postNumberForComment={(commentId) => replyLookup.ordinals.get(commentId) ?? 2} onJumpToPost={jumpToPost}
                  comment={comment} ordinal={replyLookup.ordinals.get(comment.id) ?? 2} authorTopicPostCount={authorTopicPostCount(comment.author.id)}
                  isQuestion={post.type === "QUESTION"} isPostOwner={isOwner} isCommentOwner={currentUser?.id === comment.author.id}
                  isAuthed={isAuthed} canReply={canReply} readOnly={readOnly} reactionPending={reaction.isPending}
                  acceptancePending={accept.isPending || unaccept.isPending} isOP={comment.author.id === post.author.id}
                  linkedGapId={isAuthed ? post.linkedResearchGapId : undefined} onFilterAuthor={filterAuthor}
                  replies={replyLookup.children.get(comment.id)} onReviewCitation={setReviewTarget} onReply={openComposer}
                  onEdit={(target) => { setEditComment(target); setEditCommentContent(target.content); setEditCommentReferences(target.references); }}
                  onDelete={(commentId) => setDeleteTarget({ type: "comment", id: commentId })}
                  onReport={(commentId) => setReportTarget({ type: "comment", id: commentId })}
                  onModerate={post.canModerate ? (commentId) => setModerationTarget({ type: "comment", id: commentId, action: "RESPONSE_HIDDEN" }) : undefined}
                  onReaction={(reactionName, active) => reaction.mutate({ kind: "comment", id: comment.id, postId: post.id, reaction: reactionName, active }, { onError: () => toast.error(t("Could not update reaction.")) })}
                  onAccept={() => comment.isAccepted ? unaccept.mutate(post.id, { onError: () => toast.error(t("Could not update accepted response.")) }) : accept.mutate({ postId: post.id, commentId: comment.id }, { onError: () => toast.error(t("Could not update accepted response.")) })}
                />)}
                {commentsQuery.hasNextPage ? <div ref={repliesSentinel} className="border-t py-5">{(legacyCommentId || requestedPostNumber) && !deepLinkSettled ? <p role="status" className="mb-3 text-sm text-muted-foreground">{t("This reply is not loaded yet. Load more replies to reach it.")}</p> : null}<Button variant="outline" disabled={commentsQuery.isFetchingNextPage} onClick={() => commentsQuery.fetchNextPage()}>{t(commentsQuery.isFetchingNextPage ? "Loading…" : "Load more replies")}</Button></div> : null}
                {!commentsQuery.isLoading && !commentsQuery.isError && !post.replyCount && !comments.length ? <p className="border-t py-8 text-sm text-muted-foreground">{t("No replies yet. Start the conversation with a question or a reference.")}</p> : null}
              </section>
              <div id="thread-end" tabIndex={-1} className="scroll-mt-24 outline-none">
                {!filteredAuthorId && comments.length ? <ForumTopicStats key={`${post.id}-end`} post={post} comments={comments} hasMore={commentsQuery.hasNextPage} loadingMore={commentsQuery.isFetchingNextPage} onLoadMore={() => void commentsQuery.fetchNextPage()} onJumpToPost={jumpToPost} compact /> : null}
                <div className="flex flex-wrap items-center justify-end gap-2 py-5"><Button type="button" size="sm" disabled={readOnly || (isAuthed && !canReply)} onClick={() => openComposer()} className="gap-1.5 rounded-full"><Reply className="h-4 w-4" aria-hidden="true" />{t("Reply")}</Button><Button type="button" variant="outline" size="sm" aria-pressed={post.isFollowing} disabled={follow.isPending || removed || post.status === "hidden"} onClick={() => { if (!isAuthed) { navigate(`/login?returnTo=${encodeURIComponent(forumPostHref(post))}`); return; } follow.mutate({ postId: post.id, following: !post.isFollowing }, { onError: () => toast.error(t("Could not update follow status.")) }); }}>{t(post.isFollowing ? "Following" : "Follow")}</Button>{notificationControl(true)}</div>
                <div id="response-composer" className="scroll-mt-24">
                  {isAuthed && !removed && post.status !== "hidden" ? <>
                    {canReply ? (
                      <div hidden={!composerOpen} data-expanded={replyExpanded} className="forum-reply-dock" role="region" aria-label={t("Reply to discussion")}>
                        <div className="forum-reply-dock-heading flex items-center justify-between gap-4">
                          <p className="min-w-0 truncate text-sm font-semibold"><Reply aria-hidden="true" className="mr-2 inline h-4 w-4" />{replyTo?.author.fullName ?? post.title}</p>
                          <div className="forum-reply-window-actions">
                            <Button type="button" variant="ghost" size="icon" aria-label={t(replyExpanded ? "Restore composer size" : "Expand composer")} title={t(replyExpanded ? "Restore composer size" : "Expand composer")} onClick={() => setReplyExpanded((value) => !value)}>{replyExpanded ? <Minimize2 /> : <Maximize2 />}</Button>
                            <Button type="button" variant="ghost" size="icon" aria-label={t("Minimize reply composer")} title={t("Your draft is kept while the composer is minimized.")} onClick={() => setComposerOpen(false)}><Minus /></Button>
                            <Button type="reset" form="forum-reply-form" variant="ghost" size="icon" aria-label={t("Close reply composer")} title={t("Close reply composer")} disabled={add.isPending}><X /></Button>
                          </div>
                        </div>
                        {focusRequest > 0 ? <Suspense fallback={<ForumEditorLoading />}>
                          <ForumComposer
                            key={post.id}
                            onSubmit={handleCreateComment}
                            replyTo={replyTo}
                            postContent={post.content}
                            onCancelReply={() => setReplyTo(undefined)}
                            onClose={() => { setComposerOpen(false); setFocusRequest(0); }}
                            compact
                            availablePapers={context?.papers}
                            savedPapers={context?.savedPapers}
                            isSubmitting={add.isPending}
                            focusRequest={focusRequest}
                          />
                        </Suspense> : null}
                      </div>
                    ) : !locked ? <p className="border-t py-6 text-sm text-muted-foreground">{t("This category is read-only or replying is unavailable.")} {post.community ? <Link to={`/forum?category=${encodeURIComponent(post.community.slug)}`} className="text-primary hover:underline">{t("View category")}</Link> : null}</p> : null}
                    {canReply && !composerOpen && focusRequest > 0 ? <button type="button" className="forum-reply-resume" onClick={() => { setComposerOpen(true); setFocusRequest((value) => value + 1); }}><Reply className="h-4 w-4" aria-hidden="true" />{t("Continue reply")}</button> : null}
                  </> : !isAuthed && !readOnly ? <div className="border-t py-7"><p className="text-sm text-muted-foreground">{t("Sign in to join the discussion.")}</p><Button asChild size="sm" className="mt-3"><Link to={`/login?returnTo=${encodeURIComponent(forumPostHref(post))}`}>{t("Sign in")}</Link></Button></div> : null}
                </div>
              </div>
              {!removed && post.status !== "hidden" ? <ForumThreadDiscovery key={post.id} postId={post.id} /> : null}
            </div>
            {timelineIds.length ? <ForumThreadTimeline key={`${post.id}-${filteredAuthorId ?? "all"}`} postIds={timelineIds} postDates={timelineDates} total={filteredAuthorId ? timelineIds.length : (commentsQuery.data?.pages[0]?.meta.total ?? post.replyCount) + 1} createdAt={post.createdAt} lastActivityAt={post.lastActivityAt ?? post.createdAt} hasMore={Boolean(commentsQuery.hasNextPage)} loadingMore={commentsQuery.isLoading || commentsQuery.isFetchingNextPage} onLoadMore={() => void (commentsQuery.hasNextPage ? commentsQuery.fetchNextPage() : commentsQuery.refetch())} onReply={() => openComposer()} replyDisabled={readOnly || (isAuthed && !canReply)} notificationControl={notificationControl()} /> : null}
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
                onChange={(e) => setReportReason(e.target.value as ForumReportReason)}
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-xs"
              >
                <option value="SPAM">{t("Spam")}</option>
                <option value="OFF_TOPIC">{t("Off topic")}</option>
                <option value="HARASSMENT">{t("Harassment")}</option>
                <option value="PRIVACY">{t("Privacy")}</option>
                <option value="PLAGIARISM_CONCERN">{t("Plagiarism concern")}</option>
                <option value="COPYRIGHT_CONCERN">{t("Copyright concern")}</option>
                <option value="INAPPROPRIATE_CONTENT">{t("Inappropriate content")}</option>
                <option value="OTHER">{t("Other")}</option>
              </select>
            </label>
            {reportReason === "COPYRIGHT_CONCERN" && reportTarget ? <Link className="block text-sm text-primary hover:underline" to={"/forum/copyright?type=" + (reportTarget.type === "comment" ? "RESPONSE" : "THREAD") + "&id=" + encodeURIComponent(reportTarget.id)}>{t("Submit a copyright claim")}</Link> : null}
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
            <Button size="sm" disabled={reportPending} onClick={submitReport}>
              {t(reportPending ? "Working…" : "Submit report")}
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
        <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl">
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
                maxLength={240}
                disabled={updatePost.isPending}
              />
            </label>
            <div className="space-y-1.5"><p className="text-sm font-semibold">{t("Body")}</p><Suspense fallback={<ForumEditorLoading />}><ForumBodyEditor value={editContent} onChange={setEditContent} references={editReferences} onReferencesChange={setEditReferences} maxLength={20000} label={t("Discussion body")} disabled={updatePost.isPending} /></Suspense></div>
            <label className="block space-y-1.5 text-xs font-semibold">
              <span>{t("Tags")}</span>
              <Input
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                disabled={updatePost.isPending}
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
        <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("Edit response")}</DialogTitle>
            <DialogDescription>{t("Your changes will be visible in this discussion.")}</DialogDescription>
          </DialogHeader>
          <Suspense fallback={<ForumEditorLoading />}><ForumBodyEditor value={editCommentContent} onChange={setEditCommentContent} references={editCommentReferences} onReferencesChange={setEditCommentReferences} maxLength={10000} label={t("Response")} disabled={updateComment.isPending} /></Suspense>
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
