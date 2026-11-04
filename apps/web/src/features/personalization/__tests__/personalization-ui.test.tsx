// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InterestTopic } from "@trend/shared-types";
import { CommunityDiscussionsTab } from "@/pages/communities/community-discussions-tab";
import { loadDictionary } from "@/i18n/locales";
import { ForYouSection, forYouReasonText } from "../components/for-you-section";
import { InterestsCard } from "../components/interests-card";
import { TopicChipFilter, orderTopicsByProfile } from "../components/topic-chip-filter";

const mocks = vi.hoisted(() => ({
  forYou: vi.fn(), suggestions: vi.fn(), join: vi.fn(), interests: vi.fn(), vocabulary: vi.fn(), posts: vi.fn(), toast: vi.fn(),
  follow: vi.fn(), unfollow: vi.fn(), mute: vi.fn(), unmute: vi.fn(), delayed: true,
}));

vi.mock("sonner", () => ({ toast: Object.assign(mocks.toast, { error: vi.fn() }) }));
vi.mock("@/i18n", () => ({
  useI18n: () => ({
    language: "en",
    t: (key: string, values?: Record<string, string | number>) => Object.entries(values ?? {}).reduce((text, [name, value]) => text.replace(`{{${name}}}`, String(value)), key),
  }),
}));
vi.mock("../hooks/use-personalization", () => ({
  useForYou: () => mocks.forYou(),
  useForYouCommunities: () => mocks.suggestions(),
  PERSONALIZATION_KEY: ["personalization"],
  useInterests: () => mocks.interests(),
  useInterestVocabulary: () => mocks.vocabulary(),
  useDelayedFlag: () => mocks.delayed,
  useInterestActions: () => ({
    follow: { mutate: mocks.follow, isPending: false }, unfollow: { mutate: mocks.unfollow, isPending: false },
    mute: { mutate: mocks.mute, isPending: false }, unmute: { mutate: mocks.unmute, isPending: false },
  }),
}));
vi.mock("@/features/forum/hooks/use-forum", () => ({ useJoinCommunity: () => ({ mutate: mocks.join, isPending: false }) }));
vi.mock("@/features/forum/components/forum-card", () => ({
  ForumCard: ({ post }: { post: { id: string; title: string } }) => <article data-post={post.id}>{post.title}</article>,
}));
vi.mock("@/features/forum", () => ({
  ForumCard: ({ post }: { post: { id: string; title: string } }) => <article data-post={post.id}>{post.title}</article>,
  useForumPostsInfinite: (params: unknown) => mocks.posts(params),
  useCommunitySummary: () => ({ data: undefined }),
  useRequestCommunitySummary: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ tokens: { accessToken: "token" } }) }));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  for (const mock of [mocks.forYou, mocks.suggestions, mocks.join, mocks.interests, mocks.vocabulary, mocks.posts, mocks.toast, mocks.follow, mocks.unfollow, mocks.mute, mocks.unmute]) mock.mockReset();
  mocks.delayed = true;
  mocks.suggestions.mockReturnValue({ data: [] });
  mocks.vocabulary.mockReturnValue({ data: [], isFetching: false });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const render = (element: React.ReactNode, path = "/") => act(async () => root.render(
  <QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="*" element={element} /></Routes></MemoryRouter></QueryClientProvider>,
));
const post = (id: string) => ({ id, title: `Post ${id}` });
const buttonByText = (text: string, scope: ParentNode = container) => Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).find((item) => item.textContent?.trim() === text);

const interpolate = (dictionary: Record<string, string>) => (key: string, values?: Record<string, string | number>) =>
  Object.entries(values ?? {}).reduce((text, [name, value]) => text.replaceAll(`{{${name}}}`, String(value)), dictionary[key] ?? key);

describe("forYouReasonText", () => {
  const english = interpolate({});
  const topic = { key: "nlp", label: "NLP" };
  const lab = { key: "c", label: "Vision Lab" };
  it("words every reason kind as text", () => {
    expect(forYouReasonText({ reasonKind: "followed", reasonTopic: topic, reasonSource: "followed" }, english)).toBe("Because you follow NLP");
    expect(forYouReasonText({ reasonKind: "followed", reasonTopic: topic, reasonSource: "profile" }, english)).toBe("Because NLP is in your research interests");
    expect(forYouReasonText({ reasonKind: "joined", reasonTopic: topic, reasonCommunity: { id: "x", name: "NLP Lab" } }, english)).toBe("Because you joined NLP Lab");
    expect(forYouReasonText({ reasonKind: "inferred", reasonTopic: topic }, english)).toBe("Because you often read about NLP");
    expect(forYouReasonText({ reasonKind: "lowConfidence", reasonTopic: topic }, english)).toBe("Based on posts you've read");
    expect(forYouReasonText({ reasonKind: "new", reasonTopic: lab }, english)).toBe("New in Vision Lab");
  });

  it("45. trending labels use correct English plurals and leave out a zero part", () => {
    const label = (readers: number, replies: number) => forYouReasonText({ reasonKind: "trending", reasonTopic: lab, reasonStats: { readers, replies } }, english);
    expect(label(3, 2)).toBe("Trending in Vision Lab · 3 readers, 2 replies in the last 2 weeks");
    expect(label(1, 1)).toBe("Trending in Vision Lab · 1 reader, 1 reply in the last 2 weeks");
    expect(label(3, 0)).toBe("Trending in Vision Lab · 3 readers in the last 2 weeks");
    expect(label(0, 2)).toBe("Trending in Vision Lab · 2 replies in the last 2 weeks");
    expect(label(0, 0)).toBe("Trending in Vision Lab");
  });

  it("45. the same labels exist in Vietnamese", async () => {
    const vietnamese = interpolate(await loadDictionary("vi"));
    const label = (readers: number, replies: number) => forYouReasonText({ reasonKind: "trending", reasonTopic: lab, reasonStats: { readers, replies } }, vietnamese);
    expect(label(3, 2)).toBe("Đang được quan tâm trong Vision Lab · 3 người đọc, 2 trả lời trong 2 tuần qua");
    expect(label(1, 1)).toBe("Đang được quan tâm trong Vision Lab · 1 người đọc, 1 trả lời trong 2 tuần qua");
    expect(label(3, 0)).toBe("Đang được quan tâm trong Vision Lab · 3 người đọc trong 2 tuần qua");
    expect(forYouReasonText({ reasonKind: "new", reasonTopic: lab }, vietnamese)).toBe("Mới trong Vision Lab");
    expect(forYouReasonText({ reasonKind: "joined", reasonTopic: topic, reasonCommunity: { id: "x", name: "NLP Lab" } }, vietnamese)).toBe("Vì bạn đã tham gia NLP Lab");
  });
});

const community = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, slug: id, name: `Community ${id}`, researchField: "Computer Science", matchReason: "topic", matchedTopics: [{ key: "nlp", label: "NLP" }, { key: "a", label: "A" }, { key: "b", label: "B" }, { key: "c", label: "C" }], ...overrides,
});

describe("ForYouSection", () => {
  it("keeps a reserved aria-busy block while loading and only draws the skeleton when the answer is slow", async () => {
    mocks.forYou.mockReturnValue({ isLoading: true, data: undefined, error: null });
    mocks.delayed = false;
    await render(<ForYouSection />);
    const busy = container.querySelector('section[aria-busy="true"]');
    expect(busy).not.toBeNull();
    expect(busy!.className).toContain("min-h-");
    expect(busy!.querySelector(".animate-pulse")).toBeNull();
    mocks.delayed = true;
    await render(<ForYouSection />);
    expect(container.querySelector('section[aria-busy="true"] .animate-pulse')).not.toBeNull();
  });

  it("renders nothing when all three blocks are empty, or when the feed fails and there are no communities", async () => {
    mocks.forYou.mockReturnValue({ isLoading: false, error: null, data: { postsBasis: "none", papersBasis: "none", posts: [], papers: [] } });
    await render(<ForYouSection />);
    expect(container.innerHTML).toBe("");
    mocks.forYou.mockReturnValue({ isLoading: false, error: new Error("boom"), data: undefined });
    await render(<ForYouSection />);
    expect(container.innerHTML).toBe("");
  });

  it("45. shows one 'For you' heading and switches the block headings per basis", async () => {
    const posts = [{ post: post("a"), reasonKind: "followed", reasonTopic: { key: "nlp", label: "NLP" }, reasonSource: "followed" }];
    const papers = [{ id: "paper-1", title: "Attention is all you need", publicationYear: 2017, citationCount: 1 }];
    mocks.forYou.mockReturnValue({ isLoading: false, error: null, data: { postsBasis: "personal", papersBasis: "personal", posts, papers } });
    mocks.suggestions.mockReturnValue({ data: [community("c1")] });
    await render(<ForYouSection />);
    expect(Array.from(container.querySelectorAll("h2")).map((node) => node.textContent)).toEqual(["For you"]);
    expect(Array.from(container.querySelectorAll("h3")).map((node) => node.textContent)).toEqual(["Discussions for you", "Papers for you", "Communities you may like"]);
    expect(container.querySelector('a[href="/papers/paper-1"]')!.textContent).toBe("Attention is all you need");
    expect(container.textContent).toContain("1 citation");
    expect(container.querySelector('a[href="/settings/interests"]')!.textContent).toBe("Manage interests");
    expect(container.textContent).not.toContain("Recommended for you");

    mocks.forYou.mockReturnValue({ isLoading: false, error: null, data: { postsBasis: "explore", papersBasis: "trending", posts: [{ ...posts[0], reasonKind: "new", reasonTopic: { key: "c", label: "Vision Lab" } }], papers } });
    await render(<ForYouSection />);
    expect(Array.from(container.querySelectorAll("h3")).map((node) => node.textContent)).toEqual(["Discussions to explore", "Papers on topics people are discussing", "Communities you may like"]);
    expect(container.querySelector('[data-testid="for-you-reason"]')!.textContent).toBe("New in Vision Lab");
  });

  it("45. hides a block whose basis is none, and still shows the communities", async () => {
    mocks.forYou.mockReturnValue({ isLoading: false, error: null, data: { postsBasis: "none", papersBasis: "none", posts: [], papers: [] } });
    mocks.suggestions.mockReturnValue({ data: [community("c1")] });
    await render(<ForYouSection />);
    expect(Array.from(container.querySelectorAll("h3")).map((node) => node.textContent)).toEqual(["Communities you may like"]);
  });

  it("45. a community card shows at most 3 matched topics or 'Close to your interests', and Join calls join then invalidates personalization and communities", async () => {
    mocks.forYou.mockReturnValue({ isLoading: false, error: null, data: { postsBasis: "none", papersBasis: "none", posts: [], papers: [] } });
    mocks.suggestions.mockReturnValue({ data: [community("c1"), community("c2", { matchReason: "semantic", matchedTopics: [] })] });
    mocks.join.mockImplementation((_id: string, options: { onSuccess: () => void }) => options.onSuccess());
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await render(<ForYouSection />);
    const cards = Array.from(container.querySelectorAll("ul li"));
    expect(cards[0]!.querySelectorAll(".font-normal")).toHaveLength(3);
    expect(cards[1]!.textContent).toContain("Close to your interests");
    await act(async () => cards[0]!.querySelector<HTMLButtonElement>("button")!.click());
    expect(mocks.join).toHaveBeenCalledWith("c1", expect.anything());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["personalization"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["communities"] });
  });
});

describe("topic chips", () => {
  it("puts the viewer's profile topics first, in profile order, and keeps the rest as listed", () => {
    expect(orderTopicsByProfile(["Vision", "NLP", "Graphs", "Robotics"], ["graphs", "nlp"])).toEqual(["Graphs", "NLP", "Vision", "Robotics"]);
    expect(orderTopicsByProfile(["Học máy", "Vision"], ["hoc may"])).toEqual(["Học máy", "Vision"]);
  });

  it("marks only the selected chip with aria-pressed, wraps instead of scrolling, and a second click clears it", async () => {
    const onSelect = vi.fn();
    await render(<TopicChipFilter topics={["NLP", "Vision"]} selected="nlp" onSelect={onSelect} />);
    const group = container.querySelector('[role="group"]')!;
    expect(group.className).toContain("flex-wrap");
    expect(buttonByText("NLP")!.getAttribute("aria-pressed")).toBe("true");
    expect(buttonByText("NLP")!.querySelector("svg")).not.toBeNull();
    expect(buttonByText("Vision")!.getAttribute("aria-pressed")).toBe("false");
    await act(async () => buttonByText("NLP")!.click());
    expect(onSelect).toHaveBeenLastCalledWith(null);
    await act(async () => buttonByText("Vision")!.click());
    expect(onSelect).toHaveBeenLastCalledWith("Vision");
  });
});

function Probe() { const location = useLocation(); return <output data-testid="url">{location.pathname}{location.search}</output>; }

describe("community discussions topic filter", () => {
  const community = { id: "c1", slug: "ml", name: "ML", status: "ACTIVE", researchTopics: ["Vision", "NLP"], threadCount: 1, viewerMembership: { status: "active" }, isAdmin: false } as never;
  beforeEach(() => {
    mocks.posts.mockReturnValue({ data: { pages: [{ data: [], meta: { total: 0 } }] }, isLoading: false, error: null, hasNextPage: false });
    mocks.interests.mockReturnValue({ data: { topics: [{ key: "nlp", matchable: true }], muted: [] } });
  });

  it("reads ?topic= from the URL, filters the posts with it, and orders the viewer's topics first", async () => {
    await render(<><CommunityDiscussionsTab community={community} /><Probe /></>, "/communities/ml?topic=NLP");
    expect(mocks.posts).toHaveBeenCalledWith(expect.objectContaining({ researchCommunityId: "c1", topic: "NLP" }));
    expect(Array.from(container.querySelectorAll('[role="group"] button')).map((node) => node.textContent)).toEqual(["NLP", "Vision"]);
    expect(buttonByText("NLP")!.getAttribute("aria-pressed")).toBe("true");
  });

  it("writes the selection into the URL and clears it on a second click", async () => {
    await render(<><CommunityDiscussionsTab community={community} /><Probe /></>, "/communities/ml?tab=discussions");
    await act(async () => buttonByText("Vision")!.click());
    expect(container.querySelector('[data-testid="url"]')!.textContent).toBe("/communities/ml?tab=discussions&topic=Vision");
    await act(async () => buttonByText("Vision")!.click());
    expect(container.querySelector('[data-testid="url"]')!.textContent).toBe("/communities/ml?tab=discussions");
  });
});

const topic = (overrides: Partial<InterestTopic> & { key: string }): InterestTopic => ({
  label: overrides.key, source: "inferred", weight: 1, score: 1, evidenceCount: 3, lowConfidence: false, matchable: true, ...overrides,
});

describe("InterestsCard", () => {
  it("lists followed, profile and inferred topics with the right actions and notes", async () => {
    mocks.interests.mockReturnValue({ isLoading: false, error: null, data: { muted: [{ key: "old", label: "Old topic" }], topics: [
      topic({ key: "nlp", label: "NLP", source: "followed", evidenceCount: 1 }),
      topic({ key: "blockchain", label: "Blockchain", source: "profile", evidenceCount: 0, matchable: false }),
      topic({ key: "graphs", label: "Graphs", source: "inferred", lowConfidence: true }),
    ] } });
    await render(<InterestsCard />);
    const rows = Array.from(container.querySelectorAll("li")).filter((row) => row.querySelector("p.text-sm.font-medium"));
    const row = (label: string) => rows.find((item) => item.querySelector("p")!.textContent === label)!;
    expect(buttonByText("Unfollow", row("NLP"))).toBeDefined();
    expect(row("NLP").textContent).toContain("Based on 1 post");
    expect(buttonByText("Unfollow", row("Blockchain"))).toBeUndefined();
    expect(row("Blockchain").textContent).toContain("Edit it in your academic profile");
    expect(row("Blockchain").textContent).toContain("No discussions use this term yet");
    expect(buttonByText("Follow", row("Graphs"))).toBeDefined();
    expect(row("Graphs").textContent).toContain("Early guess");
    expect(container.textContent).toContain("Following a topic here does not change your academic profile.");
    expect(buttonByText("Unmute")).toBeDefined();
  });

  it("offers Undo in a toast after an unfollow and a mute instead of asking first", async () => {
    mocks.interests.mockReturnValue({ isLoading: false, error: null, data: { muted: [], topics: [topic({ key: "nlp", label: "NLP", source: "followed" })] } });
    mocks.unfollow.mockImplementation((_key: string, options: { onSuccess: () => void }) => options.onSuccess());
    mocks.mute.mockImplementation((_topic: string, options: { onSuccess: () => void }) => options.onSuccess());
    await render(<InterestsCard />);
    await act(async () => buttonByText("Unfollow")!.click());
    expect(mocks.unfollow).toHaveBeenCalledWith("nlp", expect.anything());
    const undoFollow = mocks.toast.mock.calls.at(-1)![1].action;
    expect(undoFollow.label).toBe("Undo");
    undoFollow.onClick();
    expect(mocks.follow).toHaveBeenCalledWith("NLP", expect.anything());
    await act(async () => buttonByText("Mute")!.click());
    expect(mocks.mute).toHaveBeenCalledWith("NLP", expect.anything());
    expect(mocks.toast.mock.calls.at(-1)![1].action.label).toBe("Undo");
    expect(document.querySelector('[role="dialog"], [role="alertdialog"]')).toBeNull();
  });

  it("shows an explanation and a link to browse communities when there is nothing yet", async () => {
    mocks.interests.mockReturnValue({ isLoading: false, error: null, data: { muted: [], topics: [] } });
    await render(<InterestsCard />);
    expect(container.textContent).toContain("No interests yet");
    expect(container.querySelector('a[href="/communities"]')!.textContent).toBe("Browse communities");
  });

  it("follows a suggestion from the picker", async () => {
    mocks.interests.mockReturnValue({ isLoading: false, error: null, data: { muted: [], topics: [] } });
    mocks.vocabulary.mockReturnValue({ data: [{ key: "graph neural networks", label: "Graph neural networks" }], isFetching: false });
    await render(<InterestsCard />);
    const input = container.querySelector<HTMLInputElement>("#interest-picker")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "graph");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
    await act(async () => buttonByText("Graph neural networks")!.click());
    expect(mocks.follow).toHaveBeenCalledWith("Graph neural networks", expect.anything());
  });
});
