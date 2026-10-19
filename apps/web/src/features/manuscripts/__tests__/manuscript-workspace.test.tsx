// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { ManuscriptFile, ManuscriptComment, ManuscriptCompilationState } from "@trend/shared-types";
import { ManuscriptPanes } from "../manuscript-panes";
import { ManuscriptFileTree } from "../manuscript-file-tree";
import { ManuscriptEditorPage } from "../manuscript-editor";
import { latexErrors } from "../manuscript-pdf";
import { ManuscriptSourceToolbar } from "../manuscript-source-toolbar";

vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ user: { id: data.userId } }) }));
vi.mock("../collaboration-provider", async () => {
  const Y = await import("yjs"), { Awareness } = await import("y-protocols/awareness");
  class Provider {
    readonly doc = new Y.Doc();
    readonly text = this.doc.getText("source");
    readonly awareness = new Awareness(this.doc);
    readonly undoManager = new Y.UndoManager(this.text, { trackedOrigins: new Set() });
    private state = { status: "SAVED", canWrite: true, ready: true, pending: 0, sequence: 1, fileVersion: 1, error: null };
    constructor(_project: string, _draft: string, readonly fileId: string) { this.text.insert(0, fileId === "main" ? "Main source quotation" : "Other file source"); }
    getSnapshot = () => this.state;
    subscribe = () => () => {};
    waitForSaved = async () => {};
    destroy() { this.undoManager.destroy(); this.awareness.destroy(); this.doc.destroy(); }
  }
  return { ManuscriptProvider: Provider };
});
vi.mock("@/features/academic-profile/components/private-evidence-pdf-preview", () => ({ default: () => <div>Rendered private PDF</div> }));
const data = vi.hoisted(() => ({ userId: "", canWrite: true, available: false, state: { latest: null, successful: null } as ManuscriptCompilationState, compile: vi.fn(), snapshot: vi.fn(), comments: [] as ManuscriptComment[], comment: vi.fn(), reply: vi.fn() }));
const file = (id: string, path: string, kind: ManuscriptFile["kind"] = "TEXT"): ManuscriptFile => ({ id, path, kind, version: 1, sequence: 0, sizeBytes: 0, mimeType: null, checksum: null, updatedAt: "2026-10-19" });
vi.mock("../manuscripts.api", () => ({ manuscriptsApi: {
  detail: async () => ({ id: "draft", title: "Team research paper", files: [{ id: "main", path: "main.tex", kind: "TEXT", version: 1 }, { id: "intro", path: "sections/introduction.tex", kind: "TEXT", version: 1 }], collaborators: [], compiler: { available: data.available, reason: "READY" }, version: 2, mainFileId: "main", canWrite: data.canWrite }),
  compilations: async () => data.state, compile: data.compile, snapshot: data.snapshot,
  pdf: async () => new Blob(["%PDF-fixture"], { type: "application/pdf" }),
  context: async () => ({ references: [], gaps: [], evidence: [] }),
  comments: async () => data.comments, comment: data.comment, reply: data.reply, snapshots: async () => [], mentors: async () => [],
}, saveDownload: vi.fn() }));

let cleanup: (() => Promise<void>) | undefined;
// jsdom has no layout; selected-text tests exercise anchors rather than geometry.
beforeAll(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});
afterEach(async () => { await cleanup?.(); vi.unstubAllGlobals(); data.userId = ""; data.canWrite = true; data.available = false; data.state = { latest: null, successful: null }; data.comments = []; vi.clearAllMocks(); });
async function render(node: React.ReactNode) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/projects/project/manuscripts/draft"]}>{node}</MemoryRouter></QueryClientProvider>); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  cleanup = async () => { await act(async () => root.unmount()); client.clear(); host.remove(); };
  return host;
}
const button = (host: HTMLElement, label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const workspace = () => <Routes><Route path="/projects/:projectId/manuscripts/:id" element={<ManuscriptEditorPage />} /></Routes>;

it("supports keyboard resizing while reserving room for the editor", async () => {
  const host = await render(<ManuscriptPanes files={<aside>Files</aside>} editor={<section>Editor</section>} aside={<aside>PDF</aside>} filesOpen asideOpen activePane="editor" />);
  const handles = host.querySelectorAll<HTMLElement>('[role="separator"]');
  expect(handles[0]!.getAttribute("aria-valuenow")).toBe("18");
  await act(async () => handles[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
  expect(handles[0]!.getAttribute("aria-valuenow")).toBe("30");
  await act(async () => handles[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
  expect(handles[1]!.getAttribute("aria-valuenow")).toBe("36");
  await act(async () => handles[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true })));
  expect(handles[0]!.getAttribute("aria-valuenow")).toBe("12");
});
it("removes collapsed resize handles from keyboard navigation", async () => {
  const host = await render(<ManuscriptPanes files={<aside>Files</aside>} editor={<section>Editor</section>} aside={<aside>PDF</aside>} filesOpen={false} asideOpen={false} activePane="editor" />);
  expect([...host.querySelectorAll<HTMLElement>('[role="separator"]')].every(node => node.tabIndex === -1 && node.getAttribute("aria-hidden") === "true")).toBe(true);
});
it("preserves editor space when a resized side panel is reopened", async () => {
  function TogglePanes() {
    const [open, setOpen] = useState(true);
    return <><button onClick={() => setOpen(value => !value)}>Toggle files</button><ManuscriptPanes files={<aside>Files</aside>} editor={<section>Editor</section>} aside={<aside>PDF</aside>} filesOpen={open} asideOpen activePane="editor" /></>;
  }
  const host = await render(<TogglePanes />);
  const handles = host.querySelectorAll<HTMLElement>('[role="separator"]');
  await act(async () => handles[0]!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
  await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
  await act(async () => handles[1]!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
  expect(handles[1]!.getAttribute("aria-valuenow")).toBe("46");
  await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
  const pane = host.querySelector<HTMLElement>(".writing-panes")!;
  expect(parseFloat(pane.style.getPropertyValue("--writing-files-width")) + parseFloat(pane.style.getPropertyValue("--writing-aside-width"))).toBeLessThanOrEqual(66);
  expect(handles[1]!.getAttribute("aria-valuenow")).toBe("36");
});
it.each([['references.bib', 'BibTeX'], ['notes.txt', 'Plain text']])("does not insert LaTeX formatting into writable %s files", async (filename, mode) => {
  const comment = vi.fn();
  const host = await render(<ManuscriptSourceToolbar filename={filename} getView={() => null} canEdit canSearch canComment onComment={comment} />);
  expect(host.querySelector('.writing-source-mode')?.textContent).toBe(mode);
  expect(button(host, "Bold text").disabled).toBe(true);
  expect(button(host, "Insert section").disabled).toBe(true);
  expect(button(host, "Undo local edit").disabled).toBe(false);
  expect(button(host, "Find in file").disabled).toBe(false);
  await act(async () => button(host, "Comment on selection").click());
  expect(comment).toHaveBeenCalledOnce();
});
it("builds nested folders, collapses their contents, and selects stable file IDs", async () => {
  const select = vi.fn(), host = await render(<ManuscriptFileTree files={[file("main", "main.tex"), file("intro", "sections/introduction.tex"), file("method", "sections/methodology.tex")]} selectedId="main" mainFileId="main" onSelect={select} />);
  const folder = host.querySelector<HTMLButtonElement>('[aria-expanded="true"]')!;
  await act(async () => folder.click());
  expect(host.textContent).not.toContain("introduction.tex");
  await act(async () => folder.click());
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === "introduction.tex")!.click());
  expect(select).toHaveBeenCalledWith("intro");
});
it("shows truthful unavailable PDF status separately from source sync", async () => {
  const host = await render(workspace());
  expect(button(host, "Compile PDF").disabled).toBe(true);
  expect(host.textContent).toContain("Saving source does not compile a PDF.");
  expect(host.querySelector(".writing-statusbar")?.textContent).toContain("PDF: Not compiled");
  expect(host.querySelector(".writing-statusbar")?.textContent).toContain("Source sync");
  expect(host.querySelector(".writing-toolbar")?.textContent).not.toContain("Create task");
  expect(host.querySelector(".writing-toolbar-actions")?.textContent).not.toContain("Export source");
});
it("restores a collapsed information panel when comments or history is requested", async () => {
  const host = await render(workspace());
  await act(async () => button(host, "Hide information panel").click());
  expect(host.querySelector(".writing-panes")?.getAttribute("data-aside-open")).toBe("false");
  await act(async () => button(host, "Comments").click());
  expect(host.querySelector(".writing-panes")?.getAttribute("data-aside-open")).toBe("true");
  expect(host.querySelector(".writing-aside")?.textContent).toContain("Manuscript comments");
  await act(async () => button(host, "Version history").click());
  expect(host.querySelector(".writing-aside")?.textContent).toContain("Immutable source versions");
});
it("hides and restores files without replacing the source editor", async () => {
  const host = await render(workspace()), editor = host.querySelector(".writing-source");
  await act(async () => button(host, "Toggle files panel").click());
  expect(host.querySelector(".writing-panes")?.getAttribute("data-files-open")).toBe("false");
  await act(async () => button(host, "Toggle files panel").click());
  expect(host.querySelector(".writing-source")).toBe(editor);
  expect(button(host, "Toggle files panel").getAttribute("aria-expanded")).toBe("true");
});
it("keeps readonly manuscript permissions after the layout change", async () => {
  data.canWrite = false;
  const host = await render(workspace());
  expect(host.textContent).toContain("This manuscript is read-only.");
  expect(button(host, "Create source file")).toBeNull();
  await act(async () => button(host, "Version history").click());
  expect(host.querySelector(".writing-aside form")).toBeNull();
});
const compiled = { id: "compiled", snapshotId: "sealed", sourceVersion: 1, engine: "pdflatex" as const, status: "SUCCESS" as const, diagnostics: "", toolchain: "TeX Live", checksum: "checksum", createdAt: "2026-10-19", completedAt: "2026-10-19" };
it("seals saved source and starts a real compile API job, then shows queued state", async () => {
  data.available = true;
  data.snapshot.mockResolvedValue({ id: "sealed", sourceVersion: 2 });
  data.compile.mockImplementation(async () => { data.state = { latest: { ...compiled, status: "QUEUED" }, successful: null }; return data.state.latest; });
  const host = await render(workspace());
  expect(button(host, "Compile PDF").disabled).toBe(false);
  await act(async () => button(host, "Compile PDF").click());
  expect(data.snapshot).toHaveBeenCalledWith("project", "draft", expect.objectContaining({ minimumSequences: {}, reuseUnchanged: true }));
  expect(data.compile).toHaveBeenCalledWith("project", "draft", "sealed", "pdflatex");
  expect(host.textContent).toContain("Waiting for compiler…");
  expect(button(host, "Compile PDF").disabled).toBe(true);
});
it("keeps successful PDF visible with a source warning when a later compilation fails", async () => {
  data.available = true; data.state = { successful: compiled, latest: { ...compiled, id: "failed", status: "FAILED", sourceVersion: 2, diagnostics: "./main.tex:3: Undefined control sequence." } };
  const host = await render(workspace());
  for (let attempt = 0; attempt < 50 && !host.textContent?.includes("Rendered private PDF"); attempt++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(host.textContent).toContain("PDF compilation failed");
  expect(host.textContent).toContain("Rendered private PDF");
  expect(host.textContent).toContain("Showing the last successful PDF");
  expect(host.textContent).toContain("main.tex:3");
});
it("extracts source file and line without turning compiler text into HTML", () => {
  expect(latexErrors("./sections/intro.tex:12: Undefined control sequence.\n<svg onload=evil()>\nmain.tex:8: Missing $ inserted.")).toEqual([{ path: "sections/intro.tex", line: 12, message: "Undefined control sequence." }, { path: "main.tex", line: 8, message: "Missing $ inserted." }]);
});
it("shows the actionable abstract error without repeating the fatal summary", async () => {
  data.available = true; data.state = { successful: compiled, latest: { ...compiled, id: "failed", status: "FAILED", sourceVersion: 2, diagnostics: "main.tex:10: LaTeX Error: Environment abstract abc undefined.\nmain.tex:10: ==> Fatal error occurred, no output PDF file produced!" } };
  const host = await render(workspace());
  for (let attempt = 0; attempt < 50 && !host.querySelector(".writing-error-hint"); attempt++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(host.querySelectorAll(".writing-compile-errors button")).toHaveLength(1);
  expect(host.querySelector(".writing-error-hint")?.textContent).toContain("\\begin{abstract}");
});
it("opens and closes file tabs without deleting project files", async () => {
  const host = await render(workspace());
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>(".writing-file")].find(node => node.title === "sections/introduction.tex")!.click());
  expect(host.querySelectorAll('[role="tab"]')).toHaveLength(2);
  expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("introduction.tex");
  await act(async () => host.querySelector('[role="tab"][aria-selected="true"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
  expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("main.tex");
  await act(async () => button(host, "Close file {{name}}").click());
  expect(host.querySelectorAll('[role="tab"]')).toHaveLength(1);
  expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("main.tex");
  expect(host.querySelector('.writing-file[title="sections/introduction.tex"]')).not.toBeNull();
});
it("disables formatting while the collaborative editor is not writable", async () => {
  data.canWrite = false;
  const host = await render(workspace());
  expect(button(host, "Bold text").disabled).toBe(true);
  expect(button(host, "Insert equation").disabled).toBe(true);
  expect(button(host, "Comment on selection").disabled).toBe(true);
});
it("explains compiler timeouts while keeping the saved source intact", async () => {
  data.available = true; data.state = { successful: null, latest: { ...compiled, status: "TIMED_OUT", diagnostics: "Wall time exceeded" } };
  const host = await render(workspace());
  for (let attempt = 0; attempt < 50 && !host.textContent?.includes("PDF compilation timed out"); attempt++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(host.textContent).toContain("PDF compilation timed out");
  expect(host.querySelector(".writing-source")).not.toBeNull();
  expect(button(host, "Compile PDF").disabled).toBe(false);
});

it("retains a failed reply and retries its idempotency key, clearing only after success", async () => {
  data.comments = [{ id: "thread", title: "Review", body: "Please clarify", status: "OPEN", version: 1, author: { id: "member", name: "Member" }, context: {}, mentorRelationshipId: null, messages: [] }];
  data.reply.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce({});
  const host = await render(workspace());
  await act(async () => button(host, "Comments").click());
  const input = host.querySelector<HTMLInputElement>(".writing-comment form input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Keep this explanation");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const form = input.closest("form")!;
  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(input.value).toBe("Keep this explanation");
  expect(host.textContent).toContain("The operation failed. Your changes are retained; refresh and try again.");
  const firstKey = data.reply.mock.calls[0]![3];
  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(data.reply).toHaveBeenLastCalledWith("project", "thread", "Keep this explanation", firstKey);
  expect(input.value).toBe("");
});

it("posts a selection against its original file after switching the active editor", async () => {
  data.userId = "owner"; data.comment.mockResolvedValue({ id: "thread" });
  const host = await render(workspace());
  const view = EditorView.findFromDOM(host.querySelector<HTMLElement>(".cm-editor")!)!;
  await act(async () => view.dispatch({ selection: { anchor: 0, head: 4 } }));
  await act(async () => button(host, "Comment on selection").click());
  await act(async () => host.querySelector<HTMLButtonElement>('.writing-file[title="sections/introduction.tex"]')!.click());
  expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe("introduction.tex");
  const input = host.querySelector<HTMLTextAreaElement>(".writing-context form textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "Check this source quote");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => input.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(data.comment).toHaveBeenCalledWith("project", "draft", expect.objectContaining({ fileId: "main", quote: "Main", body: "Check this source quote", start: expect.any(Object), end: expect.any(Object) }));
});
