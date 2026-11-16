// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProjectMentorSummary } from "../components/project-mentor-summary";

const listMock = vi.hoisted(() => vi.fn());
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "en", t: (key: string) => key }) }));
vi.mock("../api/academic-support.api", () => ({
  academicSupportApi: {
    list: listMock,
  },
}));

let root: Root, container: HTMLDivElement, client: QueryClient;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  listMock.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  container.remove();
  vi.unstubAllGlobals();
});

it("displays pending supervisor invitations alongside active mentors in Members tab", async () => {
  listMock.mockResolvedValue({
    counts: { pending: 1, incoming: 0, active: 0 },
    requests: [{
      id: "req-1",
      kind: "REQUEST",
      projectId: "proj-1",
      status: "PENDING",
      direction: "PROJECT_TO_LECTURER",
      mentorRole: "PRIMARY",
      mentorUser: {
        _id: "mentor-1",
        fullName: "Dr. Tran",
        positionTitle: "Associate Professor",
        institutionName: "FPT University",
        verifiedLecturer: true,
      },
      createdAt: "2026-11-13T10:00:00Z",
    }],
    relationships: [],
  });

  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ProjectMentorSummary projectId="proj-1" />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  await act(async () => { await new Promise(r => setTimeout(r, 10)); });

  expect(container.textContent).toContain("Pending supervisor invitations");
  expect(container.textContent).toContain("Dr. Tran");
  expect(container.textContent).toContain("Pending");
  expect(container.textContent).not.toContain("Your project has no active mentor yet.");
});

