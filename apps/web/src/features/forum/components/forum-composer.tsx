import { useEffect, useState, useRef, type FormEvent, type KeyboardEvent } from "react";
import { isAxiosError } from "axios";
import { BookOpen, Eye, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ForumCommentView, ForumReferenceView } from "../api/forum.api";
import { ForumMarkdown } from "./forum-markdown";
import { ForumFormattingToolbar } from "./forum-formatting-toolbar";
import { useI18n } from "@/i18n";
import { formatForumMarkdown, forumMarkdownShortcut, type ForumMarkdownAction } from "../utils/forum-discussion-editor";

interface ForumComposerProps {
  onSubmit: (data: { content: string; parentCommentId?: string; references: ForumReferenceView[] }) => Promise<void>;
  replyTo?: ForumCommentView;
  onCancelReply?: () => void;
  availablePapers?: Array<{ id: string; title: string; publicationYear?: number; doi?: string }>;
  isSubmitting?: boolean;
  disabled?: boolean;
  focusRequest?: number;
  postContent?: string;
}

export function ForumComposer({ onSubmit, replyTo, onCancelReply, availablePapers = [], isSubmitting = false, disabled = false, focusRequest = 0, postContent }: ForumComposerProps) {
  const { t } = useI18n();
  const [content, setContent] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [showCitations, setShowCitations] = useState(false);
  const [selectedPaperId, setSelectedPaperId] = useState("");
  const [doi, setDoi] = useState("");
  const [citationTitle, setCitationTitle] = useState("");
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const submittingRef = useRef(false);
  useEffect(() => {
    if (focusRequest) { setShowPreview(false); requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true })); }
  }, [focusRequest]);
  const insertText = (action: ForumMarkdownAction) => {
    const el = textareaRef.current;
    if (!el) return;
    const next = formatForumMarkdown(content, el.selectionStart, el.selectionEnd, action, t("text"), { quoteSource: replyTo?.content ?? postContent, tableHeaders: [t("Title"), t("References"), t("Notes")], noteLabel: t("Note:"), detailsLabel: t("Details") });
    if (next.content.length > 10000) return;
    setContent(next.content);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(next.selectionStart, next.selectionEnd); });
  };
  const handleEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const action = forumMarkdownShortcut({ ...event, isComposing: event.nativeEvent.isComposing });
    if (action) { event.preventDefault(); insertText(action); }
  };
  const clearDraft = () => {
    setContent(""); setSelectedPaperId(""); setDoi(""); setCitationTitle(""); setShowCitations(false); setShowPreview(false); setError(""); onCancelReply?.();
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
  return (
    <form onSubmit={handleSubmit} aria-labelledby="composer-heading" className="border-t border-border pt-7">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="composer-heading" className="text-lg font-semibold">{replyTo ? <>{t("Replying to")} {replyTo.author.fullName}</> : t("Reply to discussion")}</h2>
        {replyTo ? <Button type="button" variant="ghost" size="sm" onClick={onCancelReply} disabled={isSubmitting} aria-label={t("Cancel reply target")}><X className="mr-1 h-4 w-4" />{t("Cancel reply target")}</Button> : null}
      </div>
      {replyTo ? <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">{replyTo.content.slice(0, 180)}</p> : null}
      <fieldset disabled={disabled || isSubmitting} className="min-w-0 space-y-3">
        <div className="overflow-hidden rounded-md border border-border bg-background focus-within:ring-2 focus-within:ring-ring/40">
          <div className="flex flex-wrap items-center justify-between gap-1 border-b border-border bg-muted/30 p-1.5">
            <ForumFormattingToolbar onAction={(action) => { setShowPreview(false); insertText(action); }} className="gap-0" disabled={disabled || isSubmitting} canQuotePost={Boolean(replyTo?.content ?? postContent)} />
            <Button type="button" variant="ghost" size="sm" aria-pressed={showPreview} onClick={() => setShowPreview((value) => !value)}><Eye className="mr-1.5 h-4 w-4" />{t(showPreview ? "Write" : "Preview")}</Button>
          </div>
          {showPreview ? <div className="min-h-[180px] px-4 py-3">{content.trim() ? <ForumMarkdown content={content} /> : <p className="text-sm text-muted-foreground">{t("Preview will appear here once you start typing...")}</p>}</div> : null}
          <textarea hidden={showPreview} id="forum-reply-content" aria-label={t("Write your response")} aria-describedby={error ? "reply-error" : "reply-help"} ref={textareaRef} required rows={6} maxLength={10000} value={content} onChange={(event) => setContent(event.target.value)} onKeyDown={handleEditorKeyDown} placeholder={t("Write your response. Markdown is supported.")} className="block w-full resize-y bg-transparent p-4 text-base leading-[1.7] outline-none placeholder:text-muted-foreground" />
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" className="-ml-2" aria-expanded={showCitations} aria-controls="reply-citations" onClick={() => setShowCitations((value) => !value)}><BookOpen className="mr-1.5 h-4 w-4" />{t("Add citation")}{selectedPaperId || doi ? " · " + [selectedPaperId, doi].filter(Boolean).length : ""}</Button>
          <span className="text-xs tabular-nums text-muted-foreground">{content.length}/10000</span>
        </div>
        {showCitations ? <div id="reply-citations" className="space-y-3 border-y border-border py-4">
          <label className="block text-sm font-medium">{t("Link Paper")}<select aria-label={t("Link Paper")} className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={selectedPaperId} onChange={(event) => setSelectedPaperId(event.target.value)}><option value="">{t("Select LumiGap Paper (optional)")}</option>{availablePapers.map((paper) => <option key={paper.id} value={paper.id}>{paper.title} ({paper.publicationYear ?? "N/A"})</option>)}</select></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">DOI<Input aria-label="DOI" maxLength={300} className="mt-1.5" value={doi} onChange={(event) => setDoi(event.target.value)} placeholder="10.1145/..." /></label>
          <label className="text-sm font-medium">{t("Paper Citation Title")}<Input aria-label={t("Paper Citation Title")} maxLength={500} className="mt-1.5" value={citationTitle} onChange={(event) => setCitationTitle(event.target.value)} /></label>
          </div>
          <p className="text-xs text-muted-foreground">{t("Discussion citations do not automatically become gap evidence.")}</p>
        </div> : null}
        <p id="reply-help" className="text-xs text-muted-foreground">{t("Helpful reflects community usefulness, not scientific validation.")}</p>
        {error ? <p id="reply-error" role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={() => { if ((!content.trim() && !selectedPaperId && !doi && !citationTitle) || window.confirm(t("Discard this reply draft?"))) clearDraft(); }}>{t("Cancel")}</Button>
          <Button type="submit" disabled={!content.trim() || disabled || isSubmitting} className="gap-2"><Send className="h-4 w-4" />{t(isSubmitting ? "Posting…" : "Post reply")}</Button>
        </div>
      </fieldset>
    </form>
  );
}
