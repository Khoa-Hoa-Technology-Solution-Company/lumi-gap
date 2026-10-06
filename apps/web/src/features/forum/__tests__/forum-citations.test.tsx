// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ForumBodyEditor } from "../components/forum-body-editor";
import { ForumCitationPicker } from "../components/forum-citation-picker";
import { forumPaperApi } from "../api/forum-paper.api";
import type { ForumReferenceView } from "../api/forum.api";
import { Editor } from "@tiptap/core";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { forumCitationOccurrences, forumCitationPaperIds, forumCitationToken, orderForumReferences } from "@trend/shared-types";
import { canUseForumVisualEditor, forumRichTextExtensions } from "../utils/forum-rich-text";
import { ForumMarkdown } from "../components/forum-markdown";

vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("../hooks/use-forum", () => ({ useForumPaperSearch: (query: string) => ({ data: query.length >= 3 ? [{ openalexId: "W123", title: "Picker study", authors: ["Picker Author"], publicationYear: 2025, canAttach: true }] : [], isLoading: false, isError: false }) }));
vi.mock("../api/forum-paper.api", () => ({ forumPaperApi: {
  attachOpenAlex: vi.fn(async () => ({ paperId: "11111111-1111-4111-8111-111111111111", openalexId: "W123", title: "Picker study", authors: ["Picker Author"], publicationYear: 2025, canAttach: true })),
  preview: vi.fn(async () => ({ title: "DOI study", doi: "10.1234/study", authors: ["DOI Author"], publicationYear: 2024, canAttach: true })),
  attach: vi.fn(async () => ({ paperId: "22222222-2222-4222-8222-222222222222", title: "DOI study", doi: "10.1234/study", authors: ["DOI Author"], publicationYear: 2024, canAttach: true })),
} }));
const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const citation = forumCitationToken;
const create = (content: string) => new Editor({ extensions: forumRichTextExtensions(), content, contentType: "markdown" });

describe("scholarly citations", () => {
  it("round trips atomic paper nodes, never editable number strings", () => {
    const body = `Evidence ${citation(a)} and ${citation(b)}, repeated ${citation(a)}.`;
    const editor = create(body);
    const nodes: string[] = [];
    editor.state.doc.descendants((node) => { if (node.type.name === "forumCitation") { expect(node.isAtom).toBe(true); nodes.push(node.attrs.paperId); } });
    expect(nodes).toEqual([a, b, a]);
    expect(canUseForumVisualEditor(body, editor.markdown!)).toBe(true);
    expect(editor.getMarkdown()).toContain(citation(a));
    expect(editor.getMarkdown()).not.toContain("[1]");
    editor.destroy();
  });
  it("renumbers deletion, insertion, reordered content and undo without changing paper identities", () => {
    const editor = create(`Claim ${citation(a)} then ${citation(b)} again ${citation(a)}.`);
    const labels = () => { const values: number[] = []; editor.state.doc.descendants((node) => { if (node.type.name === "forumCitation") values.push(node.attrs.label); }); return values; };
    // Initial content is labelled on the first transaction too.
    editor.commands.setTextSelection(1);
    expect(labels()).toEqual([1, 2, 1]);
    const positions: number[] = [];
    editor.state.doc.descendants((node, position) => { if (node.type.name === "forumCitation" && node.attrs.paperId === a) positions.push(position); });
    let transaction = editor.state.tr;
    for (const position of positions.reverse()) transaction = transaction.delete(position, position + 1);
    editor.view.dispatch(transaction);
    expect(labels()).toEqual([1]);
    expect(forumCitationPaperIds(editor.getMarkdown())).toEqual([b]);
    editor.commands.undo();
    expect(labels()).toEqual([1, 2, 1]);
    editor.commands.setContent(`Moved ${citation(b)} before ${citation(a)}.`, { contentType: "markdown" });
    expect(labels()).toEqual([1, 2]);
    expect(forumCitationPaperIds(editor.getMarkdown())).toEqual([b, a]);
    editor.destroy();
  });
  it("ignores code, escaped syntax and plain citation numbers", () => {
    expect(forumCitationPaperIds(`Example \`${citation(a)}\`\n\n\`\`\`text\n${citation(a)}\n\`\`\`\n\n\\${citation(a)}\n\n[1] ${citation(b)}`)).toEqual([b]);
    expect(forumCitationOccurrences(':cite[]{paperId="bad"}')[0]?.paperId).toBe("bad");
  });
  it("renders inline links and one ordered References list with metadata, separately from notes", () => {
    const body = `Claim ${citation(b)} then ${citation(a)} repeat ${citation(b)}. Note[^1].\n\n[^1]: Method caveat.`;
    const references = [{ paperId: a, title: "First study", authors: ["A. Author"], year: 2024 }, { paperId: b, title: "Second study", authors: ["B. Author"], year: 2025, venue: "Research Journal", doi: "10.1234/study" }];
    expect(orderForumReferences(body, references).map((item) => item.paperId)).toEqual([b, a]);
    const html = renderToStaticMarkup(<StaticRouter location="/forum"><ForumMarkdown content={body} references={references} renderReferences /></StaticRouter>);
    expect(html).toContain(`href="/papers/${b}"`);
    expect(html).toContain(">[1]</a>");
    expect(html).toContain(">[2]</a>");
    expect(html).not.toContain(":cite");
    expect(html).toContain("References");
    expect(html).toContain("Research Journal");
    expect(html).toContain("B. Author");
    expect(html.indexOf("Second study</p>")).toBeLessThan(html.indexOf("First study</p>"));
    expect(html).toContain("data-footnotes");
    expect(html).not.toContain(">[1]</sup>");
  });
  it("previews an editor citation inside the modal without editing content or moving the cursor", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.getAttribute("role") === "dialog" ? new DOMRect(0, 0, 600, 600) : new DOMRect(200, 200, 30, 24);
    });
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const changes = vi.fn();
    const references = [{ paperId: a, title: "Evidence study", authors: ["A. Author"], year: 2024, venue: "Research Journal", doi: "10.1234/study" }];
    const render = (body: string) => <div role="dialog" aria-label="Composer"><ForumBodyEditor value={body} onChange={changes} maxLength={20000} label="Discussion body" references={references} /></div>;
    try {
      await act(async () => { root.render(render(`Evidence ${citation(a)}.`)); });
      const marker = container.querySelector<HTMLElement>("[data-forum-citation]")!;
      const text = container.querySelector(".forum-visual-editor p")!.firstChild!;
      const range = document.createRange(); range.setStart(text, 3); range.collapse(true);
      window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
      await act(async () => { marker.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })); });
      const card = document.querySelector<HTMLElement>(".forum-citation-preview")!;
      expect(card.textContent).toContain("Evidence study");
      expect(card.textContent).toContain("A. Author");
      expect(card.textContent).toContain("2024 · Research Journal");
      expect(card.textContent).toContain("DOI: 10.1234/study");
      expect(card.closest('[aria-label="Composer"]')).not.toBeNull();
      expect(card.querySelector("a")?.getAttribute("href")).toBe(`/papers/${a}`);
      expect(window.getSelection()!.anchorNode).toBe(text);
      expect(window.getSelection()!.anchorOffset).toBe(3);
      expect(changes).not.toHaveBeenCalled();
      await act(async () => {
        marker.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: card }));
        card.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
      });
      expect(document.querySelector(".forum-citation-preview")).not.toBeNull();
      await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
      expect(document.querySelector(".forum-citation-preview")).toBeNull();
      expect(marker.hasAttribute("aria-describedby")).toBe(false);
      await act(async () => { marker.focus(); marker.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
      expect(document.activeElement).toBe(document.querySelector(".forum-citation-preview a"));
      await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
      expect(document.activeElement).toBe(marker);
      await act(async () => { marker.click(); });
      expect(document.querySelector(".forum-citation-preview")).not.toBeNull();
      await act(async () => { root.render(render("Evidence removed.")); });
      expect(document.querySelector(".forum-citation-preview")).toBeNull();
      expect(changes).not.toHaveBeenCalled();
    } finally { await act(async () => root.unmount()); container.remove(); bounds.mockRestore(); vi.unstubAllGlobals(); }
  });
  it("shows a published citation source on keyboard focus and closes on outside interaction", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(200, 200, 30, 24));
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => { root.render(<StaticRouter location="/forum"><ForumMarkdown content={`Claim ${citation(a)}.`} references={[{ paperId: a, title: "Published source", authors: ["Researcher"], year: 2025 }]} /></StaticRouter>); });
      const marker = container.querySelector<HTMLAnchorElement>("[data-forum-citation]")!;
      await act(async () => { marker.focus(); });
      expect(document.querySelector(".forum-citation-preview")?.textContent).toContain("Published source");
      expect(marker.getAttribute("href")).toBe(`/papers/${a}`);
      expect(marker.getAttribute("aria-describedby")).toBe(document.querySelector(".forum-citation-preview")?.id);
      await act(async () => { document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })); });
      expect(document.querySelector(".forum-citation-preview")).toBeNull();
    } finally { await act(async () => root.unmount()); container.remove(); bounds.mockRestore(); vi.unstubAllGlobals(); }
  });
  it("dismisses the citation card before the real composer dialog on Escape", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.getAttribute("role") === "dialog" ? new DOMRect(0, 0, 600, 600) : new DOMRect(200, 200, 30, 24);
    });
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const dismissed = vi.fn();
    try {
      await act(async () => { root.render(<Dialog open onOpenChange={dismissed}><DialogContent><DialogTitle>Composer</DialogTitle><DialogDescription>Draft discussion</DialogDescription><ForumBodyEditor value={`Claim ${citation(a)}.`} onChange={vi.fn()} maxLength={20000} label="Discussion body" references={[{ paperId: a, title: "Study" }]} /></DialogContent></Dialog>); });
      await act(async () => { document.querySelector<HTMLElement>("[data-forum-citation]")!.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })); });
      expect(document.querySelector(".forum-citation-preview")).not.toBeNull();
      await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
      expect(document.querySelector(".forum-citation-preview")).toBeNull();
      expect(dismissed).not.toHaveBeenCalled();
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Composer");
      await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
      expect(dismissed).toHaveBeenCalledWith(false);
    } finally { await act(async () => root.unmount()); container.remove(); bounds.mockRestore(); vi.unstubAllGlobals(); }
  });
  it("opens citation and footnote actions separately and inserts the selected Paper at the saved Markdown cursor", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const changes = vi.fn();
    function Draft() {
      const [value, setValue] = useState("Before after");
      const [references, setReferences] = useState<ForumReferenceView[]>([]);
      return <ForumBodyEditor value={value} onChange={(next) => { changes(next); setValue(next); }} references={references} onReferencesChange={setReferences} maxLength={20000} label="Discussion body" />;
    }
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const button = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((item) => item.textContent === label || item.getAttribute("aria-label") === label)!;
    try {
      await act(async () => { root.render(<StaticRouter location="/forum/new"><QueryClientProvider client={client}><Draft /></QueryClientProvider></StaticRouter>); });
      await act(async () => { button("Markdown").click(); });
      const field = container.querySelector("textarea")!;
      field.focus(); field.setSelectionRange(7, 7);
      await act(async () => { button("More formatting").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
      expect(document.querySelector('[role="menu"]')?.textContent).toContain("Add citation");
      expect(document.querySelector('[role="menu"]')?.textContent).toContain("Add footnote");
      const menuItem = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((item) => item.textContent === "Add citation")!;
      await act(async () => { menuItem.click(); });
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Choose a paper");
      const search = document.querySelector<HTMLInputElement>('[aria-label="Search OpenAlex papers"]')!;
      await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "caching"); search.dispatchEvent(new Event("input", { bubbles: true })); });
      await vi.waitFor(async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); expect(document.querySelector('[role="option"]')).not.toBeNull(); });
      await act(async () => { document.querySelector<HTMLButtonElement>('[role="option"]')!.click(); });
      expect(changes).not.toHaveBeenCalled();
      await act(async () => { button("Insert citation").click(); });
      await vi.waitFor(async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); expect(changes).toHaveBeenCalled(); });
      expect(changes).toHaveBeenLastCalledWith(`Before ${citation(a)}after`);
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      await act(async () => { button("Preview").click(); });
      expect(container.textContent).toContain("References");
      expect(container.textContent).toContain("Picker study");
      await act(async () => { button("Markdown").click(); });
      const doiField = container.querySelector("textarea")!;
      doiField.focus(); doiField.setSelectionRange(0, 0);
      await act(async () => { button("More formatting").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
      await act(async () => { Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((item) => item.textContent === "Add citation")!.click(); });
      await act(async () => { button("Enter DOI").click(); });
      const input = document.querySelector<HTMLInputElement>('[aria-label="DOI"]')!;
      await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "10.1234/study"); input.dispatchEvent(new Event("input", { bubbles: true })); });
      await act(async () => { button("Resolve DOI").click(); });
      await vi.waitFor(async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); expect(button("Attach paper")).toBeTruthy(); });
      await act(async () => { button("Attach paper").click(); });
      await vi.waitFor(async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Selected paper: DOI study"); });
      expect(changes).toHaveBeenCalledTimes(1);
      await act(async () => { button("Insert citation").click(); });
      expect(changes).toHaveBeenLastCalledWith(`${citation(b)}Before ${citation(a)}after`);
    } finally { await act(async () => root.unmount()); client.clear(); container.remove(); }
  });

  it("keeps DOI text, resolved metadata and independent selections when switching citation tabs", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.mocked(forumPaperApi.preview).mockClear();
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const insert = vi.fn(() => true);
    const close = vi.fn();
    const button = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((item) => item.textContent === label)!;
    const input = () => document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
    const type = async (value: string) => act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input(), value); input().dispatchEvent(new Event("input", { bubbles: true })); });
    const settle = async (check: () => void) => vi.waitFor(async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); check(); });
    try {
      await act(async () => { root.render(<QueryClientProvider client={client}><ForumCitationPicker onInsert={insert} onClose={close} /></QueryClientProvider>); });
      await type("caching");
      await settle(() => expect(document.querySelector('[role="option"]')).not.toBeNull());
      await act(async () => { document.querySelector<HTMLButtonElement>('[role="option"]')!.click(); button("Enter DOI").click(); });
      expect(button("Insert citation").disabled).toBe(true);
      await type("10.1234/study");
      await act(async () => { button("Resolve DOI").click(); });
      await settle(() => expect(document.querySelector('[aria-label="Paper metadata preview"]')?.textContent).toContain("DOI study"));
      await act(async () => { button("Search OpenAlex papers").click(); });
      expect(input().value).toBe("caching");
      expect(document.querySelector('[role="status"]')?.textContent).toBe("Selected paper: Picker study");
      await act(async () => { button("Enter DOI").click(); });
      expect(input().value).toBe("10.1234/study");
      expect(document.querySelector('[aria-label="Paper metadata preview"]')?.closest("[hidden]")).toBeNull();
      expect(forumPaperApi.preview).toHaveBeenCalledTimes(1);
      await act(async () => { button("Attach paper").click(); });
      await settle(() => expect(document.querySelector('[role="status"]')?.textContent).toBe("Selected paper: DOI study"));
      await act(async () => { button("Search OpenAlex papers").click(); });
      expect(document.querySelector('[role="status"]')?.textContent).toBe("Selected paper: Picker study");
      await act(async () => { button("Enter DOI").click(); });
      await act(async () => { button("Insert citation").click(); });
      expect(insert).toHaveBeenCalledWith(expect.objectContaining({ paperId: b, title: "DOI study" }));
      expect(close).toHaveBeenCalledOnce();
      // Editing the DOI must still discard the old result and selected source.
      await type("10.1234/changed");
      expect(button("Insert citation").disabled).toBe(true);
      expect(document.querySelector('[aria-label="Paper metadata preview"]')).toBeNull();
      expect(button("Resolve DOI")).toBeTruthy();
    } finally { await act(async () => root.unmount()); client.clear(); container.remove(); vi.unstubAllGlobals(); }
  });

});
