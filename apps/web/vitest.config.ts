import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  envDir: path.resolve(__dirname, "../.."),
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  esbuild: { jsx: "automatic" },
  test: { include: ["src/**/*.{test,spec}.{ts,tsx}"] },
});
