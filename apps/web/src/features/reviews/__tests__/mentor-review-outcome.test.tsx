// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MentorReviewOutcome } from "../components/mentor-review-outcome";
import { internalAssessmentLabel } from "../scientific-review-model";
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
let host: HTMLDivElement, root: Root;
beforeEach(() => { vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
it("starts without an outcome, distinguishes comment-only from approval, and preserves existing revision assessments", async () => {
  const change = vi.fn();
  await act(async () => root.render(<MentorReviewOutcome commentOnly={false} disabled={false} onChange={change} />));
  expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(3);
  expect(host.querySelector('input:checked')).toBeNull(); expect(change).not.toHaveBeenCalled();
  await act(async () => host.querySelector<HTMLInputElement>('input[value="COMMENT"]')!.click());
  expect(change).toHaveBeenLastCalledWith(true, undefined);
  await act(async () => host.querySelector<HTMLInputElement>('input[value="CHANGES"]')!.click());
  expect(change).toHaveBeenLastCalledWith(false, "MINOR_REVISION");
  await act(async () => host.querySelector<HTMLInputElement>('input[value="APPROVE"]')!.click());
  expect(change).toHaveBeenLastCalledWith(false, "STRONG");
  await act(async () => root.render(<MentorReviewOutcome commentOnly={false} assessment="MAJOR_REVISION" disabled={false} onChange={change} />));
  expect(host.querySelector<HTMLSelectElement>('select')?.value).toBe("MAJOR_REVISION");
});
it("labels a submitted comment without inventing a readiness assessment", () => {
  expect(internalAssessmentLabel(null, "SUBMITTED")).toBe("Comment only");
  expect(internalAssessmentLabel(undefined, "DRAFT")).toBe("");
  expect(internalAssessmentLabel("STRONG", "SUBMITTED")).toBe("Ready to advance internally");
});
