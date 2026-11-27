import { describe, expect, it } from "vitest";
import { EnvSchema } from "../env.js";

const production = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  REDIS_URL: "redis://localhost:6379",
  GEMINI_API_KEY: "schema-test-no-provider-requests",
  INTERNAL_SERVICE_KEY: "schema-test-internal-key-over-32-characters",
};

describe("email delivery environment configuration", () => {
  it.each([undefined, "", " \t ", "disabled"])("defaults an unset or blank mode %j to disabled", mode => {
    const parsed = EnvSchema.parse({ ...production, EMAIL_DELIVERY_MODE: mode });
    expect(parsed.EMAIL_DELIVERY_MODE).toBe("disabled");
    expect(parsed.NODE_ENV).toBe("production");
  });

  it("keeps explicitly configured SMTP enabled", () => {
    const parsed = EnvSchema.parse({
      ...production, EMAIL_DELIVERY_MODE: "smtp", SMTP_HOST: "smtp.example.test",
      SMTP_USER: "sender", SMTP_PASS: "schema-test-only", SMTP_FROM: "sender@example.test",
    });
    expect(parsed.EMAIL_DELIVERY_MODE).toBe("smtp");
  });

  it.each(["smpt", "false", "smtp ", false])("rejects invalid nonblank mode %j", mode => {
    const result = EnvSchema.safeParse({ ...production, EMAIL_DELIVERY_MODE: mode });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some(issue => issue.path[0] === "EMAIL_DELIVERY_MODE")).toBe(true);
  });

  it("still forbids logging email in production", () => {
    const result = EnvSchema.safeParse({ ...production, EMAIL_DELIVERY_MODE: "log" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some(issue => issue.message === "EMAIL_DELIVERY_MODE=log is forbidden in production")).toBe(true);
    expect(EnvSchema.parse({ ...production, NODE_ENV: "development", EMAIL_DELIVERY_MODE: "log" }).EMAIL_DELIVERY_MODE).toBe("log");
  });

  it("still requires SMTP credentials when SMTP is selected", () => {
    const result = EnvSchema.safeParse({ ...production, EMAIL_DELIVERY_MODE: "smtp" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map(issue => issue.path[0])).toEqual(expect.arrayContaining(["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"]));
  });

  it("does not let a blank mode bypass other environment validation", () => {
    const result = EnvSchema.safeParse({ ...production, EMAIL_DELIVERY_MODE: "", INTERNAL_SERVICE_KEY: "short" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some(issue => issue.path[0] === "INTERNAL_SERVICE_KEY")).toBe(true);
  });
});
