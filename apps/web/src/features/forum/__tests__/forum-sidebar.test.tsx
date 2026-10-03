import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ForumSidebar } from "../components/forum-sidebar";
import type { CommunityView } from "../api/forum.api";
import { forumListHref, parseForumListParams } from "../utils/forum-pagination";

vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
const community: CommunityView = { id: "community-uuid", slug: "software-engineering", name: "Software Engineering", description: "", researchTopics: [], visibility: "public", status: "ACTIVE", rules: [], memberCount: 4, threadCount: 8, canManage: false, canEditCommunity: false, contentRestricted: false };
function render(location: string, props: Partial<Parameters<typeof ForumSidebar>[0]> = {}) {
  return renderToStaticMarkup(<StaticRouter location={location}><ForumSidebar communities={[community]} isAuthed {...props} /></StaticRouter>);
}
function links(markup: string) {
  return [...markup.matchAll(/<a\b([^>]+)>(.*?)<\/a>/g)].map((match) => ({
    href: match[1]!.match(/href="([^"]+)"/)?.[1]?.replaceAll("&amp;", "&"),
    active: match[1]!.includes('aria-current="page"'),
    label: match[2]!.replace(/<[^>]+>/g, ""),
  }));
}
describe("Forum sidebar real URL navigation", () => {
  const initial = "/forum?feed=unanswered&community=software-engineering&type=QUESTION&q=review&page=3&pageSize=10";
  it("keeps the broad community and type resets neutral on the unfiltered forum", () => {
    expect(links(render("/forum")).filter((item) => item.active).map((item) => item.label)).toEqual(["Latest"]);
  });
  it("derives simultaneous active states entirely from the current URL", () => {
    expect(links(render(initial)).filter((item) => item.active).map((item) => item.label)).toEqual(["Unanswered", "Software Engineering", "Questions"]);
    expect(links(render("/forum?sort=popular&community=community-uuid&type=DISCUSSION")).filter((item) => item.active).map((item) => item.label)).toEqual(["Popular", "Software Engineering", "Discussions"]);
    expect(links(render("/forum/topic-id")).filter((item) => item.active)).toEqual([]);
  });
  it("every feed/type/community link composes filters and resets pagination", () => {
    const navigation = links(render(initial));
    for (const [label, feed] of [["Latest", "latest"], ["Unanswered", "unanswered"], ["Popular", "popular"], ["Following", "following"]]) {
      const url = new URL(navigation.find((item) => item.label === label)!.href!, "https://local.test");
      expect(url.searchParams.get("feed")).toBe(feed);
      expect(url.searchParams.get("community")).toBe(community.slug);
      expect(url.searchParams.get("type")).toBe("QUESTION");
      expect(url.searchParams.get("q")).toBe("review");
      expect(url.searchParams.get("pageSize")).toBe("10");
      expect(url.searchParams.has("page")).toBe(false);
    }
    for (const [label, type] of [["Questions", "QUESTION"], ["Discussions", "DISCUSSION"], ["Paper Discussions", "PAPER_DISCUSSION"], ["Research Gap Discussions", "RESEARCH_GAP_DISCUSSION"]]) {
      const url = new URL(navigation.find((item) => item.label === label)!.href!, "https://local.test");
      expect(url.searchParams.get("type")).toBe(type);
      expect(url.searchParams.get("feed")).toBe("unanswered");
      expect(url.searchParams.get("community")).toBe(community.slug);
      expect(url.searchParams.has("page")).toBe(false);
    }
    expect(navigation.find((item) => item.label === "Browse")?.href).toBe("/communities");
    const all = new URL(navigation.find((item) => item.label === "All communities")!.href!, "https://local.test");
    expect(all.searchParams.has("community")).toBe(false);
    expect(all.searchParams.get("type")).toBe("QUESTION");
    expect(all.searchParams.get("feed")).toBe("unanswered");
    const allTypes = new URL(navigation.find((item) => item.label === "All thread types")!.href!, "https://local.test");
    expect(allTypes.searchParams.has("type")).toBe(false);
    expect(allTypes.searchParams.get("community")).toBe(community.slug);
    expect(allTypes.searchParams.get("feed")).toBe("unanswered");
    expect(navigation.find((item) => item.label === community.name)?.href).toContain("community=software-engineering");
  });
  it("restores state from refresh/history URLs, and replaces legacy sort only when changing feed", () => {
    const params = new URLSearchParams("sort=popular&type=DISCUSSION&q=review&page=2");
    const next = forumListHref(params, "feed", "unanswered");
    expect(next).toBe("/forum?type=DISCUSSION&q=review&feed=unanswered");
    const visited = ["/forum?feed=latest", next, initial];
    for (const url of [...visited, ...[...visited].reverse(), ...visited]) {
      const expected = parseForumListParams(new URL(url, "https://local.test").searchParams).sort;
      expect(links(render(url)).find((item) => item.active)?.label.toLowerCase()).toBe(expected);
    }
    expect(params.get("page")).toBe("2");
  });
  it("uses existing sign-in return URL for guests instead of a disabled Following item", () => {
    const following = links(render(initial, { isAuthed: false })).find((item) => item.label === "Following")!;
    const login = new URL(following.href!, "https://local.test");
    expect(login.pathname).toBe("/login");
    expect(login.searchParams.get("returnTo")).toBe("/forum?community=software-engineering&type=QUESTION&q=review&pageSize=10&feed=following");
  });
  it("renders compact loading, retry and honest empty community states", () => {
    expect(render("/forum", { communitiesLoading: true })).toContain('aria-label="Loading communities"');
    const error = render("/forum", { communitiesError: true, onRetryCommunities: () => {} });
    expect(error).toContain('role="alert"');
    expect(error).toContain("Could not load communities.");
    expect(error).toContain("Retry");
    const empty = render("/forum", { communities: [] });
    expect(empty).toContain("No academic communities available.");
    expect(empty).not.toContain("Communities will appear here.");
    expect(render("/forum")).toContain("Open forum navigation");
  });
});
