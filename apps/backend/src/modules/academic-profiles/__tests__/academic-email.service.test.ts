import { describe, expect, it, vi } from "vitest";

vi.mock("../../../config/env.js", () => ({
  env: {
    // Unit-test fixture only. Runtime configuration must still provide its own secret.
    ACADEMIC_EMAIL_OTP_SECRET: "unit-test-academic-email-otp-key-000000000000",
    EMAIL_DELIVERY_MODE: "disabled",
    LOG_LEVEL: "silent",
    NODE_ENV: "test",
  },
}));

import {
  academicEmailOtpMatches,
  generateAcademicEmailOtp,
  hashAcademicEmailOtp,
} from "../academic-email.service.js";

describe("institutional email OTP cryptography", () => {
  it("generates a six-digit code with a one-million-value space", () => {
    expect(generateAcademicEmailOtp()).toMatch(/^\d{6}$/);
  });

  it("stores a deterministic HMAC rather than the raw OTP", () => {
    const code = "123456";
    const hash = hashAcademicEmailOtp("user-1", "Lecturer@FPT.edu.vn", code);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(code);
    expect(academicEmailOtpMatches(hash, hashAcademicEmailOtp("user-1", "lecturer@fpt.edu.vn", code))).toBe(true);
    expect(academicEmailOtpMatches(hash, hashAcademicEmailOtp("user-1", "lecturer@fpt.edu.vn", "654321"))).toBe(false);
  });
});
