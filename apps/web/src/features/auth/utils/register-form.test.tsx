// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RegisterForm } from "../components/register-form";
import { VerifyEmailPage } from "@/pages/verify-email";

const mocks = vi.hoisted(() => ({ register: vi.fn(), setAuth: vi.fn(), toastError: vi.fn(), toastSuccess: vi.fn() }));
vi.mock("../api/auth.api", () => ({ authApi: { register: mocks.register, googleAuthorizationUrl: () => "/auth/google" } }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: Object.assign((select: (state: unknown) => unknown) => select({ setAuth: mocks.setAuth, user: null, tokens: null }), { getState: () => ({ user: null, tokens: null }) }) }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: mocks.toastSuccess } }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }), LanguageSwitcher: () => null }));
let host: HTMLDivElement, root: Root, client: QueryClient;
async function tick() { await act(async () => { await new Promise(r => setTimeout(r, 15)); }); }
function Destination() { return <output>{JSON.stringify(useLocation().state)}</output>; }
async function mount(delivery?: string) {
  const verify = Boolean(delivery);
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[{ pathname: verify ? "/verify-email" : "/register", state: delivery ? { verificationEmailDelivery: delivery } : null }]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/register" element={<RegisterForm />} /><Route path="/verify-email" element={verify ? <VerifyEmailPage /> : <Destination />} /></Routes></MemoryRouter></QueryClientProvider>)); await tick();
}
async function fill() {
  for (const [name, value] of [["fullName", "Synthetic Registration"], ["email", "synthetic@example.test"], ["password", "SyntheticTest@123"]]) {
    const input = host.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
  }
}
async function submit(times = 1) { await act(async () => { for (let i = 0; i < times; i++) host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); await tick(); }
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); document.body.append(host); root = createRoot(host); client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 3 } } }); });
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); });

it("shows an email-specific 409 and preserves name, email and password", async () => {
  mocks.register.mockRejectedValue({ response: { status: 409, data: { error: { message: "Email already registered" } } } });
  await mount(); await fill(); await submit();
  expect(host.textContent).toContain("This email already has an account. Sign in or reset your password.");
  expect(host.querySelector<HTMLInputElement>('input[name="password"]')?.value).toBe("SyntheticTest@123");
  expect(host.querySelector<HTMLInputElement>('input[name="fullName"]')?.value).toBe("Synthetic Registration");
  expect(mocks.register).toHaveBeenCalledTimes(1); expect(mocks.setAuth).not.toHaveBeenCalled();
});
it("shows a recoverable server error instead of raw Internal server error or an unhandled rejection", async () => {
  mocks.register.mockRejectedValue({ response: { status: 500, data: { error: { message: "Internal server error" } } } });
  await mount(); await fill(); await submit();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Your details are still here.");
  expect(host.textContent).not.toContain("Internal server error"); expect(mocks.register).toHaveBeenCalledTimes(1);
});
it("does not submit twice before React has disabled the pending button", async () => {
  let reject!: (reason: unknown) => void;
  mocks.register.mockReturnValue(new Promise((_resolve, failure) => { reject = failure; }));
  await mount(); await fill(); await submit(2); expect(mocks.register).toHaveBeenCalledTimes(1);
  await act(async () => reject({ response: { status: 409 } })); await tick();
  expect(mocks.toastError).toHaveBeenCalledTimes(1);
});
it("keeps successful account creation separate from verification delivery and redirects without losing the warning", async () => {
  const data = { user: { id: "synthetic", fullName: "Synthetic Registration", email: "synthetic@example.test", systemRole: "USER" }, tokens: { accessToken: "synthetic-token", refreshToken: "synthetic-refresh" }, verificationEmailDelivery: "FAILED" };
  mocks.register.mockResolvedValue(data); await mount(); await fill(); await submit();
  expect(mocks.setAuth).toHaveBeenCalledWith(data); expect(host.querySelector("output")?.textContent).toContain('"verificationEmailDelivery":"FAILED"'); expect(mocks.toastError).not.toHaveBeenCalled();
});
it.each(["DISABLED", "FAILED"])("explains %s verification delivery without marking the account verified", async delivery => {
  await mount(delivery);
  expect(host.textContent).toContain(delivery === "DISABLED" ? "Email delivery is disabled" : "verification email could not be sent");
  expect(host.textContent).not.toContain("Email verified.");
});
