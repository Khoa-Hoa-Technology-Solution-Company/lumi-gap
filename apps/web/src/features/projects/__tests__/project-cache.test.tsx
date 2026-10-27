// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAddPaperToProject, useRemoveMemberFromProject, useArchiveProject } from "../hooks/use-projects";

const mocks = vi.hoisted(() => ({ addPaper: vi.fn(), removeMember: vi.fn(), archive: vi.fn() }));
vi.mock("../api/projects.api", () => ({ projectsApi: mocks }));
let client: QueryClient, host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  Object.values(mocks).forEach(mock => mock.mockResolvedValue({ _id: "p" }));
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
it.each(["paper", "member", "archive"] as const)("refreshes directory counts and project workspace after a %s mutation, including detail aliases", async action => {
  const keys = [["projects"], ["project", "p"], ["project", "legacy-p"], ["project", "p", "team", 2, 1], ["project-workspace", "me", "p", "overview"], ["project-research", "me", "p", "sources"]];
  for (const key of keys) client.setQueryData(key, { _id: "p" });
  client.setQueryData(["project", "unrelated"], { _id: "other" });
  function Controls() {
    const paper = useAddPaperToProject("p"), member = useRemoveMemberFromProject("p"), archive = useArchiveProject("p");
    return <button onClick={() => { if (action === "paper") paper.mutate({ paperId: "paper" }); else if (action === "member") member.mutate("member"); else archive.mutate(); }}>Run</button>;
  }
  await act(async () => root.render(<QueryClientProvider client={client}><Controls /></QueryClientProvider>));
  await act(async () => { host.querySelector("button")!.click(); await new Promise(resolve => setTimeout(resolve, 20)); });
  for (const key of keys) expect(client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
  expect(client.getQueryState(["project", "unrelated"])?.isInvalidated).toBe(false);
});
