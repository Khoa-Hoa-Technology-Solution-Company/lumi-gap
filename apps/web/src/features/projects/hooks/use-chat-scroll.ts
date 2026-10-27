import { useLayoutEffect, useRef, useState } from "react";

/** Follow the conversation only while the reader is already at its end. */
export function useChatScroll(latestMessageId?: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  const jumpToLatest = () => {
    const container = containerRef.current;
    if (container) container.scrollTop = container.scrollHeight;
    followingRef.current = true;
    setAtBottom(true);
    setHasNewMessages(false);
  };

  useLayoutEffect(() => {
    if (!latestMessageId) return;
    if (followingRef.current) jumpToLatest();
    else setHasNewMessages(true);
  }, [latestMessageId]);

  const onScroll = () => {
    const container = containerRef.current;
    if (!container) return;
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 64;
    followingRef.current = nearBottom;
    setAtBottom(nearBottom);
    if (nearBottom) setHasNewMessages(false);
  };

  return { containerRef, atBottom, hasNewMessages, onScroll, jumpToLatest };
}
