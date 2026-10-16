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
    const from = previousPath.current;
    const changingPage = from !== undefined;
    previousPath.current = pathname;
    // Start ordinary page links at the top. Browser history and links to a
    // specific reply retain their own scroll handling.
    const replyPermalink = /^\/forum\/[^/]+\/\d+\/?$/.test(pathname);
    if (changingPage && navigationType === "PUSH" && !hash && !replyPermalink) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // List → project communicates going into the workspace. Returning goes in
    // the opposite direction; tab/filter changes above never replay this.
    const projectDetail = /^\/projects\/[^/]+\/?$/;
    const enteringProject = from === "/projects" && projectDetail.test(pathname);
    const leavingProject = from !== undefined && projectDetail.test(from) && pathname === "/projects";
    const switchingProject = from !== undefined && projectDetail.test(from) && projectDetail.test(pathname);
    // Animate inside the project gutters to avoid a horizontal page scrollbar.
    // Forum navigation stays stationary while its reading surface settles in.
    const selector = enteringProject ? ".project-detail-page" : leavingProject ? ".project-directory-page" : ".forum-content";
    const projectPanel = (pathname === "/projects" || projectDetail.test(pathname))
      ? content.current?.querySelector<HTMLElement>(".project-browser-panel") : undefined;
    const surface = projectPanel ?? content.current?.querySelector<HTMLElement>(selector) ?? content.current;
    if (!surface?.animate) return;
    const animation = surface.animate(
      [
        { opacity: enteringProject || leavingProject || switchingProject ? 0.55 : 0.92, transform: enteringProject ? "translateX(14px)" : leavingProject ? "translateX(-14px)" : "translateY(4px)" },
        { opacity: 1, transform: "translate(0, 0)" },
      ],
      { duration: enteringProject || leavingProject ? 260 : 180, easing: "cubic-bezier(0.2, 0.65, 0.3, 1)" },
    );
    return () => animation.cancel();
  }, [pathname, hash, navigationType]);

  return <div ref={content} className="app-route-content min-w-0">{children}</div>;
}
