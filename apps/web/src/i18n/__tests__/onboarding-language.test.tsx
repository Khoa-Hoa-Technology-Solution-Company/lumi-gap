// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AcademicProfileOnboardingPage } from "@/pages/academic-profile-onboarding";
import { I18nProvider, useI18n } from "../index";
import * as locales from "../locales";

const user = { id: "onboarding-user", email: "test@fpt.edu.vn", academicRole: "STUDENT" };
vi.mock("@/stores/auth-store", () => ({
  useAuthStore: (select: (state: unknown) => unknown) => select({ user, tokens: { accessToken: "test-token" } }),
}));
vi.mock("@/features/auth", () => ({
  requiresAcademicProfile: () => true,
  resolvePostAuthPath: () => "/",
  useCurrentUser: () => ({ data: { user }, isLoading: false }),
  useLogout: () => ({ isPending: false, mutate: vi.fn() }),
  useUpdateAcademicProfile: () => ({ isPending: false, mutate: vi.fn() }),
}));
vi.mock("@/features/auth/api/auth.api", () => ({ authApi: { academicOnboardingOptions: async () => ({
  campuses: [], programs: [], verificationMethods: { feid: false, institutionalEmail: true, manualReview: true },
}) } }));

let root: Root | undefined;
let container: HTMLDivElement;
let client: QueryClient;
const firstRenderLanguages: string[] = [];
function Onboarding() {
  const { t } = useI18n();
  firstRenderLanguages.push(t("Welcome to LumiGap"));
  return <AcademicProfileOnboardingPage />;
}
async function mount() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root!.render(
    <QueryClientProvider client={client}><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <I18nProvider><Onboarding /></I18nProvider>
    </MemoryRouter></QueryClientProvider>,
  ));
}
async function close() {
  await act(async () => root?.unmount());
  root = undefined;
  client?.clear();
  container?.remove();
}
async function selectLanguage(label: string) {
  await act(async () => container.querySelector('[aria-label="Change language"]')!.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
  ));
  await act(async () => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((item) => item.textContent === label)!.click());
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["vi-VN", "en-US"]);
  localStorage.clear();
  firstRenderLanguages.length = 0;
});
afterEach(async () => {
  await close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("onboarding language", () => {
  it("waits for the browser's dictionary so the first onboarding render is Vietnamese", async () => {
    const vietnamese = await locales.loadDictionary("vi");
    vi.spyOn(locales, "getCachedDictionary").mockReturnValue(undefined);
    let finish!: (dictionary: locales.Dictionary) => void;
    vi.spyOn(locales, "loadDictionary").mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await mount();
    expect(container.querySelector("h1")).toBeNull();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    await act(async () => finish(vietnamese));
    expect(firstRenderLanguages.every((title) => title === vietnamese["Welcome to LumiGap"])).toBe(true);
    expect(container.querySelector("h1")!.textContent).toBe(vietnamese["Welcome to LumiGap"]);
    expect(document.documentElement.lang).toBe("vi");
    expect(localStorage.getItem("lumigap.uiLanguage")).toBeNull();
  });

  it("remembers a manual change and keeps it after reloading", async () => {
    await locales.loadDictionary("vi");
    await mount();
    const skills = container.querySelector<HTMLInputElement>("#skills-input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(skills, "Python");
      skills.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await selectLanguage("English");
    expect(container.querySelector<HTMLInputElement>("#skills-input")!.value).toBe("Python");
    expect(container.querySelector("h1")!.textContent).toBe("Welcome to LumiGap");
    expect(localStorage.getItem("lumigap.uiLanguage")).toBe("en");
    await close();
    await mount();
    expect(container.querySelector("h1")!.textContent).toBe("Welcome to LumiGap");
    expect(document.documentElement.lang).toBe("en");
  });

  it("also remembers explicitly selecting the current browser language", async () => {
    await locales.loadDictionary("vi");
    await mount();
    await selectLanguage("Tiếng Việt");
    expect(localStorage.getItem("lumigap.uiLanguage")).toBe("vi");
    await close();
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-US"]);
    await mount();
    expect(document.documentElement.lang).toBe("vi");
  });

  it("allows browser detection and switching even when storage is disabled", async () => {
    await locales.loadDictionary("vi");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Storage disabled"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage disabled"); });
    await mount();
    expect(document.documentElement.lang).toBe("vi");
    await selectLanguage("English");
    expect(container.querySelector("h1")!.textContent).toBe("Welcome to LumiGap");
  });

  it("uses English if the initial dictionary cannot load", async () => {
    vi.spyOn(locales, "getCachedDictionary").mockReturnValue(undefined);
    const load = locales.loadDictionary;
    vi.spyOn(locales, "loadDictionary").mockImplementation((language) => language === "vi" ? Promise.reject(new Error("Offline")) : load(language));
    await mount();
    expect(container.querySelector("h1")!.textContent).toBe("Welcome to LumiGap");
    expect(document.documentElement.lang).toBe("en");
    expect(localStorage.getItem("lumigap.uiLanguage")).toBeNull();
  });

  it("preserves the old preference key and gives new preferences priority", async () => {
    localStorage.setItem("LumiGap.uiLanguage", "en");
    await mount();
    expect(document.documentElement.lang).toBe("en");
    await close();
    await locales.loadDictionary("vi");
    localStorage.setItem("lumigap.uiLanguage", "vi");
    await mount();
    expect(document.documentElement.lang).toBe("vi");
  });
});
