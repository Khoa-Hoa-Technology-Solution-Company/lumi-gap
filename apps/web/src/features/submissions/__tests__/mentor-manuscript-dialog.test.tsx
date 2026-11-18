// @vitest-environment jsdom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn(), snapshot: vi.fn(), compile: vi.fn(), compilations: vi.fn(), pdf: vi.fn(), activeMentors: vi.fn(), mentorFeedbackContext: vi.fn(), sendMentorFeedback: vi.fn() }));
vi.mock("@/features/manuscripts/manuscripts.api", () => ({ manuscriptsApi: api }));
vi.mock("../api/submissions.api", () => ({ submissionsApi: api }));
vi.mock("@/features/projects/hooks/use-projects", () => ({ useProject: () => ({ data: { title: "Research project" } }) }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (value: unknown) => unknown) => select({ user: { id: "author" } }) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/features/academic-profile/components/private-evidence-pdf-preview", () => ({ default: ({ onValidation }: { onValidation?: (valid: boolean) => void }) => { useEffect(() => onValidation?.(true), [onValidation]); return <p>Actual PDF renderer placeholder for component testing</p>; } }));
import { MentorManuscriptDialog } from "../components/mentor-manuscript-dialog";
let host: HTMLDivElement, root: Root, client: QueryClient;
const result = { submissionId: "submission", revisionId: "revision", revisionNumber: 1, requestId: "request", assignmentId: "assignment", reused: false };
const button = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(element => element.textContent === name)!;
async function render(manuscriptId?: string, prepareSnapshot?: () => Promise<{ id: string; sourceVersion: number }>, onSent = vi.fn()) {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><MentorManuscriptDialog open projectId="project" manuscriptId={manuscriptId} onOpenChange={vi.fn()} onSent={onSent} prepareSnapshot={prepareSnapshot} /></MemoryRouter></QueryClientProvider>));
  await act(async () => { await vi.dynamicImportSettled(); });
  return onSent;
}
async function ready() { await vi.waitFor(async () => { await act(async () => undefined); expect(button("Send for mentor feedback").disabled).toBe(false); }); }
async function upload(file = new File(["%PDF-fixture"], "External study.pdf", { type: "application/pdf" })) {
  await act(async () => document.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]!.click());
  await act(async () => { const input = document.querySelector<HTMLInputElement>('input[type="file"]')!; Object.defineProperty(input, "files", { configurable: true, value: [file] }); input.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => { await vi.dynamicImportSettled(); }); return file;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  api.list.mockResolvedValue([{ id: "manuscript", title: "Existing research", documentType: "RESEARCH_PAPER" }]);
  api.detail.mockResolvedValue({ compiler: { available: true, versions: ["2022"] }, compilerSettings: { engine: "xelatex", texLiveVersion: "2022" } });
  api.snapshot.mockResolvedValue({ id: "snapshot", sourceVersion: 3 }); api.compile.mockResolvedValue({ id: "compilation" });
  api.compilations.mockResolvedValue({ latest: { id: "compilation", status: "SUCCESS" }, successful: { id: "compilation", status: "SUCCESS" } });
  api.pdf.mockResolvedValue(new Blob(["%PDF-test"], { type: "application/pdf" })); api.activeMentors.mockResolvedValue([{ id: "mentor-public", canonicalId: "mentor", fullName: "Accepted lecturer" }]);
  api.mentorFeedbackContext.mockResolvedValue({ submission: null, requests: [] }); api.sendMentorFeedback.mockResolvedValue(result);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host); client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); client.clear(); vi.resetAllMocks(); vi.unstubAllGlobals(); });

it("saves through the editor durability callback, previews and sends the exact snapshot and compilation without upload", async () => {
  const prepare = vi.fn(async () => ({ id: "snapshot", sourceVersion: 3 })); const sent = await render("manuscript", prepare);
  await ready();
  expect(prepare).toHaveBeenCalledOnce(); expect(api.snapshot).not.toHaveBeenCalled();
  expect(api.compile).toHaveBeenCalledWith("project", "manuscript", "snapshot", "xelatex", "2022");
  expect(api.pdf).toHaveBeenCalledWith("project", "manuscript", "compilation");
  expect(document.querySelector('input[type="text"]')).toBeNull();
  await act(async () => button("Send for mentor feedback").click());
  expect(api.sendMentorFeedback).toHaveBeenCalledWith(expect.objectContaining({ source: "SNAPSHOT", manuscriptSnapshotId: "snapshot", compilationId: "compilation", mentorId: "mentor" }), undefined);
  expect(sent).toHaveBeenCalledWith(result);
});
it("keeps external PDF upload separate and retains the file, message and idempotency key after a failed send", async () => {
  await render(); const file = await upload(); await ready();
  await act(async () => { const field = document.querySelector<HTMLTextAreaElement>('textarea')!; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, "Please check the method."); field.dispatchEvent(new Event("input", { bubbles: true })); });
  api.sendMentorFeedback.mockRejectedValueOnce(new Error("network"));
  await act(async () => button("Send for mentor feedback").click());
  expect(document.body.textContent).toContain("retained"); expect(document.querySelector('textarea')?.value).toBe("Please check the method.");
  const payload = api.sendMentorFeedback.mock.calls[0]![0]; expect(payload).toMatchObject({ source: "PDF", title: "External study", message: "Please check the method." }); expect(payload.manuscriptSnapshotId).toBeUndefined();
  await act(async () => button("Send for mentor feedback").click()); expect(api.sendMentorFeedback).toHaveBeenLastCalledWith(payload, file);
});
it("does not send when mentors are missing or unavailable", async () => {
  api.activeMentors.mockResolvedValue([]); await render(); await upload();
  expect(button("Send for mentor feedback").disabled).toBe(true); expect(document.body.textContent).toContain("No accepted mentor"); expect(api.sendMentorFeedback).not.toHaveBeenCalled();
});
it("does not fall back to an older successful PDF when the requested compilation fails", async () => {
  api.compilations.mockResolvedValue({ latest: { id: "compilation", status: "FAILED", diagnostics: "main.tex:1: Invalid source" }, successful: { id: "older-compilation", status: "SUCCESS" } });
  await render("manuscript"); await vi.waitFor(() => expect(document.body.textContent).toContain("did not compile"));
  expect(api.pdf).not.toHaveBeenCalled(); expect(button("Send for mentor feedback").disabled).toBe(true);
});
it("rejects empty and oversized uploads before sending", async () => {
  await render();
  await upload(new File([], "empty.pdf", { type: "application/pdf" })); expect(document.body.textContent).toContain("10 MB");
  await upload(new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.pdf", { type: "application/pdf" })); expect(button("Send for mentor feedback").disabled).toBe(true); expect(api.sendMentorFeedback).not.toHaveBeenCalled();
});
it("collects explicit responses only when the mentor requested revisions", async () => {
  api.mentorFeedbackContext.mockResolvedValue({ submission: { id: "submission", currentRevisionNumber: 1 }, requests: [{ id: "request", mentorId: "mentor", status: "REVISION_REQUESTED", items: [{ id: "item", description: "Clarify the comparison group" }] }] });
  await render("manuscript"); await vi.waitFor(() => expect(document.body.textContent).toContain("Clarify the comparison group"));
  expect(button("Send for mentor feedback").disabled).toBe(true);
  await act(async () => { const response = document.querySelector<HTMLTextAreaElement>('textarea')!; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(response, "The comparison group is now described."); response.dispatchEvent(new Event("input", { bubbles: true })); });
  await ready(); await act(async () => button("Send for mentor feedback").click());
  expect(api.sendMentorFeedback).toHaveBeenCalledWith(expect.objectContaining({ submissionId: "submission", expectedRevisionNumber: 1, responses: [{ revisionItemId: "item", responseText: "The comparison group is now described." }] }), undefined);
});
