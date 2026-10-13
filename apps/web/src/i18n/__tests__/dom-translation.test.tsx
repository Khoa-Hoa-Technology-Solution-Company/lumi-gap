// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { I18nProvider, useI18n } from "../index";
import { loadDictionary } from "../locales";

let root: Root, container: HTMLDivElement;
function Fixture() {
  const [label, setLabel] = useState("Creator");
  const { setLanguage } = useI18n();
  return <div><span data-label title={label}>{label}</span><button data-source onClick={() => setLabel("Member")}>Change</button><button data-language onClick={() => setLanguage("en")}>English</button></div>;
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.useFakeTimers();
  localStorage.setItem("lumigap.uiLanguage", "vi"); await loadDictionary("vi");
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<I18nProvider><Fixture /></I18nProvider>));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); localStorage.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("stops mutating translated labels and attributes after the initial translation", async () => {
  const label = container.querySelector("[data-label]")!;
  expect(label.textContent).toBe("Người sáng tạo"); expect(label.getAttribute("title")).toBe("Người sáng tạo");
  const records: MutationRecord[] = [];
  const observer = new MutationObserver(items => records.push(...items));
  observer.observe(label, { subtree: true, characterData: true, attributes: true });
  await act(async () => { await vi.advanceTimersByTimeAsync(600); });
  observer.disconnect();
  expect(records).toHaveLength(0);
});

it("continues translating new React text and restores the source when switching languages", async () => {
  await act(async () => container.querySelector<HTMLButtonElement>("[data-source]")!.click());
  await act(async () => { await vi.advanceTimersByTimeAsync(100); });
  expect(container.querySelector("[data-label]")!.textContent).toBe("Thành viên");
  await act(async () => container.querySelector<HTMLButtonElement>("[data-language]")!.click());
  expect(container.querySelector("[data-label]")!.textContent).toBe("Member");
  expect(container.querySelector("[data-label]")!.getAttribute("title")).toBe("Member");
});
