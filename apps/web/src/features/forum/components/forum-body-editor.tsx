import { useRef, useState, type KeyboardEvent } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { ForumFormattingToolbar } from "./forum-formatting-toolbar";
import { ForumMarkdown } from "./forum-markdown";
import { formatForumMarkdown, forumMarkdownShortcut, type ForumMarkdownAction, type ForumTableConfig } from "../utils/forum-discussion-editor";

/** Editing uses the same Markdown and table workflow as new threads and replies. */
export function ForumBodyEditor({ value, onChange, maxLength, label, disabled = false }: {
  value: string; onChange: (value: string) => void; maxLength: number; label: string; disabled?: boolean;
}) {
  const { t } = useI18n();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  const insert = (action: ForumMarkdownAction, table?: ForumTableConfig) => {
    const field = textarea.current;
    if (!field || disabled) return;
    const next = formatForumMarkdown(value, field.selectionStart, field.selectionEnd, action, t("text"), { table, tableHeaders: [t("Title"), t("References"), t("Notes")], noteLabel: t("Note:"), detailsLabel: t("Details") });
    if (next.content.length > maxLength) return;
    setPreview(false); onChange(next.content);
    requestAnimationFrame(() => { field.focus(); field.setSelectionRange(next.selectionStart, next.selectionEnd); });
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const action = forumMarkdownShortcut({ ...event, isComposing: event.nativeEvent.isComposing });
    if (action) { event.preventDefault(); insert(action); }
  };
  return <div className="min-w-0">
    <div className="overflow-hidden rounded-md border border-input focus-within:ring-2 focus-within:ring-ring/40">
      <div className="flex flex-wrap items-center justify-between gap-1 border-b bg-muted/30 p-1.5">
        <ForumFormattingToolbar disabled={disabled} onAction={insert} onTableInsert={(table) => insert("table", table)} />
        <Button type="button" size="sm" variant="ghost" disabled={disabled} aria-pressed={preview} onClick={() => setPreview((current) => !current)}><Eye aria-hidden="true" className="mr-1.5 h-4 w-4" />{t(preview ? "Write" : "Preview")}</Button>
      </div>
      {preview ? <div className="min-h-44 max-h-80 overflow-auto p-4">{value.trim() ? <ForumMarkdown content={value} /> : <p className="text-sm text-muted-foreground">{t("Preview will appear here once you start typing...")}</p>}</div> : null}
      <textarea ref={textarea} hidden={preview} aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={keyDown} maxLength={maxLength} disabled={disabled} rows={7} className="max-h-80 w-full resize-y bg-background p-4 text-base leading-relaxed outline-none" />
    </div>
    <p className="mt-2 text-right text-xs tabular-nums text-muted-foreground">{value.length}/{maxLength}</p>
  </div>;
}
