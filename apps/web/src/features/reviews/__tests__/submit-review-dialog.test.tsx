// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/reviews", () => ({
  useCreateReviewRequest: () => ({ mutateAsync: mocks.create, isPending: false }),
  useReviewTemplates: () => ({ data: [{ id: "template", name: "Feedback template", status: "PUBLISHED", source: "SYSTEM", artifactType: "RESEARCH_PAPER", activeVersion: { id: "version", reviewMode: "GUIDED_FEEDBACK", versionNumber: 1, criteria: [] } }] }),
  useReviewerCandidates: () => ({ data: [{ id: "lecturer", name: "Verified lecturer", expertiseAreas: ["Education"], institution: "University", availableForReview: true }] }),
}));
import { SubmitReviewDialog } from "../components/submit-review-dialog";

let host: HTMLDivElement, root: Root;
const button = (text: string) => [...document.querySelectorAll('button')].find(element => element.textContent?.includes(text))!;
const message = () => document.querySelector<HTMLTextAreaElement>('textarea')!;
async function writeMessage(value: string) {
  const field = message();
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, value);
  await act(async () => field.dispatchEvent(new Event("input", { bubbles: true })));
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.create.mockReset();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<SubmitReviewDialog submissionId="submission" artifactTitle="My paper" artifactType="RESEARCH_PAPER" />));
  await act(async () => button("Submit for Review").click());
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it("adds editable feedback suggestions without replacing the author's message or sending a request", async () => {
  await writeMessage("Please focus on section 3.");
  await act(async () => button("Research methods").click());
  expect(message().value).toContain("Please focus on section 3.");
  expect(message().value).toContain("methods fit the research question");
  expect(button("Research methods").getAttribute("aria-pressed")).toBe("true");
  await act(async () => button("Research methods").click());
  expect(message().value).toBe("Please focus on section 3.");
  expect(mocks.create).not.toHaveBeenCalled();
});

it("keeps suggestions within the message limit", async () => {
  await writeMessage("x".repeat(2999));
  expect(button("Research methods").disabled).toBe(true);
  expect(message().value).toHaveLength(2999);
});

it("sends the composed message using the real request payload and retains it after an error", async () => {
  await act(async () => button("Feedback template").click());
  await act(async () => button("Verified lecturer").click());
  await act(async () => button("Claims and evidence").click());
  const composed = message().value;
  mocks.create.mockRejectedValueOnce(new Error("network"));
  await act(async () => button("Send review request").click());
  expect(message().value).toBe(composed);
  expect(mocks.create).toHaveBeenLastCalledWith(expect.objectContaining({ submissionId: "submission", reviewerId: "lecturer", templateVersionId: "version", message: composed, dueAt: expect.any(String) }));
  let finish!: () => void;
  mocks.create.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  await act(async () => { button("Send review request").click(); button("Send review request").click(); });
  expect(mocks.create).toHaveBeenCalledTimes(2);
  await act(async () => finish());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
