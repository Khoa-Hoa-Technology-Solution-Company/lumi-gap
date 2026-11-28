import { useLayoutEffect, useRef, useState } from "react";

export interface UseChatScrollOptions {
  /**
   * "follow-bottom" (default): snap/follow to the bottom when near bottom (Team & Mentor chat).
   * "ai-turn": when a long AI response arrives while following, align the start of the latest response
   * into view if it exceeds ~70% of the feed viewport so readers read naturally from the top.
   */
  policy?: "follow-bottom" | "ai-turn";
  /** Optional element ID of the latest assistant response for "ai-turn" alignment. */
  latestAssistantElementId?: string;
}

/** Follow the conversation only while the reader is already at its end. */
export function useChatScroll(latestMessageId?: string, options?: UseChatScrollOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(true);
  const initialPositionedRef = useRef(false);
  const [atBottom, setAtBottom] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  const policy = options?.policy ?? "follow-bottom";
  const latestAssistantElementId = options?.latestAssistantElementId;

  const syncNearBottomState = (container: HTMLDivElement) => {
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 64;
    followingRef.current = nearBottom;
    setAtBottom(nearBottom);
    if (nearBottom) setHasNewMessages(false);
  };

  const jumpToLatest = () => {
    const container = containerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
    followingRef.current = true;
    setAtBottom(true);
    setHasNewMessages(false);
  };

  useLayoutEffect(() => {
    if (!latestMessageId) return;
    const container = containerRef.current;
    if (!container) return;

    if (!followingRef.current) {
      setHasNewMessages(true);
      return;
    }

    // Initial mount or standard bottom-following turn
    if (policy === "ai-turn" && initialPositionedRef.current && latestAssistantElementId) {
      const target = document.getElementById(latestAssistantElementId);
      if (target && container.clientHeight > 0 && target.offsetHeight > container.clientHeight * 0.72) {
        container.scrollTop = Math.max(0, target.offsetTop - 16);
        syncNearBottomState(container);
        return;
      }
    }

    jumpToLatest();
    initialPositionedRef.current = true;
  }, [latestMessageId, policy, latestAssistantElementId]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (followingRef.current) jumpToLatest();
    });
    observer.observe(container);
    // Reference cards or Markdown tables can resolve after the message arrives and change height.
    for (const child of container.children) observer.observe(child);
    return () => observer.disconnect();
  }, [latestMessageId]);

  const onScroll = () => {
    const container = containerRef.current;
    if (!container) return;
    syncNearBottomState(container);
  };

  return { containerRef, atBottom, hasNewMessages, onScroll, jumpToLatest };
}
