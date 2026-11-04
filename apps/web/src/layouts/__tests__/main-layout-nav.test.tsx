// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MainLayout } from "../MainLayout";

vi.mock("@/i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, language: "en" }),
  LanguageSwitcher: () => null,
}));
vi.mock("@/features/auth", () => ({
  resolvePostAuthPath: (_user: unknown, path: string) => path,
  useCurrentUser: () => ({ data: undefined, isLoading: false, isFetching: false, isPlaceholderData: false }),
  useLogout: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/components/route-transition", () => ({ RouteTransition: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/features/credits", () => ({ useCreditBalance: () => ({ data: undefined }) }));
vi.mock("@/features/bookmarks", () => ({ useBookmarks: () => ({ data: undefined }) }));
vi.mock("@/features/notifications", () => ({ useNotifications: () => ({ data: undefined, isLoading: false }) }));

const FORUM_TEXT = "Discussions across the platform";
const COMMUNITIES_TEXT = "Groups by research direction";

let root: Root;
let container: HTMLDivElement;

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

async function render(path: string) {
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[path]}><Routes><Route element={<MainLayout />}><Route path="*" element={<Where />} /></Route></Routes></MemoryRouter>);
  });
}

const desktopNav = () => container.querySelectorAll("nav[aria-label='Primary navigation']")[0]!;
const trigger = () => Array.from(desktopNav().querySelectorAll("button")).find((button) => button.textContent === "Community")!;
const where = () => container.querySelector("[data-testid='where']")!.textContent;

/** Radix opens a closed menu on Enter at the trigger; the hover path is pointer-only and not available in jsdom. */
async function openCommunityMenu() {
  await act(async () => {
    trigger().focus();
    trigger().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  return Array.from(document.body.querySelectorAll<HTMLAnchorElement>("[role='menu'] a"));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

describe("Community navigation", () => {
  it("3. the desktop Community item is a dropdown with exactly Research Forum and Research Communities", async () => {
    await render("/home");
    expect(trigger().tagName).toBe("BUTTON");
    expect(desktopNav().querySelector("a[href='/forum']")).toBeNull();
    const links = await openCommunityMenu();
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/forum", "/communities"]);
    expect(links[0]!.textContent).toBe(`Research Forum${FORUM_TEXT}`);
    expect(links[1]!.textContent).toBe(`Research Communities${COMMUNITIES_TEXT}`);
    // Label over description, not side by side: the link stacks its two children (the merged flex-row is overridden).
    for (const [link, label, text] of [[links[0]!, "Research Forum", FORUM_TEXT], [links[1]!, "Research Communities", COMMUNITIES_TEXT]] as const) {
      expect(link.className).toContain("!flex-col");
      expect(link.className).toContain("!items-start");
      const [first, second, ...rest] = Array.from(link.children);
      expect(rest).toHaveLength(0);
      expect(first!.textContent).toBe(label);
      expect(second!.textContent).toBe(text);
      expect(first!.compareDocumentPosition(second!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("3. a dropdown item without a description keeps the plain single-line layout", async () => {
    await render("/home");
    await act(async () => {
      Array.from(desktopNav().querySelectorAll("button")).find((button) => button.textContent === "Explore")!.focus();
      Array.from(desktopNav().querySelectorAll("button")).find((button) => button.textContent === "Explore")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    const link = document.body.querySelector<HTMLAnchorElement>("[role='menu'] a[href='/trends']")!;
    expect(link.className).not.toContain("flex-col");
    expect(link.children).toHaveLength(1);
  });

  it("3. the trigger is active on forum, activity and community pages, and only the matching item is", async () => {
    const cases: Array<[string, string | null]> = [["/forum", "/forum"], ["/u/x/activity", "/forum"], ["/communities", "/communities"], ["/communities/data-science", "/communities"], ["/trends", null]];
    for (const [path, activeHref] of cases) {
      await render(path);
      expect(trigger().className.includes("border-blue-600"), path).toBe(activeHref !== null);
      const links = await openCommunityMenu();
      const current = links.filter((link) => link.getAttribute("aria-current") === "page").map((link) => link.getAttribute("href"));
      expect(current, path).toEqual(activeHref ? [activeHref] : []);
      await act(async () => { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
      act(() => root.unmount());
      root = createRoot(container);
    }
  });

  it("4. the mobile menu lists both items with descriptions, and Research Communities navigates to /communities", async () => {
    await render("/home");
    await act(async () => container.querySelector<HTMLButtonElement>("button[aria-label='Toggle Menu']")!.click());
    const menu = container.querySelector("#primary-navigation-menu")!;
    const forum = menu.querySelector<HTMLAnchorElement>("a[href='/forum']")!;
    const communities = menu.querySelector<HTMLAnchorElement>("a[href='/communities']")!;
    expect(forum.textContent).toBe(`Research Forum${FORUM_TEXT}`);
    expect(communities.textContent).toBe(`Research Communities${COMMUNITIES_TEXT}`);
    await act(async () => communities.click());
    expect(where()).toBe("/communities");
    // the menu closes after navigating
    expect(container.querySelector("#primary-navigation-menu")).toBeNull();
  });

  it("4. on /communities only the Communities entry of the mobile menu is current", async () => {
    await render("/communities");
    await act(async () => container.querySelector<HTMLButtonElement>("button[aria-label='Toggle Menu']")!.click());
    const menu = container.querySelector("#primary-navigation-menu")!;
    expect(menu.querySelector("a[href='/communities']")!.getAttribute("aria-current")).toBe("page");
    expect(menu.querySelector("a[href='/forum']")!.getAttribute("aria-current")).toBeNull();
  });
});
