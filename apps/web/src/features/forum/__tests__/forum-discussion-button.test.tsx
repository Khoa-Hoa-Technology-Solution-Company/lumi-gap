import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button, buttonVariants } from "@/components/ui/button";

describe("Discussion creation button", () => {
  it("uses a scoped accent without changing the app-wide default", () => {
    const accent = buttonVariants({ variant: "discussion" });
    expect(accent).toContain("forum-discussion-button");
    expect(accent).toContain("focus-visible:ring-2");
    expect(accent).toContain("focus-visible:ring-[var(--discussion-focus)]");
    expect(accent).not.toContain("bg-primary");
    expect(buttonVariants()).toContain("bg-primary text-primary-foreground");
    expect(buttonVariants()).not.toContain("forum-discussion-button");
  });

  it("preserves disabled behavior and link composition", () => {
    const disabled = renderToStaticMarkup(<Button variant="discussion" disabled>New discussion</Button>);
    expect(disabled).toContain('disabled=""');
    expect(disabled).toContain("disabled:pointer-events-none disabled:opacity-50");
    const link = renderToStaticMarkup(<Button variant="discussion" asChild><a href="/forum/new">New discussion</a></Button>);
    expect(link).toContain('href="/forum/new"');
    expect(link).toContain("forum-discussion-button");
    expect(link).not.toContain("<button");
  });

  it("provides theme-specific colors and guarded hover/pressed states", () => {
    const css = readFileSync(new URL("../../../theme/globals.css", import.meta.url), "utf8");
    expect(css).toContain(".dark .forum-discussion-button {");
    expect(css).toContain(".forum-discussion-button:hover:not(:disabled)");
    expect(css).toContain(".forum-discussion-button:active:not(:disabled)");
    expect(css).toContain("color: var(--discussion-foreground)");
  });

  it("uses the same accent on forum and community creation entry points", () => {
    const list = readFileSync(new URL("../../../pages/forum/forum-list.tsx", import.meta.url), "utf8");
    const community = readFileSync(new URL("../../../pages/communities/community-detail.tsx", import.meta.url), "utf8");
    expect(list.match(/variant="discussion"/g)).toHaveLength(3);
    expect(community.match(/variant="discussion"/g)).toHaveLength(2);
  });
});
