// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformApiKey, PlatformApiKeySettings } from "@trend/shared-types";
import { ApiKeyPool } from "../api-key-pool";

const mocks = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), update: vi.fn(), test: vi.fn(), remove: vi.fn() }));
vi.mock("../../api/api-keys.api", () => ({ apiKeysApi: mocks }));
vi.mock("@/i18n", () => ({
  useI18n: () => ({
    language: "en",
    t: (key: string, values?: Record<string, unknown>) => values ? key.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name] ?? "")) : key,
  }),
}));

const key = (overrides: Partial<PlatformApiKey>): PlatformApiKey => ({
  id: "k1", provider: "GEMINI", label: "Primary", keyHint: "AbCd", priority: 10, isEnabled: true, status: "ACTIVE", inUse: true,
  cooldownUntil: null, lastError: null, lastErrorAt: null, lastUsedAt: null, successCount: 12, failureCount: 0,
  createdAt: "2026-11-28T00:00:00.000Z", updatedAt: "2026-11-28T00:00:00.000Z", ...overrides,
});
const settings: PlatformApiKeySettings = {
  providers: [
    { provider: "GEMINI", hasEnvKey: true, usingEnvKey: false, keys: [
      key({}),
      key({ id: "k2", label: "Backup", keyHint: "WxYz", priority: 20, status: "COOLDOWN", inUse: false, cooldownUntil: "2026-11-28T10:00:00.000Z", lastError: "Gemini denied access (403): billing", lastErrorAt: "2026-11-28T09:00:00.000Z", failureCount: 1 }),
    ] },
    { provider: "OPENALEX", hasEnvKey: false, usingEnvKey: false, keys: [] },
  ],
};

let root: Root;
let container: HTMLDivElement;

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.list.mockResolvedValue(settings);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root.render(<QueryClientProvider client={client}><ApiKeyPool /></QueryClientProvider>));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const button = (label: string, scope: ParentNode = container) =>
  [...scope.querySelectorAll("button")].find((element) => element.textContent?.trim() === label || element.getAttribute("aria-label") === label) as HTMLButtonElement;
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("ApiKeyPool", () => {
  it("shows each key's state without revealing the secret, and the providers without keys", () => {
    const gemini = container.querySelector('[aria-labelledby="api-keys-GEMINI"]')!;
    expect(gemini.textContent).toContain("Primary");
    expect(gemini.textContent).toContain("••••AbCd");
    expect(gemini.textContent).toContain("In use");
    expect(gemini.textContent).toContain("Cooling down");
    expect(gemini.textContent).toContain("Gemini denied access (403): billing");
    expect(gemini.textContent).toContain("Env key set (last fallback)");
    const openAlex = container.querySelector('[aria-labelledby="api-keys-OPENALEX"]')!;
    expect(openAlex.textContent).toContain("No usable key");
    expect(openAlex.textContent).toContain("No keys yet. Add a key to enable this provider.");
  });

  it("adds a key, then reports the provider's test result", async () => {
    mocks.create.mockResolvedValue({ ok: false, message: "OpenAlex rejected the api_key (401)", key: key({ provider: "OPENALEX" }) });
    const openAlex = container.querySelector('[aria-labelledby="api-keys-OPENALEX"]')!;
    await act(async () => button("Add key", openAlex).click());
    const inputs = openAlex.querySelectorAll("input");
    await act(async () => { type(inputs[0] as HTMLInputElement, "Main"); type(inputs[1] as HTMLInputElement, "secret-openalex-key"); });
    await act(async () => { (openAlex.querySelector("form") as HTMLFormElement).requestSubmit(); });
    expect(mocks.create).toHaveBeenCalledWith({ provider: "OPENALEX", label: "Main", apiKey: "secret-openalex-key", priority: 10 });
    expect(openAlex.textContent).toContain("Key saved, but the test failed: OpenAlex rejected the api_key (401)");
  });

  it("tests and disables a key", async () => {
    mocks.test.mockResolvedValue({ ok: true, message: "ok", key: key({ id: "k2" }) });
    mocks.update.mockResolvedValue(key({ isEnabled: false, status: "DISABLED" }));
    const rows = container.querySelectorAll('[aria-labelledby="api-keys-GEMINI"] li');
    await act(async () => button("Test", rows[1]!).click());
    expect(mocks.test).toHaveBeenCalledWith("k2");
    expect(container.textContent).toContain("“Backup” works and is in rotation.");
    await act(async () => button("Disable", rows[0]!).click());
    expect(mocks.update).toHaveBeenCalledWith("k1", { isEnabled: false });
  });

  it("asks for confirmation before deleting", async () => {
    mocks.remove.mockResolvedValue(undefined);
    const row = container.querySelectorAll('[aria-labelledby="api-keys-GEMINI"] li')[0]!;
    await act(async () => button("Delete", row).click());
    expect(mocks.remove).not.toHaveBeenCalled();
    await act(async () => button("Confirm delete", row).click());
    expect(mocks.remove).toHaveBeenCalledWith("k1");
  });
});
