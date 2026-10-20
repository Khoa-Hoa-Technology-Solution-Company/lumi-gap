// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { makeQualityEvaluation } from "./quality-evaluation.fixture";
vi.mock("@/services/api-client", () => ({ api: { get: vi.fn(async () => ({ data: { success: true, data: { evaluation: makeQualityEvaluation() } } })) } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
import { I18nProvider } from "@/i18n";
import { loadDictionary } from "@/i18n/locales";
import { AiEvaluation } from "../ai-evaluation";

it("renders interpolated scores with the real Vietnamese dictionary and provider", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.setItem("lumigap.uiLanguage", "vi"); await loadDictionary("vi");
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => root.render(<I18nProvider><AiEvaluation targetKind="paper" targetId="qa" /></I18nProvider>));
    expect(container.textContent).toContain("Điểm tóm tắt: 3.3/5");
    expect(container.textContent).not.toContain("{score}");
  } finally { await act(async () => root.unmount()); container.remove(); localStorage.clear(); vi.unstubAllGlobals(); }
});
