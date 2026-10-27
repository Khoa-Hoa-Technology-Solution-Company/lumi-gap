import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const globals = read("../../../theme/globals.css");
const header = read("../../../layouts/app-header.css");
const surface = read("../../../theme/lumi-surface.css");

/** Body of the first rule whose selector line contains `selector`. */
function rule(css: string, selector: string) {
  const start = css.indexOf(selector);
  expect(start, selector).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
}

describe("Community area surface", () => {
  it("defines the shared palette for light and dark", () => {
    expect(surface).toMatch(/\.lumi-surface\s*{[^}]*--lumi-surface:\s*#ffffff[^}]*--lumi-line:\s*#e2e8f0[^}]*--lumi-accent:\s*#2563eb/i);
    expect(surface).toMatch(/\.dark \.lumi-surface\s*{[^}]*--lumi-surface:\s*#0b1120[^}]*--lumi-line:\s*#1e293b[^}]*--lumi-accent:\s*#60a5fa/i);
    expect(rule(surface, ".lumi-surface {")).toContain("font-family: var(--forum-font)");
  });

  it("drops the lavender scenery and illustration from the forum shell", () => {
    expect(header).not.toMatch(/--forum-(canvas|scenery)/);
    expect(header).not.toContain("research-connections");
    expect(header).not.toMatch(/forum-app-shell::before/);
  });

  it("keeps the forum and category workspaces transparent so the shell shows through", () => {
    expect(rule(globals, ".forum-feed-workspace { background")).toContain("transparent");
    expect(rule(globals, ".forum-category-workspace .forum-feed-content {")).not.toMatch(/gradient|color-mix/);
    expect(rule(globals, ".forum-feed-workspace .forum-feed-content {")).not.toMatch(/gradient|color-mix/);
    expect(rule(globals, ".forum-conversation-content {")).not.toMatch(/gradient|color-mix/);
  });

  it("uses the accent blue for primary actions instead of the purple override", () => {
    expect(globals).not.toMatch(/\.forum-new-discussion[^{]*{[^}]*--discussion-background/);
    expect(rule(globals, ".forum-discussion-button {")).toContain("var(--lumi-accent");
    expect(rule(globals, ".dark .forum-discussion-button {")).toContain("var(--lumi-accent");
    expect(rule(globals, ".forum-reply-dock .forum-reply-submit {")).not.toMatch(/285/);
  });

  it("uses 12px surfaces and a single title scale", () => {
    expect(globals).not.toMatch(/\.forum[^{]*(surface|workspace)[^{]*{[^}]*border-radius:\s*1\.25rem/);
    expect(header).toMatch(/\.forum-sidebar-panel\s*{[^}]*border-radius:\s*12px/);
    expect(rule(globals, ".forum-feed-content .forum-list-header h1")).toContain("font-size: 2rem");
    expect(rule(globals, ".forum-category-workspace .forum-list-header h1")).toContain("font-size: 2rem");
    expect(rule(globals, ".forum-directory-header h1")).toContain("font-size: 2rem");
    expect(rule(surface, ".lumi-page-title {")).toContain("font-size: 2rem");
  });

  it("keeps in-page jumps clear of the floating header", () => {
    expect(surface).toMatch(/html\s*{\s*scroll-padding-top:\s*100px/);
    expect(surface).toMatch(/min-width:\s*768px\)\s*{\s*html\s*{\s*scroll-padding-top:\s*128px/);
  });

  it("keeps profile activity pages and the thread timeline on the shared palette", () => {
    const lines = globals.split(/\r?\n/).filter((line) => /\.(profile-forum|profile-activity|forum-timeline)/.test(line));
    expect(lines.length).toBeGreaterThan(20);
    const purple = lines.filter((line) => /oklch\(\s*[\d.]+\s+[\d.]+\s+(2[6-9]\d|3[0-2]\d)/.test(line));
    expect(purple).toEqual([]);
    expect(rule(globals, ".profile-forum-workspace {")).toContain("background: transparent");
    expect(globals).not.toMatch(/\.dark \.profile-forum-workspace/);
    expect(rule(globals, ".profile-forum-page {")).toContain("border-radius: 12px");
    expect(rule(globals, ".profile-forum-page {")).toContain("box-shadow: none");
    expect(rule(globals, ".profile-forum-cover {")).toContain("var(--lumi-soft");
  });

  it("does not ship an unused accent-button helper", () => {
    expect(surface).not.toContain("lumi-accent-button");
  });
});
