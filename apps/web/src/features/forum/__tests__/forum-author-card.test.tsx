// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { PublicAcademicProfile } from "@trend/shared-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { academicProfileApi } from "@/features/academic-profile/api/academic-profile.api";
import { ForumAuthorPopover } from "../components/forum-author-popover";

const mocks = vi.hoisted(() => ({ viewer: null as string | null, cover: vi.fn((url?: string) => url ? "blob:public-cover" : null) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, language: "en" }) }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: mocks.viewer ? { id: mocks.viewer } : null, tokens: mocks.viewer ? { accessToken: "test-only" } : null }) }));
vi.mock("@/features/academic-profile/hooks/use-academic-profile", () => ({ useAcademicAvatar: (url?: string) => url ?? null, useAcademicCover: mocks.cover }));

let container: HTMLDivElement;
let root: Root;
let sequence = 0;
let authorId: string;
const profile = (id: string, overrides: Partial<PublicAcademicProfile> = {}) => ({ userId: id, displayName: "A. Researcher", publicHandle: "researcher.card", affiliation: { institutionName: "Research Lab", positionTitle: "Lecturer" }, expertiseAreas: ["Study design"], headline: "Studies reproducibility.", createdAt: "2026-10-01T00:00:00Z", ...overrides } as PublicAcademicProfile);
function Harness({ duplicate = false }: { duplicate?: boolean }) {
  const location = useLocation();
  return <><p data-testid="route">{location.pathname}</p><ForumAuthorPopover author={{ id: authorId, fullName: "A. Researcher" }} authorTopicPostCount={2} onFilterPosts={vi.fn()}><span>Avatar</span></ForumAuthorPopover>{duplicate ? <ForumAuthorPopover author={{ id: authorId, fullName: "A. Researcher" }}><span>Another avatar</span></ForumAuthorPopover> : null}</>;
}
const render = (duplicate = false) => act(async () => root.render(<MemoryRouter initialEntries={["/forum/topic"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Harness duplicate={duplicate} /></MemoryRouter>));
const trigger = (index = 0) => container.querySelectorAll<HTMLAnchorElement>('a[aria-haspopup="dialog"]')[index]!;
const openCard = () => document.querySelector<HTMLDivElement>('.forum-author-popover[data-state="open"]');
const settle = (assertion: () => void) => vi.waitFor(async () => { await act(async () => Promise.resolve()); assertion(); });

beforeEach(() => {
  authorId = `card-author-${++sequence}`;
  mocks.viewer = null;
  mocks.cover.mockClear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  vi.spyOn(academicProfileApi, "publicProfile").mockResolvedValue(profile(authorId));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("Forum user card interactions", () => {
  it("opens on click without navigating, stays open after pointer exit, and restores focus on Escape", async () => {
    await render();
    await act(async () => trigger().click());
    await settle(() => expect(openCard()?.textContent).toContain("Studies reproducibility."));
    expect(container.querySelector('[data-testid="route"]')?.textContent).toBe("/forum/topic");
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(openCard());
    await act(async () => trigger().dispatchEvent(new MouseEvent("pointerout", { bubbles: true })));
    expect(openCard()).not.toBeNull();
    expect(openCard()?.querySelector('a[href="/u/researcher.card"]')).not.toBeNull();
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger());
    expect(openCard()).toBeNull();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 160)); });
    expect(document.querySelector(".forum-author-popover")).toBeNull();
  });

  it("toggles off on a second click and allows Ctrl-click to keep native profile navigation", async () => {
    await render();
    await act(async () => trigger().click());
    expect(openCard()).not.toBeNull();
    await act(async () => trigger().click());
    expect(openCard()).toBeNull();
    const modifiedClick = new MouseEvent("click", { button: 0, ctrlKey: true, bubbles: true, cancelable: true });
    let intercepted = true;
    container.addEventListener("click", (event) => { intercepted = event.defaultPrevented; event.preventDefault(); }, { once: true });
    await act(async () => trigger().dispatchEvent(modifiedClick));
    expect(intercepted).toBe(false);
    expect(openCard()).toBeNull();
  });

  it("opens one card at a time and reuses one public profile request for repeated author triggers", async () => {
    await render(true);
    await act(async () => trigger().click());
    await settle(() => expect(openCard()?.textContent).toContain("Studies reproducibility."));
    await act(async () => trigger(1).click());
    expect(document.querySelectorAll('.forum-author-popover[data-state="open"]')).toHaveLength(1);
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(trigger(1).getAttribute("aria-expanded")).toBe("true");
    expect(academicProfileApi.publicProfile).toHaveBeenCalledTimes(1);
    await act(async () => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(openCard()).toBeNull();
  });

  it("uses the visible profile's cover and prevents a member's cached fields from appearing after sign-out", async () => {
    mocks.viewer = "member";
    vi.mocked(academicProfileApi.publicProfile).mockResolvedValue(profile(authorId, { coverUrl: "/academic-profiles/member/cover", headline: "Members-only biography" }));
    await render();
    await act(async () => trigger().click());
    await settle(() => expect(openCard()?.querySelector(".forum-user-card-cover")?.getAttribute("src")).toBe("blob:public-cover"));
    expect(mocks.cover).toHaveBeenCalledWith("/academic-profiles/member/cover");
    mocks.viewer = null;
    vi.mocked(academicProfileApi.publicProfile).mockRejectedValue(new Error("Profile is private"));
    await render();
    expect(document.body.textContent).not.toContain("Members-only biography");
    await act(async () => trigger().click());
    await settle(() => expect(openCard()?.textContent).toContain("Only public profile details are shown here."));
    expect(openCard()?.querySelector(".forum-user-card-cover")).toBeNull();
    expect(document.body.textContent).not.toContain("Members-only biography");
    expect(academicProfileApi.publicProfile).toHaveBeenCalledTimes(2);
  });
});
