import { describe, expect, it } from "vitest";
import { checkPasswordPolicy } from "./password-policy";

describe("checkPasswordPolicy", () => {
  it("accepts a password that matches the backend policy", () => {
    expect(checkPasswordPolicy("SecurePass1").valid).toBe(true);
  });

  it.each([
    ["Short1A", "minimumLength"],
    ["UPPERCASE12", "lowercase"],
    ["lowercase12", "uppercase"],
    ["NoDigitsHere", "number"],
  ] as const)("rejects %s when %s is missing", (password, missingCheck) => {
    const result = checkPasswordPolicy(password);
    expect(result.valid).toBe(false);
    expect(result.checks[missingCheck]).toBe(false);
  });

  it("rejects passwords longer than the server limit", () => {
    expect(checkPasswordPolicy(`A${"a".repeat(126)}1`).valid).toBe(true);
    expect(checkPasswordPolicy(`A${"a".repeat(127)}1`).checks.maximumLength).toBe(false);
  });
});
