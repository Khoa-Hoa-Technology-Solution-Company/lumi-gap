// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import type { AcademicProfile, MentorshipRequest } from "@trend/shared-types";
import { PositionVerificationPanel } from "../components/position-verification-panel";
import { MentorshipList } from "@/pages/academics/academic-support";
import type { MentorshipItem } from "@/features/projects/api/academic-support.api";

const mocks = vi.hoisted(() => ({ verified: false, id: "lecturer", mutate: vi.fn(), identity: { verified: false, accountEmailVerified: true, institutionId: "institution", source: "ACCOUNT", email: "staff@university.edu", officialDomains: ["university.edu"], approvedEmailDomains: [{ domain: "university.edu", allowSubdomains: false }] } }));
const uploads = vi.hoisted(() => ({ stage: vi.fn() }));
const delivery = vi.hoisted(() => ({ enqueue: vi.fn() }));
vi.mock("../services/lecturer-delivery", () => ({ enqueueLecturerDelivery: delivery.enqueue }));
vi.mock("../hooks/use-lecturer-delivery", () => ({ useLecturerDelivery: () => undefined }));
const notifications = vi.hoisted(() => ({ success: vi.fn() }));
vi.mock("sonner", () => ({ toast: notifications }));
vi.mock("../api/academic-profile.api", () => ({ academicProfileApi: { stageLecturerEvidence: uploads.stage } }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string, values?: Record<string, string>) => key.replace(/\{\{(\w+)\}\}/g, (_, name: string) => values?.[name] ?? name) }) }));
vi.mock("@/stores/auth-store", () => ({ useAuthStore: (selector: (s: unknown) => unknown) => selector({ user: { id: mocks.id } }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }), useMutation: () => ({ mutate: mocks.mutate, isPending: false }) }));
vi.mock("../hooks/use-academic-profile", () => ({ useAcademicProfile: () => ({ data: { academicRole: "LECTURER", academicRoleVerificationStatus: mocks.verified ? "VERIFIED" : "SELF_DECLARED", verificationStatuses: { position: mocks.verified ? "VERIFIED" : "NOT_SUBMITTED" } } }), useLecturers: vi.fn(), useRequestAcademicVerification: () => ({ mutateAsync: mocks.mutate }), useSubmitLecturerVerification: () => ({ mutateAsync: mocks.mutate }), useInstitutionalEmailStatus: () => ({ data: mocks.identity }), useRequestInstitutionalEmailChallenge: () => ({ mutateAsync: mocks.mutate }), useVerifyInstitutionalEmail: () => ({ mutateAsync: mocks.mutate }) }));
let container: HTMLDivElement, root: Root;
const profile = (status: string) => ({ academicRole: "LECTURER", academicRoleVerificationStatus: status === "VERIFIED" ? "VERIFIED" : "SELF_DECLARED", affiliation: { institutionName: "University X", institutionId: "institution" }, positionTitle: "Lecturer", verificationStatuses: { position: status }, verificationRequests: [{ type: "POSITION", submittedAt: "2026-10-01", rejectionReason: "Provide a current staff record" }] }) as AcademicProfile;
function RouteProbe() { const location = useLocation(); return <output data-testid="route">{location.pathname}{location.search}</output>; }
async function render(node: ReactNode, path = "/") { await act(async () => root.render(<MemoryRouter initialEntries={[path]}>{node}<RouteProbe /></MemoryRouter>)); }
beforeEach(() => { delivery.enqueue.mockReset().mockResolvedValue(undefined); mocks.mutate.mockReset(); mocks.verified = false; mocks.identity.verified = false; mocks.identity.accountEmailVerified = true; mocks.identity.approvedEmailDomains = [{ domain: "university.edu", allowSubdomains: false }]; mocks.id = "lecturer"; container = document.createElement("div"); document.body.append(container); root = createRoot(container); (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); });
async function input(selector: string, value: string) {
  const element = document.querySelector(selector) as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const dialogButton = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(button => button.textContent === label)!;
describe("Lecturer verification and consent controls", () => {
  it.each([["NOT_SUBMITTED", "Not verified"], ["PENDING", "Verification pending"], ["NEEDS_MORE_INFORMATION", "More information required"], ["VERIFIED", "Verified"], ["REJECTED", "Could not verify"]])("shows %s as a separate Lecturer status", async (status, label) => {
    await render(<PositionVerificationPanel trackingMode profile={profile(status)} editable />);
    expect(container.textContent).toContain(label);
    expect(container.querySelector('section[aria-labelledby]')?.textContent).toContain("Lecturer status");
    if (status === "NEEDS_MORE_INFORMATION") expect(container.textContent).toContain("Provide a current staff record");
  });
  it("opens only the chosen evidence fields in a bounded dialog", async () => {
    await render(<PositionVerificationPanel trackingMode profile={profile("NOT_SUBMITTED")} editable />);
    await act(async () => [...container.querySelectorAll("button")].find(b => b.textContent === "Verify Lecturer Status")!.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.className).toContain("overflow-y-auto");
    expect(dialog.querySelector('input[type="file"]')).toBeNull();
    expect(dialog.querySelector('input[type="url"]')).toBeNull();
    await act(async () => [...dialog.querySelectorAll("button")].find(b => b.textContent === "I don't have an institutional email")!.click());
    expect(dialog.querySelector('input[type="file"]')).toBeNull();
    expect(dialog.querySelector('input[type="url"]')).not.toBeNull();
    expect(dialog.textContent).not.toContain("ORCID");
  });
  it("supports opening the existing verification dialog from the profile reminder", async () => {
    const onOpenChange = vi.fn();
    await render(<PositionVerificationPanel profile={profile("NOT_SUBMITTED")} editable open onOpenChange={onOpenChange} />, "/profile?tab=affiliation");
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Verify Lecturer Status");
    expect(dialog.querySelector('input[type="file"]')).toBeNull();
    await act(async () => [...dialog.querySelectorAll("button")].find(button => button.textContent === "Cancel")!.click());
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(container.querySelector('[data-testid="route"]')!.textContent).toBe("/profile?tab=affiliation");
  });
  it("opens and dismisses verification from the affiliation tab without navigation", async () => {
    await render(<PositionVerificationPanel profile={profile("NOT_SUBMITTED")} editable />, "/profile?tab=affiliation");
    await act(async () => [...container.querySelectorAll("button")].find(b => b.textContent === "Verify Lecturer Status")!.click());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="route"]')!.textContent).toBe("/profile?tab=affiliation");
    await act(async () => dialogButton("Cancel").click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('[data-testid="route"]')!.textContent).toBe("/profile?tab=affiliation");
  });
  it("saves verification and closes the profile form without waiting for delivery or navigation", async () => {
    mocks.identity.verified = true;
    await render(<PositionVerificationPanel profile={profile("NOT_SUBMITTED")} editable />, "/profile?tab=affiliation");
    await act(async () => [...container.querySelectorAll("button")].find(b => b.textContent === "Verify Lecturer Status")!.click());
    await input('#lecturer-primary-evidence', "https://university.edu/person");
    await act(async () => dialogButton("Submit verification").click());
    expect(delivery.enqueue).toHaveBeenCalledTimes(1);
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('[data-testid="route"]')!.textContent).toBe("/profile?tab=affiliation");
  });
  it.each([["NOT_SUBMITTED", false], ["PENDING", true], ["VERIFIED", true]])("does not open profile verification for status %s and editable=%s", async (status, editable) => {
    await render(<PositionVerificationPanel profile={profile(status as string)} editable={editable as boolean} open />, "/profile?tab=affiliation");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('[data-testid="route"]')!.textContent).toBe("/profile?tab=affiliation");
  });
  it("withholds mentorship acceptance from unverified Lecturer but allows owner acceptance of an offer", async () => {
    const item = { kind: "REQUEST", id: "request", projectId: "project", mentorUser: { _id: "lecturer", fullName: "Lecturer" }, requestedBy: { _id: "owner", fullName: "Owner" }, direction: "PROJECT_TO_LECTURER", status: "PENDING", actions: { accept: false, decline: true, cancel: false, end: false, openProject: false }, createdAt: "2026-10-01", updatedAt: "2026-10-01" } as MentorshipRequest;
    await render(<MentorshipList items={[item]} />);
    expect([...container.querySelectorAll("button")].some(b => b.textContent === "Accept")).toBe(false);
    mocks.verified = true;
    await render(<MentorshipList items={[{ ...item, actions: { ...item.actions, accept: true } }]} />);
    expect([...container.querySelectorAll("button")].some(b => b.textContent === "Accept")).toBe(true);
    mocks.verified = false; mocks.id = "owner";
    await render(<MentorshipList items={[{ ...item, direction: "LECTURER_TO_PROJECT", actions: { ...item.actions, accept: true } }]} />);
    expect([...container.querySelectorAll("button")].some(b => b.textContent === "Accept")).toBe(true);
  });
  it("does not show consent or cancellation controls to an ordinary project member", async () => {
    mocks.id = "member";
    const item = { kind: "REQUEST", id: "request", projectId: "project", mentorUser: { _id: "lecturer", fullName: "Lecturer" }, requestedBy: { _id: "owner" }, direction: "PROJECT_TO_LECTURER", status: "PENDING", actions: { accept: false, decline: false, cancel: false, end: false, openProject: false } } as MentorshipItem;
    await render(<MentorshipList items={[item]} />);
    const controls = [...container.querySelectorAll("button")].map(b => b.textContent);
    expect(controls).not.toContain("Accept"); expect(controls).not.toContain("Cancel request"); expect(controls).not.toContain("End mentorship");
  });
  it("reuses a verified account identity without showing an email input or OTP", async () => {
    mocks.identity.verified = true;
    await render(<PositionVerificationPanel trackingMode profile={profile("NOT_SUBMITTED")} editable open />);
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("already verified through your LumiGap account");
    expect(dialog.querySelector('input[type="email"]')).toBeNull();
    expect(dialog.querySelector('input[type="file"]')).toBeNull();
    expect(dialog.querySelector('input[type="url"]')).not.toBeNull();
  });
  it("opens an institutional email input only after selecting email linking", async () => {
    await render(<PositionVerificationPanel trackingMode profile={profile("NOT_SUBMITTED")} editable open />);
    const dialog = document.querySelector('[role="dialog"]')!;
    await act(async () => [...dialog.querySelectorAll("button")].find(b => b.textContent === "Verify institutional email")!.click());
    expect(dialog.querySelector('input[type="email"]')).not.toBeNull();
    expect(dialog.querySelector('input[type="url"]')).toBeNull();
    expect(dialog.textContent).toContain("login email stays the same");
  });
  it("preserves the selected evidence type when switching to institutional email verification", async () => {
    await render(<PositionVerificationPanel trackingMode profile={profile("NOT_SUBMITTED")} editable open />);
    const dialog = document.querySelector('[role="dialog"]')!;
    await act(async () => [...dialog.querySelectorAll("button")].find(b => b.textContent === "I don't have an institutional email")!.click());
    const primary = dialog.querySelector('select[aria-label="Official institution source"]') as HTMLSelectElement;
    await act(async () => {
      primary.value = "EMPLOYMENT_DOCUMENT";
      primary.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(dialog.querySelectorAll('input[type="file"]')).toHaveLength(1);
    await act(async () => [...dialog.querySelectorAll("button")].find(b => b.textContent === "Verify institutional email")!.click());
    mocks.identity.verified = true;
    await render(<PositionVerificationPanel trackingMode profile={profile("NOT_SUBMITTED")} editable open />);
    expect(dialog.querySelector('input[type="file"]')).not.toBeNull();
    expect(dialog.querySelectorAll('input[type="url"]')).toHaveLength(0);
    expect((dialog.querySelector('select[aria-label="Official institution source"]') as HTMLSelectElement).value).toBe("EMPLOYMENT_DOCUMENT");
  });
  it("blocks malformed and wrong-institution emails before sending any request", async () => {
    const lecturer = profile("NOT_SUBMITTED"); lecturer.affiliation.institutionName = "Van Lang University";
    mocks.identity.approvedEmailDomains = [{ domain: "vlu.edu.vn", allowSubdomains: false }];
    await render(<PositionVerificationPanel trackingMode profile={lecturer} editable open />);
    await act(async () => dialogButton("Verify institutional email").click());
    await input('#lecturer-work-email', "not-an-email");
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain("Enter a valid institutional email address.");
    expect(dialogButton("Send verification code").disabled).toBe(true);
    expect(dialogButton("Submit verification").disabled).toBe(true);
    await input('#lecturer-work-email', "thanhndse182854@fpt.edu.vn");
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain("This email is not approved for Van Lang University");
    expect(dialogButton("Send verification code").disabled).toBe(true);
    await act(async () => dialogButton("Send verification code").click());
    expect(mocks.mutate).not.toHaveBeenCalled();
    await input('#lecturer-work-email', "lecturer@vlu.edu.vn");
    expect(dialogButton("Send verification code").disabled).toBe(false);
    expect(dialogButton("Submit verification").disabled).toBe(true);
  });
  it("explains missing approved domains and leaves manual verification available", async () => {
    mocks.identity.approvedEmailDomains = [];
    await render(<PositionVerificationPanel trackingMode profile={profile("NOT_SUBMITTED")} editable open />);
    await act(async () => dialogButton("Verify institutional email").click());
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain("Email verification is not configured for this institution");
    await input('#lecturer-work-email', "lecturer@university.edu");
    expect(dialogButton("Send verification code").disabled).toBe(true);
    await act(async () => dialogButton("I don't have an institutional email").click());
    expect(document.querySelector('#lecturer-primary-evidence')).not.toBeNull();
    expect(dialogButton("Submit for manual review").disabled).toBe(true);
  });
  it("requires completed evidence even when the account email identity is verified", async () => {
    mocks.identity.verified = true;
    await render(<PositionVerificationPanel trackingMode profile={profile("NOT_SUBMITTED")} editable open />);
    expect(dialogButton("Submit verification").disabled).toBe(true);
    await input('#lecturer-primary-evidence', "http://university.edu/person");
    expect(dialogButton("Submit verification").disabled).toBe(true);
    await input('#lecturer-primary-evidence', "https://university.edu/person");
    expect(dialogButton("Submit verification").disabled).toBe(false);
    mocks.identity.accountEmailVerified = false;
    await render(<PositionVerificationPanel trackingMode profile={profile("NOT_SUBMITTED")} editable open />);
    expect(dialogButton("Submit verification").disabled).toBe(true);
  });
  it("allows one manual source, validates added sources and preserves documents when changing document type", async () => {
    await render(<PositionVerificationPanel trackingMode profile={profile("NOT_SUBMITTED")} editable open />);
    await act(async () => dialogButton("I don't have an institutional email").click());
    await input('#lecturer-primary-evidence', "https://university.edu/person");
    expect(dialogButton("Submit for manual review").disabled).toBe(false);
    await act(async () => dialogButton("Add evidence").click());
    expect(dialogButton("Submit for manual review").disabled).toBe(true);
    const source = document.querySelector('select[aria-label="Additional institution evidence"]') as HTMLSelectElement;
    await act(async () => { source.value = "APPOINTMENT_DOCUMENT"; source.dispatchEvent(new Event("change", { bubbles: true })); });
    const fileInput = document.querySelector('#lecturer-evidence-source-2') as HTMLInputElement;
    await act(async () => {
      Object.defineProperty(fileInput, "files", { value: [new File(["%PDF-1.4"], "appointment.pdf", { type: "application/pdf" })], configurable: true });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(dialogButton("Submit for manual review").disabled).toBe(false);
    await act(async () => { source.value = "EMPLOYMENT_DOCUMENT"; source.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(dialogButton("Submit for manual review").disabled).toBe(false);
    await act(async () => dialogButton("Remove evidence").click());
    expect(document.querySelectorAll('[role="dialog"] select')).toHaveLength(1);
  });
  it("replaces generic server errors with actionable messages and clears them after editing", async () => {
    mocks.mutate.mockRejectedValueOnce({ response: { data: { error: { code: "VALIDATION_ERROR", message: "Invalid request payload" } } } });
    await render(<PositionVerificationPanel trackingMode profile={profile("NOT_SUBMITTED")} editable open />);
    await act(async () => dialogButton("Verify institutional email").click());
    await input('#lecturer-work-email', "staff@university.edu");
    await act(async () => dialogButton("Send verification code").click());
    expect(document.querySelector('[role="alert"]')!.textContent).toBe("Enter a valid institutional email address.");
    expect(document.querySelector('[role="dialog"]')!.textContent).not.toContain("Invalid request payload");
    await input('#lecturer-work-email', "other@university.edu");
    expect(document.querySelector('[role="dialog"] [role="alert"]')).toBeNull();
  });
  it("saves a custom document for background upload and does not wait on a network request", async () => {
    mocks.identity.verified = true;
    const close = vi.fn();
    await render(<PositionVerificationPanel trackingMode profile={profile("NOT_SUBMITTED")} editable open onOpenChange={close} />);
    const source = document.querySelector('select[aria-label="Official institution source"]') as HTMLSelectElement;
    await act(async () => { source.value = "OTHER_INSTITUTION_SOURCE"; source.dispatchEvent(new Event("change", { bubbles: true })); });
    await input('#lecturer-primary-evidence-name', "Visiting Lecturer appointment");
    await act(async () => document.querySelector<HTMLInputElement>('input[value="DOCUMENT"]')!.click());
    const fileInput = document.querySelector('#lecturer-primary-evidence') as HTMLInputElement;
    const file = new File(["%PDF-1.4\n%%EOF"], "appointment.pdf", { type: "application/pdf" });
    await act(async () => { Object.defineProperty(fileInput, "files", { value: [file] }); fileInput.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => dialogButton("Submit verification").click());
    expect(delivery.enqueue).toHaveBeenCalledWith(expect.objectContaining({ state: "QUEUED", userId: "lecturer", input: expect.objectContaining({ path: "STANDARD", submissionKey: expect.any(String) }), sources: [expect.objectContaining({ type: "OTHER_INSTITUTION_SOURCE", sourceKind: "DOCUMENT", customEvidenceName: "Visiting Lecturer appointment", file })] }));
    expect(uploads.stage).not.toHaveBeenCalled(); expect(mocks.mutate).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledWith(false);
    expect(container.querySelector('[data-testid="route"]')!.textContent).toBe("/");
  });
  it("hides website-domain guidance for document evidence", async () => {
    await render(<PositionVerificationPanel trackingMode profile={profile("NOT_SUBMITTED")} editable open />);
    await act(async () => dialogButton("I don't have an institutional email").click());
    const selector = document.querySelector('select[aria-label="Official institution source"]') as HTMLSelectElement;
    await act(async () => { selector.value = "STAFF_ID"; selector.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(document.querySelector('[role="dialog"]')!.textContent).not.toContain("Approved institution websites");
    expect(document.querySelector('[role="dialog"]')!.textContent).not.toContain("Unregistered official website domains");
  });
  it("keeps the form and files available if durable local saving fails", async () => {
    mocks.identity.verified = true; delivery.enqueue.mockRejectedValueOnce(new Error("Quota exceeded"));
    await render(<PositionVerificationPanel trackingMode profile={profile("NOT_SUBMITTED")} editable open />);
    await input('#lecturer-primary-evidence', "https://university.edu/person");
    await act(async () => dialogButton("Submit verification").click());
    expect(document.querySelector('[role="alert"]')!.textContent).toContain("Could not save evidence on this browser");
    expect(dialogButton("Submit verification").disabled).toBe(false);
    expect(dialogButton("Cancel").disabled).toBe(false);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("keeps resend cooldown ticking when the email input changes", async () => {
    vi.useFakeTimers();
    mocks.mutate.mockResolvedValueOnce({ expiresAt: new Date(Date.now() + 600000).toISOString(), resendAt: new Date(Date.now() + 60000).toISOString() });
    await render(<PositionVerificationPanel trackingMode profile={profile("NOT_SUBMITTED")} editable open />);
    await act(async () => dialogButton("Verify institutional email").click());
    await input('#lecturer-work-email', "first@university.edu");
    await act(async () => dialogButton("Send verification code").click());
    await input('#lecturer-work-email', "second@university.edu");
    expect(dialogButton("Send verification code").disabled).toBe(true);
    await act(async () => vi.advanceTimersByTime(61000));
    expect(dialogButton("Send verification code").disabled).toBe(false);
  });
  it("blocks double clicks only while committing files, then closes without waiting for server acknowledgement", async () => {
    mocks.identity.verified = true;
    const close = vi.fn(); let commit!: () => void;
    delivery.enqueue.mockImplementationOnce(() => new Promise<void>(resolve => { commit = resolve; }));
    await render(<PositionVerificationPanel trackingMode profile={profile("NOT_SUBMITTED")} editable open onOpenChange={close} />);
    await input('#lecturer-primary-evidence', "https://university.edu/person");
    await act(async () => { const button = dialogButton("Submit verification"); button.click(); button.click(); });
    expect(delivery.enqueue).toHaveBeenCalledTimes(1);
    expect(dialogButton("Cancel").disabled).toBe(true); expect(close).not.toHaveBeenCalled();
    await act(async () => commit());
    expect(close).toHaveBeenCalledWith(false); expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("requires an actual upload when a legacy document has no reusable source record", async () => {
    mocks.identity.verified = true;
    const original = { id: "legacy-request", revision: 1, status: "NEEDS_MORE_INFORMATION" as const, institutionName: "University X", position: "Lecturer", submittedAt: "2026-10-08T12:00:00Z", reviewedAt: "2026-10-08T13:00:00Z", evidence: [{ id: "legacy-request", type: "DOCUMENT", sourceKind: "DOCUMENT", displayName: "old.pdf", isAvailable: true, replaced: false, submittedAt: "2026-10-08T12:00:00Z" }] };
    await render(<PositionVerificationPanel trackingMode profile={profile("NEEDS_MORE_INFORMATION")} supplement={original} editable open />);
    expect((document.querySelector('#lecturer-primary-evidence-type') as HTMLSelectElement).value).toBe("EMPLOYMENT_DOCUMENT");
    expect(document.querySelector('input[type="file"]')).not.toBeNull();
    expect(dialogButton("Submit verification").disabled).toBe(true);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("supplements the original request with retained documents and new evidence", async () => {
    mocks.identity.verified = true; mocks.mutate.mockResolvedValueOnce({ accepted: true, requestId: "next-revision", status: "PENDING" });
    const original = { id: "original-request", revision: 2, status: "NEEDS_MORE_INFORMATION" as const, institutionName: "University X", position: "Lecturer", submittedAt: "2026-10-08T12:00:00Z", reviewedAt: "2026-10-08T13:00:00Z", applicantMessage: "Add a faculty source", evidence: [{ id: "existing-document", type: "STAFF_ID", sourceKind: "DOCUMENT", displayName: "staff.png", isAvailable: true, replaced: false, submittedAt: "2026-10-08T12:00:00Z" }] };
    await render(<PositionVerificationPanel trackingMode profile={profile("NEEDS_MORE_INFORMATION")} supplement={original} editable open />);
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain("Add a faculty source");
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain("staff.png");
    await act(async () => dialogButton("Add evidence").click());
    await input('#lecturer-evidence-source-2', "https://university.edu/current-position");
    await act(async () => dialogButton("Submit verification").click());
    expect(delivery.enqueue).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ supplementsRequestId: original.id, expectedReviewedAt: original.reviewedAt }), sources: [expect.objectContaining({ type: "STAFF_ID", retainedSourceId: "existing-document" }), expect.objectContaining({ reference: "https://university.edu/current-position" })] }));
    expect(container.querySelector('[data-testid="route"]')!.textContent).toBe("/");
  });
});
