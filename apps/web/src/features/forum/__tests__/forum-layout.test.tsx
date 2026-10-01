import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ForumLayout } from "../components/forum-layout";
import { ForumSidebar } from "../components/forum-sidebar";
import { ForumThreadTimeline } from "../components/forum-thread-timeline";

vi.mock("@/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, language: "en" }),
}));

describe("Forum workspace layout", () => {
  it("uses one sidebar width without introducing a second header or document scroll", () => {
    const markup = renderToStaticMarkup(
      <ForumLayout sidebar={<aside>Local navigation</aside>}>
        <article>Conversation</article>
      </ForumLayout>,
    );

    expect(markup).toContain("--app-header-height");
    expect(markup).toContain("md:grid-cols-[var(--forum-sidebar-width)_minmax(0,1fr)]");
    expect(markup).toContain("forum-workspace");
    expect(markup).toContain("Local navigation");
    expect(markup).toContain("Conversation");
    expect(markup).not.toContain("<header");
    expect(markup).not.toContain("<main");
    expect(markup).not.toMatch(/overflow-(hidden|auto|scroll|y-auto)/);
  });

  it("constrains desktop local navigation below the app bar and exposes a separate mobile drawer trigger", () => {
    const markup = renderToStaticMarkup(
      <StaticRouter location="/forum">
        <ForumSidebar />
      </StaticRouter>,
    );

    expect(markup).toContain("sticky top-[var(--app-header-height)]");
    expect(markup).toContain("max-h-[calc(100dvh-var(--app-header-height))]");
    expect(markup).toContain("overflow-y-auto");
    expect(markup).toContain("overscroll-y-contain");
    expect(markup).toContain('aria-label="Forum navigation"');
    expect(markup).toContain('aria-label="Open forum navigation"');
    expect(markup).toContain("md:hidden");
    expect(markup).toContain("bg-background md:block");
  });

  it("anchors navigation at the viewport edge while independently centering the bounded reading area", () => {
    const markup = renderToStaticMarkup(
      <ForumLayout sidebar={<aside>Navigation</aside>}><article>Topics</article></ForumLayout>,
    );

    expect(markup).toContain("forum-content mx-auto w-full min-w-0");
    expect(markup).toContain("max-w-[calc(var(--forum-reading-width)+4rem)]");
    expect(markup).not.toContain("max-w-[1800px]");
  });

  it("anchors the timeline below the same app header token", () => {
    const markup = renderToStaticMarkup(
      <ForumThreadTimeline
        postIds={["opening-post"]}
        total={1}
        createdAt="2026-09-30T00:00:00.000Z"
        lastActivityAt="2026-09-30T00:00:00.000Z"
      />,
    );

    expect(markup).toContain('aria-label="Discussion timeline"');
    expect(markup).toContain("sticky top-[calc(var(--app-header-height)+2rem)]");
    expect(markup).not.toContain("overflow-y-auto");
  });
});
