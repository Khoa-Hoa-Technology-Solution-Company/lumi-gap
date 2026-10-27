import { defineConfig } from "vitest/config";

// DB-backed suites are sequential and slow on a loaded machine; the 5s default causes cascading timeouts.
export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.ts", "scripts/**/*.{test,spec}.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
