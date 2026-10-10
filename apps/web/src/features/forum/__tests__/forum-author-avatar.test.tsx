// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ForumAuthorAvatar } from "../components/forum-author-avatar";

vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/features/academic-profile/hooks/use-academic-profile", () => ({ useAcademicAvatar: (url?: string) => url ?? null }));
afterEach(() => vi.unstubAllGlobals());

describe("Forum avatar image recovery", () => {
  it("shows the badge only for explicitly verified FPT affiliation", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    const root = createRoot(container);
    const author = { id: "reader", fullName: "Thanh Nguyen", affiliationVerified: true };
    try {
      await act(async () => root.render(<ForumAuthorAvatar author={author} showVerifiedBadge />));
      expect(container.querySelector('[title="FPT Education affiliation verified"]')).toBeNull();
      await act(async () => root.render(<ForumAuthorAvatar author={{ ...author, fptAffiliationVerified: true }} showVerifiedBadge />));
      expect(container.querySelector('[title="FPT Education affiliation verified"]')).not.toBeNull();
    } finally { await act(async () => root.unmount()); }
  });
  it("falls back after a failed image and displays a newly updated profile photo", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const author = { id: "reader", fullName: "Thanh Nguyen", avatarUrl: "https://example.test/old-avatar.webp" };
    try {
      await act(async () => root.render(<ForumAuthorAvatar author={author} size="xs" />));
      expect(container.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe(author.fullName);
      expect(container.querySelector("img")?.getAttribute("src")).toBe(author.avatarUrl);
      await act(async () => { container.querySelector("img")!.dispatchEvent(new Event("error")); });
      expect(container.querySelector("img")).toBeNull();
      expect(container.textContent).toBe("T");
      const updated = { ...author, avatarUrl: "https://example.test/new-avatar.webp" };
      await act(async () => root.render(<ForumAuthorAvatar author={updated} size="xs" />));
      expect(container.querySelector("img")?.getAttribute("src")).toBe(updated.avatarUrl);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
