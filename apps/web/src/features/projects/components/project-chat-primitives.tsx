import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Loader2, SendHorizonal } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Presentation only. Each conversation keeps its own API and access rules. */
export function ProjectChatMessage({ own, author, avatarUrl, createdAt, locale, content, deleted = false, footer, children, showOwnAvatar = false, grouped = false }: {
  own: boolean; author: string; avatarUrl?: string; createdAt: string; locale: string;
  content: string; deleted?: boolean; footer?: ReactNode; children?: ReactNode; showOwnAvatar?: boolean; grouped?: boolean;
}) {
  const date = new Date(createdAt);
  return <div className="project-chat-message" data-own={own} data-deleted={deleted} data-grouped={grouped}>
    {(!own || showOwnAvatar) && (grouped
      ? <div className="project-chat-avatar-spacer" aria-hidden="true" />
      : <div className="project-chat-avatar" aria-hidden="true">{avatarUrl ? <img src={avatarUrl} alt="" /> : author.charAt(0).toUpperCase()}</div>
    )}
    <div className="project-chat-message-main">
      {!grouped && <div className="project-chat-message-meta"><strong>{author}</strong><time dateTime={createdAt} title={date.toLocaleString(locale)}>{date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</time></div>}
      <div className="project-chat-bubble">{children}{content && <p>{content}</p>}</div>
      {footer && <div className="project-chat-message-footer">{footer}</div>}
    </div>
  </div>;
}

export function ProjectChatComposer({ value, onChange, onSend, disabled, pending, label, placeholder, sendLabel, keyboardHint, mobileHint, textareaRef, minLength = 1, maxLength = 2000, leading, preview, hasAttachment = false }: {
  value: string; onChange: (value: string) => void; onSend: () => void; disabled: boolean; pending: boolean;
  label: string; placeholder: string; sendLabel: string; keyboardHint?: string; mobileHint?: string;
  textareaRef?: RefObject<HTMLTextAreaElement>; minLength?: number; maxLength?: number;
  leading?: ReactNode; preview?: ReactNode; hasAttachment?: boolean;
}) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? localRef;
  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = `${Math.min(Math.max(ref.current.scrollHeight, 46), 160)}px`;
  }, [value, ref]);
  const submit = () => { if (!disabled && !pending && (hasAttachment || value.trim().length >= minLength) && value.length <= maxLength) onSend(); };
  return <div className="project-chat-compose">
    <form aria-busy={pending} onSubmit={event => { event.preventDefault(); submit(); }}>
      {preview}
      <textarea ref={ref} value={value} onChange={event => onChange(event.target.value)}
        onKeyDown={event => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229 && !window.matchMedia?.("(pointer: coarse)").matches) {
            event.preventDefault(); submit();
          }
        }} maxLength={maxLength} rows={1} aria-label={label} placeholder={placeholder} disabled={disabled || pending} />
      <div className="project-chat-compose-toolbar">
        {leading}
        {keyboardHint && <span className="project-chat-keyboard-hint">{keyboardHint}</span>}
        {mobileHint && <span className="project-chat-mobile-hint">{mobileHint}</span>}
        <div className="project-chat-send-actions">{value.length > maxLength * .8 && <small>{value.length}/{maxLength}</small>}<Button type="submit" size="sm" disabled={disabled || pending || (!hasAttachment && value.trim().length < minLength) || value.length > maxLength}>{pending ? <Loader2 size={16} className="animate-spin" /> : <SendHorizonal size={16} />}{sendLabel}</Button></div>
      </div>
    </form>
  </div>;
}
