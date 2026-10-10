// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ load: vi.fn(), render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })), destroy: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string, values?: { page: number }) => key.replace("{{page}}", String(values?.page)) }) }));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({ GlobalWorkerOptions: {}, getDocument: mocks.load }));
import PrivateEvidencePdfPreview from "../components/private-evidence-pdf-preview";

it("renders only canvas pages from document bytes, disables remote resource fetching and destroys the worker on close", async () => {
  const page = { getViewport: ({ scale }: { scale: number }) => ({ width: 500 * scale, height: 700 * scale }), render: mocks.render };
  mocks.load.mockReturnValue({ promise: Promise.resolve({ numPages: 2, getPage: vi.fn().mockResolvedValue(page) }), destroy: mocks.destroy });
  const context = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  const blob = { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as Blob;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => root.render(<PrivateEvidencePdfPreview blob={blob} />));
    expect(container.querySelector('canvas[aria-label="Private PDF page 1"]')).not.toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
    expect(mocks.load).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Uint8Array), useWorkerFetch: false, enableXfa: false, useWasm: false }));
    expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({ annotationMode: 0 }));
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Next page")!.click());
    expect(container.querySelector('canvas[aria-label="Private PDF page 2"]')).not.toBeNull();
  } finally { await act(async () => root.unmount()); container.remove(); context.mockRestore(); }
  expect(mocks.destroy).toHaveBeenCalled();
});
