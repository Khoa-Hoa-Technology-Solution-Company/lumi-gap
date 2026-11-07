import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { Loader2, SendHorizonal } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Presentation only. Each conversation keeps its own API and access rules. */
export function ProjectChatMessage({ own, author, avatarUrl, createdAt, locale, content, deleted = false, footer }: {
  own: boolean; author: string; avatarUrl?: string; createdAt: string; locale: string;
  content: string; deleted?: boolean; footer?: ReactNode;
}) {
  const date = new Date(createdAt);
  return <div className="project-chat-message" data-own={own} data-deleted={deleted}>
    {!own && <div className="project-chat-avatar" aria-hidden="true">{avatarUrl ? <img src={avatarUrl} alt="" /> : author.charAt(0).toUpperCase()}</div>}
    <div className="project-chat-message-main">
      <div className="project-chat-message-meta"><strong>{author}</strong><time dateTime={createdAt} title={date.toLocaleString(locale)}>{date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</time></div>
      <div className="project-chat-bubble"><p>{content}</p></div>
      {footer && <div className="project-chat-message-footer">{footer}</div>}
    </div>
  </div>;
}

export function ProjectChatComposer({ value, onChange, onSend, disabled, pending, label, placeholder, sendLabel, keyboardHint, mobileHint, textareaRef, minLength = 1, maxLength = 2000 }: {
  value: string; onChange: (value: string) => void; onSend: () => void; disabled: boolean; pending: boolean;
  label: string; placeholder: string; sendLabel: string; keyboardHint: string; mobileHint: string;
  textareaRef?: RefObject<HTMLTextAreaElement>; minLength?: number; maxLength?: number;
}) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? localRef;
  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = `${Math.min(Math.max(ref.current.scrollHeight, 46), 160)}px`;
  }, [value, ref]);
  const submit = () => { if (!disabled && !pending && value.trim().length >= minLength && value.length <= maxLength) onSend(); };
  return <div className="project-chat-compose">
    <form onSubmit={event => { event.preventDefault(); submit(); }}>
      <textarea ref={ref} value={value} onChange={event => onChange(event.target.value)}
        onKeyDown={event => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229 && !window.matchMedia?.("(pointer: coarse)").matches) {
            event.preventDefault(); submit();
          }
        }} maxLength={maxLength} rows={1} aria-label={label} placeholder={placeholder} disabled={disabled || pending} />
      <div className="project-chat-compose-toolbar">
        <span className="project-chat-keyboard-hint">{keyboardHint}</span>
        <span className="project-chat-mobile-hint">{mobileHint}</span>
        <div className="project-chat-send-actions">{value.length > maxLength * .8 && <small>{value.length}/{maxLength}</small>}<Button type="submit" size="sm" disabled={disabled || pending || value.trim().length < minLength || value.length > maxLength}>{pending ? <Loader2 size={16} className="animate-spin" /> : <SendHorizonal size={16} />}{sendLabel}</Button></div>
      </div>
    </form>
  </div>;
}
