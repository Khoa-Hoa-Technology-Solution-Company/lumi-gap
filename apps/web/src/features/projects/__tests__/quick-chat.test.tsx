// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQuickChatStore } from "../stores/quick-chat-store";
import { QuickChatTrigger, QuickChatPanel } from "../components/quick-chat-panel";
import { ProjectDetailPage } from "@/pages/projects/project-detail";
import type { ProjectTeamChatMessage } from "@trend/shared-types";

const api = vi.hoisted(() => ({
  listMessages: vi.fn(),
  sendMessage: vi.fn(),
  markRead: vi.fn(),
  deleteMessage: vi.fn(),
  streamEvents: vi.fn(),
  references: vi.fn(),
  reference: vi.fn(),
}));

const projectApi = vi.hoisted(() => ({
  getProject: vi.fn(),
}));

vi.mock("../api/project-team-chat.api", () => ({ projectTeamChatApi: api }));
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({ user: { id: "user-1", fullName: "Researcher One", systemRole: "USER" } }),
}));
vi.mock("@/i18n", () => ({
  useI18n: () => ({
    language: "vi",
    t: (key: string, values?: Record<string, string | number>) => {
      if (values?.count !== undefined) {
        return key.replace("{{count}}", String(values.count));
      }
      return key;
    },
  }),
}));

// Mock useProject hook
vi.mock("../hooks/use-projects", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/use-projects")>();
  return {
    ...actual,
    useProject: () => ({
      data: projectApi.getProject(),
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    }),
    useProjects: () => ({
      data: [projectApi.getProject()],
      isLoading: false,
    }),
    useAddPaperToProject: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
    useUpdateProjectPaper: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
    useRemovePaperFromProject: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
  };
});

// Mock mentor project entry
vi.mock("../hooks/use-mentor-project-entry", () => ({
  projectAccessDenied: () => false,
  useMentorProjectEntry: () => ({ data: null, isLoading: false, error: null }),
}));

// Mock Gaps
vi.mock("@/features/gaps", () => ({
  useGaps: () => ({ data: { data: [] }, isLoading: false }),
}));

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;

async function render(node: ReactNode, initialEntry = "/projects/proj-1?tab=overview") {
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[initialEntry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/projects/:id" element={node} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

describe("Contextual Quick Chat", () => {
  const mockProject = {
    _id: "proj-1",
    title: "Quantum ML Research",
    description: "Exploring quantum kernels",
    status: "ACTIVE",
    accessRole: "OWNER",
    ownerId: "user-1",
    isPublicSummary: false,
    papers: [
      {
        id: "link-1",
        targetId: {
          _id: "paper-1",
          id: "paper-1",
          title: "Quantum Kernels Paper",
          authors: [{ displayName: "Alice" }],
          publicationYear: 2024,
        },
        screeningStatus: "INCLUDED",
        readingStatus: "READING",
        addedAt: "2026-01-01T00:00:00Z",
      },
    ],
  };

  const sampleMessages: ProjectTeamChatMessage[] = [
    {
      id: "msg-1",
      projectId: "proj-1",
      sender: { id: "user-2", fullName: "Collaborator Two" },
      content: "Hello team, review this paper",
      readBy: [],
      readCount: 0,
      isDeleted: false,
      createdAt: "2026-11-17T10:00:00Z",
    },
    {
      id: "msg-2",
      projectId: "proj-1",
      sender: { id: "user-1", fullName: "Researcher One" },
      content: "I am checking it now",
      readBy: [{ id: "user-1", fullName: "Researcher One" }],
      readCount: 1,
      isDeleted: false,
      createdAt: "2026-11-17T10:05:00Z",
    },
  ];

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal("requestAnimationFrame", (cb: () => void) => {
      cb();
      return 0;
    });
    vi.resetAllMocks();
    sessionStorage.clear();
    useQuickChatStore.setState({ isOpen: false, activeProjectId: null, pendingReference: null });

    projectApi.getProject.mockReturnValue(mockProject);
    api.listMessages.mockResolvedValue(sampleMessages);
    api.references.mockResolvedValue([]);
    api.reference.mockResolvedValue({
      kind: "PAPER",
      id: "paper-1",
      title: "Quantum Kernels Paper",
      href: "/projects/proj-1?tab=papers&paper=paper-1",
    });
    api.streamEvents.mockImplementation(() => new Promise(() => {}));
    api.markRead.mockImplementation((_, msgId) =>
      Promise.resolve({
        id: msgId,
        readBy: [{ id: "user-1" }],
        readCount: 1,
      })
    );

    client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
    });
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

  it("renders the Quick Chat trigger in the project header with unread badge", async () => {
    await render(<ProjectDetailPage />);

    const trigger = container.querySelector(".quick-chat-trigger-btn");
    expect(trigger).not.toBeNull();
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(trigger?.textContent).toContain("Trò chuyện nhóm");

    // msg-1 is from user-2 and unread by user-1 -> unread badge should be 1
    const badge = container.querySelector(".quick-chat-unread-badge");
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe("1");
  });

  it("toggles the docked Quick Chat panel open and closed", async () => {
    await render(<ProjectDetailPage />);

    const trigger = container.querySelector<HTMLButtonElement>(".quick-chat-trigger-btn")!;
    expect(container.querySelector(".project-quick-chat-dock")).toBeNull();

    // Click to open
    await act(async () => {
      trigger.click();
    });
    expect(useQuickChatStore.getState().isOpen).toBe(true);
    expect(container.querySelector(".project-quick-chat-dock")).not.toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    // Click to close
    await act(async () => {
      trigger.click();
    });
    expect(useQuickChatStore.getState().isOpen).toBe(false);
    expect(container.querySelector(".project-quick-chat-dock")).toBeNull();
  });

  it("hides the Quick Chat trigger and docked panel when on the Full Chat tab", async () => {
    useQuickChatStore.setState({ isOpen: true, activeProjectId: "proj-1" });
    await render(<ProjectDetailPage />, "/projects/proj-1?tab=chat");

    // On ?tab=chat, Quick Chat trigger and docked panel are hidden
    expect(container.querySelector(".quick-chat-trigger-btn")).toBeNull();
    expect(container.querySelector(".project-quick-chat-dock")).toBeNull();
  });

  it("does not render Quick Chat trigger for public summaries or non-members", async () => {
    projectApi.getProject.mockReturnValue({
      ...mockProject,
      isPublicSummary: true,
      accessRole: null,
    });
    await render(<ProjectDetailPage />);

    expect(container.querySelector(".quick-chat-trigger-btn")).toBeNull();
    expect(container.querySelector(".project-quick-chat-dock")).toBeNull();
  });

  it("attaches a contextual paper reference and opens Quick Chat when openChat is called", async () => {
    await render(<ProjectDetailPage />);

    // Programmatically trigger contextual sharing from Paper
    await act(async () => {
      useQuickChatStore.getState().openChat("proj-1", { kind: "PAPER", id: "paper-1" });
    });

    // Quick Chat should now be open
    expect(useQuickChatStore.getState().isOpen).toBe(true);
    const dock = container.querySelector(".project-quick-chat-dock");
    expect(dock).not.toBeNull();

    // Reference card should be rendered inside the composer preview
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(api.reference).toHaveBeenCalledWith("proj-1", { kind: "PAPER", id: "paper-1" });
  });

  it("expands to full chat when clicking the full screen button in Quick Chat header", async () => {
    useQuickChatStore.setState({ isOpen: true, activeProjectId: "proj-1" });
    await render(<ProjectDetailPage />);

    const dock = container.querySelector(".project-quick-chat-dock");
    expect(dock).not.toBeNull();

    const expandBtn = dock?.querySelector<HTMLButtonElement>('button[title="Mở toàn màn hình"]');
    expect(expandBtn).not.toBeNull();
  });

  it("closes Quick Chat when clicking the close button in Quick Chat header", async () => {
    useQuickChatStore.setState({ isOpen: true, activeProjectId: "proj-1" });
    await render(<ProjectDetailPage />);

    const dock = container.querySelector(".project-quick-chat-dock");
    expect(dock).not.toBeNull();

    const closeBtn = dock?.querySelector<HTMLButtonElement>('button[title="Đóng"]');
    expect(closeBtn).not.toBeNull();

    await act(async () => {
      closeBtn!.click();
    });

    expect(useQuickChatStore.getState().isOpen).toBe(false);
  });

  it("attaches a contextual task reference and resolves it in Quick Chat", async () => {
    api.reference.mockResolvedValueOnce({
      kind: "TASK",
      id: "task-42",
      title: "Write Introduction section",
      status: "IN_PROGRESS",
      href: "/projects/proj-1?tab=tasks&task=task-42",
    });

    await render(<ProjectDetailPage />);

    await act(async () => {
      useQuickChatStore.getState().openChat("proj-1", { kind: "TASK", id: "task-42" });
    });

    expect(useQuickChatStore.getState().isOpen).toBe(true);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    expect(api.reference).toHaveBeenCalledWith("proj-1", { kind: "TASK", id: "task-42" });
    expect(useQuickChatStore.getState().pendingReference).toBeNull(); // consumed cleanly
  });

  it("attaches a manuscript snapshot reference and resolves it in Quick Chat", async () => {
    api.reference.mockResolvedValueOnce({
      kind: "MANUSCRIPT_SNAPSHOT",
      id: "snap-99",
      title: "Draft Proposal",
      subtitle: "v1.0 Final",
      version: 1,
      href: "/projects/proj-1/manuscripts/m1?snapshot=snap-99",
    });

    await render(<ProjectDetailPage />);

    await act(async () => {
      useQuickChatStore.getState().openChat("proj-1", { kind: "MANUSCRIPT_SNAPSHOT", id: "snap-99" });
    });

    expect(useQuickChatStore.getState().isOpen).toBe(true);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });

    expect(api.reference).toHaveBeenCalledWith("proj-1", { kind: "MANUSCRIPT_SNAPSHOT", id: "snap-99" });
  });
});
