import { useEffect, useState, useRef, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { BookOpen, Check, Loader2, Search, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ForumCommentView, ForumReferenceView } from "../api/forum.api";
import { ForumBodyEditor } from "./forum-body-editor";
import { useI18n } from "@/i18n";
import { useForumContext } from "../hooks/use-forum";
import { cn } from "@/utils/cn";

interface ForumComposerProps {
  onSubmit: (data: { content: string; parentCommentId?: string; references: ForumReferenceView[] }) => Promise<void>;
  replyTo?: ForumCommentView;
  onCancelReply?: () => void;
  availablePapers?: Array<{ id: string; title: string; publicationYear?: number; doi?: string }>;
  savedPapers?: Array<{ id: string; title: string; publicationYear?: number; doi?: string }>;
  isSubmitting?: boolean;
  disabled?: boolean;
  focusRequest?: number;
  postContent?: string;
  compact?: boolean;
  onClose?: () => void;
}

export function ForumComposer({ onSubmit, replyTo, onCancelReply, availablePapers = [], savedPapers = [], isSubmitting = false, disabled = false, focusRequest = 0, postContent, compact = false, onClose }: ForumComposerProps) {
  const { t } = useI18n();
  const [content, setContent] = useState("");
  const [showCitations, setShowCitations] = useState(false);
  const [selectedPaper, setSelectedPaper] = useState<NonNullable<ForumComposerProps["availablePapers"]>[number]>();
  const selectedPaperId = selectedPaper?.id ?? "";
  const [paperSearchText, setPaperSearchText] = useState("");
  const [paperSearch, setPaperSearch] = useState("");
  const [doi, setDoi] = useState("");
  const [citationTitle, setCitationTitle] = useState("");
  const [error, setError] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const submittingRef = useRef(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setPaperSearch(paperSearchText.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [paperSearchText]);
  const paperLookup = useForumContext(paperSearch || undefined, showCitations && paperSearch.length >= 3);
  const paperOptions = paperSearch
    ? (paperLookup.data?.papers ?? [])
    : (savedPapers.length ? savedPapers : availablePapers);
  const clearDraft = () => {
    setContent(""); setSelectedPaper(undefined); setPaperSearchText(""); setPaperSearch(""); setDoi(""); setCitationTitle(""); setShowCitations(false); setError(""); onCancelReply?.();
  };
  const requestDiscard = () => {
    if (isSubmitting || submittingRef.current) return;
    if (!content.trim() && !selectedPaperId && !doi && !citationTitle) { clearDraft(); onClose?.(); }
    else setDiscardOpen(true);
  };
  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!content.trim() || disabled || isSubmitting || submittingRef.current) return;
    const normalizedDoi = doi.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "").toLowerCase();
    if ((normalizedDoi || citationTitle.trim()) && (!/^10\.\d{4,9}\/\S+$/i.test(normalizedDoi) || !citationTitle.trim())) {
      setShowCitations(true); setError(t("Enter a valid DOI and the citation title, or clear both fields.")); return;
    }
    const references: ForumReferenceView[] = [];
    // Presenter-only fields (verified/id) must never enter the strict input schema.
    if (selectedPaperId) references.push({ paperId: selectedPaperId });
    if (normalizedDoi) references.push({ doi: normalizedDoi, title: citationTitle.trim() });
    setError(""); submittingRef.current = true;
    try {
      await onSubmit({ content: content.trim(), parentCommentId: replyTo?.id, references });
      clearDraft();
    } catch (failure) {
      const message = isAxiosError(failure) ? failure.response?.data?.error?.message : undefined;
      setError(typeof message === "string" ? message : t("Could not post this response. Your draft has been kept. Please try again."));
    } finally { submittingRef.current = false; }
  };
  const citationButton = <Button type="button" variant="ghost" size={compact ? "icon" : "sm"} className={compact ? "forum-reply-citation" : "-ml-2"} aria-label={t("Add citation")} title={t("Add citation")} aria-expanded={showCitations} aria-controls="reply-citations" onClick={() => setShowCitations((value) => !value)}><BookOpen className={cn("h-4 w-4", !compact && "mr-1.5")} />{!compact ? t("Add citation") : null}{selectedPaperId || doi ? <span>{" · " + [selectedPaperId, doi].filter(Boolean).length}</span> : null}</Button>;
  const actions = <>
    <Button type="button" variant="ghost" onClick={requestDiscard}>{t("Cancel")}</Button>
    <Button type="submit" disabled={!content.trim() || disabled || isSubmitting} className={cn("gap-2", compact && "forum-reply-submit")}>{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : !compact ? <Send className="h-4 w-4" /> : null}{t(isSubmitting ? "Posting…" : "Post reply")}</Button>
  </>;
  return (
    <form id={compact ? "forum-reply-form" : undefined} onSubmit={handleSubmit} onReset={(event) => { event.preventDefault(); requestDiscard(); }} aria-labelledby="composer-heading" className={cn("border-t border-border pt-7", compact && "forum-reply-form-compact")}>
      <div className={cn("mb-4 flex flex-wrap items-center justify-between gap-3", compact && "forum-reply-target")}>
        <h2 id="composer-heading" className={compact ? "sr-only" : "text-lg font-semibold"}>{replyTo ? <>{t("Replying to")} {replyTo.author.fullName}</> : t("Reply to discussion")}</h2>
        {replyTo ? <Button type="button" variant="ghost" size="sm" onClick={onCancelReply} disabled={isSubmitting} aria-label={t("Cancel reply target")}><X className="mr-1 h-4 w-4" />{t("Cancel reply target")}</Button> : null}
      </div>
      {replyTo ? <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">{replyTo.content.slice(0, 180)}</p> : null}
      <fieldset disabled={disabled || isSubmitting} className={compact ? "forum-reply-fields" : "min-w-0 space-y-3"}>
        <ForumBodyEditor id="forum-reply-content" label={t("Write your response")} placeholder={compact ? t("Write a reply. Use the toolbar or Markdown to format your text.") : undefined} describedBy={error ? "reply-error" : "reply-help"} value={content} onChange={setContent} maxLength={10000} disabled={disabled || isSubmitting} quoteSource={replyTo?.content ?? postContent} focusRequest={focusRequest} compact={compact} footerActions={compact ? <>{citationButton}{actions}</> : undefined} />
        {!compact ? <div className="flex items-center justify-between gap-2">
          {citationButton}
          <span className="text-xs tabular-nums text-muted-foreground">{content.length}/10000</span>
        </div> : null}
        {showCitations ? <div id="reply-citations" className="space-y-3 border-y border-border py-4">
          <div className="space-y-2">
            <span className="block text-sm font-medium">{t("Link Paper")}</span>
            {selectedPaper ? <div className="flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
              <span className="min-w-0 text-sm"><span className="block font-medium">{selectedPaper.title}</span><span className="block text-xs text-muted-foreground">{[selectedPaper.publicationYear, selectedPaper.doi].filter(Boolean).join(" · ")}</span></span>
              <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0" onClick={() => setSelectedPaper(undefined)}>{t("Change")}</Button>
            </div> : <>
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label={t("Search LumiGap papers")} maxLength={200} className="h-10 pl-9" value={paperSearchText} onChange={(event) => setPaperSearchText(event.target.value)} placeholder={t("Search saved or LumiGap papers")} autoComplete="off" /></div>
              {paperSearchText.trim() && paperSearchText.trim().length < 3 ? <p className="text-xs text-muted-foreground">{t("Type at least 3 characters to search.")}</p> : null}
              {paperSearch.length >= 3 && paperLookup.isFetching ? <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t("Searching papers…")}</p> : null}
              {!paperSearch && savedPapers.length ? <p className="text-xs font-medium text-muted-foreground">{t("Saved papers")}</p> : null}
              {paperLookup.isError && paperSearch.length >= 3 ? <div role="alert" className="flex items-center justify-between gap-2 text-sm text-destructive"><span>{t("Could not search papers.")}</span><Button type="button" variant="ghost" size="sm" onClick={() => void paperLookup.refetch()}>{t("Retry")}</Button></div> : paperOptions.length ? <div className="max-h-48 overflow-y-auto rounded-md border border-border" role="group" aria-label={t("Paper results")}>
                {paperOptions.map((paper) => <button type="button" key={paper.id} className="group flex w-full items-start gap-2 border-b border-border px-3 py-2 text-left last:border-0 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" onClick={() => { setSelectedPaper(paper); setPaperSearchText(""); setPaperSearch(""); }}>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{paper.title}</span><span className="mt-0.5 block text-xs text-muted-foreground">{[paper.publicationYear, paper.doi].filter(Boolean).join(" · ")}</span></span><Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
                </button>)}
              </div> : paperSearch.length >= 3 && !paperLookup.isFetching ? <p className="text-xs text-muted-foreground">{t("No papers found")}</p> : !paperSearch ? <p className="text-xs text-muted-foreground">{t("Search your saved papers or the LumiGap library.")}</p> : null}
            </>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">DOI<Input aria-label="DOI" maxLength={300} className="mt-1.5" value={doi} onChange={(event) => setDoi(event.target.value)} placeholder="10.1145/..." /></label>
          <label className="text-sm font-medium">{t("Paper Citation Title")}<Input aria-label={t("Paper Citation Title")} maxLength={500} className="mt-1.5" value={citationTitle} onChange={(event) => setCitationTitle(event.target.value)} /></label>
          </div>
          <p className="text-xs text-muted-foreground">{t("Discussion citations do not automatically become gap evidence.")}</p>
        </div> : null}
        <p id="reply-help" className={compact ? "sr-only" : "text-xs text-muted-foreground"}>{t("Helpful reflects community usefulness, not scientific validation.")}</p>
        {error ? <p id="reply-error" role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{error}</p> : null}
        {!compact ? <div className="flex justify-end gap-2 pt-1">{actions}</div> : null}
      </fieldset>
      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t("Discard this reply draft?")}</DialogTitle><DialogDescription>{t("Your unsent response and citations will be removed.")}</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDiscardOpen(false)}>{t("Keep editing")}</Button>
            <Button type="button" variant="destructive" onClick={() => { clearDraft(); setDiscardOpen(false); onClose?.(); }}>{t("Discard draft")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
