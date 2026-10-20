// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MentorRole, MentorshipDraft } from "@trend/shared-types";
import { useInvitationContent } from "../components/mentorship-invitation-content";

const api = vi.hoisted(() => ({ draft: vi.fn(), saveDraft: vi.fn(), uploadAttachment: vi.fn() }));
const auth = vi.hoisted(() => ({ user: { id: "owner" } as { id: string } | null }));
vi.mock("../api/academic-support.api", () => ({ academicSupportApi: api }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: Object.assign((select: (state: unknown) => unknown) => select(auth), { getState: () => auth }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
let root: Root, host: HTMLDivElement, client: QueryClient;
let form: ReturnType<typeof useInvitationContent>;
let saved: MentorshipDraft;
const file = { id: "pdf", fileName: "Project.pdf", mimeType: "application/pdf", byteSize: 200 };
function Harness({ roles = ["PRIMARY"], projectId = "project" }: { roles?: MentorRole[]; projectId?: string }) {
  form = useInvitationContent(projectId, "PROJECT_TO_LECTURER", true, roles);
  return <output>{form.message}</output>;
}
async function tick() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); }); }
async function mount(roles?: MentorRole[]) {
  await act(async () => root.render(<QueryClientProvider client={client}><Harness roles={roles} /></QueryClientProvider>)); await tick();
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.resetAllMocks();
  auth.user = { id: "owner" };
  saved = { message: "Reusable invitation", mentorRole: "PRIMARY", attachments: [file], version: 3 };
  api.draft.mockImplementation(async () => saved);
  api.saveDraft.mockImplementation(async (_project, _direction, input) => {
    saved = { message: input.message, mentorRole: input.mentorRole, attachments: input.attachmentIds.includes(file.id) ? [file] : [], version: input.expectedVersion + 1 };
    return saved;
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });

it("restores text and attachments when reopened for another mentor", async () => {
  await mount(); expect(form.ready).toBe(true); expect(form.attachments).toEqual([file]);
  await act(async () => form.change({ message: "The team's introduction" }));
  await act(async () => { await form.persist(); });
  await act(async () => root.render(null));
  await mount();
  expect(form.message).toBe("The team's introduction"); expect(form.attachments).toEqual([file]); expect(form.dirty).toBe(false);
});
it("serializes successive saves with the latest database version", async () => {
  await mount();
  await act(async () => {
    form.change({ message: "First" }); const first = form.persist();
    form.change({ message: "Latest" }); const second = form.persist();
    await Promise.all([first, second]);
  });
  expect(api.saveDraft.mock.calls.map(call => [call[2].message, call[2].expectedVersion])).toEqual([["First", 3], ["Latest", 4]]);
  expect(saved.message).toBe("Latest"); expect(form.dirty).toBe(false);
});
it("keeps input on a save conflict and reloads only when explicitly requested", async () => {
  await mount(); api.saveDraft.mockRejectedValueOnce({ response: { data: { error: { message: "Draft conflict" } } } });
  await act(async () => form.change({ message: "Keep this input" }));
  await act(async () => { await expect(form.persist()).rejects.toBeDefined(); });
  expect(form.message).toBe("Keep this input"); expect(form.status).toBe("error"); expect(form.dirty).toBe(true);
  saved = { ...saved, message: "Another tab", version: 4 };
  await act(async () => { await form.reload(); }); await tick();
  expect(form.message).toBe("Another tab"); expect(form.dirty).toBe(false); expect(form.error).toBe("");
});
it("autosaves text and removed attachments without sending an invitation", async () => {
  await mount(); await act(async () => form.change({ message: "Autosaved", attachments: [] }));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 1100)); });
  expect(api.saveDraft).toHaveBeenCalledWith("project", "PROJECT_TO_LECTURER", expect.objectContaining({ message: "Autosaved", attachmentIds: [] }));
  expect(form.status).toBe("saved");
});
it("adapts the saved role when only the secondary position is available", async () => {
  await mount(["SECONDARY"]); expect(form.mentorRole).toBe("SECONDARY");
  await act(async () => { await form.persist(); });
  expect(saved.mentorRole).toBe("SECONDARY");
});
it("retains successful files on partial upload failure and never loses the message", async () => {
  await mount(); const image = { id: "png", fileName: "diagram.png", mimeType: "image/png", byteSize: 128 };
  api.uploadAttachment.mockResolvedValueOnce(image).mockRejectedValueOnce(new Error("Offline"));
  const files = [new File(["image"], "diagram.png"), new File(["pdf"], "other.pdf")];
  await act(async () => { await form.upload(files as unknown as FileList); });
  expect(form.attachments).toEqual([file, image]); expect(form.message).toBe("Reusable invitation"); expect(form.uploading).toBe(false); expect(form.error).not.toBe("");
  await act(async () => { await form.persist(); });
  expect(form.error).not.toBe(""); // A successful autosave must not hide the failed upload.
});

it("rejects a batch over the 20 MB combined limit before uploading", async () => {
  await mount();
  const large = new File([new Uint8Array(5 * 1024 * 1024)], "large.pdf", { type: "application/pdf" });
  await act(async () => { await form.upload([large, large, large, large] as unknown as FileList); });
  expect(api.uploadAttachment).not.toHaveBeenCalled();
  expect(form.error).toBe("Invitation attachments must total at most 20 MB");
  expect(form.attachments).toEqual([file]);
});

it("checks the stored file size returned after image processing", async () => {
  const largeFiles = Array.from({ length: 4 }, (_, index) => ({ ...file, id: `existing-${index}`, byteSize: 5 * 1024 * 1024 - (index === 3 ? 100 : 0) }));
  saved = { ...saved, attachments: largeFiles }; await mount();
  const uploaded = { ...file, id: "processed-image", byteSize: 200 };
  api.uploadAttachment.mockResolvedValueOnce(uploaded);
  await act(async () => { await form.upload([new File(["image"], "diagram.png")] as unknown as FileList); });
  expect(form.attachments).toEqual(largeFiles);
  expect(form.error).toBe("Invitation attachments must total at most 20 MB");
});

it("protects unsaved edits from reload and workspace navigation until saved", async () => {
  await mount(); await act(async () => form.change({ message: "Not saved yet" }));
  const reload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(reload); expect(reload.defaultPrevented).toBe(true);
  expect(window.dispatchEvent(new Event("project-workspace-leave", { cancelable: true }))).toBe(false);
  await act(async () => { await form.persist(); });
  expect(window.dispatchEvent(new Event("project-workspace-leave", { cancelable: true }))).toBe(true);
});

it("resets the draft when the project changes without remounting", async () => {
  await mount(); await act(async () => form.change({ message: "Project one only" }));
  saved = { message: "Project two", mentorRole: "PRIMARY", attachments: [], version: 8 };
  await act(async () => root.render(<QueryClientProvider client={client}><Harness projectId="project-two" /></QueryClientProvider>)); await tick();
  expect(form.message).toBe("Project two"); expect(form.attachments).toEqual([]);
  await act(async () => { form.change({ message: "Project two updated" }); await form.persist(); });
  expect(api.saveDraft).toHaveBeenCalledWith("project-two", "PROJECT_TO_LECTURER", expect.objectContaining({ message: "Project two updated", expectedVersion: 8 }));
});

it("keeps local edits if reloading the saved draft fails", async () => {
  await mount(); await act(async () => form.change({ message: "Keep my local input" }));
  api.draft.mockRejectedValueOnce(new Error("Offline"));
  await act(async () => { await form.reload(); }); await tick();
  expect(form.message).toBe("Keep my local input"); expect(form.attachments).toEqual([file]); expect(form.dirty).toBe(true);
});

it("ignores a late save response after moving to another project", async () => {
  await mount(); let finish!: (draft: MentorshipDraft) => void;
  api.saveDraft.mockImplementationOnce(() => new Promise<MentorshipDraft>(resolve => { finish = resolve; }));
  let pending!: Promise<void>;
  await act(async () => { form.change({ message: "Project one edit" }); pending = form.persist(); });
  saved = { message: "Project two", mentorRole: "PRIMARY", attachments: [], version: 8 };
  await act(async () => root.render(<QueryClientProvider client={client}><Harness projectId="project-two" /></QueryClientProvider>)); await tick();
  await act(async () => { finish({ message: "Project one edit", mentorRole: "PRIMARY", attachments: [file], version: 99 }); await pending; });
  expect(form.message).toBe("Project two"); expect(form.dirty).toBe(false);
  await act(async () => { form.change({ message: "Project two edit" }); await form.persist(); });
  expect(api.saveDraft.mock.lastCall?.[2].expectedVersion).toBe(8);
});

it("ignores a late upload response after moving to another project", async () => {
  await mount(); let finish!: (attachment: typeof file) => void;
  api.uploadAttachment.mockImplementationOnce(() => new Promise<typeof file>(resolve => { finish = resolve; }));
  let pending!: Promise<void>;
  await act(async () => { pending = form.upload([new File(["data"], "old.pdf")] as unknown as FileList); });
  saved = { message: "Project two", mentorRole: "PRIMARY", attachments: [], version: 8 };
  await act(async () => root.render(<QueryClientProvider client={client}><Harness projectId="project-two" /></QueryClientProvider>)); await tick();
  await act(async () => { finish(file); await pending; });
  expect(form.attachments).toEqual([]); expect(form.message).toBe("Project two"); expect(form.uploading).toBe(false);
});

it("flushes pending edits on SPA unmount before the autosave delay", async () => {
  await mount(); await act(async () => form.change({ message: "Saved when navigating back" }));
  await act(async () => root.render(null));
  expect(saved.message).toBe("Saved when navigating back");
});

it.each([null, { id: "another-owner" }])("never flushes the previous account's draft after authentication changes to %j", async nextUser => {
  await mount(); await act(async () => form.change({ message: "Original owner's private message" }));
  auth.user = nextUser;
  await act(async () => root.render(null));
  expect(api.saveDraft).not.toHaveBeenCalled();
});
