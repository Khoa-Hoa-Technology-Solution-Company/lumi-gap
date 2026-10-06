import { forumCitationToken, forumCitationPaperIds, orderForumReferences } from "@trend/shared-types";
import type { ForumReferenceView } from "../api/forum.api";
import { ForumCitationPicker } from "./forum-citation-picker";
import { ForumCitationPreview } from "./forum-citation-preview";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { Eye, FileCode2, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import { cn } from "@/utils/cn";
import { ForumFormattingToolbar } from "./forum-formatting-toolbar";
import { ForumMarkdown } from "./forum-markdown";
import { formatForumMarkdown, forumMarkdownShortcut, type ForumMarkdownAction, type ForumTableConfig } from "../utils/forum-discussion-editor";
import { canUseForumVisualEditor, forumRichTextExtensions, forumTableDocument, writeForumFootnote, removeForumFootnote } from "../utils/forum-rich-text";
import { forumWrapType } from "../utils/forum-formatting";

type EditorMode = "visual" | "markdown" | "preview";
export function ForumBodyEditor({ value, onChange, maxLength, label, disabled = false, id, placeholder, describedBy, quoteSource, focusRequest = 0, className, compact = false, footerActions, references = [], onReferencesChange }: {
  value: string; onChange: (value: string) => void; maxLength: number; label: string; disabled?: boolean;
  id?: string; placeholder?: string; describedBy?: string; quoteSource?: string; focusRequest?: number; className?: string;
  compact?: boolean; footerActions?: ReactNode; references?: ForumReferenceView[]; onReferencesChange?: (references: ForumReferenceView[]) => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<EditorMode>("visual");
  const [warning, setWarning] = useState("");
  const [note, setNote] = useState<{ id?: string; text: string }>();
  const [citationOpen, setCitationOpen] = useState(false);
  const citationPosition = useRef<{ from: number; to: number }>();
  const [link, setLink] = useState<{ text: string; url: string }>();
  const [math, setMath] = useState<string>();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const citationScope = useRef<HTMLDivElement>(null);
  const intentionalMarkdown = useRef(false);
  const synced = useRef("");
  const latest = useRef({ onChange, maxLength, disabled, t });
  latest.current = { onChange, maxLength, disabled, t };
  const openNote = useRef<(id: string) => void>(() => {});
  const runAction = useRef<(action: ForumMarkdownAction) => void>(() => {});
  const extensions = useMemo(() => [...forumRichTextExtensions(latest.current.t("Edit footnote")), Extension.create({
    name: "forumContentLimit",
    addProseMirrorPlugins() {
      return [new Plugin({ filterTransaction: (transaction) => {
        if (!transaction.docChanged || !this.editor.markdown) return true;
        if (this.editor.markdown.serialize(transaction.doc.toJSON()).length <= latest.current.maxLength) return true;
        setWarning(latest.current.t("This change exceeds the discussion length limit. Your previous content has been kept."));
        return false;
      } })];
    },
  })], []);
  const editor = useEditor({
    extensions, content: "", contentType: "markdown", immediatelyRender: false,
    editable: !disabled,
    editorProps: {
      attributes: { role: "textbox", "aria-label": label, "aria-multiline": "true", ...(id ? { id } : {}), ...(describedBy ? { "aria-describedby": describedBy } : {}), class: "forum-visual-editor" },
      handleClickOn: (_view, _position, node, _nodePosition, _event, direct) => {
        if (!direct || node.type.name !== "forumFootnoteReference" || latest.current.disabled) return false;
        openNote.current(String(node.attrs.id)); return true;
      },
      handleKeyDown: (_view, event) => {
        const target = event.target instanceof HTMLElement ? event.target.closest("[data-footnote-ref]") : null;
        if (target && (event.key === "Enter" || event.key === " ") && !latest.current.disabled) { event.preventDefault(); openNote.current(target.getAttribute("data-footnote-ref")!); return true; }
        const shortcut = forumMarkdownShortcut(event);
        if (shortcut && !latest.current.disabled) { event.preventDefault(); runAction.current(shortcut); return true; }
        return false;
      },
    },
    onUpdate: ({ editor: current }) => { const next = current.getMarkdown(); synced.current = next; latest.current.onChange(next); },
  });
  const activeActions = useEditorState({ editor, selector: ({ editor: current }) => !current ? [] : ([
    ["bold", "bold"], ["italic", "italic"], ["heading", "heading"], ["link", "link"], ["quote", "blockquote"], ["bullet", "bulletList"], ["numbered", "orderedList"], ["code", "code"],
  ] as const).filter(([, node]) => current.isActive(node)).map(([action]) => action) }) ?? [];
  const isEmpty = useEditorState({ editor, selector: ({ editor: current }) => current?.isEmpty ?? true });

  useEffect(() => {
    if (!editor || value === synced.current) return;
    synced.current = value;
    if (editor.markdown && canUseForumVisualEditor(value, editor.markdown, maxLength)) editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
    else {
      setMode("markdown");
      if (intentionalMarkdown.current) { intentionalMarkdown.current = false; setWarning(""); }
      else setWarning(t("This content needs Markdown mode to preserve its formatting. Your original text has not been changed."));
    }
  }, [editor, value, maxLength, t]);
  // Changing availability is not a content edit. In particular, do not emit an
  // empty update while the parent is restoring a persisted draft.
  useEffect(() => { editor?.setEditable(!disabled, false); }, [editor, disabled]);
  useEffect(() => {
    if (!editor) return;
    editor.setOptions({ editorProps: { ...editor.options.editorProps, attributes: { role: "textbox", "aria-label": label, "aria-multiline": "true", class: "forum-visual-editor", ...(id ? { id } : {}), ...(describedBy ? { "aria-describedby": describedBy } : {}) } } });
  }, [editor, label, id, describedBy]);
  useEffect(() => {
    if (!focusRequest || !editor) return;
    if (editor.markdown && canUseForumVisualEditor(synced.current, editor.markdown, latest.current.maxLength)) { setMode("visual"); editor.commands.focus(undefined, { scrollIntoView: false }); }
    else textarea.current?.focus({ preventScroll: true });
  }, [focusRequest, editor]);

  openNote.current = (noteId) => {
    let text = "";
    editor?.state.doc.descendants((node) => { if (node.type.name === "forumFootnoteDefinition" && node.attrs.id === noteId) text = node.textContent; });
    setNote({ id: noteId, text });
  };
  const switchMode = (next: EditorMode) => {
    if (next === "visual" && editor?.markdown) {
      if (!canUseForumVisualEditor(value, editor.markdown, maxLength)) { setWarning(t("This content needs Markdown mode to preserve its formatting. Your original text has not been changed.")); return; }
      editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
    }
    setMode(next); setWarning("");
  };
  const rawInsert = (action: ForumMarkdownAction, table?: ForumTableConfig, noteText?: string, imageOptions?: { url: string; alt: string }, mathExpression?: string) => {
    const field = textarea.current;
    if (!field || disabled) return false;
    const next = formatForumMarkdown(value, field.selectionStart, field.selectionEnd, action, noteText ?? t("text"), { table, quoteSource, image: imageOptions, math: mathExpression, tableHeaders: [t("Title"), t("References"), t("Notes")], noteLabel: t("Note:"), detailsLabel: t("Details") });
    if (next.content.length > maxLength) { setWarning(t("This change exceeds the discussion length limit. Your previous content has been kept.")); return false; }
    onChange(next.content);
    requestAnimationFrame(() => { field.focus(); field.setSelectionRange(next.selectionStart, next.selectionEnd); });
    return true;
  };
  const action = (item: ForumMarkdownAction) => {
    if (disabled) return;
    if (item === "citation") {
      citationPosition.current = mode === "markdown" ? { from: textarea.current?.selectionStart ?? value.length, to: textarea.current?.selectionEnd ?? value.length } : editor ? { from: editor.state.selection.to, to: editor.state.selection.to } : undefined;
      setCitationOpen(true); return;
    }
    if (item === "footnote") { setNote({ text: "" }); return; }
    if (item === "math") { setMath(""); return; }
    if (mode === "markdown") { rawInsert(item); return; }
    if (!editor) return;
    const chain = editor.chain().focus();
    switch (item) {
      case "bold": chain.toggleBold().run(); break;
      case "italic": chain.toggleItalic().run(); break;
      case "heading": case "heading-2": chain.toggleHeading({ level: 2 }).run(); break;
      case "heading-1": chain.toggleHeading({ level: 1 }).run(); break;
      case "heading-3": chain.toggleHeading({ level: 3 }).run(); break;
      case "heading-4": chain.toggleHeading({ level: 4 }).run(); break;
      case "paragraph": chain.setParagraph().run(); break;
      case "small": chain.toggleMark("forumSmall").run(); break;
      case "spoiler": chain.toggleMark("forumSpoiler").run(); break;
      case "wrap": {
        const selectedText = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, "\n");
        const selectedParagraph = selectedText ? { type: "paragraph", content: [{ type: "text", text: selectedText }] } : { type: "paragraph" };
        chain.insertContent({ type: "forumWrap", attrs: { type: forumWrapType("note") }, content: [selectedParagraph] }).run();
        break;
      }
      case "quote": chain.toggleBlockquote().run(); break;
      case "bullet": chain.toggleBulletList().run(); break;
      case "numbered": chain.toggleOrderedList().run(); break;
      case "code": chain.toggleCode().run(); break;
      case "code-block": chain.toggleCodeBlock().run(); break;
      case "strikethrough": chain.toggleStrike().run(); break;
      case "checklist": chain.toggleTaskList().run(); break;
      case "divider": chain.setHorizontalRule().run(); break;
      case "link": setLink({ text: editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to), url: String(editor.getAttributes("link").href ?? "") }); break;
      case "date": chain.insertContent({ type: "text", text: new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC") }).run(); break;
      case "quote-post": chain.insertContent(formatForumMarkdown("", 0, 0, "quote-post", t("text"), { quoteSource }).content, { contentType: "markdown" }).run(); break;
      case "callout": case "details": {
        const heading = item === "callout" ? t("Note:") : item === "details" ? t("Details") : t("Spoiler");
        const selectedText = editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to, "\n");
        const selectedParagraph = selectedText ? { type: "paragraph", content: [{ type: "text", text: selectedText }] } : { type: "paragraph" };
        if (item === "details") chain.insertContent({ type: "forumDetails", attrs: { summary: heading }, content: [selectedParagraph] }).run();
        else chain.insertContent({ type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: heading, marks: [{ type: "bold" }] }] }, selectedParagraph] }).run();
        break;
      }
    }
  };
  const insertCitation = (paper: ForumReferenceView & { paperId: string }) => {
    if (disabled) return false;
    const position = citationPosition.current;
    if (!position) return false;
    const nextReferences = [...references.filter((item) => item.paperId !== paper.paperId), paper];
    if (new Set([...forumCitationPaperIds(value), paper.paperId]).size > 30) { setWarning(t("Use up to 30 references.")); return false; }
    if (value.length + forumCitationToken(paper.paperId).length > maxLength) { setWarning(t("This change exceeds the discussion length limit. Your previous content has been kept.")); return false; }
    if (mode === "visual" && (!editor || !editor.state.doc.resolve(position.to).parent.inlineContent)) { setWarning(t("Place the cursor in text before adding a citation.")); return false; }
    onReferencesChange?.(nextReferences);
    if (mode === "markdown") {
      const token = forumCitationToken(paper.paperId);
      onChange(value.slice(0, position.to) + token + value.slice(position.to));
      requestAnimationFrame(() => { textarea.current?.focus(); textarea.current?.setSelectionRange(position.to + token.length, position.to + token.length); });
    } else if (editor) {
      if (!editor.state.doc.resolve(position.to).parent.inlineContent) { setWarning(t("Place the cursor in text before adding a citation.")); return false; }
      editor.chain().focus().insertContentAt(position.to, { type: "forumCitation", attrs: { paperId: paper.paperId } }).run();
    } else return false;
    setWarning("");
    return true;
  };
  const selectedTable = () => {
    if (!editor || mode !== "visual") return;
    const position = editor.state.selection.$from;
    for (let depth = position.depth; depth > 0; depth--) if (position.node(depth).type.name === "table") return { node: position.node(depth), from: position.before(depth), to: position.after(depth) };
  };
  runAction.current = action;
  const tableConfig = (): ForumTableConfig | undefined => {
    const selected = selectedTable(); if (!selected) return;
    const rows = selected.node.content.content;
    const header = rows[0]; if (!header) return;
    return { rows: Math.max(1, rows.length - 1), columns: header.childCount, includeHeader: header.textContent.length > 0, headers: header.content.content.map((cell) => cell.textContent), cells: rows.slice(1).map((row) => row.content.content.map((cell) => cell.textContent)) };
  };
  const insertTable = (table: ForumTableConfig) => {
    if (disabled) return false;
    if (mode === "markdown") return rawInsert("table", table);
    if (!editor?.markdown) return false;
    const selected = selectedTable(); const document = forumTableDocument(table, selected?.node.toJSON());
    const size = value.length - (selected ? editor.markdown.serialize(selected.node.toJSON()).length : 0) + editor.markdown.serialize(document).length + 4;
    if (size > maxLength) { setWarning(t("This change exceeds the discussion length limit. Your previous content has been kept.")); return false; }
    if (selected) editor.chain().focus().insertContentAt({ from: selected.from, to: selected.to }, document).run();
    else editor.chain().focus().insertContent([document, { type: "paragraph" }]).run();
    return true;
  };
  const saveNote = () => {
    if (!note?.text.trim() || disabled) return;
    if (mode === "markdown") { if (!rawInsert("footnote", undefined, note.text.trim())) return; }
    else if (editor?.markdown) {
      const transaction = editor.state.tr;
      if (!writeForumFootnote(transaction, editor.state.schema, note.text, note.id)) { setWarning(t("Place the cursor in text before adding a footnote.")); return; }
      if (editor.markdown.serialize(transaction.doc.toJSON()).length > maxLength) { setWarning(t("This change exceeds the discussion length limit. Your previous content has been kept.")); return; }
      editor.view.dispatch(transaction); editor.commands.focus();
    } else return;
    setNote(undefined);
  };
  const removeNote = () => {
    if (!note?.id || !editor || disabled) return;
    editor.chain().focus().command(({ tr }) => removeForumFootnote(tr, note.id!)).run(); setNote(undefined);
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => { const item = forumMarkdownShortcut({ ...event, isComposing: event.nativeEvent.isComposing }); if (item) { event.preventDefault(); action(item); } };
  const formattingToolbar = <ForumFormattingToolbar disabled={disabled || !editor} onAction={action} onTableInsert={insertTable} getTable={tableConfig} activeActions={mode === "visual" ? activeActions : []} canQuotePost={Boolean(quoteSource)} />;
  const viewButtons = (["visual", "markdown", "preview"] as const).map((view) => {
    const viewLabel = t(view === "visual" ? "Write" : view === "markdown" ? "Markdown" : "Preview");
    const Icon = view === "visual" ? PencilLine : view === "markdown" ? FileCode2 : Eye;
    return <Button key={view} type="button" variant={mode === view ? "secondary" : "ghost"} size={compact ? "icon" : "sm"} disabled={disabled} aria-label={viewLabel} title={viewLabel} aria-pressed={mode === view} onClick={() => switchMode(view)}><Icon aria-hidden className={cn("h-4 w-4", !compact && "mr-1.5")} />{!compact ? viewLabel : null}</Button>;
  });
  return <div className={cn("forum-body-editor min-w-0", compact && "forum-body-editor-compact", className)}>
    {!compact ? <div className="forum-compose-tabs flex w-full min-w-0 flex-wrap items-center justify-between gap-2 pb-2" role="group" aria-label={t("Editor view")}>
      <div className="flex min-w-0 max-w-full flex-1 gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{viewButtons}</div>
      <span className="text-xs tabular-nums text-muted-foreground">{value.length}/{maxLength}</span>
    </div> : null}
    <div className={cn("forum-editor-frame overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring/40", compact && "forum-editor-frame-compact")}>
      {!compact && mode !== "preview" ? <div className="border-b bg-muted/30 p-1.5">{formattingToolbar}</div> : null}
      {mode === "preview" ? <section aria-label={t("Live Preview")} className="min-h-64 p-4">{value.trim() ? <ForumMarkdown content={value} references={forumCitationPaperIds(value).length ? orderForumReferences(value, references) : []} renderReferences className="sm:text-base" /> : <p className="text-sm text-muted-foreground">{t("Preview will appear here once you start typing...")}</p>}</section> : null}
      <div ref={citationScope} hidden={mode !== "visual"} className="forum-rich-editor" data-empty={isEmpty} data-placeholder={placeholder ?? label}><EditorContent editor={editor} /></div>
      <ForumCitationPreview scope={citationScope} references={references} editable enabled={mode === "visual"} />
      {mode === "markdown" || !editor ? <textarea ref={textarea} id={mode === "markdown" ? id : undefined} aria-label={label} aria-describedby={describedBy} value={value} onChange={(event) => { synced.current = event.target.value; onChange(event.target.value); }} onKeyDown={keyDown} maxLength={maxLength} disabled={disabled} rows={8} placeholder={placeholder} className="min-h-64 w-full resize-y bg-background p-4 text-base leading-relaxed outline-none" /> : null}
    </div>
    {compact ? <div className="forum-editor-bottom-bar">
      <div className="forum-editor-tools">
        <div className="forum-editor-view-buttons" role="group" aria-label={t("Editor view")}>{viewButtons}</div>
        {mode !== "preview" ? formattingToolbar : null}
      </div>
      <div className="forum-editor-footer-actions">{footerActions}</div>
    </div> : null}
    {!compact && mode === "visual" ? <p className="mt-2 text-xs text-muted-foreground">{t("Edit table cells directly. Click a footnote number to edit its note.")}</p> : null}
    {warning ? <p role="alert" className="mt-2 text-sm text-destructive">{warning}</p> : null}
    {citationOpen ? <ForumCitationPicker onInsert={insertCitation} onClose={() => { setCitationOpen(false); if (mode === "visual") editor?.commands.focus(undefined, { scrollIntoView: false }); else textarea.current?.focus(); }} /> : null}
    <Dialog open={Boolean(note)} onOpenChange={(open) => { if (!open) setNote(undefined); }}>
      <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{t(note?.id ? "Edit footnote" : "Add footnote")}</DialogTitle><DialogDescription>{t("A footnote adds a numbered note to your text. It does not create a paper citation or research evidence.")}</DialogDescription></DialogHeader>
        <label className="space-y-2 text-sm font-medium"><span>{t("Footnote text")}</span><textarea value={note?.text ?? ""} onChange={(event) => setNote((current) => ({ ...current, text: event.target.value }))} maxLength={2000} rows={5} className="w-full rounded-md border border-input bg-background p-3 text-base font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
        {warning ? <p role="alert" className="text-sm text-destructive">{warning}</p> : null}
        <DialogFooter className="gap-2">{note?.id ? <Button type="button" variant="ghost" className="mr-auto text-destructive" onClick={removeNote}>{t("Remove footnote")}</Button> : null}<Button type="button" variant="ghost" onClick={() => setNote(undefined)}>{t("Cancel")}</Button><Button type="button" disabled={!note?.text.trim() || disabled} onClick={saveNote}>{t(note?.id ? "Save changes" : "Insert footnote")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={Boolean(link)} onOpenChange={(open) => { if (!open) setLink(undefined); }}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{t("Link")}</DialogTitle><DialogDescription>{t("Enter a safe web address for the selected text.")}</DialogDescription></DialogHeader><label className="space-y-1 text-sm">{t("Text")}<Input value={link?.text ?? ""} maxLength={1000} onChange={(event) => setLink((current) => ({ url: current?.url ?? "", text: event.target.value }))} /></label><label className="space-y-1 text-sm">URL<Input value={link?.url ?? ""} maxLength={2000} onChange={(event) => setLink((current) => ({ text: current?.text ?? "", url: event.target.value }))} /></label><DialogFooter><Button type="button" variant="ghost" onClick={() => setLink(undefined)}>{t("Cancel")}</Button><Button type="button" disabled={!link?.text.trim() || !/^(https?:\/\/|mailto:)[^\s]+$/i.test(link?.url.trim() ?? "")} onClick={() => { if (link && !disabled) editor?.chain().focus().insertContent({ type: "text", text: link.text, marks: [{ type: "link", attrs: { href: link.url.trim() } }] }).run(); setLink(undefined); }}>{t("Insert link")}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={math !== undefined} onOpenChange={(open) => { if (!open) setMath(undefined); }}><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{t("Insert math")}</DialogTitle><DialogDescription>{t("Enter a LaTeX expression. It will be stored as inline math in the discussion Markdown.")}</DialogDescription></DialogHeader><label className="space-y-1 text-sm"><span>{t("Math expression")}</span><Input autoFocus value={math ?? ""} maxLength={1000} placeholder="E = mc^2" onChange={(event) => setMath(event.target.value)} /></label><DialogFooter><Button type="button" variant="ghost" onClick={() => setMath(undefined)}>{t("Cancel")}</Button><Button type="button" disabled={!math?.trim()} onClick={() => { const expression = math?.trim(); if (disabled || !expression) return; if (mode === "markdown") { if (rawInsert("math", undefined, undefined, undefined, expression)) setMath(undefined); return; } if (editor) { editor.chain().focus().insertContent({ type: "forumInlineMath", attrs: { latex: expression } }).run(); setMath(undefined); } }}>{t("Insert math")}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
