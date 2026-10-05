import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const envDir = path.resolve(__dirname, "../..");
  const publicConfig = loadEnv(mode, envDir, "API_PORT");
  return {
    envDir,
    plugins: [react()],
    build: {
      manifest: true,
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.replace(/\\/g, "/");
            if (normalizedId.endsWith("/src/i18n/locales/en.ts")) {
              return "i18n-en";
            }
            if (normalizedId.endsWith("/src/i18n/locales/new-ui.ts")) {
              return "i18n-new-ui";
            }
            if (!normalizedId.includes("node_modules")) return undefined;
            if (
              normalizedId.includes("/node_modules/react/") ||
              normalizedId.includes("/node_modules/react-dom/") ||
              normalizedId.includes("/node_modules/react-router-dom/")
            ) {
              return "vendor-react";
            }
            if (normalizedId.includes("/node_modules/@radix-ui/")) {
              return "vendor-radix";
            }
            if (normalizedId.includes("/node_modules/@tanstack/")) {
              return "vendor-query";
            }
            // Let Rollup split icons by actual route usage. One global icon chunk
            // pulls every lazy screen's icons into the initial application graph.
            if (
              normalizedId.includes("/node_modules/react-markdown/") ||
              normalizedId.includes("/node_modules/remark-gfm/") ||
              normalizedId.includes("/node_modules/micromark") ||
              normalizedId.includes("/node_modules/mdast") ||
              normalizedId.includes("/node_modules/unist") ||
              normalizedId.includes("/node_modules/hast")
            ) {
              return "vendor-markdown";
            }
            if (normalizedId.includes("/node_modules/three/")) {
              return "vendor-three";
            }
            if (normalizedId.includes("/node_modules/react-hook-form/") || normalizedId.includes("/node_modules/zod/")) {
              return "vendor-forms";
            }
            if (
              normalizedId.includes("/node_modules/axios/") ||
              normalizedId.includes("/node_modules/zustand/") ||
              normalizedId.includes("/node_modules/sonner/") ||
              normalizedId.includes("/node_modules/class-variance-authority/") ||
              normalizedId.includes("/node_modules/clsx/") ||
              normalizedId.includes("/node_modules/tailwind-merge/") ||
              normalizedId.includes("/node_modules/next-themes/")
            ) {
              return "vendor-app";
            }
            return undefined;
          },
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 3000,
      proxy: {
        // Optional: proxy /api during dev so cookies work without CORS.
        // Remove if you prefer hitting the backend directly via VITE_API_BASE.
        "/api": {
          target: `http://localhost:${publicConfig.API_PORT || "4000"}`,
          changeOrigin: true,
        },
      },
    },
  };
});
