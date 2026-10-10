// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { AdminAcademicVerificationsPage } from "@/pages/admin/academic-verifications";
vi.mock("@/i18n", () => ({ useI18n: () => ({ language: "en", t: (key: string, values?: Record<string, string | number>) => key.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values?.[name] ?? name)) }) }));

async function selectTab(dialog: Element, label: string) {
  await act(async () => (dialog.querySelector(`[role="tab"][aria-label="${label}"]`) as HTMLButtonElement).click());
}

const mocks = vi.hoisted(() => ({ decide: vi.fn().mockResolvedValue(undefined), download: vi.fn(), sources: [] as Array<Record<string, unknown>> }));
beforeEach(() => { mocks.sources = []; mocks.decide.mockClear(); mocks.download.mockReset(); });
vi.mock("@/features/academic-profile", () => {
  const item = () => {
    const request = { id: "request", type: "POSITION", targetValue: "Lecturer", evidenceType: "INSTITUTIONAL_PROFILE", status: "PENDING", submittedAt: "2026-10-07", verificationMethod: "MANUAL_INSTITUTIONAL_EVIDENCE", metadata: { academicRole: "LECTURER" }, sources: mocks.sources };
    return { request, profile: { academicRole: "LECTURER", displayName: "Lecturer Test", positionTitle: "Associate Professor", affiliation: { institutionName: "University", institutionalEmail: "staff@university.edu" } }, history: [request], accountEmail: "staff@university.edu", accountEmailVerified: true };
  };
  return {
    useAcademicVerifications: () => ({ data: { data: [item()], meta: { totalPages: 1 } } }),
    useAcademicVerificationDetails: () => ({ data: item() }),
    useAcademicVerificationEvidenceFile: () => ({ mutateAsync: mocks.download }),
    useDecideAcademicVerification: () => ({ mutateAsync: mocks.decide }),
  };
});

it("groups the full-status popup into four ordered sections and opens the request first", async () => {
  mocks.sources = [{ id: "document", type: "STAFF_ID", sourceKind: "DOCUMENT", fileName: "long-staff-evidence-filename.png", status: "UNCHECKED", documentAvailable: true }];
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => root.render(<MemoryRouter><AdminAcademicVerificationsPage /></MemoryRouter>));
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Review" || button.textContent === "Full Status")!.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    expect([...dialog.querySelectorAll('[role="tab"]')].map(tab => tab.getAttribute("aria-label"))).toEqual(["Request & Evidence", "Identity & credentials", "Decision & History"]);
    expect(dialog.querySelector('[role="tab"][aria-selected="true"]')!.getAttribute("aria-label")).toBe("Request & Evidence");
    const panel = () => dialog.querySelector('[role="tabpanel"]')!;
    expect(panel().textContent).toContain("Declared Claim");
    expect(panel().textContent).toContain("long-staff-evidence-filename.png");
    expect(panel().textContent).toContain("Not checked");
    expect(panel().textContent).not.toContain("Account Email Ownership");
    await selectTab(dialog, "Identity & credentials");
    expect(panel().textContent).toContain("staff@university.edu");
    expect(panel().textContent).toContain("Associate Professor");
    expect(panel().textContent).not.toContain("Verified Data");
    await selectTab(dialog, "Decision & History");
    expect(panel().textContent).toContain("Most recent requests appear first.");
    expect(panel().querySelectorAll(".group")).toHaveLength(1);
    expect(mocks.download).not.toHaveBeenCalled();
    expect([...dialog.querySelectorAll("button")].some(button => button.textContent?.includes("Approve") || button.textContent?.includes("Review"))).toBe(true);
  } finally { await act(async () => root.unmount()); container.remove(); }
});

it("supports arrow-key tab navigation and resets to the request when reopened", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => root.render(<MemoryRouter><AdminAcademicVerificationsPage /></MemoryRouter>));
    const open = () => [...container.querySelectorAll("button")].find(button => button.textContent === "Review" || button.textContent === "Full Status")!;
    await act(async () => open().click());
    const dialog = document.querySelector('[role="dialog"]')!;
    const firstTab = dialog.querySelector('[role="tab"][aria-label="Request & Evidence"]')!;
    await act(async () => firstTab.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(document.activeElement!.getAttribute("aria-label")).toBe("Identity & credentials");
    expect(dialog.querySelector('[role="tab"][aria-selected="true"]')!.getAttribute("aria-label")).toBe("Identity & credentials");
    const panel = dialog.querySelector('[role="tabpanel"]')!;
    expect(panel.getAttribute("aria-labelledby")).toBe(document.activeElement!.id);
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })));
    expect(document.activeElement!.getAttribute("aria-label")).toBe("Decision & History");
    await act(async () => [...dialog.querySelectorAll("button")].find(button => button.textContent === "Close" || button.getAttribute("aria-label") === "Close")!.click());
    await act(async () => open().click());
    expect(document.querySelector('[role="tab"][aria-selected="true"]')!.getAttribute("aria-label")).toBe("Request & Evidence");
  } finally { await act(async () => root.unmount()); container.remove(); }
});

it("retrieves private evidence only when the admin chooses its preview", async () => {
  mocks.sources = [{ id: "document", type: "STAFF_ID", sourceKind: "DOCUMENT", mimeType: "image/png", fileName: "staff.png", status: "UNCHECKED", documentAvailable: true }];
  mocks.download.mockResolvedValueOnce(new Blob(["image"], { type: "image/png" }));
  const createUrl = vi.fn(() => "blob:private-evidence"), revokeUrl = vi.fn();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl }));
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => root.render(<MemoryRouter><AdminAcademicVerificationsPage /></MemoryRouter>));
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Review" || button.textContent === "Full Status")!.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(mocks.download).not.toHaveBeenCalled();
    await act(async () => [...dialog.querySelectorAll("button")].find(button => button.textContent?.includes("Preview") || button.textContent?.includes("Xem trước"))!.click());
    expect(mocks.download).toHaveBeenCalledWith({ requestId: "request", sourceId: "document" });
    expect(document.querySelector('[role="dialog"] img')!.getAttribute("src")).toBe("blob:private-evidence");
  } finally { await act(async () => root.unmount()); container.remove(); }
  expect(revokeUrl).toHaveBeenCalledWith("blob:private-evidence");
});

it("shows custom evidence and requires domain validation, identity binding and a rationale before single-source approval", async () => {
  mocks.sources = [{ id: "custom", slot: 1, type: "OTHER_INSTITUTION_SOURCE", sourceKind: "URL", customEvidenceName: "Teaching confirmation", additionalExplanation: "Issued by the faculty", reference: "https://university.edu/confirmation", urlTrustStatus: "PENDING_ADMIN_VALIDATION", status: "UNCHECKED", documentAvailable: false }];
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => root.render(<MemoryRouter><AdminAcademicVerificationsPage /></MemoryRouter>));
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Review")!.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.querySelector('[role="tab"][aria-selected="true"]')!.getAttribute("aria-label")).toBe("Request & Evidence");
    expect(dialog.textContent).toContain("Teaching confirmation"); expect(dialog.textContent).toContain("Issued by the faculty");
    const assessment = dialog.querySelector('select[aria-label="Assessment: OTHER_INSTITUTION_SOURCE"]') as HTMLSelectElement;
    await act(async () => { assessment.value = "VALID"; assessment.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => { for (const checkbox of dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) checkbox.click(); });
    await selectTab(dialog, "Decision & History");
    const approve = () => [...dialog.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Approve position")!;
    expect(approve().disabled).toBe(true);
    await act(async () => { for (const checkbox of dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')) checkbox.click(); });
    expect(approve().disabled).toBe(true);
    const note = dialog.querySelector('#verification-admin-note') as HTMLTextAreaElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(note, "HR independently confirmed identity, domain ownership and current appointment."); note.dispatchEvent(new Event("input", { bubbles: true })); });
    await selectTab(dialog, "Request & Evidence");
    expect((dialog.querySelector('select[aria-label="Assessment: OTHER_INSTITUTION_SOURCE"]') as HTMLSelectElement).value).toBe("VALID");
    expect(dialog.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
    await selectTab(dialog, "Decision & History");
    expect(dialog.querySelector<HTMLTextAreaElement>('#verification-admin-note')!.value).toContain("HR independently confirmed");
    expect(approve().disabled).toBe(false);
    await act(async () => approve().click());
    expect(mocks.decide).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ checklist: expect.objectContaining({ identityBound: true }), evidenceChecks: [expect.objectContaining({ id: "custom", status: "VALID", institutionDomainConfirmed: true })] }) }));
  } finally { await act(async () => root.unmount()); container.remove(); }
});

it("submits the Admin's private note when requesting more information", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<MemoryRouter><AdminAcademicVerificationsPage /></MemoryRouter>));
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Review")!.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    await selectTab(dialog, "Decision & History");
    await act(async () => [...dialog.querySelectorAll("button")].find(button => button.textContent === "Request more information")!.click());
    const reason = dialog.querySelector("#verification-rejection-reason") as HTMLTextAreaElement;
    const note = dialog.querySelector("#verification-admin-note") as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(reason, "Please provide a current appointment letter");
      reason.dispatchEvent(new Event("input", { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(note, "Private identity-binding concern");
      note.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const actions = [...dialog.querySelectorAll("button")].filter(button => button.textContent === "Request more information");
    await act(async () => actions.at(-1)!.click());
    expect(mocks.decide).toHaveBeenCalledWith(expect.objectContaining({ requestId: "request", input: expect.objectContaining({ decision: "more_info", reason: "Please provide a current appointment letter", note: "Private identity-binding concern" }) }));
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it("opens a notification's exact request and requires usable public feedback", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => root.render(<MemoryRouter initialEntries={["/admin/academic-verifications?requestId=request"]}><AdminAcademicVerificationsPage /></MemoryRouter>));
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    await selectTab(dialog, "Decision & History");
    await act(async () => [...dialog.querySelectorAll("button")].find(button => button.textContent === "Request more information")!.click());
    const reason = dialog.querySelector<HTMLTextAreaElement>("#verification-rejection-reason")!;
    const submit = () => [...dialog.querySelectorAll<HTMLButtonElement>("button")].filter(button => button.textContent === "Request more information").at(-1)!;
    expect(submit().disabled).toBe(true);
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(reason, "?"); reason.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(submit().disabled).toBe(true);
    expect(dialog.textContent).toContain("Internal notes stay private.");
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(reason, "Please provide a current employment letter."); reason.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(submit().disabled).toBe(false);
  } finally { await act(async () => root.unmount()); container.remove(); }
});

it("does not call submitted evidence valid before the administrator checks it", async () => {
  mocks.sources = [{ id: "document", slot: 1, type: "STAFF_ID", sourceKind: "DOCUMENT", fileName: "evidence.png", status: "UNCHECKED", documentAvailable: true }];
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  try {
    await act(async () => root.render(<MemoryRouter><AdminAcademicVerificationsPage /></MemoryRouter>));
    const pipeline = container.querySelector<HTMLElement>('[title^="Tiến trình thẩm định"]')!;
    expect(pipeline.title).toContain("Minh chứng hợp lệ (Chưa hoàn tất)");
    expect(pipeline.title).toContain("(1/5)");
  } finally { await act(async () => root.unmount()); container.remove(); }
});
