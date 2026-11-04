import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { describe, expect, it, vi } from "vitest";
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

function render(path: string) {
  return renderToStaticMarkup(<StaticRouter location={path}><MainLayout /></StaticRouter>);
}

/** The "Community" dropdown trigger; it is active when its class carries the blue underline. */
function communityLink(markup: string) {
  return markup.match(/<button[^>]*>Community<svg/)?.[0] ?? "";
}

describe("Community area shell", () => {
  it("shares one surface between forum and communities, without the forum-only chrome on communities", () => {
    const forum = render("/forum");
    expect(forum).toContain("lumi-surface");
    expect(forum).toContain("forum-app-shell");
    expect(forum).toContain("forum-app-header");
    expect(forum).not.toContain("<footer");

    const community = render("/communities/data-science");
    expect(community).toContain("lumi-surface");
    expect(community).not.toContain("forum-app-shell");
    expect(community).not.toContain("forum-app-header");
    expect(community).toContain("container mx-auto");
    expect(community).toContain("<footer");
    expect(community).not.toContain("bg-slate-50");
  });

  it("leaves pages outside the Community area on their own background", () => {
    for (const path of ["/trends", "/docs", "/lecturers", "/communities-archive"]) {
      const markup = render(path);
      expect(markup, path).not.toContain("lumi-surface");
      expect(markup, path).toContain("bg-slate-50");
    }
  });

  it("highlights the Community menu on forum and community pages only", () => {
    for (const path of ["/forum", "/forum/categories", "/u/x/activity", "/communities", "/communities/new", "/communities/data-science"]) {
      const link = communityLink(render(path));
      expect(link, path).toContain("border-blue-600");
    }
    const other = communityLink(render("/trends"));
    expect(other).toContain("border-transparent");
    expect(other).not.toContain("border-blue-600");
  });

  it("restyles the footer only on community pages", () => {
    const footer = (path: string) => render(path).match(/<footer class="[^"]*"/)?.[0] ?? "";
    expect(footer("/communities")).toContain("font-sans");
    expect(footer("/communities")).toContain("dark:bg-[var(--lumi-surface)]");
    expect(footer("/communities")).not.toContain("#0f0f11");
    for (const path of ["/trends", "/docs", "/lecturers"]) {
      expect(footer(path), path).toContain("dark:bg-[#0f0f11]");
      expect(footer(path), path).not.toContain("font-sans");
      expect(footer(path), path).not.toContain("--lumi-surface");
    }
  });
});
