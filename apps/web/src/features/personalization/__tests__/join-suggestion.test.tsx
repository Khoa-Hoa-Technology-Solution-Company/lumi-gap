// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forumApi } from "@/features/forum/api/forum.api";
import { CommunitySuggestions } from "../components/community-suggestions";

const mocks = vi.hoisted(() => ({ toastError: vi.fn(), suggestions: vi.fn() }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: mocks.toastError }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "en", t: (key: string, values?: Record<string, string>) => Object.entries(values ?? {}).reduce((text, [name, value]) => text.replace(`{{${name}}}`, value), key) }) }));
// Only the suggestion list is stubbed. The join hook, the mutation observer and the QueryClient are the real ones.
vi.mock("../hooks/use-personalization", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks/use-personalization")>()),
  useForYouCommunities: () => mocks.suggestions(),
}));

type Membership = Awaited<ReturnType<typeof forumApi.joinCommunity>>;
const joined = { role: "member", status: "active" } as Membership;
const community = (id: string) => ({ id, slug: id, name: `Community ${id}`, researchField: "CS", matchReason: "topic", matchedTopics: [{ key: "nlp", label: "NLP" }] });

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.toastError.mockReset();
  mocks.suggestions.mockReturnValue({ data: [community("a"), community("b")] });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); client.clear(); vi.restoreAllMocks(); });

const buttons = () => Array.from(container.querySelectorAll<HTMLButtonElement>("ul li button"));
const disabled = () => buttons().map((button) => button.disabled);

describe("useJoinSuggestion with the real mutation observer (review fix)", () => {
  it("B finishes before A and A fails: both cards end enabled, A gets the error toast, B does not", async () => {
    const calls = new Map<string, { resolve: (value: Membership) => void; reject: (error: unknown) => void }>();
    const join = vi.spyOn(forumApi, "joinCommunity").mockImplementation((id: string) => new Promise((resolve, reject) => { calls.set(id, { resolve, reject }); }));
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><CommunitySuggestions /></MemoryRouter></QueryClientProvider>));

    await act(async () => buttons()[0]!.click());
    await act(async () => buttons()[1]!.click());
    expect(join).toHaveBeenCalledTimes(2);
    expect(disabled()).toEqual([true, true]);

    // B (the LAST mutate call) finishes first, then A rejects: with mutate(id, callbacks) A's callbacks would be lost.
    await act(async () => { calls.get("b")!.resolve(joined); });
    expect(disabled()).toEqual([true, false]);
    expect(mocks.toastError).not.toHaveBeenCalled();
    await act(async () => { calls.get("a")!.reject({ response: { data: { error: { message: "You are banned from this community" } } } }); });
    expect(disabled()).toEqual([false, false]);
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).toHaveBeenCalledWith("You are banned from this community");
  });

  it("A succeeds after B failed: A refreshes the lists, B shows the generic error, both end enabled", async () => {
    const calls = new Map<string, { resolve: (value: Membership) => void; reject: (error: unknown) => void }>();
    vi.spyOn(forumApi, "joinCommunity").mockImplementation((id: string) => new Promise((resolve, reject) => { calls.set(id, { resolve, reject }); }));
    const invalidate = vi.spyOn(client, "invalidateQueries");
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><CommunitySuggestions /></MemoryRouter></QueryClientProvider>));
    await act(async () => buttons()[0]!.click());
    await act(async () => buttons()[1]!.click());
    await act(async () => { calls.get("b")!.reject(new Error("network")); });
    expect(mocks.toastError).toHaveBeenLastCalledWith("Something went wrong. Please try again.");
    await act(async () => { calls.get("a")!.resolve(joined); });
    expect(disabled()).toEqual([false, false]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["personalization"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["communities"] });
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
  });

  it("a double click on the same card calls the API once", async () => {
    const join = vi.spyOn(forumApi, "joinCommunity").mockImplementation(() => new Promise(() => undefined));
    await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><CommunitySuggestions /></MemoryRouter></QueryClientProvider>));
    const first = buttons()[0]!;
    await act(async () => { first.click(); first.click(); });
    expect(join).toHaveBeenCalledTimes(1);
    expect(disabled()).toEqual([true, false]);
  });
});
