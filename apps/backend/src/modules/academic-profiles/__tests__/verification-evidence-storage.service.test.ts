import { describe, expect, it } from "vitest";
import path from "node:path";
import { safeVerificationEvidencePath } from "../verification-evidence-storage.service.js";

describe("private verification evidence paths", () => {
  const root = path.resolve("uploads-test");
  const key = "verification-evidence/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.pdf";

  it("resolves generated user-owned PDF keys under the private storage root", () => {
    expect(safeVerificationEvidencePath(key, root, "11111111-1111-4111-8111-111111111111")).toBe(path.resolve(root, key));
  });

  it.each([
    "verification-evidence/../../secrets.pdf",
    "verification-evidence/33333333-3333-4333-8333-333333333333/22222222-2222-4222-8222-222222222222.pdf",
    "verification-evidence/11111111-1111-4111-8111-111111111111/../../secrets.pdf",
    "verification-evidence/11111111-1111-4111-8111-111111111111/22222222-2222-2222-2222-222222222222.pdf",
  ])("rejects unsafe or malformed evidence key %s", (unsafeKey) => {
    expect(safeVerificationEvidencePath(unsafeKey, root, "11111111-1111-4111-8111-111111111111")).toBeNull();
  });
});
