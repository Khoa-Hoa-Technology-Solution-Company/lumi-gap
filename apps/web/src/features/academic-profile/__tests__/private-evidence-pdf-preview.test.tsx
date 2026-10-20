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
    const canvas = container.querySelector("canvas")!;
    expect(canvas.width).toBeGreaterThanOrEqual(parseFloat(canvas.style.width) * 2);
    expect(canvas.style.height).toBe("auto");
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Next page")!.click());
    expect(container.querySelector('canvas[aria-label="Private PDF page 2"]')).not.toBeNull();
  } finally { await act(async () => root.unmount()); container.remove(); context.mockRestore(); }
  expect(mocks.destroy).toHaveBeenCalled();
});

it("keeps compact manuscript page and zoom controls functional", async () => {
  const page = { getViewport: ({ scale }: { scale: number }) => ({ width: 500 * scale, height: 700 * scale }), render: mocks.render };
  mocks.load.mockReturnValue({ promise: Promise.resolve({ numPages: 2, getPage: vi.fn().mockResolvedValue(page) }), destroy: mocks.destroy });
  const context = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const blob = { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as Blob;
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => root.render(<PrivateEvidencePdfPreview blob={blob} compact zoomable />));
    const next = container.querySelector<HTMLButtonElement>('[aria-label="Next page"]')!;
    await act(async () => next.click());
    expect(container.querySelector('canvas[aria-label="Private PDF page 2"]')).not.toBeNull();
    expect(next.disabled).toBe(true);
    const fittedWidth = container.querySelector("canvas")!.style.width;
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!.click());
    expect(container.querySelector(".writing-pdf-controls")?.textContent).toContain("125%");
    await act(async () => [...container.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Fit width")!.click());
    expect(container.querySelector("canvas")!.style.width).toBe(fittedWidth);
    expect([...container.querySelectorAll("button")].find(button => button.textContent === "Fit width")?.getAttribute("aria-pressed")).toBe("true");
  } finally { await act(async () => root.unmount()); container.remove(); context.mockRestore(); vi.unstubAllGlobals(); }
});

it("scrolls through consecutive pages, updates the page counter and releases offscreen canvases", async () => {
  const pdfPage = { getViewport: ({ scale }: { scale: number }) => ({ width: 612 * scale, height: 792 * scale }), render: mocks.render };
  const getPage = vi.fn().mockResolvedValue(pdfPage);
  mocks.load.mockReturnValue({ promise: Promise.resolve({ numPages: 3, getPage }), destroy: mocks.destroy });
  const context = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
  const observers = new Map<Element, (visible: boolean) => void>();
  vi.stubGlobal("IntersectionObserver", class {
    constructor(private callback: (entries: { isIntersecting: boolean }[]) => void) {}
    observe(element: Element) { observers.set(element, visible => this.callback([{ isIntersecting: visible }])); }
    disconnect() {}
  });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const blob = { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as Blob;
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => root.render(<PrivateEvidencePdfPreview blob={blob} compact zoomable continuous />));
    expect(container.querySelectorAll("[data-pdf-page]")).toHaveLength(3);
    expect(getPage).toHaveBeenCalledWith(1);
    expect(getPage).not.toHaveBeenCalledWith(3);
    expect(container.querySelector('[aria-label="Next page"]')).toBeNull();
    const first = container.querySelector<HTMLElement>('[data-pdf-page="1"]')!;
    const second = container.querySelector<HTMLElement>('[data-pdf-page="2"]')!;
    await act(async () => { observers.get(first)!(false); observers.get(second)!(true); });
    expect(first.querySelector("canvas")).toBeNull();
    expect(parseFloat(first.style.minHeight)).toBeGreaterThan(0);
    expect(second.querySelector('canvas[aria-label="Private PDF page 2"]')).not.toBeNull();
    const viewer = container.querySelector<HTMLElement>('[aria-label="PDF pages"]')!;
    Object.defineProperty(viewer, "clientHeight", { value: 390 });
    vi.spyOn(first, "getBoundingClientRect").mockImplementation(() => ({ top: -viewer.scrollTop, bottom: parseFloat(first.style.minHeight) - viewer.scrollTop, height: parseFloat(first.style.minHeight) }) as DOMRect);
    vi.spyOn(second, "getBoundingClientRect").mockImplementation(() => {
      const top = parseFloat(first.style.minHeight) + 18 - viewer.scrollTop, height = parseFloat(second.style.minHeight);
      return { top, bottom: top + height, height } as DOMRect;
    });
    viewer.scrollTop = parseFloat(first.style.minHeight) + 18;
    await act(async () => viewer.dispatchEvent(new Event("scroll")));
    expect(container.querySelector(".writing-pdf-controls")?.textContent).toContain("2 / 3");
    const oldHeight = parseFloat(first.style.minHeight);
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!.click());
    expect(parseFloat(first.style.minHeight)).toBeGreaterThan(oldHeight);
    const newHeight = parseFloat(first.style.minHeight);
    expect(viewer.scrollTop).toBeCloseTo(newHeight + 18 + 120 * newHeight / oldHeight - 120);
    expect(container.querySelector(".writing-pdf-controls")?.textContent).toContain("2 / 3");
    await act(async () => { observers.get(first)!(true); });
    expect(first.querySelector("canvas")).not.toBeNull();
  } finally { await act(async () => root.unmount()); container.remove(); context.mockRestore(); vi.unstubAllGlobals(); }
});
