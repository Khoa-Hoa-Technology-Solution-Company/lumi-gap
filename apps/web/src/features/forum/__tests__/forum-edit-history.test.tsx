// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ForumEditHistory } from "../components/forum-edit-history";
import { forumApi } from "../api/forum.api";

vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key, language: "en" }) }));
vi.mock("../api/forum.api", () => ({ forumApi: { commentRevisions: vi.fn(), postRevisions: vi.fn() } }));
const editedAt = "2026-10-01T00:00:00Z";
let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.resetAllMocks(); vi.unstubAllGlobals(); });

describe("Public forum edit history", () => {
  it("lets readers open revisions without an authentication requirement, then clears content when access fails", async () => {
    vi.mocked(forumApi.commentRevisions).mockResolvedValue([{ id: "revision", revision: 1, content: "Original public response", editedBy: { id: "author", fullName: "Researcher" }, createdAt: editedAt }]);
    await act(async () => root.render(<ForumEditHistory kind="comment" id="response" editedAt={editedAt} />));
    await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
    expect(forumApi.commentRevisions).toHaveBeenCalledWith("response");
    expect(container.querySelector('[aria-label="Edit history"]')?.textContent).toContain("Original public response");
    vi.mocked(forumApi.commentRevisions).mockRejectedValue(new Error("Unavailable"));
    await act(async () => root.render(<ForumEditHistory kind="comment" id="removed-response" editedAt={editedAt} />));
    expect(container.textContent).toContain("Could not load edit history.");
    expect(container.textContent).not.toContain("Original public response");
  });
});
