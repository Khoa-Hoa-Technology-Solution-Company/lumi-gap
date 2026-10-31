// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type { ManuscriptFile, ManuscriptComment, ManuscriptCompilationState, ManuscriptReference, ManuscriptSnapshot } from "@trend/shared-types";
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
    readonly listeners = new Set<() => void>();
    private state = { status: "SAVED", canWrite: true, ready: true, pending: 0, sequence: 1, fileVersion: 1, error: null };
    constructor(_project: string, _draft: string, readonly fileId: string) {
      this.text.insert(0, fileId === "main" ? "Main source quotation" : "Other file source");
      data.lastProvider = this;
    }
    getSnapshot = () => this.state;
    subscribe = (fn: () => void) => {
      this.listeners.add(fn);
      return () => { this.listeners.delete(fn); };
    };
    notify = () => {
      this.state = { ...this.state };
      for (const listener of this.listeners) listener();
    };
    waitForSaved = async () => {};
    destroy() { this.undoManager.destroy(); this.awareness.destroy(); this.doc.destroy(); }
  }
  return { ManuscriptProvider: Provider };
});
vi.mock("@/features/projects/api/workspace.api", () => ({ workspaceApi: { discussion: data.discussion } }));
vi.mock("@/features/academic-profile/components/private-evidence-pdf-preview", () => ({ default: () => <div>Rendered private PDF</div> }));
const data = vi.hoisted(() => ({ lastProvider: null as any, userId: "", canWrite: true, available: false, detailFailed: false, removedFiles: [] as string[], changeFile: vi.fn(), olderComments: [] as ManuscriptComment[], discussion: vi.fn(), versions: [] as ManuscriptSnapshot[], viewSnapshot: vi.fn(), extraFiles: [] as ManuscriptFile[], references: [] as ManuscriptReference[], insertCitation: vi.fn(), state: { latest: null, successful: null } as ManuscriptCompilationState, compile: vi.fn(), snapshot: vi.fn(), assist: vi.fn(), aiRun: vi.fn(), comments: [] as ManuscriptComment[], comment: vi.fn(), reply: vi.fn() }));
const file = (id: string, path: string, kind: ManuscriptFile["kind"] = "TEXT"): ManuscriptFile => ({ id, path, kind, version: 1, sequence: 0, sizeBytes: 0, mimeType: null, checksum: null, updatedAt: "2026-10-19" });
vi.mock("../github-connection.api", () => ({ githubConnectionApi: { status: async () => ({ configured: false, connected: false }) } }));
vi.mock("../manuscripts.api", () => ({ manuscriptsApi: {
  remote: async () => null,
  detail: async () => { if (data.detailFailed) throw new Error("Network interrupted"); return { id: "draft", title: "Team research paper", files: [{ id: "main", path: "main.tex", kind: "TEXT", version: 1 }, { id: "intro", path: "sections/introduction.tex", kind: "TEXT", version: 1 }, ...data.extraFiles].filter(file => !data.removedFiles.includes(file.id)), collaborators: [], compiler: { available: data.available, reason: "READY" }, version: 2, mainFileId: "main", canWrite: data.canWrite }; },
  changeFile: data.changeFile,
  compilations: async () => data.state, compile: data.compile, snapshot: data.snapshot,
  assist: data.assist, aiRun: data.aiRun,
  pdf: async () => new Blob(["%PDF-fixture"], { type: "application/pdf" }),
  context: async () => ({ references: data.references, gaps: [], evidence: [] }), insertCitation: data.insertCitation,
  comments: async () => data.comments, commentPage: async (_project: string, _id: string, _snapshot?: string, cursor?: string) => ({ items: cursor ? data.olderComments : data.comments, nextCursor: !cursor && data.olderComments.length ? "older" : null }), comment: data.comment, reply: data.reply, snapshots: async () => data.versions, viewSnapshot: data.viewSnapshot, mentors: async () => [], suggestions: async () => [],
}, saveDownload: vi.fn() }));

let cleanup: (() => Promise<void>) | undefined;
let workspaceClient: QueryClient;
// jsdom has no layout; selected-text tests exercise anchors rather than geometry.
beforeAll(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});
afterEach(async () => { await cleanup?.(); vi.unstubAllGlobals(); data.userId = ""; data.canWrite = true; data.available = false; data.detailFailed = false; data.removedFiles = []; data.olderComments = []; data.versions = []; data.state = { latest: null, successful: null }; data.comments = []; data.extraFiles = []; data.references = []; vi.clearAllMocks(); });
async function render(node: React.ReactNode, githubConnected = false) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  workspaceClient = client;
  await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[{ pathname: "/projects/project/manuscripts/draft", state: githubConnected ? { githubConnected: true } : null }]}>{node}</MemoryRouter></QueryClientProvider>); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  cleanup = async () => { await act(async () => root.unmount()); client.clear(); host.remove(); };
  return host;
}
const button = (host: HTMLElement, label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const workspace = () => <Routes><Route path="/projects/:projectId/manuscripts/:id" element={<ManuscriptEditorPage />} /></Routes>;

it("retries an initial manuscript request after a network failure", async () => {
  data.detailFailed = true;
  const host = await render(workspace());
  expect(host.textContent).toContain("Manuscript unavailable");
  data.detailFailed = false;
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === "Try again")!.click());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(host.querySelector("h1")?.textContent).toBe("Team research paper");
});

it.each(["RENAME", "DELETE"])("keeps the %s form bound to the file that opened it after selection changes", async operation => {
  const host = await render(workspace());
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>(".writing-files footer button")].find(node => node.textContent === (operation === "RENAME" ? "Rename / move" : "Delete"))!.click());
  await act(async () => host.querySelector<HTMLButtonElement>('.writing-file[title="sections/introduction.tex"]')!.click());
  expect(host.querySelector(".writing-file-form")?.textContent).toContain("main.tex");
  if (operation === "RENAME") {
    const input = host.querySelector<HTMLInputElement>('[aria-label="File path"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "renamed-main.tex"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  }
  await act(async () => host.querySelector<HTMLFormElement>(".writing-file-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(data.changeFile).toHaveBeenCalledWith("project", "draft", "main", { expectedVersion: 1, ...(operation === "RENAME" ? { path: "renamed-main.tex" } : { delete: true }) });
});

it("retains and disables a local visual draft when a teammate removes its source file", async () => {
  data.userId = "writer";
  const host = await render(workspace());
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === "Visual writing")!.click());
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>(".writing-visual button")].find(node => node.textContent === "Edit block")!.click());
  const draft = host.querySelector<HTMLElement>(".writing-visual-draft")!;
  expect(draft).not.toBeNull();
  data.removedFiles = ["main"];
  await act(async () => { await workspaceClient.invalidateQueries({ queryKey: ["manuscript", "writer", "project", "draft"], exact: true }); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(host.querySelector(".writing-visual-draft")).toBe(draft);
  expect(draft.textContent).toContain("Main source quotation");
  expect(draft.querySelector('[contenteditable="false"]')).not.toBeNull();
  expect([...draft.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === "Save block")!.disabled).toBe(true);
  expect(host.textContent).toContain("A file was removed while this tab had unsaved edits.");
  expect(EditorView.findFromDOM(host.querySelector<HTMLElement>(".writing-source-code-host .cm-editor")!)!.state.readOnly).toBe(true);
  await act(async () => [...draft.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === "Cancel")!.click());
  expect(host.querySelector('.writing-file-tabs [role="tab"][aria-selected="true"]')?.textContent).toBe("introduction.tex");
});

it("keeps an unfinished tracked buffer on its removed file and blocks proposal saves", async () => {
  data.userId = "writer";
  const host = await render(workspace());
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === "Track changes")!.click());
  const proposal = EditorView.findFromDOM(host.querySelector<HTMLElement>(".writing-tracked-editing .cm-editor")!)!;
  await act(async () => proposal.dispatch({ changes: { from: 0, insert: "Retain this proposal " } }));
  data.removedFiles = ["main"];
  await act(async () => { await workspaceClient.invalidateQueries({ queryKey: ["manuscript", "writer", "project", "draft"], exact: true }); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(EditorView.findFromDOM(host.querySelector<HTMLElement>(".writing-tracked-editing .cm-editor")!)).toBe(proposal);
  expect(proposal.state.doc.toString()).toContain("Retain this proposal");
  expect(proposal.state.readOnly).toBe(true);
  expect([...host.querySelectorAll<HTMLButtonElement>(".writing-tracked-editing button")].find(node => node.textContent === "Save proposal")!.disabled).toBe(true);
  expect(host.querySelector('.writing-file-tabs [role="tab"][aria-selected="true"]')?.textContent).toBe("main.tex");
});

it("loads older comment pages and opens the complete paginated conversation", async () => {
  const author = { id: "writer", name: "Writer" };
  data.comments = [{ id: "new-thread", title: "Latest", body: "Latest comment", status: "OPEN", version: 1, author, context: {}, mentorRelationshipId: null, hasMoreMessages: true, messages: [{ id: "recent-reply", body: "Recent reply", author, createdAt: new Date().toISOString() }] }];
  data.olderComments = [{ ...data.comments[0]!, id: "old-thread", body: "Older comment", hasMoreMessages: false, messages: [] }];
  data.discussion.mockImplementation(async (_project, _thread, page) => ({ messages: { items: [{ id: `reply-${page}`, body: `Full conversation page ${page}`, author }], hasNext: page === 1 } }));
  const host = await render(workspace());
  await act(async () => button(host, "Comments").click());
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === "Load older comments")!.click());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(host.textContent).toContain("Older comment"); expect(host.textContent).toContain("Latest comment");
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === "View all replies")!.click());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(host.textContent).toContain("Full conversation page 1");
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === "Next page")!.click());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  expect(data.discussion).toHaveBeenLastCalledWith("project", "new-thread", 2);
  expect(host.textContent).toContain("Full conversation page 2");
});

it("retains an unsent reply when changing panels or filtering comments", async () => {
  data.comments = [{ id: "thread", title: "Review", body: "Clarify this argument", status: "OPEN", version: 1, author: { id: "writer", name: "Writer" }, context: {}, mentorRelationshipId: null, messages: [] }];
  const host = await render(workspace());
  await act(async () => button(host, "Comments").click());
  const input = host.querySelector<HTMLInputElement>(".writing-comment form input")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Unsent reasoning"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => button(host, "Research context").click());
  await act(async () => button(host, "Comments").click());
  expect(host.querySelector<HTMLInputElement>(".writing-comment form input")?.value).toBe("Unsent reasoning");
  const filter = host.querySelector<HTMLSelectElement>(".writing-context select")!;
  await act(async () => { filter.value = "RESOLVED"; filter.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(host.querySelector<HTMLElement>(".writing-comment")?.hidden).toBe(true);
  await act(async () => { filter.value = "ALL"; filter.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(host.querySelector<HTMLInputElement>(".writing-comment form input")?.value).toBe("Unsent reasoning");
});

it("pauses hidden comment conversations when switching mobile panes and follows desktop visibility after resizing", async () => {
  let compact = true;
  const media = new EventTarget();
  Object.defineProperty(media, "matches", { get: () => compact });
  vi.stubGlobal("matchMedia", vi.fn(() => media));
  data.comments = [{ id: "thread", title: "Review", body: "Keep this discussion", status: "OPEN", version: 1, author: { id: "writer", name: "Writer" }, context: {}, mentorRelationshipId: null, messages: [] }];
  const host = await render(workspace());
  await act(async () => button(host, "Comments").click());
  const thread = host.querySelector<HTMLElement>(".writing-comment")!;
  expect(thread.hidden).toBe(false);
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>(".writing-mobile-tabs button")].find(node => node.textContent === "Editor")!.click());
  expect(thread.hidden).toBe(true);
  await act(async () => { compact = false; media.dispatchEvent(new Event("change")); });
  expect(thread.hidden).toBe(false);
  await act(async () => button(host, "Hide information panel").click());
  expect(thread.hidden).toBe(true);
  await act(async () => { compact = true; media.dispatchEvent(new Event("change")); });
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>(".writing-mobile-tabs button")].find(node => node.textContent === "Preview")!.click());
  expect(thread.hidden).toBe(false);
});

it("keeps the unsaved tracked buffer mounted when a background metadata refresh fails", async () => {
  data.userId = "writer";
  const host = await render(workspace());
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === "Track changes")!.click());
  const proposal = EditorView.findFromDOM(host.querySelector<HTMLElement>(".writing-tracked-editing .cm-editor")!)!;
  await act(async () => proposal.dispatch({ changes: { from: 0, insert: "Unfinished proposal " } }));
  data.detailFailed = true;
  await act(async () => { await workspaceClient.invalidateQueries({ queryKey: ["manuscript", "writer", "project", "draft"], exact: true }); });
  expect(host.querySelector(".writing-tracked-editing .cm-content")?.textContent).toContain("Unfinished proposal");
  expect(host.textContent).not.toContain("Manuscript unavailable");
});

it("uses only the immutable source for the outline after opening a saved version", async () => {
  data.userId = "writer";
  const version = { id: "saved", label: "Saved version", sourceVersion: 1, createdAt: new Date().toISOString(), createdBy: { id: "writer", name: "Writer" }, checksum: "snapshot" };
  data.versions = [version];
  data.viewSnapshot.mockResolvedValue({ ...version, manifest: { title: "Team research paper", documentType: "RESEARCH_PAPER", mainFileId: "main", files: [{ ...file("main", "main.tex"), text: "\\section{Archived introduction}" }] } });
  const host = await render(workspace());
  await act(async () => button(host, "Version history").click());
  await act(async () => [...host.querySelectorAll<HTMLAnchorElement>("a")].find(node => node.textContent?.includes("View version"))!.click());
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
  expect(host.querySelector(".writing-outline")?.textContent).toContain("Archived introduction");
});

it("mounts suggested edits when opened through the side-panel selector", async () => {
  const host = await render(workspace());
  await act(async () => {
    const selector = host.querySelector<HTMLSelectElement>("#writing-context-panel")!;
    selector.value = "suggestions";
    selector.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(host.querySelector(".writing-suggestions")?.textContent).toContain("Proposals keep the source unchanged until a team member accepts.");
});

it("keeps tracked typing out of shared source and blocks hidden citation edits", async () => {
  data.userId = "writer";
  data.references = [{ id: "paper", title: "Project source", authors: ["Demo"], year: 2026, doi: null, citationKey: "demo", bibtex: "" }];
  const host = await render(workspace());
  const shared = EditorView.findFromDOM(host.querySelector<HTMLElement>(".cm-editor")!)!;
  const original = shared.state.doc.toString();
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === "Track changes")!.click());
  const proposal = EditorView.findFromDOM(host.querySelector<HTMLElement>(".writing-tracked-editing .cm-editor")!)!;
  await act(async () => proposal.dispatch({ changes: { from: 0, insert: "Proposed only " } }));
  expect(shared.state.doc.toString()).toBe(original);
  await act(async () => button(host, "Research context").click());
  expect([...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === "Insert citation")!.disabled).toBe(true);
  expect(data.insertCitation).not.toHaveBeenCalled();
});

it("exits a saved tracked scope when navigating to a comment in the same file", async () => {
  data.userId = "writer";
  data.comments = [{ id: "thread", title: "Review", body: "Clarify", status: "OPEN", version: 1, author: { id: "member", name: "Member" }, context: { fileId: "main" }, mentorRelationshipId: null, messages: [] }];
  const host = await render(workspace());
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === "Track changes")!.click());
  expect(host.querySelector(".writing-tracked-editing")).not.toBeNull();
  await act(async () => button(host, "Comments").click());
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === "Open commented file")!.click());
  expect(host.querySelector(".writing-tracked-editing")).toBeNull();
  expect(host.querySelector<HTMLElement>(".writing-source-code-host")!.hidden).toBe(false);
});

async function citationWorkspace() {
  data.userId = "writer";
  data.references = [{ id: "paper", title: "Project source", authors: ["Demo"], year: 2026, doi: null, citationKey: "demo", bibtex: "" }];
  const host = await render(workspace());
  await act(async () => button(host, "Research context").click());
  const editor = EditorView.findFromDOM(host.querySelector<HTMLElement>(".cm-editor")!)!;
  return { host, editor, insert: () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === "Insert citation")! };
}
it("inserts a citation at the captured selection even if the cursor moves during the request", async () => {
  const { editor, insert } = await citationWorkspace();
  let finish!: (value: { key: string }) => void;
  data.insertCitation.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => editor.dispatch({ selection: { anchor: 5, head: 11 } }));
  await act(async () => insert().click());
  expect(data.insertCitation).toHaveBeenCalledOnce();
  await act(async () => editor.dispatch({ selection: { anchor: editor.state.doc.length } }));
  await act(async () => finish({ key: "demo" }));
  expect(editor.state.doc.toString()).toBe("Main \\cite{demo} quotation");
});
it("does not overwrite source edited during a pending manual citation request", async () => {
  const { host, editor, insert } = await citationWorkspace();
  let finish!: (value: { key: string }) => void;
  data.insertCitation.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => editor.dispatch({ selection: { anchor: 5, head: 11 } }));
  await act(async () => insert().click());
  await act(async () => editor.dispatch({ changes: { from: 5, to: 11, insert: "updated" } }));
  await act(async () => finish({ key: "demo" }));
  expect(editor.state.doc.toString()).toBe("Main updated quotation");
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
});
it.each(["references.bib", "notes.txt", "teamstyle.sty"])("does not insert prose citation commands into %s", async path => {
  data.extraFiles = [file("support", path)];
  const { host, insert } = await citationWorkspace();
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>(".writing-files button")].find(node => node.textContent === path)!.click());
  expect(insert().disabled).toBe(true);
  expect(data.insertCitation).not.toHaveBeenCalled();
});

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
  expect(data.compile).toHaveBeenCalledWith("project", "draft", "sealed", "pdflatex", "2022");
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
it("locates errors in project-local class and package files", () => {
  expect(latexErrors("teamarticle.cls:8: Undefined control sequence.\nteamstyle.sty:4: Missing } inserted.")).toEqual([
    { path: "teamarticle.cls", line: 8, message: "Undefined control sequence." },
    { path: "teamstyle.sty", line: 4, message: "Missing } inserted." },
  ]);
});
it("shows the actionable abstract error without repeating the fatal summary", async () => {
  data.available = true; data.state = { successful: compiled, latest: { ...compiled, id: "failed", status: "FAILED", sourceVersion: 2, diagnostics: "main.tex:10: LaTeX Error: Environment abstract abc undefined.\nmain.tex:10: ==> Fatal error occurred, no output PDF file produced!" } };
  const host = await render(workspace());
  for (let attempt = 0; attempt < 50 && !host.querySelector(".writing-error-hint"); attempt++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(host.querySelectorAll(".writing-compile-errors button:not(.writing-ai-repair-button)")).toHaveLength(1);
  expect(host.querySelector(".writing-error-hint")?.textContent).toContain("\\begin{abstract}");
});
it("opens the errored file and requests a whole-file AI repair without editing source automatically", async () => {
  data.userId = "writer"; data.available = true;
  data.state = { successful: null, latest: { ...compiled, id: "failed", status: "FAILED", diagnostics: "sections/introduction.tex:2: LaTeX Error: Missing \\begin{document}." } };
  data.assist.mockImplementation(async (_project, _id, input) => ({ id: "repair", status: "queued", input, result: null }));
  data.aiRun.mockImplementation(async () => ({ id: "repair", status: "completed", input: data.assist.mock.calls.at(-1)![2], result: { text: "Fixed source", explanation: "Fixed environment ordering", citations: [], warnings: [] } }));
  const host = await render(workspace());
  for (let i = 0; i < 30 && !button(host, "Ask AI to fix errors"); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  await act(async () => button(host, "Ask AI to fix errors").click());
  expect(host.querySelector('.writing-file-tabs [role="tab"][aria-selected="true"]')?.textContent).toBe("introduction.tex");
  expect(host.querySelector<HTMLSelectElement>(".writing-ai form select")?.value).toBe("repair");
  expect(host.querySelector(".writing-error-hint")).toBeNull();
  const analyze = [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === "Analyze LaTeX errors")!;
  await act(async () => analyze.click());
  expect(data.assist.mock.calls[0]![2]).toMatchObject({ action: "repair", fileId: "intro", from: 0, to: 17, original: "Other file source" });
  expect(host.querySelector(".cm-content")?.textContent).toContain("Other file source");
  for (let i = 0; i < 30 && !host.textContent?.includes("Apply proposed fix"); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === "Apply proposed fix")!.click());
  expect(host.querySelector(".cm-content")?.textContent).toBe("Fixed source");
  expect(data.compile).not.toHaveBeenCalled();
});
it("does not offer AI repairs in a read-only manuscript", async () => {
  data.canWrite = false;
  data.state = { successful: null, latest: { ...compiled, status: "FAILED", diagnostics: "main.tex:9: LaTeX Error: Missing \\begin{document}." } };
  const host = await render(workspace());
  for (let i = 0; i < 30 && !host.querySelector(".writing-error-hint"); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(button(host, "Ask AI to fix errors")).toBeNull();
  expect(host.querySelector(".writing-error-hint")?.textContent).toContain("after \\begin{document}");
});
it("opens and closes file tabs without deleting project files", async () => {
  const host = await render(workspace());
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>(".writing-file")].find(node => node.title === "sections/introduction.tex")!.click());
  expect(host.querySelectorAll('.writing-file-tabs [role="tab"]')).toHaveLength(2);
  expect(host.querySelector('.writing-file-tabs [role="tab"][aria-selected="true"]')?.textContent).toBe("introduction.tex");
  await act(async () => host.querySelector('.writing-file-tabs [role="tab"][aria-selected="true"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
  expect(host.querySelector('.writing-file-tabs [role="tab"][aria-selected="true"]')?.textContent).toBe("main.tex");
  await act(async () => button(host, "Close file {{name}}").click());
  expect(host.querySelectorAll('.writing-file-tabs [role="tab"]')).toHaveLength(1);
  expect(host.querySelector('.writing-file-tabs [role="tab"][aria-selected="true"]')?.textContent).toBe("main.tex");
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
  expect(host.querySelector('.writing-file-tabs [role="tab"][aria-selected="true"]')?.textContent).toBe("introduction.tex");
  const input = host.querySelector<HTMLTextAreaElement>(".writing-context form textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "Check this source quote");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => input.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(data.comment).toHaveBeenCalledWith("project", "draft", expect.objectContaining({ fileId: "main", quote: "Main", body: "Check this source quote", start: expect.any(Object), end: expect.any(Object) }));
});

it("opens a dedicated GitHub panel after OAuth and allows returning to PDF", async () => {
  data.userId = "writer";
  const host = await render(workspace(), true);
  const github = host.querySelector<HTMLButtonElement>("#writing-github-tab")!;
  expect(github.getAttribute("aria-selected")).toBe("true");
  expect(button(host, "Toggle information panel").textContent).toContain("GitHub");
  expect(host.querySelector("#writing-github-tabpanel")?.hasAttribute("hidden")).toBe(false);
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(host.textContent).toContain("One sync coordinator is enough");
  await act(async () => host.querySelector<HTMLButtonElement>("#writing-preview-tab")!.click());
  expect(github.getAttribute("aria-selected")).toBe("false");
  expect(host.querySelector("#writing-preview-tabpanel")).not.toBeNull();
});

it("deduplicates multiple presence sessions for the same user into a single avatar in the toolbar", async () => {
  data.userId = "writer";
  const host = await render(workspace());
  const provider = data.lastProvider;
  expect(provider).toBeDefined();

  await act(async () => {
    provider.awareness.setLocalStateField("user", { id: "user-1", name: "Nguyen Dinh", color: "#3b82f6" });
    const { applyAwarenessUpdate } = await import("y-protocols/awareness");
    const encoding = await import("lib0/encoding");
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 1);
    encoding.writeVarUint(encoder, 9999);
    encoding.writeVarUint(encoder, 1);
    encoding.writeVarString(encoder, JSON.stringify({ user: { id: "user-1", name: "Nguyen Dinh", color: "#3b82f6" } }));
    applyAwarenessUpdate(provider.awareness, encoding.toUint8Array(encoder), provider);
    provider.notify();
  });

  const onlineSection = host.querySelector(".writing-online");
  expect(onlineSection).not.toBeNull();
  const avatars = onlineSection!.querySelectorAll("span");
  expect(avatars).toHaveLength(1);
  expect(avatars[0]!.getAttribute("title")).toBe("Nguyen Dinh");
  expect(avatars[0]!.textContent).toBe("ND");
});
