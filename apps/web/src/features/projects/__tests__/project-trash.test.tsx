// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import type { IProject, TrashedProjectItem } from "@trend/shared-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectLifecycleSection } from "../components/project-lifecycle-section";
import { ProjectTrashView } from "../components/project-trash-view";

const mocks = vi.hoisted(() => ({
  trashList: vi.fn(),
  archive: vi.fn(),
  restore: vi.fn(),
  softDelete: vi.fn(),
  permanentDelete: vi.fn(),
  leave: vi.fn(),
  update: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    language: "en",
    t: (key: string, params?: Record<string, string | number>) =>
      params
        ? Object.entries(params).reduce((acc, [k, v]) => acc.replaceAll(`{{${k}}}`, String(v)), key)
        : key,
  }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mocks.navigate };
});

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("../hooks/use-projects", () => ({
  useTrashedProjects: mocks.trashList,
  useArchiveProject: () => ({ mutateAsync: mocks.archive, isPending: false }),
  useRestoreProject: () => ({ mutateAsync: mocks.restore, isPending: false }),
  useDeleteProject: () => ({ mutateAsync: mocks.softDelete, isPending: false }),
  usePermanentDeleteProject: () => ({ mutateAsync: mocks.permanentDelete, isPending: false }),
  useLeaveProject: () => ({ mutateAsync: mocks.leave, isPending: false }),
  useUpdateProject: () => ({ mutateAsync: mocks.update, isPending: false }),
}));

const activeProject: IProject = {
  _id: "proj-1",
  title: "Climate Synthesis",
  visibility: "PRIVATE",
  status: "ACTIVE",
  ownerId: "owner-1",
  accessRole: "OWNER",
  version: 2,
  memberCount: 3,
  paperCount: 12,
  members: [],
  papers: [],
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-10T00:00:00Z",
};

const trashedActiveItem: TrashedProjectItem = {
  _id: "proj-trash-1",
  title: "Clinical Trial Review",
  description: "Preserves 8 papers and 2 reviewers",
  status: "ACTIVE",
  visibility: "PRIVATE",
  memberCount: 3,
  paperCount: 8,
  deletedAt: "2026-11-01T00:00:00Z",
  purgeAt: "2026-12-01T00:00:00Z",
  daysRemaining: 17,
  expired: false,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
};

const trashedExpiredItem: TrashedProjectItem = {
  ...trashedActiveItem,
  _id: "proj-trash-2",
  title: "Expired Study",
  deletedAt: "2026-09-10T00:00:00Z",
  purgeAt: "2026-10-10T00:00:00Z",
  daysRemaining: 0,
  expired: true,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.resetAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function setInputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("ProjectLifecycleSection & ProjectTrashView", () => {
  it("shows Danger Zone only to the owner and requires typing the project title before soft deleting", async () => {
    mocks.softDelete.mockResolvedValue({ deleted: true, softDeleted: true });

    await act(async () => {
      root.render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ProjectLifecycleSection project={activeProject} />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain("Danger Zone");
    expect(container.textContent).toContain("Archive this project");
    expect(container.textContent).toContain("Move project to Trash");

    const deleteButton = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Delete project"))!;
    await act(async () => deleteButton.click());

    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("30 days");
    const confirmButton = [...dialog.querySelectorAll("button")].find((b) => b.textContent?.includes("Confirm")) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);

    const confirmInput = dialog.querySelector<HTMLInputElement>("#project-action-confirm")!;
    await act(async () => setInputValue(confirmInput, "Climate Synthesis"));
    expect(confirmButton.disabled).toBe(false);

    await act(async () => confirmButton.click());
    expect(mocks.softDelete).toHaveBeenCalledOnce();
    expect(mocks.navigate).toHaveBeenCalledWith("/projects?view=trash");
  });

  it("hides Danger Zone from non-owner project members", async () => {
    await act(async () => {
      root.render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ProjectLifecycleSection project={{ ...activeProject, accessRole: "MEMBER" }} />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).not.toContain("Danger Zone");
    expect(container.textContent).not.toContain("Delete project");
    expect(container.textContent).toContain("Leave project");
  });

  it("lists trashed projects, allows restore within 30 days, and locks permanent delete until retention expires", async () => {
    mocks.trashList.mockReturnValue({
      isLoading: false,
      isError: false,
      isFetching: false,
      data: [trashedActiveItem, trashedExpiredItem],
      refetch: vi.fn(),
    });
    mocks.restore.mockResolvedValue({ ...activeProject, _id: trashedActiveItem._id });
    mocks.permanentDelete.mockResolvedValue(undefined);

    await act(async () => {
      root.render(
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ProjectTrashView />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain("Clinical Trial Review");
    expect(container.textContent).toContain("17 days remaining");

    const buttons = [...container.querySelectorAll("button")];
    const restoreButtons = buttons.filter((b) => b.textContent?.includes("Restore"));
    const lockedForeverBtn = buttons.find((b) => b.textContent?.includes("Available after 30 days")) as HTMLButtonElement;
    const unlockedForeverBtn = buttons.find((b) => b.textContent?.includes("Delete forever")) as HTMLButtonElement;

    expect((restoreButtons[0] as HTMLButtonElement).disabled).toBe(false);
    expect((restoreButtons[1] as HTMLButtonElement).disabled).toBe(true);
    expect(lockedForeverBtn.disabled).toBe(true);
    expect(unlockedForeverBtn.disabled).toBe(false);

    await act(async () => restoreButtons[0]!.click());
    expect(mocks.restore).toHaveBeenCalledWith("proj-trash-1");
    expect(mocks.navigate).toHaveBeenCalledWith("/projects/proj-trash-1");

    await act(async () => unlockedForeverBtn.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    const confirmInput = dialog.querySelector<HTMLInputElement>("#project-permanent-delete-confirm")!;
    await act(async () => setInputValue(confirmInput, "Expired Study"));
    const foreverConfirm = [...dialog.querySelectorAll("button")].find((b) => b.textContent?.includes("Delete forever")) as HTMLButtonElement;
    await act(async () => foreverConfirm.click());
    expect(mocks.permanentDelete).toHaveBeenCalledWith("proj-trash-2");
  });
});
