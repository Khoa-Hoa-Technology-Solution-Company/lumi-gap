import { useLayoutEffect, useRef } from "react";

/** Keep the selected feed visible without scrolling the page itself. */
export function useForumFeedVisibility(selection: string) {
  const navigation = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const container = navigation.current;
    const active = container?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!container || !active) return;

    const reveal = () => {
      if (container.scrollWidth <= container.clientWidth) return;
      const viewport = container.getBoundingClientRect();
      const tab = active.getBoundingClientRect();
      if (tab.right > viewport.right) container.scrollLeft += tab.right - viewport.right;
      else if (tab.left < viewport.left) container.scrollLeft += tab.left - viewport.left;
    };

    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(container);
    observer.observe(active);
    return () => observer.disconnect();
  }, [selection]);

  return navigation;
}
