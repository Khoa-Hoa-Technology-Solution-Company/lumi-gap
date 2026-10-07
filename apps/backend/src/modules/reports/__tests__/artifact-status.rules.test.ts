import { describe, expect, it } from "vitest";
import { artifactStatusChangeError } from "../artifact-status.rules.js";

const none = { activeRequestCount: 0, completedRequestCount: 0 };
const active = { activeRequestCount: 1, completedRequestCount: 0 };
const completed = { activeRequestCount: 0, completedRequestCount: 1 };

describe("artifactStatusChangeError", () => {
  it("locks the status while a review is active", () => {
    expect(artifactStatusChangeError("DRAFT", active)).not.toBeNull();
    expect(artifactStatusChangeError("FINAL", active)).not.toBeNull();
    expect(artifactStatusChangeError("ARCHIVED", active)).not.toBeNull();
    expect(artifactStatusChangeError("REVIEWING", active)).toBeNull();
  });

  it("does not allow REVIEWING to be set by hand", () => {
    expect(artifactStatusChangeError("REVIEWING", none)).not.toBeNull();
    expect(artifactStatusChangeError("REVIEWING", completed)).not.toBeNull();
  });

  it("requires a completed review before FINAL", () => {
    expect(artifactStatusChangeError("FINAL", none)).not.toBeNull();
    expect(artifactStatusChangeError("FINAL", completed)).toBeNull();
  });

  it("allows DRAFT and ARCHIVED when no review is active", () => {
    expect(artifactStatusChangeError("DRAFT", none)).toBeNull();
    expect(artifactStatusChangeError("ARCHIVED", none)).toBeNull();
    expect(artifactStatusChangeError("DRAFT", completed)).toBeNull();
  });
});
