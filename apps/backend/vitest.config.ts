import { randomBytes } from "node:crypto";
import { defineConfig } from "vitest/config";

// DB-backed suites are sequential and slow on a loaded machine; the 5s default causes cascading timeouts.
export default defineConfig({
  test: {
    // Keep OTP integration tests independent of developer secrets; runtime still requires its own key.
    env: { ACADEMIC_EMAIL_OTP_SECRET: randomBytes(32).toString("hex") },
    include: ["src/**/*.{test,spec}.ts", "scripts/**/*.{test,spec}.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
