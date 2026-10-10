// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AcademicProfile } from "@trend/shared-types";
import { StudentAffiliationPanel } from "../components/student-affiliation-panel";

const mocks = vi.hoisted(() => ({ verified: true, mutate: vi.fn(), outerSubmit: vi.fn(), resend: vi.fn() }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/features/auth", () => ({ useCurrentUser: () => ({ data: { user: { email: "student@example.com", emailVerifiedAt: mocks.verified ? "2026-10-01" : undefined } } }) }));
vi.mock("@/features/auth/api/auth.api", () => ({ authApi: { academicOnboardingOptions: vi.fn(), resendEmailVerification: mocks.resend } }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: { hostInstitution: { id: "11111111-1111-4111-8111-111111111111", name: "FPT University" } } }) }));
vi.mock("../hooks/use-academic-profile", () => ({ useRequestAcademicVerification: () => ({ mutateAsync: mocks.mutate, isPending: false }) }));
let container: HTMLDivElement, root: Root;
function profile(status = "UNVERIFIED") {
  return { userId: "student", primaryPosition: "STUDENT", affiliation: { institutionName: "FPT University", hostInstitution: true }, verificationStatuses: { affiliation: status }, verificationRequests: [{ id: "request", type: "AFFILIATION", submittedAt: "2026-10-01", rejectionReason: "Upload a clearer card" }] } as AcademicProfile;
}
async function mount(status?: string, editable = true) {
  await act(async () => root.render(<form onSubmit={(event) => { event.preventDefault(); mocks.outerSubmit(); }}><StudentAffiliationPanel profile={profile(status)} editable={editable} /></form>));
}
function button(text: string) { return Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((item) => item.textContent === text)!; }
async function click(text: string) { await act(async () => button(text).click()); }
async function input(id: string, value: string) {
  const element = document.getElementById(id) as HTMLInputElement;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value); element.dispatchEvent(new Event("input", { bubbles: true })); });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.verified = true; vi.clearAllMocks(); mocks.mutate.mockResolvedValue({}); mocks.resend.mockResolvedValue(undefined);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("Student affiliation states and private form", () => {
  it("distinguishes email ownership from an unverified student claim", async () => {
    await mount();
    const email = container.querySelector('section[aria-labelledby]');
    expect(email?.textContent).toContain("Account email ownership");
    expect(email?.textContent).toContain("Verified");
    expect(email?.textContent).toContain("student@example.com");
    expect(container.textContent).toContain("Not verified");
    expect(container.textContent).not.toContain("FPT Education affiliation verified");
    expect(button("Verify FPT affiliation").disabled).toBe(false);
  });
  it("requires email verification and offers resend without submitting the surrounding profile", async () => {
    mocks.verified = false; await mount();
    expect(button("Verify FPT affiliation").disabled).toBe(true);
    await click("Resend verification email");
    expect(mocks.resend).toHaveBeenCalledWith("student@example.com");
    expect(mocks.outerSubmit).not.toHaveBeenCalled();
  });
  it("shows a pending request without permitting another upload", async () => {
    await mount("PENDING"); await click("View request");
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Your request is awaiting review.");
    expect(document.querySelector('[role="dialog"] input[type="file"]')).toBeNull();
    expect(mocks.outerSubmit).not.toHaveBeenCalled();
  });
  it("preserves entered data after network failure and isolates the modal from profile submission", async () => {
    await mount("NEEDS_MORE_INFORMATION"); await click("Add missing information");
    await input("student-code", "SE123456");
    const element = document.getElementById("student-proof-file") as HTMLInputElement;
    Object.defineProperty(element, "files", { configurable: true, value: [new File(["%PDF-1.4"], "card.pdf", { type: "application/pdf" })] });
    await act(async () => element.dispatchEvent(new Event("change", { bubbles: true })));
    mocks.mutate.mockRejectedValueOnce(new Error("Network failed"));
    await click("Submit verification request");
    expect(mocks.mutate).toHaveBeenCalledWith(expect.objectContaining({ type: "AFFILIATION", studentId: "SE123456", evidenceType: "DOCUMENT" }));
    expect((document.getElementById("student-code") as HTMLInputElement).value).toBe("SE123456");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Your entered information has been kept");
    expect(mocks.outerSubmit).not.toHaveBeenCalled();
  });
  it("keeps review notes and evidence controls out of public profile presentation", async () => {
    await mount("REJECTED", false);
    expect(container.textContent).toContain("Unable to verify");
    expect(container.textContent).not.toContain("Upload a clearer card");
    expect(container.textContent).not.toContain("student@example.com");
    expect(container.querySelector("button")).toBeNull();
  });
  it("displays verified affiliation explicitly and offers no second request", async () => {
    await mount("VERIFIED");
    expect(container.querySelector('[aria-label="FPT Education affiliation verified"]')?.textContent).toBe("Verified");
    expect(container.querySelector("button")).toBeNull();
  });
});
