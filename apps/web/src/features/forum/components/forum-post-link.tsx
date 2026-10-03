import type { AnchorHTMLAttributes } from "react";
import { forumPostHref } from "../utils/forum-helpers";

export function ForumPostLink({ post, postNumber, targetId, onJump, ...props }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick"> & {
  post: { id: string; publicSlug?: string };
  postNumber: number;
  targetId: string;
  onJump?: (postNumber: number) => void;
}) {
  return <a {...props} href={forumPostHref(post, postNumber)} onClick={(event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (onJump) { onJump(postNumber); return; }
    const node = document.getElementById(targetId);
    if (!node) return;
    node.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    node.focus({ preventScroll: true });
  }} />;
}
