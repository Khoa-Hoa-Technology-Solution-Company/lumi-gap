import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const list = readFileSync(new URL("../../../pages/forum/forum-list.tsx", import.meta.url), "utf8");
const composer = readFileSync(new URL("../../../pages/forum/forum-new.tsx", import.meta.url), "utf8");

describe("Forum discussion popup composer", () => {
  it("opens a lazy composer without navigating away from the current feed", () => {
    expect(list).toContain("const ForumDiscussionComposer = lazy(");
    expect(list).toContain("<Dialog open={composerOpen}");
    expect(list).toContain("onPublished={(postId) =>");
    expect(list).toContain("forum-discussion-dialog");
    expect(composer).toContain("Expand composer");
    expect(list).not.toContain("to={forumNewDiscussionHref(searchParams)}");
  });

  it("keeps the direct route and popup on the same shared form", () => {
    expect(composer).toContain("export function ForumNewPage() {");
    expect(composer).toContain("export function ForumDiscussionComposer(");
    expect(composer).toContain("onPublished?: (postId: string) => void");
    expect(composer).toContain("closeRequest?: number");
    expect(composer).not.toContain("window.confirm");
  });

  it("provides an in-app discard confirmation and responsive docked layout", () => {
    expect(composer).toContain("Discard this discussion draft?");
    expect(composer).toContain("Your unsaved discussion content will be lost.");
    expect(list).toContain("rounded-none");
    expect(list).toContain("sm:rounded-xl");
  });
});
