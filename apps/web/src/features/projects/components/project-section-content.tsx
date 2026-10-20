import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { ProjectTab } from "./project-section-nav";

/** Reveal section changes without remounting its content on unrelated updates. */
export function ProjectSectionContent({ activeTab, children }: { activeTab: ProjectTab; children: ReactNode }) {
  const content = useRef<HTMLDivElement>(null);
  const previousTab = useRef(activeTab);

  useLayoutEffect(() => {
    const changed = previousTab.current !== activeTab;
    previousTab.current = activeTab;
    if (!changed || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !content.current?.animate) return;
    // Smooth fade & gentle lift transition when switching tabs
    const animation = content.current.animate(
      [
        { opacity: 0.35, transform: "translateY(4px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      {
        duration: 220,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      }
    );
    // Rapid switching replaces the current animation immediately.
    return () => animation.cancel();
  }, [activeTab]);

  return <div ref={content} className="project-workspace-content">{children}</div>;
}
