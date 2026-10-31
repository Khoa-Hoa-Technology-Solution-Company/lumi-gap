// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useProjectTeam, useRespondToProjectInvitation, useRespondToProjectInvitationToken } from "../hooks/use-projects";

const mocks = vi.hoisted(() => ({ respond: vi.fn(), token: vi.fn(), team: vi.fn() }));
vi.mock("../api/projects.api", () => ({ projectsApi: { respondToInvitation: mocks.respond, respondToInvitationToken: mocks.token, team: mocks.team } }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: () => "viewer" }));

let root: Root, container: HTMLDivElement, client: QueryClient;
let respond: ReturnType<typeof useRespondToProjectInvitation>["mutateAsync"];
let token: ReturnType<typeof useRespondToProjectInvitationToken>["mutateAsync"];
function Responses() {
  respond = useRespondToProjectInvitation().mutateAsync;
  token = useRespondToProjectInvitationToken("opaque-token").mutateAsync;
  return null;
}
function Team() { const team = useProjectTeam("project", 1, 1); return <output>{team.data?.invitationMeta.total}</output>; }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.useFakeTimers(); vi.resetAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it.each(["inbox", "token"])("invalidates team, project access and invitation caches after a response through %s", async kind => {
  const keys = [["projects"], ["project-invitations", "mine"], ["project", "project"], ["project", "project", "team", 1, 1], ["project-invitation-token", "opaque-token"]];
  keys.forEach(key => client.setQueryData(key, {}));
  client.setQueryData(["project", "unrelated"], {});
  mocks.respond.mockResolvedValue(undefined); mocks.token.mockResolvedValue({ projectId: "project", status: "ACCEPTED", alreadyMember: false });
  await act(async () => root.render(<QueryClientProvider client={client}><Responses /></QueryClientProvider>));
  await act(async () => {
    if (kind === "inbox") await respond({ projectId: "project", invitationId: "invite", decision: "accept" });
    else await token("accept");
  });
  keys.slice(0, kind === "token" ? 5 : 4).forEach(key => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
  expect(client.getQueryState(["project", "unrelated"])?.isInvalidated).toBe(false);
});

it("refreshes a pending invitation accepted in another session and stops polling once none remain", async () => {
  client.setQueryData(["project", "project", "team", 1, 1], { members: [], invitations: [], invitationMeta: { total: 1 } });
  mocks.team.mockResolvedValue({ members: [], invitations: [], invitationMeta: { total: 0 } });
  await act(async () => root.render(<QueryClientProvider client={client}><Team /></QueryClientProvider>));
  expect(container.textContent).toBe("1");
  await act(async () => { await vi.advanceTimersByTimeAsync(10_100); });
  expect(mocks.team).toHaveBeenCalledOnce();
  expect(container.textContent).toBe("0");
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(mocks.team).toHaveBeenCalledOnce();
});
