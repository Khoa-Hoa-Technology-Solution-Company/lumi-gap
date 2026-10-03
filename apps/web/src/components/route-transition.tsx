import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/** Animate the new content without remounting forms or moving the app header. */
export function RouteTransition({ children }: { children: ReactNode }) {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();
  const content = useRef<HTMLDivElement>(null);
  const previousPath = useRef<string>();

  useLayoutEffect(() => {
    if (previousPath.current === pathname) return;
    const changingPage = previousPath.current !== undefined;
    previousPath.current = pathname;
    // Start ordinary page links at the top. Browser history and links to a
    // specific reply retain their own scroll handling.
    const replyPermalink = /^\/forum\/[^/]+\/\d+\/?$/.test(pathname);
    if (changingPage && navigationType === "PUSH" && !hash && !replyPermalink) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Forum navigation stays stationary while its reading surface settles in.
    const surface = content.current?.querySelector<HTMLElement>(".forum-content") ?? content.current;
    if (!surface?.animate) return;
    const animation = surface.animate(
      [{ opacity: 0.92, transform: "translateY(4px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: 180, easing: "cubic-bezier(0.2, 0.65, 0.3, 1)" },
    );
    return () => animation.cancel();
  }, [pathname, hash, navigationType]);

  return <div ref={content} className="app-route-content min-w-0">{children}</div>;
}
