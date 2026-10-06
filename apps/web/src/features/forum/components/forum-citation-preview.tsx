import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Link, useInRouterContext } from "react-router-dom";
import { BookOpen, ExternalLink } from "lucide-react";
import { forumCitationPaperIdPattern } from "@trend/shared-types";
import { useI18n } from "@/i18n";
import type { ForumReferenceView } from "../api/forum.api";

// Delegate events so Tiptap keeps its atomic DOM nodes and selection intact.
// One card serves all citations in this editor/post, including repeated sources.
export function ForumCitationPreview({ scope, references, editable = false, enabled = true }: {
  scope: RefObject<HTMLElement>; references: ForumReferenceView[]; editable?: boolean; enabled?: boolean;
}) {
  const { t } = useI18n();
  const inRouter = useInRouterContext();
  const id = useId();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number; maxHeight: number }>();
  const card = useRef<HTMLDivElement>(null);
  const currentAnchor = useRef<HTMLElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const focusCard = useRef(false);
  const paperId = anchor?.getAttribute("data-forum-citation") ?? "";
  const source = references.find((item) => item.paperId?.toLowerCase() === paperId.toLowerCase());
  const host = anchor?.closest<HTMLElement>('[role="dialog"]') ?? (typeof document !== "undefined" ? document.body : null);

  const cancelClose = useCallback(() => {
    clearTimeout(closeTimer.current);
  }, []);
  const close = useCallback(() => {
    cancelClose(); focusCard.current = false; currentAnchor.current = null; setAnchor(null); setPosition(undefined);
  }, [cancelClose]);
  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      if (!currentAnchor.current?.contains(document.activeElement) && !card.current?.contains(document.activeElement)) close();
    }, 180);
  }, [cancelClose, close]);

  useEffect(() => {
    const root = scope.current;
    if (!root || !enabled) { close(); return; }
    const marker = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>("[data-forum-citation]") : null;
    const show = (target: EventTarget | null) => {
      const element = marker(target);
      if (!element || !root.contains(element) || !forumCitationPaperIdPattern.test(element.getAttribute("data-forum-citation") ?? "")) return;
      cancelClose();
      if (element !== currentAnchor.current) setPosition(undefined);
      currentAnchor.current = element; setAnchor(element);
    };
    const leave = (event: PointerEvent | FocusEvent) => {
      const target = event.relatedTarget;
      if (target instanceof Node && (currentAnchor.current?.contains(target) || card.current?.contains(target))) return;
      scheduleClose();
    };
    const enter = (event: Event) => show(event.target);
    const click = (event: MouseEvent) => {
      if (!editable || !marker(event.target)) return;
      event.preventDefault(); show(event.target);
    };
    const pointerDown = (event: PointerEvent) => {
      if (editable && marker(event.target)) event.preventDefault();
    };
    const keyDown = (event: KeyboardEvent) => {
      if (!editable || !marker(event.target) || (event.key !== "Enter" && event.key !== " ")) return;
      event.preventDefault(); event.stopPropagation(); focusCard.current = true; show(event.target);
      card.current?.querySelector<HTMLAnchorElement>("a")?.focus({ preventScroll: true });
    };
    root.addEventListener("pointerover", enter);
    root.addEventListener("pointerout", leave);
    root.addEventListener("focusin", enter);
    root.addEventListener("focusout", leave);
    root.addEventListener("click", click);
    root.addEventListener("pointerdown", pointerDown, true);
    root.addEventListener("keydown", keyDown, true);
    return () => {
      cancelClose();
      root.removeEventListener("pointerover", enter);
      root.removeEventListener("pointerout", leave);
      root.removeEventListener("focusin", enter);
      root.removeEventListener("focusout", leave);
      root.removeEventListener("click", click);
      root.removeEventListener("pointerdown", pointerDown, true);
      root.removeEventListener("keydown", keyDown, true);
    };
  }, [scope, editable, enabled, cancelClose, scheduleClose, close]);

  useEffect(() => {
    if (!anchor || !source || !host || !card.current) return;
    const update = () => {
      if (!anchor.isConnected || scope.current?.hidden) { close(); return; }
      const rect = anchor.getBoundingClientRect();
      const bounds = host === document.body ? { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight } : host.getBoundingClientRect();
      const topEdge = Math.max(0, bounds.top) + 12;
      const bottomEdge = Math.min(window.innerHeight, bounds.bottom) - 12;
      const leftEdge = Math.max(0, bounds.left) + 12;
      const rightEdge = Math.min(window.innerWidth, bounds.right) - 12;
      if (rect.bottom < topEdge || rect.top > bottomEdge || rect.right < leftEdge || rect.left > rightEdge) { close(); return; }
      const width = Math.max(0, Math.min(360, rightEdge - leftEdge));
      card.current!.style.width = `${width}px`;
      const maxHeight = Math.max(0, bottomEdge - topEdge);
      const height = Math.min(card.current!.scrollHeight, maxHeight);
      const left = Math.max(leftEdge, Math.min(rect.left - 8, rightEdge - width));
      const below = rect.bottom + 8;
      const top = Math.max(topEdge, Math.min(below + height <= bottomEdge ? below : rect.top - height - 8, bottomEdge - height));
      // In a modal, portal into the dialog to retain its focus trap. Position
      // within its visible scroll area, outside the editor's clipped frame.
      setPosition({ top: top - (host === document.body ? 0 : bounds.top + host.clientTop - host.scrollTop), left: left - (host === document.body ? 0 : bounds.left + host.clientLeft - host.scrollLeft), maxHeight });
    };
    update();
    window.addEventListener("resize", update);
    document.addEventListener("scroll", update, true);
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
    observer?.observe(card.current);
    const documentObserver = new MutationObserver(update);
    if (scope.current) documentObserver.observe(scope.current, { childList: true, subtree: true, characterData: true });
    return () => { observer?.disconnect(); documentObserver.disconnect(); window.removeEventListener("resize", update); document.removeEventListener("scroll", update, true); };
  }, [anchor, source, host, scope, close]);

  useEffect(() => {
    if (!anchor || !source) return;
    const previous = anchor.getAttribute("aria-describedby");
    anchor.setAttribute("aria-describedby", [previous, id].filter(Boolean).join(" "));
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !anchor.contains(event.target) && !card.current?.contains(event.target)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation();
      if (card.current?.contains(document.activeElement)) anchor.focus({ preventScroll: true });
      close();
    };
    document.addEventListener("pointerdown", outside);
    // Run before the dialog's document listener so Escape dismisses only this card.
    window.addEventListener("keydown", escape, true);
    return () => {
      if (previous === null) anchor.removeAttribute("aria-describedby"); else anchor.setAttribute("aria-describedby", previous);
      document.removeEventListener("pointerdown", outside); window.removeEventListener("keydown", escape, true);
    };
  }, [anchor, source, id, close]);

  useEffect(() => {
    if (position && focusCard.current) { focusCard.current = false; card.current?.querySelector<HTMLAnchorElement>("a")?.focus({ preventScroll: true }); }
  }, [position]);

  if (!enabled || !anchor || !source || !host) return null;
  const href = `/papers/${encodeURIComponent(paperId)}`;
  const linkProps = { className: "mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", target: editable ? "_blank" : undefined, rel: editable ? "noopener noreferrer" : undefined, onClick: close, children: <><ExternalLink aria-hidden className="h-3.5 w-3.5" />{t("View paper")}</> };
  return createPortal(<div ref={card} id={id} role="dialog" aria-label={t("Citation source")} className="forum-citation-preview not-prose z-[110] overflow-y-auto rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg" style={{ position: host === document.body ? "fixed" : "absolute", ...position, visibility: position ? "visible" : "hidden" }} onPointerEnter={cancelClose} onPointerLeave={scheduleClose} onFocus={cancelClose} onBlur={scheduleClose}>
    <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><BookOpen aria-hidden className="h-3.5 w-3.5" />{t("Citation source")} {anchor.textContent}</p>
    <p className="text-sm font-semibold leading-5">{source.title || t("Academic Paper")}</p>
    {source.authors?.length ? <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{source.authors.join(", ")}</p> : null}
    {source.year || source.venue ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{[source.year, source.venue].filter(Boolean).join(" · ")}</p> : null}
    {source.doi ? <p className="mt-1 break-all text-xs leading-5 text-muted-foreground">DOI: {source.doi}</p> : null}
    {inRouter ? <Link to={href} {...linkProps} /> : <a href={href} {...linkProps} />}
  </div>, host);
}
