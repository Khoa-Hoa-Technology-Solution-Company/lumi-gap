import { describe, expect, it } from "vitest";
import {
  isAllowedAdminPaperStatusChange,
  isCancellablePaperRequest,
  isImportedPaperRecord,
  isUserPaperRequest,
  OPENALEX_PAPER_STATUS,
} from "../paper-workflow.js";

describe("paper workflow status", () => {
  it("keeps OpenAlex corpus papers out of the user approval queue", () => {
    expect(OPENALEX_PAPER_STATUS).toBe("not-downloaded");
    expect(isUserPaperRequest({ paperStatus: "pending", requestedBy: undefined } as any)).toBe(false);
    expect(isUserPaperRequest({ paperStatus: "not-downloaded", requestedBy: undefined } as any)).toBe(false);
  });

  it("recognizes provider papers as imported even when requestedBy is present", () => {
    expect(isImportedPaperRecord({ primaryProvider: "openalex", requestedBy: "user-1" } as any)).toBe(true);
    expect(isImportedPaperRecord({ primaryProvider: "user", requestedBy: "user-1" } as any)).toBe(false);
    expect(isImportedPaperRecord({ primaryProvider: undefined, requestedBy: undefined } as any)).toBe(true);
  });

  it("recognizes only pending papers with a requester as approval requests", () => {
    expect(isUserPaperRequest({ paperStatus: "pending", requestedBy: "user-1" } as any)).toBe(true);
    expect(isUserPaperRequest({ paperStatus: "downloaded", requestedBy: "user-1" } as any)).toBe(false);
  });

  it("allows only defined admin status changes", () => {
    expect(isAllowedAdminPaperStatusChange("pending", "not-downloaded")).toBe(true);
    expect(isAllowedAdminPaperStatusChange("pending", "rejected")).toBe(true);
    expect(isAllowedAdminPaperStatusChange("rejected", "pending")).toBe(true);
    expect(isAllowedAdminPaperStatusChange("downloaded", "pending")).toBe(false);
    expect(isAllowedAdminPaperStatusChange("not-downloaded", "pending-requester-acceptance")).toBe(false);
    expect(isAllowedAdminPaperStatusChange("downloaded", "downloaded")).toBe(true);
    expect(isAllowedAdminPaperStatusChange("legacy-status", "rejected")).toBe(true);
  });

  it("lets requesters cancel only requests that never reached the corpus", () => {
    expect(isCancellablePaperRequest({ dataStatus: "draft" })).toBe(true);
    expect(isCancellablePaperRequest({ dataStatus: "low-quality" })).toBe(true);
    expect(isCancellablePaperRequest({ dataStatus: "active" })).toBe(false);
  });
});
