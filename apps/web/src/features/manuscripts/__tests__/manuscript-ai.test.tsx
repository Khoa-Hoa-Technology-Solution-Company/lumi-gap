// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { ManuscriptAi } from "../manuscript-ai";
import { captureAiSelection } from "../ai-selection";

vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string, values: Record<string, string | number> = {}) => key.replace(/\{\{(\w+)\}\}/g, (match, name: string) => String(values[name] ?? match)) }) }));
const calls = vi.hoisted(() => ({ assist: vi.fn(), get: vi.fn(), cancel: vi.fn(), apply: vi.fn() }));
vi.mock("../manuscripts.api", () => ({ manuscriptsApi: { assist: calls.assist, aiRun: calls.get, cancelAi: calls.cancel } }));
let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => { await cleanup?.(); vi.resetAllMocks(); vi.unstubAllGlobals(); });
async function render(options: { repairRequest?: number; selectionLength?: number; repairCompiled?: boolean; sourceVersion?: number } = {}) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const doc = new Y.Doc(), text = doc.getText("source"); text.insert(0, "Original passage");
  const target = captureAiSelection("main", text, 0, text.length);
  const input = { fileId: "main", from: 0, to: text.length, original: text.toString(), action: "improve", instruction: "", language: "English" };
  const run = { id: "run", input, status: "completed", result: { text: "A clearer academic passage.", explanation: "Preserved meaning", citations: [], warnings: [] } };
  calls.assist.mockResolvedValue({ ...run, status: "queued", result: null }); calls.get.mockResolvedValue(run); calls.apply.mockResolvedValue(undefined);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host), client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const capture = vi.fn(() => ({ target, input })), compile = vi.fn();
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><ManuscriptAi project="project" manuscript="draft" filename="main.tex" selectionLength={options.selectionLength ?? text.length} canWrite capture={capture} apply={calls.apply} repairRequest={options.repairRequest} onCompile={compile} canCompile repairCompiled={options.repairCompiled} sourceVersion={options.sourceVersion} /></MemoryRouter></QueryClientProvider>));
  cleanup = async () => { await act(async () => root.unmount()); client.clear(); doc.destroy(); host.remove(); };
  return { host, target, run, capture, compile };
}
const button = (host: HTMLElement, label: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === label)!;
async function request(host: HTMLElement) {
  await act(async () => button(host, "Ask AI").click());
  for (let i = 0; i < 20 && !host.textContent?.includes("Proposed passage"); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
}
it.each(["Vietnamese", "Japanese"])("sends the selected translation language %s to the existing AI API", async language => {
  const { host } = await render();
  const action = host.querySelector<HTMLSelectElement>("select")!;
  await act(async () => { action.value = "translate"; action.dispatchEvent(new Event("change", { bubbles: true })); });
  const languages = host.querySelectorAll<HTMLSelectElement>("select")[1]!;
  expect([...languages.options].map(option => option.value)).toEqual(expect.arrayContaining(["Vietnamese", "English", "Japanese", "other"]));
  await act(async () => { languages.value = language; languages.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => button(host, "Ask AI").click());
  expect(calls.assist).toHaveBeenCalledWith("project", "draft", expect.objectContaining({ action: "translate", language }));
  expect(calls.apply).not.toHaveBeenCalled();
});
it("requires a custom language and sends its trimmed name instead of the other-option marker", async () => {
  const { host } = await render();
  const action = host.querySelector<HTMLSelectElement>("select")!;
  await act(async () => { action.value = "translate"; action.dispatchEvent(new Event("change", { bubbles: true })); });
  const languages = host.querySelectorAll<HTMLSelectElement>("select")[1]!;
  await act(async () => { languages.value = "other"; languages.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(button(host, "Ask AI").disabled).toBe(true);
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(calls.assist).not.toHaveBeenCalled();
  const input = host.querySelector<HTMLInputElement>("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "  Italian  ");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => button(host, "Ask AI").click());
  expect(calls.assist).toHaveBeenCalledWith("project", "draft", expect.objectContaining({ action: "translate", language: "Italian" }));
});
it("keeps writing assistance usable after leaving an empty custom translation language", async () => {
  const { host } = await render();
  const action = host.querySelector<HTMLSelectElement>("select")!;
  await act(async () => { action.value = "translate"; action.dispatchEvent(new Event("change", { bubbles: true })); });
  const languages = host.querySelectorAll<HTMLSelectElement>("select")[1]!;
  await act(async () => { languages.value = "other"; languages.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => { action.value = "improve"; action.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => button(host, "Ask AI").click());
  expect(calls.assist).toHaveBeenCalledWith("project", "draft", expect.objectContaining({ action: "improve", language: "English" }));
});
it("previews original and suggestion without mutation, applying only after acceptance", async () => {
  const { host, target } = await render(); await request(host);
  expect(host.querySelector(".writing-ai-original")?.textContent).toBe("Original passage");
  expect(host.querySelector(".writing-ai-proposed")?.textContent).toBe("A clearer academic passage.");
  expect(calls.apply).not.toHaveBeenCalled();
  await act(async () => button(host, "Accept suggestion").click());
  expect(calls.apply).toHaveBeenCalledWith(target, "A clearer academic passage.", "replace", undefined, []);
  expect(host.textContent).toContain("Applied to the editor");
});
it("rejects a proposal without touching collaborative source", async () => {
  const { host } = await render(); await request(host);
  await act(async () => button(host, "Reject suggestion").click());
  expect(calls.apply).not.toHaveBeenCalled(); expect(host.querySelector(".writing-ai-result")).toBeNull();
});
it("asks for missing context without displaying an invalid-source error or an Accept action", async () => {
  const { host, run } = await render();
  calls.get.mockResolvedValue({ ...run, result: { ...run.result, text: "", needsContext: true, explanation: "Please provide your observed findings." } });
  await act(async () => button(host, "Ask AI").click());
  for (let i = 0; i < 30 && !host.textContent?.includes("Please provide your observed findings."); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(host.textContent).toContain("More research context is needed");
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(button(host, "Accept suggestion")).toBeUndefined();
  expect(button(host, "New suggestion")).toBeDefined();
  expect(calls.apply).not.toHaveBeenCalled();
});
it("regenerates the same request and target without recapturing or applying content", async () => {
  const { host, run, capture } = await render(); await request(host);
  const initialCaptureCount = capture.mock.calls.length;
  calls.get.mockResolvedValue({ ...run, id: "regenerated", result: { ...run.result, text: "A regenerated proposal." } });
  calls.assist.mockResolvedValue({ ...run, id: "regenerated", status: "queued", result: null });
  await act(async () => button(host, "Regenerate suggestion").click());
  for (let i = 0; i < 30 && !host.textContent?.includes("A regenerated proposal."); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(calls.assist).toHaveBeenLastCalledWith("project", "draft", { ...run.input, regenerateOf: "run" });
  expect(capture).toHaveBeenCalledTimes(initialCaptureCount);
  expect(calls.apply).not.toHaveBeenCalled();
  expect(host.querySelector(".writing-ai-proposed")?.textContent).toBe("A regenerated proposal.");
});
it.each(["", "   ", "```latex\nInjected\n```"])("never offers Accept for invalid source output %j", async text => {
  const { host, run } = await render(); calls.get.mockResolvedValue({ ...run, result: { ...run.result, text } });
  await act(async () => button(host, "Ask AI").click());
  for (let i = 0; i < 30 && !host.querySelector(".writing-ai-result"); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(button(host, "Accept suggestion")).toBeUndefined();
  expect(button(host, "Replace selection")).toBeUndefined();
  expect(button(host, "Insert after selection")).toBeUndefined();
  expect(calls.apply).not.toHaveBeenCalled();
});
it("retains the proposal when a source conflict prevents acceptance", async () => {
  const { host } = await render(); await request(host); calls.apply.mockRejectedValue(new Error("stale source"));
  await act(async () => button(host, "Replace selection").click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("source or permissions changed");
  expect(host.querySelector(".writing-ai-proposed")).not.toBeNull();
});
it("links project citations to the source and sends only a canonical paper ID for insertion", async () => {
  const { host, target, run } = await render();
  calls.get.mockResolvedValue({ ...run, input: { ...run.input, action: "citations" }, result: { text: "", explanation: "Check this source", warnings: [], citations: [{ id: "paper", title: "Real project source", authors: [], year: 2024, doi: null, citationKey: "canonical", bibtex: "server metadata", reason: "Possible support", evidenceStatus: "PROJECT_SOURCE" }] } });
  await act(async () => button(host, "Ask AI").click());
  for (let i = 0; i < 20 && !host.querySelector(".writing-ai-citation"); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(host.querySelector(".writing-ai-citation a")?.getAttribute("href")).toBe("/papers/paper");
  expect(host.textContent).toContain("Project source · support needs checking");
  await act(async () => button(host, "Insert verified citation key").click());
  expect(calls.apply).toHaveBeenCalledWith(target, "", "insert", "paper");
});
it("prevents duplicate requests before React renders the busy state", async () => {
  const { host } = await render();
  let finish!: (value: unknown) => void;
  calls.assist.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => { button(host, "Ask AI").click(); host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
  expect(calls.assist).toHaveBeenCalledTimes(1);
  await act(async () => finish({ id: "run", status: "cancelled", result: null }));
});
it("applies a proposal once even when Accept and Replace are pressed together", async () => {
  const { host } = await render(); await request(host);
  let finish!: () => void;
  calls.apply.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  await act(async () => { button(host, "Accept suggestion").click(); button(host, "Replace selection").click(); });
  expect(calls.apply).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  expect(host.textContent).toContain("Applied to the editor");
});
it("allows multiple source citations without disabling the passage proposal", async () => {
  const { host, run } = await render();
  const citations = ["one", "two"].map(id => ({ id, title: `Study ${id}`, authors: [], year: 2024, doi: null, citationKey: id, bibtex: "", reason: "Possible support", evidenceStatus: "PROJECT_SOURCE" }));
  calls.get.mockResolvedValue({ ...run, result: { ...run.result, citations } });
  await request(host);
  const buttons = [...host.querySelectorAll<HTMLButtonElement>(".writing-ai-citation button")];
  await act(async () => buttons[0]!.click());
  expect(buttons[0]!.disabled).toBe(true); expect(buttons[1]!.disabled).toBe(false);
  expect(button(host, "Accept suggestion").disabled).toBe(false);
  await act(async () => buttons[1]!.click());
  expect(calls.apply.mock.calls.map(call => call[3])).toEqual(["one", "two"]);
  await act(async () => button(host, "Accept suggestion").click());
  expect(calls.apply.mock.calls.at(-1)![4]).toEqual(citations);
});
it("inspects the entire file without a selection and applies a repair only as replacement", async () => {
  const { host, run, capture, target, compile } = await render({ repairRequest: 1, selectionLength: 0 });
  calls.get.mockResolvedValue({ ...run, input: { ...run.input, action: "repair" } });
  expect(button(host, "Analyze LaTeX errors").disabled).toBe(false);
  expect(calls.assist).not.toHaveBeenCalled();
  await act(async () => button(host, "Analyze LaTeX errors").click());
  for (let i = 0; i < 30 && !host.textContent?.includes("Apply proposed fix"); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(capture).toHaveBeenCalledWith(true);
  expect(calls.assist.mock.calls[0]![2].action).toBe("repair");
  expect(calls.apply).not.toHaveBeenCalled();
  expect(button(host, "Insert after selection")).toBeUndefined();
  await act(async () => button(host, "Apply proposed fix").click());
  expect(calls.apply).toHaveBeenCalledWith(target, run.result.text, "replace", undefined, [], true);
  expect(compile).not.toHaveBeenCalled();
  await act(async () => button(host, "Compile repaired source").click());
  expect(compile).toHaveBeenCalledTimes(1);
});
it("keeps unchanged repair advice visible without offering to apply a no-op", async () => {
  const { host, run } = await render({ repairRequest: 1 });
  calls.get.mockResolvedValue({ ...run, input: { ...run.input, action: "repair" }, result: { ...run.result, text: run.input.original, explanation: "The missing image must be uploaded." } });
  await act(async () => button(host, "Analyze LaTeX errors").click());
  for (let i = 0; i < 30 && !host.textContent?.includes("No source changes proposed"); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(host.textContent).toContain("The missing image must be uploaded.");
  expect(button(host, "Apply proposed fix")).toBeUndefined();
  expect(host.querySelector(".writing-ai-comparison")).toBeNull();
  expect(host.textContent).not.toContain("The proposed fix has not been compiled.");
  expect(calls.apply).not.toHaveBeenCalled();
});
it.each(["COMPILED", "WARNINGS"] as const)("shows %s as a compiler check without a fake fix or apply action", async outcome => {
  const { host, run } = await render({ repairRequest: 1, sourceVersion: 20 });
  calls.get.mockResolvedValue({ ...run, input: { ...run.input, action: "repair" }, result: { text: "", explanation: "Compiler produced a PDF.", citations: [], warnings: outcome === "WARNINGS" ? ["LaTeX Warning: Reference missing."] : [], repair: { outcome, sourceVersion: 20, compilationId: "compile" } } });
  await act(async () => button(host, "Analyze LaTeX errors").click());
  for (let i = 0; i < 30 && !host.textContent?.includes("LaTeX check result"); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(host.textContent).toContain("PDF compiled successfully");
  expect(host.textContent).toContain("Checked source revision 20");
  expect(host.textContent).not.toContain("The proposed fix has not been compiled.");
  expect(host.textContent).not.toContain("AI may suggest an incomplete fix.");
  expect(host.querySelector(".writing-ai-comparison")).toBeNull();
  expect(button(host, "Apply proposed fix")).toBeUndefined();
  expect(button(host, "New suggestion")).toBeDefined();
  if (outcome === "WARNINGS") expect(host.textContent).toContain("Compiler warnings (not blocking PDF)");
  expect(calls.apply).not.toHaveBeenCalled();
});
it("labels a compiler check as historical when the source has changed", async () => {
  const { host, run } = await render({ repairRequest: 1, sourceVersion: 21 });
  calls.get.mockResolvedValue({ ...run, input: { ...run.input, action: "repair" }, result: { ...run.result, text: "", repair: { outcome: "COMPILED", sourceVersion: 20, compilationId: "compile" } } });
  await act(async () => button(host, "Analyze LaTeX errors").click());
  for (let i = 0; i < 30 && !host.textContent?.includes("LaTeX check result"); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(host.textContent).toContain("Source changed since this check.");
  expect(button(host, "Apply proposed fix")).toBeUndefined();
});
it("replaces the uncompiled warning when the accepted source has compiled successfully", async () => {
  const { host, run } = await render({ repairRequest: 1, repairCompiled: true });
  calls.get.mockResolvedValue({ ...run, input: { ...run.input, action: "repair" } });
  await act(async () => button(host, "Analyze LaTeX errors").click());
  for (let i = 0; i < 30 && !host.textContent?.includes("Apply proposed fix"); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  await act(async () => button(host, "Apply proposed fix").click());
  expect(host.textContent).toContain("The current saved source compiled successfully.");
  expect(host.textContent).not.toContain("The proposed fix has not been compiled.");
});
