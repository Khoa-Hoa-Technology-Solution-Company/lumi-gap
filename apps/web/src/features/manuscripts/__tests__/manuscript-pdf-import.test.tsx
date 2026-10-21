// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ convertPdf: vi.fn(), pdfImport: vi.fn(), acceptPdfImport: vi.fn(), pdfImportPreview: vi.fn() }));
vi.mock("../manuscripts.api", () => ({ manuscriptsApi: api }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (select: (state: unknown) => unknown) => select({ user: { id: "current-user" } }) }));
vi.mock("@/features/academic-profile/components/private-evidence-pdf-preview", () => ({ default: ({ blob, continuous }: { blob: Blob; continuous: boolean }) => <div data-pdf-size={blob.size} data-continuous={continuous}>Safe PDF preview</div> }));
import { ImportManuscriptPdf } from "../manuscript-pdf-import";
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });

it.each(["layout", "structured"] as const)("previews %s conversion and creates a manuscript only after explicit acceptance; failed acceptance keeps the proposal", async mode => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const host = document.createElement("div"), root = createRoot(host), imported = vi.fn(); document.body.append(host);
  const button = (name: string) => [...document.querySelectorAll("button")].find(element => element.textContent === name)!;
  const ready = { id: "a".repeat(64), mode, status: "ready", compilation: { status: "success" }, pageCount: 2, wordCount: 50, preview: "\\put(1,2){text}", warnings: mode === "layout" ? ["IMAGE_ONLY_PAGE:2"] : ["OCR_REVIEW_PAGE:1", "AI_STRUCTURE_UNAVAILABLE"], expiresAt: "2099-01-01", ...(mode === "structured" ? { layout: { pageCount: 2, tableCount: 1, blockCount: 8, unmappedBlocks: 0 }, comparison: { status: "compared", sourcePages: 2, generatedPages: 3, comparedPages: 2, numericCoverage: 0.8, warnings: ["PAGE_COUNT_CHANGED", "NUMERIC_CONTENT_REVIEW"] } } : {}) };
  const compiled = new Blob(["%PDF-compiled-from-converted-source"], { type: "application/pdf" });
  api.pdfImportPreview.mockResolvedValue(compiled);
  api.convertPdf.mockResolvedValue({ ...ready, status: "queued" }); api.pdfImport.mockResolvedValue(ready);
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><ImportManuscriptPdf project="project" onImported={imported} /></QueryClientProvider>));
    await act(async () => button("PDF to LaTeX").click());
    if (mode === "structured") {
      await act(async () => (document.querySelector("details summary") as HTMLElement).click());
      await act(async () => (document.querySelectorAll('input[type="radio"]')[1] as HTMLInputElement).click());
      expect(document.body.textContent).toContain("Sends text snippets to your configured AI provider");
      expect((document.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false);
      await act(async () => (document.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
    }
    await act(async () => {
      const input = document.querySelector('input[type="file"]')!;
      Object.defineProperty(input, "files", { value: [new File(["%PDF-fixture"], "Study.pdf", { type: "application/pdf" })] });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => { document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(api.convertPdf).toHaveBeenCalledWith("project", expect.any(File), "Study", expect.any(String), { mode, ai: mode === "structured" });
    expect(document.body.textContent).toContain("Original fonts are substituted");
    expect(document.body.textContent).toContain(mode === "layout" ? "Some pages contain only images" : "OCR was used");
    if (mode === "structured") {
      expect(document.body.textContent).toContain("AI assistance was unavailable or invalid");
      expect(document.body.textContent).toContain("Some numbers could not be matched");
      expect(document.body.textContent).toContain("The page count changed");
      expect(document.body.textContent).toContain("1 editable tables detected");
      expect(document.body.textContent).toContain("Numbers matched: 80%");
    }
    expect(document.body.textContent).toContain("contents are not directly editable");
    expect(api.acceptPdfImport).not.toHaveBeenCalled(); expect(imported).not.toHaveBeenCalled();
    await vi.waitFor(async () => {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
      expect(document.querySelector('[data-pdf-size="' + compiled.size + '"]')).not.toBeNull();
    });
    expect(api.pdfImportPreview).toHaveBeenCalledWith("project", ready.id);
    expect(document.querySelectorAll('[data-continuous="true"]')).toHaveLength(2);
    expect(document.body.textContent).toContain("PDF compiled from converted LaTeX");
    expect(document.body.textContent).not.toContain("\\put(1,2){text}");
    api.acceptPdfImport.mockRejectedValueOnce(new Error("temporary network failure"));
    await act(async () => button("Accept and open editor").click());
    expect(imported).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Your input is retained");
    expect(document.querySelector('[data-pdf-size="' + compiled.size + '"]')).not.toBeNull();
    expect(button("Try again")).toBeUndefined();
    api.acceptPdfImport.mockResolvedValueOnce({ id: "new-draft" });
    await act(async () => button("Accept and open editor").click());
    expect(imported).toHaveBeenCalledOnce(); expect(imported).toHaveBeenCalledWith("new-draft");
  } finally { await act(async () => root.unmount()); client.clear(); host.remove(); }
});

it.each(["failed", "unavailable"])("shows an honest %s compilation state without presenting the original as the converted PDF", async status => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const host = document.createElement("div"), root = createRoot(host); document.body.append(host);
  const button = (name: string) => [...document.querySelectorAll("button")].find(element => element.textContent === name)!;
  api.convertPdf.mockResolvedValue({ id: "compilation-error", status: "queued" });
  api.pdfImport.mockResolvedValue({ id: "compilation-error", status: "ready", compilation: { status, diagnostics: status === "failed" ? "main.tex:9: test error" : undefined }, preview: "Do not show raw source" });
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><ImportManuscriptPdf project="project" onImported={vi.fn()} /></QueryClientProvider>));
    await act(async () => button("PDF to LaTeX").click());
    await act(async () => {
      const input = document.querySelector('input[type="file"]')!;
      Object.defineProperty(input, "files", { value: [new File(["%PDF-fixture"], "Study.pdf", { type: "application/pdf" })] });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => { document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await vi.waitFor(async () => {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
      expect(document.body.textContent).toContain(status === "failed" ? "The converted source could not compile" : "Compiled preview is unavailable");
    });
    expect(api.pdfImportPreview).not.toHaveBeenCalled();
    expect(api.acceptPdfImport).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Do not show raw source");
    expect(button("Accept and open editor").disabled).toBe(false);
  } finally { await act(async () => root.unmount()); client.clear(); host.remove(); }
});

it.each(["poll", "accept"])("allows a fresh upload after expiry during %s without losing the chosen PDF or title", async phase => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
  const host = document.createElement("div"), root = createRoot(host); document.body.append(host);
  const button = (name: string) => [...document.querySelectorAll("button")].find(element => element.textContent === name)!;
  api.convertPdf.mockResolvedValue({ id: "expired-import", status: "queued" });
  const expired = { response: { status: 404, data: { error: { message: "PDF conversion expired" } } } };
  if (phase === "poll") api.pdfImport.mockRejectedValue(expired);
  else {
    api.pdfImport.mockResolvedValue({ id: "expired-import", status: "ready", pageCount: 1, wordCount: 2, warnings: [], preview: "Source text" });
    api.acceptPdfImport.mockRejectedValue(expired);
  }
  try {
    await act(async () => root.render(<QueryClientProvider client={client}><ImportManuscriptPdf project="project" onImported={vi.fn()} /></QueryClientProvider>));
    await act(async () => button("PDF to LaTeX").click());
    await act(async () => {
      const input = document.querySelector('input[type="file"]')!;
      Object.defineProperty(input, "files", { value: [new File(["%PDF-fixture"], "Study.pdf", { type: "application/pdf" })] });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => { document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    if (phase === "accept") {
      await vi.waitFor(async () => {
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
        expect(button("Accept and open editor")).toBeDefined();
      });
      await act(async () => button("Accept and open editor").click());
    }
    await vi.waitFor(async () => {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
      expect(document.body.textContent).toContain("PDF conversion expired");
    });
    if (phase === "poll") await act(async () => button("Try again").click());
    expect(button("Convert and preview").disabled).toBe(false);
    expect((document.querySelector('input[maxlength="160"]') as HTMLInputElement).value).toBe("Study");
    await act(async () => { document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(api.convertPdf).toHaveBeenCalledTimes(2);
    expect(api.convertPdf.mock.calls[1]![1]).toBe(api.convertPdf.mock.calls[0]![1]);
    expect(api.convertPdf.mock.calls[1]![3]).not.toBe(api.convertPdf.mock.calls[0]![3]);
  } finally { await act(async () => root.unmount()); client.clear(); host.remove(); }
});
