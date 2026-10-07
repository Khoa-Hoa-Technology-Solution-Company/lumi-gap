import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/utils/cn";

type Position = { top: number; left: number; arrow: number; side: "above" | "below" };

export function ForumStatPopover({ trigger, label, title, triggerLabel, triggerClassName, className, children }: {
  trigger: ReactNode;
  label: string;
  title?: string;
  triggerLabel?: string;
  triggerClassName?: string;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    focused.current = false;
    let frame = 0;
    const place = () => {
      frame = 0;
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const anchor = trigger.getBoundingClientRect();
      if (anchor.bottom < 0 || anchor.top > window.innerHeight) { setOpen(false); return; }
      const box = panel.getBoundingClientRect();
      const gutter = 12;
      const left = Math.max(gutter, Math.min(anchor.left, document.documentElement.clientWidth - box.width - gutter));
      const above = anchor.top - box.height - 10;
      const belowFits = anchor.bottom + box.height + 10 <= window.innerHeight - gutter;
      const side = !belowFits && above >= gutter ? "above" : "below";
      const top = Math.max(gutter, Math.min(side === "above" ? above : anchor.bottom + 10, window.innerHeight - box.height - gutter));
      const arrow = Math.max(16, Math.min(anchor.left + anchor.width / 2 - left, box.width - 16));
      setPosition((previous) => previous?.top === top && previous.left === left && previous.arrow === arrow && previous.side === side ? previous : { top, left, arrow, side });
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(place); };
    const outside = (event: Event) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); triggerRef.current?.focus({ preventScroll: true }); }
    };
    place();
    const observer = new ResizeObserver(schedule);
    if (panelRef.current) observer.observe(panelRef.current);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    document.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
      document.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [open]);
  useEffect(() => {
    if (open && position && !focused.current) { focused.current = true; panelRef.current?.focus({ preventScroll: true }); }
  }, [open, position]);

  return <>
    <button ref={triggerRef} type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined} aria-label={triggerLabel} title={title} className={triggerClassName} onClick={() => { if (!open) setPosition(undefined); setOpen((previous) => !previous); }}>{trigger}</button>
    {open ? createPortal(<div ref={panelRef} id={panelId} tabIndex={-1} role="dialog" aria-label={label} className={cn("forum-stat-popover", className)} data-side={position?.side} style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? "visible" : "hidden" }}>
      <span className="forum-stat-popover-arrow" aria-hidden="true" style={{ left: position?.arrow ?? 16 }} />
      {children}
    </div>, document.body) : null}
  </>;
}
