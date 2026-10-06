import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { ForumPostType } from "@trend/shared-types";
import { ArrowLeft, Maximize2, MessageSquare, Minimize2, Search, Send } from "lucide-react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ForumLayout, ForumSurface } from "@/features/forum/components/forum-layout";
import { ForumBodyEditor } from "@/features/forum/components/forum-body-editor";
import { ForumDoiLookup } from "@/features/forum/components/forum-doi-lookup";
import { ForumTagInput } from "@/features/forum/components/forum-tag-input";
import { ForumSidebar } from "@/features/forum/components/forum-sidebar";
import { useCreateForumPost, useForumContext, useForumPaperSearch, useShareForumGap } from "@/features/forum/hooks/use-forum";
import { forumPaperApi, type ForumPaperSearchResult } from "@/features/forum/api/forum-paper.api";
import type { ForumReferenceView } from "@/features/forum/api/forum.api";
import { buildForumDiscussionInput, forumInitialDiscussionType, forumDiscussionTags, FORUM_DISCUSSION_TAG_LIMIT } from "@/features/forum/utils/forum-discussion-editor";
import { useForumCategories } from "@/features/forum/hooks/use-forum-categories";
import { isValidDoi, normalizeDoi } from "@/features/projects/utils/doi";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/utils/cn";
import { forumPostHref } from "@/features/forum/utils/forum-helpers";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const THREAD_TYPES: Array<{ value: ForumPostType; label: string; detail: string }> = [
  { value: "QUESTION", label: "Question", detail: "Ask a focused research question and provide enough context for useful answers." },
  { value: "DISCUSSION", label: "Discussion", detail: "Start an academic discussion around a method, finding, research direction, or research problem." },
  { value: "PAPER_DISCUSSION", label: "Paper Discussion", detail: "Critique, reproduce findings, or discuss limitations of a specific paper." },
  { value: "RESEARCH_GAP_DISCUSSION", label: "Research Gap Discussion", detail: "Invite researchers to examine a candidate research gap." },
];
const TITLE_PLACEHOLDERS: Record<ForumPostType, string> = {
  QUESTION: "State your research question clearly",
  DISCUSSION: "What would you like to discuss?",
  PAPER_DISCUSSION: "What aspect of this paper would you like to discuss?",
  RESEARCH_GAP_DISCUSSION: "What should the community examine about this candidate gap?",
};
const BODY_PLACEHOLDERS: Record<ForumPostType, string> = {
  QUESTION: "Explain the context, what you have considered, and the specific answer or evidence you are seeking.",
  DISCUSSION: "Share the context, method, finding, or research direction you would like the community to explore.",
  PAPER_DISCUSSION: "Describe the aspect of this paper you want to critique, reproduce, or understand with other researchers.",
  RESEARCH_GAP_DISCUSSION: "Explain why this gap matters, what the literature suggests, and what you would like the community to examine.",
};
const fieldClass = "h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

type ForumDiscussionComposerProps = {
  embedded?: boolean;
  onClose?: () => void;
  onPublished?: (postId: string) => void;
  closeRequest?: number;
  expanded?: boolean;
  onToggleExpand?: () => void;
  resizeHandle?: ReactNode;
};

type ForumDiscussionDraftStorage = {
  type: ForumPostType;
  communityId: string;
  title: string;
  content: string;
  tags: string;
  linkedPaperId: string;
  linkedPaperLabel: string;
  linkedGapId: string;
  references: ForumReferenceView[];
};

function isStoredForumReference(value: unknown): value is ForumReferenceView {
  if (!value || typeof value !== "object") return false;
  const reference = value as Record<string, unknown>;
  return (typeof reference.paperId === "string" || typeof reference.doi === "string") && (reference.title === undefined || typeof reference.title === "string") && (reference.year === undefined || typeof reference.year === "number");
}

export function ForumNewPage() {
  return <ForumDiscussionComposer />;
}

export function ForumDiscussionComposer({ embedded = false, onClose, onPublished, closeRequest = 0, expanded = false, onToggleExpand, resizeHandle }: ForumDiscussionComposerProps) {
  const { t } = useI18n();
  const isAuthed = useAuthStore((state) => Boolean(state.tokens?.accessToken));
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const create = useCreateForumPost();
  const shareGap = useShareForumGap();
  const communitiesQuery = useForumCategories();
  const initialType = forumInitialDiscussionType(searchParams);
  const [type, setType] = useState<ForumPostType>(() => initialType);
  const contextEnabled = type === "PAPER_DISCUSSION" || type === "RESEARCH_GAP_DISCUSSION";
  const contextQuery = useForumContext(undefined, contextEnabled);
  const context = contextQuery.data;
  // Incoming links remain subject to the server's gap access and shareability checks.
  const requestedGapId = searchParams.get("gap");
  const requestedGapTitle = searchParams.get("gapTitle");
  const contextGaps = useMemo(() => {
    const own = context?.gaps ?? [];
    if (!requestedGapId || own.some((gap) => gap.id === requestedGapId)) return own;
    return [{ id: requestedGapId, title: requestedGapTitle ?? requestedGapId, topic: "", forumShareable: true }, ...own];
  }, [context?.gaps, requestedGapId, requestedGapTitle]);
  const joined = useMemo(() => (communitiesQuery.data ?? []).filter((community) => community.status === "ACTIVE"), [communitiesQuery.data]);

  const [communityId, setCommunityId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [tagInputValid, setTagInputValid] = useState(true);
  const [linkedPaperId, setLinkedPaperId] = useState("");
  const [linkedPaperLabel, setLinkedPaperLabel] = useState("");
  const [linkedGapId, setLinkedGapId] = useState("");
  const [references, setReferences] = useState<ForumReferenceView[]>([]);
  const [paperSearchText, setPaperSearchText] = useState("");
  const [paperSearch, setPaperSearch] = useState("");
  const [error, setError] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const submittingRef = useRef(false);
  const initializedCommunity = useRef(false);
  const initializedGap = useRef(false);
  const initializedPaper = useRef(false);
  const draftKey = useMemo(() => {
    const key = [(searchParams.get("category") ?? searchParams.get("community")) ?? "all", searchParams.get("type") ?? "QUESTION", searchParams.get("paper") ?? "none", searchParams.get("gap") ?? "none"].join(":");
    return `lumigap:forum-draft:v1:${key}`;
  }, [searchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => setPaperSearch(paperSearchText.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [paperSearchText]);
  const paperLookupQuery = useForumPaperSearch(paperSearch, type === "PAPER_DISCUSSION" && !isValidDoi(paperSearch));

  // Resolve URL defaults once, after real options load. Clearing or editing a
  // field must not keep reapplying the defaults over the user's draft.
  useEffect(() => {
    if (initializedCommunity.current || !communitiesQuery.data) return;
    initializedCommunity.current = true;
    const requested = (searchParams.get("category") ?? searchParams.get("community"));
    const community = joined.find((item) => item.id === requested || item.slug === requested);
    if (community) setCommunityId(community.id);
  }, [communitiesQuery.data, joined, searchParams]);
  useEffect(() => {
    if (initializedGap.current || !context || type !== "RESEARCH_GAP_DISCUSSION") return;
    initializedGap.current = true;
    const gap = contextGaps.find((item) => item.id === searchParams.get("gap"));
    if (gap) setLinkedGapId(gap.id);
  }, [context, contextGaps, searchParams, type]);
  useEffect(() => {
    if (initializedPaper.current || !context || type !== "PAPER_DISCUSSION") return;
    initializedPaper.current = true;
    const paper = context.papers.find((item) => item.id === searchParams.get("paper"));
    if (paper) { setLinkedPaperId(paper.id); setLinkedPaperLabel(paper.title); }
  }, [context, searchParams, type]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw) as Partial<ForumDiscussionDraftStorage>;
        if (draft.type && THREAD_TYPES.some((option) => option.value === draft.type)) setType(draft.type);
        if (typeof draft.communityId === "string") setCommunityId(draft.communityId);
        if (typeof draft.title === "string") setTitle(draft.title);
        if (typeof draft.content === "string") setContent(draft.content);
        if (typeof draft.tags === "string") setTags(draft.tags);
        if (typeof draft.linkedPaperId === "string") setLinkedPaperId(draft.linkedPaperId);
        if (typeof draft.linkedPaperLabel === "string") setLinkedPaperLabel(draft.linkedPaperLabel);
        if (typeof draft.linkedGapId === "string") setLinkedGapId(draft.linkedGapId);
        if (Array.isArray(draft.references)) setReferences(draft.references.filter(isStoredForumReference));
      }
    } catch { /* Local storage may be disabled or contain an older draft shape. */ }
    setDraftHydrated(true);
  }, [draftKey]);

  const selectedGap = contextGaps.find((gap) => gap.id === linkedGapId);
  const selectedCommunity = joined.find((community) => community.id === communityId);
  const canPublish = Boolean(communityId && joined.some((community) => community.id === communityId) && title.trim().length >= 3 && content.trim() && tagInputValid && forumDiscussionTags(tags).length <= FORUM_DISCUSSION_TAG_LIMIT && (type !== "PAPER_DISCUSSION" || linkedPaperId) && (type !== "RESEARCH_GAP_DISCUSSION" || selectedGap?.forumShareable));
  const hasDraft = Boolean(title.trim() || content.trim() || tags.trim() || (type === "PAPER_DISCUSSION" && linkedPaperId) || (type === "RESEARCH_GAP_DISCUSSION" && linkedGapId) || references.length);
  const paperResults = paperLookupQuery.data ?? [];
  const titleNearLimit = title.length >= 200;

  useEffect(() => {
    if (!draftHydrated) return;
    const timer = window.setTimeout(() => {
      try {
        if (!hasDraft) { window.localStorage.removeItem(draftKey); return; }
        window.localStorage.setItem(draftKey, JSON.stringify({ type, communityId, title, content, tags, linkedPaperId, linkedPaperLabel, linkedGapId, references } satisfies ForumDiscussionDraftStorage));
      } catch { /* Quota and private browsing failures must not block publishing. */ }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [communityId, content, draftHydrated, draftKey, hasDraft, linkedGapId, linkedPaperId, linkedPaperLabel, references, tags, title, type]);

  const selectPaper = (paper: { id: string; title: string }) => {
    setLinkedPaperId(paper.id);
    setLinkedPaperLabel(paper.title);
    setPaperSearchText("");
    setPaperSearch("");
  };
  const activePaperSearch = useRef({ type, text: paperSearchText, mounted: true });
  activePaperSearch.current.type = type;
  activePaperSearch.current.text = paperSearchText;
  useEffect(() => { activePaperSearch.current.mounted = true; return () => { activePaperSearch.current.mounted = false; }; }, []);
  const attachSearchedPaper = useMutation({
    mutationFn: ({ paper }: { paper: ForumPaperSearchResult; text: string }) => paper.paperId ? Promise.resolve({ ...paper, paperId: paper.paperId }) : forumPaperApi.attachOpenAlex(paper.openalexId),
    onSuccess: (paper, variables) => {
      if (activePaperSearch.current.mounted && activePaperSearch.current.type === "PAPER_DISCUSSION" && activePaperSearch.current.text === variables.text) selectPaper({ id: paper.paperId, title: paper.title });
    },
  });
  const closeComposer = useCallback(() => {
    if (submittingRef.current || create.isPending) return;
    if (hasDraft) { setDiscardOpen(true); return; }
    if (onClose) onClose();
    else navigate("/forum");
  }, [create.isPending, hasDraft, navigate, onClose]);
  const discardDraft = () => {
    setDiscardOpen(false);
    if (onClose) onClose();
    else navigate("/forum");
  };
  const cancel = () => {
    closeComposer();
  };
  const handledCloseRequest = useRef(closeRequest);
  useEffect(() => {
    if (handledCloseRequest.current === closeRequest) return;
    handledCloseRequest.current = closeRequest;
    if (embedded && closeRequest > 0) closeComposer();
  }, [closeRequest, embedded, closeComposer]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submittingRef.current || create.isPending) return;
    const result = buildForumDiscussionInput({ type, communityId, title, content, tags, linkedPaperId, linkedGapId, references }, joined, contextGaps);
    if ("error" in result) { setError(t(result.error)); return; }
    setError("");
    submittingRef.current = true;
    try {
      const post = await create.mutateAsync(result.input);
      try { window.localStorage.removeItem(draftKey); } catch { /* Ignore unavailable local storage after a successful publish. */ }
      toast.success(t("Discussion published"));
      if (onPublished) onPublished(post.publicSlug ?? post.id);
      else navigate(forumPostHref(post));
    } catch {
      setError(t("Could not publish this discussion. Your draft has been kept. Please try again."));
    } finally { submittingRef.current = false; }
  }

  const form = (
    <form onSubmit={submit} aria-labelledby="new-discussion-heading" className={embedded ? "flex h-full min-h-0 flex-col" : undefined}>
      <header className="relative flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-5 pb-4 pt-6 sm:px-6">
        {resizeHandle}
        <h1 id="new-discussion-heading" className="flex items-center gap-2 text-xl font-semibold"><MessageSquare className="h-5 w-5 text-muted-foreground" />{t("New discussion")}</h1>
        <div className="flex items-center gap-1">
          {embedded && onToggleExpand ? <Button type="button" variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground" onClick={onToggleExpand} aria-label={t(expanded ? "Restore composer size" : "Expand composer")} title={t(expanded ? "Restore composer size" : "Expand composer")}><span className="sr-only">{t(expanded ? "Restore composer size" : "Expand composer")}</span>{expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</Button> : null}
          <Button type="button" variant="ghost" className="h-11 text-base text-muted-foreground" onClick={cancel} disabled={create.isPending}><ArrowLeft className="h-4 w-4" />{t(embedded ? "Close" : "Back to Forum")}</Button>
        </div>
      </header>
      <fieldset disabled={create.isPending} className={cn("min-w-0", embedded && "flex min-h-0 flex-1 flex-col")}>
        <div className={embedded ? "min-h-0 flex-1 overflow-y-auto overscroll-y-contain" : undefined} data-composer-scroll={embedded ? "body" : undefined}>
        <div className="space-y-3 px-5 pt-4 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="min-w-0">
              <span className="sr-only">{t("Category")} *</span>
              <select aria-label={t("Category")} required value={communityId} onChange={(event) => setCommunityId(event.target.value)} disabled={communitiesQuery.isLoading || communitiesQuery.isError} className={cn(fieldClass, "h-12 rounded-lg font-medium")}>
                <option value="">{t("Select a category")}</option>
                {joined.map((community) => <option key={community.id} value={community.id}>{t(community.name)}</option>)}
              </select>
            </label>
            <label className="min-w-0">
              <span className="sr-only">{t("Thread type")} *</span>
              <select aria-label={t("Thread type")} required value={type} className={cn(fieldClass, "h-12 rounded-lg font-medium")} onChange={(event) => setType(event.target.value as ForumPostType)}>
                {THREAD_TYPES.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
              </select>
            </label>
          </div>
          <div className="relative min-w-0">
            <label htmlFor="discussion-title" className="sr-only">{t("Discussion title")}</label>
            <Input id="discussion-title" required minLength={3} maxLength={240} value={title} onChange={(event) => setTitle(event.target.value)} aria-label={t("Discussion title")} placeholder={t(TITLE_PLACEHOLDERS[type])} className="h-14 rounded-lg border-input px-4 text-lg font-medium shadow-none focus-visible:ring-2 md:text-lg" />
            {titleNearLimit ? <span className="pointer-events-none absolute bottom-2 right-3 text-xs tabular-nums text-muted-foreground" aria-live="polite">{title.length}/240</span> : null}
          </div>
          <p className="text-sm leading-5 text-muted-foreground">{t(THREAD_TYPES.find((option) => option.value === type)!.detail)}</p>
          {communitiesQuery.isLoading ? <p role="status" className="text-sm text-muted-foreground">{t("Loading categories")}</p> : communitiesQuery.isError ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive"><span>{t("Could not load categories.")}</span><button type="button" className="rounded underline focus-visible:ring-2 focus-visible:ring-ring" onClick={() => void communitiesQuery.refetch()}>{t("Retry")}</button></div> : !joined.length ? <p className="rounded-md border border-border bg-muted/40 p-3 text-sm leading-6 text-muted-foreground">{t("No active categories are available. Please try again later.")}</p> : null}
        </div>

        <div className="px-5 pt-4 sm:px-6"><ForumBodyEditor id="discussion-body" label={t("Discussion body")} value={content} onChange={setContent} references={references} onReferencesChange={setReferences} maxLength={20000} disabled={create.isPending} describedBy={error ? "discussion-error" : "discussion-help"} placeholder={t(BODY_PLACEHOLDERS[type])} className={expanded ? "forum-editor-expanded" : undefined} /></div>

        <div className="space-y-3 px-5 pt-4 sm:px-6">
          {contextEnabled ? <section id="discussion-type-source" className="space-y-3 rounded-md border border-border bg-muted/10 p-3" aria-label={t(type === "PAPER_DISCUSSION" ? "Linked Paper" : "Candidate Research Gap")}>
            {contextQuery.isLoading ? <p role="status" className="text-sm text-muted-foreground">{t("Loading research context…")}</p> : contextQuery.isError ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive"><span>{t("Could not load research context.")}</span><button type="button" className="rounded underline focus-visible:ring-2 focus-visible:ring-ring" onClick={() => void contextQuery.refetch()}>{t("Retry")}</button></div> : null}
            <div className="min-w-0 space-y-3">
              {type === "PAPER_DISCUSSION" ? <div className="min-w-0 space-y-2">
                <span className="text-sm font-medium">{t("Linked Paper")} *</span>
                {linkedPaperId ? <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2"><span className="min-w-0 truncate text-sm font-medium">{linkedPaperLabel || linkedPaperId}</span><Button type="button" variant="ghost" className="h-9 shrink-0" onClick={() => { setLinkedPaperId(""); setLinkedPaperLabel(""); }}>{t("Change")}</Button></div> : <>
                  <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label={t("Linked Paper")} maxLength={300} disabled={attachSearchedPaper.isPending} value={paperSearchText} onChange={(event) => { setPaperSearchText(event.target.value); attachSearchedPaper.reset(); }} placeholder={t("Search OpenAlex papers or enter a DOI")} className="h-11 pl-9 text-base" required={type === "PAPER_DISCUSSION"} autoComplete="off" /></div>
                  {!isValidDoi(paperSearchText) ? <>
                    {paperSearchText.trim().length < 3 ? <p className="text-xs text-muted-foreground">{t("Type at least 3 characters to search.")}</p> : paperLookupQuery.isLoading || paperSearchText.trim() !== paperSearch ? <p role="status" className="text-xs text-muted-foreground">{t("Searching papers…")}</p> : paperLookupQuery.isError ? <div role="alert" className="text-sm text-destructive">{t("Could not load papers.")} <Button type="button" variant="ghost" onClick={() => void paperLookupQuery.refetch()}>{t("Try again")}</Button></div> : paperResults.length ? <div className="max-h-44 overflow-y-auto rounded-md border border-border" role="listbox" aria-label={t("Paper search results")}>{paperResults.map((paper) => <button type="button" role="option" aria-selected={false} key={paper.openalexId} disabled={!paper.canAttach || attachSearchedPaper.isPending} className="flex w-full items-start gap-3 border-b border-border px-3 py-2 text-left last:border-0 hover:bg-muted/40 disabled:opacity-50" onClick={() => attachSearchedPaper.mutate({ paper, text: paperSearchText })}><span className="min-w-0"><span className="block text-sm font-medium">{paper.title}</span><span className="block text-xs text-muted-foreground">{[paper.authors.join(", "), paper.publicationYear, paper.venue, paper.doi].filter(Boolean).join(" · ")}</span></span></button>)}</div> : <p className="text-xs text-muted-foreground">{t("No papers found")}</p>}
                  </> : null}
                  {attachSearchedPaper.isPending ? <p role="status" className="text-sm text-muted-foreground">{t("Attaching paper…")}</p> : attachSearchedPaper.isError ? <p role="alert" className="text-sm text-destructive">{t("Could not attach this paper. Please try again.")}</p> : null}
                  {isValidDoi(paperSearchText) ? <ForumDoiLookup key={normalizeDoi(paperSearchText)} doi={normalizeDoi(paperSearchText)} onAttach={(paper) => selectPaper({ id: paper.paperId, title: paper.title })} /> : null}
                </>}
              </div> : null}
              {type === "RESEARCH_GAP_DISCUSSION" ? <label className="block min-w-0 space-y-2 text-sm font-medium"><span>{t("Candidate Research Gap")} *</span><select aria-label={t("Candidate Research Gap")} required value={linkedGapId} onChange={(event) => setLinkedGapId(event.target.value)} className={fieldClass}><option value="">{t("No linked research gap")}</option>{contextGaps.map((gap) => <option key={gap.id} value={gap.id}>{gap.title}{gap.forumShareable ? "" : ` · ${t("Private")}`}</option>)}</select></label> : null}
            </div>
            {type === "RESEARCH_GAP_DISCUSSION" && selectedGap && !selectedGap.forumShareable ? <div className="rounded-md border border-border bg-muted/40 p-3 text-sm leading-6"><p>{t("This candidate gap is private. Make it shareable before linking it to a forum thread.")}</p><Button type="button" variant="outline" className="mt-2 h-10" disabled={shareGap.isPending} onClick={() => void shareGap.mutateAsync(selectedGap.id).then(() => toast.success(t("Research gap is now shareable"))).catch(() => toast.error(t("Could not share this research gap")))}>{t("Make gap shareable")}</Button></div> : null}
          </section> : null}
          <ForumTagInput value={tags} onChange={setTags} onValidityChange={setTagInputValid} />
          <p id="discussion-help" className="pb-2 text-sm text-muted-foreground">{t("Keep claims specific and cite sources where possible.")}</p>
          {error ? <p id="discussion-error" role="alert" className="mb-2 rounded-md border border-destructive/40 p-3 text-base text-destructive">{error}</p> : null}
        </div>
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-background px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          <p className="hidden text-sm text-muted-foreground sm:block">{selectedCommunity ? t("Anyone can read this discussion.") : t("Select a category before publishing.")}</p>
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="ghost" className="h-11 text-base text-muted-foreground" onClick={cancel}>{t("Discard")}</Button>
            <Button type="submit" disabled={create.isPending || !canPublish} className="h-11 min-w-32 text-base shadow-none"><Send className="h-4 w-4" />{t(create.isPending ? "Publishing…" : "Publish discussion")}</Button>
          </div>
        </footer>
      </fieldset>
      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Discard this discussion draft?")}</DialogTitle>
            <DialogDescription>{t("Your unsaved discussion content will be lost.")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDiscardOpen(false)}>{t("Keep editing")}</Button>
            <Button type="button" variant="destructive" onClick={() => { try { window.localStorage.removeItem(draftKey); } catch { /* Ignore unavailable local storage. */ } discardDraft(); }}>{t("Discard draft")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );

  if (embedded) return <div className="forum-compose flex min-h-0 flex-1 flex-col overflow-hidden">{form}</div>;
  return <ForumLayout sidebar={<ForumSidebar communities={communitiesQuery.data} communitiesLoading={communitiesQuery.isLoading} communitiesError={communitiesQuery.isError} onRetryCommunities={() => void communitiesQuery.refetch()} isAuthed={isAuthed} />}><ForumSurface className="forum-compose overflow-hidden"><div className="flex min-h-16 items-center pl-16 pr-5 lg:hidden"><Link to="/forum" className="rounded text-sm font-semibold text-muted-foreground hover:text-primary focus-visible:ring-2 focus-visible:ring-ring">{t("Research Forum")}</Link></div>{form}</ForumSurface></ForumLayout>;
}
