// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { ForumComposerResizeHandle } from "../components/forum-composer-resize-handle";

vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));

describe("Discussion composer resizing", () => {
  it("resizes with pointer and keyboard, clamps to the viewport and stops after release", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.stubGlobal("innerWidth", 1024);
    vi.stubGlobal("innerHeight", 800);
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    function Composer() {
      const [height, setHeight] = useState(624);
      return <div role="dialog" style={{ height }}><ForumComposerResizeHandle height={height} expanded={false} onResize={setHeight} /></div>;
    }
    try {
      await act(async () => { root.render(<Composer />); });
      const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!;
      const handle = container.querySelector<HTMLElement>('[role="separator"]')!;
      vi.spyOn(dialog, "getBoundingClientRect").mockImplementation(() => ({ height: parseFloat(dialog.style.height) }) as DOMRect);
      handle.setPointerCapture = vi.fn(); handle.releasePointerCapture = vi.fn(); handle.hasPointerCapture = () => true;
      const pointer = async (type: string, clientY: number) => act(async () => {
        const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientY, button: 0 });
        Object.defineProperty(event, "pointerId", { value: 1 });
        handle.dispatchEvent(event);
      });
      const key = async (value: string) => act(async () => { handle.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })); });
      await pointer("pointerdown", 100);
      await pointer("pointermove", 0);
      expect(dialog.style.height).toBe("724px");
      await pointer("pointermove", -1000);
      expect(dialog.style.height).toBe("768px");
      await pointer("pointermove", 1000);
      expect(dialog.style.height).toBe("360px");
      await pointer("pointerup", 1000);
      await pointer("pointermove", 0);
      expect(dialog.style.height).toBe("360px");
      expect(handle.releasePointerCapture).toHaveBeenCalledWith(1);
      await key("ArrowUp");
      expect(dialog.style.height).toBe("384px");
      await key("End");
      expect(dialog.style.height).toBe("768px");
      await key("Home");
      expect(dialog.style.height).toBe("360px");
      vi.stubGlobal("innerHeight", 300);
      await act(async () => { window.dispatchEvent(new Event("resize")); });
      await key("End");
      expect(dialog.style.height).toBe("268px");
      expect(handle.getAttribute("aria-valuemax")).toBe("268");
    } finally {
      await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
    }
  });
});
