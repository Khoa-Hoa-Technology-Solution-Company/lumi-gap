import { useId, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n";
import { useForumTags } from "../hooks/use-forum-categories";
import { FORUM_DISCUSSION_TAG_LIMIT, forumDiscussionTags } from "../utils/forum-discussion-editor";

export function ForumTagInput({ value, onChange, onValidityChange }: { value: string; onChange: (value: string) => void; onValidityChange?: (valid: boolean) => void }) {
  const { t } = useI18n();
  const id = useId();
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState("");
  const tags = forumDiscussionTags(value);
  const options = useForumTags(focused);
  const add = (input: string) => {
    const next = forumDiscussionTags([...tags, input].join(","));
    if (next.length > FORUM_DISCUSSION_TAG_LIMIT || next.some((tag) => tag.length > 80)) { setError(t("Use up to 5 tags, with no more than 80 characters each.")); onValidityChange?.(false); return; }
    onChange(next.join(", ")); setText(""); setError(""); onValidityChange?.(true);
  };
  return <div className="space-y-1.5">
    <div className="flex items-center justify-between text-xs text-muted-foreground"><label htmlFor={id}>{t("Tags")}</label><span id={`${id}-help`}>{t("Up to 5 tags")} · {tags.length}/{FORUM_DISCUSSION_TAG_LIMIT}</span></div>
    <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1 focus-within:ring-2 focus-within:ring-ring/40">
      {tags.map((tag) => <span key={tag.toLowerCase()} className="inline-flex max-w-full items-center gap-1 rounded bg-muted px-2 py-1 text-xs"><span className="truncate">{tag}</span><button type="button" aria-label={t("Remove tag {tag}", { tag })} className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { onChange(tags.filter((item) => item !== tag).join(", ")); setError(""); onValidityChange?.(true); }}><X aria-hidden className="h-3 w-3" /></button></span>)}
      <Input id={id} aria-label={t("Tags")} aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`} list={`${id}-options`} autoComplete="off" value={text} disabled={tags.length >= FORUM_DISCUSSION_TAG_LIMIT} placeholder={tags.length >= FORUM_DISCUSSION_TAG_LIMIT ? t("Up to 5 tags") : t("Add a tag...")} maxLength={400} className="h-8 min-w-32 flex-1 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0" onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); if (text.trim()) add(text); }} onChange={(event) => { const next = event.target.value; setText(next); setError(""); onValidityChange?.(true); if (next.includes(",")) add(next); }} onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === ",") { event.preventDefault(); if (text.trim()) add(text); }
        if (event.key === "Backspace" && !text && tags.length) onChange(tags.slice(0, -1).join(", "));
      }} />
      <datalist id={`${id}-options`}>{options.data?.filter((tag) => !tags.some((selected) => selected.toLowerCase() === tag.name.toLowerCase())).map((tag) => <option key={tag.slug} value={tag.name} />)}</datalist>
    </div>
    {error ? <p id={`${id}-error`} role="alert" className="text-xs text-destructive">{error}</p> : null}
  </div>;
}
