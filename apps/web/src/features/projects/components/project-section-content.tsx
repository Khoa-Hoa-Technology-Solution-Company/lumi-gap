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
    // Opacity leaves fixed dialogs and popovers in their normal coordinate space.
    const animation = content.current.animate([{ opacity: 0.25 }, { opacity: 1 }], {
      duration: 200,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    });
    // Rapid switching replaces the current animation immediately.
    return () => animation.cancel();
  }, [activeTab]);

  return <div ref={content} className="project-workspace-content">{children}</div>;
}
