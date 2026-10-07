import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useI18n } from "@/i18n";

function heightBounds() {
  const viewport = window.visualViewport?.height ?? window.innerHeight;
  const max = Math.max(1, viewport - (window.innerWidth >= 640 ? 32 : 0));
  return { min: Math.min(360, max), max };
}

export function ForumComposerResizeHandle({ height, expanded, onResize }: {
  height?: number;
  expanded: boolean;
  onResize: (height: number) => void;
}) {
  const { t } = useI18n();
  const [bounds, setBounds] = useState(heightBounds);
  const drag = useRef<{ pointerId: number; y: number; height: number } | null>(null);
  useEffect(() => {
    const update = () => setBounds(heightBounds());
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);
  const resize = (value: number) => {
    const limits = heightBounds();
    onResize(Math.round(Math.max(limits.min, Math.min(limits.max, value))));
  };
  const currentHeight = (element: HTMLElement) => element.closest('[role="dialog"]')?.getBoundingClientRect().height ?? height ?? bounds.max;
  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 80 : 24;
    const current = currentHeight(event.currentTarget);
    const next = event.key === "ArrowUp" ? current + step : event.key === "ArrowDown" ? current - step : event.key === "Home" ? bounds.min : event.key === "End" ? bounds.max : undefined;
    if (next === undefined) return;
    event.preventDefault();
    resize(next);
  };
  return <div
    role="separator"
    tabIndex={0}
    aria-orientation="horizontal"
    aria-label={t("Resize discussion composer")}
    aria-controls="forum-discussion-dialog"
    aria-valuemin={Math.round(bounds.min)}
    aria-valuemax={Math.round(bounds.max)}
    aria-valuenow={Math.round(Math.max(bounds.min, Math.min(bounds.max, expanded ? bounds.max : height ?? (window.innerWidth >= 640 ? Math.min(bounds.max, window.innerHeight * 0.78, 928) : bounds.max))))}
    title={t("Drag up or down to resize. Use arrow keys when focused.")}
    className="absolute left-1/2 top-0 flex h-6 w-24 -translate-x-1/2 cursor-ns-resize touch-none select-none items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    onPointerDown={(event) => {
      if (event.button !== 0 || drag.current) return;
      event.preventDefault();
      event.currentTarget.focus({ preventScroll: true });
      drag.current = { pointerId: event.pointerId, y: event.clientY, height: currentHeight(event.currentTarget) };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={(event) => {
      if (drag.current?.pointerId !== event.pointerId) return;
      event.preventDefault();
      resize(drag.current.height + drag.current.y - event.clientY);
    }}
    onPointerUp={endDrag}
    onPointerCancel={endDrag}
    onLostPointerCapture={() => { drag.current = null; }}
    onKeyDown={onKeyDown}
  ><span aria-hidden="true" className="h-1 w-16 rounded-full bg-muted-foreground/30 transition-colors hover:bg-muted-foreground/60" /></div>;
}
