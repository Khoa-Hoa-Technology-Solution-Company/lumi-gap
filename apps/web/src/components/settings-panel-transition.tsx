import { useLayoutEffect, useRef, type ReactNode } from "react";

/** Keep the settings card steady while its selected section and loaded data change. */
export function SettingsPanelTransition({ section, children }: { section: string; children: ReactNode }) {
  const shell = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const previousSection = useRef(section);
  const previousHeight = useRef<number>();
  const heightAnimation = useRef<Animation>();
  const contentAnimation = useRef<Animation>();

  useLayoutEffect(() => {
    const frame = shell.current;
    const panel = content.current;
    if (!frame || !panel) return;
    const resize = () => {
      const nextHeight = panel.getBoundingClientRect().height;
      if (previousHeight.current === nextHeight) return;
      const fromHeight = heightAnimation.current ? frame.getBoundingClientRect().height : previousHeight.current ?? nextHeight;
      previousHeight.current = nextHeight;
      heightAnimation.current?.cancel();
      heightAnimation.current = undefined;
      frame.style.removeProperty("overflow");
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !frame.animate || Math.abs(fromHeight - nextHeight) < 1) return;
      frame.style.overflow = "hidden";
      const animation = frame.animate([{ height: `${fromHeight}px` }, { height: `${nextHeight}px` }], { duration: 220, easing: "cubic-bezier(0.2, 0.65, 0.3, 1)" });
      heightAnimation.current = animation;
      void animation.finished.then(() => {
        if (heightAnimation.current !== animation) return;
        heightAnimation.current = undefined;
        frame.style.removeProperty("overflow");
      }).catch(() => { /* A newer section can interrupt this animation. */ });
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(panel);
    return () => {
      observer.disconnect();
      heightAnimation.current?.cancel();
      heightAnimation.current = undefined;
      frame.style.removeProperty("overflow");
    };
  }, []);

  useLayoutEffect(() => {
    if (previousSection.current === section) return;
    previousSection.current = section;
    contentAnimation.current?.cancel();
    const panel = content.current;
    if (!panel?.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = panel.animate([{ opacity: 0.85, transform: "translateY(4px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 180, easing: "cubic-bezier(0.2, 0.65, 0.3, 1)" });
    contentAnimation.current = animation;
    return () => { animation.cancel(); contentAnimation.current = undefined; };
  }, [section]);

  return <div ref={shell} className="min-w-0"><div ref={content}>{children}</div></div>;
}
