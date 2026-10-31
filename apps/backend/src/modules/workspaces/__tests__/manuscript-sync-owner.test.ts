import { beforeEach, expect, it, vi } from "vitest";
import { withWorkspace, type WorkspaceContext } from "../../projects/workspace-access.js";
import { manuscriptSync } from "../manuscript-sync.js";

vi.mock("../../projects/workspace-access.js", async original => ({
  ...await original<typeof import("../../projects/workspace-access.js")>(), withWorkspace: vi.fn(), workspaceEvent: vi.fn(),
}));
vi.mock("../../audit/research-ledger.service.js", () => ({ assertCanExportProjectSource: vi.fn(), researchLedgerService: { record: vi.fn() } }));
const findDraft = vi.fn(), findBinding = vi.fn(), saveBinding = vi.fn();
let role: WorkspaceContext["role"] = "MEMBER";
beforeEach(() => {
  vi.clearAllMocks(); role = "MEMBER";
  findDraft.mockResolvedValue({ id: "draft", version: 4 }); findBinding.mockResolvedValue(null); saveBinding.mockResolvedValue({ revision: 1 });
  vi.mocked(withWorkspace).mockImplementation(async (_project, _actor, _options, run) => run({ role, project: { id: "project", visibility: "PUBLIC" }, actorId: "actor", tx: {
    draftWorkspace: { findFirst: findDraft }, manuscriptRemoteBinding: { findUnique: findBinding, upsert: saveBinding },
  } } as unknown as WorkspaceContext));
});
const input = { repository: "team/paper", branch: "main", head: "a".repeat(40), baseline: [], expectedRevision: 0, expectedVersion: 4 };
it("denies a writing member's binding change before touching the manuscript or binding", async () => {
  await expect(manuscriptSync.bind("project", "actor", "draft", input)).rejects.toMatchObject({ statusCode: 403 });
  expect(findDraft).not.toHaveBeenCalled(); expect(saveBinding).not.toHaveBeenCalled();
});
it("allows the owner to bind with the existing revision and source-version checks", async () => {
  role = "OWNER";
  await expect(manuscriptSync.bind("project", "actor", "draft", input)).resolves.toEqual({ revision: 1 });
  expect(saveBinding).toHaveBeenCalledOnce();
});
it("denies a member's source synchronization before processing a bundle", async () => {
  await expect(manuscriptSync.apply("project", "actor", "draft", { mainFile: "main.tex", expectedVersion: 4, clientKey: "key" }, new Uint8Array())).rejects.toMatchObject({ statusCode: 403 });
  expect(findDraft).not.toHaveBeenCalled();
});
it("rechecks ownership in the write transaction after processing incoming source", async () => {
  const original = vi.mocked(withWorkspace).getMockImplementation()!;
  let calls = 0;
  vi.mocked(withWorkspace).mockImplementation(async (...args) => {
    role = calls++ === 0 ? "OWNER" : "MEMBER";
    return original(...args);
  });
  const bytes = Buffer.from(JSON.stringify({ files: [{ path: "main.tex", content: Buffer.from("\\documentclass{article}\n\\begin{document}Research\\end{document}").toString("base64") }] }));
  await expect(manuscriptSync.apply("project", "actor", "draft", { mainFile: "main.tex", expectedVersion: 4, clientKey: "key" }, bytes)).rejects.toMatchObject({ statusCode: 403 });
  expect(calls).toBe(2); expect(findDraft).not.toHaveBeenCalled();
});
