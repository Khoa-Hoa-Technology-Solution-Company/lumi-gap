import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { ForumPostType } from "@trend/shared-types";
import { ArrowLeft, BookOpen, Check, ChevronRight, FileSearch, Loader2, Maximize2, MessageSquare, Minimize2, Plus, Search, Send, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ForumLayout, ForumSurface } from "@/features/forum/components/forum-layout";
import { ForumBodyEditor } from "@/features/forum/components/forum-body-editor";
import { ForumSidebar } from "@/features/forum/components/forum-sidebar";
import { useCommunities, useCreateForumPost, useForumContext, useShareForumGap } from "@/features/forum/hooks/use-forum";
import type { ForumReferenceView } from "@/features/forum/api/forum.api";
import { buildForumDiscussionInput, forumInitialDiscussionType } from "@/features/forum/utils/forum-discussion-editor";
import { isValidDoi, matchesExactDoi, normalizeDoi } from "@/features/projects/utils/doi";
import { useI18n } from "@/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/utils/cn";
import { forumPostHref } from "@/features/forum/utils/forum-helpers";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const THREAD_TYPES: Array<{ value: ForumPostType; label: string; detail: string }> = [
  { value: "QUESTION", label: "Question", detail: "Ask a focused research question and provide enough context for useful answers." },
  { value: "DISCUSSION", label: "Discussion", detail: "Start an academic discussion around a method, finding, research direction, or research problem." },
  { value: "PAPER_DISCUSSION", label: "Paper Discussion", detail: "Critique, reproduce findings, or discuss limitations of a specific paper." },
  { value: "RESEARCH_GAP_DISCUSSION", label: "Research Gap Discussion", detail: "Invite the community to examine and validate a candidate research gap." },
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
  linkedProjectId: string;
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

export function ForumDiscussionComposer({ embedded = false, onClose, onPublished, closeRequest = 0, expanded = false, onToggleExpand }: ForumDiscussionComposerProps) {
  const { t } = useI18n();
  const isAuthed = useAuthStore((state) => Boolean(state.tokens?.accessToken));
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const create = useCreateForumPost();
  const shareGap = useShareForumGap();
  const communitiesQuery = useCommunities();
  const initialType = forumInitialDiscussionType(searchParams);
  const [type, setType] = useState<ForumPostType>(() => initialType);
  const [contextOpen, setContextOpen] = useState(() => ["PAPER_DISCUSSION", "RESEARCH_GAP_DISCUSSION"].includes(initialType));
  const contextEnabled = contextOpen || Boolean(searchParams.get("gap") || searchParams.get("paper"));
  const contextQuery = useForumContext(undefined, contextEnabled);
  const context = contextQuery.data;
  // A gap opened from a community page may belong to someone else; the server re-checks that it is shareable.
  const requestedGapId = searchParams.get("gap");
  const requestedGapTitle = searchParams.get("gapTitle");
  const contextGaps = useMemo(() => {
    const own = context?.gaps ?? [];
    if (!requestedGapId || own.some((gap) => gap.id === requestedGapId)) return own;
    return [{ id: requestedGapId, title: requestedGapTitle ?? requestedGapId, topic: "", forumShareable: true }, ...own];
  }, [context?.gaps, requestedGapId, requestedGapTitle]);
  const joined = useMemo(() => (communitiesQuery.data ?? []).filter((community) => community.status === "ACTIVE" && community.viewerMembership?.status === "active"), [communitiesQuery.data]);

  const [communityId, setCommunityId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [linkedPaperId, setLinkedPaperId] = useState("");
  const [linkedPaperLabel, setLinkedPaperLabel] = useState("");
  const [linkedGapId, setLinkedGapId] = useState("");
  const [linkedProjectId, setLinkedProjectId] = useState("");
  const [references, setReferences] = useState<ForumReferenceView[]>([]);
  const [citationOpen, setCitationOpen] = useState(false);
  const [citationMode, setCitationMode] = useState<"search" | "doi">("search");
  const [citationText, setCitationText] = useState("");
  const [citationSearch, setCitationSearch] = useState("");
  const [pendingCitationIds, setPendingCitationIds] = useState<string[]>([]);
  const [paperSearchText, setPaperSearchText] = useState("");
  const [paperSearch, setPaperSearch] = useState("");
  const [tagsOpen, setTagsOpen] = useState(false);
  const [advancedContextOpen, setAdvancedContextOpen] = useState(false);
  const [error, setError] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const submittingRef = useRef(false);
  const initializedCommunity = useRef(false);
  const initializedGap = useRef(false);
  const initializedPaper = useRef(false);
  const draftKey = useMemo(() => {
    const key = [searchParams.get("community") ?? "all", searchParams.get("type") ?? "QUESTION", searchParams.get("paper") ?? "none", searchParams.get("gap") ?? "none"].join(":");
    return `lumigap:forum-draft:v1:${key}`;
  }, [searchParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => setPaperSearch(paperSearchText.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [paperSearchText]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const normalized = citationMode === "doi" ? normalizeDoi(citationText) : citationText.trim();
      setCitationSearch(normalized);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [citationMode, citationText]);
  const paperLookupQuery = useForumContext(paperSearch || undefined, Boolean(paperSearch));
  const citationLookupQuery = useForumContext(citationSearch || undefined, citationOpen && citationSearch.length >= (citationMode === "doi" ? 1 : 3));

  // Resolve URL defaults once, after real options load. Clearing or editing a
  // field must not keep reapplying the defaults over the user's draft.
  useEffect(() => {
    if (initializedCommunity.current || !communitiesQuery.data) return;
    initializedCommunity.current = true;
    const requested = searchParams.get("community");
    const community = joined.find((item) => item.id === requested || item.slug === requested);
    if (community) setCommunityId(community.id);
  }, [communitiesQuery.data, joined, searchParams]);
  useEffect(() => {
    if (initializedGap.current || !context) return;
    initializedGap.current = true;
    const gap = contextGaps.find((item) => item.id === searchParams.get("gap"));
    if (gap) { setType("RESEARCH_GAP_DISCUSSION"); setLinkedGapId(gap.id); setContextOpen(true); }
  }, [context, contextGaps, searchParams]);
  useEffect(() => {
    if (initializedPaper.current || !context) return;
    initializedPaper.current = true;
    const paper = context.papers.find((item) => item.id === searchParams.get("paper"));
    if (paper) { setType("PAPER_DISCUSSION"); setLinkedPaperId(paper.id); setLinkedPaperLabel(paper.title); setContextOpen(true); }
  }, [context, searchParams]);
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
        if (typeof draft.linkedProjectId === "string") setLinkedProjectId(draft.linkedProjectId);
        if (Array.isArray(draft.references)) setReferences(draft.references.filter(isStoredForumReference));
        if (draft.title || draft.content || draft.references?.length) setContextOpen(true);
      }
    } catch { /* Local storage may be disabled or contain an older draft shape. */ }
    setDraftHydrated(true);
  }, [draftKey]);

  const selectedGap = contextGaps.find((gap) => gap.id === linkedGapId);
  const contextCount = [linkedPaperId, linkedGapId, linkedProjectId].filter(Boolean).length;
  const selectedCommunity = joined.find((community) => community.id === communityId);
  const canPublish = Boolean(communityId && joined.some((community) => community.id === communityId) && title.trim().length >= 3 && content.trim() && (type !== "PAPER_DISCUSSION" || linkedPaperId) && (type !== "RESEARCH_GAP_DISCUSSION" || selectedGap?.forumShareable));
  const hasDraft = Boolean(title.trim() || content.trim() || tags.trim() || linkedPaperId || linkedGapId || linkedProjectId || references.length);
  const paperResults = paperSearch ? (paperLookupQuery.data?.papers ?? []) : (context?.savedPapers?.length ? context.savedPapers : (context?.papers ?? []));
  const citationResults = (citationLookupQuery.data?.papers ?? []).filter((paper) => citationMode !== "doi" || matchesExactDoi(paper.doi, citationSearch));
  const pendingCitationSet = new Set(pendingCitationIds);
  const titleNearLimit = title.length >= 200;

  useEffect(() => {
    if (!draftHydrated) return;
    const timer = window.setTimeout(() => {
      try {
        if (!hasDraft) { window.localStorage.removeItem(draftKey); return; }
        window.localStorage.setItem(draftKey, JSON.stringify({ type, communityId, title, content, tags, linkedPaperId, linkedPaperLabel, linkedGapId, linkedProjectId, references } satisfies ForumDiscussionDraftStorage));
      } catch { /* Quota and private browsing failures must not block publishing. */ }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [communityId, content, draftHydrated, draftKey, hasDraft, linkedGapId, linkedPaperId, linkedPaperLabel, linkedProjectId, references, tags, title, type]);

  const selectPaper = (paper: { id: string; title: string }) => {
    setLinkedPaperId(paper.id);
    setLinkedPaperLabel(paper.title);
    setPaperSearchText("");
    setPaperSearch("");
  };
  const toggleCitation = (paper: { id: string; title: string; doi?: string; publicationYear?: number }) => {
    setPendingCitationIds((current) => current.includes(paper.id) ? current.filter((id) => id !== paper.id) : [...current, paper.id]);
  };
  const attachCitations = () => {
    const additions = citationResults.filter((paper) => pendingCitationSet.has(paper.id)).map((paper) => ({
      paperId: paper.id,
      doi: paper.doi,
      title: paper.title,
      year: paper.publicationYear,
      verified: true,
    } satisfies ForumReferenceView));
    setReferences((current) => [...current, ...additions.filter((candidate) => !current.some((reference) => reference.paperId === candidate.paperId))]);
    setPendingCitationIds([]);
    setCitationText("");
    setCitationSearch("");
  };
  const removeCitation = (paperId?: string, doi?: string) => setReferences((current) => current.filter((reference) => paperId ? reference.paperId !== paperId : reference.doi !== doi));
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
    const result = buildForumDiscussionInput({ type, communityId, title, content, tags, linkedPaperId, linkedGapId, linkedProjectId, references }, joined, contextGaps);
    if ("error" in result) { setError(t(result.error)); setContextOpen(true); return; }
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
    <form onSubmit={submit} aria-labelledby="new-discussion-heading">
      <header className="relative flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 pb-4 pt-6 sm:px-6">
        <span className="absolute left-1/2 top-2 h-1 w-16 -translate-x-1/2 rounded-full bg-muted-foreground/30" aria-hidden="true" />
        <h1 id="new-discussion-heading" className="flex items-center gap-2 text-xl font-semibold"><MessageSquare className="h-5 w-5 text-muted-foreground" />{t("New discussion")}</h1>
        <div className="flex items-center gap-1">
          {embedded && onToggleExpand ? <Button type="button" variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground" onClick={onToggleExpand} aria-label={t(expanded ? "Restore composer size" : "Expand composer")} title={t(expanded ? "Restore composer size" : "Expand composer")}><span className="sr-only">{t(expanded ? "Restore composer size" : "Expand composer")}</span>{expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</Button> : null}
          <Button type="button" variant="ghost" className="h-11 text-base text-muted-foreground" onClick={cancel} disabled={create.isPending}><ArrowLeft className="h-4 w-4" />{t(embedded ? "Close" : "Back to Forum")}</Button>
        </div>
      </header>
      <fieldset disabled={create.isPending} className="min-w-0">
        <div className="space-y-3 px-5 pt-4 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="min-w-0">
              <span className="sr-only">{t("Community")} *</span>
              <select aria-label={t("Community")} required value={communityId} onChange={(event) => setCommunityId(event.target.value)} disabled={communitiesQuery.isLoading || communitiesQuery.isError} className={cn(fieldClass, "h-12 rounded-lg font-medium")}>
                <option value="">{t("Select a joined community")}</option>
                {joined.map((community) => <option key={community.id} value={community.id}>{community.name}</option>)}
              </select>
            </label>
            <label className="min-w-0">
              <span className="sr-only">{t("Thread type")} *</span>
              <select aria-label={t("Thread type")} required value={type} className={cn(fieldClass, "h-12 rounded-lg font-medium")} onChange={(event) => { const value = event.target.value as ForumPostType; setType(value); if (value === "PAPER_DISCUSSION" || value === "RESEARCH_GAP_DISCUSSION") setContextOpen(true); }}>
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
          {communitiesQuery.isLoading ? <p role="status" className="text-sm text-muted-foreground">{t("Loading communities")}</p> : communitiesQuery.isError ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive"><span>{t("Could not load communities.")}</span><button type="button" className="rounded underline focus-visible:ring-2 focus-visible:ring-ring" onClick={() => void communitiesQuery.refetch()}>{t("Retry")}</button></div> : !joined.length ? <p className="rounded-md border border-border bg-muted/40 p-3 text-sm leading-6 text-muted-foreground">{t("You need to join an academic community before posting.")} <Link to="/communities" className="font-medium text-primary hover:underline">{t("Browse communities")}</Link></p> : null}
        </div>

        <div className="px-5 pt-4 sm:px-6"><ForumBodyEditor id="discussion-body" label={t("Discussion body")} value={content} onChange={setContent} maxLength={20000} disabled={create.isPending} describedBy={error ? "discussion-error" : "discussion-help"} placeholder={t(BODY_PLACEHOLDERS[type])} className={expanded ? "forum-editor-expanded" : undefined} /></div>

        <div className="space-y-3 px-5 pt-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Button type="button" variant={citationOpen ? "secondary" : "ghost"} className="h-10 text-sm" onClick={() => setCitationOpen((open) => !open)}><Plus className="h-4 w-4" />{t("Add citation")}{references.length ? ` (${references.length})` : ""}</Button>
            <Button type="button" variant={contextOpen ? "secondary" : "ghost"} className="h-10 text-sm" aria-expanded={contextOpen} aria-controls="discussion-research-context" onClick={() => setContextOpen((open) => !open)}><BookOpen className="h-4 w-4" />{t("Link research context")}{contextCount ? ` (${contextCount})` : ""}</Button>
            <Button type="button" variant={tagsOpen ? "secondary" : "ghost"} className="h-10 text-sm" aria-expanded={tagsOpen} aria-controls="discussion-tags" onClick={() => setTagsOpen((open) => !open)}><Plus className="h-4 w-4" />{t("Add tags")}{tags.trim() ? " (1)" : ""}</Button>
          </div>

          {citationOpen ? <section className="space-y-3 border-y border-border py-4" aria-label={t("Add citation")}>
            <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label={t("Citation source")}>
              <Button type="button" variant={citationMode === "search" ? "secondary" : "ghost"} className="h-9 text-sm" role="tab" aria-selected={citationMode === "search"} onClick={() => { setCitationMode("search"); setCitationText(""); setCitationSearch(""); }}>{t("Search LumiGap papers")}</Button>
              <Button type="button" variant={citationMode === "doi" ? "secondary" : "ghost"} className="h-9 text-sm" role="tab" aria-selected={citationMode === "doi"} onClick={() => { setCitationMode("doi"); setCitationText(""); setCitationSearch(""); }}><FileSearch className="h-4 w-4" />{t("Enter DOI")}</Button>
            </div>
            <div className="relative">
              {citationMode === "doi" ? <FileSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /> : <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />}
              <Input aria-label={t(citationMode === "doi" ? "DOI" : "Search LumiGap papers")} value={citationText} onChange={(event) => setCitationText(event.target.value)} placeholder={t(citationMode === "doi" ? "Paste a DOI or doi.org link" : "Search by title, author, or keyword")} className="h-11 pl-9 text-base" autoComplete="off" />
            </div>
            {citationMode === "doi" && citationText && !isValidDoi(citationText) ? <p className="text-sm text-destructive">{t("Enter a valid DOI, such as 10.1234/example.")}</p> : <p className="text-xs text-muted-foreground">{t("Discussion citations do not automatically become gap evidence.")}</p>}
            {citationMode === "search" && citationText.trim().length > 0 && citationText.trim().length < 3 ? <p className="text-xs text-muted-foreground">{t("Type at least 3 characters to search.")}</p> : null}
            {citationLookupQuery.isLoading ? <div role="status" className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("Searching papers…")}</div> : citationSearch && citationResults.length === 0 ? <div className="flex items-center justify-between gap-3 py-3 text-sm text-muted-foreground"><span>{t("No papers found")}</span><Button type="button" variant="ghost" className="h-9" onClick={() => void citationLookupQuery.refetch()}>{t("Try again")}</Button></div> : citationResults.length ? <div className="max-h-48 overflow-y-auto rounded-md border border-border" role="listbox" aria-label={t("Citation results")}>
              {citationResults.map((paper) => { const checked = pendingCitationSet.has(paper.id); return <label key={paper.id} className="flex cursor-pointer items-start gap-3 border-b border-border px-3 py-3 last:border-0 hover:bg-muted/40"><input type="checkbox" checked={checked} onChange={() => toggleCitation(paper)} className="mt-1 h-4 w-4 accent-primary" /><span className="min-w-0"><span className="block text-sm font-medium">{paper.title}</span><span className="mt-1 block text-xs text-muted-foreground">{[paper.publicationYear, paper.doi].filter(Boolean).join(" · ")}</span></span>{checked ? <Check className="ml-auto mt-0.5 h-4 w-4 shrink-0 text-primary" /> : null}</label>; })}
            </div> : null}
            <div className="flex justify-end"><Button type="button" className="h-10" disabled={!pendingCitationIds.length} onClick={attachCitations}>{t("Attach selected")}</Button></div>
          </section> : null}

          {references.length ? <ul className="space-y-2" aria-label={t("Attached citations")}>{references.map((reference) => <li key={reference.paperId ?? reference.doi} className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2"><span className="min-w-0"><span className="block truncate text-sm font-medium">{reference.title ?? reference.doi}</span><span className="block text-xs text-muted-foreground">{[reference.year, reference.doi].filter(Boolean).join(" · ")}</span></span><Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={t("Remove citation")} onClick={() => removeCitation(reference.paperId, reference.doi)}><X className="h-4 w-4" /></Button></li>)}</ul> : null}

          {tagsOpen ? <div id="discussion-tags" className="space-y-2 border-y border-border py-4"><label htmlFor="discussion-tags-input" className="text-sm font-medium">{t("Tags")}</label><Input id="discussion-tags-input" aria-label={t("Tags")} value={tags} onChange={(event) => setTags(event.target.value)} placeholder={t("Optional tags, separated by commas")} className="h-11 text-base" maxLength={1000} /><p className="text-xs text-muted-foreground">{t("Use up to 12 tags, separated by commas.")}</p></div> : null}

          {contextOpen ? <section id="discussion-research-context" className="space-y-4 border-y border-border py-4" aria-label={t("Link research context")}>
            {contextQuery.isLoading ? <p role="status" className="text-sm text-muted-foreground">{t("Loading research context…")}</p> : contextQuery.isError ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive"><span>{t("Could not load research context.")}</span><button type="button" className="rounded underline focus-visible:ring-2 focus-visible:ring-ring" onClick={() => void contextQuery.refetch()}>{t("Retry")}</button></div> : null}
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-2 sm:col-span-2">
                <span className="text-sm font-medium">{t("Linked Paper")}{type === "PAPER_DISCUSSION" ? " *" : ""}</span>
                {linkedPaperId ? <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2"><span className="min-w-0 truncate text-sm font-medium">{linkedPaperLabel || linkedPaperId}</span><Button type="button" variant="ghost" className="h-9 shrink-0" onClick={() => { setLinkedPaperId(""); setLinkedPaperLabel(""); }}>{t("Change")}</Button></div> : <>
                  <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label={t("Linked Paper")} value={paperSearchText} onChange={(event) => setPaperSearchText(event.target.value)} placeholder={t("Search LumiGap papers or enter a DOI")} className="h-11 pl-9 text-base" required={type === "PAPER_DISCUSSION"} autoComplete="off" /></div>
                  {paperSearchText.trim().length >= 2 && paperLookupQuery.isLoading ? <p role="status" className="text-xs text-muted-foreground">{t("Searching papers…")}</p> : null}
                  {paperSearchText.trim().length >= 2 && !paperLookupQuery.isLoading && paperResults.length ? <div className="max-h-44 overflow-y-auto rounded-md border border-border" role="listbox">{paperResults.map((paper) => <button type="button" role="option" key={paper.id} className="flex w-full items-start gap-3 border-b border-border px-3 py-2 text-left last:border-0 hover:bg-muted/40" onClick={() => selectPaper(paper)}><span className="min-w-0"><span className="block text-sm font-medium">{paper.title}</span><span className="block text-xs text-muted-foreground">{[paper.publicationYear, paper.doi].filter(Boolean).join(" · ")}</span></span></button>)}</div> : null}
                  {paperSearchText.trim().length >= 2 && !paperLookupQuery.isLoading && !paperResults.length ? <p className="text-xs text-muted-foreground">{t("No papers found")}</p> : null}
                </>}
              </div>
              <label className="min-w-0 space-y-2 text-sm font-medium sm:col-span-2"><span>{t("Candidate Research Gap")}{type === "RESEARCH_GAP_DISCUSSION" ? " *" : ""}</span><select aria-label={t("Candidate Research Gap")} required={type === "RESEARCH_GAP_DISCUSSION"} value={linkedGapId} onChange={(event) => setLinkedGapId(event.target.value)} className={fieldClass}><option value="">{t("No linked research gap")}</option>{contextGaps.map((gap) => <option key={gap.id} value={gap.id}>{gap.title}{gap.forumShareable ? "" : ` · ${t("Private")}`}</option>)}</select></label>
            </div>
            {selectedGap && !selectedGap.forumShareable ? <div className="rounded-md border border-border bg-muted/40 p-3 text-sm leading-6"><p>{t("This candidate gap is private. Make it shareable before linking it to a forum thread.")}</p><Button type="button" variant="outline" className="mt-2 h-10" disabled={shareGap.isPending} onClick={() => void shareGap.mutateAsync(selectedGap.id).then(() => toast.success(t("Research gap is now shareable"))).catch(() => toast.error(t("Could not share this research gap")))}>{t("Make gap shareable")}</Button></div> : null}
            <div>
              <Button type="button" variant="ghost" className="h-10 px-0 text-sm" aria-expanded={advancedContextOpen} onClick={() => setAdvancedContextOpen((open) => !open)}><ChevronRight className={cn("h-4 w-4 transition-transform", advancedContextOpen && "rotate-90")} />{t("Advanced project context")}</Button>
              {advancedContextOpen ? <label className="mt-2 block min-w-0 space-y-2 text-sm font-medium"><span>{t("Linked Project")}</span><select aria-label={t("Linked Project")} value={linkedProjectId} onChange={(event) => setLinkedProjectId(event.target.value)} className={fieldClass}><option value="">{t("No linked project")}</option>{context?.projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select><span className="block text-xs font-normal text-muted-foreground">{t("Only projects with Public Summary visibility are listed.")}</span></label> : null}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">{t("Only public or explicitly shareable research objects can appear in a forum discussion.")}</p>
          </section> : null}
          <p id="discussion-help" className="pb-2 text-sm text-muted-foreground">{t("Keep claims specific and cite sources where possible.")}</p>
          {error ? <p id="discussion-error" role="alert" className="mb-2 rounded-md border border-destructive/40 p-3 text-base text-destructive">{error}</p> : null}
        </div>
        <footer className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/95 px-5 py-3 sm:px-6">
          <p className="hidden text-sm text-muted-foreground sm:block">{selectedCommunity ? selectedCommunity.visibility === "private" ? t("Discussions are private") : t("Anyone can read discussions and members join immediately.") : t("Select a community before publishing.")}</p>
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

  if (embedded) return <div className={cn("forum-compose h-full overflow-y-auto", expanded ? "sm:max-h-[calc(100vh-2rem)]" : "sm:max-h-[78vh]")}>{form}</div>;
  return <ForumLayout sidebar={<ForumSidebar communities={communitiesQuery.data} communitiesLoading={communitiesQuery.isLoading} communitiesError={communitiesQuery.isError} onRetryCommunities={() => void communitiesQuery.refetch()} isAuthed={isAuthed} />}><ForumSurface className="forum-compose overflow-hidden"><div className="flex min-h-16 items-center pl-16 pr-5 lg:hidden"><Link to="/forum" className="rounded text-sm font-semibold text-muted-foreground hover:text-primary focus-visible:ring-2 focus-visible:ring-ring">{t("Research Forum")}</Link></div>{form}</ForumSurface></ForumLayout>;
}
