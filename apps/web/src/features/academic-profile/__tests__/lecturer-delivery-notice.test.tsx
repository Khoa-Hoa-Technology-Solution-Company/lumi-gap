// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LecturerDeliveryNotice } from "../components/lecturer-delivery-notice";
import { lecturerDeliveryStore as store, type LecturerDelivery } from "../services/lecturer-delivery-store";

const mocks = vi.hoisted(() => ({ userId: "", upload: vi.fn(), submit: vi.fn(), status: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("@/stores/auth-store", () => {
  const getState = () => ({ user: { id: mocks.userId }, tokens: { accessToken: "test-token" } });
  return { useAuthStore: Object.assign((selector: (value: ReturnType<typeof getState>) => unknown) => selector(getState()), { getState }) };
});
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error } }));
vi.mock("../api/academic-profile.api", () => ({ academicProfileApi: { stageLecturerEvidence: mocks.upload, submitLecturerVerification: mocks.submit, verificationStatus: mocks.status } }));
let container: HTMLDivElement, root: Root, client: QueryClient;
function Route() { const navigate = useNavigate(), location = useLocation(); return <><button onClick={() => navigate("/papers")}>Continue research</button><output>{location.pathname}</output></>; }
function job(state: LecturerDelivery["state"] = "QUEUED"): LecturerDelivery {
  const id = crypto.randomUUID();
  return { userId: mocks.userId, id, institutionName: "University", state, uploads: {}, input: { submissionKey: id, type: "POSITION", evidenceType: "DOCUMENT", path: "MANUAL", institutionId: "institution" }, sources: [{ id: "source", type: "OFFICIAL_FACULTY_PROFILE", sourceKind: "URL", reference: "https://university.edu/staff", additionalExplanation: "", customEvidenceName: "" }] };
}
async function render() { await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter><Route /><LecturerDeliveryNotice /></MemoryRouter></QueryClientProvider>)); }
async function waitFor(check: () => void) { await vi.waitFor(async () => { await act(async () => {}); check(); }); }
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.userId = crypto.randomUUID(); mocks.upload.mockReset(); mocks.submit.mockReset(); mocks.status.mockReset().mockResolvedValue({ submission: null }); mocks.success.mockReset(); mocks.error.mockReset();
  client = new QueryClient(); container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); await store.update(mocks.userId, () => undefined); container.remove(); client.clear(); });
it("continues sending across page navigation and confirms receipt without redirecting", async () => {
  const saved = job(); await store.enqueue(saved);
  let acknowledge!: (value: unknown) => void;
  mocks.submit.mockImplementationOnce(() => new Promise(resolve => { acknowledge = resolve; }));
  await render(); await waitFor(() => expect(mocks.submit).toHaveBeenCalledTimes(1));
  expect(container.textContent).toContain("Sending verification in the background");
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Continue research")!.click());
  expect(container.querySelector("output")!.textContent).toBe("/papers");
  await act(async () => acknowledge({ accepted: true, requestId: "request", submissionKey: saved.id, status: "PENDING" }));
  await waitFor(() => expect(mocks.success).toHaveBeenCalledWith("Verification request submitted"));
  expect(mocks.success).toHaveBeenCalledTimes(1);
  expect(container.querySelector("output")!.textContent).toBe("/papers");
  expect(container.querySelector("aside")).toBeNull();
  expect((await store.read(mocks.userId))?.receipt?.requestId).toBe("request");
});
it("shows a durable failure notice on return and lets the owner retry the saved delivery", async () => {
  const saved = job("FAILED"); await store.enqueue(saved);
  mocks.submit.mockResolvedValue({ accepted: true, requestId: "retry-request", submissionKey: saved.id, status: "PENDING" });
  await render(); await waitFor(() => expect(container.textContent).toContain("Evidence delivery needs your attention"));
  expect(mocks.error).toHaveBeenCalled(); expect(mocks.submit).not.toHaveBeenCalled();
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Retry delivery")!.click());
  await waitFor(() => expect(mocks.success).toHaveBeenCalled());
  expect(mocks.submit).toHaveBeenCalledTimes(1);
});
it("does not display or send another account's saved files", async () => {
  const other = { ...job(), userId: "different-user" }; await store.enqueue(other);
  await render(); await act(async () => {});
  expect(container.querySelector("aside")).toBeNull(); expect(mocks.submit).not.toHaveBeenCalled();
  await store.update("different-user", () => undefined);
});
