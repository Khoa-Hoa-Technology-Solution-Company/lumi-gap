import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { passwordService } from "../password.service.js";

describe("passwordService", () => {
  it("hashes and verifies passwords with Argon2id", async () => {
    const hash = await passwordService.hash("SecurePassword123");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    await expect(passwordService.verify(hash, "SecurePassword123")).resolves.toMatchObject({ valid: true });
    await expect(passwordService.verify(hash, "wrong-password")).resolves.toMatchObject({ valid: false });
  });

  it("accepts a valid legacy bcrypt hash once and requests rehash", async () => {
    const hash = await bcrypt.hash("LegacyPassword123", 10);
    await expect(passwordService.verify(hash, "LegacyPassword123")).resolves.toEqual({ valid: true, needsRehash: true });
  });
});
