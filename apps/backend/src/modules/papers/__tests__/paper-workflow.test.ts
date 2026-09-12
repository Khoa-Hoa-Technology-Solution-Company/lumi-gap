import { describe, expect, it } from "vitest";
import {
  buildUserPaperRequestFilter,
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
    expect(buildUserPaperRequestFilter("pending")).toEqual({
      paperStatus: "pending",
      $or: [
        { requestedBy: { $exists: true, $ne: null } },
        { uploadedBy: { $exists: true, $ne: null } },
      ],
    });
  });

  it("limits the complete admin workflow list to user-submitted papers", () => {
    expect(buildUserPaperRequestFilter()).toEqual({
      paperStatus: {
        $in: ["pending", "not-downloaded", "downloaded", "rejected", "pending-requester-acceptance"],
      },
      $or: [
        { requestedBy: { $exists: true, $ne: null } },
        { uploadedBy: { $exists: true, $ne: null } },
      ],
    });
  });
});
