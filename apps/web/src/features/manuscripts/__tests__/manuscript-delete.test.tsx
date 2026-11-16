// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { ManuscriptGovernanceSummary, ManuscriptSummary } from "@trend/shared-types";

const api = vi.hoisted(() => ({
  remove: vi.fn(),
  archive: vi.fn(),
  unarchive: vi.fn(),
  restoreDeleted: vi.fn(),
}));
vi.mock("../manuscripts.api", () => ({ manuscriptsApi: api }));
vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      values ? key.replace(/\{\{(\w+)\}\}/g, (_, k) => String(values[k] ?? "")) : key,
  }),
}));

import { DeleteManuscript, ManuscriptActionsMenu } from "../manuscript-delete";

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

const baseGovernance: ManuscriptGovernanceSummary = {
  ownershipScope: "PERSONAL_DRAFT",
  createdBy: { id: "u1", name: "Author One" },
  contributors: [{ id: "u1", name: "Author One" }],
  contributorCount: 1,
  snapshotCount: 2,
  submissionCount: 0,
  reviewThreadCount: 0,
  commentCount: 1,
  hasReviewsOrSubmissions: false,
  remoteBinding: null,
  canArchive: true,
  canUnarchive: false,
  canRestore: false,
  deleteBlockedReason: null,
  requiresCoAuthorApprovalForDelete: false,
  approvalStatus: "NOT_APPLICABLE",
};

const personalManuscript: ManuscriptSummary = {
  id: "draft",
  projectId: "project",
  title: "Personal paper",
  documentType: "RESEARCH_PAPER",
  template: "ARTICLE",
  description: "",
  version: 3,
  mainFileId: "main",
  archived: false,
  canWrite: true,
  canDelete: true,
  createdAt: "2026-10-20",
  updatedAt: "2026-10-20",
  governance: baseGovernance,
};

const buttonByText = (text: string) =>
  [...document.querySelectorAll("button")].find(el => el.textContent?.trim() === text);

const menuItemByText = (text: string) =>
  [...document.querySelectorAll('[role="menuitem"]')].find(el => el.textContent?.includes(text)) as HTMLElement | undefined;

async function openActionsMenu() {
  const trigger = document.querySelector<HTMLButtonElement>('button[aria-label="Manuscript actions"]')!;
  await act(async () => {
    trigger.focus();
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
}

it("replaces direct delete with an action menu, confirms soft delete with impact/remote details, preserves dialog on failure, and blocks double submit", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  const deleted = vi.fn();
  const refresh = vi.fn();
  document.body.append(host);
  try {
    await act(async () =>
      root.render(
        <DeleteManuscript projectId="project" manuscript={personalManuscript} onDeleted={deleted} onRefresh={refresh} />,
      ),
    );
    expect(buttonByText("Delete")).toBeUndefined();

    await openActionsMenu();
    await act(async () => { menuItemByText("Move to trash")?.click(); });
    expect(api.remove).not.toHaveBeenCalled();

    const dialogText = document.querySelector('[role="dialog"]')?.textContent ?? "";
    expect(dialogText).toContain("Personal paper");
    expect(dialogText).toContain("Author One");
    expect(dialogText).toContain("GitHub");

    await act(async () => buttonByText("Cancel")?.click());
    expect(api.remove).not.toHaveBeenCalled();

    await openActionsMenu();
    await act(async () => { menuItemByText("Move to trash")?.click(); });

    api.remove.mockRejectedValueOnce(new Error("network"));
    await act(async () => buttonByText("Move to trash")?.click());
    expect(document.body.textContent).toContain("Could not complete this manuscript action");
    expect(deleted).not.toHaveBeenCalled();

    let finish!: () => void;
    api.remove.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    await act(async () => {
      const confirm = buttonByText("Move to trash")!;
      confirm.click();
      confirm.click();
    });
    expect(api.remove).toHaveBeenCalledTimes(2);
    expect(api.remove).toHaveBeenLastCalledWith("project", "draft", 3, undefined);
    await act(async () => finish());
    expect(deleted).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("handles version conflicts without silently overwriting confirmed version and supports owner archive for shared manuscripts", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  const deleted = vi.fn();
  const changed = vi.fn();
  const refresh = vi.fn();
  document.body.append(host);

  const sharedManuscript: ManuscriptSummary = {
    ...personalManuscript,
    title: "Shared Lab Manuscript",
    canDelete: false,
    governance: {
      ...baseGovernance,
      ownershipScope: "COLLABORATIVE",
      contributors: [{ id: "u1", name: "Author One" }, { id: "u2", name: "Co-Author Two" }],
      contributorCount: 2,
      submissionCount: 1,
      hasReviewsOrSubmissions: true,
      remoteBinding: { provider: "GITHUB", repository: "lab/paper", branch: "main" },
      canArchive: true,
      deleteBlockedReason: "HAS_SUBMISSIONS_OR_REVIEWS",
      approvalStatus: "PROTECTED_RECORD",
    },
  };

  try {
    // Member on a protected shared draft sees neither Archive nor Move to trash, only policy details.
    await act(async () =>
      root.render(
        <ManuscriptActionsMenu
          projectId="project"
          manuscript={{
            ...sharedManuscript,
            governance: { ...sharedManuscript.governance!, canArchive: false },
          }}
          onDeleted={deleted}
          onChanged={changed}
          onRefresh={refresh}
        />,
      ),
    );
    await openActionsMenu();
    expect(menuItemByText("Move to trash")).toBeUndefined();
    expect(menuItemByText("Archive manuscript")).toBeUndefined();
    await act(async () => { menuItemByText("Deletion protection details")?.click(); });
    const infoDialog = document.querySelector('[role="dialog"]')?.textContent ?? "";
    expect(infoDialog).toContain("Co-Author Two");
    expect(infoDialog).toContain("lab/paper");
    await act(async () => buttonByText("Close")?.click());

    // Owner on shared draft can Archive and version is locked to the opened dialog snapshot.
    await act(async () =>
      root.render(
        <ManuscriptActionsMenu projectId="project" manuscript={sharedManuscript} onDeleted={deleted} onChanged={changed} onRefresh={refresh} />,
      ),
    );
    await openActionsMenu();
    await act(async () => { menuItemByText("Archive manuscript")?.click(); });
    await act(async () =>
      root.render(
        <ManuscriptActionsMenu projectId="project" manuscript={{ ...sharedManuscript, version: 4 }} onDeleted={deleted} onChanged={changed} onRefresh={refresh} />,
      ),
    );

    api.archive.mockRejectedValueOnce({ response: { status: 409 } });
    await act(async () => buttonByText("Archive manuscript")?.click());
    expect(api.archive).toHaveBeenLastCalledWith("project", "draft", 3, undefined);
    expect(buttonByText("Archive manuscript")?.disabled).toBe(true);
    expect(refresh).toHaveBeenCalledOnce();
    await act(async () => buttonByText("Cancel")?.click());

    await openActionsMenu();
    await act(async () => { menuItemByText("Archive manuscript")?.click(); });
    api.archive.mockResolvedValueOnce({ ...sharedManuscript, archived: true, version: 5 });
    await act(async () => buttonByText("Archive manuscript")?.click());
    expect(api.archive).toHaveBeenLastCalledWith("project", "draft", 4, undefined);
    expect(changed).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it("supports restoring a soft-deleted personal draft from Manuscript Trash", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  const changed = vi.fn();
  const refresh = vi.fn();
  document.body.append(host);

  const trashedManuscript: ManuscriptSummary = {
    ...personalManuscript,
    deletedAt: "2026-11-14T11:00:00.000Z",
    canDelete: false,
    governance: {
      ...baseGovernance,
      canArchive: false,
      canRestore: true,
      deleteBlockedReason: "ALREADY_DELETED",
    },
  };

  try {
    await act(async () =>
      root.render(
        <ManuscriptActionsMenu
          projectId="project"
          manuscript={trashedManuscript}
          mode="trash"
          onChanged={changed}
          onRefresh={refresh}
        />,
      ),
    );
    await act(async () => buttonByText("Restore")?.click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Restore manuscript from trash?");
    api.restoreDeleted.mockResolvedValueOnce({ ...personalManuscript, deletedAt: null, version: 4 });
    await act(async () => buttonByText("Restore manuscript")?.click());
    expect(api.restoreDeleted).toHaveBeenCalledWith("project", "draft", 3, undefined);
    expect(changed).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
