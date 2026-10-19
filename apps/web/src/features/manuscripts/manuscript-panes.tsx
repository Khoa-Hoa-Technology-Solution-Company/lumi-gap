import { useRef, useState, type CSSProperties, type ReactNode, type PointerEvent, type KeyboardEvent } from "react";
import { useI18n } from "@/i18n";

type Sizes = { files: number; aside: number };
type Side = keyof Sizes;
export function ManuscriptPanes({ files, editor, aside, filesOpen, asideOpen, activePane }: {
  files: ReactNode; editor: ReactNode; aside: ReactNode; filesOpen: boolean; asideOpen: boolean; activePane: string;
}) {
  const { t } = useI18n();
  const host = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; width: number; sizes: Sizes } | null>(null);
  const [preferredSizes, setSizes] = useState<Sizes>({ files: 18, aside: 36 });
  // Reopening a pane must still leave at least 34% for the source editor.
  const sizes = { files: preferredSizes.files, aside: filesOpen && asideOpen ? Math.min(preferredSizes.aside, 66 - preferredSizes.files) : preferredSizes.aside };
  const resize = (side: Side, value: number) => setSizes({ ...sizes, [side]: Math.max(side === "files" ? 12 : 20, Math.min(side === "files" ? 30 : 46, 66 - (side === "files" ? asideOpen ? sizes.aside : 0 : filesOpen ? sizes.files : 0), value)) });
  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !host.current) return;
    drag.current = { x: event.clientX, width: host.current.getBoundingClientRect().width, sizes };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLDivElement>, side: Side) => {
    if (!drag.current || !drag.current.width) return;
    const delta = (event.clientX - drag.current.x) / drag.current.width * 100;
    resize(side, drag.current.sizes[side] + (side === "files" ? delta : -delta));
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>, side: Side) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    resize(side, event.key === "Home" ? 0 : event.key === "End" ? 100 : sizes[side] + (event.key === "ArrowRight" ? 2 : -2) * (side === "files" ? 1 : -1));
  };
  const separator = (side: Side, visible: boolean) => <div className="writing-resizer" data-visible={visible} role="separator" tabIndex={visible ? 0 : -1} aria-hidden={!visible} aria-label={t(side === "files" ? "Resize files panel" : "Resize information panel")} aria-controls={side === "files" ? "writing-files" : "writing-aside"} aria-orientation="vertical" aria-valuemin={side === "files" ? 12 : 20} aria-valuemax={Math.min(side === "files" ? 30 : 46, 66 - (side === "files" ? asideOpen ? sizes.aside : 0 : filesOpen ? sizes.files : 0))} aria-valuenow={Math.round(sizes[side])} onPointerDown={start} onPointerMove={event => move(event, side)} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }} onKeyDown={event => keyboard(event, side)} />;
  return <div ref={host} className="writing-panes" data-active-pane={activePane} data-files-open={filesOpen} data-aside-open={asideOpen} style={{ "--writing-files-width": filesOpen ? `${sizes.files}%` : "0px", "--writing-aside-width": asideOpen ? `${sizes.aside}%` : "0px", "--writing-left-handle": filesOpen ? "6px" : "0px", "--writing-right-handle": asideOpen ? "6px" : "0px" } as CSSProperties}>
    {files}{separator("files", filesOpen)}{editor}{separator("aside", asideOpen)}{aside}
  </div>;
}
